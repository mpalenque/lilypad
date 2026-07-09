// Rear-camera background. Must be started from inside a user-gesture handler
// (the OK button) to satisfy autoplay/permission policies on mobile browsers.

export async function startCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[camera] getUserMedia not available');
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play();
    return true;
  } catch (err) {
    console.warn('[camera] failed to start camera:', err);
    return false;
  }
}
