// controllers/gameController.js
const { readDB, writeDB, generateId } = require('../services/dbService');
const gameLogic = require('../services/gameLogic');
const bonusController = require('../controllers/bonusController');
const socketService = require('../services/socketService');
const { buildPublicPlayerList, applyPlayerFinish, checkTileBonusTrigger } = require('../services/playerHelpers');

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


// ---------- 通用：保存 session 并返回响应 ----------
function saveSessionAndRespond(req, res, playerId, sessionId, responseData, successMsg) {
    req.session.playerId = playerId;
    req.session.sessionId = sessionId;

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

        if (username?.trim() === '') {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Username cannot be empty'
            });
        }

        const finalUsername = username?.trim() || `Player_${generateId().slice(0, 4)}`;

        const sessionId = generateId();
        const playerId = 'p' + generateId();

        const db = readDB();

        if (db.sessions[sessionId]) {
            return res.json({
                code: 5000,
                data: null,
                msg: 'Session ID collision, please try again'
            });
        }

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
            triggeredBonusTiles: [],
            players: [
                {
                    playerId: playerId,
                    username: finalUsername,
                    currentTile: 0,
                    tokenColor: getNextColor([]),
                    turnStatus: 'active',
                    inventory: [],
                    completedAt: null
                }
            ]
        };

        writeDB(db);

        const responseData = {
            sessionId: sessionId,
            playerId: playerId,
            tokenColor: db.sessions[sessionId].players[0].tokenColor,
            maxPlayers: 25,
            gameStatus: 'waiting'
        };
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

        if (playerId) {
            const db = readDB();
            const session = db.sessions[sessionId];
            if (!session) {
                return res.json({
                    code: 2003,
                    data: null,
                    msg: 'Session not found'
                });
            }

            const player = session.players.find(p => p.playerId === playerId);
            if (!player) {
                return res.json({
                    code: 2004,
                    data: null,
                    msg: 'Player not found in this session'
                });
            }

            player.turnStatus = 'active';
            writeDB(db);

            socketService.broadcastGameEvent(sessionId, 'player_reconnected', {
                playerId,
                activePlayers: buildPublicPlayerList(session)
            });

            const responseData = {
                sessionId: sessionId,
                playerId: playerId,
                tokenColor: player.tokenColor,
                currentTile: player.currentTile,
                gameStatus: session.gameStatus
            };

            return saveSessionAndRespond(req, res, playerId, sessionId, responseData, 'Reconnected successfully');
        }

        if (!username || username.trim() === '') {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Username is required'
            });
        }
        const finalUsername = username.trim();

        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        if (session.gameStatus !== 'waiting') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game already in progress or completed'
            });
        }

        if (session.players.length >= session.maxPlayers) {
            return res.json({
                code: 2001,
                data: null,
                msg: 'Session is full'
            });
        }

        if (session.players.some(p => p.username === finalUsername)) {
            return res.json({
                code: 2002,
                data: null,
                msg: 'Username already taken in this session'
            });
        }

        const newPlayerId = 'p' + generateId();
        const newPlayer = {
            playerId: newPlayerId,
            username: finalUsername,
            currentTile: 0,
            tokenColor: getNextColor(session.players),
            turnStatus: 'active',
            inventory: [],
            completedAt: null
        };

        session.players.push(newPlayer);
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'player_joined', {
            playerId: newPlayerId,
            activePlayers: buildPublicPlayerList(session)
        });

        const responseData = {
            sessionId: sessionId,
            playerId: newPlayerId,
            tokenColor: newPlayer.tokenColor
        };

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

        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        const responseData = {
            sessionId: session.sessionId,
            gameStatus: session.gameStatus,
            winnerId: session.winnerId || null,
            startedAt: session.startedAt || null,
            completedAt: session.completedAt || null,
            activePlayers: buildPublicPlayerList(session),
            leaderboardDisplayCount: session.presets?.leaderboardDisplayCount || 5
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

        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

        if (session.ownerId !== playerId) {
            return res.json({
                code: 2009,
                data: null,
                msg: 'Only the session owner can start the game'
            });
        }

        if (session.gameStatus !== 'waiting') {
            return res.json({
                code: 2008,
                data: null,
                msg: 'Game already in progress or completed'
            });
        }

        const activePlayers = session.players.filter(p => p.turnStatus === 'active');
        if (activePlayers.length < 2) {
            return res.json({
                code: 2018,
                data: null,
                msg: 'At least 2 active players required to start the game'
            });
        }

        session.gameStatus = 'InProgress';
        session.startedAt = new Date().toISOString();
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'game_started', {
            sessionId,
            gameStatus: 'InProgress',
            startedAt: session.startedAt
        });
        socketService.startSessionTimers(sessionId);

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
        const playerId = req.session.playerId || req.body.playerId;
        const sessionId = req.session.sessionId || req.body.sessionId;
        const { targetTile } = req.body;

        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

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

        if (player.completedAt) {
            return res.json({
                code: 2020,
                data: null,
                msg: 'Player already finished the game'
            });
        }

        // ---------- 模式2：答题后移动（带 targetTile） ----------
        if (targetTile !== undefined) {
            if (typeof targetTile !== 'number' || targetTile < 1 || targetTile > 100) {
                return res.json({
                    code: 2006,
                    data: null,
                    msg: 'Invalid target tile'
                });
            }

            player.currentTile = targetTile;

            if (targetTile === 100) {
                const result = applyPlayerFinish(session, player);
                writeDB(db);
                if (result.gameStatus === 'Completed') {
                    socketService.broadcastGameEvent(sessionId, 'game_over', {
                        winnerId: result.winnerId,
                        activePlayers: buildPublicPlayerList(session)
                    });
                    socketService.stopSessionTimers(sessionId);
                } else {
                    socketService.broadcastGameEvent(sessionId, 'move_update', {
                        playerId,
                        currentTile: 100,
                        activePlayers: buildPublicPlayerList(session)
                    });
                }
                return res.json({
                    code: 0,
                    data: {
                        currentTile: 100,
                        needsQuiz: false,
                        gameStatus: result.gameStatus,
                        winnerId: result.winnerId,
                        itemGranted: null,
                        inventory: player.inventory || []
                    },
                    msg: result.gameStatus === 'Completed' ? '🎉 Game over!' : 'Player reached 100!'
                });
            }

            checkTileBonusTrigger(session, player, sessionId, socketService, bonusController);
            writeDB(db);
            socketService.broadcastGameEvent(sessionId, 'move_update', {
                playerId,
                currentTile: targetTile,
                activePlayers: buildPublicPlayerList(session)
            });

            return res.json({
                code: 0,
                data: {
                    currentTile: targetTile,
                    needsQuiz: false,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || []
                },
                msg: 'success'
            });
        }

        // ---------- 模式1：掷骰子 ----------
        const diceValue = gameLogic.generateDiceValue();
        const landingTile = gameLogic.calculateLandingTile(player.currentTile, diceValue);

        if (landingTile > 100) {
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

        const tileType = gameLogic.getTileType(landingTile);
        const isFlashing = gameLogic.isFlashingTile(landingTile);

        player.currentTile = landingTile;

        if (landingTile === 100) {
            const result = applyPlayerFinish(session, player);
            writeDB(db);
            if (result.gameStatus === 'Completed') {
                socketService.broadcastGameEvent(sessionId, 'game_over', {
                    winnerId: result.winnerId,
                    activePlayers: buildPublicPlayerList(session)
                });
                socketService.stopSessionTimers(sessionId);
            } else {
                socketService.broadcastGameEvent(sessionId, 'move_update', {
                    playerId,
                    currentTile: 100,
                    activePlayers: buildPublicPlayerList(session)
                });
            }
            return res.json({
                code: 0,
                data: {
                    currentTile: 100,
                    needsQuiz: false,
                    gameStatus: result.gameStatus,
                    winnerId: result.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue: diceValue
                },
                msg: result.gameStatus === 'Completed' ? '🎉 Game over!' : 'Player reached 100!'
            });
        }

        if (tileType === 'ladder' || tileType === 'snake') {
            writeDB(db);
            socketService.broadcastGameEvent(sessionId, 'move_update', {
                playerId,
                currentTile: landingTile,
                activePlayers: buildPublicPlayerList(session)
            });

            return res.json({
                code: 0,
                data: {
                    currentTile: landingTile,
                    needsQuiz: true,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue: diceValue
                },
                msg: `Landed on ${tileType} tile, please answer quiz`
            });
        }

        let itemGranted = null;
        let finalTile = landingTile;

        if (isFlashing) {
            const effect = gameLogic.getFlashingTileEffect(landingTile, session.presets);
            if (effect.type === 'item') {
                itemGranted = effect.item;
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
                    activePlayers: buildPublicPlayerList(session)
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
        }

        checkTileBonusTrigger(session, player, sessionId, socketService, bonusController);
        writeDB(db);
        socketService.broadcastGameEvent(sessionId, 'move_update', {
            playerId,
            currentTile: landingTile,
            activePlayers: buildPublicPlayerList(session)
        });

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
        const playerId = req.session.playerId || req.body.playerId;
        const sessionId = req.session.sessionId || req.body.sessionId;
        const { itemType, targetPlayerId } = req.body;

        if (!playerId || !sessionId) {
            return res.json({
                code: 2004,
                data: null,
                msg: 'Player not in a session'
            });
        }

        // [MODIFIED] 允许 arrow
        if (!itemType || !['rocket', 'bomb', 'arrow'].includes(itemType)) {
            return res.json({
                code: 1003,
                data: null,
                msg: 'Invalid item type, must be rocket, bomb, or arrow'
            });
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
            });
        }

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

        if (player.completedAt) {
            return res.json({
                code: 2020,
                data: null,
                msg: 'Player already finished the game'
            });
        }

        if (!player.inventory || !player.inventory.includes(itemType)) {
            return res.json({
                code: 2011,
                data: null,
                msg: 'Item not found in inventory'
            });
        }

        const steps = gameLogic.getItemSteps(itemType, session.presets);
        if (steps === null) {
            return res.json({
                code: 2011,
                data: null,
                msg: `Item '${itemType}' is not enabled`
            });
        }

        let targetPlayer = null;
        // [MODIFIED] 炸弹和箭都需要指定目标
        if (itemType === 'bomb' || itemType === 'arrow') {
            if (!targetPlayerId) {
                return res.json({
                    code: 1001,
                    data: null,
                    msg: 'Missing targetPlayerId for this item'
                });
            }
            if (targetPlayerId === playerId) {
                return res.json({
                    code: 2012,
                    data: null,
                    msg: 'Cannot target yourself'
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
            if (targetPlayer.completedAt) {
                return res.json({
                    code: 2012,
                    data: null,
                    msg: 'Target player has already finished'
                });
            }
        }

        let sourceNewTile = player.currentTile;
        let targetNewTile = null;

        if (itemType === 'rocket') {
            sourceNewTile = Math.min(100, player.currentTile + steps);
            player.currentTile = sourceNewTile;
        } else if (itemType === 'bomb' || itemType === 'arrow') {
            // [MODIFIED] 炸弹和箭都后退
            targetNewTile = Math.max(1, targetPlayer.currentTile - steps);
            targetPlayer.currentTile = targetNewTile;
        }

        // 从库存移除道具（所有类型通用）
        const index = player.inventory.indexOf(itemType);
        if (index !== -1) {
            player.inventory.splice(index, 1);
        }

        // 火箭到达100的胜利判定
        if (itemType === 'rocket' && sourceNewTile === 100) {
            const result = applyPlayerFinish(session, player);
            writeDB(db);
            if (result.gameStatus === 'Completed') {
                socketService.broadcastGameEvent(sessionId, 'game_over', {
                    winnerId: result.winnerId,
                    activePlayers: buildPublicPlayerList(session)
                });
                socketService.stopSessionTimers(sessionId);
            } else {
                socketService.broadcastGameEvent(sessionId, 'move_update', {
                    playerId,
                    currentTile: 100,
                    activePlayers: buildPublicPlayerList(session)
                });
            }
            return res.json({
                code: 0,
                data: {
                    effect: 'self_forward',
                    movedBy: steps,
                    inventory: player.inventory,
                    sourcePlayerId: playerId,
                    sourceNewTile: 100,
                    gameStatus: result.gameStatus,
                    winnerId: result.winnerId
                },
                msg: result.gameStatus === 'Completed' ? '🎉 Rocket reached 100, game over!' : 'Rocket used, reached 100!'
            });
        }

        // 检查是否触发10倍数奖励（仅火箭主动移动触发，炸弹/箭不触发）
        if (itemType === 'rocket') {
            checkTileBonusTrigger(session, player, sessionId, socketService, bonusController);
        }

        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'item_used', {
            itemType,
            sourcePlayerId: playerId,
            targetPlayerId: targetPlayerId || null,
            activePlayers: buildPublicPlayerList(session)
        });

        let responseData = {
            effect: itemType === 'rocket' ? 'self_forward' : 'target_backward',
            movedBy: steps,
            inventory: player.inventory
        };

        if (itemType === 'rocket') {
            responseData.sourcePlayerId = playerId;
            responseData.sourceNewTile = sourceNewTile;
        } else if (itemType === 'bomb' || itemType === 'arrow') {
            responseData.sourcePlayerId = playerId;
            responseData.targetPlayerId = targetPlayerId;
            responseData.targetNewTile = targetNewTile;
        }

        const msg = itemType === 'rocket'
            ? `Rocket used, moved forward ${steps} tiles`
            : `${itemType === 'bomb' ? 'Bomb' : 'Arrow'} used, target moved backward ${steps} tiles`;

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

        if (!sessionId || !playerId) {
            return res.json({
                code: 1001,
                data: null,
                msg: 'Missing required field: sessionId or playerId'
            });
        }

        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return res.json({
                code: 2003,
                data: null,
                msg: 'Session not found'
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

        player.turnStatus = 'inactive';
        writeDB(db);

        socketService.broadcastGameEvent(sessionId, 'player_disconnected', {
            playerId,
            activePlayers: buildPublicPlayerList(session)
        });

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