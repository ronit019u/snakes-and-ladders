// js/components/board/effects.js
// FX layer: rockets, arrows, bombs, snake bites, ladder climbs, earthquakes.
//
// Everything here is purely visual and cleans itself up. The three item
// effects use small hand-drawn SVG sprites (drawn pointing RIGHT, so the
// rotation is simply the direction of travel) that fly along a path via
// requestAnimationFrame, plus short-lived particles / rings / flashes that
// are driven by the Web Animations API.
//
// Because the token itself is moved by renderTokens() when the next poll
// lands, the item effects call holdTokens(ms). polling.js asks
// getFxHoldRemaining() and waits, so the target is "hit" at the moment the
// projectile arrives instead of before it.
import { playSfx } from '../../services/audio/index.js';

let fxLayerEl = null;
let fxHoldUntil = 0;

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

/** Milliseconds the token render should still wait for the running item FX. */
export function getFxHoldRemaining() {
  return Math.max(0, fxHoldUntil - performance.now());
}

function holdTokens(ms) {
  fxHoldUntil = Math.max(fxHoldUntil, performance.now() + ms);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const prefersReducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function layer() {
  if (!fxLayerEl || !fxLayerEl.isConnected) {
    const board = document.getElementById('board');
    if (board) ensureFxLayer(board);
  }
  return fxLayerEl;
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

function tileSize() {
  const el = document.getElementById('tile-1');
  const w = el ? el.getBoundingClientRect().width : 0;
  return w > 4 ? w : 36;
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

function bumpBoard(ms = 380) {
  const board = document.getElementById('board');
  if (!board) return;
  board.classList.remove('board-bump');
  void board.offsetWidth;
  board.classList.add('board-bump');
  setTimeout(() => board.classList.remove('board-bump'), ms);
}

/* ------------------------------------------------------------------ */
/* Sprites (all drawn pointing right, except the bomb which is round)  */
/* ------------------------------------------------------------------ */

const SPRITES = {
  rocket: {
    w: 1.7, ratio: 76 / 32,
    svg: `<svg viewBox="-12 0 76 32" xmlns="http://www.w3.org/2000/svg">
      <g class="fx-flame">
        <path d="M15 16 C6 8 -2 10 -11 16 C-2 22 6 24 15 16Z" fill="#f97316"/>
        <path d="M15 16 C9 12 3 13 -4 16 C3 19 9 20 15 16Z" fill="#fde047"/>
      </g>
      <path d="M18 9 L8 1 L8 6 L24 11Z" fill="#ef4444"/>
      <path d="M18 23 L8 31 L8 26 L24 21Z" fill="#ef4444"/>
      <path d="M14 10 H38 C49 10 57 13.5 63 16 C57 18.5 49 22 38 22 H14Z" fill="#e2e8f0"/>
      <path d="M38 10 C49 10 57 13.5 63 16 C57 18.5 49 22 38 22Z" fill="#ef4444"/>
      <rect x="14" y="10" width="5" height="12" fill="#94a3b8"/>
      <circle cx="30" cy="16" r="3.6" fill="#38bdf8" stroke="#0f172a" stroke-width="1.2"/>
      <circle cx="29" cy="15" r="1.1" fill="#fff" opacity=".85"/>
    </svg>`
  },
  arrow: {
    w: 1.5, ratio: 4,
    svg: `<svg viewBox="0 0 64 16" xmlns="http://www.w3.org/2000/svg">
      <line x1="8" y1="8" x2="52" y2="8" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M50 2.5 L64 8 L50 13.5 L53.5 8Z" fill="#f1f5f9"/>
      <path d="M1 2 L9 2 L13 8 L5 8Z" fill="#f87171"/>
      <path d="M1 14 L9 14 L13 8 L5 8Z" fill="#f87171"/>
    </svg>`
  },
  bomb: {
    w: 0.85, ratio: 40 / 48,
    svg: `<svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="30" r="15" fill="#475569" stroke="#e2e8f0" stroke-width="2"/>
      <path d="M9 28 A12 12 0 0 1 18 18" fill="none" stroke="#f1f5f9" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>
      <circle cx="20" cy="31" r="3.4" fill="#ef4444"/>
      <rect x="15.5" y="11" width="9" height="7" rx="2" fill="#94a3b8" stroke="#e2e8f0" stroke-width="1"/>
      <path d="M20 11 C20 6 26 7 28 3" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>
      <g class="fx-spark"><circle cx="28.5" cy="3" r="3.2" fill="#fde047"/><circle cx="28.5" cy="3" r="1.5" fill="#fff"/></g>
    </svg>`
  }
};

function createSprite(kind, ts) {
  const def = SPRITES[kind];
  const W = ts * def.w;
  const H = W / def.ratio;
  const el = document.createElement('div');
  el.className = `fx-sprite fx-sprite-${kind}`;
  el.style.width = `${W}px`;
  el.style.height = `${H}px`;
  el.innerHTML = def.svg;
  return { el, W, H };
}

// Centers the sprite on (x, y), rotates it by `angle` (rad) around its center.
function setPose(s, x, y, angle = 0, scale = 1) {
  s.el.style.transform =
    `translate(${x - s.W / 2}px, ${y - s.H / 2}px) rotate(${angle}rad) scale(${scale})`;
}

/* ------------------------------------------------------------------ */
/* Particles, rings, flashes, floating text                            */
/* ------------------------------------------------------------------ */

function particle(x, y, o = {}) {
  const L = layer();
  if (!L) return;
  const {
    size = 6, w = size, h = size, color = '#fff', bg = null, radius = '50%',
    dx = 0, dy = 0, gravity = 0, life = 500, scale = [1, 0.2], rot = 0,
    glow = 0, text = null, easing = 'cubic-bezier(.12,.75,.3,1)'
  } = o;
  const el = document.createElement('div');
  el.className = 'fx-particle';
  if (text) {
    el.textContent = text;
    el.style.fontSize = `${w}px`;
    el.style.lineHeight = '1';
    el.style.color = color;
    el.style.textAlign = 'center';
    if (glow) el.style.textShadow = `0 0 ${glow}px ${color}`;
  } else {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.borderRadius = radius;
    el.style.background = bg || color;
    if (glow) el.style.boxShadow = `0 0 ${glow}px ${color}`;
  }
  L.appendChild(el);
  const base = `translate(${x - w / 2}px, ${y - h / 2}px)`;
  const mid = (scale[0] + scale[1]) / 2;
  const anim = el.animate([
    { transform: `${base} rotate(${rot}rad) scale(${scale[0]})`, opacity: 1 },
    { transform: `${base} translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${rot}rad) scale(${mid})`, opacity: 1, offset: 0.45 },
    { transform: `${base} translate(${dx}px, ${dy + gravity}px) rotate(${rot}rad) scale(${scale[1]})`, opacity: 0 }
  ], { duration: life, easing, fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

function ring(x, y, { size, color, from = 0.2, to = 1, life = 500, width = 2 }) {
  const L = layer();
  if (!L) return;
  const el = document.createElement('div');
  el.className = 'fx-ring';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderWidth = `${width}px`;
  el.style.borderColor = color;
  el.style.boxShadow = `0 0 10px ${color}`;
  L.appendChild(el);
  const base = `translate(${x - size / 2}px, ${y - size / 2}px)`;
  const anim = el.animate([
    { transform: `${base} scale(${from})`, opacity: 0.95 },
    { transform: `${base} scale(${to})`, opacity: 0 }
  ], { duration: life, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

// Radial flash / fireball. `inner`/`outer` are the gradient colors.
function flash(x, y, size, { inner = '#fff', mid = '#fde047', outer = '#f97316', life = 520 } = {}) {
  const L = layer();
  if (!L) return;
  const el = document.createElement('div');
  el.className = 'fx-flash';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background =
    `radial-gradient(circle, ${inner} 0%, ${mid} 30%, ${outer} 58%, rgba(0,0,0,0) 72%)`;
  L.appendChild(el);
  const base = `translate(${x - size / 2}px, ${y - size / 2}px)`;
  const anim = el.animate([
    { transform: `${base} scale(.2)`, opacity: 1 },
    { transform: `${base} scale(1)`, opacity: 1, offset: 0.35 },
    { transform: `${base} scale(1.5)`, opacity: 0 }
  ], { duration: life, easing: 'ease-out', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

function scorch(x, y, size) {
  const L = layer();
  if (!L) return;
  const el = document.createElement('div');
  el.className = 'fx-scorch';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  L.appendChild(el);
  const base = `translate(${x - size / 2}px, ${y - size / 2}px)`;
  const anim = el.animate([
    { transform: `${base} scale(.4)`, opacity: 0 },
    { transform: `${base} scale(1)`, opacity: 0.9, offset: 0.12 },
    { transform: `${base} scale(1.1)`, opacity: 0.55, offset: 0.55 },
    { transform: `${base} scale(1.15)`, opacity: 0 }
  ], { duration: 1900, easing: 'ease-out', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

function smoke(x, y, ts, { count = 4, life = 800, spread = 0.25, grow = 2.4 } = {}) {
  for (let i = 0; i < count; i++) {
    particle(x + rand(-spread, spread) * ts, y + rand(-spread, spread) * ts, {
      size: ts * rand(0.35, 0.55),
      bg: 'radial-gradient(circle, rgba(226,232,240,.75), rgba(100,116,139,0) 70%)',
      dx: rand(-0.5, 0.5) * ts,
      dy: -rand(0.4, 1.1) * ts,
      life: life * rand(0.8, 1.2),
      scale: [0.5, grow],
      easing: 'ease-out'
    });
  }
}

function floatText(x, y, text, color, ts) {
  const L = layer();
  if (!L) return;
  const el = document.createElement('div');
  el.className = 'fx-float';
  el.textContent = text;
  el.style.color = color;
  el.style.fontSize = `${clamp(ts * 0.6, 13, 24)}px`;
  L.appendChild(el);
  const base = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  const anim = el.animate([
    { transform: `${base} scale(.4)`, opacity: 0 },
    { transform: `${base} translate(0, ${-ts * 0.5}px) scale(1.3)`, opacity: 1, offset: 0.22 },
    { transform: `${base} translate(0, ${-ts * 0.8}px) scale(1)`, opacity: 1, offset: 0.65 },
    { transform: `${base} translate(0, ${-ts * 1.4}px) scale(1)`, opacity: 0 }
  ], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

/* ------------------------------------------------------------------ */
/* 💣 Bomb                                                             */
/* ------------------------------------------------------------------ */

function bombImpact(to, toTile, steps, ts, reduced = false) {
  playSfx('bomb');
  flashTile(toTile, 'tile-hit-bomb', 650);
  if (steps > 0) floatText(to.x, to.y - ts * 0.4, `-${steps}`, '#f87171', ts);
  if (reduced) return;

  flash(to.x, to.y, ts * 2.1);
  ring(to.x, to.y, { size: ts * 2.6, color: '#fb923c', from: 0.15, life: 520, width: 3 });
  setTimeout(() => ring(to.x, to.y, { size: ts * 3.6, color: 'rgba(239,68,68,.9)', from: 0.15, life: 680, width: 2 }), 90);

  // Fire sparks
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.5, 1.7) * ts;
    particle(to.x, to.y, {
      size: ts * rand(0.1, 0.22), color: pick(['#fde047', '#fb923c', '#ef4444', '#fff']),
      dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, gravity: ts * 0.35,
      life: rand(420, 760), glow: 6
    });
  }
  // Dark debris, heavier (falls more)
  for (let i = 0; i < 8; i++) {
    const a = rand(-Math.PI, 0), sp = rand(0.6, 1.4) * ts;
    particle(to.x, to.y, {
      w: ts * rand(0.1, 0.18), h: ts * rand(0.07, 0.12), radius: '2px', color: '#334155',
      dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, gravity: ts * 1.3,
      rot: rand(0, 3), life: rand(600, 900), scale: [1, 0.6], easing: 'cubic-bezier(.2,.6,.4,1)'
    });
  }
  setTimeout(() => smoke(to.x, to.y, ts, { count: 5 }), 110);
  scorch(to.x, to.y, ts * 1.5);
  bumpBoard();
}

/**
 * 💣 Bomb: lobbed from the thrower's tile in a high arc (spinning, fuse
 * sparking, ground shadow underneath), then a fireball, shockwaves, debris,
 * smoke and a scorch mark where it lands. With no usable source tile it
 * drops straight down from above the target instead.
 */
export function playBombEffect(toTile, fromTile = null, steps = 0) {
  const to = getTileCenter(toTile);
  const L = layer();
  if (!to || !L) return;
  const ts = tileSize();

  if (prefersReducedMotion()) { bombImpact(to, toTile, steps, ts, true); return; }

  let from = fromTile != null && fromTile !== toTile ? getTileCenter(fromTile) : null;
  let drop = false;
  if (!from || Math.hypot(to.x - from.x, to.y - from.y) < ts * 0.6) {
    drop = true;
    from = { x: to.x + rand(-0.3, 0.3) * ts, y: Math.max(-ts * 1.5, to.y - ts * 5) };
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = clamp(480 + dist * 0.7, 600, 1000);
  const arcH = drop ? 0 : clamp(dist * 0.35, ts * 1.2, ts * 4);
  holdTokens(duration);
  playSfx('bombThrow');

  const bomb = createSprite('bomb', ts);
  const shadowSize = ts * 0.7;
  const shadow = document.createElement('div');
  shadow.className = 'fx-shadow';
  shadow.style.width = `${shadowSize}px`;
  shadow.style.height = `${shadowSize * 0.45}px`;
  L.appendChild(shadow);
  L.appendChild(bomb.el);
  setPose(bomb, from.x, from.y);

  const t0 = performance.now();
  let lastSpark = 0;
  const step = (now) => {
    const raw = clamp((now - t0) / duration, 0, 1);
    const t = drop ? raw * raw : raw;                       // falling accelerates
    const gx = lerp(from.x, to.x, t);
    const gy = lerp(from.y, to.y, t);
    const lift = 4 * arcH * t * (1 - t);                    // parabola height
    const px = gx, py = gy - lift;
    const scale = drop ? 0.9 + 0.2 * raw : 0.85 + 0.55 * Math.sin(Math.PI * raw);
    const angle = raw * Math.PI * (drop ? 3 : 5);
    setPose(bomb, px, py, angle, scale);

    // Shadow stays on the "ground" and shrinks / fades as the bomb climbs.
    const h = drop ? (1 - t) : 4 * t * (1 - t);
    const sScale = 1 - 0.45 * h;
    shadow.style.opacity = String(drop ? 0.2 + 0.5 * t : 0.7 - 0.35 * h);
    shadow.style.transform =
      `translate(${gx - shadowSize / 2}px, ${gy - shadowSize * 0.225 + ts * 0.25}px) scale(${sScale})`;

    // Fuse sparks trailing off the bomb
    if (now - lastSpark > 32) {
      lastSpark = now;
      const lx = (28.5 / 40 - 0.5) * bomb.W * scale, ly = (3 / 48 - 0.5) * bomb.H * scale;
      const fx = px + lx * Math.cos(angle) - ly * Math.sin(angle);
      const fy = py + lx * Math.sin(angle) + ly * Math.cos(angle);
      particle(fx, fy, {
        size: ts * rand(0.07, 0.13), color: pick(['#fde047', '#fb923c', '#fff']),
        dx: rand(-0.3, 0.3) * ts, dy: rand(-0.1, 0.4) * ts, life: rand(260, 420), glow: 5
      });
    }

    if (raw < 1) {
      requestAnimationFrame(step);
    } else {
      bomb.el.remove();
      shadow.remove();
      bombImpact(to, toTile, steps, ts);
    }
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* 🏹 Arrow                                                            */
/* ------------------------------------------------------------------ */

function arrowImpact(to, toTile, steps, ts, angle) {
  playSfx('arrowHit');
  flashTile(toTile, 'tile-hit-arrow', 520);
  if (steps > 0) floatText(to.x, to.y - ts * 0.4, `-${steps}`, '#f87171', ts);
  flash(to.x, to.y, ts * 1.1, { inner: '#fff', mid: '#fef08a', outer: '#f87171', life: 300 });
  ring(to.x, to.y, { size: ts * 1.5, color: '#f87171', from: 0.2, life: 420, width: 2 });
  // Sparks spray back against the direction of travel.
  for (let i = 0; i < 10; i++) {
    const a = angle + Math.PI + rand(-1.1, 1.1), sp = rand(0.4, 1.2) * ts;
    particle(to.x, to.y, {
      size: ts * rand(0.07, 0.14), color: pick(['#fff', '#fde68a', '#fb7185']),
      dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, gravity: ts * 0.3, life: rand(280, 520), glow: 4
    });
  }
}

/**
 * 🏹 Arrow: a quick release ring at the shooter, then a straight, fast shot
 * with a motion streak. It sticks into the target tile, wobbles, spits
 * sparks and fades out.
 */
export function playArrowEffect(fromTile, toTile, steps = 0) {
  const to = getTileCenter(toTile);
  const L = layer();
  if (!to || !L) return;
  const ts = tileSize();

  if (prefersReducedMotion()) { arrowImpact(to, toTile, steps, ts, 0); return; }

  let from = fromTile != null ? getTileCenter(fromTile) : null;
  if (!from || Math.hypot(to.x - from.x, to.y - from.y) < ts * 0.6) {
    from = { x: to.x - ts * 3, y: to.y - ts * 2 };   // shooter on the same tile: shoot in diagonally
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const duration = clamp(220 + dist * 0.55, 280, 560);
  holdTokens(duration);
  playSfx('arrow');

  const arrow = createSprite('arrow', ts);
  // The arrow's tip ends slightly past the tile center so it looks embedded.
  const end = { x: to.x - dir.x * arrow.W * 0.3, y: to.y - dir.y * arrow.W * 0.3 };
  L.appendChild(arrow.el);
  setPose(arrow, from.x, from.y, angle);

  // Release "twang" at the shooter
  ring(from.x, from.y, { size: ts * 1.5, color: '#fbbf24', from: 1.3, to: 0.4, life: 260, width: 2 });

  const t0 = performance.now();
  const step = (now) => {
    const raw = clamp((now - t0) / duration, 0, 1);
    const t = 1 - Math.pow(1 - raw, 1.8);                  // fast out of the bow, eases slightly
    const x = lerp(from.x, end.x, t), y = lerp(from.y, end.y, t);
    setPose(arrow, x, y, angle);

    // Streak behind the shaft
    particle(x - dir.x * arrow.W * 0.55, y - dir.y * arrow.W * 0.55, {
      w: arrow.W * 0.7, h: 2.2, radius: '2px', color: 'rgba(253,230,138,.85)',
      rot: angle, life: 220, scale: [1, 0.1], glow: 4
    });

    if (raw < 1) {
      requestAnimationFrame(step);
    } else {
      arrowImpact(to, toTile, steps, ts, angle);
      // Stuck-in wobble, then fade away.
      const A = (a) => `translate(${end.x - arrow.W / 2}px, ${end.y - arrow.H / 2}px) rotate(${angle + a}rad)`;
      const anim = arrow.el.animate([
        { transform: A(0), opacity: 1, offset: 0 },
        { transform: A(0.16), opacity: 1, offset: 0.1 },
        { transform: A(-0.11), opacity: 1, offset: 0.22 },
        { transform: A(0.07), opacity: 1, offset: 0.34 },
        { transform: A(-0.04), opacity: 1, offset: 0.46 },
        { transform: A(0), opacity: 1, offset: 0.62 },
        { transform: A(0), opacity: 0, offset: 1 }
      ], { duration: 1000, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = () => arrow.el.remove();
    }
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* 🚀 Rocket                                                           */
/* ------------------------------------------------------------------ */

const ROCKET_LAUNCH_MS = 320;

function rocketArrival(to, toTile, steps, ts) {
  playSfx('rocketLand');
  flashTile(toTile, 'tile-hit-rocket', 800);
  if (steps > 0) floatText(to.x, to.y - ts * 0.4, `+${steps}`, '#34d399', ts);
  flash(to.x, to.y, ts * 1.7, { inner: '#ecfeff', mid: '#a7f3d0', outer: '#34d399', life: 480 });
  ring(to.x, to.y, { size: ts * 2.2, color: '#34d399', from: 0.2, life: 560, width: 3 });
  setTimeout(() => ring(to.x, to.y, { size: ts * 3, color: 'rgba(56,189,248,.9)', from: 0.2, life: 640, width: 2 }), 100);
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.6, 1.6) * ts;
    const star = i % 3 === 0;
    particle(to.x, to.y, {
      w: ts * (star ? rand(0.3, 0.45) : rand(0.08, 0.16)), h: ts * 0.15,
      text: star ? '✦' : null,
      color: pick(['#a7f3d0', '#34d399', '#fef08a', '#fff', '#7dd3fc']),
      dx: Math.cos(a) * sp, dy: Math.sin(a) * sp - ts * 0.2, gravity: ts * 0.25,
      life: rand(480, 820), glow: 6, scale: [1, 0.3]
    });
  }
}

/**
 * 🚀 Rocket: ignition (shake, flame, smoke) at the old tile, then it
 * accelerates along a curved path with a flame + smoke trail, and finishes
 * with a bright sparkle burst on the new tile.
 */
export function playRocketEffect(fromTile, toTile, steps = 0) {
  const from = getTileCenter(fromTile);
  const to = getTileCenter(toTile) || from;
  const L = layer();
  if (!from || !to || !L) return;
  const ts = tileSize();

  if (prefersReducedMotion()) { rocketArrival(to, toTile, steps, ts); return; }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < ts * 0.6) { rocketArrival(to, toTile, steps, ts); return; }   // didn't actually move

  const flightMs = clamp(550 + dist * 0.8, 700, 1300);
  holdTokens(ROCKET_LAUNCH_MS);   // the token follows the rocket once it lifts off
  playSfx('rocket');

  // Curved path (quadratic Bezier), bulging upward.
  let nx = -(to.y - from.y) / dist, ny = (to.x - from.x) / dist;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const arc = dist * 0.2;
  const C = { x: (from.x + to.x) / 2 + nx * arc, y: (from.y + to.y) / 2 + ny * arc };
  const pathAt = (u) => ({
    x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * C.x + u * u * to.x,
    y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * C.y + u * u * to.y
  });

  const rocket = createSprite('rocket', ts);
  L.appendChild(rocket.el);
  const launchAngle = Math.atan2(C.y - from.y, C.x - from.x);
  setPose(rocket, from.x, from.y, launchAngle, 0.6);

  // Ignition at the launch tile
  flashTile(fromTile, 'tile-hit-rocket', 500);
  ring(from.x, from.y, { size: ts * 1.8, color: '#fb923c', from: 0.2, life: 420, width: 2 });
  smoke(from.x, from.y, ts, { count: 5, life: 700, spread: 0.3 });

  const emitTrail = (p, angle, strength = 1) => {
    const bx = -Math.cos(angle), by = -Math.sin(angle);          // backwards
    const tail = { x: p.x + bx * rocket.W * 0.45, y: p.y + by * rocket.W * 0.45 };
    particle(tail.x, tail.y, {                                    // flame
      size: ts * rand(0.14, 0.26) * strength, color: pick(['#fde047', '#fb923c', '#f97316']),
      dx: bx * ts * 0.35 + rand(-0.15, 0.15) * ts, dy: by * ts * 0.35 + rand(-0.15, 0.15) * ts,
      life: rand(240, 380), glow: 8, scale: [1, 0.1]
    });
    if (Math.random() < 0.55) {                                    // smoke
      particle(tail.x, tail.y, {
        size: ts * rand(0.25, 0.4),
        bg: 'radial-gradient(circle, rgba(226,232,240,.65), rgba(100,116,139,0) 70%)',
        dx: bx * ts * 0.5 + rand(-0.2, 0.2) * ts, dy: by * ts * 0.5 - rand(0.1, 0.4) * ts,
        life: rand(550, 800), scale: [0.5, 2.2], easing: 'ease-out'
      });
    }
  };

  const total = ROCKET_LAUNCH_MS + flightMs;
  const t0 = performance.now();
  let lastEmit = 0;
  const step = (now) => {
    const elapsed = now - t0;
    if (elapsed < ROCKET_LAUNCH_MS) {
      // Ignition: shudder in place while the flame builds up.
      const k = elapsed / ROCKET_LAUNCH_MS;
      const j = ts * 0.035 * (0.4 + k);
      setPose(rocket, from.x + rand(-j, j), from.y + rand(-j, j), launchAngle, 0.6 + 0.4 * k);
      if (now - lastEmit > 30) { lastEmit = now; emitTrail(from, launchAngle, 0.7 + k * 0.6); }
      requestAnimationFrame(step);
      return;
    }
    const raw = clamp((elapsed - ROCKET_LAUNCH_MS) / flightMs, 0, 1);
    const u = easeInOutCubic(raw);
    const p = pathAt(u);
    const a = pathAt(clamp(u + 0.02, 0, 1)), b = pathAt(clamp(u - 0.02, 0, 1));
    const angle = Math.atan2(a.y - b.y, a.x - b.x);
    setPose(rocket, p.x, p.y, angle, 1);
    if (now - lastEmit > 24) { lastEmit = now; emitTrail(p, angle, 1.1); }

    if (elapsed < total) {
      requestAnimationFrame(step);
    } else {
      // Pop on arrival, then burst.
      const A = `translate(${to.x - rocket.W / 2}px, ${to.y - rocket.H / 2}px) rotate(${angle}rad)`;
      const anim = rocket.el.animate([
        { transform: `${A} scale(1)`, opacity: 1 },
        { transform: `${A} scale(1.6)`, opacity: 0 }
      ], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = () => rocket.el.remove();
      rocketArrival(to, toTile, steps, ts);
    }
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* Snake / ladder / earthquake (unchanged behavior)                    */
/* ------------------------------------------------------------------ */

function spawnPop(tileNum, cls, emoji, duration) {
  const L = layer();
  if (!L) return;
  const pos = getTileCenter(tileNum);
  if (!pos) return;
  const el = document.createElement('div');
  el.className = `fx-pop ${cls}`;
  el.textContent = emoji;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  L.appendChild(el);
  setTimeout(() => el.remove(), duration);
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
