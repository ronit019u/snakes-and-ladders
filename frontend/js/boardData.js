// js/boardData.js
// Board layout, SVG snakes/ladders, and animated token movement.

export const LADDERS = [[2, 23], [6, 45], [20, 59], [52, 71], [57, 96], [71, 92], [88, 99], [95, 98]];
export const SNAKES = [[16, 6], [47, 26], [49, 11], [56, 53], [62, 19], [64, 60], [87, 24], [93, 73]];
export const FLASHING_TILES = [5, 12, 28, 35, 42, 58, 65, 72, 88, 95];

export function getTileNumber(row, col) {
  const rowFromBottom = 9 - row;
  const isEvenRow = rowFromBottom % 2 === 0;
  const base = rowFromBottom * 10;
  return isEvenRow ? base + col + 1 : base + (10 - col);
}

export function getFlashingTileColors(blueProb = 0.5, redProb = 0.3) {
  const colors = {};
  FLASHING_TILES.forEach((tile) => {
    const seed = tile * 7919 + 12345;
    const rand = ((seed * 9301 + 49297) % 233280) / 233280;
    if (rand < blueProb) colors[tile] = 'blue';
    else if (rand < blueProb + redProb) colors[tile] = 'red';
    else colors[tile] = 'none';
  });
  return colors;
}

export function buildBoard(containerEl, flashColors = null) {
  containerEl.innerHTML = '';
  const tileEls = {};

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const tileNum = getTileNumber(row, col);
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${tileNum}`;          // used for animation positioning
      tile.dataset.tile = tileNum;
      tile.dataset.row = row;
      tile.dataset.col = col;
      tile.innerHTML = `<span class="tile-number">${tileNum}</span>`;

      if (LADDERS.some(([bottom]) => bottom === tileNum)) tile.classList.add('ladder-start');
      if (SNAKES.some(([head]) => head === tileNum)) tile.classList.add('snake-head');

      if (FLASHING_TILES.includes(tileNum)) {
        tile.classList.add('flash');
        const color = flashColors?.[tileNum] || getFlashingTileColors(0.5, 0.3)[tileNum];
        if (color === 'blue') tile.classList.add('flash-blue');
        else if (color === 'red') tile.classList.add('flash-red');
      }

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
  return tileEls;
}

// ----- SVG drawing: full ladders and snakes spanning start to end -----
function drawConnections(containerEl) {
  const oldSvg = containerEl.querySelector('.board-svg-overlay');
  if (oldSvg) oldSvg.remove();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rect = containerEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const tileEls = containerEl.querySelectorAll('.tile');
      const positions = {};
      tileEls.forEach(el => {
        const num = parseInt(el.dataset.tile, 10);
        const r = el.getBoundingClientRect();
        positions[num] = {
          x: r.left - rect.left + r.width / 2,
          y: r.top - rect.top + r.height / 2,
          w: r.width,
          h: r.height
        };
      });

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'board-svg-overlay');
      svg.setAttribute('width', rect.width);
      svg.setAttribute('height', rect.height);
      svg.style.position = 'absolute';
      svg.style.top = '0';
      svg.style.left = '0';
      svg.style.pointerEvents = 'none';
      svg.style.zIndex = '5';

      // Ladders
      LADDERS.forEach(([bottom, top]) => {
        const from = positions[bottom];
        const to = positions[top];
        if (!from || !to) return;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const perpAngle = angle + Math.PI / 2;
        const offset = 6;

        const rail1 = [from.x + offset * Math.cos(perpAngle), from.y + offset * Math.sin(perpAngle),
                       to.x + offset * Math.cos(perpAngle), to.y + offset * Math.sin(perpAngle)];
        const rail2 = [from.x - offset * Math.cos(perpAngle), from.y - offset * Math.sin(perpAngle),
                       to.x - offset * Math.cos(perpAngle), to.y - offset * Math.sin(perpAngle)];
        for (const [sx, sy, ex, ey] of [rail1, rail2]) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', sx);
          line.setAttribute('y1', sy);
          line.setAttribute('x2', ex);
          line.setAttribute('y2', ey);
          line.setAttribute('stroke', '#2dd4bf');
          line.setAttribute('stroke-width', '3');
          line.setAttribute('stroke-linecap', 'round');
          g.appendChild(line);
        }

        const steps = 7;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const mx = from.x + (to.x - from.x) * t;
          const my = from.y + (to.y - from.y) * t;
          const cx = mx + offset * Math.cos(perpAngle);
          const cy = my + offset * Math.sin(perpAngle);
          const dx = mx - offset * Math.cos(perpAngle);
          const dy = my - offset * Math.sin(perpAngle);
          const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          rung.setAttribute('x1', cx);
          rung.setAttribute('y1', cy);
          rung.setAttribute('x2', dx);
          rung.setAttribute('y2', dy);
          rung.setAttribute('stroke', '#5eead4');
          rung.setAttribute('stroke-width', '2');
          rung.setAttribute('opacity', '0.7');
          g.appendChild(rung);
        }

        const arrowLen = 12;
        const tipX = to.x - 6 * Math.cos(angle);
        const tipY = to.y - 6 * Math.sin(angle);
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const p1x = tipX - arrowLen * Math.cos(angle - 0.5);
        const p1y = tipY - arrowLen * Math.sin(angle - 0.5);
        const p2x = tipX - arrowLen * Math.cos(angle + 0.5);
        const p2y = tipY - arrowLen * Math.sin(angle + 0.5);
        arrow.setAttribute('points', `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
        arrow.setAttribute('fill', '#2dd4bf');
        arrow.setAttribute('opacity', '0.9');
        g.appendChild(arrow);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', from.x);
        label.setAttribute('y', from.y + from.h / 2 + 14);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#2dd4bf');
        label.setAttribute('font-weight', 'bold');
        label.textContent = '⬆';
        g.appendChild(label);

        svg.appendChild(g);
      });

      // Snakes
      SNAKES.forEach(([head, tail]) => {
        const from = positions[head];
        const to = positions[tail];
        if (!from || !to) return;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const perpX = -(to.y - from.y) * 0.35;
        const perpY = (to.x - from.x) * 0.35;
        const cp1x = midX + perpX * 0.8;
        const cp1y = midY + perpY * 0.8;
        const cp2x = midX - perpX * 0.8;
        const cp2y = midY - perpY * 0.8;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${from.x},${from.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${to.x},${to.y}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#fb7185');
        path.setAttribute('stroke-width', '5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.85');
        g.appendChild(path);

        const numScales = 10;
        for (let i = 1; i < numScales; i++) {
          const t = i / numScales;
          const u = 1 - t;
          const x = u*u*from.x + 2*u*t*cp1x + t*t*to.x;
          const y = u*u*from.y + 2*u*t*cp1y + t*t*to.y;
          const scale = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const s = 4;
          scale.setAttribute('points', `${x},${y-s} ${x+s},${y} ${x},${y+s} ${x-s},${y}`);
          scale.setAttribute('fill', '#fb7185');
          scale.setAttribute('opacity', '0.5');
          g.appendChild(scale);
        }

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const headSize = 12;
        const hx = from.x + 6 * Math.cos(angle);
        const hy = from.y + 6 * Math.sin(angle);
        const headPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const hp1x = hx + headSize * Math.cos(angle + 1.0);
        const hp1y = hy + headSize * Math.sin(angle + 1.0);
        const hp2x = hx + headSize * Math.cos(angle - 1.0);
        const hp2y = hy + headSize * Math.sin(angle - 1.0);
        headPoly.setAttribute('points', `${hx},${hy} ${hp1x},${hp1y} ${hp2x},${hp2y}`);
        headPoly.setAttribute('fill', '#f43f5e');
        headPoly.setAttribute('opacity', '0.95');
        g.appendChild(headPoly);

        const eyeOff = 5;
        for (const ea of [angle + 0.8, angle - 0.8]) {
          const ex = hx + eyeOff * Math.cos(ea);
          const ey = hy + eyeOff * Math.sin(ea);
          const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          eye.setAttribute('cx', ex);
          eye.setAttribute('cy', ey);
          eye.setAttribute('r', '2.5');
          eye.setAttribute('fill', 'white');
          g.appendChild(eye);
          const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          pupil.setAttribute('cx', ex + 1.2 * Math.cos(angle));
          pupil.setAttribute('cy', ey + 1.2 * Math.sin(angle));
          pupil.setAttribute('r', '1.2');
          pupil.setAttribute('fill', '#1e293b');
          g.appendChild(pupil);
        }

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', to.x);
        label.setAttribute('y', to.y + to.h / 2 + 14);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#fb7185');
        label.setAttribute('font-weight', 'bold');
        label.textContent = '⬇';
        g.appendChild(label);

        svg.appendChild(g);
      });

      containerEl.style.position = 'relative';
      containerEl.appendChild(svg);
    });
  });
}

