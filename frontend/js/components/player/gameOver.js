// js/components/player/gameOver.js
// game_over fires once 3 players have finished (not just 1), so show a podium.
// Can be reached twice for the same game (socket event, then the Completed
// poll), so everything here is safe to repeat and the sound plays only once.
import { $, showMsg } from '../../utils/dom.js';
import { buildPodiumHtml } from '../../utils/time.js';
import { playSfx } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { cancelPrerollQuiz } from './prerollQuiz.js';
import { renderGame } from './gameScreen.js';

export function handleGameOver(data) {
  const firstTime = !playerState.gameOver;
  playerState.gameOver = true;
  clearInterval(playerState.pollTimer);
  playerState.pollTimer = null;
  cancelPrerollQuiz(); // close an open pre-roll question, if any

  // The socket payload carries the final positions. Draw them right away so the
  // last move shows even before the next poll answers (the poll then confirms it).
  if (firstTime && !data.rendered && playerState.boardTileEls && Array.isArray(data.activePlayers)) {
    renderGame(data.activePlayers, playerState.prevPlayers);
    playerState.prevPlayers = data.activePlayers.map(p => ({ ...p }));
  }

  const rollBtn = $('roll-btn');
  if (rollBtn) rollBtn.disabled = true;
  if (firstTime) playSfx('win');
  const podium = buildPodiumHtml(data.activePlayers, playerState.sessionStartedAt, data.winnerId);
  showMsg('game-msg', `🏆 Game over! ${podium}`, true);
  $('game-status-label').innerText = 'Completed';
}
