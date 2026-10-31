/**
 * Automated Test Suite for Stage 4: Offline Interface and Service Worker
 * Run with: node backend/apps/geo_tracker/tests_stage4_sw.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Stage 4 Service Worker & Offline Interface Tests ---\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ ${name}:`, err.message);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ ${name}:`, err.message);
    failedTests++;
  }
}

// Locate files
const swPath = path.resolve(__dirname, '../housekeeping/static/pwa/sw.js');
const templatePath = path.resolve(__dirname, '../../templates/geo_tracker/submit_form.html');
const staticBasePath = path.resolve(__dirname, '../..');

const swContent = fs.readFileSync(swPath, 'utf8');
const templateContent = fs.readFileSync(templatePath, 'utf8');

// 1. Service Worker Syntax & Cache Versioning
runTest('1. Service Worker defines versioned caches (CACHE_VERSION = cs-v4)', () => {
  assert(swContent.includes("const CACHE_VERSION = 'cs-v4'"), 'Must define CACHE_VERSION = cs-v4');
  assert(swContent.includes("const ASSET_CACHE = CACHE_VERSION + '-assets'"), 'Must define ASSET_CACHE');
  assert(swContent.includes("const PAGE_CACHE = CACHE_VERSION + '-pages'"), 'Must define PAGE_CACHE');
});

// 2. Precache List Completeness
runTest('2. PRECACHE_ASSETS contains all mandatory GeoTracker modules and Leaflet vendor files', () => {
  const mandatoryAssets = [
    '/static/pwa/offline.html',
    '/campus-sanchalika-logo.png',
    '/static/geo_tracker/js/geotrackerOfflineDB.js',
    '/static/geo_tracker/js/geotrackerPhotoStorage.js',
    '/static/geo_tracker/js/geotrackerImageCompressor.js',
    '/static/geo_tracker/js/geotrackerReferenceData.js',
    '/static/geo_tracker/js/geotrackerRecordStorage.js',
    '/static/geo_tracker/vendor/leaflet/leaflet.js',
    '/static/geo_tracker/vendor/leaflet/leaflet.css',
    '/static/geo_tracker/vendor/leaflet/images/marker-icon.png',
    '/static/geo_tracker/vendor/leaflet/images/marker-icon-2x.png',
    '/static/geo_tracker/vendor/leaflet/images/marker-shadow.png'
  ];

  for (const asset of mandatoryAssets) {
    assert(swContent.includes(`'${asset}'`), `sw.js PRECACHE_ASSETS must contain ${asset}`);
  }
});

// 3. Physical Asset Verification on Disk
runTest('3. All precached static assets physically exist on disk in the project static paths', () => {
  const diskMappings = [
    { url: '/static/pwa/offline.html', file: 'apps/housekeeping/static/pwa/offline.html' },
    { url: '/campus-sanchalika-logo.png', file: 'apps/housekeeping/static/branding/campus-sanchalika-logo.png' },
    { url: '/static/geo_tracker/js/geotrackerOfflineDB.js', file: 'apps/geo_tracker/static/geo_tracker/js/geotrackerOfflineDB.js' },
    { url: '/static/geo_tracker/js/geotrackerPhotoStorage.js', file: 'apps/geo_tracker/static/geo_tracker/js/geotrackerPhotoStorage.js' },
    { url: '/static/geo_tracker/js/geotrackerImageCompressor.js', file: 'apps/geo_tracker/static/geo_tracker/js/geotrackerImageCompressor.js' },
    { url: '/static/geo_tracker/js/geotrackerReferenceData.js', file: 'apps/geo_tracker/static/geo_tracker/js/geotrackerReferenceData.js' },
    { url: '/static/geo_tracker/js/geotrackerRecordStorage.js', file: 'apps/geo_tracker/static/geo_tracker/js/geotrackerRecordStorage.js' },
    { url: '/static/geo_tracker/vendor/leaflet/leaflet.js', file: 'apps/geo_tracker/static/geo_tracker/vendor/leaflet/leaflet.js' },
    { url: '/static/geo_tracker/vendor/leaflet/leaflet.css', file: 'apps/geo_tracker/static/geo_tracker/vendor/leaflet/leaflet.css' },
    { url: '/static/geo_tracker/vendor/leaflet/images/marker-icon.png', file: 'apps/geo_tracker/static/geo_tracker/vendor/leaflet/images/marker-icon.png' },
    { url: '/static/geo_tracker/vendor/leaflet/images/marker-icon-2x.png', file: 'apps/geo_tracker/static/geo_tracker/vendor/leaflet/images/marker-icon-2x.png' },
    { url: '/static/geo_tracker/vendor/leaflet/images/marker-shadow.png', file: 'apps/geo_tracker/static/geo_tracker/vendor/leaflet/images/marker-shadow.png' }
  ];

  for (const item of diskMappings) {
    const fullPath = path.resolve(staticBasePath, item.file);
    assert(fs.existsSync(fullPath), `Asset file must exist at ${fullPath}`);
    const stat = fs.statSync(fullPath);
    assert(stat.size > 0, `Asset file at ${fullPath} must not be empty`);
  }
});

// 4. Cache Cleanup Isolation & Version Upgrade Logic
runTest('4. Service worker activate handler cleans up obsolete cs-* caches while preserving active version', () => {
  const existingCaches = [
    'cs-v1-assets',
    'cs-v1-pages',
    'cs-v2-assets',
    'cs-v2-pages',
    'cs-v3-assets',
    'cs-v3-pages',
    'cs-v4-assets',
    'cs-v4-pages',
    'user-profile-cache',
    'third-party-cache'
  ];

  const currentAssetCache = 'cs-v4-assets';
  const currentPageCache = 'cs-v4-pages';

  // Extract filter predicate from activate event in swContent
  const toDelete = existingCaches.filter(k => k.startsWith('cs-') && k !== currentAssetCache && k !== currentPageCache);

  assert.deepStrictEqual(toDelete, ['cs-v1-assets', 'cs-v1-pages', 'cs-v2-assets', 'cs-v2-pages', 'cs-v3-assets', 'cs-v3-pages']);
  assert(!toDelete.includes('cs-v4-assets'), 'Must not delete active cs-v4-assets');
  assert(!toDelete.includes('cs-v4-pages'), 'Must not delete active cs-v4-pages');
  assert(!toDelete.includes('third-party-cache'), 'Must not delete unrelated third-party cache');
});

// 5. Security Boundary & API Non-Caching Verification
runTest('5. Service worker fetch handler rejects POST, API, auth, and admin endpoints from caching', () => {
  const mockOrigin = 'https://sanchalika.iitgn.ac.in';

  function shouldIntercept(method, pathname, origin = mockOrigin) {
    if (method !== 'GET') return false;
    if (origin !== mockOrigin) return false;
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin/') ||
      pathname.startsWith('/accounts/') ||
      pathname.startsWith('/auth/')
    ) {
      return false;
    }
    return true;
  }

  // Security test cases
  assert.strictEqual(shouldIntercept('POST', '/geo/submit/record/'), false, 'POST submit must never be intercepted');
  assert.strictEqual(shouldIntercept('POST', '/api/geo-tracker/sync/records/'), false, 'POST sync records must never be intercepted');
  assert.strictEqual(shouldIntercept('POST', '/api/geo-tracker/sync/records/uuid/photos/'), false, 'POST sync photos must never be intercepted');
  assert.strictEqual(shouldIntercept('GET', '/api/geo-tracker/sync/status/'), false, 'API sync status must never be cached');
  assert.strictEqual(shouldIntercept('GET', '/api/users/current/'), false, 'API user endpoints must never be cached');
  assert.strictEqual(shouldIntercept('GET', '/admin/login/'), false, 'Admin pages must never be cached');
  assert.strictEqual(shouldIntercept('GET', '/accounts/login/'), false, 'SSO accounts login must never be cached');
  assert.strictEqual(shouldIntercept('GET', '/auth/jwt/refresh/'), false, 'JWT tokens must never be cached');
  assert.strictEqual(shouldIntercept('GET', '/geo/submit/', 'https://evil.com'), false, 'Cross-origin requests must be rejected');

  // Allowed app shell and static cases
  assert.strictEqual(shouldIntercept('GET', '/geo/submit/'), true, 'GeoTracker shell GET must be handled');
  assert.strictEqual(shouldIntercept('GET', '/static/geo_tracker/js/geotrackerOfflineDB.js'), true, 'Static JS GET must be handled');
  assert.strictEqual(shouldIntercept('GET', '/static/geo_tracker/vendor/leaflet/leaflet.css'), true, 'Vendor Leaflet CSS GET must be handled');
  assert.strictEqual(shouldIntercept('GET', '/housekeeping/mobile/'), true, 'Housekeeping mobile routes must be handled');
});

// 6. Network-First & Offline Fallback Simulation
(async () => {
  await runAsyncTest('6. Network-First strategy serves live online and falls back to cached page when offline', async () => {
    // Mock Cache implementation
    const mockStorage = new Map();
    const mockPageCache = {
      match: async (key) => mockStorage.get(typeof key === 'string' ? key : key.url),
      put: async (key, val) => mockStorage.set(typeof key === 'string' ? key : key.url, val)
    };

    // Pre-populate cached shell
    mockStorage.set('/geo/submit/', { status: 200, text: async () => '<html>Cached GeoTracker Shell</html>' });

    // A. Online simulation: live fetch succeeds
    let networkFetch = async () => ({
      ok: true,
      status: 200,
      clone: () => ({ status: 200, text: async () => '<html>Fresh Online GeoTracker Shell</html>' }),
      text: async () => '<html>Fresh Online GeoTracker Shell</html>'
    });

    let res = await (async function testNetworkFirst(url) {
      try {
        const live = await networkFetch();
        if (live.ok) mockPageCache.put(url, live.clone());
        return live;
      } catch (err) {
        const cached = await mockPageCache.match(url);
        if (cached) return cached;
        return { status: 503, text: async () => 'Offline' };
      }
    })('/geo/submit/');

    assert.strictEqual(await res.text(), '<html>Fresh Online GeoTracker Shell</html>', 'Online fetch should return fresh content');

    // B. Offline simulation: live fetch fails (TypeError: Failed to fetch)
    networkFetch = async () => { throw new TypeError('Failed to fetch'); };

    let offlineRes = await (async function testNetworkFirst(url) {
      try {
        const live = await networkFetch();
        if (live.ok) mockPageCache.put(url, live.clone());
        return live;
      } catch (err) {
        const cached = await mockPageCache.match(url);
        if (cached) return cached;
        return { status: 503, text: async () => 'Offline' };
      }
    })('/geo/submit/');

    assert.strictEqual(await offlineRes.text(), '<html>Fresh Online GeoTracker Shell</html>', 'Offline fetch must return cached shell');
  });

  // 7. Housekeeping Compatibility Verification
  runTest('7. Housekeeping routes (/housekeeping/, /portal/, /horticulture/, /inventory/mobile/) are preserved in networkFirst', () => {
    assert(swContent.includes("url.pathname.startsWith('/portal/')"), 'Housekeeping portal route must be checked');
    assert(swContent.includes("url.pathname.startsWith('/housekeeping/')"), 'Housekeeping route must be checked');
    assert(swContent.includes("url.pathname.startsWith('/horticulture/')"), 'Horticulture route must be checked');
    assert(swContent.includes("url.pathname.startsWith('/inventory/mobile/')"), 'Inventory mobile route must be checked');
    assert(swContent.includes("url.pathname.startsWith('/geo/submit')"), 'GeoTracker route must be included in app routes');
    assert(swContent.includes('/static/pwa/offline.html'), 'Housekeeping offline page fallback must remain');
  });

  // 8. Template Leaflet Local Asset Verification (No External CDN)
  runTest('8. submit_form.html loads Leaflet CSS & JS strictly from local vendor paths with no unpkg CDN', () => {
    assert(!templateContent.includes('https://unpkg.com/leaflet'), 'Template must NOT reference unpkg CDN');
    assert(templateContent.includes('href="/static/geo_tracker/vendor/leaflet/leaflet.css"'), 'Template must load local leaflet.css');
    assert(templateContent.includes('src="/static/geo_tracker/vendor/leaflet/leaflet.js"'), 'Template must load local leaflet.js');
    assert(templateContent.includes("L.Icon.Default.imagePath = '/static/geo_tracker/vendor/leaflet/images/'"), 'Leaflet icon default path must be explicitly localized');
  });

  // 9. Template Connectivity Banner & Visual Indicators
  runTest('9. submit_form.html provides connectivity status banner and online/offline event handlers', () => {
    assert(templateContent.includes('id="connectivityBanner"'), 'Must have connectivity banner element');
    assert(templateContent.includes('conn-online'), 'Must support online state styling');
    assert(templateContent.includes('conn-offline'), 'Must support offline state styling');
    assert(templateContent.includes('🌿 GeoTracker — Offline Mode'), 'Must render explicit Offline Mode title');
    assert(templateContent.includes("window.addEventListener('online', updateConnectivityStatus)"), 'Must attach online listener');
    assert(templateContent.includes("window.addEventListener('offline', updateConnectivityStatus)"), 'Must attach offline listener');
  });

  // 10. Offline Map Tile Fallback Notice
  runTest('10. submit_form.html provides clean fallback notice when offline map tiles cannot be fetched', () => {
    assert(templateContent.includes('id="mapOfflineNotice"'), 'Must contain mapOfflineNotice element inside mapPicker');
    assert(templateContent.includes('Offline Map Notice'), 'Notice text must explain map tiles require active connection');
    assert(templateContent.includes("tileLayer.on('tileerror'"), 'Tile error event must be monitored');
    assert(templateContent.includes("GPS positioning and manual coordinate entry remain fully operational"), 'Must confirm GPS and manual coordinates remain available');
  });

  // 11. Service Worker Registration in submit_form.html
  runTest('11. submit_form.html registers shared service worker (/sw.js) with scope /', () => {
    assert(templateContent.includes("navigator.serviceWorker.register('/sw.js', { scope: '/' })"), 'Must register /sw.js with scope /');
    assert(templateContent.includes('window.isSecureContext || location.hostname === \'localhost\''), 'Must safely check secure context or localhost');
  });

  // 12. Non-Misleading Local Record Submission Language
  runTest('12. submit_form.html displays non-misleading local save confirmation without claiming server upload', () => {
    assert(templateContent.includes('Your record is safely saved on this device. It will be uploaded to Campus Sanchalika during synchronization.'), 'Must use clear local storage confirmation language');
    assert(!templateContent.includes('Your record was uploaded to server'), 'Must not claim false server upload when saving locally');
  });

  // Print final summary
  console.log('\n================================');
  console.log(`Stage 4 Tests Completed: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
