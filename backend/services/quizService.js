// services/quizService.js
const { readDB, writeDB } = require('./dbService');
const gameLogic = require('./gameLogic');

function getRandomQuestion(sessionId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }

        if (session.gameStatus !== 'InProgress') {
            return { code: 2008, data: null, msg: 'Game is not in progress' };
        }

        if (!playerId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not found' };
        }

        if (player.completedAt) {
            return { code: 2020, data: null, msg: 'Player already finished' };
        }
        
        if (!session.usedQuestionIds) session.usedQuestionIds = [];
        const usedIds = session.usedQuestionIds;
        const availableQuestions = db.questions.filter(q => !usedIds.includes(q.questionId));

        if (availableQuestions.length === 0) {
            return { code: 2005, data: null, msg: 'No unused questions remain in this session' };
        }

        const selected = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
        usedIds.push(selected.questionId);
        writeDB(db);

        return {
            code: 0,
            data: {
                questionId: selected.questionId,
                questionText: selected.questionText,
                options: selected.options
            },
            msg: 'success'
        };
    } catch (err) {
        console.error('[quizService.getRandomQuestion]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

function validateAnswer({ sessionId, playerId, questionId, selectedOption }) {
    try {
        if (!questionId || !selectedOption) {
            return { code: 1001, data: null, msg: 'Missing required field: questionId or selectedOption' };
        }
        if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
            return { code: 1003, data: null, msg: 'Invalid option, must be A, B, C, or D' };
        }
        if (!sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2004, data: null, msg: 'Session not found' };
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not found' };
        }
        if (player.completedAt) {
            return { code: 2020, data: null, msg: 'Player already finished' };
        }

        if (!(session.usedQuestionIds || []).includes(questionId)) {
            return { code: 5000, data: null, msg: 'Question not assigned to this session' };
        }

        const question = db.questions.find(q => q.questionId === questionId);
        if (!question) {
            return { code: 5000, data: null, msg: 'Question not found in database' };
        }

        const isCorrect = selectedOption === question.correctAnswer;
        const targetTile = gameLogic.calculateTargetTile(player.currentTile, isCorrect);

        return {
            code: 0,
            data: { correct: isCorrect, targetTile },
            msg: isCorrect ? 'Correct answer' : 'Incorrect answer'
        };
    } catch (err) {
        console.error('[quizService.validateAnswer]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

module.exports = {
    getRandomQuestion,
    validateAnswer
};