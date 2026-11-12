// js/pages/player/roll.js
// The Roll Dice button: pre-roll quiz → dice animation → apply the result.
import { $, showMsg } from '../../utils/dom.js';
import { GameAPI } from '../../api/index.js';
import { playerState } from '../../state/playerState.js';
import { ITEM_ICONS } from '../../config/constants.js';
import { handleApiError } from '../../components/player/gameControls.js';
import { runPrerollQuiz } from '../../components/player/prerollQuiz.js';
import { playDiceAnimation } from '../../components/player/diceAnimation.js';
import { renderInventory } from '../../components/player/inventory.js';
import { openQuiz } from '../../components/player/quizModal.js';
import { pollState, startPolling, stopPolling } from './polling.js';

// Syncs the inventory from the (authoritative) roll response and returns the
// message to show for this roll.
function applyRollResult(result) {
  const data = result.data || {};

  // The roll response always carries the post-move inventory (max 3). Sync
  // from it instead of pushing locally, so a grant that was blocked by a
  // full inventory never shows up as a phantom item.
  const prevCount = playerState.localInventory.length;
  if (Array.isArray(data.inventory)) {
    playerState.localInventory = [...data.inventory];
    renderInventory();
  }

  if (!data.itemGranted) return { message: result.msg, ok: true };

  // itemGranted reports what the flashing tile drew, even if it could not be stored.
  const icon = ITEM_ICONS[data.itemGranted] || '';
  const wasAdded = playerState.localInventory.length > prevCount;
  return {
    ok: wasAdded,
    message: wasAdded
      ? `⚡ Flashing tile! You got ${icon} ${data.itemGranted}`
      : `⚡ Flashing tile — ${icon} ${data.itemGranted} drawn, but your inventory is full (item lost)!`
  };
}

export async function handleRoll() {
  const btn = $('roll-btn');
  if (btn.disabled || playerState.rollInProgress) return;
  playerState.rollInProgress = true;
  btn.disabled = true;
  stopPolling();
  try {
    const first = await GameAPI.rollDice();
    if (handleApiError(first)) return;

    // Keeps asking until the server actually rolls (diceValue present). An
    // exhausted question pool skips this entirely: `first` is already a roll.
    const pre = await runPrerollQuiz(first);
    if (pre.status !== 'rolled') return;

    const result = pre.result;
    const data = result.data || {};
    if (data.diceValue !== undefined) await playDiceAnimation(data.diceValue);

    const { message, ok } = applyRollResult(result);
    if (data.needsQuiz) {
      if (data.itemGranted) showMsg('game-msg', message, ok);
      openQuiz();
    } else {
      showMsg('game-msg', message, ok);
    }
    await pollState();
  } finally {
    playerState.rollInProgress = false;
    if (!playerState.iAmFinished) btn.disabled = false;
    startPolling();
  }
}
