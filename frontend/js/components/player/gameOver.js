// js/components/player/gameOver.js
// game_over fires once 3 players have finished (not just 1), so show a podium.
import { $, showMsg } from '../../utils/dom.js';
import { buildPodiumHtml } from '../../utils/time.js';
import { playSfx } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { cancelPrerollQuiz } from './prerollQuiz.js';

export function handleGameOver(data) {
  clearInterval(playerState.pollTimer);
  cancelPrerollQuiz(); // close an open pre-roll question, if any
  playSfx('win');
  const podium = buildPodiumHtml(data.activePlayers, playerState.sessionStartedAt, data.winnerId);
  showMsg('game-msg', `🏆 Game over! ${podium}`, true);
  $('game-status-label').innerText = 'Completed';
}
