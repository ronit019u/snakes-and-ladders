// js/components/player/itemEffects.js
// Plays the board FX when ANY player uses an item or an earthquake hits.
//
// handleItemUsed reads `prevPlayers` (last polled snapshot, still un-mutated
// at this point in the tick) to know where the source/target stood *before*
// this event, and `data.activePlayers` (fresh from the broadcast) for where
// they ended up — so the projectile/explosion animates in the right place
// even on the client of a player who didn't fire the item themselves.
import { showMsg } from '../../utils/dom.js';
import { playerState } from '../../state/playerState.js';
import {
  playBombEffect, playArrowEffect, playRocketEffect, playEarthquakeEffect
} from '../board/index.js';

export function handleItemUsed(data) {
  if (!playerState.boardTileEls) return; // not on the game screen yet
  const { itemType, sourcePlayerId, targetPlayerId, activePlayers } = data || {};
  const findNew = (pid) => activePlayers?.find(p => p.playerId === pid);
  const findOld = (pid) => playerState.prevPlayers?.find(p => p.playerId === pid);

  if (itemType === 'rocket') {
    const newSrc = findNew(sourcePlayerId);
    if (!newSrc) return;
    const oldSrc = findOld(sourcePlayerId);
    const fromTile = oldSrc ? oldSrc.currentTile : newSrc.currentTile;
    playRocketEffect(fromTile, newSrc.currentTile);
  } else if (itemType === 'bomb') {
    const oldTgt = findOld(targetPlayerId) || findNew(targetPlayerId);
    if (!oldTgt) return;
    playBombEffect(oldTgt.currentTile);
  } else if (itemType === 'arrow') {
    const newSrc = findNew(sourcePlayerId);
    const oldTgt = findOld(targetPlayerId) || findNew(targetPlayerId);
    if (!oldTgt) return;
    const fromTile = newSrc ? newSrc.currentTile : oldTgt.currentTile;
    playArrowEffect(fromTile, oldTgt.currentTile);
  }
}

export function handleEarthquake(data) {
  if (!playerState.boardTileEls) return;
  playEarthquakeEffect();
  showMsg('game-msg', `🌍 Earthquake! Everyone active got knocked back ${data?.magnitude ?? ''} tiles.`, false);
}
