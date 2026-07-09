// Tilt-revealed toys using the split-alpha video clips.
import { CONFIG } from './config.js?v=17';
import { stepToyPhysics } from './physics.js?v=17';

let toyIdCounter = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class ClipBag {
  constructor(clips) {
    this.all = clips;
    this.bag = shuffle([...clips]);
    this.prev = null;
  }

  next(activeSet) {
    for (let attempt = 0; attempt < this.all.length * 2; attempt++) {
      if (this.bag.length === 0) this.bag = shuffle([...this.all]);
      const clip = this.bag.pop();
      if (activeSet.has(clip)) {
        this.bag.unshift(clip);
        continue;
      }
      if (clip === this.prev && this.all.length > 1) {
        this.bag.unshift(clip);
        continue;
      }
      this.prev = clip;
      return clip;
    }
    if (this.bag.length === 0) this.bag = shuffle([...this.all]);
    const clip = this.bag.pop();
    this.prev = clip;
    return clip;
  }
}

class VideoPool {
  constructor(basePath, clips) {
    this.basePath = basePath;
    this.byClip = new Map();
    for (const clip of clips) {
      const el = document.createElement('video');
      el.loop = false;
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
      el.setAttribute('muted', '');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.preload = 'auto';
      el.style.cssText =
        'position:fixed;bottom:0;right:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:2147483646;';
      el.src = `${basePath}/${clip}.mp4`;
      el.load();
      document.body.appendChild(el);
      this.byClip.set(clip, { el, busy: false });
    }
  }

