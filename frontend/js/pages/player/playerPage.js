// js/pages/player/playerPage.js
// Entry point for player.html: join → waiting room → game. Wires the socket,
// the buttons and the components together; the real work lives in
// components/player/* and the sibling modules in this folder.
import { state, setApiBase } from '../../config/config.js';
import { $, showMsg, withLoadingState } from '../../utils/dom.js';
import { GameAPI } from '../../api/index.js';
import { connectSocket, onSocketConnect, onSocketDisconnect, onSocketEvent, joinRoom } from '../../services/socketService.js';
import { initAudio, toggleMute, isMuted } from '../../services/audio/index.js';
import { playerState } from '../../state/playerState.js';
import { openBonusRound, handleBonusExpired, handleBonusResult } from '../../components/player/bonusModal.js';
import { handleGameOver } from '../../components/player/gameOver.js';
import { handleItemUsed, handleEarthquake } from '../../components/player/itemEffects.js';
import { pollState, startPolling } from './polling.js';
import { handleRoll } from './roll.js';

// ---------- Socket ----------
// Any socket event is just a hint that state changed, so every event also
// triggers an immediate poll (the 2s timer remains the source of truth).
function setupSocket() {
  connectSocket();
  onSocketConnect(() => {
    $('socket-dot').classList.add('on');
    $('socket-status').innerText = 'connected';
    if (playerState.sessionId) joinRoom(playerState.sessionId, playerState.playerId);
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
    else if (event === 'item_used') handleItemUsed(data);
    else if (event === 'earthquake_event') handleEarthquake(data);
    if (playerState.sessionId) pollState();
  });
}

// ---------- Join / waiting room ----------
async function handleJoin() {
  playerState.myUsername = $('username-input').value.trim();
  const code = $('session-input').value.trim();
  if (!playerState.myUsername) return showMsg('join-msg', 'Enter a username', false);
  if (!code) return showMsg('join-msg', 'Enter session code', false);
  const r = await GameAPI.join(code, playerState.myUsername);
  if (r.code !== 0) return showMsg('join-msg', r.msg, false);
  playerState.sessionId = r.data.sessionId;
  playerState.playerId = r.data.playerId;
  enterWaitingRoom();
}

function enterWaitingRoom() {
  $('join-screen').classList.add('hidden');
  $('waiting-screen').classList.remove('hidden');
  $('session-code-display').innerText = playerState.sessionId;
  joinRoom(playerState.sessionId, playerState.playerId);
  startPolling();
  pollState();
}

async function handleStart() {
  const r = await GameAPI.start();
  if (r.code !== 0) showMsg('waiting-msg', r.msg, false);
}

// ---------- Init ----------
function updateMuteBtn() {
  const btn = $('mute-btn');
  if (btn) btn.innerText = isMuted() ? '🔇' : '🔊';
}

function init() {
  // Browsers require a user gesture before audio can play at all - unlock the
  // AudioContext on the page's first click. The music itself only starts once
  // the player enters the game screen (see components/player/gameScreen.js).
  document.addEventListener('click', () => initAudio(), { once: true });
  const muteBtn = $('mute-btn');
  if (muteBtn) muteBtn.onclick = () => { toggleMute(); updateMuteBtn(); };
  updateMuteBtn();

  playerState.refresh = pollState;

  $('reconnect-api-btn').onclick = () => { setApiBase($('api-base').value); setupSocket(); };
  $('join-btn').onclick = withLoadingState($('join-btn'), 'Joining…', handleJoin, 'game-msg');
  $('start-game-btn').onclick = withLoadingState($('start-game-btn'), 'Starting…', handleStart, 'game-msg');
  $('roll-btn').onclick = async () => {
    try {
      await handleRoll();
    } catch (err) {
      console.error('[playerPage] roll error:', err);
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
