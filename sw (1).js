// JP Knits & Embroidery POS — Service Worker
// Handles offline caching so the app works without internet

const CACHE_NAME = 'jpknits-pos-v2';
const OFFLINE_URL = 'jp-knits-pos.html';

const PRECACHE_ASSETS = [
  'index.html',
  'jp-knits-pos.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// ---- Install: cache all core assets ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // If icons aren't available yet, just cache the HTML
        return cache.add(OFFLINE_URL);
      });
    }).then(() => self.skipWaiting())
  );
});

// ---- Activate: clean up old caches ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch: serve from cache, fall back to network ----
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase / Google / CDN requests — always go to network for those
  const url = new URL(event.request.url);
  const skipDomains = ['firebaseio.com', 'googleapis.com', 'gstatic.com', 'fonts.googleapis.com', 'wa.me', 'api.callmebot.com'];
  if (skipDomains.some(d => url.hostname.includes(d))) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Serve from cache, but also update in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
        return cachedResponse;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // Offline and not cached — return the main app HTML for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// ---- Background sync notification ----
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
