// Loads the PSD sprite manifest (w/h/cx/cy per sprite) extracted from the Unity project.
// Falls back to hardcoded values (from _lily_manifest.json) if the fetch fails.

const FALLBACK_MANIFEST = {
  lily_bg: { w: 1920, h: 1200, cx: 960.0, cy: 600.0 },
  lily_title: { w: 1561, h: 371, cx: 975.5, cy: 416.5 },
  lily_difficulty: { w: 837, h: 133, cx: 969.5, cy: 702.5 },
  lily_copyright: { w: 237, h: 24, cx: 937.5, cy: 1175.0 },
  lily_timer_panel: { w: 384, h: 148, cx: 1706.0, cy: 1119.0 },
  lily_points_panel: { w: 314, h: 145, cx: 197.0, cy: 1114.5 },
  lily_score_panel: { w: 1068, h: 461, cx: 960.0, cy: 538.5 },
  lily_excelente: { w: 731, h: 207, cx: 958.5, cy: 974.5 },
  lily_battery: { w: 181, h: 83, cx: 1507.5, cy: 92.5 },
  lily_btn_facil: { w: 715, h: 390, cx: 566.5, cy: 964.0 },
  lily_btn_dificil: { w: 730, h: 390, cx: 1362.0, cy: 964.0 },
  lily_digit_0: { w: 212, h: 277 },
  lily_digit_1: { w: 191, h: 277 },
  lily_digit_2: { w: 207, h: 277 },
  lily_digit_3: { w: 198, h: 278 },
  lily_digit_4: { w: 201, h: 278 },
  lily_digit_5: { w: 199, h: 277 },
  lily_digit_6: { w: 215, h: 274 },
  lily_digit_7: { w: 217, h: 274 },
  lily_digit_8: { w: 214, h: 274 },
  lily_digit_9: { w: 213, h: 274 },
  lily_colon: { w: 73, h: 138 },
  _digit_native_h: 278,
  lily_btn_asistencia: { w: 700, h: 300 },
};

export async function loadManifest() {
  try {
    const res = await fetch('assets/ui/_lily_manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('[manifest] using fallback manifest:', err);
    return FALLBACK_MANIFEST;
  }
}

// Panel digit-slot layout: slots are offsets from the panel center, in Unity
// y-up local space (ported from ARVideoTouchChecklist.cs). Converted to
// stage px (y-down) by ui.js via: slotCenter = (panel.cx + sx, panel.cy - sy).
export const DIGIT_SLOTS = {
  points: {
    panel: 'lily_points_panel',
    slots: [[4, 5.5], [65, 5.5]],
    glyphHeight: 62,
  },
  timer: {
    panel: 'lily_timer_panel',
    slots: [[-20, 5], [62, 5], [114, 5]],
    glyphHeight: 60,
  },
  resultsScore: {
    panel: 'lily_score_panel',
    slots: [[36, 0], [256, 0]],
    glyphHeight: 160,
  },
};
