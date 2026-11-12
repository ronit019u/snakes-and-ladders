// services/gameService.js
const { readDB, writeDB, generateId, generateRoomId } = require('./dbService');
const gameLogic = require('./gameLogic');
const { buildPublicPlayerList, applyPlayerFinish } = require('./playerHelpers');
const { CHARACTERS, getCharacter, getNextCharacterId } = require('./characters');

// 颜色池（25种，来自 SRS 9.3）
const COLOR_PALETTE = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
    '#00FFFF', '#FF8800', '#8800FF', '#00FF88', '#FF0088',
    '#88FF00', '#0088FF', '#FF4444', '#44FF44', '#4444FF',
    '#FFFF44', '#FF44FF', '#44FFFF', '#FFAA44', '#44FFAA',
    '#AA44FF', '#FF44AA', '#44AAFF', '#AAFF44', '#8844AA'
];

function getNextColor(players) {
    const usedColors = players.map(p => p.tokenColor);
    return COLOR_PALETTE.find(c => !usedColors.includes(c)) || '#888888';
}

// 取一道本局未使用的题（可排除指定题目），只改内存，不写库
function pickPrerollQuestion(db, session, excludeQuestionId) {
    if (!session.usedQuestionIds) session.usedQuestionIds = [];

    const usedIds = session.usedQuestionIds;
    const available = db.questions.filter(q =>
        !usedIds.includes(q.questionId) && q.questionId !== excludeQuestionId
    );
    if (available.length === 0) return null;

    const selected = available[Math.floor(Math.random() * available.length)];
    usedIds.push(selected.questionId);
    return selected;
}

