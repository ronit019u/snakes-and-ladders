// js/state/playerState.js
// Everything the player page shares between its components. One mutable
// object (not separate `let`s) so any module can read AND update it.
// State used by a single component (e.g. the open quiz) stays inside that
// component's own file.
import { DEFAULT_BONUS_TIMEOUT_SECS } from '../config/constants.js';

export const playerState = {
  sessionId: null,
  playerId: null,
  myUsername: null,
  pollTimer: null,
  localInventory: [],
  boardTileEls: null,
  prevPlayers: null,
  leaderboardCount: 5,
  bonusTimeoutSecs: DEFAULT_BONUS_TIMEOUT_SECS,
  iAmFinished: false,
  sessionStartedAt: null,
  rollInProgress: false,

  // Components call this to re-poll the server. pages/player/playerPage.js
  // sets it to pollState(); keeping it here avoids circular imports.
  refresh: () => {}
};
