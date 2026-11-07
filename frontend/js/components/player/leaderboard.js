// js/components/player/leaderboard.js
// Waiting-room player list and the in-game leaderboard.
import { $ } from '../../utils/dom.js';
import { formatDuration } from '../../utils/time.js';
import { playerState } from '../../state/playerState.js';

export function renderWaitingPlayers(players) {
  $('waiting-players').innerHTML =
    players.map(p => `<div class="player-row"><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</div>`).join('') +
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
    `<div class="leaderboard-row"><span>#${i + 1} ${p.username}</span><span>${statusFor(p)}</span></div>`;

  let html = topN.map((p, i) => rowHtml(p, i)).join('');
  if (myRank > leaderboardCount) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${me.username} (you)</span><span>${statusFor(me)}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}
