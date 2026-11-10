// controllers/quizController.js
const quizService = require('../services/quizService');

// GET /api/question/random/:sessionId
function getRandomQuestion(req, res) {
    const result = quizService.getRandomQuestion(req.params.sessionId);
    return res.json(result);
}

// POST /api/question/validate
function validateAnswer(req, res) {
    const body = req.body || {};
    const playerId = req.session.playerId || body.playerId;
    const sessionId = req.session.sessionId || body.sessionId;

    const result = quizService.validateAnswer({
        sessionId,
        playerId,
        questionId: body.questionId,
        selectedOption: body.selectedOption
    });

    return res.json(result);
}

module.exports = {
    getRandomQuestion,
    validateAnswer
};