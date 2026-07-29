// routes/questionRoutes.js
const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');

// GET /api/question/random/:sessionId - 取随机题目
router.get('/random/:sessionId', quizController.getRandomQuestion);

// POST /api/question/validate - 验证答案
router.post('/validate', quizController.validateAnswer);

module.exports = router;