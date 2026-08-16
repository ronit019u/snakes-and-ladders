// js/playerApp.js
// Player view – dice uses backend random value, with movement animation.

import { state, setApiBase } from './config.js';
import { GameAPI, QuestionAPI, BonusAPI } from './apiService.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from './socketService.js';
import { buildBoard, renderTokens, getFlashingTileColors } from './boardData.js';

const ITEM_ICONS = { rocket: '🚀', bomb: '💣', arrow: '🏹' };
const TARGETED_ITEMS = ['bomb', 'arrow']; // items that require picking an opponent

let sessionId = null;
let playerId = null;
let myUsername = null;
let iAmOwner = false;
let pollTimer = null;
let currentQuiz = null;
let currentBonus = null;         // { bonusRoundId, timerHandle }
let localInventory = [];
let boardTileEls = null;
let prevPlayers = null;          // for movement animation
let leaderboardCount = 5;        // from presets.leaderboardDisplayCount / state.leaderboardDisplayCount
let bonusTimeoutSecs = 15;       // from presets.bonusTimeout
let iAmFinished = false;         // set once my own completedAt is non-null (error 2020 guard)

const $ = id => document.getElementById(id);

function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
}

// Central place to react to backend error codes so every caller doesn't
// have to special-case them individually. Returns true if the error was
// specially handled (caller can usually just stop after this).
function handleApiError(r, elId = 'game-msg') {
  if (r.code === 2020) {
    iAmFinished = true;
    showMsg(elId, `🏁 You've already finished the game — just watching the rest play out.`, false);
    lockGameControls();
    return true;
  }
  if (r.code !== 0) {
    showMsg(elId, r.msg, false);
    return true;
  }
  return false;
}

function lockGameControls() {
  const rollBtn = $('roll-btn');
  if (rollBtn) rollBtn.disabled = true;
  document.querySelectorAll('.item-slot').forEach((el) => { el.onclick = null; el.classList.add('empty'); });
}

function withLoadingState(buttonEl, loadingText, fn) {
  return async (...args) => {
    if (buttonEl.disabled) return;
    const original = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = loadingText;
    try {
      await fn(...args);
    } catch (err) {
      console.error('[playerApp] unexpected error:', err);
      showMsg('game-msg', `Unexpected error: ${err.message}`, false);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerText = original;
    }
  };
}

// ---------- Dice spin animation (visual only) ----------
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function playDiceAnimation(finalValue) {
  return new Promise((resolve) => {
    const diceEl = $('dice-display');
    const btn = $('roll-btn');
    btn.disabled = true;
    diceEl.classList.add('spin');

    // Rapid spin (350ms)
    let interval = setInterval(() => {
      diceEl.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      // Short deceleration phase — ~700ms total, so the whole roll
      // (spin + decel) lands around 1s instead of the old ~3s.
      let step = 0;
      const maxSteps = 6;
      let delay = 60;

      function slowStep() {
        if (step >= maxSteps) {
          // Display the actual backend value
          const idx = Math.min(Math.max(finalValue - 1, 0), 5);
          diceEl.textContent = DICE_FACES[idx] || '🎲';
          diceEl.classList.remove('spin');
          btn.disabled = false;
          resolve();
          return;
        }
        diceEl.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
        step++;
        delay += 20;
        setTimeout(slowStep, delay);
      }
      setTimeout(slowStep, 60);
    }, 350);
  });
}

// ---------- Socket ----------
function setupSocket() {
  connectSocket();
  onSocketConnect(() => {
    $('socket-dot').classList.add('on');
    $('socket-status').innerText = 'connected';
    if (sessionId) joinRoom(sessionId, playerId);
  });
  onSocketDisconnect(() => {
    $('socket-dot').classList.remove('on');
    $('socket-status').innerText = 'disconnected';
  });
  onSocketEvent((event, data) => {
    if (event === 'bonus_round_started') {
      openBonusRound(data);
    } else if (event === 'bonus_round_expired') {
      handleBonusExpired(data);
    } else if (event === 'bonus_result') {
      handleBonusResult(data);
    } else if (event === 'game_over') {
      handleGameOver(data);
    }
    if (sessionId) pollState();
  });
}

// ---------- Create / Join ----------
async function handleCreate() {
  myUsername = $('username-input').value.trim();
  if (!myUsername) return showMsg('join-msg', 'Enter a username', false);
  const r = await GameAPI.create(myUsername);
  if (r.code !== 0) return showMsg('join-msg', r.msg, false);
  sessionId = r.data.sessionId;
  playerId = r.data.playerId;
  iAmOwner = true;
  $('start-game-btn').classList.remove('hidden');
  enterWaitingRoom();
}

