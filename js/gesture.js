export class SideGestureGate {
  constructor({ enterThreshold, exitThreshold, rearmMs }) {
    this.enterThreshold = enterThreshold;
    this.exitThreshold = exitThreshold;
    this.rearmMs = rearmMs;
    this.reset();
  }

  reset() {
    this.state = 'waiting-neutral';
    this.neutralSince = null;
  }

  setRearmMs(rearmMs) {
    this.rearmMs = rearmMs;
  }

  update(value, timestampMs) {
    const magnitude = Math.abs(value);

    if (this.state === 'waiting-neutral') {
      if (magnitude <= this.exitThreshold) {
        if (this.neutralSince === null) this.neutralSince = timestampMs;
        if (timestampMs - this.neutralSince >= this.rearmMs) {
          this.state = 'armed';
        }
      } else {
        this.neutralSince = null;
      }
      return null;
    }

    if (magnitude < this.enterThreshold) return null;

    this.state = 'waiting-neutral';
    this.neutralSince = null;
    return value > 0 ? 'right' : 'left';
  }
}

export class SteeringGestureGate {
  constructor({ triggerAngleDeg, centerAngleDeg, rateDeadzoneDegSec, centerRateDegSec, rearmMs }) {
    this.triggerAngleDeg = triggerAngleDeg;
    this.centerAngleDeg = centerAngleDeg;
    this.rateDeadzoneDegSec = rateDeadzoneDegSec;
    this.centerRateDegSec = centerRateDegSec;
    this.rearmMs = rearmMs;
    this.reset();
  }

  reset() {
    this.state = 'armed';
    this.angleDeg = 0;
    this.centerSince = null;
  }

  setRearmMs(rearmMs) {
    this.rearmMs = rearmMs;
  }

  update(rateDegSec, dtSec, timestampMs) {
    const usableRate = Math.abs(rateDegSec) >= this.rateDeadzoneDegSec ? rateDegSec : 0;
    this.angleDeg = Math.max(-90, Math.min(90, this.angleDeg + usableRate * dtSec));

    if (this.state === 'armed') {
      if (usableRate === 0) this.angleDeg *= Math.max(0, 1 - dtSec * 8);
      if (Math.abs(this.angleDeg) < this.triggerAngleDeg) return null;

      this.state = 'waiting-center';
      this.centerSince = null;
      return this.angleDeg > 0 ? 'right' : 'left';
    }

    const isCentered = Math.abs(this.angleDeg) <= this.centerAngleDeg && Math.abs(rateDegSec) <= this.centerRateDegSec;
    if (!isCentered) {
      this.centerSince = null;
      return null;
    }

    if (this.centerSince === null) this.centerSince = timestampMs;
    if (timestampMs - this.centerSince >= this.rearmMs) {
      this.state = 'armed';
      this.angleDeg = 0;
      this.centerSince = null;
    }
    return null;
  }
}