  async unlockAll() {
    const tasks = [];
    for (const { el } of this.byClip.values()) {
      tasks.push(
        el.play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
          })
          .catch(() => {})
      );
    }
    await Promise.all(tasks);
  }

  acquire(clip) {
    let entry = this.byClip.get(clip);
    if (!entry || entry.busy) {
      entry = [...this.byClip.values()].find((candidate) => !candidate.busy);
    }
    if (!entry) return null;
    entry.busy = true;
    this._playFromStart(entry.el);
    return entry.el;
  }

  _playFromStart(el) {
    el.loop = false;
    try {
      el.currentTime = 0;
    } catch (e) {
      /* ignore until metadata is ready */
    }
    const attempt = () => el.play().catch(() => {});
    attempt();
    if (el.readyState < 2) {
      const onReady = () => {
        el.removeEventListener('canplay', onReady);
        attempt();
      };
      el.addEventListener('canplay', onReady);
    }
  }

  release(videoEl) {
    for (const entry of this.byClip.values()) {
      if (entry.el === videoEl) {
        entry.busy = false;
        entry.el.pause();
        try {
          entry.el.currentTime = 0;
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
}

export class ToyManager {
  constructor(stageEl, videoBasePath) {
    this.stageEl = stageEl;
    this.clipBag = new ClipBag(CONFIG.CLIPS);
    this.pool = new VideoPool(videoBasePath, CONFIG.CLIPS);
    this.toys = [];
    this.onScore = null;
    this._tiltSustain = 0;
    this._tiltSide = null;
    this._armedSide = null;
    this._requiredSide = null;
    this._destroyTex = null;
  }

  setTextureDestroyer(fn) {
    this._destroyTex = fn;
  }

  async unlockVideos() {
    await this.pool.unlockAll();
  }

  debugVideoInfo() {
    const t = this.toys[0];
    if (!t || !t.videoEl) return `video: (none)  next side: ${this._requiredSide || 'any'}`;
    const v = t.videoEl;
    return `video ${t.clip} ${t.side}: rs=${v.readyState} ${v.paused ? 'paused' : 'playing'} t=${v.currentTime.toFixed(2)}`;
  }

  reset() {
    for (const toy of [...this.toys]) this._removeToy(toy);
    this._tiltSustain = 0;
    this._tiltSide = null;
    this._armedSide = null;
    this._requiredSide = null;
  }

  getActiveClips() {
    return new Set(this.toys.map((t) => t.clip));
  }

  spawnFromSide(side) {
    if (this.toys.length >= CONFIG.MAX_CONCURRENT_TOYS) return null;

    const clip = this.clipBag.next(this.getActiveClips());
    const videoEl = this.pool.acquire(clip);
    if (!videoEl) return null;

    const h = CONFIG.TOY_HEIGHT_PX;
    const w = h * CONFIG.TOY_ASPECT;
    const fromRight = side === 'right';
    const hiddenX = fromRight ? CONFIG.STAGE_W + w / 2 + CONFIG.TOY_START_X_OFFSET : -w / 2 - CONFIG.TOY_START_X_OFFSET;

    const toy = {
      id: ++toyIdCounter,
      clip,
      videoEl,
      side,
      x: hiddenX,
      y: CONFIG.TOY_Y,
      renderX: hiddenX,
      renderY: CONFIG.TOY_Y,
      w,
      h,
      vx: 0,
      restX: fromRight ? CONFIG.STAGE_W - w / 2 : w / 2,
      hiddenX,
      resting: false,
      hidden: true,
      hasEntered: false,
      mirror: fromRight,
      scale: 1,
      alpha: 1,
      angle: 0,
      playbackElapsed: 0,
      videoStopped: false,
      grabbing: false,
      grabT: 0,
      bornAt: performance.now(),
    };
    this.toys.push(toy);
    return toy;
  }

  addWobble(intensity = 1) {
    // Disabled: keep tilt physics stable and strictly horizontal.
  }

  handleShake(intensity) {
    this.addWobble(intensity);
  }

  update(dt, motion) {
    const signedTilt = CONFIG.TILT_SIGN_X * motion.gravity.x;
    const leftAmount = signedTilt;
    const rightAmount = -signedTilt;
    const activeSide = leftAmount > CONFIG.TILT_ENTER ? 'right' : rightAmount > CONFIG.TILT_ENTER ? 'left' : null;

    if (!activeSide) {
      this._armedSide = null;
      this._tiltSustain = 0;
      this._tiltSide = null;
    } else if (this._tiltSide !== activeSide) {
      this._tiltSide = activeSide;
      this._tiltSustain = 0;
    }

    const canSpawnSide = activeSide && this._armedSide !== activeSide && (!this._requiredSide || this._requiredSide === activeSide);
    if (canSpawnSide && this.toys.length < CONFIG.MAX_CONCURRENT_TOYS) {
      this._tiltSustain += dt;
      if (this._tiltSustain >= CONFIG.TILT_SUSTAIN_SEC) {
        this.spawnFromSide(activeSide);
        this._armedSide = activeSide;
        this._tiltSustain = 0;
      }
    }

    for (const toy of [...this.toys]) {
      const v = toy.videoEl;
      if (v) {
        if (!toy.videoStopped && !toy.grabbing) {
          toy.playbackElapsed += dt;
        }
        if (
          !toy.videoStopped &&
          (toy.playbackElapsed >= CONFIG.VIDEO_STOP_AT_SEC || v.currentTime >= CONFIG.VIDEO_STOP_AT_SEC || v.ended)
        ) {
          toy.videoStopped = true;
          v.pause();
          try {
            v.currentTime = Math.min(CONFIG.VIDEO_STOP_AT_SEC, Number.isFinite(v.duration) ? v.duration : CONFIG.VIDEO_STOP_AT_SEC);
          } catch (e) {
            /* ignore */
          }
        } else if (!toy.videoStopped && v.paused && v.readyState >= 2 && !toy.grabbing) {
          v.play().catch(() => {});
        }
      }

      if (toy.grabbing) {
        toy.grabT += dt / 0.15;
        toy.scale = Math.max(0, 1 - toy.grabT);
        toy.alpha = Math.max(0, 1 - toy.grabT);
        if (toy.grabT >= 1) this._removeToy(toy);
        continue;
      }

      const revealAmount = toy.side === 'right' ? leftAmount : rightAmount;
      const retreatAmount = toy.side === 'right' ? rightAmount : leftAmount;
      stepToyPhysics(toy, dt, revealAmount, retreatAmount);
      if (!toy.hidden) toy.hasEntered = true;
      if (toy.hidden && toy.hasEntered) this._removeToy(toy);
    }
  }

  // stageX/stageY are in stage px (0..1920, 0..1200).
  tapAt(stageX, stageY) {
    let best = null;
    let bestDist = Infinity;
    for (const toy of this.toys) {
      if (toy.grabbing) continue;
      const cx = toy.renderX ?? toy.x;
      const cy = toy.renderY ?? toy.y;
      const halfW = toy.w / 2 + CONFIG.TAP_INFLATE;
      const halfH = toy.h / 2 + CONFIG.TAP_INFLATE;
      if (Math.abs(stageX - cx) <= halfW && Math.abs(stageY - cy) <= halfH) {
        const d = Math.hypot(stageX - cx, stageY - cy);
        if (d < bestDist) {
          bestDist = d;
          best = toy;
        }
      }
    }
    if (best) {
      best.grabbing = true;
      best.grabT = 0;
      this._requiredSide = best.side === 'right' ? 'left' : 'right';
      if (this.onScore) this.onScore(best);
    }
    return best;
  }

  _removeToy(toy) {
    this.toys = this.toys.filter((t) => t !== toy);
    this.pool.release(toy.videoEl);
    if (this._destroyTex) this._destroyTex(toy);
  }
}
