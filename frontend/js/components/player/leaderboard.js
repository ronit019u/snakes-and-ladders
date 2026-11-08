// js/components/player/leaderboard.js
// Waiting-room player list and the in-game leaderboard.
import { $ } from '../../utils/dom.js';
import { formatDuration } from '../../utils/time.js';
import { playerState } from '../../state/playerState.js';
import { tokenBadgeHtml } from '../tokenBadge.js';
import { GameAPI } from '../../api/index.js';
import { showMsg } from '../../utils/dom.js';

// The picker is rebuilt only when something in it changed, so the 2-second
// poll doesn't swallow a tap that is in progress.
let pickerSignature = '';

function renderCharacterPicker(players, characters) {
  const el = $('character-picker');
  if (!el || !characters || !characters.length) return;
  const { playerId } = playerState;
  const takenBy = {};
  players.forEach(p => { if (p.characterId) takenBy[p.characterId] = p.playerId; });

  const signature = JSON.stringify(Object.entries(takenBy)) + '|' + playerId;
  if (signature === pickerSignature) return;
  pickerSignature = signature;

  el.innerHTML = characters.map(c => {
    const owner = takenBy[c.id];
    const mine = owner === playerId;
    const disabled = owner && !mine ? 'disabled' : '';
    return `<button class="char-btn ${mine ? 'mine' : ''}" data-id="${c.id}" ${disabled} title="${c.name}">
      <span class="char-emoji">${c.emoji}</span><span>${c.name}</span></button>`;
  }).join('');

  el.querySelectorAll('.char-btn:not([disabled])').forEach(btn => {
    btn.onclick = async () => {
      const res = await GameAPI.setCharacter(btn.dataset.id);
      if (res.code !== 0) showMsg('waiting-msg', res.msg || 'Could not select character', false);
      pickerSignature = '';           // force a redraw with the server's answer
      playerState.refresh();
    };
  });
}

export function renderWaitingPlayers(players, characters) {
  renderCharacterPicker(players, characters);
  $('waiting-players').innerHTML =
    players.map(p => `<div class="player-row"><span>${tokenBadgeHtml(p)}${p.username}${p.characterName ? ` <span style="color:#64748b;font-size:12px;">(${p.characterName})</span>` : ''}</span></div>`).join('') +
    `<div style="font-size:12px;color:#64748b;margin-top:8px;">${players.length} / 25 joined</div>`;
}

export function renderLeaderboard(players) {
  const { leaderboardCount, playerId, sessionStartedAt } = playerState;

  // Finishers first (by finish time), then everyone else by tile.
  const sorted = [...players].sort((a, b) => {
    if (a.completedAt && b.completedAt) return new Date(a.completedAt) - new Date(b.completedAt);
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return b.currentTile - a.currentTile;
  });
  const topN = sorted.slice(0, leaderboardCount);
  const myRank = sorted.findIndex(p => p.playerId === playerId) + 1;

  const statusFor = (p) => {
    if (!p.completedAt) return `Tile ${p.currentTile}`;
    const t = formatDuration(sessionStartedAt, p.completedAt);
    return `🏁 ${t || 'Finished'}`;
  };
  const rowHtml = (p, i) =>
    `<div class="leaderboard-row"><span>#${i + 1} ${tokenBadgeHtml(p)}${p.username}</span><span>${statusFor(p)}</span></div>`;

  let html = topN.map((p, i) => rowHtml(p, i)).join('');
  if (myRank > leaderboardCount) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${tokenBadgeHtml(me)}${me.username} (you)</span><span>${statusFor(me)}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}
