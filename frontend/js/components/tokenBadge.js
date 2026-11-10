// js/components/tokenBadge.js
// One place that decides what a player's marker looks like, so the board, the
// leaderboard, the roster and the item-target list all show the SAME thing:
// the player's chosen character on its own.

export function tokenBadgeHtml(p, extraClass = '') {
  const face = p.characterEmoji || '';
  return `<span class="tok-badge ${extraClass}" title="${p.characterName || ''}"><span class="tok-face">${face}</span></span>`;
}
