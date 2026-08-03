// js/playerApp.js
// Entry point for player.html — real calls against the CyberSnake backend.
import { state, setApiBase } from './config.js';
import { GameAPI, QuestionAPI } from './apiService.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from './socketService.js';
import { buildBoard, renderTokens } from './boardData.js';

let sessionId = null;
let playerId = null;
let myUsername = null;
let iAmOwner = false;
let pollTimer = null;
let currentQuiz = null;
let localInventory = []; // client-side only display state — see README note on backend gap

const $ = (id) => document.getElementById(id);

function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
}

// Wraps a button handler so it always shows a loading state while in flight,
// re-enables itself no matter what happens, and can never look "stuck" —
// even on a network failure, timeout, or thrown exception.
function withLoadingState(buttonEl, loadingText, fn) {
  return async (...args) => {
    if (buttonEl.disabled) return; // ignore double-clicks while a request is in flight
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = loadingText;
    try {
      await fn(...args);
    } catch (err) {
      console.error('[playerApp] unexpected error:', err);
      showMsg('join-msg', `Unexpected frontend error: ${err.message}`, false);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerText = originalText;
    }
  };
}

// ---------- Socket wiring ----------
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
      showMsg('game-msg', `🎉 Bonus round won by ${data.winnerUsername} (+${data.bonusValue})`, true);
    }
    if (sessionId) pollState();
  });
}

// ---------- Join / Create ----------
async function handleCreate() {
  myUsername = $('username-input').value.trim();
  if (!myUsername) return showMsg('join-msg', 'Enter a username first', false);
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
  if (!myUsername) return showMsg('join-msg', 'Enter a username first', false);
  if (!code) return showMsg('join-msg', 'Enter a session code first', false);
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

// ---------- Polling / state sync ----------
async function pollState() {
  if (!sessionId) return;
  const r = await GameAPI.getState(sessionId);
  if (r.code !== 0) return;
  const { gameStatus, activePlayers, winnerId } = r.data;

  if (gameStatus === 'waiting') {
    renderWaitingPlayers(activePlayers);
  } else if (gameStatus === 'InProgress') {
    if ($('game-screen').classList.contains('hidden')) enterGameScreen();
    renderGame(activePlayers);
  } else if (gameStatus === 'Completed') {
    clearInterval(pollTimer);
    const winner = activePlayers.find((p) => p.playerId === winnerId);
    showMsg('game-msg', `🏆 Game over! Winner: ${winner ? winner.username : winnerId}`, true);
  }
}

function renderWaitingPlayers(players) {
  $('waiting-players').innerHTML =
    players.map((p) => `<div class="player-row"><span class="swatch" style="background:${p.tokenColor}"></span>${p.username}</div>`).join('') +
    `<div style="font-size:11px;color:#64748b;margin-top:6px;">${players.length} / 25 joined</div>`;
}

function enterGameScreen() {
  $('waiting-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  buildBoard($('board'));
  $('my-status').innerText = `You: ${myUsername}`;
  renderInventory();
}

function renderGame(players) {
  renderTokens(players);

  const sorted = [...players].sort((a, b) => b.currentTile - a.currentTile);
  const top5 = sorted.slice(0, 5);
  const myRank = sorted.findIndex((p) => p.playerId === playerId) + 1;

  let html = top5.map((p, i) => `<div class="leaderboard-row"><span>#${i + 1} ${p.username}</span><span>Tile ${p.currentTile}</span></div>`).join('');
  if (myRank > 5) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${me.username} (you)</span><span>Tile ${me.currentTile}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}

// ---------- Roll dice ----------
async function handleRoll() {
  const btn = $('roll-btn');
  const diceEl = $('dice-display');
  btn.disabled = true;
  diceEl.classList.add('spin');

  const spinInterval = setInterval(() => {
    diceEl.innerText = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][Math.floor(Math.random() * 6)];
  }, 80);

  const r = await GameAPI.rollDice();

  setTimeout(async () => {
    clearInterval(spinInterval);
    diceEl.classList.remove('spin');
    diceEl.innerText = '🎲';
    btn.disabled = false;

    if (r.code !== 0) return showMsg('game-msg', r.msg, false);

    if (r.data.itemGranted) {
      localInventory.push(r.data.itemGranted);
      renderInventory();
      showMsg('game-msg', `🎁 You received: ${r.data.itemGranted}`, true);
    }

    if (r.data.needsQuiz) {
      openQuiz();
    } else {
      showMsg('game-msg', r.msg, true);
    }
    pollState();
  }, 700);
}

// ---------- Quiz flow ----------
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
      document.querySelectorAll('.quiz-opt').forEach((b) => (b.disabled = true));
      submitQuizAnswer(null);
    }
  }, 1000);
}

async function submitQuizAnswer(letter) {
  if (currentQuiz.timerHandle) clearInterval(currentQuiz.timerHandle);
  document.querySelectorAll('.quiz-opt').forEach((b) => (b.disabled = true));

  const optionToSend = letter || 'A'; // timed out — send a throwaway option
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

// ---------- Inventory / items ----------
function renderInventory() {
  const el = $('inventory');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    const item = localInventory[i];
    if (item) {
      slot.className = 'item-slot';
      slot.innerText = item === 'rocket' ? '🚀' : item === 'bomb' ? '💣' : '❓';
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
    const others = r.data.activePlayers.filter((p) => p.playerId !== playerId).sort((a, b) => b.currentTile - a.currentTile);
    const listEl = $('target-list');
    listEl.innerHTML = others
      .map((p) => `<div class="target-row" data-pid="${p.playerId}"><span>${p.username}</span><span>Tile ${p.currentTile}</span></div>`)
      .join('');
    $('target-overlay').classList.add('active');

    listEl.querySelectorAll('.target-row').forEach((row) => {
      row.onclick = async () => {
        $('target-overlay').classList.remove('active');
        const res = await GameAPI.useItem('bomb', row.dataset.pid);
        showMsg('game-msg', res.msg, res.code === 0);
        if (res.code === 0) { localInventory.splice(slotIndex, 1); renderInventory(); }
        pollState();
      };
    });
  } else {
    const res = await GameAPI.useItem(itemType);
    showMsg('game-msg', res.msg, res.code === 0);
    if (res.code === 0) { localInventory.splice(slotIndex, 1); renderInventory(); }
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
      showMsg('game-msg', `Unexpected frontend error: ${err.message}`, false);
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
