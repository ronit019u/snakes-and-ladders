// js/boardData.js
// Mirrors backend/services/gameLogic.js exactly. If the backend's tile layout
// changes, update it here too — this is intentionally duplicated (not fetched
// from the server at runtime) so the board can render before the first API call.

export const LADDERS = [[2, 23], [6, 45], [20, 59], [52, 71], [57, 96], [71, 92], [88, 99], [95, 98]];
export const SNAKES = [[16, 6], [47, 26], [49, 11], [56, 53], [62, 19], [64, 60], [87, 24], [93, 73]];
export const FLASHING_TILES = [5, 12, 28, 35, 42, 58, 65, 72, 88, 95];

// Converts a (row, col) grid position into the 1-100 boustrophedon tile number
// used by Snakes & Ladders boards (row 9 = tiles 1-10 left-to-right,
// row 8 = tiles 11-20 right-to-left, and so on).
export function getTileNumber(row, col) {
  const rowFromBottom = 9 - row;
  const isEvenRow = rowFromBottom % 2 === 0;
  const base = rowFromBottom * 10;
  return isEvenRow ? base + col + 1 : base + (10 - col);
}

// Builds the 10x10 board inside the given container element.
// Returns nothing — tiles are appended directly with id="tok-<tileNumber>"
// token containers so renderTokens() can find them.
export function buildBoard(containerEl) {
  containerEl.innerHTML = '';
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const tileNum = getTileNumber(row, col);
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.tile = tileNum;
      tile.innerHTML = `<span>${tileNum}</span>`;

      if (SNAKES.some(([head]) => head === tileNum)) tile.classList.add('snake');
      if (LADDERS.some(([bottom]) => bottom === tileNum)) tile.classList.add('ladder');
      if (FLASHING_TILES.includes(tileNum)) tile.classList.add('flash');
      if (tileNum === 100) tile.classList.add('finish');

      const tokenContainer = document.createElement('div');
      tokenContainer.className = 'token-container';
      tokenContainer.id = `tok-${tileNum}`;
      tile.appendChild(tokenContainer);

      containerEl.appendChild(tile);
    }
  }
}

// Clears and re-renders player tokens onto the board based on a players array
// from GET /api/game/state/:sessionId (each needs currentTile + tokenColor).
export function renderTokens(players) {
  document.querySelectorAll('.token-container').forEach((c) => (c.innerHTML = ''));
  players.forEach((p) => {
    const tileNum = p.currentTile === 0 ? 1 : p.currentTile;
    const cell = document.getElementById(`tok-${tileNum}`);
    if (!cell) return;
    const token = document.createElement('div');
    token.className = 'token';
    token.style.background = p.tokenColor;
    token.title = p.username;
    cell.appendChild(token);
  });
}
