// controllers/gameController.js
const { readDB, writeDB, generateId } = require('../services/dbService');
const gameLogic = require('../services/gameLogic');
const socketService = require('../services/socketService');

// 颜色池（25种，来自 SRS 9.3）
const COLOR_PALETTE = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
    '#00FFFF', '#FF8800', '#8800FF', '#00FF88', '#FF0088',
    '#88FF00', '#0088FF', '#FF4444', '#44FF44', '#4444FF',
    '#FFFF44', '#FF44FF', '#44FFFF', '#FFAA44', '#44FFAA',
    '#AA44FF', '#FF44AA', '#44AAFF', '#AAFF44', '#8844AA'
];

// 获取下一个可用的颜色
function getNextColor(players) {
    const usedColors = players.map(p => p.tokenColor);
    return COLOR_PALETTE.find(c => !usedColors.includes(c)) || '#888888';
}

// 生成对外广播用的玩家列表（按当前位置排序，供排行榜使用）
function getPublicPlayerList(session) {
    return [...session.players]
        .sort((a, b) => b.currentTile - a.currentTile)
        .map(p => ({
            playerId: p.playerId,
            username: p.username,
            currentTile: p.currentTile,
            tokenColor: p.tokenColor,
            turnStatus: p.turnStatus
        }));
}

// ---------- 通用：保存 session 并返回响应 ----------
function saveSessionAndRespond(req, res, playerId, sessionId, responseData, successMsg) {
    // 手动设置 Session 数据
    req.session.playerId = playerId;
    req.session.sessionId = sessionId;

    // 保存 Session
    req.session.save((err) => {
        if (err) {
            console.error('[Session Save Error]', err);
            return res.json({ code: 5000, data: null, msg: 'Failed to establish session' });
        }
        return res.json({ code: 0, data: responseData, msg: successMsg });
    });
}

