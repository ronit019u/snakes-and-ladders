// js/components/board/tokens.js
// Token rendering with smooth movement animation (straight hop, or a curved
// path when the move was a snake/ladder).
import { getPathType } from './boardLayout.js';
import { playSnakeEffect, playLadderEffect } from './effects.js';
import { playerState } from '../../state/playerState.js';

export function renderTokens(players, oldPlayers = null) {
  document.querySelectorAll('.token-container').forEach(c => c.innerHTML = '');

  players.forEach(p => {
    const tileNum = p.currentTile === 0 ? 1 : p.currentTile;
    const cell = document.getElementById(`tok-${tileNum}`);
    if (!cell) return;
    const token = document.createElement('div');
    token.className = 'token';
    if (p.playerId === playerState.playerId) token.classList.add('token-me');
    token.dataset.playerId = p.playerId;
    token.title = p.characterName ? `${p.characterName} - ${p.username}` : p.username;
    token.style.color = p.tokenColor;
    token.innerHTML = `<span class="tok-face">${p.characterEmoji || ''}</span>`;
    cell.appendChild(token);
  });

  // Several players can share one tile; shrink the tokens on busy tiles so
  // they stay readable instead of piling on top of each other.
  document.querySelectorAll('.token-container').forEach(c => {
    c.classList.toggle('crowded', c.children.length > 4);
  });

  if (oldPlayers && Array.isArray(oldPlayers)) {
    players.forEach(p => {
      const old = oldPlayers.find(op => op.playerId === p.playerId);
      if (old && old.currentTile !== p.currentTile) {
        const pathType = getPathType(old.currentTile, p.currentTile);
        if (pathType) {
          if (pathType === 'snake') playSnakeEffect(old.currentTile);
          else if (pathType === 'ladder') playLadderEffect(old.currentTile);
          animateTokenAlongPath(p.playerId, old.currentTile, p.currentTile, pathType);
        } else {
          animateTokenSimple(p.playerId, old.currentTile, p.currentTile);
        }
      }
    });
  }
}

function animateTokenSimple(playerId, fromTile, toTile) {
  const token = document.querySelector(`.token[data-player-id="${playerId}"]`);
  if (!token) return;
  const fromEl = document.getElementById(`tile-${fromTile}`);
  const toEl = document.getElementById(`tile-${toTile}`);
  if (!fromEl || !toEl) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  token.style.transition = 'none';
  token.style.transform = `translate(${dx}px, ${dy}px)`;
  requestAnimationFrame(() => {
    token.style.transition = 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)';
    token.style.transform = 'translate(0, 0)';
  });
}

function animateTokenAlongPath(playerId, fromTile, toTile, pathType) {
  const token = document.querySelector(`.token[data-player-id="${playerId}"]`);
  if (!token) return;
  const board = document.getElementById('board');
  const boardRect = board.getBoundingClientRect();
  const fromEl = document.getElementById(`tile-${fromTile}`);
  const toEl = document.getElementById(`tile-${toTile}`);
  if (!fromEl || !toEl) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const startX = fromRect.left + fromRect.width / 2 - boardRect.left;
  const startY = fromRect.top + fromRect.height / 2 - boardRect.top;
  const endX = toRect.left + toRect.width / 2 - boardRect.left;
  const endY = toRect.top + toRect.height / 2 - boardRect.top;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const offset = pathType === 'ladder' ? -50 : 50;
  const cpX = midX;
  const cpY = midY + offset;

  const duration = 900;
  const startTime = performance.now();
  const startOffsetX = fromRect.left - boardRect.left;
  const startOffsetY = fromRect.top - boardRect.top;
  token.style.transition = 'none';

  function step(time) {
    const t = Math.min((time - startTime) / duration, 1);
    const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cpX + t * t * endX;
    const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cpY + t * t * endY;
    token.style.transform = `translate(${x - startOffsetX}px, ${y - startOffsetY}px)`;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      token.style.transition = 'transform 0.3s ease';
      token.style.transform = 'translate(0, 0)';
      if (pathType === 'snake') playSnakeEffect(toTile);
      else if (pathType === 'ladder') playLadderEffect(toTile);
    }
  }
  requestAnimationFrame(step);
}
