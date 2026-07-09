// Central tunable constants for Lilypad Shake.
export const CONFIG = {
  BUILD: 'LILYPAD full video difficulty build 19',

  STAGE_W: 1920,
  STAGE_H: 1200,

  GAME_SECONDS: 180,
  RESULTS_SECONDS: 4,

  // One toy on screen at a time: it enters horizontally from the side opposite
  // the tilt, stays while its video plays, then disappears at video end.
  MAX_CONCURRENT_TOYS: 1,
  TOY_HEIGHT_PX: 918,
  TOY_ASPECT: 640 / 720, // color-half aspect (portrait split-alpha videos)
  TOY_Y: 600,
  TOY_START_X_OFFSET: 22,

  // Physics — a fresh tilt gesture reveals the toy from its side; after the
  // full video ends it hides back through that same side.
  SLIDE_SPEED: 2200, // px/s at full tilt
  RETREAT_SPEED: 2300,
  SLIDE_EASE_APPROACH: 20.0,
  MIN_REVEAL_SPEED: 0.34,
  TILT_FULL: 0.42,
  BOUNCE_MIN_SPEED: 750,
  BOUNCE_MAX_PX: 58,
  BOUNCE_DURATION: 0.28,
  BOUNCE_ANGLE_DEG: 1.0,
  EXPIRE_FADE_SEC: 0.18,
  SPAWN_COOLDOWN_SEC: 0.28,

  DIFFICULTY: {
    easy: {
      slideSpeedMul: 0.72,
      retreatSpeedMul: 0.75,
      easeMul: 0.9,
      expireFadeSec: 0.22,
      spawnCooldownSec: 0.38,
    },
    hard: {
      slideSpeedMul: 1.45,
      retreatSpeedMul: 1.85,
      easeMul: 1.35,
      expireFadeSec: 0.08,
      spawnCooldownSec: 0.22,
    },
  },

  // Shake detection
  SHAKE_THRESHOLD: 14,      // m/s^2 high-pass magnitude to count as a shake
  SHAKE_DEBOUNCE_MS: 350,
  SMALL_SHAKE_THRESHOLD: 7,

  // Tilt-based spawning. Flip TILT_SIGN_X if the real device reports directions
  // backwards.
  TILT_SIGN_X: -1,
  TILT_ENTER: 0.075,      // |tilt| threshold to start counting sustain
  TILT_EXIT: 0.025,
  TILT_SUSTAIN_SEC: 0.04, // how long a new tilt gesture must be held to spawn

  // Tap
  TAP_INFLATE: 50, // px, forgiving hit-test padding
  MIN_TOUCH_VISIBLE_FRACTION: 0.018,

  // Motion sign correction (device dependent, tune on real hardware)
  GRAVITY_SIGN_X: 1,
  GRAVITY_SIGN_Y: 1,

  // Rendering
  // false is correct for this project's vertex/UV layout (verified against the
  // raw split video frames — `true` renders the toy vertically flipped).
  FLIP_VIDEO_Y: false,

  CLIPS: ['atlas', 'Buzz', 'forky', 'Jessie', 'smarty', 'snappy', 'woody'],

  // Palette (from Unity source)
  COLOR_BG: '#8BA5EB',
  COLOR_BATTERY_FILL: '#66B3F5',
  COLOR_BATTERY_LOW: '#ED4238',
  COLOR_GOLD: '#FFD126',
  FLASH_PEAK_ALPHA: 0.35,
  FLASH_DURATION_MS: 220,

  // Instruction text (Spanish, minimal accents per house style except where clarity needs it)
  INSTRUCTION_LINES: [
    '¡LOS JUGUETES SE ESCONDIERON!',
    'INCLINÁ EL CELULAR A LOS COSTADOS',
    'Y TOCALOS PARA AGARRARLOS',
  ],
};
