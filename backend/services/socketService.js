// services/socketService.js
//
// Real-time layer for Team SnakeByte's Cybersecurity Snakes and Ladders
// game.
//
// IMPORTANT - this was rewritten after checking the actual frontend code
// (frontend/js/socketService.js, playerApp.js, adminApp.js). The frontend
// does NOT emit gameplay confirmation events (no confirm_move, item_used,
// start_game, etc. from the client) - it only ever emits `join_room`, then
// relies on:
//   1. A 2-second poll of GET /api/game/state/:sessionId as the source of
//      truth for its own UI, and
//   2. Listening for *any* socket event (onAny) purely as a trigger to
//      poll immediately, rather than reading each event's payload.
//
// So the actual job of this file is much simpler than a full client-driven
// event contract: broadcast *something* to a session's room the moment its
// state changes, so connected clients refresh sooner than the next 2s poll
// tick. The broadcasts themselves are triggered directly from the REST
// controllers (gameController.js, bonusController.js) right after each
// successful database write - this file does not decide when to broadcast
// gameplay events, only how.
//
// This file is still responsible for:
//   - Room scoping (one Socket.io room per sessionId)
//   - Disconnect detection with a 30s grace period before a player is
//     marked inactive (SRS 3.1.5 / 5.x heartbeat requirement)
//   - Auto-triggering earthquake events and timer-based bonus rounds per
//     session, based on that session's admin-configured presets
//   - Exposing broadcastGameEvent()/broadcastBonusResult() for controllers
//     to call after a write

const gameService = require('./gameService');
const bonusService = require('./bonusService');

let ioInstance = null;

// Per-session interval timers (earthquake + bonus round auto-trigger).
const sessionTimers = {}; // { [sessionId]: { earthquake, bonus } }

// Per-bonus-round expiry timeout, in case nobody answers correctly in time.
const bonusExpiryTimers = {}; // { [bonusRoundId]: timeoutId }

// Players who dropped their socket but are still inside their grace
// window - a quick reconnect cancels this before it fires.
const pendingDisconnects = {}; // { [sessionId::playerId]: timeoutId }

const HEARTBEAT_GRACE_MS = 30 * 1000;     // SRS: 30s disconnect timeout
const BONUS_ANSWER_WINDOW_MS = 15 * 1000; // 15s bonus round answer window

// -----------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------

function initSocket(io) {
    ioInstance = io;

    io.on('connection', (socket) => {

        // The frontend currently calls `socket.emit('join_room', sessionId)`
        // - a bare string, not an object - since only playerApp.js/
        // adminApp.js track a playerId and admin sockets don't have one at
        // all. This handler accepts either shape defensively:
        //   joinRoom(sessionId)                -> spectator/admin, no disconnect tracking
        //   joinRoom({ sessionId, playerId })   -> player, enables disconnect tracking
        socket.on('join_room', (payload) => {
            const sessionId = typeof payload === 'string' ? payload : payload?.sessionId;
            const playerId = typeof payload === 'string' ? null : payload?.playerId;
            if (!sessionId) return;

            socket.data.sessionId = sessionId;
            socket.data.playerId = playerId;
            socket.join(sessionId);

            if (playerId) {
                const key = disconnectKey(sessionId, playerId);
                if (pendingDisconnects[key]) {
                    clearTimeout(pendingDisconnects[key]);
                    delete pendingDisconnects[key];
                    console.log(`[SocketService] Cancelled pending disconnect for ${playerId} - reconnected within grace period`);
                }
            }
        });

        socket.on('disconnect', () => {
            const { sessionId, playerId } = socket.data || {};
            // Sockets with no known playerId (admin/spectator, or a player
            // whose join_room hasn't landed yet) are skipped - nothing to
            // mark inactive.
            if (!sessionId || !playerId) return;

            scheduleDisconnect(sessionId, playerId);
        });
    });
}

// -----------------------------------------------------------------------
// Disconnect / heartbeat handling
// -----------------------------------------------------------------------

function disconnectKey(sessionId, playerId) {
    return `${sessionId}::${playerId}`;
}

function scheduleDisconnect(sessionId, playerId) {
    const key = disconnectKey(sessionId, playerId);
    if (pendingDisconnects[key]) return; // already scheduled

    pendingDisconnects[key] = setTimeout(() => {
        delete pendingDisconnects[key];
        markPlayerInactive(sessionId, playerId);
    }, HEARTBEAT_GRACE_MS);
}

