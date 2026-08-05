// services/playerHelpers.js

/**
 * 构建公开的玩家列表（按 currentTile 降序排列）
 * 用于所有需要返回玩家排行榜或广播的场合
 * @param {Object} session - 会话对象
 * @returns {Array} 公开玩家信息数组
 */
function buildPublicPlayerList(session) {
    if (!session || !session.players) return [];
    return [...session.players]
        .sort((a, b) => b.currentTile - a.currentTile)
        .map(p => ({
            playerId: p.playerId,
            username: p.username,
            currentTile: p.currentTile,
            tokenColor: p.tokenColor,
            turnStatus: p.turnStatus,
            completedAt: p.completedAt || null   // 供前端计算前三名
        }));
}

/**
 * 处理玩家到达100格的逻辑（仅修改 session 对象，不写库，不广播）
 * 由调用者负责 writeDB 和 socket 广播
 * @param {Object} session - 会话对象
 * @param {Object} player - 到达终点的玩家
 * @returns {Object} { isGameOver: boolean, winnerId: string|null, gameStatus: string }
 */
/**
 * 处理玩家到达100格的逻辑（仅修改 session 对象，不写库，不广播）
 * 由调用者负责 writeDB 和 socket 广播
 * @param {Object} session - 会话对象
 * @param {Object} player - 到达终点的玩家
 * @returns {Object} { gameStatus: string, winnerId: string|null }
 */
function applyPlayerFinish(session, player) {
    // 如果已经完成，直接返回当前状态
    if (player.completedAt) {
        return {
            gameStatus: session.gameStatus,
            winnerId: session.winnerId || null
        };
    }

    // 记录完成时间
    player.completedAt = new Date().toISOString();

    // 统计已完成玩家
    const finishedPlayers = session.players.filter(p => p.completedAt);

    if (finishedPlayers.length >= 3) {
        session.gameStatus = 'Completed';
        session.completedAt = new Date().toISOString();

        // 按完成时间排序，取第一名
        const sorted = finishedPlayers.slice().sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
        session.winnerId = sorted[0].playerId;

        return {
            gameStatus: 'Completed',
            winnerId: session.winnerId
        };
    } else {
        return {
            gameStatus: 'InProgress',
            winnerId: null
        };
    }
}

// services/playerHelpers.js

/**
 * 检查玩家最终落点是否触发 10 倍数格子的奖励回合
 * 每个 10 倍数格子（10,20,...,90）全场只能触发一次
 * @param {Object} session - 会话对象
 * @param {Object} player - 移动后的玩家
 * @param {string} sessionId - 会话 ID
 * @param {Object} socketService - Socket 服务
 * @param {Object} bonusController - 奖励回合控制器
 * @returns {boolean} 是否触发了奖励回合
 */
function checkTileBonusTrigger(session, player, sessionId, socketService, bonusController) {
    // 已完成玩家不触发
    if (player.completedAt) return false;
    // 游戏未开始或已结束不触发
    if (session.gameStatus !== 'InProgress') return false;

    const currentTile = player.currentTile;
    // 只有 10-99 才可能触发（100 不触发）
    if (currentTile < 10 || currentTile >= 100) return false;

    // 计算当前所在的 10 倍数格子 (10, 20, 30, ..., 90)
    const tileGroup = Math.floor(currentTile / 10) * 10; // 向下取整到 10 的倍数
    // 例如：currentTile=12 → 10, currentTile=25 → 20, currentTile=99 → 90

    // 如果该格子已经触发过，不再触发
    const triggered = session.triggeredBonusTiles || [];
    if (triggered.includes(tileGroup)) return false;

    // 触发奖励回合
    const result = bonusController.startBonusRoundLogicOnly(sessionId);
    if (result.code === 0) {
        session.triggeredBonusTiles.push(tileGroup);
        socketService.broadcastGameEvent(sessionId, 'bonus_round_started', result.data);
        socketService.scheduleBonusExpiry(sessionId, result.data.bonusRoundId);
        return true;
    }
    return false;
}

module.exports = {
    buildPublicPlayerList,
    applyPlayerFinish,
    checkTileBonusTrigger
};