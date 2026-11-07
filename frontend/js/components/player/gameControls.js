// js/components/player/gameControls.js
// API error handling + locking the roll button / items once a player finishes.
import { $, showMsg } from '../../utils/dom.js';
import { playerState } from '../../state/playerState.js';

export function lockGameControls() {
  const rollBtn = $('roll-btn');
  if (rollBtn) rollBtn.disabled = true;
  document.querySelectorAll('.item-slot').forEach(el => { el.onclick = null; el.classList.add('empty'); });
}

// Returns true when `r` was an error (and has been shown), false when it is fine.
export function handleApiError(r, elId = 'game-msg') {
  if (r.code === 2020) {
    playerState.iAmFinished = true;
    showMsg(elId, `🏁 You've already finished — watching the rest.`, false);
    lockGameControls();
    return true;
  }
  if (r.code !== 0) {
    showMsg(elId, r.msg, false);
    return true;
  }
  return false;
}
