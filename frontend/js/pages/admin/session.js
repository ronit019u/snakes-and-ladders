// js/pages/admin/session.js
// Room lifecycle: create room, start game, and the 2s state poll.
import { $, showMsg } from '../../utils/dom.js';
import { GameAPI, AdminAPI } from '../../api/index.js';
import { joinRoom } from '../../services/socketService.js';
import { stopBots } from '../../services/botManager.js';
import { adminState } from '../../state/adminState.js';
import { POLL_INTERVAL_MS } from '../../config/constants.js';
import { buildBoard, renderTokens } from '../../components/board/index.js';
import { renderRoster } from '../../components/admin/roster.js';
import { handleGameOver } from '../../components/admin/gameOver.js';

export async function pollState() {
  if (!adminState.sessionId) return;
  const r = await GameAPI.getState(adminState.sessionId);
  if (r.code !== 0) {
    console.warn('[admin] poll failed:', r.msg);
    return;
  }

  if (r.data.startedAt) adminState.sessionStartedAt = r.data.startedAt;
  renderRoster(r.data.activePlayers);

  if (r.data.gameStatus === 'InProgress') {
    if ($('board-card').classList.contains('hidden')) {
      $('board-card').classList.remove('hidden');
      buildBoard($('board'));
    }
    renderTokens(r.data.activePlayers);
  }
  if (r.data.gameStatus === 'Completed') {
    handleGameOver({ winnerId: r.data.winnerId, activePlayers: r.data.activePlayers });
  }
}

export async function handleCreateRoom() {
  // Stop any bots left over from a previous room — otherwise they keep
  // retrying dice rolls against a session that's now stale/dead, which
  // looks exactly like "bots stuck failing forever" even though the new
  // room is working fine.
  stopBots();
  $('bots-msg').innerHTML = '';

  const presetId = $('preset-select').value;
  const r = await AdminAPI.createRoom('GameMaster', presetId);
  if (r.code !== 0) return showMsg('setup-msg', r.msg, false);

  adminState.sessionId = r.data.sessionId;
  $('session-code-display').innerText = adminState.sessionId;
  $('session-info').classList.remove('hidden');
  $('roster-card').classList.remove('hidden');
  showMsg('setup-msg', 'Room created!', true);

  joinRoom(adminState.sessionId);
  if (adminState.pollTimer) clearInterval(adminState.pollTimer);
  adminState.pollTimer = setInterval(pollState, POLL_INTERVAL_MS);
  pollState();
}

export async function handleStart() {
  if (!adminState.sessionId) return showMsg('setup-msg', 'Create a room first', false);
  const r = await GameAPI.start();
  showMsg('setup-msg', r.msg, r.code === 0);
  // Don't touch board-card here — pollState() builds the board itself
  // once it sees gameStatus flip to InProgress. Removing 'hidden' here
  // early breaks pollState()'s own "is it still hidden?" check.
}
