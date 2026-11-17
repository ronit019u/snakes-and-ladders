// js/components/player/gameOver.js
// game_over fires when the required number of players have finished; show a podium.
import { $, showMsg } from '../../utils/dom.js';
import { buildPodiumHtml } from '../../utils/time.js';
import { playSfx } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { cancelPrerollQuiz } from './prerollQuiz.js';
import { renderGame } from './gameScreen.js';

let handledSessionId = null;

export function handleGameOver(data) {
  // The socket event and the 2s poll can both report Completed.
  // Render only once per session, otherwise the podium/sound repeat.
  if (handledSessionId === playerState.sessionId) return;
  handledSessionId = playerState.sessionId;

  clearInterval(playerState.pollTimer);
  cancelPrerollQuiz();
  playSfx('win');

  const players = data.activePlayers || [];

  // The final move is currentTile=100. Render it before showing the panel,
  // otherwise the token stays on the last polled tile (usually 99).
  if (players.length) {
    renderGame(players, playerState.prevPlayers);
    playerState.prevPlayers = players.map(p => ({ ...p }));
  }

  const podium = buildPodiumHtml(
    players,
    data.startedAt || playerState.sessionStartedAt,
    data.winnerId
  );
  showMsg('game-msg', `🏆 Game over! ${podium}`, true);
  $('game-status-label').innerText = 'Completed';
}
