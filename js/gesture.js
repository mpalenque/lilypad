export class SideGestureGate {
  constructor({ enterThreshold, exitThreshold, initialHoldMs, oppositeHoldMs, neutralHoldMs }) {
    this.enterThreshold = enterThreshold;
    this.exitThreshold = exitThreshold;
    this.initialHoldMs = initialHoldMs;
    this.oppositeHoldMs = oppositeHoldMs;
    this.neutralHoldMs = neutralHoldMs;
    this.reset();
  }

  reset() {
    this.state = 'waiting-neutral';
    this.triggerDirection = 0;
    this.pendingDirection = 0;
    this.pendingDirectionSince = null;
    this.neutralSince = null;
  }

  setNeutralHoldMs(neutralHoldMs) {
    this.neutralHoldMs = neutralHoldMs;
  }

  arm() {
    this.state = 'armed';
    this.triggerDirection = 0;
    this.clearPendingDirection();
    this.neutralSince = null;
  }

  clearPendingDirection() {
    this.pendingDirection = 0;
    this.pendingDirectionSince = null;
  }

  update(value, timestampMs, { blocked = false, exitThreshold = this.exitThreshold } = {}) {
    const magnitude = Math.abs(value);

    if (this.state === 'waiting-neutral' && this.triggerDirection === 0) {
      return { side: null, rearmed: false };
    }

    if (magnitude <= exitThreshold) {
      this.clearPendingDirection();
      if (this.state !== 'waiting-neutral') return { side: null, rearmed: false };
      if (this.neutralSince === null) this.neutralSince = timestampMs;
      if (timestampMs - this.neutralSince < this.neutralHoldMs) {
        return { side: null, rearmed: false };
      }
      this.arm();
      return { side: null, rearmed: true };
    }

    this.neutralSince = null;
    if (magnitude < this.enterThreshold) {
      this.clearPendingDirection();
      return { side: null, rearmed: false };
    }

    if (blocked) {
      this.clearPendingDirection();
      return { side: null, rearmed: false };
    }

    const direction = value > 0 ? 1 : -1;
    if (this.state === 'waiting-neutral' && direction === this.triggerDirection) {
      this.clearPendingDirection();
      return { side: null, rearmed: false };
    }

    const requiredHoldMs = this.state === 'armed'
      ? this.initialHoldMs
      : this.oppositeHoldMs;
    if (this.pendingDirection !== direction) {
      this.pendingDirection = direction;
      this.pendingDirectionSince = timestampMs;
      return { side: null, rearmed: false };
    }
    if (timestampMs - this.pendingDirectionSince < requiredHoldMs) {
      return { side: null, rearmed: false };
    }

    this.state = 'waiting-neutral';
    this.triggerDirection = direction;
    this.neutralSince = null;
    this.clearPendingDirection();
    return { side: direction > 0 ? 'right' : 'left', rearmed: false };
  }
}
