// services/gameService.js
const { readDB, writeDB } = require('./dbService');
const gameLogic = require('./gameLogic');
const { buildPublicPlayerList } = require('./playerHelpers');

function markPlayerInactive(sessionId, playerId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) return { code: 2003, data: null, msg: 'Session not found' };

        const player = session.players.find(p => p.playerId === playerId);
        if (!player || player.turnStatus === 'inactive') {
            return { code: 0, data: null, msg: 'Already inactive', events: [] };
        }

        player.turnStatus = 'inactive';
        writeDB(db);

        return {
            code: 0,
            data: { playerId, activePlayers: buildPublicPlayerList(session) },
            msg: 'Player marked inactive',
            events: [
                {
                    event: 'player_disconnected',
                    data: { playerId, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[markPlayerInactive]', err);
        return { code: 5000, data: null, msg: 'Failed to write state' };
    }
}

function triggerEarthquake(sessionId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session || session.gameStatus !== 'InProgress') {
            return { code: 2008, data: null, msg: 'Game is not in progress' };
        }

        const preset = gameLogic.getPreset(session.presets);
        const magnitude = preset.earthquake.magnitude || 3;

        session.players.forEach(p => {
            if (p.turnStatus === 'active' && !p.completedAt) {
                p.currentTile = Math.max(1, p.currentTile - magnitude);
            }
        });
        writeDB(db);

        return {
            code: 0,
            data: { magnitude, activePlayers: buildPublicPlayerList(session) },
            msg: 'Earthquake triggered',
            events: [
                {
                    event: 'earthquake_event',
                    data: { magnitude, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[triggerEarthquake]', err);
        return { code: 5000, data: null, msg: 'Failed to write state' };
    }
}

function getSessionTimerConfig(sessionId) {
    const db = readDB();
    const session = db.sessions[sessionId];
    if (!session) return null;

    const preset = gameLogic.getPreset(session.presets);
    return {
        earthquakeSeconds: preset.earthquake.interval || 60,
        bonusSeconds: preset.bonus.interval || 30
    };
}

module.exports = {
    markPlayerInactive,
    triggerEarthquake,
    getSessionTimerConfig
};