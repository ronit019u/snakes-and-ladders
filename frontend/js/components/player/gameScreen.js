// js/components/player/gameScreen.js
// Switching from the waiting room to the game screen, and per-tick rendering.
import { $ } from '../../utils/dom.js';
import { initAudio, startBgm } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { buildBoard, renderTokens } from '../board/index.js';
import { renderInventory } from './inventory.js';
import { renderLeaderboard } from './leaderboard.js';

export function enterGameScreen({ music = true } = {}) {
  $('waiting-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  initAudio();
  if (music) startBgm();
  playerState.boardTileEls = buildBoard($('board'));
  $('my-status').innerText = `You: ${playerState.myUsername}`;
  renderInventory();
  playerState.prevPlayers = null;
}

export function renderGame(players, oldPlayers = null) {
  renderTokens(players, oldPlayers);
  renderLeaderboard(players);
}
