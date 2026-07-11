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

  arm() {
    this.state = 'armed';
    this.neutralSince = null;
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