// ---------- POST /api/game/create ----------
function create(req, res) {
    try {
        let { username } = req.body;

        // 1. 验证用户名
        if (username?.trim() === '') {
            // 空字符串 或 全是空格，都报错
            return res.json({
                code: 1001,
                data: null,
                msg: 'Username cannot be empty'
            });
        }

        const finalUsername = username?.trim() || `Player_${generateId().slice(0, 4)}`;

        // 2. 生成 ID
        const sessionId = generateId();   // 房间号
        const playerId = 'p' + generateId(); // 玩家ID

        // 3. 读取数据库
        const db = readDB();

        // 4. 检查 sessionId 是否冲突（极小概率，但安全起见）
        if (db.sessions[sessionId]) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Session ID collision, please try again'
            });
        }

        // 5. 创建新会话
        db.sessions[sessionId] = {
            sessionId: sessionId,
            ownerId: playerId,
            gameStatus: 'waiting',
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            winnerId: null,
            maxPlayers: 25,
            usedQuestionIds: [],
            players: [
                {
                    playerId: playerId,
                    username: finalUsername,
                    currentTile: 0,
                    tokenColor: getNextColor([]),
                    turnStatus: 'active',
                    inventory: []
                }
            ]
        };

        // 6. 写回数据库
        writeDB(db);

        // 7. 准备响应数据
        const responseData = {
            sessionId: sessionId,
            playerId: playerId,
            tokenColor: db.sessions[sessionId].players[0].tokenColor,
            maxPlayers: 25,
            gameStatus: 'waiting'
        };
        // 8. 保存 Session 并返回
        return saveSessionAndRespond(req, res, playerId, sessionId, responseData, 'success');

    } catch (error) {
        console.error('[Create Session Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/game/join ----------
function join(req, res) {
    try {
        const { sessionId, username, playerId } = req.body;

        // ---------- 场景1：重连（带 playerId） ----------
        if (playerId) {
            // 1.1 查找会话
            const db = readDB();
            const session = db.sessions[sessionId];
            if (!session) {
                return res.json({
                    code: 2003,
                    data: null,
                    msg: 'Session not found'
                });
            }

            // 1.2 查找玩家
            const player = session.players.find(p => p.playerId === playerId);
            if (!player) {
                return res.json({
                    code: 2004,
                    data: null,
                    msg: 'Player not found in this session'
                });
            }

            // 1.3 恢复连接状态
            player.turnStatus = 'active';
            writeDB(db);

            socketService.broadcastGameEvent(sessionId, 'player_reconnected', {
                playerId,
                activePlayers: getPublicPlayerList(session)
            });

            // 1.4 准备响应数据
            const responseData = {
                sessionId: sessionId,
                playerId: playerId,
                tokenColor: player.tokenColor,
                currentTile: player.currentTile,
                gameStatus: session.gameStatus
            };

            // 1.5 恢复 Session 并返回
            return saveSessionAndRespond(req, res, playerId, sessionId, responseData, 'Reconnected successfully');
        }

        // ---------- 场景2：新玩家加入 ----------
        // 2.1 验证用户名
        if (!username || username.trim() === '') {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Username is required'
            });
        }
        const finalUsername = username.trim();

        // 2.2 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 2.3 检查游戏状态（已开始或已结束不能加入）
        if (session.gameStatus !== 'waiting') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game already in progress or completed'
            });
        }

        // 2.4 检查容量
        if (session.players.length >= session.maxPlayers) {
            return res.json({
                code: 2001,
                data: null,
                msg: 'Session is full'
            });
        }

        // 2.5 检查用户名是否已被使用（同一房间内唯一）
        if (session.players.some(p => p.username === finalUsername)) {
            return res.json({
                code: 2002,
                data: null,
                msg: 'Username already taken in this session'
            });
        }

        // 2.6 生成新玩家
        const newPlayerId = 'p' + generateId();
        const newPlayer = {
            playerId: newPlayerId,
            username: finalUsername,
            currentTile: 0,
            tokenColor: getNextColor(session.players),
            turnStatus: 'active',
            inventory: []
        };

        session.players.push(newPlayer);
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'player_joined', {
            playerId: newPlayerId,
            activePlayers: getPublicPlayerList(session)
        });

        // 2.7 准备响应数据
        const responseData = {
            sessionId: sessionId,
            playerId: newPlayerId,
            tokenColor: newPlayer.tokenColor
        };

        // 2.8 保存 Session 并返回
        return saveSessionAndRespond(req, res, newPlayerId, sessionId, responseData, 'Joined successfully');

    } catch (error) {
        console.error('[Join Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- GET /api/game/state/:sessionId ----------
function getState(req, res) {
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

        // 3. 按 currentTile 降序排列玩家（用于排行榜展示）
        const sortedPlayers = [...session.players].sort((a, b) => b.currentTile - a.currentTile);

        // 4. 构建响应数据（只返回必要的公开信息）
        const responseData = {
            sessionId: session.sessionId,
            gameStatus: session.gameStatus,
            winnerId: session.winnerId || null,
            startedAt: session.startedAt || null,
            completedAt: session.completedAt || null,
            activePlayers: sortedPlayers.map(p => ({
                playerId: p.playerId,
                username: p.username,
                currentTile: p.currentTile,
                tokenColor: p.tokenColor
            }))
        };

        return res.json({
            code: 0,
            data: responseData,
            msg: 'success'
        });

    } catch (error) {
        console.error('[Get State Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/game/start ----------
function start(req, res) {
    try {
        const playerId = req.session.playerId;
        const sessionId = req.session.sessionId;

        // 1. 验证身份
        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        // 2. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 3. 校验房主权限
        if (session.ownerId !== playerId) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Only the session owner can start the game'
            });
        }

        // 4. 校验游戏状态
        if (session.gameStatus !== 'waiting') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game already in progress or completed'
            });
        }

        // 5. 校验玩家数量（至少 2 名活跃玩家）
        const activePlayers = session.players.filter(p => p.turnStatus === 'active');
        if (activePlayers.length < 2) {
            return res.json({
                code: 2018,
                data: null,
                msg: 'At least 2 active players required to start the game'
            });
        }

        // 6. 更新游戏状态
        session.gameStatus = 'InProgress';
        session.startedAt = new Date().toISOString();
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'game_started', {
            sessionId,
            gameStatus: 'InProgress',
            startedAt: session.startedAt
        });
        socketService.startSessionTimers(sessionId);

        // 7. 返回响应
        return res.json({
            code: 0,
            data: {
                sessionId: sessionId,
                gameStatus: 'InProgress',
                startedAt: session.startedAt
            },
            msg: 'Game started successfully'
        });

    } catch (error) {
        console.error('[Start Game Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/game/move ----------
function move(req, res) {
    try {
        const playerId = req.session.playerId;
        const sessionId = req.session.sessionId;
        const { targetTile } = req.body;

        // 1. 验证身份
        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        // 2. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 3. 检查游戏状态
        if (session.gameStatus !== 'InProgress') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game is not in progress'
            });
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not found'
            });
        }

        // ---------- 模式2：答题后移动（带 targetTile） ----------
        if (targetTile !== undefined) {
            // 4. 校验 targetTile 范围
            if (typeof targetTile !== 'number' || targetTile < 1 || targetTile > 100) {
                return res.json({
                    code: 2006,
                    data: null,
                    msg: 'Invalid target tile'
                });
            }

            // 5. 更新玩家位置
            player.currentTile = targetTile;

            // 6. 检查胜利
            let gameStatus = session.gameStatus;
            let winnerId = session.winnerId;
            if (targetTile === 100) {
                gameStatus = 'Completed';
                winnerId = playerId;
                session.gameStatus = gameStatus;
                session.winnerId = winnerId;
                session.completedAt = new Date().toISOString();
            }

            // 7. 写库
            writeDB(db);

            socketService.broadcastGameEvent(sessionId, 'move_update', {
                playerId,
                currentTile: targetTile,
                activePlayers: getPublicPlayerList(session)
            });
            if (gameStatus === 'Completed') {
                socketService.broadcastGameEvent(sessionId, 'game_over', {
                    winnerId,
                    activePlayers: getPublicPlayerList(session)
                });
                socketService.stopSessionTimers(sessionId);
            }

            // 8. 返回响应
            return res.json({
                code: 0,
                data: {
                    currentTile: targetTile,
                    needsQuiz: false,
                    gameStatus: gameStatus,
                    winnerId: winnerId,
                    itemGranted: null,
                    inventory: player.inventory || []
                },
                msg: 'success'
            });
        }

        // ---------- 模式1：掷骰子 ----------
        // 4. 掷骰子
        const diceValue = gameLogic.generateDiceValue();
        const landingTile = gameLogic.calculateLandingTile(player.currentTile, diceValue);

        // 5. 处理超出棋盘
        if (landingTile > 100) {
            // 超出终点，位置不变
            return res.json({
                code: 0,
                data: {
                    currentTile: player.currentTile,
                    needsQuiz: false,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue: diceValue
                },
                msg: 'Rolled past 100, stay in place'
            });
        }

        // 6. 检查落点类型
        const tileType = gameLogic.getTileType(landingTile);
        const isFlashing = gameLogic.isFlashingTile(landingTile);

        // 7. 更新玩家位置（先移动到落点）
        player.currentTile = landingTile;
        if (landingTile === 100) {
            session.gameStatus = 'Completed';
            session.winnerId = playerId;
            session.completedAt = new Date().toISOString();
            writeDB(db);
            socketService.broadcastGameEvent(sessionId, 'game_over', {
                winnerId: playerId,
                activePlayers: getPublicPlayerList(session)
            });
            socketService.stopSessionTimers(sessionId);
            return res.json({
                code: 0,
                data: {
                    currentTile: 100,
                    needsQuiz: false,
                    gameStatus: 'Completed',
                    winnerId: playerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue: diceValue
                },
                msg: '🎉 Player reached tile 100 and won the game!'
            });
        }

        // 8. 处理蛇梯（需要答题）
        if (tileType === 'ladder' || tileType === 'snake') {
            // 写入数据库（位置已更新到蛇/梯起点）
            writeDB(db);

            socketService.broadcastGameEvent(sessionId, 'move_update', {
                playerId,
                currentTile: landingTile,
                activePlayers: getPublicPlayerList(session)
            });

            return res.json({
                code: 0,
                data: {
                    currentTile: landingTile,
                    needsQuiz: true,         // 前端弹出答题
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue: diceValue
                },
                msg: `Landed on ${tileType} tile, please answer quiz`
            });
        }

        // 9. 处理闪光格
        let itemGranted = null;
        let needsQuiz = false;
        let finalTile = landingTile;

        if (isFlashing) {
            const effect = gameLogic.getFlashingTileEffect(landingTile, session.presets);
            if (effect.type === 'item') {
                itemGranted = effect.item;
                // 写入 inventory
                if (!player.inventory) player.inventory = [];
                if (player.inventory.length < 3) {
                    player.inventory.push(itemGranted);
                }
            } else if (effect.type === 'penalty') {
                finalTile = Math.max(1, landingTile - effect.steps);
                player.currentTile = finalTile;
                writeDB(db);
                socketService.broadcastGameEvent(sessionId, 'move_update', {
                    playerId,
                    currentTile: finalTile,
                    activePlayers: getPublicPlayerList(session)
                });
                return res.json({
                    code: 0,
                    data: {
                        currentTile: finalTile,
                        needsQuiz: false,
                        gameStatus: session.gameStatus,
                        winnerId: session.winnerId,
                        itemGranted: null,
                        inventory: player.inventory || [],
                        diceValue: diceValue
                    },
                    msg: `Landed on red flashing tile, moved back ${effect.steps} tiles`
                });
            }
            // effect.type === 'nothing' → 无效果，继续正常流程
        }

        // 10. 写库
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'move_update', {
            playerId,
            currentTile: landingTile,
            activePlayers: getPublicPlayerList(session)
        });

        // 11. 返回响应
        return res.json({
            code: 0,
            data: {
                currentTile: landingTile,
                needsQuiz: false,
                gameStatus: session.gameStatus,
                winnerId: session.winnerId,
                itemGranted: itemGranted,
                inventory: player.inventory || [],
                diceValue: diceValue
            },
            msg: isFlashing ? 'Landed on flashing tile' : 'success'
        });

    } catch (error) {
        console.error('[Move Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}
// ---------- POST /api/game/item/use ----------
function useItem(req, res) {
    try {
        const playerId = req.session.playerId;
        const sessionId = req.session.sessionId;
        const { itemType, targetPlayerId } = req.body;

        // 1. 验证身份
        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        // 2. 验证 itemType
        if (!itemType || !['rocket', 'bomb'].includes(itemType)) {
            return res.json({
                code: 1003,
                data: null,
                msg: 'Invalid item type, must be rocket or bomb'
            });
        }

        // 3. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 4. 检查游戏状态
        if (session.gameStatus !== 'InProgress') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game is not in progress'
            });
        }

        // 5. 查找玩家
        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not found'
            });
        }

        // 6. 检查道具是否存在
        if (!player.inventory || !player.inventory.includes(itemType)) {
            return res.json({
                code: 2011,
                data: null,
                msg: 'Item not found in inventory'
            });
        }

        // 7. 从预设获取道具步数
        const steps = gameLogic.getItemSteps(itemType, session.presets);
        if (steps === null) {
            return res.json({
                code: 2011,
                data: null,
                msg: `Item '${itemType}' is not enabled`
            });
        }

        // 8. 如果是炸弹，验证目标
        let targetPlayer = null;
        if (itemType === 'bomb') {
            if (!targetPlayerId) {
                return res.json({
                    code: 1001,
                    data: null,
                    msg: 'Missing targetPlayerId for bomb'
                });
            }
            if (targetPlayerId === playerId) {
                return res.json({
                    code: 2012,
                    data: null,
                    msg: 'Cannot bomb yourself'
                });
            }
            targetPlayer = session.players.find(p => p.playerId === targetPlayerId);
            if (!targetPlayer) {
                return res.json({
                    code: 2012,
                    data: null,
                    msg: 'Target player not found'
                });
            }
        }

        // 9. 应用效果
        let sourceNewTile = player.currentTile;
        let targetNewTile = null;

        if (itemType === 'rocket') {
            sourceNewTile = Math.min(100, player.currentTile + steps);
            player.currentTile = sourceNewTile;
        } else if (itemType === 'bomb') {
            targetNewTile = Math.max(1, targetPlayer.currentTile - steps);
            targetPlayer.currentTile = targetNewTile;
        }

        // 10. 从库存移除道具
        const index = player.inventory.indexOf(itemType);
        if (index !== -1) {
            player.inventory.splice(index, 1);
        }

        // 11. 检查是否有人到达终点（火箭可能触发胜利）
        let gameStatus = session.gameStatus;
        let winnerId = session.winnerId;
        if (itemType === 'rocket' && sourceNewTile === 100) {
            gameStatus = 'Completed';
            winnerId = playerId;
            session.gameStatus = gameStatus;
            session.winnerId = winnerId;
            session.completedAt = new Date().toISOString();
        }

        // 12. 写库
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'item_used', {
            itemType,
            sourcePlayerId: playerId,
            targetPlayerId: targetPlayerId || null,
            activePlayers: getPublicPlayerList(session)
        });
        if (gameStatus === 'Completed') {
            socketService.broadcastGameEvent(sessionId, 'game_over', {
                winnerId,
                activePlayers: getPublicPlayerList(session)
            });
            socketService.stopSessionTimers(sessionId);
        }

        // 13. 构造响应
        let responseData = {
            effect: itemType === 'rocket' ? 'self_forward' : 'target_backward',
            movedBy: steps,
            inventory: player.inventory
        };

        if (itemType === 'rocket') {
            responseData.sourcePlayerId = playerId;
            responseData.sourceNewTile = sourceNewTile;
        } else if (itemType === 'bomb') {
            responseData.sourcePlayerId = playerId;
            responseData.targetPlayerId = targetPlayerId;
            responseData.targetNewTile = targetNewTile;
        }

        const msg = itemType === 'rocket'
            ? `Rocket used, moved forward ${steps} tiles`
            : `Bomb used, target moved backward ${steps} tiles`;

        return res.json({
            code: 0,
            data: responseData,
            msg: msg
        });

    } catch (error) {
        console.error('[Use Item Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

// ---------- POST /api/game/player/disconnect ----------
function disconnect(req, res) {
    try {
        const { sessionId, playerId } = req.body;

        // 1. 验证必要字段
        if (!sessionId || !playerId) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: sessionId or playerId'
            });
        }

        // 2. 读取数据库
        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        // 3. 查找玩家
        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not found'
            });
        }

        // 4. 如果已经是 inactive，直接返回成功（幂等）
        if (player.turnStatus === 'inactive') {
            return res.json({
                code: 0,
                data: {
                    playerId: playerId,
                    turnStatus: 'inactive'
                },
                msg: 'Player already marked as inactive'
            });
        }

        // 5. 标记为 inactive
        player.turnStatus = 'inactive';
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'player_disconnected', {
            playerId,
            activePlayers: getPublicPlayerList(session)
        });

        // 6. 返回响应
        return res.json({
            code: 0,
            data: {
                playerId: playerId,
                turnStatus: 'inactive'
            },
            msg: 'Player marked as inactive'
        });

    } catch (error) {
        console.error('[Disconnect Error]', error);
        return res.json({
            code: 5000,
            data: null,
            msg: 'Internal server error'
        });
    }
}

module.exports = {
    create,
    join,
    getState,
    start,
    move,
    useItem,
    disconnect
};