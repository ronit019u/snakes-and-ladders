// js/socketService.js
// Wraps the Socket.io client connection. Requires the socket.io client script
// to already be loaded on the page (see index.html/admin.html <script> tag).
import { state } from './config.js';

let socket = null;
const listeners = { onConnect: [], onDisconnect: [], onEvent: [] };

export function connectSocket(sessionId = null, playerId = null) {
  if (socket) socket.disconnect();
  socket = io(state.apiBase, { transports: ['websocket', 'polling'], withCredentials: true });

  socket.on('connect', () => {
    listeners.onConnect.forEach((fn) => fn());
    if (sessionId) joinRoom(sessionId, playerId);
  });

  socket.on('disconnect', () => listeners.onDisconnect.forEach((fn) => fn()));

  socket.onAny((event, data) => {
    listeners.onEvent.forEach((fn) => fn(event, data));
  });

  return socket;
}

export function onSocketConnect(fn) { listeners.onConnect.push(fn); }
export function onSocketDisconnect(fn) { listeners.onDisconnect.push(fn); }
export function onSocketEvent(fn) { listeners.onEvent.push(fn); }

// playerId is optional - admin/spectator connections can omit it, since
// they aren't tracked in a session's player list. Passing it enables the
// backend's 30s-grace-period disconnect handling for that player.
export function joinRoom(sessionId, playerId = null) {
  if (socket && socket.connected) {
    socket.emit('join_room', playerId ? { sessionId, playerId } : sessionId);
  }
}

export function isConnected() {
  return !!(socket && socket.connected);
}
