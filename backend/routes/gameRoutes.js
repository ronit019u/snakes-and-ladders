// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// POST /api/game/create - 创建房间
router.post('/create', gameController.create);

// POST /api/game/join - 加入房间
router.post('/join', gameController.join);

// GET /api/game/state/:sessionId
router.get('/state/:sessionId', gameController.getState);

// POST /api/game/start - 开始游戏
router.post('/start', gameController.start);

// POST /api/game/move - 移动
router.post('/move', gameController.move);

router.post('/item/use', gameController.useItem);

router.post('/player/disconnect', gameController.disconnect);

module.exports = router;