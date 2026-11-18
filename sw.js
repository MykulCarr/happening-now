// Service Worker for HAPPENING NOW! Dashboard
const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `happening-now-${BUILD_ID}`;
// Pages by their clean paths: that is what a reader's browser asks for. The
// .html names 301 to these, so caching them never matched a real visit.
const ASSETS_TO_CACHE = [
  '/',
  '/weather',
  '/markets',
  '/settings',
  '/feedback',
  '/assets/common.js',
  '/assets/common-feeds.js',
  '/assets/common-weather.js',
  '/assets/common-stocks.js',
  '/assets/top-feeds.js',
  '/assets/widget-link.js',
  '/assets/news.js',
  '/assets/news-swipe.js',
  '/assets/weather-alerts-ticker.js',
  '/assets/weather-map.js',
  '/assets/weather.js',
  '/assets/markets-movers.js',
  '/assets/markets-news.js',
  '/assets/stocks.js',
  '/assets/settings-install.js',
  '/assets/settings-markets.js',
  '/assets/settings-stock-lookup.js',
  '/assets/settings.js',
  '/assets/news-picker.js',
  '/assets/news-picker.css',
  '/assets/news-picker-local.js',
  '/assets/source-search.js',
  '/assets/report.js',
  '/assets/report.css',
  '/assets/feedback.js',
  '/assets/settings-sync.js',
  '/assets/settings-backup.js',
  '/assets/whats-new.js',
  '/assets/topbar.js',
  '/assets/infobar.js',
  '/assets/styles.css',
  '/assets/news.css',
  '/assets/weather.css',
  '/assets/markets.css',
  '/assets/settings.css'
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
  // Nor the widget app download: an offline copy of an installer is no use,
  // and a stale version.json would hide an update.
  if (path.startsWith('/assets/widget-app/')) return;

  const key = cacheKey(event.request);
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(key, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(key);
      })
  );
});

// Feed requests carry a unique cache-buster (_hn=<time>) inside the url
// parameter of /v1/rss/raw. Stored under that exact address, every refresh
// added a new copy that was never read again: about 4 MB per page view,
// growing until the next deploy. Stored without it, a feed's newest copy
// replaces the last, and is still there to show when the reader is offline.
function cacheKey(request) {
  const url = new URL(request.url);
  const feed = url.pathname === '/v1/rss/raw' && url.searchParams.get('url');
  if (!feed || !feed.includes('_hn=')) return request;
  try {
    const inner = new URL(feed);
    inner.searchParams.delete('_hn');
    url.searchParams.set('url', inner.toString());
    return url.toString();
  } catch {
    return request;
  }
}
