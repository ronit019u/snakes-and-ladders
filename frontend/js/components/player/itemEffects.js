// js/components/player/itemEffects.js
// Plays the board FX when ANY player uses an item or an earthquake hits.
//
// handleItemUsed reads `prevPlayers` (last polled snapshot, still un-mutated
// at this point in the tick) to know where the source/target stood *before*
// this event, and `data.activePlayers` (fresh from the broadcast) for where
// they ended up — so the projectile/explosion animates in the right place
// even on the client of a player who didn't fire the item themselves.
//
// The tile differences also give us how far the target was pushed back (or
// the rocket pushed forward), which the FX show as a floating "-3" / "+5".
import { showMsg } from '../../utils/dom.js';
import { playerState } from '../../state/playerState.js';
import {
  playBombEffect, playArrowEffect, playRocketEffect, playEarthquakeEffect
} from '../board/index.js';

// A player who hasn't moved yet is on tile 0, which is drawn on tile 1.
const tileOf = (p) => Math.max(1, p?.currentTile || 1);

export function handleItemUsed(data) {
  if (!playerState.boardTileEls) return; // not on the game screen yet
  const { itemType, sourcePlayerId, targetPlayerId, activePlayers } = data || {};
  const findNew = (pid) => activePlayers?.find(p => p.playerId === pid);
  const findOld = (pid) => playerState.prevPlayers?.find(p => p.playerId === pid);

  if (itemType === 'rocket') {
    const newSrc = findNew(sourcePlayerId);
    if (!newSrc) return;
    const oldSrc = findOld(sourcePlayerId);
    const fromTile = oldSrc ? tileOf(oldSrc) : tileOf(newSrc);
    playRocketEffect(fromTile, tileOf(newSrc), tileOf(newSrc) - fromTile);
  } else if (itemType === 'bomb') {
    const oldTgt = findOld(targetPlayerId) || findNew(targetPlayerId);
    if (!oldTgt) return;
    const newTgt = findNew(targetPlayerId);
    const src = findNew(sourcePlayerId) || findOld(sourcePlayerId);
    const steps = newTgt ? tileOf(oldTgt) - tileOf(newTgt) : 0;
    // Lobbed from the thrower's tile onto the target's (pre-hit) tile.
    playBombEffect(tileOf(oldTgt), src ? tileOf(src) : null, steps);
  } else if (itemType === 'arrow') {
    const newSrc = findNew(sourcePlayerId);
    const oldTgt = findOld(targetPlayerId) || findNew(targetPlayerId);
    if (!oldTgt) return;
    const newTgt = findNew(targetPlayerId);
    const fromTile = newSrc ? tileOf(newSrc) : tileOf(oldTgt);
    const steps = newTgt ? tileOf(oldTgt) - tileOf(newTgt) : 0;
    playArrowEffect(fromTile, tileOf(oldTgt), steps);
  }
}

export function handleEarthquake(data) {
  if (!playerState.boardTileEls) return;
  playEarthquakeEffect();
  showMsg('game-msg', `🌍 Earthquake! Everyone active got knocked back ${data?.magnitude ?? ''} tiles.`, false);
}
