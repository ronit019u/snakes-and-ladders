// controllers/bonusController.js
const bonusService = require('../services/bonusService');
const socketService = require('../services/socketService');

function startBonusRound(req, res) {
    try {
        const { sessionId } = req.body;
        const result = bonusService.startBonusRoundLogic(sessionId);

        if (result.code === 0) {
            socketService.broadcastGameEvent(sessionId, 'bonus_round_started', result.data);
        }
        return res.json(result);
    } catch (error) {
        console.error('[Start Bonus Error]', error);
        return res.json({ code: 5000, data: null, msg: 'Internal server error' });
    }
}

function submitBonusAnswer(req, res) {
    try {
        const { bonusRoundId, selectedOption } = req.body;
        const playerId = req.session.playerId || req.body.playerId;
        const sessionId = req.session.sessionId || req.body.sessionId;

        const result = bonusService.submitBonusAnswerLogic(
            sessionId, playerId, bonusRoundId, selectedOption
        );

        if (result.events) {
            result.events.forEach(e => {
                socketService.broadcastGameEvent(sessionId, e.event, e.data);
                if (e.event === 'game_over') {
                    socketService.stopSessionTimers(sessionId);
                }
            });
        }

        return res.json({
            code: result.code,
            data: result.data,
            msg: result.msg
        });
    } catch (error) {
        console.error('[Submit Bonus Answer Error]', error);
        return res.json({ code: 5000, data: null, msg: 'Internal server error' });
    }
}

module.exports = {
    startBonusRound,
    submitBonusAnswer
};