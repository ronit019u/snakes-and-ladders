// js/audioService.js
//
// All game audio - sound effects AND the background music loop - is
// synthesized at runtime with the Web Audio API. No external audio files
// are loaded, so there's nothing to fetch, no licensing to worry about,
// and it works offline.
//
// Usage:
//   import { initAudio, startBgm, playSfx, toggleMute, isMuted } from './audioService.js';
//   document.addEventListener('click', () => { initAudio(); startBgm(); }, { once: true });
//   playSfx('bomb');

let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let muted = false;

const MUTE_STORAGE_KEY = 'csl_audio_muted';
try {
  muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
} catch (e) { /* localStorage unavailable - default to unmuted */ }

function ensureContext() {
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

// ---------------------------------------------------------------------
// Low-level synth helpers. Every helper takes an explicit `when` (an
// AudioContext timestamp) so the same building blocks work both for
// "play immediately" sound effects and for notes scheduled ahead of time
// by the background-music sequencer below.
// ---------------------------------------------------------------------

function noiseBuffer(ctx, duration) {
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envGain(ctx, dest, { attack = 0.01, decay = 0.2, peak = 1, when }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  g.connect(dest);
  return g;
}

function playNoise(ctx, dest, opts = {}) {
  const {
    duration = 0.3, attack = 0.005, decay = 0.25, peak = 1,
    filterType = null, filterFreq = 1000, filterFreqEnd = null, q = 1,
    when = ctx.currentTime
  } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);
  let node = src;
  if (filterType) {
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, when);
    if (filterFreqEnd !== null) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(1, filterFreqEnd), when + duration);
    }
    filt.Q.value = q;
    src.connect(filt);
    node = filt;
  }
  const g = envGain(ctx, dest, { attack, decay, peak, when });
  node.connect(g);
  src.start(when);
  src.stop(when + duration + 0.05);
}

function playTone(ctx, dest, opts = {}) {
  const {
    freq = 440, freqEnd = null, type = 'sine',
    duration = 0.2, attack = 0.005, decay = 0.2, peak = 0.6,
    when = ctx.currentTime
  } = opts;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), when + duration);
  const g = envGain(ctx, dest, { attack, decay, peak, when });
  osc.connect(g);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

// ---------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------

const SFX = {
  // A few rattling clicks while the die tumbles, then a lower "thock" as
  // it lands - roughly matches the ~800ms 3D dice flip animation.
  diceRoll() {
    const ticks = 5;
    const interval = 130;
    for (let i = 0; i < ticks; i++) {
      setTimeout(() => {
        if (!audioCtx) return;
        playNoise(audioCtx, sfxGain, { duration: 0.045, attack: 0.001, decay: 0.045, peak: 0.45, filterType: 'highpass', filterFreq: 2800 });
      }, i * interval);
    }
    setTimeout(() => {
      if (!audioCtx) return;
      playNoise(audioCtx, sfxGain, { duration: 0.14, attack: 0.001, decay: 0.14, peak: 0.8, filterType: 'lowpass', filterFreq: 1100 });
      playTone(audioCtx, sfxGain, { freq: 150, type: 'sine', duration: 0.12, decay: 0.12, peak: 0.4 });
    }, ticks * interval + 60);
  },

  bomb() {
    playNoise(audioCtx, sfxGain, { duration: 0.6, attack: 0.001, decay: 0.55, peak: 1, filterType: 'lowpass', filterFreq: 4000, filterFreqEnd: 180, q: 0.7 });
    playTone(audioCtx, sfxGain, { freq: 120, freqEnd: 35, type: 'sine', duration: 0.5, attack: 0.001, decay: 0.5, peak: 0.9 });
  },

  rocket() {
    playNoise(audioCtx, sfxGain, { duration: 0.8, attack: 0.05, decay: 0.7, peak: 0.5, filterType: 'bandpass', filterFreq: 300, filterFreqEnd: 3500, q: 0.8 });
    playTone(audioCtx, sfxGain, { freq: 90, freqEnd: 520, type: 'sawtooth', duration: 0.75, attack: 0.05, decay: 0.7, peak: 0.32 });
  },

  arrow() {
    playNoise(audioCtx, sfxGain, { duration: 0.3, attack: 0.001, decay: 0.28, peak: 0.6, filterType: 'bandpass', filterFreq: 3000, filterFreqEnd: 800, q: 1.2 });
  },

  // Sustained hiss with a fast tremolo so it reads as "sssss" rather than
  // a flat noise burst.
  snake() {
    if (!audioCtx) return;
    const ctx = audioCtx;
    const dur = 0.6;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 4200;
    filt.Q.value = 6;

    const trem = ctx.createOscillator();
    trem.frequency.value = 18;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.35;
    trem.connect(tremGain);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
    tremGain.connect(g.gain);

    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    trem.start();
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
    trem.stop(ctx.currentTime + dur + 0.05);
  },

  ladder() {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      setTimeout(() => {
        if (!audioCtx) return;
        playTone(audioCtx, sfxGain, { freq, type: 'triangle', duration: 0.18, decay: 0.18, peak: 0.35 });
      }, i * 90);
    });
  },

  earthquake() {
    playNoise(audioCtx, sfxGain, { duration: 0.9, attack: 0.05, decay: 0.8, peak: 0.7, filterType: 'lowpass', filterFreq: 200, q: 0.5 });
    playTone(audioCtx, sfxGain, { freq: 55, type: 'sine', duration: 0.85, attack: 0.05, decay: 0.8, peak: 0.5 });
  },

  correct() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => { if (audioCtx) playTone(audioCtx, sfxGain, { freq, type: 'triangle', duration: 0.15, decay: 0.15, peak: 0.3 }); }, i * 60);
    });
  },

  wrong() {
    playTone(audioCtx, sfxGain, { freq: 180, freqEnd: 80, type: 'sawtooth', duration: 0.35, decay: 0.32, peak: 0.4 });
  },

  win() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      setTimeout(() => { if (audioCtx) playTone(audioCtx, sfxGain, { freq, type: 'square', duration: 0.2, decay: 0.2, peak: 0.3 }); }, i * 100);
    });
  }
};

