const CACHE_NAME = 'lilypad-offline-v43';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './service-worker.js',
  './css/styles.css',
  './js/camera.js',
  './js/config.js',
  './js/fx.js',
  './js/game.js',
  './js/gesture.js',
  './js/manifest.js',
  './js/media.js',
  './js/monitor.js',
  './js/motion.js',
  './js/physics.js',
  './js/renderer.js',
  './js/toys.js',
  './js/ui.js',
  './assets/audio/found_toy.wav',
  './assets/audio/game_over.mp3',
  './assets/effects/hold_progress.png',
  './assets/effects/stars_sheet.png',
  './assets/fonts/ArialRoundedBold.ttf',
  './assets/ui/_lily_manifest.json',
  './assets/ui/lilypad-app-icon.svg',
  './assets/ui/lily_battery.png',
  './assets/ui/lily_bg.png',
  './assets/ui/lily_btn_asistencia.png',
  './assets/ui/lily_btn_dificil.png',
  './assets/ui/lily_btn_facil.png',
  './assets/ui/lily_colon.png',
  './assets/ui/lily_copyright.png',
  './assets/ui/lily_difficulty.png',
  './assets/ui/lily_digit_0.png',
  './assets/ui/lily_digit_1.png',
  './assets/ui/lily_digit_2.png',
  './assets/ui/lily_digit_3.png',
  './assets/ui/lily_digit_4.png',
  './assets/ui/lily_digit_5.png',
  './assets/ui/lily_digit_6.png',
  './assets/ui/lily_digit_7.png',
  './assets/ui/lily_digit_8.png',
  './assets/ui/lily_digit_9.png',
  './assets/ui/lily_excelente.png',
  './assets/ui/lily_points_panel.png',
  './assets/ui/lily_score_panel.png',
  './assets/ui/lily_timer_panel.png',
  './assets/ui/lily_title.png',
  './assets/videos/Buzz.mp4',
  './assets/videos/Jessie.mp4',
  './assets/videos/atlas.mp4',
  './assets/videos/forky.mp4',
  './assets/videos/smarty.mp4',
  './assets/videos/snappy.mp4',
  './assets/videos/woody.mp4',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('lilypad-offline-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

function rangeResponse(response, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return response;

  return response.arrayBuffer().then((buffer) => {
    const size = buffer.byteLength;
    const [, startToken, endToken] = match;
    const suffixLength = startToken ? null : Number(endToken);
    const start = startToken ? Number(startToken) : Math.max(0, size - suffixLength);
    const end = endToken && startToken ? Math.min(Number(endToken), size - 1) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    return new Response(buffer.slice(start, end + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers,
    });
  });
}

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request, { ignoreSearch: true });
}

async function respond(request) {
  const cached = await cachedResponse(request);
  if (cached) {
    const rangeHeader = request.headers.get('range');
    return rangeHeader ? rangeResponse(cached, rangeHeader) : cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && !request.headers.has('range')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    if (request.mode === 'navigate') {
      const appShell = await cachedResponse(new URL('./index.html', self.location.href).href);
      if (appShell) return appShell;
    }
    return new Response('Lilypad no encontró este recurso sin conexión.', {
      status: 504,
      statusText: 'Offline',
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
