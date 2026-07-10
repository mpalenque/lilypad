// Tilt-revealed toys using the split-alpha video clips.
import { CONFIG } from './config.js?v=21';
import { stepToyPhysics } from './physics.js?v=21';

let toyIdCounter = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function visibleRectFor(toy) {
  const scale = toy.scale ?? 1;
  const w = toy.w * scale;
  const h = toy.h * scale;
  const cx = toy.renderX ?? toy.x;
  const cy = toy.renderY ?? toy.y;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  const visibleLeft = Math.max(0, left);
  const visibleRight = Math.min(CONFIG.STAGE_W, right);
  const visibleTop = Math.max(0, top);
  const visibleBottom = Math.min(CONFIG.STAGE_H, bottom);
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return null;

  const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
  return {
    left: visibleLeft,
    right: visibleRight,
    top: visibleTop,
    bottom: visibleBottom,
    fraction: visibleArea / (w * h),
  };
}

function videoFinished(videoEl) {
  if (!videoEl) return true;
  if (videoEl.ended) return true;
  return Number.isFinite(videoEl.duration) && videoEl.duration > 0 && videoEl.currentTime >= videoEl.duration - 0.04;
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
    this.difficulty = 'easy';
    this._tiltSustain = 0;
    this._tiltSide = null;
    this._gestureReady = false;
    this._neutralTime = 0;
    this._spawnCooldown = 0;
    this._lastSpawnSide = null;
    this._destroyTex = null;
  }

  setTextureDestroyer(fn) {
    this._destroyTex = fn;
  }

  async unlockVideos() {
    await this.pool.unlockAll();
  }

  setDifficulty(mode) {
    this.difficulty = mode === 'hard' ? 'hard' : 'easy';
  }

  _difficultyConfig() {
    return CONFIG.DIFFICULTY[this.difficulty] || CONFIG.DIFFICULTY.easy;
  }

  debugVideoInfo() {
    const t = this.toys[0];
    if (!t || !t.videoEl) return 'video: (none)  next side: tilt';
    const v = t.videoEl;
    return `video ${t.clip} ${t.side}/${this.difficulty}: rs=${v.readyState} ${v.paused ? 'paused' : 'playing'} t=${v.currentTime.toFixed(2)}`;
  }

  reset() {
    for (const toy of [...this.toys]) this._removeToy(toy);
    this._tiltSustain = 0;
    this._tiltSide = null;
    this._gestureReady = false;
    this._neutralTime = 0;
    this._spawnCooldown = 0;
    this._lastSpawnSide = null;
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
    const settings = this._difficultyConfig();
    const y = CONFIG.TOY_Y + rand(-14, 14);

    const toy = {
      id: ++toyIdCounter,
      clip,
      videoEl,
      side,
      x: hiddenX,
      y,
      renderX: hiddenX,
      renderY: y,
      w,
      h,
      vx: 0,
      restX: fromRight ? CONFIG.STAGE_W - w / 2 : w / 2,
      restY: y,
      hiddenX,
      resting: false,
      hidden: true,
      hasEntered: false,
      mirror: fromRight,
      scale: 1,
      alpha: 1,
      angle: 0,
      playbackElapsed: 0,
      expiring: false,
      expireT: 0,
      canTap: true,
      slideSpeedMul: settings.slideSpeedMul,
      retreatSpeedMul: settings.retreatSpeedMul,
      easeMul: settings.easeMul,
      expireFadeSec: settings.expireFadeSec,
      grabbing: false,
      grabT: 0,
      bornAt: performance.now(),
    };
    this.toys.push(toy);
    this._lastSpawnSide = side;
    return toy;
  }

  addWobble(intensity = 1) {
    // Disabled: keep tilt physics stable and strictly horizontal.
  }

  handleShake(intensity) {
    this.addWobble(intensity);
  }

  update(dt, motion) {
    this._spawnCooldown = Math.max(0, this._spawnCooldown - dt);
    const signedTilt = CONFIG.TILT_SIGN_X * motion.gravity.x;
    const leftAmount = signedTilt;
    const rightAmount = -signedTilt;
    const activeSide = leftAmount > CONFIG.TILT_ENTER ? 'right' : rightAmount > CONFIG.TILT_ENTER ? 'left' : null;

    const noActiveToy = this.toys.length === 0;

    if (!activeSide) {
      if (noActiveToy) {
        this._neutralTime += dt;
        const rearmSec = this._difficultyConfig().rearmSec ?? CONFIG.TILT_REARM_SEC;
        if (this._neutralTime >= rearmSec) this._gestureReady = true;
      }
      this._tiltSustain = 0;
      this._tiltSide = null;
    } else if (this._tiltSide !== activeSide) {
      this._tiltSide = activeSide;
      this._tiltSustain = 0;
      this._neutralTime = 0;
      if (noActiveToy && activeSide !== this._lastSpawnSide) this._gestureReady = true;
    } else {
      this._neutralTime = 0;
    }

    if (noActiveToy && activeSide && activeSide !== this._lastSpawnSide) {
      this._gestureReady = true;
    }

    const canSpawnSide = activeSide && this._gestureReady && this._spawnCooldown <= 0;
    if (canSpawnSide && this.toys.length < CONFIG.MAX_CONCURRENT_TOYS) {
      this._tiltSustain += dt;
      if (this._tiltSustain >= CONFIG.TILT_SUSTAIN_SEC) {
        this.spawnFromSide(activeSide);
        this._gestureReady = false;
        this._neutralTime = 0;
        this._tiltSustain = 0;
      }
    }

    for (const toy of [...this.toys]) {
      const v = toy.videoEl;
      if (v) {
        if (!toy.expiring && !toy.grabbing) {
          toy.playbackElapsed += dt;
        }
        if (!toy.expiring && !toy.grabbing && videoFinished(v)) {
          this._beginExpireToy(toy);
        } else if (!toy.expiring && v.paused && v.readyState >= 2 && !toy.grabbing) {
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

      if (toy.expiring) {
        toy.expireT += dt;
        toy.alpha = Math.max(0, 1 - toy.expireT / toy.expireFadeSec);
      }

      const revealAmount = toy.expiring ? 0 : 1;
      const retreatAmount = toy.expiring ? 1 : 0;
      stepToyPhysics(toy, dt, revealAmount, retreatAmount);
      if (!toy.hidden) toy.hasEntered = true;
      if (toy.hidden && (toy.hasEntered || toy.expiring)) this._removeToy(toy);
    }
  }

  // stageX/stageY are in stage px (0..1920, 0..1200).
  tapAt(stageX, stageY) {
    let best = null;
    let bestDist = Infinity;
    for (const toy of this.toys) {
      if (toy.grabbing || toy.expiring || !toy.canTap) continue;
      const visible = visibleRectFor(toy);
      if (!visible || visible.fraction < CONFIG.MIN_TOUCH_VISIBLE_FRACTION) continue;

      const left = Math.max(0, visible.left - CONFIG.TAP_INFLATE);
      const right = Math.min(CONFIG.STAGE_W, visible.right + CONFIG.TAP_INFLATE);
      const top = Math.max(0, visible.top - CONFIG.TAP_INFLATE);
      const bottom = Math.min(CONFIG.STAGE_H, visible.bottom + CONFIG.TAP_INFLATE);
      if (stageX >= left && stageX <= right && stageY >= top && stageY <= bottom) {
        const d = Math.hypot(stageX - (visible.left + visible.right) / 2, stageY - (visible.top + visible.bottom) / 2);
        if (d < bestDist) {
          bestDist = d;
          best = toy;
        }
      }
    }
    if (best) {
      best.grabbing = true;
      best.canTap = false;
      best.grabT = 0;
      this._spawnCooldown = this._difficultyConfig().spawnCooldownSec ?? CONFIG.SPAWN_COOLDOWN_SEC;
      this._tiltSustain = 0;
      if (this.onScore) this.onScore(best);
    }
    return best;
  }

  _beginExpireToy(toy) {
    if (toy.expiring) return;
    toy.expiring = true;
    toy.canTap = false;
    toy.expireT = 0;
    this._spawnCooldown = this._difficultyConfig().spawnCooldownSec ?? CONFIG.SPAWN_COOLDOWN_SEC;
    if (toy.videoEl) {
      toy.videoEl.pause();
    }
  }

  _removeToy(toy) {
    this.toys = this.toys.filter((t) => t !== toy);
    this.pool.release(toy.videoEl);
    if (this._destroyTex) this._destroyTex(toy);
  }
}
