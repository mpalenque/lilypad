// Lily UI overlay: DIFFICULTY / INSTRUCTIONS / HUD / RESULTS screens, built from the
// exact sprites cut from "GUI lilypad.psd", positioned via the PSD manifest.
import { CONFIG } from './config.js?v=40';
import { DIGIT_SLOTS } from './manifest.js?v=40';

function place(el, m) {
  el.style.left = `${m.cx - m.w / 2}px`;
  el.style.top = `${m.cy - m.h / 2}px`;
  el.style.width = `${m.w}px`;
  el.style.height = `${m.h}px`;
}

function img(src, m) {
  const el = document.createElement('img');
  el.src = src;
  el.className = 'abs';
  el.draggable = false;
  if (m) place(el, m);
  return el;
}

function imageButton(src, m, id) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'image-btn abs';
  place(btn, m);
  const art = document.createElement('img');
  art.src = src;
  art.draggable = false;
  btn.appendChild(art);
  return btn;
}

// Port of ARDigitNumber.cs: right-aligned image glyphs into fixed slots,
// no leading zeros, overflow saturates to all-9s.
class DigitDisplay {
  constructor(parentEl, manifest, slotsKey) {
    const cfg = DIGIT_SLOTS[slotsKey];
    const panel = manifest[cfg.panel];
    this.manifest = manifest;
    this.glyphHeight = cfg.glyphHeight;
    this.slotCenters = cfg.slots.map(([sx, sy]) => ({
      x: panel.cx + sx,
      y: panel.cy - sy, // Unity slot offsets are y-up; stage is y-down.
    }));
    this.imgs = this.slotCenters.map(() => {
      const el = document.createElement('img');
      el.className = 'digit-img abs';
      el.draggable = false;
      el.style.display = 'none';
      parentEl.appendChild(el);
      return el;
    });
    this.shown = null;
  }

  show(value) {
    if (value === this.shown) return;
    this.shown = value;
    const slotCount = this.imgs.length;
    const len = value.length;
    const overflow = len > slotCount;

    for (let s = 0; s < slotCount; s++) {
      const el = this.imgs[s];
      const charIndex = len - slotCount + s;
      if (charIndex < 0 || charIndex >= len) {
        el.style.display = 'none';
        continue;
      }
      const c = overflow ? '9' : value[charIndex];
      if (c < '0' || c > '9') {
        el.style.display = 'none';
        continue;
      }
      const info = this.manifest['lily_digit_' + c];
      const aspect = info.w / info.h;
      const h = this.glyphHeight;
      const w = h * aspect;
      el.src = `assets/ui/lily_digit_${c}.png`;
      el.style.display = 'block';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const center = this.slotCenters[s];
      el.style.left = `${center.x - w / 2}px`;
      el.style.top = `${center.y - h / 2}px`;
    }
  }
}

// Port of UpdateBattery() in ARVideoTouchChecklist.cs.
class BatteryIndicator {
  constructor(parentEl, manifest) {
    const b = manifest.lily_battery;
    const scale = 0.66;
    const frameW = b.w * scale;
    const frameH = b.h * scale;
    const frameLeft = b.cx - frameW / 2;
    const frameTop = b.cy - frameH / 2;

    this.frame = img('assets/ui/lily_battery.png', null);
    this.frame.style.left = `${frameLeft}px`;
    this.frame.style.top = `${frameTop}px`;
    this.frame.style.width = `${frameW}px`;
    this.frame.style.height = `${frameH}px`;
    parentEl.appendChild(this.frame);

    const bodyW = 122 * scale;
    const bodyH = 42 * scale;
    const insetX = frameW * 0.1;
    const bodyLeft = frameLeft + insetX;
    const bodyTop = frameTop + (frameH - bodyH) / 2 - 6.5 * scale;

    this.fill = document.createElement('div');
    this.fill.className = 'abs';
    this.fill.style.left = `${bodyLeft}px`;
    this.fill.style.top = `${bodyTop}px`;
    this.fill.style.height = `${bodyH}px`;
    this.fill.style.borderRadius = '4px';
    this.fill.style.background = CONFIG.COLOR_BATTERY_FILL;
    parentEl.appendChild(this.fill);
    this._bodyW = bodyW;

    this.text = document.createElement('div');
    this.text.className = 'battery-text abs';
    this.text.style.left = '1290px';
    this.text.style.top = '62.5px';
    this.text.style.width = '160px';
    this.text.style.height = '60px';
    parentEl.appendChild(this.text);

    this._hasBatteryApi = false;
    this._battery = null;
    if (navigator.getBattery) {
      navigator
        .getBattery()
        .then((battery) => {
          this._battery = battery;
          this._hasBatteryApi = true;
          battery.addEventListener('levelchange', () => this.update());
          this.update();
        })
        .catch(() => this.update());
    } else {
      this.update();
    }
  }

