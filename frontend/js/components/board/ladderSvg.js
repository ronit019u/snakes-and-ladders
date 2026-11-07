// js/components/board/ladderSvg.js
// Draws one ladder (brown rails + rungs + arrow head) from `from` up to `to`.
// `from`/`to` are { x, y, w, h } tile positions relative to the board.
import { svgEl } from './svgUtils.js';

const BROWN = '#8B5A2B';

export function drawLadder(svg, from, to) {
  const g = svgEl('g');
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const perpAngle = angle + Math.PI / 2;
  const offset = 6;
  const cosP = Math.cos(perpAngle);
  const sinP = Math.sin(perpAngle);

  // Rails
  const rails = [
    [from.x + offset * cosP, from.y + offset * sinP, to.x + offset * cosP, to.y + offset * sinP],
    [from.x - offset * cosP, from.y - offset * sinP, to.x - offset * cosP, to.y - offset * sinP]
  ];
  for (const [sx, sy, ex, ey] of rails) {
    const line = svgEl('line', {
      x1: sx, y1: sy, x2: ex, y2: ey,
      stroke: BROWN, 'stroke-width': '4', 'stroke-linecap': 'round', 'stroke-dasharray': '8 4'
    });
    line.appendChild(svgEl('animate', {
      attributeName: 'stroke-dashoffset', from: '0', to: '-24', dur: '1s', repeatCount: 'indefinite'
    }));
    g.appendChild(line);
  }

  // Rungs
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const mx = from.x + (to.x - from.x) * t;
    const my = from.y + (to.y - from.y) * t;
    g.appendChild(svgEl('line', {
      x1: mx + offset * cosP, y1: my + offset * sinP,
      x2: mx - offset * cosP, y2: my - offset * sinP,
      stroke: BROWN, 'stroke-width': '3', opacity: '0.7'
    }));
  }

  // Arrow head
  const arrowLen = 12;
  const tipX = to.x - 6 * Math.cos(angle);
  const tipY = to.y - 6 * Math.sin(angle);
  const p1x = tipX - arrowLen * Math.cos(angle - 0.5);
  const p1y = tipY - arrowLen * Math.sin(angle - 0.5);
  const p2x = tipX - arrowLen * Math.cos(angle + 0.5);
  const p2y = tipY - arrowLen * Math.sin(angle + 0.5);
  g.appendChild(svgEl('polygon', {
    points: `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`, fill: BROWN, opacity: '0.9'
  }));

  // ⬆ label under the ladder's bottom tile
  const label = svgEl('text', {
    x: from.x, y: from.y + from.h / 2 + 14, 'text-anchor': 'middle',
    'font-size': '10', fill: BROWN, 'font-weight': 'bold'
  });
  label.textContent = '⬆';
  g.appendChild(label);

  svg.appendChild(g);
}
