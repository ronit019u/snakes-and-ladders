// js/components/board/connections.js
// Overlays an SVG with every snake and ladder on top of the tile grid.
import { LADDERS, SNAKES } from './boardLayout.js';
import { svgEl } from './svgUtils.js';
import { drawLadder } from './ladderSvg.js';
import { drawSnake } from './snakeSvg.js';

// Centre + size of every tile, relative to the board container.
function measureTiles(containerEl, boardRect) {
  const positions = {};
  containerEl.querySelectorAll('.tile').forEach((el) => {
    const num = parseInt(el.dataset.tile, 10);
    const r = el.getBoundingClientRect();
    positions[num] = {
      x: r.left - boardRect.left + r.width / 2,
      y: r.top - boardRect.top + r.height / 2,
      w: r.width,
      h: r.height
    };
  });
  return positions;
}

// Yellow → green gradient used by the snake bodies.
function buildGradientDefs() {
  const defs = svgEl('defs');
  const gradient = svgEl('linearGradient', { id: 'snakeGradient', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
  gradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#eab308' }));
  gradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#22c55e' }));
  defs.appendChild(gradient);
  return defs;
}

export function drawConnections(containerEl) {
  const oldSvg = containerEl.querySelector('.board-svg-overlay');
  if (oldSvg) oldSvg.remove();

  // Wait two frames so the tile grid has been laid out before measuring.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rect = containerEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const positions = measureTiles(containerEl, rect);

      const svg = svgEl('svg', { class: 'board-svg-overlay', width: rect.width, height: rect.height });
      Object.assign(svg.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '5' });
      svg.appendChild(buildGradientDefs());

      LADDERS.forEach(([bottom, top]) => {
        const from = positions[bottom];
        const to = positions[top];
        if (from && to) drawLadder(svg, from, to);
      });
      SNAKES.forEach(([head, tail]) => {
        const from = positions[head];
        const to = positions[tail];
        if (from && to) drawSnake(svg, from, to);
      });

      containerEl.style.position = 'relative';
      containerEl.appendChild(svg);
    });
  });
}
