// controllers/quizController.js
const { readDB, writeDB } = require('../services/dbService');
const gameLogic = require('../services/gameLogic');


// ---------- GET /api/question/random/:sessionId ----------
function getRandomQuestion(req, res) {
    try {
        const { sessionId } = req.params;

        // 1. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];

        // 2. 检查会话是否存在
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 3. 过滤出未使用的题目
        const usedIds = session.usedQuestionIds || [];
        const availableQuestions = db.questions.filter(q => !usedIds.includes(q.questionId));

        // 4. 检查是否还有未使用的题目
        if (availableQuestions.length === 0) {
            return res.json({
                code: 2005,
                data: null,
                msg: 'No unused questions remain in this session'
            });
        }

        // 5. 随机选一道
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const selected = availableQuestions[randomIndex];

        // 6. 标记为已用
        session.usedQuestionIds.push(selected.questionId);
        writeDB(db);

        // 7. 返回题目（不含正确答案）
        const responseData = {
            questionId: selected.questionId,
            questionText: selected.questionText,
            options: selected.options
            // 注意：correctAnswer 不返回
        };

        return res.json({
            code: 0,
            data: responseData,
            msg: 'success'
        });

    } catch (error) {
        console.error('[Get Random Question Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/question/validate ----------
function validateAnswer(req, res) {
    try {
        const { questionId, selectedOption } = req.body;
        const playerId = req.session.playerId;
        const sessionId = req.session.sessionId;

        // 1. 验证必要字段
        if (!questionId || !selectedOption) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: questionId or selectedOption'
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

        // 3. 获取玩家当前状态
        if (!sessionId) {
            return res.json({ code: 2004, data: null, msg: 'Player not in a session' });
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({ code: 2004, data: null, msg: 'Session not found' });
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return res.json({ code: 2004, data: null, msg: 'Player not found' });
        }

        // 4. 验证问题是否属于该会话
        if (!session.usedQuestionIds.includes(questionId)) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Question not assigned to this session'
            });
        }

        // 5. 查找题目
        const question = db.questions.find(q => q.questionId === questionId);
        if (!question) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Question not found in database'
            });
        }

        // 6. 判断对错
        const isCorrect = selectedOption === question.correctAnswer;

        // 7. 计算 targetTile
        const currentTile = player.currentTile;
        const targetTile = gameLogic.calculateTargetTile(currentTile, isCorrect, 'ladder');

        // 8. 返回结果
        return res.json({
            code: 0,
            data: {
                correct: isCorrect,
                targetTile: targetTile
            },
            msg: isCorrect ? 'Correct answer' : 'Incorrect answer'
        });

    } catch (error) {
        console.error('[Validate Answer Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

module.exports = {
    getRandomQuestion,
    validateAnswer
};