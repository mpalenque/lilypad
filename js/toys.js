// Tilt-revealed toys using the split-alpha video clips.
import { CONFIG } from './config.js?v=38';
import { SideGestureGate } from './gesture.js?v=38';
import { isVideoTouchLocked, videoFinished } from './media.js?v=38';
import { stepToyPhysics } from './physics.js?v=38';

let toyIdCounter = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function visibleRectFor(toy) {
  const scale = toy.scale ?? 1;
  const w = (toy.hitW ?? toy.w) * scale;
  const h = (toy.hitH ?? toy.h) * scale;
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
  constructor(basePath, capacity = 2) {
    this.basePath = basePath;
    this.capacity = capacity;
    this.entries = [];
    for (let index = 0; index < capacity; index++) {
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
      document.body.appendChild(el);
      this.entries.push({ el, clip: null, busy: false, generation: 0, lastError: null });
    }
  }

  hasPreparationSlot(protectedClips) {
    return this.entries.some((entry) => !entry.busy && !protectedClips.has(entry.clip));
  }

  prepare(clip, protectedClips = new Set()) {
    let entry = this.entries.find((candidate) => !candidate.busy && candidate.clip === clip);
    if (entry) {
      if (entry.el.error) this._setClip(entry, clip, true);
      return true;
    }

    entry = this.entries.find((candidate) => !candidate.busy && !protectedClips.has(candidate.clip));
    if (!entry) return false;
    this._setClip(entry, clip, false);
    return true;
  }

  _setClip(entry, clip, forceReload) {
    if (!forceReload && entry.clip === clip && !entry.el.error) return;
    entry.generation++;
    entry.el.pause();
    entry.clip = clip;
    entry.lastError = null;
    entry.el.src = `${this.basePath}/${clip}.mp4`;
    entry.el.load();
  }

  async unlockAll() {
    const tasks = [];
    for (const entry of this.entries) {
      if (!entry.clip) continue;
      const { el } = entry;
      tasks.push(
        el.play()
          .then(() => {
            if (entry.busy) return;
            el.pause();
            try {
              el.currentTime = 0;
            } catch (error) {
              entry.lastError = error;
            }
          })
          .catch((error) => {
            entry.lastError = error;
          })
      );
    }
    await Promise.all(tasks);
  }

  acquire(clip) {
    const entry = this.entries.find((candidate) => !candidate.busy && candidate.clip === clip);
    if (!entry) return null;
    entry.busy = true;
    return {
      videoEl: entry.el,
      playPromise: this._playFromStart(entry, false),
    };
  }

  _playFromStart(entry, forceReload) {
    const { el } = entry;
    const generation = ++entry.generation;
    el.loop = false;
    el.pause();
    if (forceReload || el.error) {
      el.src = `${this.basePath}/${entry.clip}.mp4`;
      el.load();
    }
    try {
      el.currentTime = 0;
    } catch (error) {
      entry.lastError = error;
    }

    return el.play().catch((error) => {
      if (entry.generation === generation) entry.lastError = error;
      throw error;
    });
  }

  ensurePlaying(videoEl) {
    const entry = this.entries.find((candidate) => candidate.el === videoEl && candidate.busy);
    if (!entry || !videoEl.paused || videoEl.ended) return Promise.resolve();
    return videoEl.play().catch((error) => {
      entry.lastError = error;
      throw error;
    });
  }

  restart(videoEl) {
    const entry = this.entries.find((candidate) => candidate.el === videoEl && candidate.busy);
    if (!entry) return Promise.reject(new Error('Video is no longer active'));
    entry.lastError = null;
    return this._playFromStart(entry, true);
  }

  release(videoEl) {
    const entry = this.entries.find((candidate) => candidate.el === videoEl);
    if (!entry) return;
    entry.generation++;
    entry.busy = false;
    entry.el.pause();
    try {
      entry.el.currentTime = 0;
    } catch (error) {
      entry.lastError = error;
    }
  }
}