async function handleJoin() {
  myUsername = $('username-input').value.trim();
  const code = $('session-input').value.trim();
  if (!myUsername) return showMsg('join-msg', 'Enter a username', false);
  if (!code) return showMsg('join-msg', 'Enter session code', false);
  const r = await GameAPI.join(code, myUsername);
  if (r.code !== 0) return showMsg('join-msg', r.msg, false);
  sessionId = r.data.sessionId;
  playerId = r.data.playerId;
  enterWaitingRoom();
}

function enterWaitingRoom() {
  $('join-screen').classList.add('hidden');
  $('waiting-screen').classList.remove('hidden');
  $('session-code-display').innerText = sessionId;
  joinRoom(sessionId, playerId);
  pollTimer = setInterval(pollState, 2000);
  pollState();
}

async function handleStart() {
  const r = await GameAPI.start();
  if (r.code !== 0) showMsg('waiting-msg', r.msg, false);
}

// ---------- Polling ----------
async function pollState() {
  if (!sessionId) return;
  const r = await GameAPI.getState(sessionId);
  if (r.code !== 0) return;
  const { gameStatus, activePlayers, winnerId, presets } = r.data;

  // leaderboardDisplayCount is returned top-level per the updated
  // /api/game/state/:sessionId spec, but fall back to the preset copy.
  leaderboardCount = r.data.leaderboardDisplayCount || presets?.leaderboardDisplayCount || 5;
  bonusTimeoutSecs = presets?.bonusTimeout || 15;

  const me = activePlayers?.find(p => p.playerId === playerId);
  if (me && me.completedAt && !iAmFinished) {
    iAmFinished = true;
    lockGameControls();
    showMsg('game-msg', `🏁 You reached tile 100! Waiting for the rest of the game to finish…`, true);
  }

  if (gameStatus === 'waiting') {
    renderWaitingPlayers(activePlayers);
  } else if (gameStatus === 'InProgress') {
    if ($('game-screen').classList.contains('hidden')) enterGameScreen(presets);
    const players = activePlayers;
    renderGame(players, prevPlayers);
    prevPlayers = players.map(p => ({ ...p })); // deep copy for next animation
  } else if (gameStatus === 'Completed') {
    clearInterval(pollTimer);
    handleGameOver({ winnerId, activePlayers });
  }
}

// game_over now fires once 3 players have finished (not just 1), so show a
// small podium of finishers rather than a single "winner" line.
function handleGameOver(data) {
  clearInterval(pollTimer);
  const players = data.activePlayers || [];
  const finishers = players
    .filter(p => p.completedAt)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

  const medals = ['🥇', '🥈', '🥉'];
  const podium = finishers.length
    ? finishers.map((p, i) => `${medals[i] || '🏅'} ${p.username}`).join('&nbsp;&nbsp;')
    : (data.winnerId || 'unknown');

  showMsg('game-msg', `🏆 Game over! ${podium}`, true);
  $('game-status-label').innerText = 'Completed';
}

function renderWaitingPlayers(players) {
  $('waiting-players').innerHTML =
    players.map(p => `<div class="player-row"><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</div>`).join('') +
    `<div style="font-size:11px;color:#64748b;margin-top:6px;">${players.length} / 25 joined</div>`;
}

function enterGameScreen(presets) {
  $('waiting-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');

  const flashColors = presets ? getFlashingTileColors(
    presets.flashingTile?.blueProb ?? 30,
    presets.flashingTile?.redProb ?? 30
  ) : null;

  boardTileEls = buildBoard($('board'), flashColors);
  $('my-status').innerText = `You: ${myUsername}`;
  renderInventory();
  prevPlayers = null; // first render – no animation
}

function renderGame(players, oldPlayers = null) {
  renderTokens(players, oldPlayers); // animation handled by boardData

  // Leaderboard — finished players (by completedAt) rank above everyone
  // still moving, tied-broken by tile; count of rows shown comes from
  // the preset's leaderboardDisplayCount.
  const sorted = [...players].sort((a, b) => {
    if (a.completedAt && b.completedAt) return new Date(a.completedAt) - new Date(b.completedAt);
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return b.currentTile - a.currentTile;
  });
  const topN = sorted.slice(0, leaderboardCount);
  const myRank = sorted.findIndex(p => p.playerId === playerId) + 1;

  const rowHtml = (p, i) => {
    const status = p.completedAt ? '🏁 Finished' : `Tile ${p.currentTile}`;
    return `<div class="leaderboard-row"><span>#${i + 1} ${p.username}</span><span>${status}</span></div>`;
  };

  let html = topN.map((p, i) => rowHtml(p, i)).join('');
  if (myRank > leaderboardCount) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${me.username} (you)</span><span>${me.completedAt ? '🏁 Finished' : `Tile ${me.currentTile}`}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}