function markPlayerInactive(sessionId, playerId) {
    const result = gameService.markPlayerInactive(sessionId, playerId);
    if (!result || result.code !== 0) {
        console.warn('[SocketService] mark inactive skipped:', result?.msg);
        return;
    }
    result.events.forEach(e => broadcastGameEvent(sessionId, e.event, e.data));
}

// -----------------------------------------------------------------------
// Earthquake / bonus round auto-triggers
// -----------------------------------------------------------------------

// Called by gameController.start() once a game actually begins.
function startSessionTimers(sessionId) {
    stopSessionTimers(sessionId);

    const config = gameService.getSessionTimerConfig(sessionId);
    if (!config) return;

    const earthquakeTimer = setInterval(
        () => triggerEarthquake(sessionId),
        config.earthquakeSeconds * 1000
    );

    const bonusTimer = setInterval(
        () => triggerTimedBonusRound(sessionId),
        config.bonusSeconds * 1000
    );

    sessionTimers[sessionId] = { earthquake: earthquakeTimer, bonus: bonusTimer };
}

// Called by gameController when a game ends (win) - exported so
// controllers can stop timers without reaching into this module's
// internals.
function stopSessionTimers(sessionId) {
    const timers = sessionTimers[sessionId];
    if (!timers) return;
    clearInterval(timers.earthquake);
    clearInterval(timers.bonus);
    delete sessionTimers[sessionId];
}

function triggerEarthquake(sessionId) {
    try {
        const result = gameService.triggerEarthquake(sessionId);
        if (!result || result.code !== 0) {
            if (result && result.code === 2008) stopSessionTimers(sessionId);
            return;
        }
        result.events.forEach(e => broadcastGameEvent(sessionId, e.event, e.data));
    } catch (err) {
        console.error('[SocketService] earthquake failed:', err);
    }
}

function triggerTimedBonusRound(sessionId) {
    try {
        const result = bonusService.startBonusRoundLogic(sessionId);
        if (!result || result.code !== 0) {
            if (result && (result.code === 2003 || result.code === 2008)) {
                stopSessionTimers(sessionId);
            }
            return;
        }
        broadcastGameEvent(sessionId, 'bonus_round_started', result.data);
        scheduleBonusExpiry(sessionId, result.data.bonusRoundId);
    } catch (err) {
        console.error('[SocketService] bonus round failed:', err);
    }
}

// NOTE: progression-based bonus rounds (trigger after a player crosses 10
// tiles since their last one) are not implemented - the session/player
// schema has nowhere to store "tiles since last bonus" yet. Only the
// timer-based trigger above is wired up. Needs a schema field added
// first (e.g. `lastBonusTile` per player) before this can be built.

function scheduleBonusExpiry(sessionId, bonusRoundId) {
    bonusExpiryTimers[bonusRoundId] = setTimeout(() => {
        delete bonusExpiryTimers[bonusRoundId];

        const round = bonusService.getActiveBonusRound(sessionId);
        if (round && !round.winnerId) {
            bonusService.expireBonusRound(bonusRoundId);
            broadcastGameEvent(sessionId, 'bonus_round_expired', { bonusRoundId });
        }
    }, BONUS_ANSWER_WINDOW_MS);
}

function clearBonusExpiry(bonusRoundId) {
    if (bonusExpiryTimers[bonusRoundId]) {
        clearTimeout(bonusExpiryTimers[bonusRoundId]);
        delete bonusExpiryTimers[bonusRoundId];
    }
}

// -----------------------------------------------------------------------
// Broadcast helpers (called by controllers after a DB write)
// -----------------------------------------------------------------------

// Called by bonusController.submitBonusAnswer when a winner is found.
// function broadcastBonusResult(sessionId, data) {
//     if (!ioInstance) {
//         console.warn('[SocketService] io not initialized, skip broadcast');
//         return false;
//     }
//     ioInstance.to(sessionId).emit('bonus_result', data);

//     if (data.bonusRoundId) clearBonusExpiry(data.bonusRoundId);
//     return true;
// }

function broadcastGameEvent(sessionId, event, data) {
    if (!ioInstance) {
        console.warn('[SocketService] io not initialized, skip broadcast');
        return false;
    }
    ioInstance.to(sessionId).emit(event, data);
    return true;
}

module.exports = {
    initSocket,
    broadcastBonusResult,
    broadcastGameEvent,
    startSessionTimers,
    stopSessionTimers,
    scheduleBonusExpiry
};