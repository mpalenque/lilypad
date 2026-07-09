// Fast horizontal slide. No wobble/vertical looseness: keep the proven tilt
// behavior stable and bounded.
import { CONFIG } from './config.js?v=16';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function stepToyPhysics(toy, dt, revealAmount, retreatAmount) {
  const reveal01 = clamp01((revealAmount - CONFIG.TILT_EXIT) / (1 - CONFIG.TILT_EXIT));
  const retreat01 = clamp01(retreatAmount);
  const sideDir = toy.side === 'right' ? 1 : -1;
  const movingIn = reveal01 > 0;
  const speed = movingIn ? CONFIG.SLIDE_SPEED * reveal01 : CONFIG.RETREAT_SPEED * (0.45 + retreat01);
  const targetVx = sideDir * speed * (movingIn ? -1 : 1);

  toy.vx += (targetVx - toy.vx) * CONFIG.SLIDE_EASE_APPROACH * dt;
  toy.x += toy.vx * dt;

  if (toy.side === 'right') {
    if (toy.x <= toy.restX) {
      toy.x = toy.restX;
      toy.vx = 0;
      toy.resting = true;
    } else if (toy.x >= toy.hiddenX) {
      toy.x = toy.hiddenX;
      toy.vx = 0;
      toy.resting = false;
      toy.hidden = true;
    } else {
      toy.resting = false;
      toy.hidden = false;
    }
  } else {
    if (toy.x >= toy.restX) {
      toy.x = toy.restX;
      toy.vx = 0;
      toy.resting = true;
    } else if (toy.x <= toy.hiddenX) {
      toy.x = toy.hiddenX;
      toy.vx = 0;
      toy.resting = false;
      toy.hidden = true;
    } else {
      toy.resting = false;
      toy.hidden = false;
    }
  }

  toy.y = CONFIG.TOY_Y;
  toy.angle = 0;
}
