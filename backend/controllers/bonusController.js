// controllers/bonusController.js
const { readDB, writeDB, generateId } = require('../services/dbService');
const gameLogic = require('../services/gameLogic');
const socketService = require('../services/socketService');

// ---------- 内存缓存：活跃的 bonus rounds ----------
// 结构: { bonusRoundId: { sessionId, questionId, winnerId, startTime } }
const activeBonusRounds = {};

// ---------- POST /api/bonus/start ----------
// 注意：此端点仅供内部调用（Socket/逻辑层触发）
function startBonusRound(req, res) {
    try {
        const { sessionId } = req.body;

        // 1. 验证必要字段
        if (!sessionId) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: sessionId'
            });
        }

        // 2. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 3. 检查游戏状态
        if (session.gameStatus !== 'InProgress') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game is not in progress'
            });
        }

        // 4. 检查是否已有活跃的 bonus round
        const existing = Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
        if (existing) {
            return res.json({
                code: 2015,
                data: null,
                msg: 'A bonus round is already active for this session'
            });
        }

        // 5. 取一道未使用的题目
        const usedIds = session.usedQuestionIds || [];
        const availableQuestions = db.questions.filter(q => !usedIds.includes(q.questionId));

        if (availableQuestions.length === 0) {
            return res.json({
                code: 2005,
                data: null,
                msg: 'No unused questions remain'
            });
        }

        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const selected = availableQuestions[randomIndex];

        // 6. 标记为已用
        session.usedQuestionIds.push(selected.questionId);
        writeDB(db);

        // 7. 创建 bonus round
        const bonusRoundId = 'br_' + generateId();
        activeBonusRounds[bonusRoundId] = {
            sessionId: sessionId,
            questionId: selected.questionId,
            winnerId: null,
            startTime: Date.now()
        };

        // 8. 返回响应（Socket 层会广播给所有玩家）
        return res.json({
            code: 0,
            data: {
                bonusRoundId: bonusRoundId,
                questionId: selected.questionId,
                questionText: selected.questionText,
                options: selected.options
            },
            msg: 'Bonus round started'
        });

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

        // 1. 验证必要字段
        if (!bonusRoundId || !selectedOption) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: bonusRoundId or selectedOption'
            });
        }

        // 2. 验证选项格式
        if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
            return res.json({
                code: 1003,
                data: null,
                msg: 'Invalid option, must be A, B, C, or D'
            });
        }

        // 3. 验证身份
        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        // 4. 验证 bonus round 是否存在且活跃
        const bonus = activeBonusRounds[bonusRoundId];
        if (!bonus) {
            return res.json({
                code: 2016,
                data: null,
                msg: 'Bonus round not active or already ended'
            });
        }

        // 5. 验证 bonus round 属于当前会话
        if (bonus.sessionId !== sessionId) {
            return res.json({
                code: 2016,
                data: null,
                msg: 'Bonus round does not belong to this session'
            });
        }

        // 6. 检查是否已经有赢家
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

        // 7. 验证玩家是否在会话中
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

        // 8. 查找题目
        const question = db.questions.find(q => q.questionId === bonus.questionId);
        if (!question) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Question not found'
            });
        }

        // 9. 判断对错
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

        // 10. 答对了！原子锁定赢家
        if (bonus.winnerId) {
            // 理论上不会发生，因为上面已经检查了，但以防并发
            return res.json({
                code: 0,
                data: {
                    correct: true,
                    winner: false
                },
                msg: 'Already answered by someone else'
            });
        }

        // 锁定赢家
        bonus.winnerId = playerId;

        // 11. 应用奖励（前进 5 格）
        const reward = gameLogic.getBonusReward();
        const newTile = Math.min(100, player.currentTile + reward.value);
        player.currentTile = newTile;

        // 12. 检查胜利
        let gameStatus = session.gameStatus;
        let winnerId = session.winnerId;
        if (newTile === 100) {
            gameStatus = 'Completed';
            winnerId = playerId;
            session.gameStatus = gameStatus;
            session.winnerId = winnerId;
        }

        // 13. 写库
        writeDB(db);

        // ========== 触发 Socket 广播 ==========
        socketService.broadcastBonusResult(sessionId, {
            winnerPlayerId: playerId,
            winnerUsername: player.username,
            bonusType: reward.type,
            bonusValue: reward.value,
            newTile: newTile,
            gameStatus: session.gameStatus,
            winnerId: session.winnerId
        });


        // 14. 返回结果
        return res.json({
            code: 0,
            data: {
                correct: true,
                winner: true,
                bonusType: reward.type,
                bonusValue: reward.value,
                sourcePlayerId: playerId,
                newTile: newTile,
                gameStatus: gameStatus,
                winnerId: winnerId
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

// ---------- 工具：清理过期的 bonus rounds（由 Socket 层调用） ----------
function expireBonusRound(bonusRoundId) {
    delete activeBonusRounds[bonusRoundId];
}

// ---------- 工具：获取活跃的 bonus round（供 Socket 层检查） ----------
function getActiveBonusRound(sessionId) {
    return Object.values(activeBonusRounds).find(r => r.sessionId === sessionId);
}

module.exports = {
    startBonusRound,
    submitBonusAnswer,
    expireBonusRound,
    getActiveBonusRound,
    activeBonusRounds  // 导出以便外部检查
};