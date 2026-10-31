/**
 * Campus Sanchalika Service Worker
 * Shared across Housekeeping PWA and GeoTracker Offline-First module.
 * Cache Version: cs-v4
 */

const CACHE_VERSION = 'cs-v4';
const ASSET_CACHE = CACHE_VERSION + '-assets';
const PAGE_CACHE = CACHE_VERSION + '-pages';

// Assets required for offline operation of Housekeeping and GeoTracker
const PRECACHE_ASSETS = [
  '/static/pwa/offline.html',
  '/campus-sanchalika-logo.png',
  // GeoTracker static JS modules
  '/static/geo_tracker/js/geotrackerOfflineDB.js',
  '/static/geo_tracker/js/geotrackerPhotoStorage.js',
  '/static/geo_tracker/js/geotrackerImageCompressor.js',
  '/static/geo_tracker/js/geotrackerReferenceData.js',
  '/static/geo_tracker/js/geotrackerRecordStorage.js',
  '/static/geo_tracker/js/geotrackerSyncEngine.js',
  '/static/geo_tracker/js/geotrackerManagementUI.js',
  // Localized Leaflet library and assets
  '/static/geo_tracker/vendor/leaflet/leaflet.js',
  '/static/geo_tracker/vendor/leaflet/leaflet.css',
  '/static/geo_tracker/vendor/leaflet/images/marker-icon.png',
  '/static/geo_tracker/vendor/leaflet/images/marker-icon-2x.png',
  '/static/geo_tracker/vendor/leaflet/images/marker-shadow.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      const assetCache = await caches.open(ASSET_CACHE);
      // Precache assets resiliently: individual failures do not block overall SW installation
      await Promise.all(
        PRECACHE_ASSETS.map(async url => {
          try {
            await assetCache.add(url);
          } catch (err) {
            console.warn('[SW Precache] Failed to cache asset:', url, err);
          }
        })
      );
      // Precache the GeoTracker form page shell into PAGE_CACHE
      try {
        const pageCache = await caches.open(PAGE_CACHE);
        await pageCache.add(new Request('/geo/submit/', { cache: 'reload' }));
      } catch (err) {
        console.warn('[SW Precache] Failed to cache /geo/submit/ shell:', err);
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('cs-') && k !== ASSET_CACHE && k !== PAGE_CACHE)
          .map(k => {
            console.log('[SW] Deleting obsolete cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. Only intercept GET requests - NEVER touch POST/PUT/DELETE
  if (request.method !== 'GET') return;

  // 2. Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // 3. Security Boundary: NEVER cache API, Authentication, or Admin endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/accounts/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // 4. Static assets (JS, CSS, images, icons, vendor): Cache-First
  if (url.pathname.startsWith('/static/') || url.pathname === '/campus-sanchalika-logo.png') {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 5. Media assets (preserve existing Housekeeping behavior without caching sensitive photos)
  if (url.pathname.startsWith('/media/')) {
    // Avoid caching sensitive plant photographs or dynamic uploads
    if (url.pathname.includes('/plant_photos/')) {
      return;
    }
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 6. Mobile Application Pages & GeoTracker Form: Network-First with cached fallback
  const isAppPage =
    url.pathname.startsWith('/portal/') ||
    url.pathname.startsWith('/housekeeping/') ||
    url.pathname.startsWith('/horticulture/') ||
    url.pathname.startsWith('/inventory/mobile/') ||
    url.pathname === '/geo/submit/' ||
    url.pathname.startsWith('/geo/submit');

  if (isAppPage) {
    e.respondWith(networkFirst(request));
    return;
  }
});

/**
 * Cache-First Strategy with Background Cache Refresh
 */
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) {
    // If online, refresh cache in background for next time
    fetch(req).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(cacheName);
        cache.put(req, res);
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Fallback: check cache ignoring search params if device is offline
    const fallback = await caches.match(req, { ignoreSearch: true });
    if (fallback) return fallback;

    return new Response('Offline Asset Unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Network-First Strategy with Offline Page Shell Fallback
 */
async function networkFirst(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Exact request match
    const cached = await cache.match(req);
    if (cached) return cached;

    // GeoTracker route fallback (e.g. /geo/submit without trailing slash or with query params)
    const url = new URL(req.url);
    if (url.pathname.startsWith('/geo/submit')) {
      const geoShell = await cache.match('/geo/submit/');
      if (geoShell) return geoShell;
    }

    // Default Housekeeping offline page fallback
    const offlineFallback = await caches.match('/static/pwa/offline.html');
    if (offlineFallback) return offlineFallback;

    return new Response('Offline - No Cached Version Available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
