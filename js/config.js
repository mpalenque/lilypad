// Central tunable constants for Lilypad Shake.
export const CONFIG = {
  BUILD: 'LILYPAD fullscreen fast build 16',

  STAGE_W: 1920,
  STAGE_H: 1200,

  GAME_SECONDS: 180,
  RESULTS_SECONDS: 4,

  // One toy on screen at a time: it appears from the side opposite the tilt,
  // then stops flush with that same edge.
  MAX_CONCURRENT_TOYS: 1,
  TOY_HEIGHT_PX: 1148,
  TOY_ASPECT: 640 / 720, // color-half aspect (portrait split-alpha videos)
  TOY_Y: 600,
  TOY_START_X_OFFSET: 22,
  VIDEO_STOP_AT_SEC: 2.0,

  // Physics — tilt reveals the toy from its side; neutral/opposite tilt makes
  // it slide back toward the side it came from.
  SLIDE_SPEED: 1250, // px/s at full tilt
  RETREAT_SPEED: 1100,
  SLIDE_EASE_APPROACH: 13.0,

  // Shake detection
  SHAKE_THRESHOLD: 14,      // m/s^2 high-pass magnitude to count as a shake
  SHAKE_DEBOUNCE_MS: 350,
  SMALL_SHAKE_THRESHOLD: 7,

  // Tilt-based spawning. Flip TILT_SIGN_X if the real device reports directions
  // backwards.
  TILT_SIGN_X: -1,
  TILT_ENTER: 0.16,       // |tilt| threshold to start counting sustain
  TILT_EXIT: 0.07,
  TILT_SUSTAIN_SEC: 0.02, // how long a tilt must be held to spawn

  // Tap
  TAP_INFLATE: 50, // px, forgiving hit-test padding

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
