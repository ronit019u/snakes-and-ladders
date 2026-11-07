// js/components/player/quizModal.js
// Snake / ladder quiz (needsQuiz): fetch a question, validate the answer,
// then finalize the move to the target tile the server calculated.
import { $, showMsg } from '../../utils/dom.js';
import { GameAPI, QuestionAPI } from '../../api/index.js';
import { playSfx } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { OPTION_LETTERS, QUIZ_TIMEOUT_SECS } from '../../config/constants.js';

let currentQuiz = null;

export async function openQuiz() {
  const q = await QuestionAPI.getRandom(playerState.sessionId);
  if (q.code !== 0) return showMsg('game-msg', q.msg, false);
  currentQuiz = { questionId: q.data.questionId, timerHandle: null };
  $('quiz-title').innerText = '🔐 Cybersecurity Quiz';
  $('quiz-question').innerText = q.data.questionText;
  $('quiz-result').innerText = '';
  const optsEl = $('quiz-options');
  optsEl.innerHTML = '';
  OPTION_LETTERS.forEach((letter, i) => {
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.innerText = `${letter}. ${q.data.options[i]}`;
    b.onclick = () => submitQuizAnswer(letter);
    optsEl.appendChild(b);
  });
  $('quiz-overlay').classList.add('active');
  let timeLeft = QUIZ_TIMEOUT_SECS;
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
  document.querySelectorAll('#quiz-options .quiz-opt').forEach(b => b.disabled = true);
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
  playSfx(result.data.correct ? 'correct' : 'wrong');
  await GameAPI.finalizeMove(result.data.targetTile);
  setTimeout(() => {
    $('quiz-overlay').classList.remove('active');
    playerState.refresh();
  }, 1500);
}
