// controllers/gameController.js
const gameService = require('../services/gameService');
const socketService = require('../services/socketService');

// 把 service 返回的 events 统一广播出去；game_over 时顺带停掉定时器
function broadcastEvents(sessionId, events) {
    (events || []).forEach(e => {
        socketService.broadcastGameEvent(sessionId, e.event, e.data);
        if (e.event === 'game_over') {
            socketService.stopSessionTimers(sessionId);
        }
    });
}

function saveSessionAndRespond(req, res, result) {
    req.session.playerId = result.data.playerId;
    req.session.sessionId = result.data.sessionId;

    req.session.save(err => {
        if (err) {
            console.error('[Session Save Error]', err);
            return res.json({ code: 5000, data: null, msg: 'Failed to establish session' });
        }
        return res.json(result);
    });
}

// ---------- POST /api/game/create ----------
function create(req, res) {
    const result = gameService.createSession((req.body || {}).username);
    if (result.code !== 0) return res.json(result);
    return saveSessionAndRespond(req, res, result);
}

// ---------- POST /api/game/join ----------
function join(req, res) {
    const body = req.body || {};
    const result = gameService.joinSession({
        sessionId: body.sessionId,
        username: body.username,
        playerId: body.playerId
    });

    if (result.code !== 0) return res.json(result);

    broadcastEvents(result.data.sessionId, result.events);
    return saveSessionAndRespond(req, res, result);
}

// ---------- GET /api/game/state/:sessionId ----------
function getState(req, res) {
    return res.json(gameService.getSessionState(req.params.sessionId));
}

// ---------- POST /api/game/character ----------
function selectCharacter(req, res) {
    const result = gameService.selectCharacter({
        sessionId: req.session.sessionId,
        playerId: req.session.playerId,
        characterId: (req.body || {}).characterId
    });

    if (result.code === 0) {
        broadcastEvents(req.session.sessionId, result.events);
    }
    return res.json(result);
}

// ---------- POST /api/game/start ----------
function start(req, res) {
    const result = gameService.start({
        sessionId: req.session.sessionId,
        playerId: req.session.playerId
    });

    if (result.code === 0) {
        broadcastEvents(result.data.sessionId, result.events);
        socketService.startSessionTimers(result.data.sessionId);
    }
    return res.json(result);
}

// ---------- POST /api/game/move ----------
function move(req, res) {
    const body = req.body || {};
    const sessionId = req.session.sessionId || body.sessionId;
    const playerId = req.session.playerId || body.playerId;

    const result = gameService.move({
        sessionId,
        playerId,
        targetTile: body.targetTile,
        questionId: body.questionId,
        selectedOption: body.selectedOption
    });

    if (result.code === 0) {
        broadcastEvents(sessionId, result.events);
    }
    return res.json(result);
}

// ---------- POST /api/game/item/use ----------
function useItem(req, res) {
    const body = req.body || {};
    const sessionId = req.session.sessionId || body.sessionId;
    const playerId = req.session.playerId || body.playerId;

    const result = gameService.useItem({
        sessionId,
        playerId,
        itemType: body.itemType,
        targetPlayerId: body.targetPlayerId
    });

    if (result.code === 0) {
        broadcastEvents(sessionId, result.events);
    }
    return res.json(result);
}

// ---------- POST /api/game/player/disconnect ----------
function disconnect(req, res) {
    const { sessionId, playerId } = req.body || {};

    if (!sessionId || !playerId) {
        return res.json({ code: 1001, data: null, msg: 'Missing required field: sessionId or playerId' });
    }

    const result = gameService.markPlayerInactive(sessionId, playerId);
    if (result.code === 0) {
        broadcastEvents(sessionId, result.events);
    }
    return res.json({ code: result.code, data: result.data, msg: result.msg });
}

module.exports = {
    create,
    join,
    getState,
    selectCharacter,
    start,
    move,
    useItem,
    disconnect
};