// js/services/audio/index.js
// Public surface of the audio service.
//   import { initAudio, startBgm, playSfx, toggleMute, isMuted } from '.../services/audio/index.js';
export { initAudio, isMuted, setMuted, toggleMute } from './engine.js';
export { playSfx } from './sfx.js';
export { startBgm, stopBgm, isBgmPlaying } from './bgm.js';
