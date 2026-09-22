/* ============================================================
 * AGNIVEER VAYU CBT — SERVICE WORKER (offline app shell)
 * Cache-first for the immutable app shell + bundled bank data.
 * ============================================================ */

const SW_VERSION = 'kineora-exam-v1.4.48';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/util.js',
  './js/db.js',
  './js/engine.js',
  './js/generator.js',
  './js/parsers.js',
  './js/seed.js',
  './js/charts.js',
  './js/router.js',
  './js/chrome.js',
  './js/cloud.js',
  './js/cutoffs.js',
  './js/app.js',
  './js/views/dashboard.js',
  './js/views/tests.js',
  './js/views/instructions.js',
  './js/views/exam.js',
  './js/views/result.js',
  './js/views/bank.js',
  './js/views/import.js',
  './js/views/misc.js',
  './js/share.js',
  './data/airforce/bank-physics.json',
  './data/airforce/bank-mathematics.json',
  './data/airforce/bank-english.json',
  './data/airforce/bank-raga.json',
  './data/airforce/retired-raga.json',
  './data/ssc-chsl/bank-mathematics.json',
  './data/ssc-chsl/bank-english.json',
  './data/ssc-chsl/bank-reasoning.json',
  './data/ssc-chsl/bank-gs.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-96.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SW_VERSION)
      .then(c => c.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => {/* shell items cached lazily on first fetch */})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* v1.4.44: HTML/navigations NETWORK-FIRST — naya version pehli reload par
     hi milta hai (cache-first me purana version chalta rehta tha "kai baar").
     Baaki assets cache-first (offline-fast). */
  const isNav = e.request.mode === 'navigate' ||
    (e.request.destination === 'document') ||
    (e.request.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(SW_VERSION).then(c => { c.put(e.request, copy); c.put('./', copy.clone()); });
        }
        return resp;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./')))
    );
    return;
  }
  // cache-first, network fallback (then cache the result for next time)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.ok && new URL(e.request.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(SW_VERSION).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
