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

// `credentials` defaults to 'include' (existing behavior for real players/admin,
// who each get their own browser + express-session cookie). Bots pass 'omit'
// instead — see BotAPI below for why.
export async function apiGet(path, credentials = 'include') {
  return request(path, { method: 'GET', credentials });
}

export async function apiPost(path, body = null, isForm = false, credentials = 'include') {
  const opts = { method: 'POST', credentials, headers: {} };
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

// ---------- Bot endpoints (used only by js/botManager.js) ----------
// Real players never send their own playerId on move/item/quiz calls — the
// backend figures out "who is calling" from the express-session cookie, since
// each real player has their own browser and therefore their own cookie jar.
// That trick breaks down for 25 bots living inside one admin tab: they all
// share the SAME cookie jar, so every join/roll would silently stomp on
// whichever bot's cookie landed last, and could also hijack the admin's own
// session.
//
// To avoid that, bot requests carry sessionId/playerId explicitly in the body
// and go out with credentials 'omit' (no cookies sent at all). This assumes
// the backend can resolve "current player" from an explicit playerId the same
// way GameAPI.disconnect(sessionId, playerId) already does above — i.e. as a
// fallback when there's no session cookie. If your backend's /api/game/move,
// /api/game/item/use, /api/question/validate, and /api/bonus/answer routes
// currently require the session cookie unconditionally, they need a small
// (one-line each) change to also accept `req.body.playerId`. No other backend
// changes are needed — bots use the exact same routes and socket events as
// real players.
export const BotAPI = {
  join: (sessionId, username) => apiPost('/api/game/join', { sessionId, username }, false, 'omit'),
  rollDice: (sessionId, playerId) => apiPost('/api/game/move', { sessionId, playerId }, false, 'omit'),
  finalizeMove: (sessionId, playerId, targetTile) => apiPost('/api/game/move', { sessionId, playerId, targetTile }, false, 'omit'),
  useItem: (sessionId, playerId, itemType, targetPlayerId) => apiPost('/api/game/item/use', { sessionId, playerId, itemType, targetPlayerId }, false, 'omit'),
  getRandomQuestion: (sessionId) => apiGet(`/api/question/random/${sessionId}`, 'omit'),
  validateAnswer: (sessionId, playerId, questionId, selectedOption) => apiPost('/api/question/validate', { sessionId, playerId, questionId, selectedOption }, false, 'omit'),
  submitBonusAnswer: (sessionId, playerId, bonusRoundId, selectedOption) => apiPost('/api/bonus/answer', { sessionId, playerId, bonusRoundId, selectedOption }, false, 'omit')
};