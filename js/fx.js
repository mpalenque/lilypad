// Feedback effects: star-sheet burst (port of ARStarsBurst), white flash, sounds.
import { CONFIG } from './config.js?v=40';

const STAR_SHEET = {
  cols: 6,
  rows: 6,
  frames: 36,
  sheetW: 1020,
  sheetH: 1092,
  displayW: 360,
  durationMs: 700,
};

export class Fx {
  constructor(uiEl, flashEl) {
    this.uiEl = uiEl;
    this.flashEl = flashEl;
    this.foundSound = new Audio('assets/audio/found_toy.wav');
    this.foundSound.preload = 'auto';
    this.gameOverSound = new Audio('assets/audio/game_over.mp3');
    this.gameOverSound.preload = 'auto';
  }

  flash() {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = String(CONFIG.FLASH_PEAK_ALPHA);
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${CONFIG.FLASH_DURATION_MS}ms ease-out`;
      el.style.opacity = '0';
    });
  }

  // stageX/Y: center of the burst in stage px (0..1920, 0..1200).
  starsAt(stageX, stageY) {
    const scale = STAR_SHEET.displayW / (STAR_SHEET.sheetW / STAR_SHEET.cols);
    const cellW = (STAR_SHEET.sheetW / STAR_SHEET.cols) * scale;
    const cellH = (STAR_SHEET.sheetH / STAR_SHEET.rows) * scale;

    const div = document.createElement('div');
    div.className = 'star-burst abs';
    div.style.width = `${cellW}px`;
    div.style.height = `${cellH}px`;
    div.style.left = `${stageX - cellW / 2}px`;
    div.style.top = `${stageY - cellH / 2}px`;
    div.style.backgroundSize = `${STAR_SHEET.sheetW * scale}px ${STAR_SHEET.sheetH * scale}px`;
    this.uiEl.appendChild(div);

    const start = performance.now();
    const step = () => {
      const t = performance.now() - start;
      const frame = Math.min(STAR_SHEET.frames - 1, Math.floor((t / STAR_SHEET.durationMs) * STAR_SHEET.frames));
      const col = frame % STAR_SHEET.cols;
      const row = Math.floor(frame / STAR_SHEET.cols);
      div.style.backgroundPosition = `-${col * cellW}px -${row * cellH}px`;
      if (t < STAR_SHEET.durationMs) {
        requestAnimationFrame(step);
      } else {
        div.remove();
      }
    };
    requestAnimationFrame(step);
  }

  playFound() {
    const s = this.foundSound.cloneNode(true);
    s.play().catch(() => {});
  }

  playGameOver() {
    this.gameOverSound.currentTime = 0;
    this.gameOverSound.play().catch(() => {});
  }
}
