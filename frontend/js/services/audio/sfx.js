// js/services/audio/sfx.js
// Sound effects. Usage: playSfx('bomb')
import { ensureContext, getCtx, getSfxGain, isMuted } from './engine.js';
import { noiseBuffer, playNoise, playTone } from './synth.js';

const SFX = {
  // A few rattling clicks while the die tumbles, then a lower "thock" as
  // it lands - roughly matches the ~800ms 3D dice flip animation.
  diceRoll() {
    const ticks = 5;
    const interval = 130;
    for (let i = 0; i < ticks; i++) {
      setTimeout(() => {
        const ctx = getCtx();
        if (!ctx) return;
        playNoise(ctx, getSfxGain(), { duration: 0.045, attack: 0.001, decay: 0.045, peak: 0.45, filterType: 'highpass', filterFreq: 2800 });
      }, i * interval);
    }
    setTimeout(() => {
      const ctx = getCtx();
      if (!ctx) return;
      playNoise(ctx, getSfxGain(), { duration: 0.14, attack: 0.001, decay: 0.14, peak: 0.8, filterType: 'lowpass', filterFreq: 1100 });
      playTone(ctx, getSfxGain(), { freq: 150, type: 'sine', duration: 0.12, decay: 0.12, peak: 0.4 });
    }, ticks * interval + 60);
  },

  bomb() {
    const ctx = getCtx(), out = getSfxGain();
    playNoise(ctx, out, { duration: 0.6, attack: 0.001, decay: 0.55, peak: 1, filterType: 'lowpass', filterFreq: 4000, filterFreqEnd: 180, q: 0.7 });
    playTone(ctx, out, { freq: 120, freqEnd: 35, type: 'sine', duration: 0.5, attack: 0.001, decay: 0.5, peak: 0.9 });
  },

  rocket() {
    const ctx = getCtx(), out = getSfxGain();
    playNoise(ctx, out, { duration: 0.8, attack: 0.05, decay: 0.7, peak: 0.5, filterType: 'bandpass', filterFreq: 300, filterFreqEnd: 3500, q: 0.8 });
    playTone(ctx, out, { freq: 90, freqEnd: 520, type: 'sawtooth', duration: 0.75, attack: 0.05, decay: 0.7, peak: 0.32 });
  },

  arrow() {
    playNoise(getCtx(), getSfxGain(), { duration: 0.3, attack: 0.001, decay: 0.28, peak: 0.6, filterType: 'bandpass', filterFreq: 3000, filterFreqEnd: 800, q: 1.2 });
  },

  // Whoosh of a bomb being lobbed; the explosion ('bomb') plays on landing.
  bombThrow() {
    const ctx = getCtx(), out = getSfxGain();
    playNoise(ctx, out, { duration: 0.45, attack: 0.08, decay: 0.35, peak: 0.35, filterType: 'bandpass', filterFreq: 500, filterFreqEnd: 1800, q: 1.1 });
    playNoise(ctx, out, { duration: 0.5, attack: 0.02, decay: 0.45, peak: 0.12, filterType: 'highpass', filterFreq: 5000, q: 0.7 });
  },

  // Short "thunk" of an arrow sticking into its target.
  arrowHit() {
    const ctx = getCtx(), out = getSfxGain();
    playTone(ctx, out, { freq: 240, freqEnd: 80, type: 'sine', duration: 0.14, attack: 0.001, decay: 0.13, peak: 0.55 });
    playNoise(ctx, out, { duration: 0.06, attack: 0.001, decay: 0.06, peak: 0.45, filterType: 'highpass', filterFreq: 2500 });
  },

  // Bright little chime when the rocket lands.
  rocketLand() {
    [880, 1174.66, 1567.98].forEach((freq, i) => {
      setTimeout(() => {
        const ctx = getCtx();
        if (ctx) playTone(ctx, getSfxGain(), { freq, type: 'triangle', duration: 0.16, decay: 0.16, peak: 0.28 });
      }, i * 55);
    });
  },

  // Sustained hiss with a fast tremolo so it reads as "sssss" rather than
  // a flat noise burst.
  snake() {
    const ctx = getCtx();
    if (!ctx) return;
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
    g.connect(getSfxGain());
    trem.start();
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
    trem.stop(ctx.currentTime + dur + 0.05);
  },

  ladder() {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      setTimeout(() => {
        const ctx = getCtx();
        if (!ctx) return;
        playTone(ctx, getSfxGain(), { freq, type: 'triangle', duration: 0.18, decay: 0.18, peak: 0.35 });
      }, i * 90);
    });
  },

  earthquake() {
    const ctx = getCtx(), out = getSfxGain();
    playNoise(ctx, out, { duration: 0.9, attack: 0.05, decay: 0.8, peak: 0.7, filterType: 'lowpass', filterFreq: 200, q: 0.5 });
    playTone(ctx, out, { freq: 55, type: 'sine', duration: 0.85, attack: 0.05, decay: 0.8, peak: 0.5 });
  },

  correct() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => {
        const ctx = getCtx();
        if (ctx) playTone(ctx, getSfxGain(), { freq, type: 'triangle', duration: 0.15, decay: 0.15, peak: 0.3 });
      }, i * 60);
    });
  },

  wrong() {
    playTone(getCtx(), getSfxGain(), { freq: 180, freqEnd: 80, type: 'sawtooth', duration: 0.35, decay: 0.32, peak: 0.4 });
  },

  win() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      setTimeout(() => {
        const ctx = getCtx();
        if (ctx) playTone(ctx, getSfxGain(), { freq, type: 'square', duration: 0.2, decay: 0.2, peak: 0.3 });
      }, i * 100);
    });
  }
};

export function playSfx(name) {
  if (isMuted()) return;
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const fn = SFX[name];
  if (fn) fn();
}
