/* Khan's Games service worker.
 *
 * Bump CACHE_VERSION on every deploy. It is the only thing that tells a
 * browser this file changed, and a changed worker is what triggers an update.
 *
 * Strategy:
 *   - Page loads  -> network first, fall back to cache.
 *     New builds appear on the very next launch when online, and the app still
 *     opens instantly with no signal.
 *   - Everything else (icons, manifest) -> cache first, refreshed in the
 *     background, because those rarely change and should never delay a launch.
 */
const CACHE_VERSION = 'khans-games-v5';
const NET_TIMEOUT = 3500;               // don't let a bad connection stall the launch

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(request, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(request).then(res => { clearTimeout(timer); resolve(res); },
                        err => { clearTimeout(timer); reject(err); });
  });
}

function isPageLoad(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.pathname.endsWith('/') || url.pathname.endsWith('.html');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (isPageLoad(e.request)) {
    // network first: newest build wins, cache is the safety net
    e.respondWith(
      fromNetwork(e.request, NET_TIMEOUT)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(hit => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // everything else: cache first, quietly refreshed for next time
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
