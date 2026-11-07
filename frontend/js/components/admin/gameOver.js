// js/components/admin/gameOver.js
// game_over fires once 3 players have finished (not just 1), so show a
// small podium rather than a single winner line.
import { showMsg } from '../../utils/dom.js';
import { buildPodiumHtml } from '../../utils/time.js';
import { adminState } from '../../state/adminState.js';
import { stopBots } from '../../services/botManager.js';

export function handleGameOver(data) {
  clearInterval(adminState.pollTimer);
  stopBots();
  const podium = buildPodiumHtml(data.activePlayers, adminState.sessionStartedAt, data.winnerId);
  showMsg('setup-msg', `🏆 Game complete. ${podium}`, true);
}
