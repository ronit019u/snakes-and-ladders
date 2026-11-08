// js/components/player/inventory.js
// The 3 item slots and using an item (with a target picker for bomb/arrow).
import { $, showMsg } from '../../utils/dom.js';
import { GameAPI } from '../../api/index.js';
import { playerState } from '../../state/playerState.js';
import { ITEM_ICONS, TARGETED_ITEMS, MAX_INVENTORY } from '../../config/constants.js';
import { handleApiError } from './gameControls.js';
import { tokenBadgeHtml } from '../tokenBadge.js';

export function renderInventory() {
  const el = $('inventory');
  el.innerHTML = '';
  for (let i = 0; i < MAX_INVENTORY; i++) {
    const slot = document.createElement('div');
    const item = playerState.localInventory[i];
    if (item && !playerState.iAmFinished) {
      slot.className = 'item-slot';
      slot.innerText = ITEM_ICONS[item] || '❓';
      slot.dataset.index = i;
      slot.dataset.type = item;
      slot.onclick = () => useItem(item, i);
    } else if (item) {
      slot.className = 'item-slot empty';
      slot.innerText = ITEM_ICONS[item] || '❓';
    } else {
      slot.className = 'item-slot empty';
      slot.innerText = '—';
    }
    el.appendChild(slot);
  }
}

async function useItem(itemType, slotIndex) {
  if (TARGETED_ITEMS.includes(itemType)) {
    await useTargetedItem(itemType, slotIndex);
    return;
  }
  const res = await GameAPI.useItem(itemType);
  if (handleApiError(res)) return;
  showMsg('game-msg', res.msg, res.code === 0);
  if (res.code === 0) {
    playerState.localInventory.splice(slotIndex, 1);
    renderInventory();
  }
  playerState.refresh();
}

async function useTargetedItem(itemType, slotIndex) {
  const r = await GameAPI.getState(playerState.sessionId);
  if (r.code !== 0) { showMsg('game-msg', 'Cannot fetch players', false); return; }
  const others = r.data.activePlayers.filter(p => p.playerId !== playerState.playerId && !p.completedAt);
  if (others.length === 0) { showMsg('game-msg', 'No other players to target', false); return; }
  others.sort((a, b) => b.currentTile - a.currentTile);

  $('target-title').innerText = `${ITEM_ICONS[itemType] || ''} Select a target`;
  const listEl = $('target-list');
  listEl.innerHTML = others.map(p =>
    `<div class="target-row" data-pid="${p.playerId}">
      <span>${tokenBadgeHtml(p)}${p.username}</span>
      <span>Tile ${p.currentTile}</span>
    </div>`
  ).join('');
  $('target-overlay').classList.add('active');

  listEl.querySelectorAll('.target-row').forEach(row => {
    row.onclick = async () => {
      $('target-overlay').classList.remove('active');
      const res = await GameAPI.useItem(itemType, row.dataset.pid);
      if (handleApiError(res)) return;
      showMsg('game-msg', res.msg, true);
      playerState.localInventory.splice(slotIndex, 1);
      renderInventory();
      playerState.refresh();
    };
  });
}
