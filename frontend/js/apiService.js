// js/apiService.js
// Thin wrapper around the Fetch API. Every request:
//  - sends credentials so the express-session cookie round-trips (auth is session-based)
//  - JSON-encodes the body automatically unless isForm is passed (used for file uploads)
//  - times out after 10s and always returns a {code, data, msg} shape, even on
//    network failure, so callers never have to guess why a button "did nothing"
import { state } from './config.js';

const TIMEOUT_MS = 10000;

async function request(path, opts) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(state.apiBase + path, { ...opts, signal: controller.signal });
    clearTimeout(timeoutId);

    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      return { code: -1, data: null, msg: `Server returned a non-JSON response (HTTP ${res.status}). Check the API URL and that the backend is actually running.` };
    }
    return json;

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { code: -1, data: null, msg: `Request to ${path} timed out after ${TIMEOUT_MS / 1000}s — is the backend running and reachable at ${state.apiBase}?` };
    }
    // This is the exact failure mode a CORS block or "server not running" produces:
    // fetch() throws TypeError: Failed to fetch, with no other detail.
    return { code: -1, data: null, msg: `Network error calling ${path}: ${err.message}. Common causes: backend not running, wrong API URL, or a CORS block (check the browser console).` };
  }
}

export async function apiGet(path) {
  return request(path, { method: 'GET', credentials: 'include' });
}

export async function apiPost(path, body = null, isForm = false) {
  const opts = { method: 'POST', credentials: 'include', headers: {} };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body; // FormData sets its own multipart headers
  }
  return request(path, opts);
}

// ---------- Game endpoints (routes/gameRoutes.js) ----------
export const GameAPI = {
  create: (username) => apiPost('/api/game/create', { username }),
  join: (sessionId, username) => apiPost('/api/game/join', { sessionId, username }),
  getState: (sessionId) => apiGet(`/api/game/state/${sessionId}`),
  start: () => apiPost('/api/game/start'),
  rollDice: () => apiPost('/api/game/move', {}),
  finalizeMove: (targetTile) => apiPost('/api/game/move', { targetTile }),
  useItem: (itemType, targetPlayerId) => apiPost('/api/game/item/use', { itemType, targetPlayerId }),
  disconnect: (sessionId, playerId) => apiPost('/api/game/player/disconnect', { sessionId, playerId })
};

// ---------- Question endpoints (routes/questionRoutes.js) ----------
export const QuestionAPI = {
  getRandom: (sessionId) => apiGet(`/api/question/random/${sessionId}`),
  validate: (questionId, selectedOption) => apiPost('/api/question/validate', { questionId, selectedOption })
};

// ---------- Bonus round endpoints (routes/bonusRoutes.js) ----------
export const BonusAPI = {
  submitAnswer: (bonusRoundId, selectedOption) => apiPost('/api/bonus/answer', { bonusRoundId, selectedOption })
};

// ---------- Admin endpoints (routes/adminRoutes.js) ----------
export const AdminAPI = {
  login: (username, password) => apiPost('/api/admin/login', { username, password }),
  createRoom: (username, presetId) => apiPost('/api/admin/create', { username, presetId }),
  uploadQuestions: (formData) => apiPost('/api/admin/questions/upload', formData, true),
  savePreset: (presetId, presets, sessionId) => apiPost('/api/admin/presets', { presetId, presets, sessionId }),
  loadPreset: (presetId) => apiPost('/api/admin/presets', { presetId })
};
