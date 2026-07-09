// Fast bounded slide with optional diagonal entry and a light edge bounce.
import { CONFIG } from './config.js?v=18';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function tiltResponse(amount) {
  const normalized = clamp01((amount - CONFIG.TILT_EXIT) / (CONFIG.TILT_FULL - CONFIG.TILT_EXIT));
  if (normalized <= 0) return 0;
  return CONFIG.MIN_REVEAL_SPEED + (1 - CONFIG.MIN_REVEAL_SPEED) * Math.sqrt(normalized);
}

function triggerBounce(toy, impactSpeed) {
  const strength = clamp01((impactSpeed - CONFIG.BOUNCE_MIN_SPEED) / CONFIG.SLIDE_SPEED);
  if (strength <= 0) return;
  toy.bounceT = 0;
  toy.bounceAmp = CONFIG.BOUNCE_MAX_PX * (0.35 + strength * 0.65);
}

function entryProgress(toy) {
  const range = Math.abs(toy.restX - toy.hiddenX);
  if (range <= 0) return 1;
  const traveled = toy.side === 'right' ? toy.hiddenX - toy.x : toy.x - toy.hiddenX;
  return clamp01(traveled / range);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function updateBounce(toy, dt) {
  toy.renderX = toy.x;
  toy.renderY = toy.y;
  const progress = entryProgress(toy);
  const settle = Math.pow(1 - progress, 0.72);
  const entryAngle = toy.entryAngle || 0;
  toy.angle = entryAngle * settle;

  if (toy.bounceT == null || toy.bounceAmp == null) return;

  toy.bounceT += dt;
  const t = clamp01(toy.bounceT / CONFIG.BOUNCE_DURATION);
  const envelope = 1 - t;
  if (envelope <= 0) {
    toy.bounceT = null;
    toy.bounceAmp = 0;
    return;
  }

  const inwardDir = toy.side === 'right' ? -1 : 1;
  const wave = Math.sin(t * Math.PI * 2.35);
  const inwardOnly = Math.abs(wave);
  toy.renderX = toy.x + inwardDir * toy.bounceAmp * envelope * inwardOnly;
  toy.angle += inwardDir * CONFIG.BOUNCE_ANGLE_DEG * envelope * wave;
}

export function stepToyPhysics(toy, dt, revealAmount, retreatAmount) {
  const wasResting = toy.resting;
  const reveal01 = tiltResponse(revealAmount);
  const retreat01 = clamp01(retreatAmount);
  const sideDir = toy.side === 'right' ? 1 : -1;
  const movingIn = reveal01 > 0;
  const speed = movingIn ? CONFIG.SLIDE_SPEED * reveal01 : CONFIG.RETREAT_SPEED * (0.45 + retreat01);
  const targetVx = sideDir * speed * (movingIn ? -1 : 1);

  toy.vx += (targetVx - toy.vx) * CONFIG.SLIDE_EASE_APPROACH * dt;
  toy.x += toy.vx * dt;

  if (toy.side === 'right') {
    if (toy.x <= toy.restX) {
      if (!wasResting) triggerBounce(toy, Math.abs(toy.vx));
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
      if (!wasResting) triggerBounce(toy, Math.abs(toy.vx));
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

  const progress = entryProgress(toy);
  toy.y = lerp(toy.hiddenY ?? CONFIG.TOY_Y, toy.restY ?? CONFIG.TOY_Y, progress);
  updateBounce(toy, dt);
}