// ---------- POST /api/game/create ----------
function createSession(username) {
    try {
        if (username?.trim() === '') {
            return { code: 1001, data: null, msg: 'Username cannot be empty' };
        }

        const finalUsername = username?.trim() || `Player_${generateId().slice(0, 4)}`;
        const playerId = 'p' + generateId();

        const db = readDB();
        const sessionId = generateRoomId(db);
        if (db.sessions[sessionId]) {
            return { code: 5000, data: null, msg: 'Session ID collision, please try again' };
        }

        db.sessions[sessionId] = {
            sessionId,
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
                    playerId,
                    username: finalUsername,
                    currentTile: 0,
                    tokenColor: getNextColor([]),
                    characterId: getNextCharacterId([]),
                    turnStatus: 'active',
                    inventory: [],
                    completedAt: null
                }
            ]
        };

        writeDB(db);

        return {
            code: 0,
            data: {
                sessionId,
                playerId,
                tokenColor: db.sessions[sessionId].players[0].tokenColor,
                characterId: db.sessions[sessionId].players[0].characterId,
                maxPlayers: 25,
                gameStatus: 'waiting'
            },
            msg: 'success'
        };
    } catch (err) {
        console.error('[gameService.createSession]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/game/join / reconnect ----------
function joinSession({ sessionId, username, playerId }) {
    try {
        // 重连
        if (playerId) {
            const db = readDB();
            const session = db.sessions[sessionId];
            if (!session) {
                return { code: 2003, data: null, msg: 'Session not found' };
            }

            const player = session.players.find(p => p.playerId === playerId);
            if (!player) {
                return { code: 2004, data: null, msg: 'Player not found in this session' };
            }

            player.turnStatus = 'active';
            writeDB(db);

            return {
                code: 0,
                data: {
                    sessionId,
                    playerId,
                    tokenColor: player.tokenColor,
                    characterId: player.characterId,
                    currentTile: player.currentTile,
                    gameStatus: session.gameStatus
                },
                msg: 'Reconnected successfully',
                events: [
                    {
                        event: 'player_reconnected',
                        data: { playerId, activePlayers: buildPublicPlayerList(session) }
                    }
                ]
            };
        }

        // 新玩家加入
        if (!username || username.trim() === '') {
            return { code: 1001, data: null, msg: 'Username is required' };
        }
        const finalUsername = username.trim();

        const db = readDB();
        const session = db.sessions[sessionId];

        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }
        if (session.gameStatus !== 'waiting') {
            return { code: 2008, data: null, msg: 'Game already in progress or completed' };
        }
        if (session.players.length >= session.maxPlayers) {
            return { code: 2001, data: null, msg: 'Session is full' };
        }
        if (session.players.some(p => p.username === finalUsername)) {
            return { code: 2002, data: null, msg: 'Username already taken in this session' };
        }

        const newPlayerId = 'p' + generateId();
        const newPlayer = {
            playerId: newPlayerId,
            username: finalUsername,
            currentTile: 0,
            tokenColor: getNextColor(session.players),
            characterId: getNextCharacterId(session.players),
            turnStatus: 'active',
            inventory: [],
            completedAt: null
        };

        session.players.push(newPlayer);
        writeDB(db);

        return {
            code: 0,
            data: {
                sessionId,
                playerId: newPlayerId,
                tokenColor: newPlayer.tokenColor,
                characterId: newPlayer.characterId
            },
            msg: 'Joined successfully',
            events: [
                {
                    event: 'player_joined',
                    data: { playerId: newPlayerId, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[gameService.joinSession]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- GET /api/game/state/:sessionId ----------
function getSessionState(sessionId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        const preset = gameLogic.getPreset(session.presets);

        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }

        return {
            code: 0,
            data: {
                sessionId: session.sessionId,
                gameStatus: session.gameStatus,
                winnerId: session.winnerId || null,
                startedAt: session.startedAt || null,
                completedAt: session.completedAt || null,
                activePlayers: buildPublicPlayerList(session),
                characters: CHARACTERS,
                leaderboardDisplayCount: session.presets?.leaderboardDisplayCount || 5,
                presets: {
                    maxPlayers: preset.maxPlayers,
                    diceMax: preset.diceMax,
                    quizTimeout: preset.quizTimeout,
                    bonusTimeout: preset.bonusTimeout,
                    leaderboardDisplayCount: preset.leaderboardDisplayCount,
                    flashingTile: preset.flashingTile,
                    earthquake: preset.earthquake,
                    bonus: preset.bonus,
                    items: preset.items
                },
            },
            msg: 'success'
        };
    } catch (err) {
        console.error('[gameService.getSessionState]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/game/character ----------
function selectCharacter({ sessionId, playerId, characterId }) {
    try {
        if (!playerId || !sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }
        if (session.gameStatus !== 'waiting') {
            return { code: 2005, data: null, msg: 'Characters can only be changed before the game starts' };
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }
        if (!getCharacter(characterId)) {
            return { code: 1001, data: null, msg: 'Unknown character' };
        }

        const takenBy = session.players.find(p => p.characterId === characterId && p.playerId !== playerId);
        if (takenBy) {
            return { code: 2010, data: null, msg: 'That character is already taken' };
        }

        player.characterId = characterId;
        writeDB(db);

        return {
            code: 0,
            data: { characterId },
            msg: 'Character selected',
            events: [
                {
                    event: 'player_joined',
                    data: { playerId, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[gameService.selectCharacter]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/game/start ----------
function start({ sessionId, playerId }) {
    try {
        if (!playerId || !sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }
        if (session.ownerId !== playerId) {
            return { code: 2009, data: null, msg: 'Only the session owner can start the game' };
        }
        if (session.gameStatus !== 'waiting') {
            return { code: 2008, data: null, msg: 'Game already in progress or completed' };
        }

        const activePlayers = session.players.filter(p => p.turnStatus === 'active');
        if (activePlayers.length < 1) {
            return { code: 2018, data: null, msg: 'At least 1 active players required to start the game' };
        }

        session.gameStatus = 'InProgress';
        session.startedAt = new Date().toISOString();
        writeDB(db);

        return {
            code: 0,
            data: {
                sessionId,
                gameStatus: 'InProgress',
                startedAt: session.startedAt
            },
            msg: 'Game started successfully',
            events: [
                {
                    event: 'game_started',
                    data: { sessionId, gameStatus: 'InProgress', startedAt: session.startedAt }
                }
            ]
        };
    } catch (err) {
        console.error('[gameService.start]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/game/move ----------
function move({ sessionId, playerId, targetTile, questionId, selectedOption }) {
    try {
        const events = [];

        if (!playerId || !sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }
        if (session.gameStatus !== 'InProgress') {
            return { code: 2008, data: null, msg: 'Game is not in progress' };
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not found' };
        }
        if (player.completedAt) {
            return { code: 2020, data: null, msg: 'Player already finished the game' };
        }

        // ---------- 模式2：答题后移动（带 targetTile） ----------
        if (targetTile !== undefined) {
            if (typeof targetTile !== 'number' || targetTile < 1 || targetTile > 100) {
                return { code: 2006, data: null, msg: 'Invalid target tile' };
            }

            player.currentTile = targetTile;

            if (targetTile === 100) {
                const result = applyPlayerFinish(session, player);
                writeDB(db);
                if (result.gameStatus === 'Completed') {
                    events.push({
                        event: 'game_over',
                        data: { winnerId: result.winnerId, activePlayers: buildPublicPlayerList(session) }
                    });
                } else {
                    events.push({
                        event: 'move_update',
                        data: { playerId, currentTile: 100, activePlayers: buildPublicPlayerList(session) }
                    });
                }
                return {
                    code: 0,
                    data: {
                        currentTile: 100,
                        needsQuiz: false,
                        gameStatus: result.gameStatus,
                        winnerId: result.winnerId,
                        itemGranted: null,
                        inventory: player.inventory || []
                    },
                    msg: result.gameStatus === 'Completed' ? '🎉 Game over!' : 'Player reached 100!',
                    events
                };
            }

            writeDB(db);
            events.push({
                event: 'move_update',
                data: { playerId, currentTile: targetTile, activePlayers: buildPublicPlayerList(session) }
            });

            return {
                code: 0,
                data: {
                    currentTile: targetTile,
                    needsQuiz: false,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || []
                },
                msg: 'success',
                events
            };
        }

        // ---------- 模式1：掷骰子（需要先答题验证） ----------
        if (questionId && selectedOption) {
            const question = db.questions.find(q => q.questionId === questionId);
            if (!question) {
                return { code: 5000, data: null, msg: 'Question not found' };
            }

            const isCorrect = selectedOption === question.correctAnswer;
            if (!isCorrect) {
                const next = pickPrerollQuestion(db, session, questionId);
                if (next) {
                    writeDB(db);
                    return {
                        code: 0,
                        data: {
                            correct: false,
                            prerollQuiz: {
                                questionId: next.questionId,
                                questionText: next.questionText,
                                options: next.options
                            }
                        },
                        msg: 'Incorrect answer. Here is a new question.',
                        events
                    };
                }
                // 题库耗尽：继续往下走，直接掷骰
            }
        } else {
            const selected = pickPrerollQuestion(db, session);
            if (selected) {
                writeDB(db);
                return {
                    code: 0,
                    data: {
                        prerollQuiz: {
                            questionId: selected.questionId,
                            questionText: selected.questionText,
                            options: selected.options
                        }
                    },
                    msg: 'Answer the question before rolling',
                    events
                };
            }
            // 没有题目了，降级为普通掷骰
        }

        // ---------- 执行掷骰 ----------
        const diceValue = gameLogic.generateDiceValue();
        const landingTile = gameLogic.calculateLandingTile(player.currentTile, diceValue);

        if (landingTile > 100) {
            return {
                code: 0,
                data: {
                    currentTile: player.currentTile,
                    needsQuiz: false,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue
                },
                msg: 'Rolled past 100, stay in place',
                events
            };
        }

        const tileType = gameLogic.getTileType(landingTile);
        const isFlashing = gameLogic.isFlashingTile(landingTile);

        player.currentTile = landingTile;

        if (landingTile === 100) {
            const result = applyPlayerFinish(session, player);
            writeDB(db);
            if (result.gameStatus === 'Completed') {
                events.push({
                    event: 'game_over',
                    data: { winnerId: result.winnerId, activePlayers: buildPublicPlayerList(session) }
                });
            } else {
                events.push({
                    event: 'move_update',
                    data: { playerId, currentTile: 100, activePlayers: buildPublicPlayerList(session) }
                });
            }
            return {
                code: 0,
                data: {
                    currentTile: 100,
                    needsQuiz: false,
                    gameStatus: result.gameStatus,
                    winnerId: result.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue
                },
                msg: result.gameStatus === 'Completed' ? '🎉 Game over!' : 'Player reached 100!',
                events
            };
        }

        if (tileType === 'ladder' || tileType === 'snake') {
            writeDB(db);
            events.push({
                event: 'move_update',
                data: { playerId, currentTile: landingTile, activePlayers: buildPublicPlayerList(session) }
            });
            return {
                code: 0,
                data: {
                    currentTile: landingTile,
                    needsQuiz: true,
                    gameStatus: session.gameStatus,
                    winnerId: session.winnerId,
                    itemGranted: null,
                    inventory: player.inventory || [],
                    diceValue
                },
                msg: `Landed on ${tileType} tile, please answer quiz`,
                events
            };
        }

        let itemGranted = null;

        if (isFlashing) {
            const effect = gameLogic.getFlashingTileEffect(session.presets);
            if (effect.type === 'item') {
                itemGranted = effect.item;
                if (!player.inventory) player.inventory = [];
                if (player.inventory.length < 3) {
                    player.inventory.push(itemGranted);
                }
            }
        }

        writeDB(db);
        events.push({
            event: 'move_update',
            data: { playerId, currentTile: landingTile, activePlayers: buildPublicPlayerList(session) }
        });

        return {
            code: 0,
            data: {
                currentTile: landingTile,
                needsQuiz: false,
                gameStatus: session.gameStatus,
                winnerId: session.winnerId,
                itemGranted,
                inventory: player.inventory || [],
                diceValue
            },
            msg: isFlashing ? 'Landed on flashing tile' : 'success',
            events
        };
    } catch (err) {
        console.error('[gameService.move]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- POST /api/game/item/use ----------
function useItem({ sessionId, playerId, itemType, targetPlayerId }) {
    try {
        const events = [];

        if (!playerId || !sessionId) {
            return { code: 2004, data: null, msg: 'Player not in a session' };
        }
        if (!itemType || !['rocket', 'bomb', 'arrow'].includes(itemType)) {
            return { code: 1003, data: null, msg: 'Invalid item type, must be rocket, bomb, or arrow' };
        }

        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) {
            return { code: 2003, data: null, msg: 'Session not found' };
        }
        if (session.gameStatus !== 'InProgress') {
            return { code: 2008, data: null, msg: 'Game is not in progress' };
        }

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not found' };
        }
        if (player.completedAt) {
            return { code: 2020, data: null, msg: 'Player already finished the game' };
        }
        if (!player.inventory || !player.inventory.includes(itemType)) {
            return { code: 2011, data: null, msg: 'Item not found in inventory' };
        }

        const steps = gameLogic.getItemSteps(itemType, session.presets);
        if (steps === null) {
            return { code: 2011, data: null, msg: `Item '${itemType}' is not enabled` };
        }

        let targetPlayer = null;
        if (itemType === 'bomb' || itemType === 'arrow') {
            if (!targetPlayerId) {
                return { code: 1001, data: null, msg: 'Missing targetPlayerId for this item' };
            }
            if (targetPlayerId === playerId) {
                return { code: 2012, data: null, msg: 'Cannot target yourself' };
            }
            targetPlayer = session.players.find(p => p.playerId === targetPlayerId);
            if (!targetPlayer) {
                return { code: 2012, data: null, msg: 'Target player not found' };
            }
            if (targetPlayer.completedAt) {
                return { code: 2012, data: null, msg: 'Target player has already finished' };
            }
        }

        let sourceNewTile = player.currentTile;
        let targetNewTile = null;

        if (itemType === 'rocket') {
            sourceNewTile = Math.min(100, player.currentTile + steps);
            player.currentTile = sourceNewTile;
        } else if (itemType === 'bomb' || itemType === 'arrow') {
            targetNewTile = Math.max(1, targetPlayer.currentTile - steps);
            targetPlayer.currentTile = targetNewTile;
        }

        const index = player.inventory.indexOf(itemType);
        if (index !== -1) {
            player.inventory.splice(index, 1);
        }

        if (itemType === 'rocket' && sourceNewTile === 100) {
            const result = applyPlayerFinish(session, player);
            writeDB(db);
            if (result.gameStatus === 'Completed') {
                events.push({
                    event: 'game_over',
                    data: { winnerId: result.winnerId, activePlayers: buildPublicPlayerList(session) }
                });
            } else {
                events.push({
                    event: 'move_update',
                    data: { playerId, currentTile: 100, activePlayers: buildPublicPlayerList(session) }
                });
            }
            return {
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
                msg: result.gameStatus === 'Completed' ? '🎉 Rocket reached 100, game over!' : 'Rocket used, reached 100!',
                events
            };
        }

        writeDB(db);
        events.push({
            event: 'item_used',
            data: {
                itemType,
                sourcePlayerId: playerId,
                targetPlayerId: targetPlayerId || null,
                activePlayers: buildPublicPlayerList(session)
            }
        });

        const responseData = {
            effect: itemType === 'rocket' ? 'self_forward' : 'target_backward',
            movedBy: steps,
            inventory: player.inventory
        };

        if (itemType === 'rocket') {
            responseData.sourcePlayerId = playerId;
            responseData.sourceNewTile = sourceNewTile;
        } else {
            responseData.sourcePlayerId = playerId;
            responseData.targetPlayerId = targetPlayerId;
            responseData.targetNewTile = targetNewTile;
        }

        const msg = itemType === 'rocket'
            ? `Rocket used, moved forward ${steps} tiles`
            : `${itemType === 'bomb' ? 'Bomb' : 'Arrow'} used, target moved backward ${steps} tiles`;

        return { code: 0, data: responseData, msg, events };
    } catch (err) {
        console.error('[gameService.useItem]', err);
        return { code: 5000, data: null, msg: 'Internal server error' };
    }
}

// ---------- 断线 / 地震 / 定时器配置 ----------
function markPlayerInactive(sessionId, playerId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) return { code: 2003, data: null, msg: 'Session not found' };

        const player = session.players.find(p => p.playerId === playerId);
        if (!player) {
            return { code: 2004, data: null, msg: 'Player not found' };
        }
        if (player.turnStatus === 'inactive') {
            return {
                code: 0,
                data: { playerId, turnStatus: 'inactive' },
                msg: 'Player already marked as inactive',
                events: []
            };
        }

        player.turnStatus = 'inactive';
        writeDB(db);

        return {
            code: 0,
            data: { playerId, turnStatus: 'inactive', activePlayers: buildPublicPlayerList(session) },
            msg: 'Player marked as inactive',
            events: [
                {
                    event: 'player_disconnected',
                    data: { playerId, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[gameService.markPlayerInactive]', err);
        return { code: 5000, data: null, msg: 'Failed to write state' };
    }
}

function triggerEarthquake(sessionId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session || session.gameStatus !== 'InProgress') {
            return { code: 2008, data: null, msg: 'Game is not in progress' };
        }

        const preset = gameLogic.getPreset(session.presets);
        const magnitude = preset.earthquake.magnitude || 3;

        session.players.forEach(p => {
            if (p.turnStatus === 'active' && !p.completedAt) {
                p.currentTile = Math.max(1, p.currentTile - magnitude);
            }
        });
        writeDB(db);

        return {
            code: 0,
            data: { magnitude, activePlayers: buildPublicPlayerList(session) },
            msg: 'Earthquake triggered',
            events: [
                {
                    event: 'earthquake_event',
                    data: { magnitude, activePlayers: buildPublicPlayerList(session) }
                }
            ]
        };
    } catch (err) {
        console.error('[gameService.triggerEarthquake]', err);
        return { code: 5000, data: null, msg: 'Failed to write state' };
    }
}

function getSessionTimerConfig(sessionId) {
    try {
        const db = readDB();
        const session = db.sessions[sessionId];
        if (!session) return null;

        const preset = gameLogic.getPreset(session.presets);
        return {
            earthquakeSeconds: preset.earthquake.interval || 60,
            bonusSeconds: preset.bonus.interval || 30
        };
    } catch (err) {
        console.error('[gameService.getSessionTimerConfig]', err);
        return null;
    }
}

module.exports = {
    createSession,
    joinSession,
    getSessionState,
    selectCharacter,
    start,
    move,
    useItem,
    markPlayerInactive,
    triggerEarthquake,
    getSessionTimerConfig
};