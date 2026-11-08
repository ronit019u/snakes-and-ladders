// js/components/board/index.js
// Public surface of the board component.
export { LADDERS, SNAKES, FLASHING_TILES } from './boardLayout.js';
export { buildBoard } from './boardRenderer.js';
export { renderTokens } from './tokens.js';
export {
  playBombEffect, playArrowEffect, playRocketEffect, playEarthquakeEffect,
  getFxHoldRemaining
} from './effects.js';
