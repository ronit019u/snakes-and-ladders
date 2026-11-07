// js/api/http.js
// Thin wrapper around the Fetch API. Every request:
//  - sends credentials so the express-session cookie round-trips (auth is session-based)
//  - JSON-encodes the body automatically unless isForm is passed (used for file uploads)
//  - times out after 10s and always returns a {code, data, msg} shape, even on
//    network failure, so callers never have to guess why a button "did nothing"
import { state } from '../config/config.js';

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
// instead — see botApi.js for why.
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
