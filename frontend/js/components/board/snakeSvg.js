// js/components/board/snakeSvg.js
// Draws one snake (gradient body, scales, head, eyes, forked tongue) from
// its head tile `from` down to its tail tile `to`.
// `from`/`to` are { x, y, w, h } tile positions relative to the board.
import { svgEl } from './svgUtils.js';

export function drawSnake(svg, from, to) {
  const g = svgEl('g');

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const perpX = -(to.y - from.y) * 0.35;
  const perpY = (to.x - from.x) * 0.35;
  const cp1x = midX + perpX * 0.8;
  const cp1y = midY + perpY * 0.8;
  const cp2x = midX - perpX * 0.8;
  const cp2y = midY - perpY * 0.8;

  // Body
  const path = svgEl('path', {
    d: `M ${from.x},${from.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${to.x},${to.y}`,
    stroke: 'url(#snakeGradient)', 'stroke-width': '7', fill: 'none',
    opacity: '0.9', 'stroke-dasharray': '12 6'
  });
  path.appendChild(svgEl('animate', {
    attributeName: 'stroke-dashoffset', from: '0', to: '-36', dur: '1.2s', repeatCount: 'indefinite'
  }));
  g.appendChild(path);

  // Scales
  const numScales = 10;
  const s = 4;
  for (let i = 1; i < numScales; i++) {
    const t = i / numScales;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * cp1x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * cp1y + t * t * to.y;
    g.appendChild(svgEl('polygon', {
      points: `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`,
      fill: '#22c55e', opacity: '0.5'
    }));
  }

  // Head
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headSize = 12;
  const hx = from.x + 6 * Math.cos(angle);
  const hy = from.y + 6 * Math.sin(angle);
  const hp1x = hx + headSize * Math.cos(angle + 1.0);
  const hp1y = hy + headSize * Math.sin(angle + 1.0);
  const hp2x = hx + headSize * Math.cos(angle - 1.0);
  const hp2y = hy + headSize * Math.sin(angle - 1.0);
  g.appendChild(svgEl('polygon', {
    points: `${hx},${hy} ${hp1x},${hp1y} ${hp2x},${hp2y}`, fill: '#22c55e', opacity: '0.95'
  }));

  // Eyes
  for (const ea of [angle + 0.8, angle - 0.8]) {
    const ex = hx + 5 * Math.cos(ea);
    const ey = hy + 5 * Math.sin(ea);
    g.appendChild(svgEl('circle', { cx: ex, cy: ey, r: '2.5', fill: 'white' }));
    g.appendChild(svgEl('circle', {
      cx: ex + 1.2 * Math.cos(angle), cy: ey + 1.2 * Math.sin(angle), r: '1.2', fill: '#1e293b'
    }));
  }

  // Red forked tongue
  const tongueLen = 10;
  const tongueBaseX = hx + 8 * Math.cos(angle);
  const tongueBaseY = hy + 8 * Math.sin(angle);
  for (let side = -1; side <= 1; side += 2) {
    g.appendChild(svgEl('line', {
      x1: tongueBaseX, y1: tongueBaseY,
      x2: tongueBaseX + tongueLen * Math.cos(angle + side * 0.6),
      y2: tongueBaseY + tongueLen * Math.sin(angle + side * 0.6),
      stroke: '#ef4444', 'stroke-width': '2.5', 'stroke-linecap': 'round'
    }));
  }

  // ⬇ label under the snake's tail tile
  const label = svgEl('text', {
    x: to.x, y: to.y + to.h / 2 + 14, 'text-anchor': 'middle',
    'font-size': '10', fill: '#fb7185', 'font-weight': 'bold'
  });
  label.textContent = '⬇';
  g.appendChild(label);

  svg.appendChild(g);
}
