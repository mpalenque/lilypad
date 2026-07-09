// State machine + main loop tying together camera, motion, physics, toys, UI and FX.
import { CONFIG } from './config.js?v=15';
import { loadManifest } from './manifest.js?v=15';
import { UI } from './ui.js?v=15';
import { Renderer } from './renderer.js?v=15';
import { startCamera } from './camera.js?v=15';
import { Motion } from './motion.js?v=15';
import { ToyManager } from './toys.js?v=15';
import { Fx } from './fx.js?v=15';

const stageEl = document.getElementById('stage');
const cameraEl = document.getElementById('camera');
const glCanvas = document.getElementById('gl');
const uiRoot = document.getElementById('ui');
const rotatePromptEl = document.getElementById('rotatePrompt');

let stageScale = 1;
let rendererRef = null;

function fitStage() {
  const portrait = window.innerHeight > window.innerWidth;
  rotatePromptEl.classList.toggle('visible', portrait);

  const s = Math.min(window.innerWidth / CONFIG.STAGE_W, window.innerHeight / CONFIG.STAGE_H);
  stageScale = s;
  stageEl.style.transform = `translate(-50%, -50%) scale(${s})`;
  if (rendererRef) rendererRef.resize();
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);

function toStage(clientX, clientY) {
  const r = stageEl.getBoundingClientRect();
  return {
    x: (clientX - r.left) / stageScale,
    y: (clientY - r.top) / stageScale,
  };
}

const STATE = {
  BOOT: 'BOOT',
  START: 'START',
  INSTRUCTIONS: 'INSTRUCTIONS',
  PLAYING: 'PLAYING',
  RESULTS: 'RESULTS',
};

class Game {
  constructor() {
    this.state = STATE.BOOT;
    this.foundCount = 0;
    this.timeLeft = CONFIG.GAME_SECONDS;
    this.resultsTimer = 0;
    this.motion = new Motion();
    this._lastT = null;
    this._batteryTick = 0;
  }

  async boot() {
    this.manifest = await loadManifest();
    this.ui = new UI(uiRoot, this.manifest);
    try {
      this.renderer = new Renderer(glCanvas);
      rendererRef = this.renderer;
    } catch (err) {
      console.warn('[game] WebGL renderer disabled:', err);
      this.renderer = null;
      glCanvas.classList.add('hidden');
    }
    this.fx = new Fx(uiRoot, this.ui.flashEl);
    this.toys = new ToyManager(stageEl, 'assets/videos');
    this.toys.setTextureDestroyer((toy) => {
      if (this.renderer) this.renderer.destroyTextureFor(toy);
    });
    this.toys.onScore = (toy) => this._onToyGrabbed(toy);

    this.motion.on('shake', (intensity) => {
      if (this.state !== STATE.PLAYING) return;
      this.toys.handleShake(intensity, this.motion.gravity);
    });
    this.motion.on('smallshake', (intensity) => {
      if (this.state !== STATE.PLAYING) return;
      this.toys.addWobble(intensity * 0.45);
    });

    this.ui.screens.start.okBtn.addEventListener('click', () => this._onOk());
    this.ui.screens.instructions.startBtn.addEventListener('click', () => this._onStartGame());
    stageEl.addEventListener('pointerdown', (e) => this._onPointerDown(e));

    fitStage();
    this._goToStart();
    requestAnimationFrame((t) => this._loop(t));

    // Debug/test hook — harmless to leave in; not part of the play experience.
    window.__game = this;
  }

  _onOk() {
    // Guard against a double tap re-firing the whole permission dance.
    if (this._okHandled) return;
    this._okHandled = true;

    // All three things below need the transient user-activation from this tap,
    // so they must be KICKED OFF synchronously here (before any await). We fire
    // them and do NOT block on them — the UI advances immediately so the button
    // always visibly responds even if a permission promise hangs or is denied.
    startCamera(cameraEl).catch((err) => console.warn('[game] camera error:', err));
    this.toys.unlockVideos().catch((err) => console.warn('[game] video setup error:', err));
    this.motion
      .requestPermission()
      .then((granted) => {
        if (granted) this.motion.start();
      })
      .catch((err) => console.warn('[game] motion permission error:', err));

    this.state = STATE.INSTRUCTIONS;
    this.ui.showInstructions();
  }

  _onStartGame() {
    this.foundCount = 0;
    this.timeLeft = CONFIG.GAME_SECONDS;
    this.toys.reset();
    this.ui.updatePoints(0);
    this.ui.updateTimer(this.timeLeft);
    this.state = STATE.PLAYING;
    this.ui.showHud();
  }

  _goToStart() {
    this.toys.reset();
    this.state = STATE.START;
    this.ui.showStart();
  }

  _goToResults() {
    this.state = STATE.RESULTS;
    this.resultsTimer = CONFIG.RESULTS_SECONDS;
    this.toys.reset();
    this.fx.playGameOver();
    this.ui.showResults(this.foundCount);
  }

  _onToyGrabbed(toy) {
    this.foundCount++;
    this.ui.updatePoints(this.foundCount);
    this.fx.flash();
    this.fx.starsAt(toy.x, toy.y);
    this.fx.playFound();
  }

  _onPointerDown(e) {
    if (this.state !== STATE.PLAYING) return;
    const p = toStage(e.clientX, e.clientY);
    this.toys.tapAt(p.x, p.y);
  }

  _loop(now) {
    if (this._lastT == null) this._lastT = now;
    let dt = (now - this._lastT) / 1000;
    dt = Math.min(dt, 1 / 30);
    this._lastT = now;

    this._update(dt);
    this._render();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    if (CONFIG.DEBUG_MOTION) {
      const g = this.motion.gravity;
      const cam = cameraEl.srcObject ? `${cameraEl.videoWidth}x${cameraEl.videoHeight} ${cameraEl.paused ? 'paused' : 'live'}` : 'no-stream';
      this.ui.showDebugMotion(
        `${CONFIG.BUILD}\n` +
        `motion perm: ${this.motion.permissionState}  events: ${this.motion.eventCount}\n` +
        `gx: ${g.x.toFixed(2)}  gy: ${g.y.toFixed(2)}  tilt: ${this.motion.tiltMagnitude.toFixed(2)}\n` +
        `state: ${this.state}  toys: ${this.toys.toys.length}\n` +
        `${this.toys.debugVideoInfo()}\n` +
        `cam: ${cam}\n` +
        `gl frames: ${this.renderer ? this.renderer.framesUploaded : 0} ok:${this.renderer ? this.renderer.lastUploadOk : false}\n` +
        `screen: ${window.innerWidth}x${window.innerHeight}`
      );
    }

    if (this.state === STATE.PLAYING) {
      this.toys.update(dt, this.motion);
      this.timeLeft -= dt;
      this.ui.updateTimer(this.timeLeft);

      this._batteryTick += dt;
      if (this._batteryTick > 5) {
        this._batteryTick = 0;
        this.ui.updateBattery();
      }

      if (this.timeLeft <= 0) {
        this._goToResults();
      }
    } else if (this.state === STATE.RESULTS) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) {
        this._goToStart();
      }
    }
  }

  _render() {
    if (this.renderer) this.renderer.drawFrame(this.toys.toys);
  }
}

const game = new Game();
game.boot();
