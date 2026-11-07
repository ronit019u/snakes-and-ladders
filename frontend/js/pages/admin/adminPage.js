// js/pages/admin/adminPage.js
// Entry point for admin.html: login, socket wiring and button handlers.
// The real work lives in components/admin/* and pages/admin/session.js.
import { state, setApiBase } from '../../config/config.js';
import { $, showMsg, withLoadingState } from '../../utils/dom.js';
import { AdminAPI } from '../../api/index.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from '../../services/socketService.js';
import { adminState } from '../../state/adminState.js';
import { handleGameOver } from '../../components/admin/gameOver.js';
import { handleSpawnBots } from '../../components/admin/botsPanel.js';
import { handleUploadQuestions } from '../../components/admin/questionUpload.js';
import { handleSavePreset, handleLoadPreset, refreshPresetDropdown } from '../../components/admin/presetPanel.js';
import { handleCreateRoom, handleStart, pollState } from './session.js';

// ---------- Socket wiring ----------
function setupSocket() {
  connectSocket();
  onSocketConnect(() => {
    $('socket-dot').classList.add('on');
    $('socket-status').innerText = 'connected';
    if (adminState.sessionId) joinRoom(adminState.sessionId);
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
    if (adminState.sessionId) pollState();
  });
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
  refreshPresetDropdown();
}

// ---------- Init ----------
function init() {
  const wrap = (id, label, fn) => { $(id).onclick = withLoadingState($(id), label, fn, 'setup-msg'); };
  $('reconnect-api-btn').onclick = () => { setApiBase($('api-base').value); setupSocket(); };
  wrap('login-btn', 'Logging in…', handleLogin);
  wrap('create-room-btn', 'Creating…', handleCreateRoom);
  wrap('start-btn', 'Starting…', handleStart);
  wrap('spawn-robots-btn', 'Spawning…', handleSpawnBots);
  wrap('save-preset-btn', 'Saving…', handleSavePreset);
  wrap('load-preset-btn', 'Loading…', handleLoadPreset);
  wrap('upload-questions-btn', 'Uploading…', handleUploadQuestions);
  $('api-base').value = state.apiBase;
  setApiBase($('api-base').value);
  setupSocket();
}

document.addEventListener('DOMContentLoaded', init);
