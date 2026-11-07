// js/components/player/diceAnimation.js
// 3D dice tumble that lands on the value the backend rolled.
import { $ } from '../../utils/dom.js';
import { playSfx } from '../../services/audio/index.js';

const DICE_ROTATIONS = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: 0, y: 180, z: 0 },
  3: { x: 0, y: -90, z: 0 },
  4: { x: 0, y: 90, z: 0 },
  5: { x: -90, y: 0, z: 0 },
  6: { x: 90, y: 0, z: 0 }
};

export function playDiceAnimation(finalValue) {
  return new Promise((resolve) => {
    const dice = $('dice');
    if (!dice) { resolve(); return; }
    playSfx('diceRoll');
    const rot = DICE_ROTATIONS[finalValue] || DICE_ROTATIONS[1];
    const turns = 3 + Math.floor(Math.random() * 3);
    const rx = turns * 360 + rot.x;
    const ry = turns * 360 + rot.y;
    const rz = turns * 360 + rot.z;
    dice.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
    setTimeout(resolve, 800);
  });
}
