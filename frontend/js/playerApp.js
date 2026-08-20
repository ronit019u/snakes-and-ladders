// js/playerApp.js
// Player screen – 3D dice, smooth movement, bonus/quiz overlays.

import { state, setApiBase } from './config.js';
import { GameAPI, QuestionAPI, BonusAPI } from './apiService.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from './socketService.js';
import { buildBoard, renderTokens, getFlashingTileColors } from './boardData.js';

const ITEM_ICONS = { rocket: '🚀', bomb: '💣', arrow: '🏹' };
const TARGETED_ITEMS = ['bomb', 'arrow'];

let sessionId = null;
let playerId = null;
let myUsername = null;
let iAmOwner = false;
let pollTimer = null;
let currentQuiz = null;
let currentBonus = null;
let localInventory = [];
let boardTileEls = null;
let prevPlayers = null;
let leaderboardCount = 5;
let bonusTimeoutSecs = 15;
let iAmFinished = false;

const $ = id => document.getElementById(id);

function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
}

function handleApiError(r, elId = 'game-msg') {
  if (r.code === 2020) {
    iAmFinished = true;
    showMsg(elId, `🏁 You've already finished — watching the rest.`, false);
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
  document.querySelectorAll('.item-slot').forEach(el => { el.onclick = null; el.classList.add('empty'); });
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
      console.error('[playerApp]', err);
      showMsg('game-msg', `Unexpected error: ${err.message}`, false);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerText = original;
    }
  };
}

// ---------- 3D Dice Animation ----------
const DICE_ROTATIONS = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: 0, y: 180, z: 0 },
  3: { x: 0, y: -90, z: 0 },
  4: { x: 0, y: 90, z: 0 },
  5: { x: -90, y: 0, z: 0 },
  6: { x: 90, y: 0, z: 0 }
};

function playDiceAnimation(finalValue) {
  return new Promise((resolve) => {
    const dice = $('dice');
    if (!dice) { resolve(); return; }
    const rot = DICE_ROTATIONS[finalValue] || DICE_ROTATIONS[1];
    const turns = 3 + Math.floor(Math.random() * 3);
    const rx = turns * 360 + rot.x;
    const ry = turns * 360 + rot.y;
    const rz = turns * 360 + rot.z;
    dice.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
    setTimeout(resolve, 800);
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
    if (event === 'bonus_round_started') openBonusRound(data);
    else if (event === 'bonus_round_expired') handleBonusExpired(data);
    else if (event === 'bonus_result') handleBonusResult(data);
    else if (event === 'game_over') handleGameOver(data);
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
  const { gameStatus, activePlayers, winnerId, leaderboardDisplayCount, presets } = r.data;

  leaderboardCount = leaderboardDisplayCount || presets?.leaderboardDisplayCount || 5;
  bonusTimeoutSecs = presets?.bonusTimeout || 15;

  const me = activePlayers?.find(p => p.playerId === playerId);
  if (me && me.completedAt && !iAmFinished) {
    iAmFinished = true;
    lockGameControls();
    showMsg('game-msg', `🏁 You reached tile 100! Waiting for others…`, true);
  }

  if (gameStatus === 'waiting') {
    renderWaitingPlayers(activePlayers);
  } else if (gameStatus === 'InProgress') {
    if ($('game-screen').classList.contains('hidden')) enterGameScreen(presets);
    const players = activePlayers;
    renderGame(players, prevPlayers);
    prevPlayers = players.map(p => ({ ...p }));
  } else if (gameStatus === 'Completed') {
    clearInterval(pollTimer);
    handleGameOver({ winnerId, activePlayers });
  }
}

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
    `<div style="font-size:12px;color:#64748b;margin-top:8px;">${players.length} / 25 joined</div>`;
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
  prevPlayers = null;
}

function renderGame(players, oldPlayers = null) {
  renderTokens(players, oldPlayers);
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
    return `<div class="leaderboard-row"><span>#${i+1} ${p.username}</span><span>${status}</span></div>`;
  };
  let html = topN.map((p, i) => rowHtml(p, i)).join('');
  if (myRank > leaderboardCount) {
    const me = sorted[myRank - 1];
    html += `<div class="leaderboard-row" style="border-top:1px solid #334155;margin-top:4px;padding-top:4px;color:#38bdf8;"><span>#${myRank} ${me.username} (you)</span><span>${me.completedAt ? '🏁 Finished' : `Tile ${me.currentTile}`}</span></div>`;
  }
  $('leaderboard').innerHTML = html;
}

// ---------- Roll Dice ----------
async function handleRoll() {
  const btn = $('roll-btn');
  if (btn.disabled) return;
  clearInterval(pollTimer);
  try {
    const result = await GameAPI.rollDice();
    if (handleApiError(result)) return;
    const diceValue = result.data.diceValue;
    await playDiceAnimation(diceValue);
    if (result.data.itemGranted) {
      localInventory.push(result.data.itemGranted);
      renderInventory();
      showMsg('game-msg', `🎁 You received: ${result.data.itemGranted}`, true);
    }
    if (result.data.needsQuiz) {
      openQuiz();
    } else {
      showMsg('game-msg', result.msg, true);
    }
    await pollState();
  } finally {
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
function openBonusRound(data) {
  if (iAmFinished) return;
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
  $('bonus-result').innerText = '⌛ Time\'s up — no one answered.';
  setTimeout(closeBonusOverlay, 1500);
}

function handleBonusResult(data) {
  const wasMine = currentBonus && currentBonus.bonusRoundId === data.bonusRoundId;
  const isItem = data.bonusType === 'item_grant';
  const reward = isItem ? `item: ${ITEM_ICONS[data.bonusValue] || ''} ${data.bonusValue}` : `+${data.bonusValue} steps`;
  showMsg('game-msg', `🎉 Bonus won by ${data.winnerUsername} (${reward})`, true);
  if (data.winnerPlayerId === playerId && isItem) {
    localInventory.push(data.bonusValue);
    renderInventory();
  }
  if (wasMine) {
    $('bonus-result').innerText = data.winnerPlayerId === playerId ? '✅ You won it!' : `🏆 ${data.winnerUsername} got it first.`;
    setTimeout(closeBonusOverlay, 1500);
  }
}

// ---------- Inventory ----------
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
    const r = await GameAPI.getState(sessionId);
    if (r.code !== 0) { showMsg('game-msg', 'Cannot fetch players', false); return; }
    const others = r.data.activePlayers.filter(p => p.playerId !== playerId && !p.completedAt);
    if (others.length === 0) { showMsg('game-msg', 'No other players to target', false); return; }
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
    }
  };
  $('target-cancel-btn').onclick = () => $('target-overlay').classList.remove('active');
  $('api-base').value = state.apiBase;
  setApiBase($('api-base').value);
  setupSocket();
}

document.addEventListener('DOMContentLoaded', init);