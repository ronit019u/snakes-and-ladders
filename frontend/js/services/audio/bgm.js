// js/services/audio/bgm.js
// Background music - a mellow loop.
//
// Uses the standard Web-Audio "lookahead scheduler" pattern: a cheap
// setInterval wakes up often (every 25ms) and schedules any notes that
// fall within the next 100ms using the audio clock (ctx.currentTime),
// not the JS timer itself. That keeps the beat sample-accurate and
// click-free no matter how busy the main thread gets.
import { ensureContext, getCtx, getMusicGain } from './engine.js';
import { playNoise, playTone } from './synth.js';

const BPM = 102;
const STEPS_PER_BAR = 16;
const SCHEDULE_AHEAD_SEC = 0.12;
const LOOKAHEAD_MS = 25;

let bgmTimer = null;
let bgmNextStepTime = 0;
let bgmStep = 0;

// A soft kick on the downbeats, a light hat for texture, a warm triangle
// bassline, and a sparse, airy sine-wave lead arpeggio. Everything uses round
// waveforms (sine/triangle) and low peak volumes, so it sits in the
// background rather than fighting for attention. 0 = rest.
const KICK_PATTERN = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const HAT_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const BASS_NOTES = [110, 0, 0, 0, 0, 0, 0, 0, 130.81, 0, 0, 0, 0, 0, 0, 0];
const LEAD_NOTES = [0, 0, 659.25, 0, 0, 0, 587.33, 0, 0, 0, 783.99, 0, 0, 0, 659.25, 0];

function scheduleBgmStep(step, when) {
  const ctx = getCtx();
  const out = getMusicGain();
  if (KICK_PATTERN[step]) {
    playTone(ctx, out, { freq: 130, freqEnd: 42, type: 'sine', duration: 0.32, attack: 0.005, decay: 0.3, peak: 0.5, when });
  }
  if (HAT_PATTERN[step]) {
    playNoise(ctx, out, { duration: 0.05, attack: 0.001, decay: 0.045, peak: 0.1, filterType: 'highpass', filterFreq: 7000, when });
  }
  const bassFreq = BASS_NOTES[step];
  if (bassFreq) {
    playTone(ctx, out, { freq: bassFreq, type: 'triangle', duration: 0.5, attack: 0.01, decay: 0.45, peak: 0.16, when });
  }
  const leadFreq = LEAD_NOTES[step];
  if (leadFreq) {
    playTone(ctx, out, { freq: leadFreq, type: 'sine', duration: 0.35, attack: 0.02, decay: 0.32, peak: 0.1, when });
  }
}

function bgmSchedulerTick() {
  const ctx = getCtx();
  if (!ctx) return;
  const secondsPerStep = 60 / BPM / 4; // 16th notes
  while (bgmNextStepTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
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
