// js/components/board/effects.js
// FX layer: bombs, rockets, arrows, snake bites, ladder climbs, earthquakes.
// Everything here is purely visual - a floating emoji (or flying projectile)
// plus a brief tile glow/shake - and cleans itself up after its animation.
import { playSfx } from '../../services/audio/index.js';

let fxLayerEl = null;

export function ensureFxLayer(containerEl) {
  let fx = containerEl.querySelector('.fx-layer');
  if (!fx) {
    fx = document.createElement('div');
    fx.className = 'fx-layer';
    containerEl.appendChild(fx);
  }
  fxLayerEl = fx;
  return fx;
}

// Center of a tile, expressed relative to #board's own box (same frame the
// token path animation uses), so fx elements line up with tiles/tokens.
function getTileCenter(tileNum) {
  const board = document.getElementById('board');
  const tileEl = document.getElementById(`tile-${tileNum}`);
  if (!board || !tileEl) return null;
  const boardRect = board.getBoundingClientRect();
  const r = tileEl.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - boardRect.left,
    y: r.top + r.height / 2 - boardRect.top
  };
}

function flashTile(tileNum, cls, duration) {
  const tileEl = document.getElementById(`tile-${tileNum}`);
  if (!tileEl) return;
  tileEl.classList.remove(cls);
  // Force reflow so the animation restarts if it's triggered twice fast.
  void tileEl.offsetWidth;
  tileEl.classList.add(cls);
  setTimeout(() => tileEl.classList.remove(cls), duration);
}

function spawnPop(tileNum, cls, emoji, duration) {
  if (!fxLayerEl) return;
  const pos = getTileCenter(tileNum);
  if (!pos) return;
  const el = document.createElement('div');
  el.className = `fx-pop ${cls}`;
  el.textContent = emoji;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  fxLayerEl.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function spawnProjectile(fromTile, toTile, cls, emoji, duration) {
  if (!fxLayerEl) return null;
  const from = getTileCenter(fromTile);
  const to = getTileCenter(toTile) || from;
  if (!from) return null;
  const el = document.createElement('div');
  el.className = `fx-projectile ${cls}`;
  el.textContent = emoji;
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  el.style.setProperty('--dx', `${to.x - from.x}px`);
  el.style.setProperty('--dy', `${to.y - from.y}px`);
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI) + 90;
  el.style.setProperty('--rot', `${angle}deg`);
  el.style.animationDuration = `${duration}ms`;
  fxLayerEl.appendChild(el);
  setTimeout(() => el.remove(), duration);
  return { from, to };
}

/** 💣 Bomb: explosion burst + red shake right on the hit tile. */
export function playBombEffect(tileNum) {
  playSfx('bomb');
  spawnPop(tileNum, 'fx-explosion', '💥', 700);
  flashTile(tileNum, 'tile-hit-bomb', 650);
}

/** 🏹 Arrow: flies from the shooter's tile to the target, then a small hit pop. */
export function playArrowEffect(fromTile, toTile) {
  playSfx('arrow');
  spawnProjectile(fromTile, toTile, 'fx-arrow', '🏹', 450);
  setTimeout(() => {
    spawnPop(toTile, 'fx-hit', '💢', 500);
    flashTile(toTile, 'tile-hit-bomb', 500);
  }, 430);
}

/** 🚀 Rocket: launches from the old tile, flies to the new one, glows on arrival. */
export function playRocketEffect(fromTile, toTile) {
  playSfx('rocket');
  spawnPop(fromTile, 'fx-launch-smoke', '💨', 500);
  spawnProjectile(fromTile, toTile, 'fx-rocket', '🚀', 800);
  setTimeout(() => {
    spawnPop(toTile, 'fx-sparkle', '✨', 600);
    flashTile(toTile, 'tile-hit-rocket', 800);
  }, 760);
}

/** 🐍 Snake bite, at the head tile the player got swallowed on. */
export function playSnakeEffect(tileNum) {
  playSfx('snake');
  spawnPop(tileNum, 'fx-snake', '🐍', 600);
  flashTile(tileNum, 'tile-hit-snake', 550);
}

/** 🪜 Ladder climb sparkle, at the tile the player lands on. */
export function playLadderEffect(tileNum) {
  playSfx('ladder');
  spawnPop(tileNum, 'fx-sparkle', '✨', 600);
  flashTile(tileNum, 'tile-hit-ladder', 600);
}

/** 🌍 Earthquake: shakes the whole board once. */
export function playEarthquakeEffect() {
  playSfx('earthquake');
  const board = document.getElementById('board');
  if (!board) return;
  board.classList.remove('board-earthquake');
  void board.offsetWidth;
  board.classList.add('board-earthquake');
  setTimeout(() => board.classList.remove('board-earthquake'), 600);
}
