// js/services/botManager.js
// Spawns 25 virtual players ("bots") that join the admin's current session and
// play the game autonomously — dice rolls, snake/ladder quizzes, and bonus
// rounds — so a full 25-player game can be demoed from a single admin tab.
//
// Bots only ever call the same public HTTP routes and listen to the same
// Socket.io events real players use (see api/botApi.js's BotAPI + pages/player/roll.js
// for the reference flow). They're wired up entirely from this module and
// never touch socketService.js's singleton admin socket, so they can't
// interfere with the admin's own connection or with real players.
//
// See the big comment on BotAPI in api/botApi.js for the one assumption this
// relies on: the backend accepting an explicit playerId in the body for
// move/item/quiz/bonus calls, instead of requiring the session cookie.

import { state } from '../config/config.js';
import { BotAPI } from '../api/index.js';
import { sleep } from '../utils/async.js';
import { OPTION_LETTERS } from '../config/constants.js';

const BOT_COUNT = 25;
const ROLL_DELAY_MIN_MS = 500;
const ROLL_DELAY_MAX_MS = 2000;
const JOIN_STAGGER_MS = 120; // spread joins out a bit instead of firing 25 requests at once
const OPTIONS = OPTION_LETTERS;

let bots = []; // { username, playerId, socket, finished, alive, busy }
let statusListener = () => {};

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

// Picks a random valid option letter. `optionsArr` (if given) may have fewer
// than 4 entries (bonus rounds can), so we only pick among options that exist.
function randomOption(optionsArr) {
  const letters = optionsArr
    ? OPTIONS.filter((_, i) => optionsArr[i] !== undefined)
    : OPTIONS;
  return letters[Math.floor(Math.random() * letters.length)] || 'A';
}

export function setBotStatusListener(fn) {
  statusListener = typeof fn === 'function' ? fn : () => {};
}

function reportStatus() {
  const total = bots.length;
  const finished = bots.filter((b) => b.finished).length;
  statusListener({ total, finished, expected: BOT_COUNT });
}

// ---------- Per-bot gameplay loop ----------
const MAX_PREROLL_ATTEMPTS = 50; // safety cap on the wrong-answer re-ask loop

async function rollForBot(bot, sessionId) {
  if (!bot.alive || bot.finished) return;
  // A roll is now several requests long (pre-roll quiz, possibly re-asked), and
  // every move_update from any player nudges every bot. Without this guard a
  // bot could request a second pre-roll question while still answering the first.
  if (bot.busy) return;
  bot.busy = true;
  try {
    let r = await BotAPI.rollDice(sessionId, bot.playerId);

    // Pre-roll quiz: answer (randomly) until the server actually rolls the dice.
    // A wrong answer returns a fresh prerollQuiz; an exhausted question pool
    // falls back to a direct roll (no prerollQuiz in the response).
    let attempts = 0;
    while (r.code === 0 && r.data?.prerollQuiz && attempts++ < MAX_PREROLL_ATTEMPTS) {
      if (!bot.alive || bot.finished) return;
      const quiz = r.data.prerollQuiz;
      await sleep(randomDelay(300, 900));
      r = await BotAPI.rollDice(sessionId, bot.playerId, quiz.questionId, randomOption(quiz.options));
    }

    if (r.code === 2020) { // same "already finished" code pages/player/roll.js checks for
      bot.finished = true;
      reportStatus();
      return;
    }
    if (r.code !== 0) {
      console.warn(`[bot ${bot.username}] roll failed:`, r.msg);
      return; // the next 'move_update' (from another bot/player) will nudge it again
    }
    if (r.data?.needsQuiz) {
      await handleBotQuiz(bot, sessionId);
    }
    // If no quiz was needed, the bot just waits for its own 'move_update' event
    // (see wireBotSocket) to trigger the next roll.
  } finally {
    bot.busy = false;
  }
}

async function handleBotQuiz(bot, sessionId) {
  const q = await BotAPI.getRandomQuestion(sessionId);
  if (q.code !== 0) {
    console.warn(`[bot ${bot.username}] quiz fetch failed:`, q.msg);
    return;
  }
  const letter = randomOption(q.data.options);
  const result = await BotAPI.validateAnswer(sessionId, bot.playerId, q.data.questionId, letter);
  if (result.code !== 0) {
    console.warn(`[bot ${bot.username}] quiz validate failed:`, result.msg);
    return;
  }
  await BotAPI.finalizeMove(sessionId, bot.playerId, result.data.targetTile);
  // Server broadcasts 'move_update' once the move lands, which drives the next roll.
}

async function handleBotBonus(bot, sessionId, data) {
  if (!bot.alive || bot.finished) return;
  // Stagger answers a bit so 25 bots don't all fire in the same tick.
  await sleep(randomDelay(200, 1200));
  const letter = randomOption(data.options);
  const r = await BotAPI.submitBonusAnswer(sessionId, bot.playerId, data.bonusRoundId, letter);
  if (r.code !== 0 && r.code !== 2020) {
    console.warn(`[bot ${bot.username}] bonus answer failed:`, r.msg);
  }
}

function wireBotSocket(bot, sessionId) {
  const socket = io(state.apiBase, { transports: ['websocket', 'polling'], withCredentials: false });
  bot.socket = socket;

  socket.on('connect', () => {
    socket.emit('join_room', { sessionId, playerId: bot.playerId });
  });

  socket.onAny((event, data) => {
    if (!bot.alive) return;
    // Bots make their initial roll only after the server confirms the game is
    // live. Their pre-start attempt is correctly rejected by /api/game/move,
    // and without this event there is no move_update yet to wake them up.
    if (event === 'game_started' || event === 'move_update') {
      sleep(randomDelay(ROLL_DELAY_MIN_MS, ROLL_DELAY_MAX_MS)).then(() => rollForBot(bot, sessionId));
    } else if (event === 'bonus_round_started') {
      handleBotBonus(bot, sessionId, data);
    } else if (event === 'game_over') {
      bot.finished = true;
      reportStatus();
    }
  });
}

// ---------- Public API ----------

// Joins BOT_COUNT bots into `sessionId` and kicks off their play loops.
// Resolves with the number of bots that actually managed to join.
export async function spawnBots(sessionId) {
  stopBots(); // clear out any previous batch first
  bots = [];
  reportStatus();

  for (let i = 1; i <= BOT_COUNT; i++) {
    const username = `Bot_${String(i).padStart(2, '0')}`;
    const r = await BotAPI.join(sessionId, username);
    if (r.code !== 0) {
      console.warn(`[botManager] ${username} failed to join:`, r.msg);
      await sleep(JOIN_STAGGER_MS);
      continue;
    }

    const bot = { username, playerId: r.data.playerId, socket: null, finished: false, alive: true, busy: false };
    bots.push(bot);
    wireBotSocket(bot, sessionId);
    reportStatus();

    // Kick off this bot's first roll shortly after it joins.
    sleep(randomDelay(300, 1200)).then(() => rollForBot(bot, sessionId));

    await sleep(JOIN_STAGGER_MS);
  }

  return bots.length;
}

// Disconnects every bot socket and stops their play loops. Safe to call even
// if no bots were spawned yet.
export function stopBots() {
  bots.forEach((b) => {
    b.alive = false;
    if (b.socket) b.socket.disconnect();
  });
}

export function getBotCount() {
  return bots.length;
}
