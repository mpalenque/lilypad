export function videoFinished(videoEl) {
  if (!videoEl) return true;
  if (videoEl.ended) return true;
  return Number.isFinite(videoEl.duration) && videoEl.duration > 0 && videoEl.currentTime >= videoEl.duration - 0.04;
}

export function videoRemainingSeconds(videoEl) {
  if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return Infinity;
  return Math.max(0, videoEl.duration - videoEl.currentTime);
}

export function isVideoTouchLocked(videoEl, lockoutSeconds) {
  return videoRemainingSeconds(videoEl) <= lockoutSeconds;
}