  update() {
    const known = this._hasBatteryApi && this._battery;
    const level = known ? this._battery.level : 1;
    const low = known && level <= 0.15;
    this.fill.style.width = `${this._bodyW * level}px`;
    this.fill.style.background = low ? CONFIG.COLOR_BATTERY_LOW : CONFIG.COLOR_BATTERY_FILL;
    if (known) {
      this.text.textContent = `${Math.round(level * 100)}%`;
      this.text.style.color = low ? CONFIG.COLOR_BATTERY_LOW : '#ffffff';
    } else {
      this.text.textContent = '';
    }
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class UI {
  constructor(root, manifest) {
    this.root = root;
    this.manifest = manifest;
    this.screens = {};
    this._resultsRaf = null;
    this._build();
  }

  _build() {
    this.screens.difficulty = this._buildDifficulty();
    this.screens.instructions = this._buildInstructions();
    this.screens.hud = this._buildHud();
    this.screens.results = this._buildResults();
    for (const s of Object.values(this.screens)) {
      s.el.classList.add('screen', 'hidden');
      this.root.appendChild(s.el);
    }

    this.flashEl = document.createElement('div');
    this.flashEl.id = 'flashOverlay';
    this.root.appendChild(this.flashEl);
  }

  _buildDifficulty() {
    const el = document.createElement('div');
    el.appendChild(img('assets/ui/lily_bg.png', this.manifest.lily_bg));
    el.appendChild(img('assets/ui/lily_title.png', this.manifest.lily_title));
    el.appendChild(img('assets/ui/lily_difficulty.png', this.manifest.lily_difficulty));
    el.appendChild(img('assets/ui/lily_copyright.png', this.manifest.lily_copyright));
    const easyBtn = imageButton('assets/ui/lily_btn_facil.png', this.manifest.lily_btn_facil, 'easyBtn');
    const hardBtn = imageButton('assets/ui/lily_btn_dificil.png', this.manifest.lily_btn_dificil, 'hardBtn');
    el.appendChild(easyBtn);
    el.appendChild(hardBtn);
    return { el, easyBtn, hardBtn };
  }


  _buildInstructions() {
    const el = document.createElement('div');
    el.appendChild(img('assets/ui/lily_bg.png', this.manifest.lily_bg));
    const card = document.createElement('div');
    card.id = 'instructionsCard';
    const p = document.createElement('p');
    p.innerHTML = CONFIG.INSTRUCTION_LINES.join('<br>');
    card.appendChild(p);
    el.appendChild(card);
    const startBtn = document.createElement('button');
    startBtn.id = 'startBtn';
    startBtn.className = 'lily-btn';
    startBtn.textContent = '¡EMPEZAR!';
    el.appendChild(startBtn);
    return { el, startBtn };
  }

  _buildHud() {
    const el = document.createElement('div');
    el.appendChild(img('assets/ui/lily_points_panel.png', this.manifest.lily_points_panel));
    el.appendChild(img('assets/ui/lily_timer_panel.png', this.manifest.lily_timer_panel));
    el.appendChild(img('assets/ui/lily_copyright.png', this.manifest.lily_copyright));
    const points = new DigitDisplay(el, this.manifest, 'points');
    const timer = new DigitDisplay(el, this.manifest, 'timer');
    const battery = new BatteryIndicator(el, this.manifest);
    return { el, points, timer, battery };
  }

  _buildResults() {
    const el = document.createElement('div');
    el.appendChild(img('assets/ui/lily_bg.png', this.manifest.lily_bg));
    const scorePanel = img('assets/ui/lily_score_panel.png', this.manifest.lily_score_panel);
    el.appendChild(scorePanel);
    const excelente = img('assets/ui/lily_excelente.png', this.manifest.lily_excelente);
    el.appendChild(excelente);
    const score = new DigitDisplay(el, this.manifest, 'resultsScore');
    return { el, scorePanel, excelente, score };
  }

  _showOnly(name) {
    for (const [key, s] of Object.entries(this.screens)) {
      s.el.classList.toggle('hidden', key !== name);
    }
  }

  showInstructions() {
    this._showOnly('instructions');
  }

  showDifficulty() {
    this._showOnly('difficulty');
  }

  showHud() {
    this._showOnly('hud');
  }

  showResults(foundCount) {
    this._showOnly('results');
    this._animateResults(foundCount);
  }

  updatePoints(count) {
    this.screens.hud.points.show(String(count));
  }

  updateTimer(secondsLeft) {
    const s = Math.max(0, Math.ceil(secondsLeft));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    this.screens.hud.timer.show(`${m}${String(sec).padStart(2, '0')}`);
  }

  updateBattery() {
    this.screens.hud.battery.update();
  }

  _animateResults(foundCount) {
    const { scorePanel, excelente, score } = this.screens.results;
    const start = performance.now();
    const countDuration = 900;
    const popDuration = 500;
    const totalDuration = Math.max(countDuration, popDuration) + 400;

    const step = (now) => {
      const t = now - start;
      const popT = Math.min(1, t / popDuration);
      const popScale = easeOutBack(popT);
      const bobScale = 1 + 0.03 * Math.sin((t / 1000) * 2.5);

      scorePanel.style.transform = `scale(${popScale})`;
      excelente.style.transform = `scale(${popScale * bobScale})`;

      const countT = Math.min(1, t / countDuration);
      score.show(String(Math.round(countT * foundCount)));

      if (t < totalDuration) {
        this._resultsRaf = requestAnimationFrame(step);
      }
    };

    if (this._resultsRaf) cancelAnimationFrame(this._resultsRaf);
    scorePanel.style.transform = 'scale(0)';
    excelente.style.transform = 'scale(0)';
    score.show('0');
    this._resultsRaf = requestAnimationFrame(step);
  }
}
