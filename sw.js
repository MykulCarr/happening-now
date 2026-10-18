// Service Worker for HAPPENING NOW! Dashboard
const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `happening-now-${BUILD_ID}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/weather.html',
  '/stocks.html',
  '/settings.html',
  '/feedback.html',
  '/assets/common.js',
  '/assets/news.js',
  '/assets/weather.js',
  '/assets/stocks.js',
  '/assets/settings.js',
  '/assets/news-picker.js',
  '/assets/news-picker.css',
  '/assets/news-picker-local.js',
  '/assets/source-search.js',
  '/assets/report.js',
  '/assets/usage.js',
  '/assets/report.css',
  '/assets/feedback.js',
  '/assets/settings-sync.js',
  '/assets/topbar.js',
  '/assets/infobar.js',
  '/assets/styles.css'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Never cache the admin page or its data: this handler stores every 200 it
  // sees, which would leave reader reports on the device after one visit and
  // serve them offline with no login.
  const path = new URL(event.request.url).pathname;
  if (path === '/admin' || path === '/admin.html' || path.startsWith('/v1/admin/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});
