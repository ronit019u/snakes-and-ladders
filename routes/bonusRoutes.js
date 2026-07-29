// routes/bonusRoutes.js
const express = require('express');
const router = express.Router();
const bonusController = require('../controllers/bonusController');

// 开始奖励回合（内部调用）
router.post('/start', bonusController.startBonusRound);

// 提交奖励答案
router.post('/answer', bonusController.submitBonusAnswer);

module.exports = router;