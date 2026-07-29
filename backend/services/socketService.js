// services/socketService.js

let ioInstance = null;

// Initialize the Socket.io instance
function initSocket(io) {
    ioInstance = io;
    console.log('[SocketService] Initialized');
}

// Broadcast bonus round result to all players in a session
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

// Generic broadcast function for other game events
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