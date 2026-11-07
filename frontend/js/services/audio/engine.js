// js/services/audio/engine.js
//
// All game audio - sound effects AND the background music loop - is
// synthesized at runtime with the Web Audio API. No external audio files
// are loaded, so there's nothing to fetch, no licensing to worry about,
// and it works offline.
//
// This file owns the AudioContext, the gain buses and the mute switch.
// synth.js has the low-level helpers, sfx.js the sound effects, bgm.js the music.

let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let muted = false;

const MUTE_STORAGE_KEY = 'csl_audio_muted';
try {
  muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
} catch (e) { /* localStorage unavailable - default to unmuted */ }

export const getCtx = () => audioCtx;
export const getSfxGain = () => sfxGain;
export const getMusicGain = () => musicGain;

export function ensureContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(audioCtx.destination);

  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(masterGain);

  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.22;
  // A gentle low-pass to round off the synths' edges for a mellower feel.
  const musicFilter = audioCtx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 3200;
  musicFilter.Q.value = 0.6;
  musicGain.connect(musicFilter);
  musicFilter.connect(masterGain);

  return audioCtx;
}

// Browsers block audio until the page has seen a user gesture (click/tap).
// Call this from inside a click handler before anything else audio-related.
export function initAudio() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0'); } catch (e) {}
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.02);
  }
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}
