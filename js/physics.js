// Fast bounded edge slide without overshoot.
import { CONFIG } from './config.js?v=41';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function tiltResponse(amount) {
  const normalized = clamp01((amount - CONFIG.TILT_EXIT) / (CONFIG.TILT_FULL - CONFIG.TILT_EXIT));
  if (normalized <= 0) return 0;
  return CONFIG.MIN_REVEAL_SPEED + (1 - CONFIG.MIN_REVEAL_SPEED) * Math.sqrt(normalized);
}

export function stepToyPhysics(toy, dt, revealAmount, retreatAmount) {
  const vertical = toy.side === 'top' || toy.side === 'bottom';
  const coordinate = vertical ? 'y' : 'x';
  const velocity = vertical ? 'vy' : 'vx';
  const restPosition = vertical ? toy.restY : toy.restX;
  const hiddenPosition = vertical ? toy.hiddenY : toy.hiddenX;
  const outwardDirection = toy.side === 'right' || toy.side === 'bottom' ? 1 : -1;
  const reveal01 = tiltResponse(revealAmount);
  const retreat01 = clamp01(retreatAmount);
  const movingIn = reveal01 > 0;
  const slideSpeed = CONFIG.SLIDE_SPEED * (toy.slideSpeedMul ?? 1);
  const retreatSpeed = CONFIG.RETREAT_SPEED * (toy.retreatSpeedMul ?? 1);
  const ease = CONFIG.SLIDE_EASE_APPROACH * (toy.easeMul ?? 1);
  const speed = movingIn ? slideSpeed * reveal01 : retreatSpeed * (0.45 + retreat01);
  const targetVelocity = outwardDirection * speed * (movingIn ? -1 : 1);

  toy[velocity] += (targetVelocity - toy[velocity]) * ease * dt;
  toy[coordinate] += toy[velocity] * dt;

  if (outwardDirection > 0) {
    if (toy[coordinate] <= restPosition) {
      toy[coordinate] = restPosition;
      toy[velocity] = 0;
      toy.resting = true;
      toy.hidden = false;
    } else if (toy[coordinate] >= hiddenPosition) {
      toy[coordinate] = hiddenPosition;
      toy[velocity] = 0;
      toy.resting = false;
      toy.hidden = true;
    } else {
      toy.resting = false;
      toy.hidden = false;
    }
  } else if (toy[coordinate] >= restPosition) {
    toy[coordinate] = restPosition;
    toy[velocity] = 0;
    toy.resting = true;
    toy.hidden = false;
  } else if (toy[coordinate] <= hiddenPosition) {
    toy[coordinate] = hiddenPosition;
    toy[velocity] = 0;
    toy.resting = false;
    toy.hidden = true;
  } else {
    toy.resting = false;
    toy.hidden = false;
  }

  toy.renderX = toy.x;
  toy.renderY = toy.y;
}
