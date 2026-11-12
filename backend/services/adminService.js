// services/adminService.js
const { readDB, writeDB, generateId, generateRoomId } = require('./dbService');
const { DEFAULT_PRESET, getPreset } = require('./gameLogic');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');

// ---------- POST /api/admin/create ----------
function createRoom({ username, presetId }) {
    try {
        if (!username || username.trim() === '') {
            return { code: 1001, data: null, msg: 'Username is required' };
        }

        const db = readDB();
        const presetsLibrary = db.presetsLibrary || {};

        let selectedPreset = DEFAULT_PRESET;
        if (presetId) {
            if (presetsLibrary[presetId]) {
                selectedPreset = getPreset(presetsLibrary[presetId]);
            } else {
                return { code: 2017, data: null, msg: `Preset '${presetId}' not found` };
            }
        }

        const sessionId = generateRoomId(db);
        const adminPlayerId = 'admin_' + generateId();

        if (db.sessions[sessionId]) {
            return { code: 5000, data: null, msg: 'Session ID collision, please try again' };
        }

        db.sessions[sessionId] = {
            sessionId,
            ownerId: adminPlayerId,
            gameStatus: 'waiting',
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            winnerId: null,
            maxPlayers: 25,
            usedQuestionIds: [],
            players: [],
            presets: selectedPreset
        };

        writeDB(db);

        return {
            code: 0,
            data: {
                sessionId,
                gameStatus: 'waiting',
                presets: selectedPreset
            },
            msg: 'Room created by admin successfully',
            // 只给 controller 用来写 req.session，不放进响应 data
            session: { playerId: adminPlayerId, sessionId }
        };
    } catch (err) {
        console.error('[adminService.createRoom]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// CSV 分隔符自动识别：逗号 / 分号 / 制表符 / 竖线
// 题目文本里逗号很常见，所以允许用分号等做分隔符，同时兼容旧的逗号 CSV。
function detectDelimiter(headerLine) {
    const candidates = ['\t', ';', '|', ','];
    let best = ',';
    let bestCount = 0;

    for (const delimiter of candidates) {
        const count = headerLine.split(delimiter).length - 1;
        if (count > bestCount) {
            best = delimiter;
            bestCount = count;
        }
    }
    return best;
}

// 按指定分隔符切分一行，支持双引号包裹的字段和 "" 转义
function parseDelimitedLine(line, delimiter) {
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delimiter) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    parts.push(current.trim());
    return parts;
}

// ---------- POST /api/admin/questions/upload ----------
function uploadQuestions({ file, mode }) {
    try {
        if (!file) {
            return { code: 1001, data: null, msg: 'No file uploaded' };
        }

        const ext = file.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(ext)) {
            return { code: 2013, data: null, msg: 'Unsupported file format, must be CSV or Excel' };
        }

        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return { code: 2014, data: null, msg: 'File exceeds maximum allowed size (5MB)' };
        }

        const db = readDB();
        const newQuestions = [];

        // ---------- CSV ----------
        if (ext === 'csv') {
            let content;
            try {
                content = iconv.decode(file.data, 'gbk');
            } catch (err) {
                content = file.data.toString('utf-8');
            }

            // 去掉 Excel 可能写入的 BOM
            content = content.replace(/^\uFEFF/, '');

            const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length === 0) {
                return { code: 2013, data: null, msg: 'No valid questions found in file' };
            }

            const delimiter = detectDelimiter(lines[0]);
            const startIndex = lines[0].toLowerCase().includes('question') ? 1 : 0;

            const maxId = db.questions.reduce((max, q) => {
                const num = parseInt(q.questionId.replace('Q', ''));
                return num > max ? num : max;
            }, 0);
            let counter = 0;

            for (let i = startIndex; i < lines.length; i++) {
                const parts = parseDelimitedLine(lines[i], delimiter);
                if (parts.length >= 7) {
                    counter++;
                    newQuestions.push({
                        questionId: 'Q' + String(maxId + counter).padStart(3, '0'),
                        questionText: parts[0],
                        options: [parts[1], parts[2], parts[3], parts[4]],
                        correctAnswer: parts[5],
                        difficulty: parts[6] || 'Medium',
                        topic: parts[7] || 'General'
                    });
                }
            }
        }

        // ---------- Excel ----------
        else if (['xlsx', 'xls'].includes(ext)) {
            const workbook = XLSX.read(file.data, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            const maxId = db.questions.reduce((max, q) => {
                const num = parseInt(q.questionId.replace('Q', ''));
                return num > max ? num : max;
            }, 0);
            let counter = 0;

            for (const row of rows) {
                const questionText = row.question?.toString().trim();
                if (!questionText) continue;

                counter++;
                newQuestions.push({
                    questionId: 'Q' + String(maxId + counter).padStart(3, '0'),
                    questionText,
                    options: [
                        row.optionA?.toString().trim() || '',
                        row.optionB?.toString().trim() || '',
                        row.optionC?.toString().trim() || '',
                        row.optionD?.toString().trim() || ''
                    ],
                    correctAnswer: row.correct?.toString().trim().toUpperCase() || '',
                    difficulty: row.difficulty?.toString().trim() || 'Medium',
                    topic: row.topic?.toString().trim() || 'General'
                });
            }
        }

        if (newQuestions.length === 0) {
            return { code: 2013, data: null, msg: 'No valid questions found in file' };
        }

        const finalMode = mode || 'append';

        if (finalMode === 'append') {
            const maxId = db.questions.reduce((max, q) => {
                const num = parseInt(q.questionId.replace('Q', ''));
                return num > max ? num : max;
            }, 0);

            newQuestions.forEach((q, index) => {
                q.questionId = 'Q' + String(maxId + index + 1).padStart(3, '0');
            });

            db.questions.push(...newQuestions);
            writeDB(db);

            return {
                code: 0,
                data: {
                    uploaded: newQuestions.length,
                    totalQuestions: db.questions.length,
                    mode: 'append',
                    message: `Successfully appended ${newQuestions.length} questions`
                },
                msg: `Successfully appended ${newQuestions.length} questions (total: ${db.questions.length})`
            };
        }

        newQuestions.forEach((q, index) => {
            q.questionId = 'Q' + String(index + 1).padStart(3, '0');
        });

        db.questions = newQuestions;
        writeDB(db);

        return {
            code: 0,
            data: {
                uploaded: newQuestions.length,
                totalQuestions: db.questions.length,
                mode: 'replace',
                message: `Successfully replaced question bank with ${newQuestions.length} questions`
            },
            msg: `Successfully uploaded ${newQuestions.length} questions (replaced existing bank)`
        };
    } catch (err) {
        console.error('[adminService.uploadQuestions]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/admin/presets ----------
function managePresets({ presetId, presets, sessionId }) {
    try {
        if (!presetId) {
            return { code: 1001, data: null, msg: 'Missing required field: presetId' };
        }

        const db = readDB();

        // 保存
        if (presets) {
            let validatedPreset;
            try {
                validatedPreset = getPreset(presets);
                validatedPreset.presetId = presetId;
            } catch (err) {
                return { code: 1002, data: null, msg: 'Invalid preset structure: ' + err.message };
            }

            const presetsLibrary = db.presetsLibrary || {};
            presetsLibrary[presetId] = validatedPreset;
            db.presetsLibrary = presetsLibrary;

            if (sessionId) {
                const session = db.sessions[sessionId];
                if (!session) {
                    return { code: 2003, data: null, msg: 'Session not found' };
                }

                session.presets = validatedPreset;
                writeDB(db);

                return {
                    code: 0,
                    data: { presetId, saved: true, appliedToSession: true },
                    msg: `Preset '${presetId}' saved and applied to current room`
                };
            }

            writeDB(db);

            return {
                code: 0,
                data: { presetId, saved: true, appliedToSession: false },
                msg: `Preset '${presetId}' saved successfully`
            };
        }

        // 加载
        const presetsLibrary = db.presetsLibrary || {};
        const loadedPresets = presetsLibrary[presetId];

        if (!loadedPresets) {
            return { code: 2017, data: null, msg: `Preset '${presetId}' not found` };
        }

        return {
            code: 0,
            data: { presetId, presets: loadedPresets },
            msg: `Preset '${presetId}' loaded successfully`
        };
    } catch (err) {
        console.error('[adminService.managePresets]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- GET /api/admin/presets ----------
function listPresets() {
    try {
        const db = readDB();
        const presetsLibrary = db.presetsLibrary || {};

        const presetList = Object.keys(presetsLibrary).map(key => ({
            presetId: key,
            displayName: presetsLibrary[key].displayName || key
        }));

        return {
            code: 0,
            data: { presets: presetList },
            msg: 'Presets retrieved successfully'
        };
    } catch (err) {
        console.error('[adminService.listPresets]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

module.exports = {
    createRoom,
    uploadQuestions,
    managePresets,
    listPresets
};