// js/components/admin/botsPanel.js
// "Spawn 25 bots" demo button and its status line.
import { showMsg } from '../../utils/dom.js';
import { adminState } from '../../state/adminState.js';
import { spawnBots, setBotStatusListener } from '../../services/botManager.js';

function handleBotStatus({ total, finished, expected }) {
  const finishedTxt = finished ? ` · finished: ${finished}` : '';
  showMsg('bots-msg', `🤖 Bots joined: ${total}/${expected}${finishedTxt}`, true);
}

export async function handleSpawnBots() {
  if (!adminState.sessionId) return showMsg('setup-msg', 'Create a room first', false);
  setBotStatusListener(handleBotStatus);
  showMsg('bots-msg', '🤖 Spawning bots…', true);
  const count = await spawnBots(adminState.sessionId);
  showMsg('bots-msg', `🤖 ${count}/25 bots joined and are now playing.`, count === 25);
}
