// js/components/board/boardLayout.js
// Static board data + pure helpers (no DOM access).

export const LADDERS = [[2, 23], [6, 45], [9, 13], [20, 59], [52, 71], [57, 96], [71, 92], [88, 99]];
export const SNAKES = [[16, 6], [47, 26], [49, 11], [56, 53], [62, 19], [64, 60], [87, 24], [93, 73]];
export const FLASHING_TILES = [5, 12, 28, 35, 42, 58, 65, 72, 88, 95];

export function getTileNumber(row, col) {
  const rowFromBottom = 9 - row;
  const isEvenRow = rowFromBottom % 2 === 0;
  const base = rowFromBottom * 10;
  return isEvenRow ? base + col + 1 : base + (10 - col);
}

// Detect if a move is on a ladder or snake
export function getPathType(fromTile, toTile) {
  for (const [bottom, top] of LADDERS) {
    if (bottom === fromTile && top === toTile) return 'ladder';
  }
  for (const [head, tail] of SNAKES) {
    if (head === fromTile && tail === toTile) return 'snake';
  }
  return null;
}
