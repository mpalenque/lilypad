// Central tunable constants for Lilypad Shake.
export const CONFIG = {
  BUILD: 'LILYPAD automatic gravity tilt build 32',

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
  TOY_INITIAL_VISIBLE_PX: 480,
  TOY_LIFETIME_SEC: 2,
  TOY_RETREAT_LEAD_SEC: 0.25,

  // Physics — a fresh tilt gesture reveals the toy from its side; after the
  // full video ends it hides back through that same side.
  SLIDE_SPEED: 6400, // px/s at full tilt
  RETREAT_SPEED: 6000,
  SLIDE_EASE_APPROACH: 50.0,
  MIN_REVEAL_SPEED: 0.34,
  TILT_FULL: 0.42,
  BOUNCE_MIN_SPEED: 750,
  BOUNCE_MAX_PX: 58,
  BOUNCE_DURATION: 0.28,
  BOUNCE_ANGLE_DEG: 1.0,
  EXPIRE_FADE_SEC: 0.18,
  TILT_REARM_SEC: 0.12,
  TOUCH_DISABLE_BEFORE_END_SEC: 2,
  VIDEO_START_TIMEOUT_SEC: 0.9,
  VIDEO_RETRY_INTERVAL_SEC: 0.18,
  VIDEO_MAX_RECOVERY_ATTEMPTS: 2,
  VIDEO_MAX_REPLACEMENTS: 2,

  DIFFICULTY: {
    easy: {
      slideSpeedMul: 1.0,
      retreatSpeedMul: 1.0,
      easeMul: 1.0,
      expireFadeSec: 0.22,
      rearmSec: 0.08,
    },
    hard: {
      slideSpeedMul: 1.45,
      retreatSpeedMul: 1.85,
      easeMul: 1.35,
      expireFadeSec: 0.08,
      rearmSec: 0.08,
    },
  },

  // Shake detection
  SHAKE_THRESHOLD: 14,      // m/s^2 high-pass magnitude to count as a shake
  SHAKE_DEBOUNCE_MS: 350,
  SMALL_SHAKE_THRESHOLD: 7,

  // Screen-space gravity is the only trigger. A left edge that is lower has a
  // negative X value and must reveal the video on the right (and vice versa).
  TILT_SIGN_X: -1,
  TILT_ENTER: 0.055,
  TILT_EXIT: 0.02,
  TILT_FAST_LOW_PASS: 0.8,
  TILT_NEUTRAL_CAPTURE_MAX: 0.14,
  TILT_NEUTRAL_FOLLOW: 0.12,

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
    'GIRÁ LA TABLET COMO UN VOLANTE',
    'Y TOCALOS PARA AGARRARLOS',
  ],
};
