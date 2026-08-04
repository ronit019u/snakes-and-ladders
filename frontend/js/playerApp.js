// js/playerApp.js
// Player view – dice uses backend random value, with movement animation.

import { state, setApiBase } from './config.js';
import { GameAPI, QuestionAPI } from './apiService.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from './socketService.js';
import { buildBoard, renderTokens, getFlashingTileColors } from './boardData.js';

let sessionId = null;
let playerId = null;
let myUsername = null;
let iAmOwner = false;
let pollTimer = null;
let currentQuiz = null;
let localInventory = [];
let boardTileEls = null;
let prevPlayers = null;          // for movement animation

const $ = id => document.getElementById(id);

function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
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

    console.log('[Dice] Starting animation, finalValue =', finalValue);

    // Rapid spin (500ms)
    let interval = setInterval(() => {
      diceEl.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      // Deceleration phase
      let step = 0;
      const maxSteps = 12;
      let delay = 80;

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
        delay += 25;
        setTimeout(slowStep, delay);
      }
      setTimeout(slowStep, 80);
    }, 500);
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
    if (event === 'bonus_result') {
      showMsg('game-msg', `🎉 Bonus won by ${data.winnerUsername} (+${data.bonusValue})`, true);
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

  if (gameStatus === 'waiting') {
    renderWaitingPlayers(activePlayers);
  } else if (gameStatus === 'InProgress') {
    if ($('game-screen').classList.contains('hidden')) enterGameScreen(presets);
    const players = activePlayers;
    renderGame(players, prevPlayers);
    prevPlayers = players.map(p => ({ ...p })); // deep copy for next animation
  } else if (gameStatus === 'Completed') {
    clearInterval(pollTimer);
    const winner = activePlayers.find(p => p.playerId === winnerId);
    showMsg('game-msg', `🏆 Game over! Winner: ${winner ? winner.username : winnerId}`, true);
  }
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
    presets.flashingTile?.blueProb || 0.5,
    presets.flashingTile?.redProb || 0.3
  ) : null;

  boardTileEls = buildBoard($('board'), flashColors);
  $('my-status').innerText = `You: ${myUsername}`;
  renderInventory();
  prevPlayers = null; // first render – no animation
}

function renderGame(players, oldPlayers = null) {
  renderTokens(players, oldPlayers); // animation handled by boardData

  // Leaderboard
  const sorted = [...players].sort((a, b) => b.currentTile - a.currentTile);
  const top5 = sorted.slice(0, 5);
  const myRank = sorted.findIndex(p => p.playerId === playerId) + 1;
  let html = top5.map((p, i) =>
    `<div class="leaderboard-row"><span>#${i+1} ${p.username}</span><span>Tile ${p.currentTile}</span></div>`
  ).join('');
  if (myRank > 5) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${me.username} (you)</span><span>Tile ${me.currentTile}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}

// ---------- Roll Dice (uses backend random value) ----------
async function handleRoll() {
  const btn = $('roll-btn');
  if (btn.disabled) return;

  // 1. Call backend /api/game/move (no body = roll dice)
  const result = await GameAPI.rollDice();
  console.log('[Dice] Backend response:', result);

  if (result.code !== 0) {
    showMsg('game-msg', result.msg, false);
    return;
  }

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

  // 6. Refresh state – triggers movement animation
  pollState();
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

// ---------- Inventory & Bomb ----------
function renderInventory() {
  const el = $('inventory');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    const item = localInventory[i];
    if (item) {
      slot.className = 'item-slot';
      const icon = item === 'rocket' ? '🚀' : item === 'bomb' ? '💣' : '❓';
      slot.innerText = icon;
      slot.dataset.index = i;
      slot.dataset.type = item;
      slot.onclick = () => useItem(item, i);
    } else {
      slot.className = 'item-slot empty';
      slot.innerText = '—';
    }
    el.appendChild(slot);
  }
}

async function useItem(itemType, slotIndex) {
  if (itemType === 'bomb') {
    const r = await GameAPI.getState(sessionId);
    if (r.code !== 0) {
      showMsg('game-msg', 'Cannot fetch players', false);
      return;
    }
    const others = r.data.activePlayers.filter(p => p.playerId !== playerId);
    if (others.length === 0) {
      showMsg('game-msg', 'No other players to target', false);
      return;
    }
    others.sort((a, b) => b.currentTile - a.currentTile);
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
        const res = await GameAPI.useItem('bomb', targetId);
        showMsg('game-msg', res.msg, res.code === 0);
        if (res.code === 0) {
          localInventory.splice(slotIndex, 1);
          renderInventory();
        }
        pollState();
      };
    });
  } else {
    // Rocket
    const res = await GameAPI.useItem(itemType);
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