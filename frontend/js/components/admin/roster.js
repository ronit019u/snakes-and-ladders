// js/components/admin/roster.js
// Live player list shown to the admin once a room exists.
import { $ } from '../../utils/dom.js';
import { formatDuration } from '../../utils/time.js';
import { adminState } from '../../state/adminState.js';

export function renderRoster(players) {
  $('player-count').innerText = players.length;
  $('player-list').innerHTML = players
    .map((p) => {
      let status = `Tile ${p.currentTile}`;
      if (p.completedAt) {
        const t = formatDuration(adminState.sessionStartedAt, p.completedAt);
        status = `🏁 ${t || 'Finished'}`;
      }
      return `<div class="player-row"><span><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</span><span>${status}</span></div>`;
    })
    .join('');
}
