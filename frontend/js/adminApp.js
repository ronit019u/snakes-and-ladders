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
  onSocketEvent((event, data) => {
    if (event === 'bonus_round_started') {
      showMsg('setup-msg', `⚡ Bonus round started: "${data.questionText}"`, true);
    } else if (event === 'bonus_round_expired') {
      showMsg('setup-msg', `⌛ Bonus round expired — no one answered in time.`, true);
    } else if (event === 'bonus_result') {
      showMsg('setup-msg', `🎉 Bonus won by ${data.winnerUsername} (${data.bonusType === 'item_grant' ? data.bonusValue : `+${data.bonusValue} steps`})`, true);
    } else if (event === 'game_over') {
      handleGameOver(data);
    }
    if (sessionId) pollState();
  });
}

// game_over now fires once 3 players have finished the game (not just 1),
// so show a small podium rather than a single winner line.
function handleGameOver(data) {
  clearInterval(pollTimer);
  const finishers = (data.activePlayers || [])
    .filter(p => p.completedAt)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  const medals = ['🥇', '🥈', '🥉'];
  const podium = finishers.length
    ? finishers.map((p, i) => `${medals[i] || '🏅'} ${p.username}`).join('&nbsp;&nbsp;')
    : (data.winnerId || 'unknown');
  showMsg('setup-msg', `🏆 Game complete. ${podium}`, true);
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
  // Don't touch board-card here — pollState() builds the board itself
  // once it sees gameStatus flip to InProgress. Removing 'hidden' here
  // early breaks pollState()'s own "is it still hidden?" check below.
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
        presets?.flashingTile?.blueProb ?? 30,
        presets?.flashingTile?.redProb ?? 30
      );
      buildBoard($('board'), flashColors);
    }
    renderTokens(r.data.activePlayers);
  }
  if (r.data.gameStatus === 'Completed') {
    handleGameOver({ winnerId: r.data.winnerId, activePlayers: r.data.activePlayers });
  }
}

function renderRoster(players) {
  $('player-count').innerText = players.length;
  $('player-list').innerHTML = players
    .map((p) => `<div class="player-row"><span><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</span><span>${p.completedAt ? '🏁 Finished' : `Tile ${p.currentTile}`}</span></div>`)
    .join('');
}

// ---------- Presets ----------
// Matches the full updated preset schema (section 2 of the spec):
// base settings, flashingTile with weighted itemPool, earthquake, bonus
// with a weighted rewards pool, and per-item enabled/steps config.
function collectPresetPayload() {
  return {
    displayName: $('p-display-name').value.trim() || $('preset-id-input').value.trim(),
    maxPlayers: parseInt($('p-max-players').value, 10),
    diceMax: parseInt($('p-dice-max').value, 10),
    quizTimeout: parseInt($('p-quiz-timeout').value, 10),
    bonusTimeout: parseInt($('p-bonus-timeout').value, 10),
    leaderboardDisplayCount: parseInt($('p-leaderboard-count').value, 10),

    flashingTile: {
      blueProb: parseInt($('p-blue').value, 10),
      redProb: parseInt($('p-red').value, 10),
      blueEffect: {
        type: 'item',
        itemProb: parseInt($('p-item').value, 10),
        itemPool: [
          { type: 'rocket', weight: parseInt($('p-pool-rocket').value, 10) },
          { type: 'bomb', weight: parseInt($('p-pool-bomb').value, 10) },
          { type: 'arrow', weight: parseInt($('p-pool-arrow').value, 10) }
        ]
      },
      redEffect: { type: 'penalty', penaltySteps: parseInt($('p-penalty').value, 10) }
    },

    earthquake: {
      interval: parseInt($('p-quake-int').value, 10),
      magnitude: parseInt($('p-quake-mag').value, 10)
    },

    bonus: {
      interval: parseInt($('p-bonus-int').value, 10),
      penaltySteps: parseInt($('p-bonus-penalty').value, 10),
      rewards: [
        { type: 'item', itemType: 'rocket', weight: parseInt($('p-reward-rocket').value, 10) },
        { type: 'item', itemType: 'bomb', weight: parseInt($('p-reward-bomb').value, 10) },
        { type: 'item', itemType: 'arrow', weight: parseInt($('p-reward-arrow').value, 10) },
        { type: 'forward', steps: parseInt($('p-bonus-forward-steps').value, 10), weight: parseInt($('p-reward-forward').value, 10) }
      ]
    },

    items: {
      rocket: { enabled: $('p-item-rocket-enabled').checked, steps: parseInt($('p-item-rocket-steps').value, 10) },
      bomb: { enabled: $('p-item-bomb-enabled').checked, steps: parseInt($('p-item-bomb-steps').value, 10) },
      arrow: { enabled: $('p-item-arrow-enabled').checked, steps: parseInt($('p-item-arrow-steps').value, 10) }
    }
  };
}

