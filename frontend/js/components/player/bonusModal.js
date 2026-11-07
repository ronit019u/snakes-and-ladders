// js/components/player/bonusModal.js
// Timed bonus round: first correct answer wins the reward.
import { $, showMsg } from '../../utils/dom.js';
import { BonusAPI } from '../../api/index.js';
import { playSfx } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { ITEM_ICONS, MAX_INVENTORY, OPTION_LETTERS } from '../../config/constants.js';
import { handleApiError } from './gameControls.js';
import { renderInventory } from './inventory.js';

let currentBonus = null;

export function openBonusRound(data) {
  if (playerState.iAmFinished) return;
  if (currentBonus?.timerHandle) clearInterval(currentBonus.timerHandle);
  currentBonus = { bonusRoundId: data.bonusRoundId, timerHandle: null };
  $('bonus-question').innerText = data.questionText;
  $('bonus-result').innerText = '';
  const optsEl = $('bonus-options');
  optsEl.innerHTML = '';
  OPTION_LETTERS.forEach((letter, i) => {
    if (data.options[i] === undefined) return;
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.innerText = `${letter}. ${data.options[i]}`;
    b.onclick = () => submitBonusAnswer(letter);
    optsEl.appendChild(b);
  });
  $('bonus-overlay').classList.add('active');
  let timeLeft = playerState.bonusTimeoutSecs;
  $('bonus-timer').innerText = timeLeft;
  currentBonus.timerHandle = setInterval(() => {
    timeLeft--;
    $('bonus-timer').innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(currentBonus.timerHandle);
      document.querySelectorAll('#bonus-options .quiz-opt').forEach(b => b.disabled = true);
    }
  }, 1000);
}

// A wrong answer already has its consequence applied server-side —
// bonusController.submitBonusAnswer moves this player back the penalty
// steps immediately, regardless of whether the round is still open for
// everyone else. So unlike a *correct* answer (which has to wait to find
// out if it actually won, since only the first correct answer counts),
// there's nothing left to wait for once a wrong answer comes back — close
// the overlay right away instead of leaving the player blocked until the
// round ends for other players.
async function submitBonusAnswer(letter) {
  if (!currentBonus) return;
  document.querySelectorAll('#bonus-options .quiz-opt').forEach(b => b.disabled = true);
  const result = await BonusAPI.submitAnswer(currentBonus.bonusRoundId, letter);
  if (handleApiError(result, 'bonus-result')) return;

  if (result.data?.correct && result.data?.winner === false) {
    // Someone else's answer beat this one to the server by a hair.
    $('bonus-result').innerText = '⏱️ Correct, but someone else answered first — waiting for the round to end…';
  } else if (result.data?.correct) {
    $('bonus-result').innerText = '✅ Correct! Waiting for confirmation…';
    playSfx('correct');
  } else {
    $('bonus-result').innerText = `❌ Wrong — knocked back ${result.data?.penalty ?? ''} steps.`;
    playSfx('wrong');
    setTimeout(closeBonusOverlay, 1200);
    playerState.refresh();
  }
}

function closeBonusOverlay() {
  if (currentBonus?.timerHandle) clearInterval(currentBonus.timerHandle);
  currentBonus = null;
  $('bonus-overlay').classList.remove('active');
}

export function handleBonusExpired(data) {
  if (!currentBonus || currentBonus.bonusRoundId !== data.bonusRoundId) return;
  $('bonus-result').innerText = '⌛ Time\'s up — no one answered.';
  setTimeout(closeBonusOverlay, 1500);
}

export function handleBonusResult(data) {
  const wasMine = currentBonus && currentBonus.bonusRoundId === data.bonusRoundId;
  const isItem = data.bonusType === 'item_grant';
  const reward = isItem ? `item: ${ITEM_ICONS[data.bonusValue] || ''} ${data.bonusValue}` : `+${data.bonusValue} steps`;
  const iWon = data.winnerPlayerId === playerState.playerId;

  // This response doesn't include an authoritative inventory array to sync
  // from (unlike the dice-roll move response), so mirror the backend's own
  // guard here: it only pushes the reward when the inventory has room for
  // it. As long as localInventory stays accurate elsewhere, this predicts
  // the backend's decision correctly and avoids "phantom" items that were
  // actually blocked server-side from appearing later.
  let inventoryFull = false;
  if (iWon && isItem) {
    if (playerState.localInventory.length < MAX_INVENTORY) {
      playerState.localInventory.push(data.bonusValue);
      renderInventory();
    } else {
      inventoryFull = true;
    }
  }

  const fullNote = (iWon && inventoryFull) ? ' — inventory full, item lost!' : '';
  showMsg('game-msg', `🎉 Bonus won by ${data.winnerUsername} (${reward})${fullNote}`, true);

  if (wasMine) {
    $('bonus-result').innerText = iWon
      ? (inventoryFull ? '✅ You won it, but your inventory was full — item lost!' : '✅ You won it!')
      : `🏆 ${data.winnerUsername} got it first.`;
    setTimeout(closeBonusOverlay, 1500);
  }
}
