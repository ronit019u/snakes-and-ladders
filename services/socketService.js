// services/socketService.js
let ioInstance = null;

function initSocket(io) {
    ioInstance = io;
    console.log('[SocketService] Initialized');
}

function broadcastBonusResult(sessionId, data) {
    if (ioInstance) {
        ioInstance.to(sessionId).emit('bonus_result', data);
        console.log(`[SocketService] Broadcast bonus_result to ${sessionId}`);
        return true;
    } else {
        console.warn('[SocketService] io not initialized, skip broadcast');
        return false;
    }
}

function broadcastGameEvent(sessionId, event, data) {
    if (ioInstance) {
        ioInstance.to(sessionId).emit(event, data);
        console.log(`[SocketService] Broadcast ${event} to ${sessionId}`);
    } else {
        console.warn('[SocketService] io not initialized, skip broadcast');
    }
}

module.exports = {
    initSocket,
    broadcastBonusResult,
    broadcastGameEvent
};