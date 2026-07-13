// DeviceMotion → screen-space gravity vector + shake detection.
// Cross-platform: iOS 13+ requires an explicit permission prompt fired from
// a user gesture; Android/desktop just start listening.
import { CONFIG } from './config.js?v=39';

function screenGravityFromAccel(ax, ay) {
  const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  let g;
  switch (angle) {
    case 90:
      g = { x: -ay, y: -ax };
      break;
    case -90:
    case 270:
      g = { x: ay, y: ax };
      break;
    case 180:
      g = { x: ax, y: ay };
      break;
    default:
      g = { x: -ax, y: ay };
      break;
  }
  return { x: g.x * CONFIG.GRAVITY_SIGN_X, y: g.y * CONFIG.GRAVITY_SIGN_Y };
}

export class Motion {
  constructor() {
    this.gravity = { x: 0, y: 1 }; // low-passed, screen-space, roughly unit scale (~9.8 raw)
    this._gravityRaw = { x: 0, y: 9.8 };
    this._gestureX = 0;
    this._gestureY = 0;
    this.tiltMagnitude = 0;
    this._lastShakeAt = 0;
    this._listeners = { lateral: [], shake: [], smallshake: [] };
    this._boundHandler = this._onDeviceMotion.bind(this);
    this._started = false;
    // Diagnostics kept for console/testing; no on-screen debug is rendered.
    this.permissionState = 'not-requested'; // not-requested | granted | denied | not-needed
    this.eventCount = 0;
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  _emit(event, payload) {
    for (const cb of this._listeners[event] || []) cb(payload);
  }

  // Must be called from within a user-gesture handler (e.g. the OK button tap).
  async requestPermission() {
    if (typeof DeviceMotionEvent === 'undefined' || typeof DeviceMotionEvent.requestPermission !== 'function') {
      this.permissionState = 'not-needed';
      return true;
    }

    try {
      const result = await DeviceMotionEvent.requestPermission();
      this.permissionState = result === 'granted' ? 'granted' : 'denied';
      return result === 'granted';
    } catch (err) {
      this.permissionState = 'denied';
      console.warn('[motion] permission request failed:', err);
      return false;
    }
  }

  start() {
    if (this._started) return;
    this._started = true;
    window.addEventListener('devicemotion', this._boundHandler);
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    window.removeEventListener('devicemotion', this._boundHandler);
  }

  _onDeviceMotion(e) {
    this.eventCount++;
    const gRaw = e.accelerationIncludingGravity;
    if (!gRaw || !Number.isFinite(gRaw.x) || !Number.isFinite(gRaw.y)) return;

    const linear = e.acceleration;
    const gravityX = Number.isFinite(linear?.x) ? gRaw.x - linear.x : gRaw.x;
    const gravityY = Number.isFinite(linear?.y) ? gRaw.y - linear.y : gRaw.y;

    const screenG = screenGravityFromAccel(gravityX, gravityY);
    // Normalize against ~9.8 m/s^2 so gravity.x/y are roughly in [-1, 1].
    const norm = 9.8;
    const gx = screenG.x / norm;
    const gy = screenG.y / norm;

    const LOW_PASS = 0.32;
    this.gravity.x += (gx - this.gravity.x) * LOW_PASS;
    this.gravity.y += (gy - this.gravity.y) * LOW_PASS;
    this._gestureX += (gx - this._gestureX) * CONFIG.TILT_FAST_LOW_PASS;
    this._gestureY += (gy - this._gestureY) * CONFIG.TILT_FAST_LOW_PASS;
    this.tiltMagnitude = Math.hypot(this.gravity.x, this.gravity.y);
    const now = performance.now();
    this._emit('lateral', {
      x: this._gestureX,
      y: this._gestureY,
      gravityX: this.gravity.x,
      gravityY: this.gravity.y,
      rawGravityX: gx,
      rawGravityY: gy,
      timestamp: now,
    });

    // Shake detection: prefer gravity-excluded acceleration; fall back to a
    // high-pass of accelerationIncludingGravity (common on Android where
    // `acceleration` is null).
    let lx, ly, lz;
    const lin = e.acceleration;
    if (lin && lin.x !== null) {
      lx = lin.x; ly = lin.y; lz = lin.z;
    } else {
      this._gravityRaw.x += (gRaw.x - this._gravityRaw.x) * LOW_PASS;
      this._gravityRaw.y += (gRaw.y - this._gravityRaw.y) * LOW_PASS;
      this._gravityRaw.z = this._gravityRaw.z === undefined ? gRaw.z : this._gravityRaw.z + (gRaw.z - this._gravityRaw.z) * LOW_PASS;
      lx = gRaw.x - this._gravityRaw.x;
      ly = gRaw.y - this._gravityRaw.y;
      lz = gRaw.z - this._gravityRaw.z;
    }

    const mag = Math.hypot(lx, ly, lz || 0);
    if (mag > CONFIG.SHAKE_THRESHOLD && now - this._lastShakeAt > CONFIG.SHAKE_DEBOUNCE_MS) {
      this._lastShakeAt = now;
      const intensity = Math.min(mag / CONFIG.SHAKE_THRESHOLD, 3);
      this._emit('shake', intensity);
    } else if (mag > CONFIG.SMALL_SHAKE_THRESHOLD && now - this._lastShakeAt > CONFIG.SHAKE_DEBOUNCE_MS / 2) {
      this._emit('smallshake', Math.min(mag / CONFIG.SMALL_SHAKE_THRESHOLD, 2));
    }
  }
}