// ----- Render tokens with smooth movement animation -----
export function renderTokens(players, oldPlayers = null) {
  // Clear all token containers
  document.querySelectorAll('.token-container').forEach(c => c.innerHTML = '');

  // Create new tokens
  players.forEach(p => {
    const tileNum = p.currentTile === 0 ? 1 : p.currentTile;
    const cell = document.getElementById(`tok-${tileNum}`);
    if (!cell) return;
    const token = document.createElement('div');
    token.className = 'token';
    token.dataset.playerId = p.playerId;
    token.title = p.username;
    // Inline styles to guarantee absolute positioning and transition
    token.style.position = 'absolute';
    token.style.bottom = '2px';
    token.style.right = '2px';
    token.style.width = '10px';
    token.style.height = '10px';
    token.style.borderRadius = '50%';
    token.style.backgroundColor = p.tokenColor;
    token.style.border = '1px solid rgba(255,255,255,0.5)';
    token.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    token.style.transform = 'translate(0, 0)';
    cell.appendChild(token);
  });

  // Animate movement if oldPlayers provided
  if (oldPlayers && Array.isArray(oldPlayers)) {
    players.forEach(p => {
      const old = oldPlayers.find(op => op.playerId === p.playerId);
      if (old && old.currentTile !== p.currentTile) {
        const oldTileNum = old.currentTile === 0 ? 1 : old.currentTile;
        const newTileNum = p.currentTile === 0 ? 1 : p.currentTile;
        const oldTile = document.getElementById(`tile-${oldTileNum}`);
        const newTile = document.getElementById(`tile-${newTileNum}`);
        const token = document.querySelector(`.token[data-player-id="${p.playerId}"]`);
        if (token && oldTile && newTile) {
          const oldRect = oldTile.getBoundingClientRect();
          const newRect = newTile.getBoundingClientRect();
          const dx = oldRect.left - newRect.left;
          const dy = oldRect.top - newRect.top;
          // Set token to old position, then animate to new
          token.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            token.style.transform = 'translate(0, 0)';
          });
          console.log(`[Animation] ${p.username} moved from ${old.currentTile} to ${p.currentTile}`);
        }
      }
    });
  }
}