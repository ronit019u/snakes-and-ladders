// js/components/board/boardRenderer.js
// Builds the 10x10 tile grid, then overlays snakes/ladders and the FX layer.
import { LADDERS, SNAKES, FLASHING_TILES, getTileNumber } from './boardLayout.js';
import { drawConnections } from './connections.js';
import { ensureFxLayer } from './effects.js';

export function buildBoard(containerEl) {
  containerEl.innerHTML = '';
  const tileEls = {};

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const tileNum = getTileNumber(row, col);
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${tileNum}`;
      tile.dataset.tile = tileNum;
      tile.dataset.row = row;
      tile.dataset.col = col;
      tile.innerHTML = `<span class="tile-number">${tileNum}</span>`;

      if (LADDERS.some(([bottom]) => bottom === tileNum)) tile.classList.add('ladder-start');
      if (SNAKES.some(([head]) => head === tileNum)) tile.classList.add('snake-head');

      // Flashing tiles all behave the same now (one weighted item grant), so
      // there is no blue/red variant any more.
      if (FLASHING_TILES.includes(tileNum)) tile.classList.add('flash');

      if (tileNum === 100) tile.classList.add('finish');

      const tokenContainer = document.createElement('div');
      tokenContainer.className = 'token-container';
      tokenContainer.id = `tok-${tileNum}`;
      tile.appendChild(tokenContainer);

      containerEl.appendChild(tile);
      tileEls[tileNum] = tile;
    }
  }

  drawConnections(containerEl);
  ensureFxLayer(containerEl);
  return tileEls;
}
