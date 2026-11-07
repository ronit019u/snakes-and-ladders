// js/services/audio/synth.js
// Low-level synth helpers. Every helper takes an explicit `when` (an
// AudioContext timestamp) so the same building blocks work both for
// "play immediately" sound effects and for notes scheduled ahead of time
// by the background-music sequencer.

export function noiseBuffer(ctx, duration) {
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

export function playNoise(ctx, dest, opts = {}) {
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

export function playTone(ctx, dest, opts = {}) {
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
