// js/config/constants.js
// Values that were previously hard-coded in several places.

export const ITEM_ICONS = { rocket: '🚀', bomb: '💣', arrow: '🏹' };
export const TARGETED_ITEMS = ['bomb', 'arrow'];
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export const MAX_INVENTORY = 3;
export const POLL_INTERVAL_MS = 2000;

// The state endpoint doesn't expose the preset's quizTimeout / bonusTimeout,
// so these mirror the defaults used by the backend preset.
export const QUIZ_TIMEOUT_SECS = 15;
export const DEFAULT_BONUS_TIMEOUT_SECS = 15;

// Sent when the pre-roll timer runs out. It can never match a correct
// answer, so the server treats it as a wrong answer (consumes the question
// and issues a new one, or rolls directly if the pool is exhausted).
export const PREROLL_TIMEOUT_ANSWER = 'X';
