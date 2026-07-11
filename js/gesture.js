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
  constructor({ triggerRateDegSec, returnRateDegSec, neutralRateDegSec, rearmMs }) {
    this.triggerRateDegSec = triggerRateDegSec;
    this.returnRateDegSec = returnRateDegSec;
    this.neutralRateDegSec = neutralRateDegSec;
    this.rearmMs = rearmMs;
    this.reset();
  }

  reset() {
    this.state = 'armed';
    this.triggerDirection = 0;
    this.returnSeen = false;
    this.neutralSince = null;
  }

  setRearmMs(rearmMs) {
    this.rearmMs = rearmMs;
  }

  update(rateDegSec, timestampMs) {
    if (this.state === 'armed') {
      if (Math.abs(rateDegSec) < this.triggerRateDegSec) return null;

      this.state = 'waiting-center';
      this.triggerDirection = Math.sign(rateDegSec);
      this.returnSeen = false;
      this.neutralSince = null;
      return this.triggerDirection > 0 ? 'right' : 'left';
    }

    if (!this.returnSeen) {
      if (Math.sign(rateDegSec) === -this.triggerDirection && Math.abs(rateDegSec) >= this.returnRateDegSec) {
        this.returnSeen = true;
      }
      return null;
    }

    if (Math.abs(rateDegSec) > this.neutralRateDegSec) {
      this.neutralSince = null;
      return null;
    }

    if (this.neutralSince === null) this.neutralSince = timestampMs;
    if (timestampMs - this.neutralSince >= this.rearmMs) {
      this.state = 'armed';
      this.triggerDirection = 0;
      this.returnSeen = false;
      this.neutralSince = null;
    }
    return null;
  }
}
