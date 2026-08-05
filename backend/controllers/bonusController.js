// controllers/bonusController.js
const { readDB, writeDB, generateId } = require('../services/dbService');
const gameLogic = require('../services/gameLogic');
const socketService = require('../services/socketService');
const { buildPublicPlayerList, applyPlayerFinish } = require('../services/playerHelpers');

const activeBonusRounds = {};

// 原 startBonusRoundLogicOnly 保持不变，但让它返回 db 和 session
function startBonusRoundLogicOnly(sessionId) {
    if (!sessionId) {
        return { code: 1001, data: null, msg: 'Missing required field: sessionId' };
    }

    const db = readDB();
    const session = db.sessions[sessionId];

    if (!session) {
        return { code: 2003, data: null, msg: 'Session not found' };
    }

    if (session.gameStatus !== 'InProgress') {
        return { code: 2008, data: null, msg: 'Game is not in progress' };
    }

    const existing = Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
    if (existing) {
        return { code: 2015, data: null, msg: 'A bonus round is already active for this session' };
    }

    const usedIds = session.usedQuestionIds || [];
    const availableQuestions = db.questions.filter(q => !usedIds.includes(q.questionId));

    if (availableQuestions.length === 0) {
        return { code: 2005, data: null, msg: 'No unused questions remain' };
    }

    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const selected = availableQuestions[randomIndex];

    session.usedQuestionIds.push(selected.questionId);

    const bonusRoundId = 'br_' + generateId();
    activeBonusRounds[bonusRoundId] = {
        sessionId: sessionId,
        questionId: selected.questionId,
        winnerId: null,
        startTime: Date.now()
    };

    return {
        code: 0,
        data: {
            bonusRoundId: bonusRoundId,
            questionId: selected.questionId,
            questionText: selected.questionText,
            options: selected.options
        },
        msg: 'Bonus round started',
        // 新增：返回 db 和 session 引用，供调用者写库
        _db: db,
        _session: session
    };
}

// 修改 startBonusRoundLogic，直接使用返回的 db 写库，不再重新读取
function startBonusRoundLogic(sessionId) {
    const result = startBonusRoundLogicOnly(sessionId);
    if (result.code === 0 && result._db && result._session) {
        // 直接使用同一个 db 实例写库，不会丢失修改
        writeDB(result._db);
    }
    // 返回时去掉内部字段
    return {
        code: result.code,
        data: result.data,
        msg: result.msg
    };
}


// ---------- POST /api/bonus/start ----------

function startBonusRound(req, res) {
    try {
        const { sessionId } = req.body;
        const result = startBonusRoundLogic(sessionId);

        if (result.code === 0) {
            socketService.broadcastGameEvent(sessionId, 'bonus_round_started', result.data);
        }

        return res.json(result);
    } catch (error) {
        console.error('[Start Bonus Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/bonus/answer ----------
function submitBonusAnswer(req, res) {
    try {
        const { bonusRoundId, selectedOption } = req.body;
        const playerId = req.session.playerId;
        const sessionId = req.session.sessionId;

        if (!bonusRoundId || !selectedOption) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: bonusRoundId or selectedOption'
            });
        }

        if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
            return res.json({
                code: 1003,
                data: null,
                msg: 'Invalid option, must be A, B, C, or D'
            });
        }

        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        const bonus = activeBonusRounds[bonusRoundId];
        if (!bonus) {
            return res.json({
                code: 2016,
                data: null,
                msg: 'Bonus round not active or already ended'
            });
        }

        if (bonus.sessionId !== sessionId) {
            return res.json({
                code: 2016,
                data: null,
                msg: 'Bonus round does not belong to this session'
            });
        }

        if (bonus.winnerId) {
            return res.json({
                code: 0,
                data: {
                    correct: true,
                    winner: false
                },
                msg: 'Already answered by someone else'
            });
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not found'
            });
        }

        if (player.completedAt) {
            return res.json({
                code: 2020,
                data: null,
                msg: 'Player already finished the game'
            });
        }

        const question = db.questions.find(q => q.questionId === bonus.questionId);
        if (!question) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Question not found'
            });
        }

        const isCorrect = selectedOption === question.correctAnswer;

        if (!isCorrect) {
            return res.json({
                code: 0,
                data: {
                    correct: false
                },
                msg: 'Incorrect answer'
            });
        }

        if (bonus.winnerId) {
            return res.json({
                code: 0,
                data: {
                    correct: true,
                    winner: false
                },
                msg: 'Already answered by someone else'
            });
        }

        bonus.winnerId = playerId;

        const reward = gameLogic.getBonusReward(session.presets);
        let newTile = player.currentTile;
        let itemGranted = null;

        switch (reward.type) {
            case 'forward_boost':
                newTile = Math.min(100, player.currentTile + reward.value);
                player.currentTile = newTile;
                break;

            case 'item_grant':
                itemGranted = reward.value;
                if (!player.inventory) player.inventory = [];
                if (player.inventory.length < 3) {
                    player.inventory.push(itemGranted);
                }
                break;

            default:
                console.warn('[Bonus] Unknown reward type:', reward.type);
        }

        if (newTile === 100) {
            const result = applyPlayerFinish(session, player);
        }

        writeDB(db);

        socketService.broadcastBonusResult(sessionId, {
            bonusRoundId: bonusRoundId,
            winnerPlayerId: playerId,
            winnerUsername: player.username,
            bonusType: reward.type,
            bonusValue: reward.value,
            newTile: newTile,
            gameStatus: session.gameStatus,
            winnerId: session.winnerId
        });

        if (session.gameStatus === 'Completed') {
            socketService.broadcastGameEvent(sessionId, 'game_over', {
                winnerId: session.winnerId,
                activePlayers: buildPublicPlayerList(session)
            });
            socketService.stopSessionTimers(sessionId);
        } else if (newTile === 100) {
            socketService.broadcastGameEvent(sessionId, 'move_update', {
                playerId: playerId,
                currentTile: 100,
                activePlayers: buildPublicPlayerList(session)
            });
        }

        // 返回结果
        return res.json({
            code: 0,
            data: {
                correct: true,
                winner: true,
                bonusType: reward.type,
                bonusValue: reward.value,
                sourcePlayerId: playerId,
                newTile: newTile,
                gameStatus: session.gameStatus,
                winnerId: session.winnerId
            },
            msg: `🎉 ${player.username} won the bonus round!`
        });

    } catch (error) {
        console.error('[Submit Bonus Answer Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

function expireBonusRound(bonusRoundId) {
    delete activeBonusRounds[bonusRoundId];
}

function getActiveBonusRound(sessionId) {
    return Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
}

module.exports = {
    startBonusRound,
    startBonusRoundLogic,
    startBonusRoundLogicOnly,
    submitBonusAnswer,
    expireBonusRound,
    getActiveBonusRound,
    activeBonusRounds
};