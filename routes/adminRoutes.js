// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// POST /api/admin/login - 管理员登录
router.post('/login', adminController.adminLogin);

// POST /api/admin/create - 管理员创建房间
router.post('/create', adminController.adminCreateRoom);

// POST /api/admin/questions/upload - 上传题库
router.post('/questions/upload', adminController.uploadQuestions);

// POST /api/admin/presets - 预设管理（保存/加载）
router.post('/presets', adminController.managePresets);

module.exports = router;