// ---------- Roll Dice (uses backend random value) ----------
async function handleRoll() {
  const btn = $('roll-btn');
  if (btn.disabled) return;

  // Pause the 2s background poll for the duration of the roll. Without
  // this, the interval can fire mid-animation, pull the already-updated
  // tile from the backend, and snap the token into place while the dice
  // is still spinning — the "piece moves before the result appears" bug.
  clearInterval(pollTimer);

  try {
    // 1. Call backend /api/game/move (no body = roll dice)
    const result = await GameAPI.rollDice();
    console.log('[Dice] Backend response:', result);

    if (handleApiError(result)) return;

    // 2. Backend returns the dice value (1–6)
    const diceValue = result.data.diceValue;

    // 3. Play dice animation showing the real value
    await playDiceAnimation(diceValue);

    // 4. Handle item grant (if any)
    if (result.data.itemGranted) {
      localInventory.push(result.data.itemGranted);
      renderInventory();
      showMsg('game-msg', `🎁 You received: ${result.data.itemGranted}`, true);
    }

    // 5. Handle quiz (if backend indicates)
    if (result.data.needsQuiz) {
      openQuiz();
    } else {
      showMsg('game-msg', result.msg, true);
    }

    // 6. Refresh state – triggers movement animation, now that the dice
    // animation has actually finished
    await pollState();
  } finally {
    // Resume regular polling regardless of how the roll turned out
    pollTimer = setInterval(pollState, 2000);
  }
}

// ---------- Quiz ----------
async function openQuiz() {
  const q = await QuestionAPI.getRandom(sessionId);
  if (q.code !== 0) return showMsg('game-msg', q.msg, false);
  currentQuiz = { questionId: q.data.questionId, timerHandle: null };
  $('quiz-question').innerText = q.data.questionText;
  $('quiz-result').innerText = '';
  const optsEl = $('quiz-options');
  optsEl.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((letter, i) => {
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.innerText = `${letter}. ${q.data.options[i]}`;
    b.onclick = () => submitQuizAnswer(letter);
    optsEl.appendChild(b);
  });
  $('quiz-overlay').classList.add('active');
  let timeLeft = 15;
  $('quiz-timer').innerText = timeLeft;
  currentQuiz.timerHandle = setInterval(() => {
    timeLeft--;
    $('quiz-timer').innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(currentQuiz.timerHandle);
      document.querySelectorAll('.quiz-opt').forEach(b => b.disabled = true);
      submitQuizAnswer(null);
    }
  }, 1000);
}

async function submitQuizAnswer(letter) {
  if (currentQuiz.timerHandle) clearInterval(currentQuiz.timerHandle);
  document.querySelectorAll('.quiz-opt').forEach(b => b.disabled = true);
  const optionToSend = letter || 'A';
  const result = await QuestionAPI.validate(currentQuiz.questionId, optionToSend);
  if (result.code !== 0) {
    $('quiz-result').innerText = result.msg;
    setTimeout(() => $('quiz-overlay').classList.remove('active'), 1500);
    return;
  }
  $('quiz-result').innerText = result.data.correct
    ? `✅ Correct! Moving to tile ${result.data.targetTile}`
    : `❌ Incorrect. Moving to tile ${result.data.targetTile}`;
  await GameAPI.finalizeMove(result.data.targetTile);
  setTimeout(() => {
    $('quiz-overlay').classList.remove('active');
    pollState();
  }, 1500);
}

