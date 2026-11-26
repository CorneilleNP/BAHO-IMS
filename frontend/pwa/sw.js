/* Baho IMS service worker (template: the build fills in VERSION and PRECACHE).
 *
 * It only keeps the app itself (pages, scripts, styles, fonts, icons) on the
 * device so the website opens without internet. Data is NOT handled here: the
 * app's own offline layer (IndexedDB cache + outbox) does that, so /api/ and
 * Django's /static/ are never touched.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `baho-app-${VERSION}`;
const INDEX = '/index.html';
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('baho-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAppFile(url) {
  return url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/static/');
}

// Pages: newest version from the server; the saved copy when offline or the network is too slow.
async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put(INDEX, response.clone());
    return response;
  } catch {
    return (await cache.match(INDEX)) || Response.error();
  }
}

// Scripts, styles, fonts, images: saved copy first (file names change with every release).
async function file(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isAppFile(url)) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else event.respondWith(file(request));
});
