// js/adminApp.js
// Admin dashboard – passes flashing tile colors from presets to the board.

import { state, setApiBase } from './config.js';
import { GameAPI, AdminAPI } from './apiService.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from './socketService.js';
import { buildBoard, renderTokens, getFlashingTileColors } from './boardData.js';

let sessionId = null;
let pollTimer = null;

const $ = (id) => document.getElementById(id);

function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
}

function withLoadingState(buttonEl, loadingText, fn) {
  return async (...args) => {
    if (buttonEl.disabled) return;
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = loadingText;
    try {
      await fn(...args);
    } catch (err) {
      console.error('[adminApp] unexpected error:', err);
      showMsg('setup-msg', `Unexpected frontend error: ${err.message}`, false);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerText = originalText;
    }
  };
}

// ---------- Socket wiring ----------
function setupSocket() {
  connectSocket();
  onSocketConnect(() => {
    $('socket-dot').classList.add('on');
    $('socket-status').innerText = 'connected';
    if (sessionId) joinRoom(sessionId);
  });
  onSocketDisconnect(() => {
    $('socket-dot').classList.remove('on');
    $('socket-status').innerText = 'disconnected';
  });
  onSocketEvent(() => { if (sessionId) pollState(); });
}

// ---------- Login ----------
async function handleLogin() {
  const username = $('admin-user').value.trim();
  const password = $('admin-pass').value;
  if (!username || !password) return showMsg('login-msg', 'Enter both username and password', false);

  const r = await AdminAPI.login(username, password);
  if (r.code !== 0) return showMsg('login-msg', r.msg, false);

  showMsg('login-msg', 'Logged in as ' + r.data.adminName, true);
  $('setup-card').classList.remove('hidden');
  $('preset-card').classList.remove('hidden');
  $('question-card').classList.remove('hidden');
}

// ---------- Create room ----------
async function handleCreateRoom() {
  const presetId = $('preset-select').value;
  const r = await AdminAPI.createRoom('GameMaster', presetId);
  if (r.code !== 0) return showMsg('setup-msg', r.msg, false);

  sessionId = r.data.sessionId;
  $('session-code-display').innerText = sessionId;
  $('session-info').classList.remove('hidden');
  $('roster-card').classList.remove('hidden');
  showMsg('setup-msg', 'Room created!', true);

  joinRoom(sessionId);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollState, 2000);
  pollState();
}

// ---------- Start game ----------
async function handleStart() {
  if (!sessionId) return showMsg('setup-msg', 'Create a room first', false);
  const r = await GameAPI.start();
  showMsg('setup-msg', r.msg, r.code === 0);
  if (r.code === 0) {
    $('board-card').classList.remove('hidden');
  }
}

// ---------- Poll state ----------
async function pollState() {
  if (!sessionId) return;
  const r = await GameAPI.getState(sessionId);
  if (r.code !== 0) {
    console.warn('[adminApp] poll failed:', r.msg);
    return;
  }

  renderRoster(r.data.activePlayers);

  if (r.data.gameStatus === 'InProgress') {
    if ($('board-card').classList.contains('hidden')) {
      $('board-card').classList.remove('hidden');
      const presets = r.data.presets;
      const flashColors = getFlashingTileColors(
        presets?.flashingTile?.blueProb || 0.5,
        presets?.flashingTile?.redProb || 0.3
      );
      buildBoard($('board'), flashColors);
    }
    renderTokens(r.data.activePlayers);
  }
  if (r.data.gameStatus === 'Completed') {
    clearInterval(pollTimer);
    showMsg('setup-msg', `🏆 Game complete. Winner: ${r.data.winnerId}`, true);
  }
}

function renderRoster(players) {
  $('player-count').innerText = players.length;
  $('player-list').innerHTML = players
    .map((p) => `<div class="player-row"><span><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</span><span>Tile ${p.currentTile}</span></div>`)
    .join('');
}

// ---------- Presets ----------
function collectPresetPayload() {
  return {
    flashingTile: {
      blueProb: parseFloat($('p-blue').value),
      redProb: parseFloat($('p-red').value),
      blueEffect: { type: 'item', itemTypes: ['rocket', 'bomb'], itemProb: parseFloat($('p-item').value) },
      redEffect: { type: 'penalty', penaltySteps: parseInt($('p-penalty').value, 10) }
    },
    earthquake: {
      magnitude: parseInt($('p-quake-mag').value, 10),
      interval: parseInt($('p-quake-int').value, 10)
    },
    bonus: {
      interval: parseInt($('p-bonus-int').value, 10),
      forwardSteps: parseInt($('p-bonus-steps').value, 10)
    },
    items: { rocket: { enabled: true, steps: 3 }, bomb: { enabled: true, steps: 3 } }
  };
}

async function handleSavePreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.savePreset(presetId, collectPresetPayload(), sessionId || undefined);
  showMsg('preset-msg', r.msg, r.code === 0);
}

async function handleLoadPreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.loadPreset(presetId);
  if (r.code !== 0) return showMsg('preset-msg', r.msg, false);

  const p = r.data.presets;
  $('p-blue').value = p.flashingTile.blueProb;
  $('p-red').value = p.flashingTile.redProb;
  $('p-item').value = p.flashingTile.blueEffect.itemProb;
  $('p-penalty').value = p.flashingTile.redEffect.penaltySteps;
  $('p-quake-mag').value = p.earthquake.magnitude;
  $('p-quake-int').value = p.earthquake.interval || 60;
  $('p-bonus-int').value = p.bonus.interval;
  $('p-bonus-steps').value = p.bonus.forwardSteps;
  showMsg('preset-msg', `Loaded preset '${presetId}'`, true);
}

// ---------- Question upload ----------
async function handleUploadQuestions() {
  const fileInput = $('question-file');
  if (!fileInput.files.length) return showMsg('question-msg', 'Choose a file first', false);

  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  const r = await AdminAPI.uploadQuestions(fd);
  showMsg('question-msg', r.msg, r.code === 0);
}

// ---------- Init ----------
function init() {
  $('reconnect-api-btn').onclick = () => { setApiBase($('api-base').value); setupSocket(); };
  $('login-btn').onclick = withLoadingState($('login-btn'), 'Logging in…', handleLogin);
  $('create-room-btn').onclick = withLoadingState($('create-room-btn'), 'Creating…', handleCreateRoom);
  $('start-btn').onclick = withLoadingState($('start-btn'), 'Starting…', handleStart);
  $('save-preset-btn').onclick = withLoadingState($('save-preset-btn'), 'Saving…', handleSavePreset);
  $('load-preset-btn').onclick = withLoadingState($('load-preset-btn'), 'Loading…', handleLoadPreset);
  $('upload-questions-btn').onclick = withLoadingState($('upload-questions-btn'), 'Uploading…', handleUploadQuestions);
  $('api-base').value = state.apiBase;
  setApiBase($('api-base').value);
  setupSocket();
}

document.addEventListener('DOMContentLoaded', init);