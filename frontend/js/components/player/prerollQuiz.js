// js/components/player/prerollQuiz.js
// Pre-roll quiz. POST /api/game/move with an empty body returns { prerollQuiz }
// instead of rolling. The player must answer; a correct answer rolls the dice,
// a wrong one returns a fresh prerollQuiz. When the question pool is exhausted
// the server rolls directly (no prerollQuiz), so runPrerollQuiz() simply
// returns the first response untouched. A present `diceValue` means the dice
// has been rolled.
import { $ } from '../../utils/dom.js';
import { sleep } from '../../utils/async.js';
import { GameAPI } from '../../api/index.js';
import { playSfx } from '../../services/audio/index.js';
import { QUIZ_TIMEOUT_SECS, PREROLL_TIMEOUT_ANSWER, OPTION_LETTERS } from '../../config/constants.js';
import { handleApiError } from './gameControls.js';

const PREROLL_CANCELLED = Symbol('preroll-cancelled');
let prerollCtx = null; // { timerHandle, resolve } while a question is on screen

function stopPrerollTimer() {
  if (prerollCtx?.timerHandle) clearInterval(prerollCtx.timerHandle);
}

function closePrerollOverlay() {
  stopPrerollTimer();
  prerollCtx = null;
  $('quiz-overlay').classList.remove('active');
}

// Called when the game ends while a pre-roll question is still open.
export function cancelPrerollQuiz() {
  if (!prerollCtx) return;
  const { resolve } = prerollCtx;
  closePrerollOverlay();
  resolve(PREROLL_CANCELLED);
}

// Shows one question; resolves with the chosen letter, the timeout
// sentinel, or PREROLL_CANCELLED.
function askPrerollQuiz(quiz, notice = '') {
  return new Promise((resolve) => {
    stopPrerollTimer();
    $('quiz-title').innerText = '🎲 Answer correctly to roll the dice';
    $('quiz-question').innerText = quiz.questionText;
    $('quiz-result').innerText = notice;

    const optsEl = $('quiz-options');
    optsEl.innerHTML = '';
    const ctx = { timerHandle: null, resolve };
    prerollCtx = ctx;

    const finish = (value) => {
      if (prerollCtx !== ctx) return; // already answered / cancelled
      clearInterval(ctx.timerHandle);
      document.querySelectorAll('#quiz-options .quiz-opt').forEach(b => b.disabled = true);
      resolve(value);
    };

    OPTION_LETTERS.forEach((letter, i) => {
      if (quiz.options?.[i] === undefined) return;
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      b.innerText = `${letter}. ${quiz.options[i]}`;
      b.onclick = () => finish(letter);
      optsEl.appendChild(b);
    });

    $('quiz-overlay').classList.add('active');
    let timeLeft = QUIZ_TIMEOUT_SECS;
    $('quiz-timer').innerText = timeLeft;
    ctx.timerHandle = setInterval(() => {
      timeLeft--;
      $('quiz-timer').innerText = timeLeft;
      if (timeLeft <= 0) finish(PREROLL_TIMEOUT_ANSWER);
    }, 1000);
  });
}

// Takes the response to the first (empty-body) roll request and keeps asking
// until the server actually rolls. Returns:
//   { status: 'rolled', result }  -> `result` is the normal roll response
//   { status: 'cancelled' }       -> game ended while a question was open
//   { status: 'error' }           -> request failed (already shown to the player)
export async function runPrerollQuiz(firstResult) {
  let result = firstResult;
  let askedQuiz = false;
  let notice = '';

  while (result.data?.prerollQuiz) {
    askedQuiz = true;
    const quiz = result.data.prerollQuiz;
    const answer = await askPrerollQuiz(quiz, notice);
    if (answer === PREROLL_CANCELLED) return { status: 'cancelled' };

    $('quiz-result').innerText = 'Checking…';
    result = await GameAPI.rollDice(quiz.questionId, answer);
    if (result.code !== 0) {
      closePrerollOverlay();
      handleApiError(result);
      return { status: 'error' };
    }
    if (result.data?.prerollQuiz) {
      playSfx('wrong');
      notice = answer === PREROLL_TIMEOUT_ANSWER
        ? '⌛ Time\'s up! Here is a new question:'
        : '❌ Wrong answer — here is a new question:';
    }
  }

  if (askedQuiz) {
    // The roll response carries no `correct` flag (and after the pool runs
    // out a wrong answer also rolls), so keep this neutral.
    $('quiz-result').innerText = '🎲 Rolling…';
    await sleep(600);
    closePrerollOverlay();
  }
  return { status: 'rolled', result };
}
