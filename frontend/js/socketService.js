// js/socketService.js
// Wraps the Socket.io client connection. Requires the socket.io client script
// to already be loaded on the page (see index.html/admin.html <script> tag).
import { state } from './config.js';

let socket = null;
const listeners = { onConnect: [], onDisconnect: [], onEvent: [] };

export function connectSocket(sessionId = null) {
  if (socket) socket.disconnect();
  socket = io(state.apiBase, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    listeners.onConnect.forEach((fn) => fn());
    // NOTE: the current backend's io.on('connection', ...) handler in server.js
    // never calls socket.join(sessionId), so this emit is a no-op until that
    // handler is added server-side. Left in place so it starts working the
    // moment that's wired up, and harmless in the meantime.
    if (sessionId) socket.emit('join_room', sessionId);
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

export function joinRoom(sessionId) {
  if (socket && socket.connected) socket.emit('join_room', sessionId);
}

export function isConnected() {
  return !!(socket && socket.connected);
}