export class ToyManager {
  constructor(stageEl, videoBasePath) {
    this.stageEl = stageEl;
    this.clipBag = new ClipBag(CONFIG.CLIPS);
    this.pool = new VideoPool(videoBasePath, 2);
    this.toys = [];
    this.onScore = null;
    this.difficulty = 'easy';
    this.gestureGate = new SideGestureGate({
      enterThreshold: CONFIG.TILT_ENTER,
      exitThreshold: CONFIG.TILT_EXIT,
      initialHoldMs: CONFIG.TILT_FIRST_HOLD_MS,
      oppositeHoldMs: CONFIG.TILT_OPPOSITE_HOLD_MS,
      neutralHoldMs: CONFIG.DIFFICULTY.easy.rearmSec * 1000,
    });
    this.neutralTiltX = null;
    this.neutralTiltY = null;
    this._neutralCandidateX = null;
    this._neutralCandidateY = null;
    this._neutralCandidateSince = null;
    this._activeTiltAxis = null;
    this._tapRearmRequested = false;
    this._lastHorizontalY = null;
    this._lastVerticalX = null;
    this._preparedClips = [];
    this._destroyTex = null;
    this._fillPreparedQueue();
  }

  setTextureDestroyer(fn) {
    this._destroyTex = fn;
  }

  async unlockVideos() {
    await this.pool.unlockAll();
  }

  setDifficulty(mode) {
    this.difficulty = mode === 'hard' ? 'hard' : 'easy';
    const rearmSec = this._difficultyConfig().rearmSec ?? CONFIG.TILT_REARM_SEC;
    this.gestureGate.setNeutralHoldMs(rearmSec * 1000);
  }

  _difficultyConfig() {
    return CONFIG.DIFFICULTY[this.difficulty] || CONFIG.DIFFICULTY.easy;
  }

  debugVideoInfo() {
    const t = this.toys[0];
    if (!t || !t.videoEl) return `video: (none)  tilt=${this.gestureGate.state} center=${this.neutralTiltX},${this.neutralTiltY}`;
    const v = t.videoEl;
    return `video ${t.clip} ${t.side}/${this.difficulty}: rs=${v.readyState} ${v.paused ? 'paused' : 'playing'} t=${v.currentTime.toFixed(2)} tilt=${this.gestureGate.state}`;
  }

  reset(preserveNeutralTilt = false) {
    for (const toy of [...this.toys]) this._removeToy(toy);
    this.gestureGate.reset();
    this._activeTiltAxis = null;
    this._tapRearmRequested = false;
    if (preserveNeutralTilt && this.neutralTiltX !== null && this.neutralTiltY !== null) {
      this.gestureGate.arm();
    } else {
      this.neutralTiltX = null;
      this.neutralTiltY = null;
      this._neutralCandidateX = null;
      this._neutralCandidateY = null;
      this._neutralCandidateSince = null;
    }
    this._fillPreparedQueue();
  }

  getActiveClips() {
    return new Set(this.toys.map((t) => t.clip));
  }

  _fillPreparedQueue() {
    while (this._preparedClips.length < this.pool.capacity) {
      const protectedClips = new Set(this._preparedClips);
      if (!this.pool.hasPreparationSlot(protectedClips)) break;
      const unavailable = new Set([...this.getActiveClips(), ...this._preparedClips]);
      const clip = this.clipBag.next(unavailable);
      if (!this.pool.prepare(clip, protectedClips)) break;
      this._preparedClips.push(clip);
    }
  }

  _acquirePreparedVideo() {
    this._fillPreparedQueue();
    while (this._preparedClips.length > 0) {
      const clip = this._preparedClips.shift();
      const acquired = this.pool.acquire(clip);
      if (acquired) return { clip, ...acquired };
    }
    return null;
  }

  _watchPlayPromise(toy, playPromise) {
    playPromise.catch((error) => {
      if (this.toys.includes(toy) && toy.videoEl) toy.mediaError = error;
    });
  }

