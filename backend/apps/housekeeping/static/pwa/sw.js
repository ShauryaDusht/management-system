const CACHE_VERSION = 'cs-v1';
const ASSET_CACHE = CACHE_VERSION + '-assets';
const PAGE_CACHE = CACHE_VERSION + '-pages';
const PRECACHE = ['/static/pwa/offline.html', '/static/branding/campus-sanchalika-logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ASSET_CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('cs-') && k !== ASSET_CACHE && k !== PAGE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/media/')) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  const isMobile = url.pathname.startsWith('/housekeeping/') || url.pathname.startsWith('/horticulture/') || url.pathname.startsWith('/inventory/mobile/');
  if (isMobile) { e.respondWith(networkFirst(request)); return; }
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch { return new Response('Offline', { status: 503 }); }
}

async function networkFirst(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return caches.match('/static/pwa/offline.html');
  }
}
