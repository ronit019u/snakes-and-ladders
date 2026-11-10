// js/components/admin/liveBoard.js
// The admin's read-only board: built the first time it is needed, then
// just redrawn with each snapshot of the players.
import { $ } from '../../utils/dom.js';
import { buildBoard, renderTokens } from '../board/index.js';

export function renderLiveBoard(players) {
  if ($('board-card').classList.contains('hidden')) {
    $('board-card').classList.remove('hidden');
    buildBoard($('board'));
  }
  renderTokens(players);
}