export function playSfx(name) {
  if (muted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const fn = SFX[name];
  if (fn) fn();
}

// ---------------------------------------------------------------------
// Background music - an upbeat electronic loop.
//
// Uses the standard Web-Audio "lookahead scheduler" pattern: a cheap
// setInterval wakes up often (every 25ms) and schedules any notes that
// fall within the next 100ms using the audio clock (ctx.currentTime),
// not the JS timer itself. That keeps the beat sample-accurate and
// click-free no matter how busy the main thread gets.
// ---------------------------------------------------------------------

const BPM = 102;
const STEPS_PER_BAR = 16;
const SCHEDULE_AHEAD_SEC = 0.12;
const LOOKAHEAD_MS = 25;

let bgmTimer = null;
let bgmNextStepTime = 0;
let bgmStep = 0;

// A mellow, laid-back loop: a soft kick on the downbeats, a light hat for
// texture, a warm triangle bassline, and a sparse, airy sine-wave lead
// arpeggio. Everything uses round waveforms (sine/triangle) instead of
// buzzy saw/square, and low peak volumes, so it sits in the background
// rather than fighting for attention. 0 = rest.
const KICK_PATTERN = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const HAT_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const BASS_NOTES = [110, 0, 0, 0, 0, 0, 0, 0, 130.81, 0, 0, 0, 0, 0, 0, 0];
const LEAD_NOTES = [0, 0, 659.25, 0, 0, 0, 587.33, 0, 0, 0, 783.99, 0, 0, 0, 659.25, 0];

function scheduleBgmStep(step, when) {
  const ctx = audioCtx;
  if (KICK_PATTERN[step]) {
    playTone(ctx, musicGain, { freq: 130, freqEnd: 42, type: 'sine', duration: 0.32, attack: 0.005, decay: 0.3, peak: 0.5, when });
  }
  if (HAT_PATTERN[step]) {
    playNoise(ctx, musicGain, { duration: 0.05, attack: 0.001, decay: 0.045, peak: 0.1, filterType: 'highpass', filterFreq: 7000, when });
  }
  const bassFreq = BASS_NOTES[step];
  if (bassFreq) {
    playTone(ctx, musicGain, { freq: bassFreq, type: 'triangle', duration: 0.5, attack: 0.01, decay: 0.45, peak: 0.16, when });
  }
  const leadFreq = LEAD_NOTES[step];
  if (leadFreq) {
    playTone(ctx, musicGain, { freq: leadFreq, type: 'sine', duration: 0.35, attack: 0.02, decay: 0.32, peak: 0.1, when });
  }
}

function bgmSchedulerTick() {
  if (!audioCtx) return;
  const secondsPerStep = 60 / BPM / 4; // 16th notes
  while (bgmNextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleBgmStep(bgmStep, bgmNextStepTime);
    bgmNextStepTime += secondsPerStep;
    bgmStep = (bgmStep + 1) % STEPS_PER_BAR;
  }
}

// Safe to call multiple times - a no-op if already playing. Requires a
// prior user gesture (see initAudio) or the browser will keep the
// AudioContext suspended and nothing will be heard.
export function startBgm() {
  const ctx = ensureContext();
  if (!ctx || bgmTimer) return;
  if (ctx.state === 'suspended') ctx.resume();
  bgmStep = 0;
  bgmNextStepTime = ctx.currentTime + 0.05;
  bgmTimer = setInterval(bgmSchedulerTick, LOOKAHEAD_MS);
}

export function stopBgm() {
  if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

export function isBgmPlaying() {
  return !!bgmTimer;
}