// ---------- Bonus Round ----------
// Triggered by the backend via socket (timer-based every bonus.interval
// seconds, or when a player lands on a 10-tile group for the first time
// that session). Any not-yet-finished player can answer; first correct
// answer wins the reward, wrong answers get bonus.penaltySteps knocked off.
function openBonusRound(data) {
  if (iAmFinished) return; // finished players can't participate (error 2020)
  if (currentBonus?.timerHandle) clearInterval(currentBonus.timerHandle);

  currentBonus = { bonusRoundId: data.bonusRoundId, timerHandle: null };
  $('bonus-question').innerText = data.questionText;
  $('bonus-result').innerText = '';
  const optsEl = $('bonus-options');
  optsEl.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((letter, i) => {
    if (data.options[i] === undefined) return;
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.innerText = `${letter}. ${data.options[i]}`;
    b.onclick = () => submitBonusAnswer(letter);
    optsEl.appendChild(b);
  });
  $('bonus-overlay').classList.add('active');

  let timeLeft = bonusTimeoutSecs;
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

async function submitBonusAnswer(letter) {
  if (!currentBonus) return;
  document.querySelectorAll('#bonus-options .quiz-opt').forEach(b => b.disabled = true);
  const result = await BonusAPI.submitAnswer(currentBonus.bonusRoundId, letter);
  if (handleApiError(result, 'bonus-result')) return;
  // Server broadcasts bonus_result / bonus_round_expired to everyone, which
  // is what actually closes the overlay — this just gives instant local
  // feedback while we wait for that broadcast.
  $('bonus-result').innerText = result.data?.correct
    ? '✅ Correct! Waiting for confirmation…'
    : `❌ Wrong — knocked back ${result.data?.penalty ?? ''} steps.`;
}

function closeBonusOverlay() {
  if (currentBonus?.timerHandle) clearInterval(currentBonus.timerHandle);
  currentBonus = null;
  $('bonus-overlay').classList.remove('active');
}

function handleBonusExpired(data) {
  if (!currentBonus || currentBonus.bonusRoundId !== data.bonusRoundId) return;
  $('bonus-result').innerText = '⌛ Time\'s up — no one answered in time.';
  setTimeout(closeBonusOverlay, 1500);
}

// Backend sends bonusType as 'item_grant' or 'forward_boost' (see
// bonusController.js's reward.type) — not the 'item'/'forward' shorthand
// used in the API doc's wording. Match the real values.
function handleBonusResult(data) {
  const wasMine = currentBonus && currentBonus.bonusRoundId === data.bonusRoundId;
  const isItem = data.bonusType === 'item_grant';
  const reward = isItem ? `item: ${ITEM_ICONS[data.bonusValue] || ''} ${data.bonusValue}` : `+${data.bonusValue} steps`;
  showMsg('game-msg', `🎉 Bonus round won by ${data.winnerUsername} (${reward})`, true);
  if (data.winnerPlayerId === playerId && isItem) {
    localInventory.push(data.bonusValue);
    renderInventory();
  }
  if (wasMine) {
    $('bonus-result').innerText = data.winnerPlayerId === playerId ? '✅ You won it!' : `🏆 ${data.winnerUsername} got it first.`;
    setTimeout(closeBonusOverlay, 1500);
  }
}

// ---------- Inventory & Item Use (rocket / bomb / arrow) ----------
function renderInventory() {
  const el = $('inventory');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    const item = localInventory[i];
    if (item && !iAmFinished) {
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
    // bomb and arrow both require picking an opposing player as the target
    const r = await GameAPI.getState(sessionId);
    if (r.code !== 0) {
      showMsg('game-msg', 'Cannot fetch players', false);
      return;
    }
    const others = r.data.activePlayers.filter(p => p.playerId !== playerId && !p.completedAt);
    if (others.length === 0) {
      showMsg('game-msg', 'No other players to target', false);
      return;
    }
    others.sort((a, b) => b.currentTile - a.currentTile);
    $('target-title').innerText = `${ITEM_ICONS[itemType] || ''} Select a target`;
    const listEl = $('target-list');
    listEl.innerHTML = others.map(p =>
      `<div class="target-row" data-pid="${p.playerId}">
        <span><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</span>
        <span>Tile ${p.currentTile}</span>
      </div>`
    ).join('');
    $('target-overlay').classList.add('active');
    listEl.querySelectorAll('.target-row').forEach(row => {
      row.onclick = async () => {
        $('target-overlay').classList.remove('active');
        const targetId = row.dataset.pid;
        const res = await GameAPI.useItem(itemType, targetId);
        if (handleApiError(res)) return;
        showMsg('game-msg', res.msg, true);
        localInventory.splice(slotIndex, 1);
        renderInventory();
        pollState();
      };
    });
  } else {
    // Rocket — no target needed, self-effect only
    const res = await GameAPI.useItem(itemType);
    if (handleApiError(res)) return;
    showMsg('game-msg', res.msg, res.code === 0);
    if (res.code === 0) {
      localInventory.splice(slotIndex, 1);
      renderInventory();
    }
    pollState();
  }
}

// ---------- Init ----------
function init() {
  $('reconnect-api-btn').onclick = () => { setApiBase($('api-base').value); setupSocket(); };
  $('create-btn').onclick = withLoadingState($('create-btn'), 'Creating…', handleCreate);
  $('join-btn').onclick = withLoadingState($('join-btn'), 'Joining…', handleJoin);
  $('start-game-btn').onclick = withLoadingState($('start-game-btn'), 'Starting…', handleStart);
  $('roll-btn').onclick = async () => {
    try {
      await handleRoll();
    } catch (err) {
      console.error('[playerApp] roll error:', err);
      showMsg('game-msg', `Error: ${err.message}`, false);
      $('roll-btn').disabled = false;
      $('dice-display').classList.remove('spin');
      $('dice-display').innerText = '🎲';
    }
  };
  $('target-cancel-btn').onclick = () => $('target-overlay').classList.remove('active');
  $('api-base').value = state.apiBase;
  setApiBase($('api-base').value);
  setupSocket();
}

document.addEventListener('DOMContentLoaded', init);