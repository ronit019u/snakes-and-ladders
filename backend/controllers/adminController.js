// controllers/adminController.js
const adminService = require('../services/adminService');

// 管理员权限检查；失败时直接写响应并返回 false
function requireAdmin(req, res) {
    if (!req.session.isAdmin) {
        res.json({ code: 2009, data: null, msg: 'Unauthorized: Admin access required' });
        return false;
    }
    return true;
}

// ---------- POST /api/admin/login ----------
function adminLogin(req, res) {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: username or password'
            });
        }

        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        if (username !== adminUsername || password !== adminPassword) {
            return res.json({ code: 2009, data: null, msg: 'Invalid admin credentials' });
        }

        req.session.isAdmin = true;

        return res.json({
            code: 0,
            data: { authenticated: true, adminName: username },
            msg: 'Admin login successful'
        });
    } catch (err) {
        console.error('[Admin Login Error]', err);
        return res.json({ code: 5000, data: null, msg: 'Internal server error' });
    }
}

// ---------- POST /api/admin/create ----------
function adminCreateRoom(req, res) {
    if (!requireAdmin(req, res)) return;

    const { username, presetId } = req.body || {};
    const result = adminService.createRoom({ username, presetId });

    if (result.code === 0 && result.session) {
        req.session.playerId = result.session.playerId;
        req.session.sessionId = result.session.sessionId;
    }

    return res.json({ code: result.code, data: result.data, msg: result.msg });
}

// ---------- POST /api/admin/questions/upload ----------
function uploadQuestions(req, res) {
    if (!requireAdmin(req, res)) return;

    if (!req.files || !req.files.file) {
        return res.json({ code: 1001, data: null, msg: 'No file uploaded' });
    }

    const result = adminService.uploadQuestions({
        file: req.files.file,
        mode: (req.body || {}).mode
    });

    return res.json(result);
}

// ---------- POST /api/admin/presets ----------
function managePresets(req, res) {
    if (!requireAdmin(req, res)) return;

    const { presetId, presets, sessionId } = req.body || {};
    return res.json(adminService.managePresets({ presetId, presets, sessionId }));
}

// ---------- GET /api/admin/presets ----------
function listPresets(req, res) {
    if (!requireAdmin(req, res)) return;
    return res.json(adminService.listPresets());
}

module.exports = {
    adminLogin,
    adminCreateRoom,
    uploadQuestions,
    managePresets,
    listPresets
};