async function handleSavePreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.savePreset(presetId, collectPresetPayload(), sessionId || undefined);
  showMsg('preset-msg', r.msg, r.code === 0);
  if (r.code === 0) syncPresetSelect(presetId);
}

// preset-select only ever shipped with a hardcoded "default" option, so a
// saved preset was never actually usable at room-creation time unless you
// remembered to add it to the dropdown yourself. Keep them in sync instead.
function syncPresetSelect(presetId) {
  const select = $('preset-select');
  let opt = [...select.options].find(o => o.value === presetId);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = presetId;
    select.appendChild(opt);
  }
  opt.innerText = presetId;
  select.value = presetId;
}

async function handleLoadPreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.loadPreset(presetId);
  if (r.code !== 0) return showMsg('preset-msg', r.msg, false);

  const p = r.data.presets;
  const pool = (arr, type) => arr?.find(x => x.type === type)?.weight ?? '';
  const reward = (arr, itemType) => arr?.find(x => x.type === 'item' && x.itemType === itemType)?.weight ?? '';
  const forward = arr => arr?.find(x => x.type === 'forward');

  $('p-display-name').value = p.displayName || presetId;
  $('p-max-players').value = p.maxPlayers ?? 25;
  $('p-dice-max').value = p.diceMax ?? 6;
  $('p-quiz-timeout').value = p.quizTimeout ?? 15;
  $('p-bonus-timeout').value = p.bonusTimeout ?? 15;
  $('p-leaderboard-count').value = p.leaderboardDisplayCount ?? 5;

  $('p-blue').value = p.flashingTile.blueProb;
  $('p-red').value = p.flashingTile.redProb;
  $('p-item').value = p.flashingTile.blueEffect.itemProb;
  $('p-pool-rocket').value = pool(p.flashingTile.blueEffect.itemPool, 'rocket');
  $('p-pool-bomb').value = pool(p.flashingTile.blueEffect.itemPool, 'bomb');
  $('p-pool-arrow').value = pool(p.flashingTile.blueEffect.itemPool, 'arrow');
  $('p-penalty').value = p.flashingTile.redEffect.penaltySteps;

  $('p-quake-mag').value = p.earthquake.magnitude;
  $('p-quake-int').value = p.earthquake.interval || 60;

  $('p-bonus-int').value = p.bonus.interval;
  $('p-bonus-penalty').value = p.bonus.penaltySteps ?? 2;
  $('p-reward-rocket').value = reward(p.bonus.rewards, 'rocket');
  $('p-reward-bomb').value = reward(p.bonus.rewards, 'bomb');
  $('p-reward-arrow').value = reward(p.bonus.rewards, 'arrow');
  const fwd = forward(p.bonus.rewards);
  $('p-reward-forward').value = fwd?.weight ?? '';
  $('p-bonus-forward-steps').value = fwd?.steps ?? 3;

  $('p-item-rocket-enabled').checked = p.items?.rocket?.enabled !== false;
  $('p-item-rocket-steps').value = p.items?.rocket?.steps ?? 5;
  $('p-item-bomb-enabled').checked = p.items?.bomb?.enabled !== false;
  $('p-item-bomb-steps').value = p.items?.bomb?.steps ?? 5;
  $('p-item-arrow-enabled').checked = p.items?.arrow?.enabled !== false;
  $('p-item-arrow-steps').value = p.items?.arrow?.steps ?? 3;

  showMsg('preset-msg', `Loaded preset '${presetId}'`, true);
  syncPresetSelect(presetId);
}

// ---------- Question upload ----------
async function handleUploadQuestions() {
  const fileInput = $('question-file');
  if (!fileInput.files.length) return showMsg('question-msg', 'Choose a file first', false);

  const mode = $('question-mode').value; // 'append' (default) or 'replace'
  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  fd.append('mode', mode);
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