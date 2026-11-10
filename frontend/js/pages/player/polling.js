// js/pages/player/polling.js
// The 2-second poll of GET /api/game/state/:sessionId — the source of truth
// for the player's UI. Socket events only trigger it sooner.
import { showMsg } from '../../utils/dom.js';
import { GameAPI } from '../../api/index.js';
import { playerState } from '../../state/playerState.js';
import { POLL_INTERVAL_MS, DEFAULT_BONUS_TIMEOUT_SECS } from '../../config/constants.js';
import { lockGameControls } from '../../components/player/gameControls.js';
import { renderWaitingPlayers } from '../../components/player/leaderboard.js';
import { enterGameScreen, renderGame } from '../../components/player/gameScreen.js';
import { handleGameOver } from '../../components/player/gameOver.js';

export function startPolling() {
  stopPolling();
  playerState.pollTimer = setInterval(pollState, POLL_INTERVAL_MS);
}

export function stopPolling() {
  clearInterval(playerState.pollTimer);
  playerState.pollTimer = null;
}

// Renders one snapshot of the players on the board + leaderboard and
// remembers it, so the next snapshot can animate from it.
function renderSnapshot(players) {
  renderGame(players, playerState.prevPlayers);
  playerState.prevPlayers = players.map(p => ({ ...p }));
}

export async function pollState() {
  if (!playerState.sessionId) return;
  const seq = ++playerState.pollSeq;
  const r = await GameAPI.getState(playerState.sessionId);
  if (r.code !== 0) return;
  // Responses can arrive out of order (the socket triggers extra polls). Never
  // let an older one overwrite a newer one - in particular a stale "InProgress"
  // arriving after the final "Completed" snapshot.
  if (seq < playerState.appliedSeq) return;
  playerState.appliedSeq = seq;
  const { gameStatus, activePlayers, winnerId, leaderboardDisplayCount, presets, startedAt } = r.data;

  if (startedAt) playerState.sessionStartedAt = startedAt;
  playerState.leaderboardCount = leaderboardDisplayCount || presets?.leaderboardDisplayCount || 5;
  playerState.bonusTimeoutSecs = presets?.bonusTimeout || DEFAULT_BONUS_TIMEOUT_SECS;

  const me = activePlayers?.find(p => p.playerId === playerState.playerId);
  if (me && me.completedAt && !playerState.iAmFinished) {
    playerState.iAmFinished = true;
    lockGameControls();
    showMsg('game-msg', `🏁 You reached tile 100! Waiting for others…`, true);
  }

  if (gameStatus === 'waiting') {
    renderWaitingPlayers(activePlayers);
  } else if (gameStatus === 'InProgress') {
    if (document.getElementById('game-screen').classList.contains('hidden')) enterGameScreen();
    renderSnapshot(activePlayers);
  } else if (gameStatus === 'Completed') {
    // The final move is what ends the game, so this snapshot is the first
    // one that contains it: draw it BEFORE showing the podium.
    if (document.getElementById('game-screen').classList.contains('hidden')) enterGameScreen({ music: false });
    renderSnapshot(activePlayers);
    handleGameOver({ winnerId, activePlayers, rendered: true });
  }
}
