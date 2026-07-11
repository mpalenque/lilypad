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
    this.triggerDirection = 0;
  }

  setRearmMs(rearmMs) {
    this.rearmMs = rearmMs;
  }

  arm() {
    this.state = 'armed';
    this.neutralSince = null;
    this.triggerDirection = 0;
  }

  update(value, timestampMs) {
    const magnitude = Math.abs(value);
    const direction = Math.sign(value);

    if (this.state === 'waiting-neutral') {
      if (
        this.triggerDirection !== 0
        && direction !== 0
        && direction !== this.triggerDirection
        && magnitude >= this.enterThreshold
      ) {
        this.triggerDirection = direction;
        this.neutralSince = null;
        return value > 0 ? 'right' : 'left';
      }
      if (magnitude <= this.exitThreshold) {
        if (this.neutralSince === null) this.neutralSince = timestampMs;
        if (timestampMs - this.neutralSince >= this.rearmMs) {
          this.state = 'armed';
          this.triggerDirection = 0;
        }
      } else {
        this.neutralSince = null;
      }
      return null;
    }

    if (magnitude < this.enterThreshold) return null;

    this.state = 'waiting-neutral';
    this.neutralSince = null;
    this.triggerDirection = direction;
    return value > 0 ? 'right' : 'left';
  }
}
