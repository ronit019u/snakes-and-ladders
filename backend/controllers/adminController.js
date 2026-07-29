// controllers/adminController.js
const { readDB, writeDB, generateId } = require('../services/dbService');
const { DEFAULT_PRESET, getPreset } = require('../services/gameLogic');

// ---------- POST /api/admin/login ----------
function adminLogin(req, res) {
    try {
        const { username, password } = req.body;

        // 验证必要字段
        if (!username || !password) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: username or password'
            });
        }

        // 从环境变量读取管理员凭证
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        // 验证凭证
        if (username !== adminUsername || password !== adminPassword) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Invalid admin credentials'
            });
        }

        // 设置 admin session
        req.session.isAdmin = true;

        return res.json({
            code: 0,
            data: {
                authenticated: true,
                adminName: username
            },
            msg: 'Admin login successful'
        });

    } catch (error) {
        console.error('[Admin Login Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/admin/create ----------
function adminCreateRoom(req, res) {
    try {
        // 验证管理员权限
        if (!req.session.isAdmin) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Unauthorized: Admin access required'
            });
        }

        const { username, presetId } = req.body;

        // 验证用户名
        if (!username || username.trim() === '') {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Username is required'
            });
        }

        const db = readDB();

        // 加载预设
        const presetsLibrary = db.presetsLibrary || {};
        let selectedPreset = DEFAULT_PRESET;
        if (presetId) {
            if (presetsLibrary[presetId]) {
                selectedPreset = presetsLibrary[presetId];
            } else {
                return res.json({
                    code: 2017,
                    data: null,
                    msg: `Preset '${presetId}' not found`
                });
            }
        }

        const sessionId = generateId();
        const adminPlayerId = 'admin_' + generateId();

        // 检查 sessionId 冲突
        if (db.sessions[sessionId]) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Session ID collision, please try again'
            });
        }

        // 创建新会话（管理员不加入 activePlayers）
        db.sessions[sessionId] = {
            sessionId: sessionId,
            ownerId: adminPlayerId,
            gameStatus: 'waiting',
            createdAt: new Date().toISOString(),
            startedAt: null,
            winnerId: null,
            maxPlayers: 25,
            usedQuestionIds: [],
            players: [],
            presets: selectedPreset
        };

        writeDB(db);

        // 关键：把 adminPlayerId 存入 Session，让管理员也能 start
        req.session.playerId = adminPlayerId;

        return res.json({
            code: 0,
            data: {
                sessionId: sessionId,
                gameStatus: 'waiting',
                presets: selectedPreset
            },
            msg: 'Room created by admin successfully'
        });

    } catch (error) {
        console.error('[Admin Create Room Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/admin/questions/upload ----------
function uploadQuestions(req, res) {
    try {
        // 验证管理员权限
        if (!req.session.isAdmin) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Unauthorized: Admin access required'
            });
        }

        // 验证文件是否存在
        if (!req.files || !req.files.file) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'No file uploaded'
            });
        }

        const file = req.files.file;
        const ext = file.name.split('.').pop().toLowerCase();

        // 验证文件格式
        if (!['csv', 'xlsx', 'xls'].includes(ext)) {
            return res.json({
                code: 2013,
                data: null,
                msg: 'Unsupported file format, must be CSV or Excel'
            });
        }

        // 限制文件大小（5MB）
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return res.json({
                code: 2014,
                data: null,
                msg: 'File exceeds maximum allowed size (5MB)'
            });
        }

        const db = readDB();
        const content = file.data.toString('utf-8');
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const startIndex = lines[0].toLowerCase().includes('question') ? 1 : 0;
        const newQuestions = [];

        // 解析 CSV 内容
        for (let i = startIndex; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim());
            if (parts.length >= 7) {
                newQuestions.push({
                    questionId: 'Q' + String(db.questions.length + newQuestions.length + 1).padStart(3, '0'),
                    questionText: parts[0],
                    options: [parts[1], parts[2], parts[3], parts[4]],
                    correctAnswer: parts[5],
                    difficulty: parts[6] || 'Medium',
                    topic: parts[7] || 'General'
                });
            }
        }

        if (newQuestions.length === 0) {
            return res.json({
                code: 2013,
                data: null,
                msg: 'No valid questions found in file'
            });
        }

        // 替换题库
        db.questions = newQuestions;
        writeDB(db);

        return res.json({
            code: 0,
            data: {
                uploaded: newQuestions.length,
                skipped: 0,
                totalQuestions: newQuestions.length
            },
            msg: `Successfully uploaded ${newQuestions.length} questions`
        });

    } catch (error) {
        console.error('[Upload Questions Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/admin/presets ----------
function managePresets(req, res) {
    try {
        // 验证管理员权限
        if (!req.session.isAdmin) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Unauthorized: Admin access required'
            });
        }

        const { presetId, presets, sessionId } = req.body;

        if (!presetId) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: presetId'
            });
        }

        const db = readDB();

        // ---------- 保存模式 ----------
        if (presets) {
            let validatedPreset;
            try {
                // 验证并补全预设结构
                validatedPreset = getPreset(presets);
                validatedPreset.presetId = presetId;
            } catch (err) {
                return res.json({
                    code: 1002,
                    data: null,
                    msg: 'Invalid preset structure: ' + err.message
                });
            }

            // 保存到预设库
            const presetsLibrary = db.presetsLibrary || {};
            presetsLibrary[presetId] = validatedPreset;
            db.presetsLibrary = presetsLibrary;

            // 如果提供了 sessionId，同时应用到当前房间
            if (sessionId) {
                const session = db.sessions[sessionId];
                if (!session) {
                    return res.json({
                        code: 2003,
                        data: null,
                        msg: 'Session not found'
                    });
                }
                // 只有房主可以改预设
                if (!req.session.isAdmin) {
                    return res.json({
                        code: 2009,
                        data: null,
                        msg: 'Only session owner can apply presets'
                    });
                }
                session.presets = validatedPreset;
                writeDB(db);

                return res.json({
                    code: 0,
                    data: {
                        presetId: presetId,
                        saved: true,
                        appliedToSession: true
                    },
                    msg: `Preset '${presetId}' saved and applied to current room`
                });
            }

            writeDB(db);

            return res.json({
                code: 0,
                data: {
                    presetId: presetId,
                    saved: true,
                    appliedToSession: false
                },
                msg: `Preset '${presetId}' saved successfully`
            });
        }

        // ---------- 加载模式 ----------
        const presetsLibrary = db.presetsLibrary || {};
        const loadedPresets = presetsLibrary[presetId];

        if (!loadedPresets) {
            return res.json({
                code: 2017,
                data: null,
                msg: `Preset '${presetId}' not found`
            });
        }

        return res.json({
            code: 0,
            data: {
                presetId: presetId,
                presets: loadedPresets
            },
            msg: `Preset '${presetId}' loaded successfully`
        });

    } catch (error) {
        console.error('[Manage Presets Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

module.exports = {
    adminLogin,
    adminCreateRoom,
    uploadQuestions,
    managePresets
};