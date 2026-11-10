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
import { getFxHoldRemaining } from '../../components/board/index.js';
import { sleep } from '../../utils/async.js';

export function startPolling() {
  stopPolling();
  playerState.pollTimer = setInterval(pollState, POLL_INTERVAL_MS);
}

export function stopPolling() {
  clearInterval(playerState.pollTimer);
  playerState.pollTimer = null;
}

<<<<<<< HEAD
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
=======
// Only the newest poll gets to render after an FX hold (see below).
let pollSeq = 0;

export async function pollState() {
  if (!playerState.sessionId) return;
  const seq = ++pollSeq;
  const r = await GameAPI.getState(playerState.sessionId);
  if (r.code !== 0) return;
  const { gameStatus, activePlayers, winnerId, leaderboardDisplayCount, presets, startedAt, characters } = r.data;
>>>>>>> ed2eccfccf6efa0b45114f04fe5eb69bc391cbb4

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
    renderWaitingPlayers(activePlayers, characters);
  } else if (gameStatus === 'InProgress') {
    if (document.getElementById('game-screen').classList.contains('hidden')) enterGameScreen();
<<<<<<< HEAD
    renderSnapshot(activePlayers);
=======
    // A rocket / arrow / bomb animation is in flight: let it reach its target
    // before the tokens jump, so the hit and the knock-back line up.
    const hold = getFxHoldRemaining();
    if (hold > 0) {
      await sleep(hold);
      if (seq !== pollSeq) return; // a newer poll took over and will render
    }
    renderGame(activePlayers, playerState.prevPlayers);
    playerState.prevPlayers = activePlayers.map(p => ({ ...p }));
>>>>>>> ed2eccfccf6efa0b45114f04fe5eb69bc391cbb4
  } else if (gameStatus === 'Completed') {
    // The final move is what ends the game, so this snapshot is the first
    // one that contains it: draw it BEFORE showing the podium.
    if (document.getElementById('game-screen').classList.contains('hidden')) enterGameScreen({ music: false });
    renderSnapshot(activePlayers);
    handleGameOver({ winnerId, activePlayers, rendered: true });
  }
}
