// services/bonusService.js
const { readDB, writeDB, generateId } = require('./dbService');
const gameLogic = require('./gameLogic');
const { buildPublicPlayerList, applyPlayerFinish } = require('./playerHelpers');

const activeBonusRounds = {};

function startBonusRoundLogicOnly(sessionId, db) {
    if (!sessionId) {
        return { code: 1001, data: null, msg: 'Missing required field: sessionId' };
    }

    const _db = db || readDB();
    const session = _db.sessions[sessionId];

    if (!session) return { code: 2003, data: null, msg: 'Session not found' };
    if (session.gameStatus !== 'InProgress') return { code: 2008, data: null, msg: 'Game is not in progress' };

    const existing = Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
    if (existing) return { code: 2015, data: null, msg: 'A bonus round is already active for this session' };

    const usedIds = session.usedQuestionIds || [];
    const availableQuestions = _db.questions.filter(q => !usedIds.includes(q.questionId));

    if (availableQuestions.length === 0) {
        return { code: 2005, data: null, msg: 'No unused questions remain' };
    }

    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const selected = availableQuestions[randomIndex];
    session.usedQuestionIds.push(selected.questionId);

    const bonusRoundId = 'br_' + generateId();
    activeBonusRounds[bonusRoundId] = {
        sessionId,
        questionId: selected.questionId,
        winnerId: null,
        startTime: Date.now()
    };

    return {
        code: 0,
        data: {
            bonusRoundId,
            questionId: selected.questionId,
            questionText: selected.questionText,
            options: selected.options
        },
        msg: 'Bonus round started',
        _db,
        _session: session
    };
}

function startBonusRoundLogic(sessionId) {
    const result = startBonusRoundLogicOnly(sessionId);
    if (result.code !== 0) return { code: result.code, data: null, msg: result.msg };

    try {
        writeDB(result._db);
    } catch (err) {
        console.error('[startBonusRoundLogic] write failed', err);
        return { code: 5000, data: null, msg: 'Failed to write state' };
    }

    return { code: 0, data: result.data, msg: result.msg };
}

// 返回 { code, data, msg, events }
function submitBonusAnswerLogic(sessionId, playerId, bonusRoundId, selectedOption) {
    try {
        if (!bonusRoundId || !selectedOption) {
            return { code: 1001, data: null, msg: 'Missing required field' };
        }
        if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
            return { code: 1003, data: null, msg: 'Invalid option' };
        }
        if (!playerId || !sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const bonus = activeBonusRounds[bonusRoundId];
        if (!bonus) return { code: 2016, data: null, msg: 'Bonus round not active' };
        if (bonus.sessionId !== sessionId) return { code: 2016, data: null, msg: 'Bonus round mismatch' };
        if (bonus.winnerId) {
            return { code: 0, data: { correct: true, winner: false }, msg: 'Already answered' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) return { code: 2003, data: null, msg: 'Session not found' };

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) return { code: 2004, data: null, msg: 'Player not found' };
        if (player.completedAt) return { code: 2020, data: null, msg: 'Player already finished' };

        const question = db.questions.find(q => q.questionId === bonus.questionId);
        if (!question) return { code: 5000, data: null, msg: 'Question not found' };

        const isCorrect = selectedOption === question.correctAnswer;
        const events = [];

        if (!isCorrect) {
            const penalty = session.presets?.bonus?.penaltySteps || 2;
            player.currentTile = Math.max(1, player.currentTile - penalty);
            writeDB(db);
            events.push({
                event: 'bonus_result',
                data: {
                    bonusRoundId, winnerPlayerId: null, correct: false,
                    penalty, newTile: player.currentTile
                }
            });
            return {
                code: 0,
                data: { correct: false, penalty },
                msg: `Incorrect answer, moved back ${penalty} steps`,
                events
            };
        }

        bonus.winnerId = playerId;
        delete activeBonusRounds[bonusRoundId];

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
                if (player.inventory.length < 3) player.inventory.push(itemGranted);
                break;
        }

        if (newTile === 100) applyPlayerFinish(session, player);
        writeDB(db);

        events.push({
            event: 'bonus_result',
            data: {
                bonusRoundId,
                winnerPlayerId: playerId,
                winnerUsername: player.username,
                bonusType: reward.type,
                bonusValue: reward.value,
                newTile,
                gameStatus: session.gameStatus,
                winnerId: session.winnerId
            }
        });

        if (session.gameStatus === 'Completed') {
            events.push({
                event: 'game_over',
                data: {
                    winnerId: session.winnerId,
                    activePlayers: buildPublicPlayerList(session)
                }
            });
        } else if (newTile === 100) {
            events.push({
                event: 'move_update',
                data: {
                    playerId,
                    currentTile: 100,
                    activePlayers: buildPublicPlayerList(session)
                }
            });
        }

        return {
            code: 0,
            data: {
                correct: true, winner: true,
                bonusType: reward.type, bonusValue: reward.value,
                sourcePlayerId: playerId, newTile,
                gameStatus: session.gameStatus, winnerId: session.winnerId
            },
            msg: `🎉 ${player.username} won the bonus round!`,
            events
        };
    } catch (err) {
        console.error('[submitBonusAnswerLogic]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

function expireBonusRound(bonusRoundId) {
    delete activeBonusRounds[bonusRoundId];
}

function getActiveBonusRound(sessionId) {
    return Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
}

module.exports = {
    startBonusRoundLogic,
    startBonusRoundLogicOnly,
    submitBonusAnswerLogic,
    expireBonusRound,
    getActiveBonusRound,
    activeBonusRounds
};