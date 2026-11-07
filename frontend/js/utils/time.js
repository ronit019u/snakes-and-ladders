// js/utils/time.js

// Renders a completedAt/startedAt gap as "m:ss". Falls back to '' if either
// timestamp is missing so callers can decide how to degrade gracefully.
export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const ms = new Date(endIso) - new Date(startIso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 🥇🥈🥉 line used by both the player and admin game-over screens.
export function buildPodiumHtml(players, startedAt, fallbackWinnerId) {
  const finishers = (players || [])
    .filter(p => p.completedAt)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  const medals = ['🥇', '🥈', '🥉'];
  if (!finishers.length) return fallbackWinnerId || 'unknown';
  return finishers.map((p, i) => {
    const t = formatDuration(startedAt, p.completedAt);
    return `${medals[i] || '🏅'} ${p.username}${t ? ` (${t})` : ''}`;
  }).join('&nbsp;&nbsp;');
}
