// js/components/admin/gameOver.js
// game_over fires once 3 players have finished (not just 1), so show a
// small podium rather than a single winner line.
import { showMsg } from '../../utils/dom.js';
import { buildPodiumHtml } from '../../utils/time.js';
import { adminState } from '../../state/adminState.js';
import { stopBots } from '../../services/botManager.js';
import { renderLiveBoard } from './liveBoard.js';
import { renderRoster } from './roster.js';

export function handleGameOver(data) {
  clearInterval(adminState.pollTimer);
  stopBots();
  // game_over replaces the usual move_update, so the socket payload holds the
  // only copy of the final positions until the next poll: draw it now.
  if (Array.isArray(data.activePlayers)) {
    renderRoster(data.activePlayers);
    renderLiveBoard(data.activePlayers);
  }
  const podium = buildPodiumHtml(data.activePlayers, adminState.sessionStartedAt, data.winnerId);
  showMsg('setup-msg', `🏆 Game complete. ${podium}`, true);
}