  observeLateralMotion(sample) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return null;
    const timestamp = Number.isFinite(sample.timestamp) ? sample.timestamp : performance.now();
    if (this.neutralTiltX !== null && this.neutralTiltY !== null) return this.neutralTiltX;
    if (Math.abs(sample.x) > CONFIG.TILT_NEUTRAL_CAPTURE_MAX) {
      this._neutralCandidateX = null;
      this._neutralCandidateY = null;
      this._neutralCandidateSince = null;
      return null;
    }
    if (
      this._neutralCandidateX === null
      || Math.abs(sample.x - this._neutralCandidateX) > CONFIG.TILT_NEUTRAL_STABLE_DELTA
      || Math.abs(sample.y - this._neutralCandidateY) > CONFIG.TILT_NEUTRAL_STABLE_DELTA
    ) {
      this._neutralCandidateX = sample.x;
      this._neutralCandidateY = sample.y;
      this._neutralCandidateSince = timestamp;
      return null;
    }
    this._neutralCandidateX += (sample.x - this._neutralCandidateX) * CONFIG.TILT_NEUTRAL_FOLLOW;
    this._neutralCandidateY += (sample.y - this._neutralCandidateY) * CONFIG.TILT_NEUTRAL_FOLLOW;
    if (timestamp - this._neutralCandidateSince < CONFIG.TILT_NEUTRAL_STABLE_MS) return null;
    this.neutralTiltX = this._neutralCandidateX;
    this.neutralTiltY = this._neutralCandidateY;
    this._neutralCandidateX = null;
    this._neutralCandidateY = null;
    this._neutralCandidateSince = null;
    this.gestureGate.arm();
    return this.neutralTiltX;
  }

  handleLateralMotion(sample) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return null;
    const timestamp = Number.isFinite(sample.timestamp) ? sample.timestamp : performance.now();
    if (this.observeLateralMotion(sample) === null) return null;
    if (this.neutralTiltX === null || this.neutralTiltY === null) return null;
    const relativeTiltX = sample.x - this.neutralTiltX;
    const relativeTiltY = sample.y - this.neutralTiltY;
    const horizontalMagnitude = Math.abs(relativeTiltX);
    const verticalMagnitude = Math.abs(relativeTiltY);
    const axis = this._activeTiltAxis || (horizontalMagnitude >= verticalMagnitude ? 'x' : 'y');
    const relativeTilt = axis === 'x' ? relativeTiltX : relativeTiltY;
    const signedTilt = axis === 'x'
      ? CONFIG.TILT_SIGN_X * relativeTilt
      : CONFIG.TILT_SIGN_Y * relativeTilt;
    const hasVisibleToy = this.toys.some((toy) => !toy.expiring);
    const neutralThreshold = this._tapRearmRequested
      ? CONFIG.TILT_TAP_REARM
      : CONFIG.TILT_EXIT;
    const { side, rearmed } = this.gestureGate.update(signedTilt, timestamp, {
      blocked: hasVisibleToy,
      exitThreshold: neutralThreshold,
    });

    if (rearmed) {
      this._tapRearmRequested = false;
      this._activeTiltAxis = null;
      this.neutralTiltX += relativeTiltX * CONFIG.TILT_NEUTRAL_FOLLOW;
      this.neutralTiltY += relativeTiltY * CONFIG.TILT_NEUTRAL_FOLLOW;
      this._retreatActiveToys();
      return null;
    }

    if (
      horizontalMagnitude <= neutralThreshold
      && verticalMagnitude <= neutralThreshold
      && this.gestureGate.state === 'armed'
      && !hasVisibleToy
    ) {
      this.neutralTiltX += relativeTiltX * CONFIG.TILT_NEUTRAL_FOLLOW;
      this.neutralTiltY += relativeTiltY * CONFIG.TILT_NEUTRAL_FOLLOW;
    }

    if (!side) return null;
    this._activeTiltAxis = axis;
    return this.spawnFromSide(this._edgeForGesture(axis, side), true);
  }

  _retreatActiveToys() {
    for (const toy of this.toys) this._beginExpireToy(toy);
  }

  _edgeForGesture(axis, side) {
    if (axis === 'x') return side;
    return side === 'right' ? 'bottom' : 'top';
  }

  _pickCrossAxisPosition(axis, length) {
    const stageLength = axis === 'x' ? CONFIG.STAGE_W : CONFIG.STAGE_H;
    const minimumPosition = length / 2 + CONFIG.TOY_EDGE_MARGIN_PX;
    const maximumPosition = Math.max(minimumPosition, stageLength - length / 2 - CONFIG.TOY_EDGE_MARGIN_PX);
    const availableRange = Math.max(0, maximumPosition - minimumPosition);
    const requiredGap = Math.min(CONFIG.TOY_POSITION_MIN_GAP_PX, availableRange * 0.35);
    const lastPositionKey = axis === 'x' ? '_lastVerticalX' : '_lastHorizontalY';
    let nextPosition = minimumPosition + Math.random() * availableRange;

    for (let attempt = 0; attempt < 8; attempt++) {
      const candidatePosition = minimumPosition + Math.random() * availableRange;
      if (
        this[lastPositionKey] === null
        || Math.abs(candidatePosition - this[lastPositionKey]) >= requiredGap
      ) {
        nextPosition = candidatePosition;
        break;
      }
    }

    this[lastPositionKey] = nextPosition;
    return nextPosition;
  }

  spawnFromSide(side, replaceActive = false) {
    if (replaceActive) {
      for (const toy of [...this.toys]) this._removeToy(toy);
    } else if (this.toys.length >= CONFIG.MAX_CONCURRENT_TOYS) {
      return null;
    }

    const acquired = this._acquirePreparedVideo();
    if (!acquired) return null;
    const { clip, videoEl, playPromise } = acquired;

    const h = CONFIG.TOY_HEIGHT_PX;
    const w = h * CONFIG.TOY_ASPECT;
    const vertical = side === 'top' || side === 'bottom';
    const hitW = vertical ? h : w;
    const hitH = vertical ? w : h;
    const fromRight = side === 'right';
    const fromBottom = side === 'bottom';
    const crossAxis = vertical ? 'x' : 'y';
    const crossPosition = this._pickCrossAxisPosition(crossAxis, vertical ? hitW : hitH);
    const restX = vertical
      ? crossPosition
      : (fromRight ? CONFIG.STAGE_W - hitW / 2 : hitW / 2);
    const restY = vertical
      ? (fromBottom ? CONFIG.STAGE_H - hitH / 2 : hitH / 2)
      : crossPosition;
    const hiddenX = vertical
      ? crossPosition
      : (fromRight
        ? CONFIG.STAGE_W + hitW / 2 + CONFIG.TOY_START_OFFSET_PX
        : -hitW / 2 - CONFIG.TOY_START_OFFSET_PX);
    const hiddenY = vertical
      ? (fromBottom
        ? CONFIG.STAGE_H + hitH / 2 + CONFIG.TOY_START_OFFSET_PX
        : -hitH / 2 - CONFIG.TOY_START_OFFSET_PX)
      : crossPosition;
    const settings = this._difficultyConfig();
    const angle = vertical ? (side === 'top' ? 90 : -90) : 0;

    const toy = {
      id: ++toyIdCounter,
      clip,
      videoEl,
      side,
      x: hiddenX,
      y: hiddenY,
      renderX: hiddenX,
      renderY: hiddenY,
      w,
      h,
      hitW,
      hitH,
      vx: 0,
      vy: 0,
      restX,
      restY,
      hiddenX,
      hiddenY,
      resting: false,
      hidden: false,
      hasEntered: true,
      mirror: fromRight,
      scale: 1,
      alpha: 1,
      angle,
      playbackElapsed: 0,
      appearanceElapsed: 0,
      playbackStarted: false,
      mediaWaitT: 0,
      mediaRetryT: 0,
      mediaRecoveryAttempts: 0,
      mediaReplacementAttempts: 0,
      mediaError: null,
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
    this._watchPlayPromise(toy, playPromise);
    this._fillPreparedQueue();
    return toy;
  }

  addWobble(intensity = 1) {
    // Disabled: keep tilt physics stable and strictly horizontal.
  }

  handleShake(intensity) {
    this.addWobble(intensity);
  }

  update(dt) {
    for (const toy of [...this.toys]) {
      if (toy.playbackStarted && !toy.grabbing) {
        toy.appearanceElapsed += dt;
        if (!toy.expiring && toy.appearanceElapsed >= CONFIG.TOY_LIFETIME_SEC - CONFIG.TOY_RETREAT_LEAD_SEC) {
          this._beginExpireToy(toy);
        }
        if (toy.appearanceElapsed >= CONFIG.TOY_LIFETIME_SEC) {
          this._removeToy(toy);
          continue;
        }
      }

      this._updateToyMedia(toy, dt);
      if (!this.toys.includes(toy)) continue;

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

  _updateToyMedia(toy, dt) {
    const videoEl = toy.videoEl;
    if (!videoEl || toy.expiring || toy.grabbing) return;

    toy.playbackElapsed += dt;
    if (isVideoTouchLocked(videoEl, CONFIG.TOUCH_DISABLE_BEFORE_END_SEC)) {
      toy.canTap = false;
    }

    if (toy.playbackStarted && videoFinished(videoEl)) {
      this._beginExpireToy(toy);
      return;
    }

    const hasFrame = videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
    if (hasFrame && !videoEl.paused && !videoEl.ended) {
      toy.playbackStarted = true;
      toy.mediaWaitT = 0;
      toy.mediaRecoveryAttempts = 0;
      toy.mediaError = null;
      return;
    }

    toy.mediaWaitT += dt;
    toy.mediaRetryT -= dt;
    if (toy.mediaRetryT <= 0 && !videoEl.ended) {
      toy.mediaRetryT = CONFIG.VIDEO_RETRY_INTERVAL_SEC;
      this.pool.ensurePlaying(videoEl).catch((error) => {
        if (this.toys.includes(toy) && toy.videoEl === videoEl) toy.mediaError = error;
      });
    }

    if (videoEl.error || toy.mediaWaitT >= CONFIG.VIDEO_START_TIMEOUT_SEC) {
      this._recoverToyMedia(toy);
    }
  }

  _recoverToyMedia(toy) {
    if (!this.toys.includes(toy) || !toy.videoEl) return;

    if (toy.mediaRecoveryAttempts < CONFIG.VIDEO_MAX_RECOVERY_ATTEMPTS) {
      toy.mediaRecoveryAttempts++;
      toy.mediaWaitT = 0;
      toy.mediaRetryT = CONFIG.VIDEO_RETRY_INTERVAL_SEC;
      toy.mediaError = null;
      const videoEl = toy.videoEl;
      this.pool.restart(videoEl).catch((error) => {
        if (this.toys.includes(toy) && toy.videoEl === videoEl) toy.mediaError = error;
      });
      return;
    }

    if (toy.mediaReplacementAttempts < CONFIG.VIDEO_MAX_REPLACEMENTS) {
      this._replaceToyVideo(toy);
      return;
    }

    this._removeToy(toy);
  }

  _replaceToyVideo(toy) {
    const previousVideo = toy.videoEl;
    this.pool.release(previousVideo);
    const acquired = this._acquirePreparedVideo();
    if (!acquired) {
      this._removeToy(toy);
      return;
    }

    toy.clip = acquired.clip;
    toy.videoEl = acquired.videoEl;
    toy.playbackElapsed = 0;
    toy.appearanceElapsed = 0;
    toy.playbackStarted = false;
    toy.mediaWaitT = 0;
    toy.mediaRetryT = 0;
    toy.mediaRecoveryAttempts = 0;
    toy.mediaReplacementAttempts++;
    toy.mediaError = null;
    toy.canTap = true;
    if (this._destroyTex) this._destroyTex(toy);
    this._watchPlayPromise(toy, acquired.playPromise);
    this._fillPreparedQueue();
  }

  // stageX/stageY are in stage px (0..1920, 0..1200).
  tapAt(stageX, stageY) {
    let best = null;
    let bestDist = Infinity;
    for (const toy of this.toys) {
      if (toy.grabbing || toy.expiring || !toy.canTap || !toy.playbackStarted) continue;
      if (isVideoTouchLocked(toy.videoEl, CONFIG.TOUCH_DISABLE_BEFORE_END_SEC)) {
        toy.canTap = false;
        continue;
      }
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
      this._tapRearmRequested = true;
      this.gestureGate.clearPendingDirection();
      if (this.onScore) this.onScore(best);
    }
    return best;
  }

  _beginExpireToy(toy) {
    if (toy.expiring) return;
    toy.expiring = true;
    toy.canTap = false;
    toy.expireT = 0;
    if (toy.videoEl) {
      toy.videoEl.pause();
    }
  }

  _removeToy(toy) {
    if (!this.toys.includes(toy)) return;
    this.toys = this.toys.filter((t) => t !== toy);
    this.pool.release(toy.videoEl);
    if (this._destroyTex) this._destroyTex(toy);
    this._fillPreparedQueue();
  }
}
