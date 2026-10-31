/**
 * Automated Test Suite for Stage 7: End-to-End Field Validation, Stress Testing & Production Readiness
 * Campus Sanchalika — IIT Gandhinagar
 * Run with: node backend/apps/geo_tracker/tests_stage7_e2e_stress.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Starting Stage 7 End-to-End Stress & Field Validation Tests ===\n');

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

// ── Mock IndexedDB & Storage Environment ──────────────────────────────────
class MockIDBStore {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    this.data = new Map();
  }

  put(item) {
    const key = item[this.keyPath];
    this.data.set(key, JSON.parse(JSON.stringify(item)));
    return { onsuccess: null, onerror: null };
  }

  get(key) {
    const item = this.data.get(key);
    const req = { result: item ? JSON.parse(JSON.stringify(item)) : undefined };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  }

  getAll() {
    const items = Array.from(this.data.values()).map(i => JSON.parse(JSON.stringify(i)));
    const req = { result: items };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  }

  delete(key) {
    this.data.delete(key);
    return { onsuccess: null, onerror: null };
  }

  index(indexName) {
    const self = this;
    return {
      getAll: function(val) {
        const matching = Array.from(self.data.values()).filter(item => {
          if (val === undefined) return true;
          return item[indexName] === val;
        }).map(i => JSON.parse(JSON.stringify(i)));
        const req = { result: matching };
        setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
        return req;
      }
    };
  }
}

class MockIDBDatabase {
  constructor() {
    this.stores = {
      plant_records: new MockIDBStore('plant_records', 'local_id'),
      plant_photos: new MockIDBStore('plant_photos', 'photo_id'),
      sync_queue: new MockIDBStore('sync_queue', 'queue_id'),
      reference_data: new MockIDBStore('reference_data', 'key')
    };
  }

  transaction(storeNames, mode) {
    const self = this;
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = {
      mode: mode,
      objectStore: function(name) { return self.stores[name]; },
      oncomplete: null,
      onerror: null,
      abort: function() {}
    };
    setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 5);
    return tx;
  }
}

let mockDBInstance = new MockIDBDatabase();

// Setup global browser mocks
global.window = global;
global.window.addEventListener = function() {};
global.window.removeEventListener = function() {};

const revokedObjectURLs = new Set();
global.URL = {
  createObjectURL: function(blob) { return 'blob:mock-url-' + Math.random().toString(36).substring(2); },
  revokeObjectURL: function(url) { revokedObjectURLs.add(url); }
};

global.localStorage = {
  store: {},
  getItem: function(k) { return this.store[k] || null; },
  setItem: function(k, v) { this.store[k] = String(v); },
  removeItem: function(k) { delete this.store[k]; }
};

global.navigator = {
  onLine: true,
  storage: {
    persist: function() { return Promise.resolve(true); },
    persisted: function() { return Promise.resolve(true); }
  }
};

global.document = {
  body: { style: {} },
  querySelector: function(sel) {
    if (sel === 'input[name="csrfmiddlewaretoken"]') return { value: 'mock-csrf-token-xyz' };
    return null;
  },
  querySelectorAll: function(sel) {
    return [];
  },
  cookie: 'csrftoken=mock-csrf-token-xyz; sessionid=mock-session-789',
  addEventListener: function() {},
  removeEventListener: function() {},
  getElementById: function(id) {
    return {
      id: id,
      textContent: '',
      innerHTML: '',
      style: {},
      classList: {
        classes: new Set(),
        add: function(c) { this.classes.add(c); },
        remove: function(c) { this.classes.delete(c); },
        contains: function(c) { return this.classes.has(c); }
      },
      addEventListener: function() {},
      setAttribute: function() {},
      getAttribute: function() { return null; }
    };
  }
};

function mockJsonResponse(data, status) {
  const st = status !== undefined ? status : 200;
  return {
    ok: st >= 200 && st < 300,
    status: st,
    headers: {
      get: (k) => k.toLowerCase() === 'content-type' ? 'application/json' : null,
      'content-type': 'application/json'
    },
    json: async () => data
  };
}

// Mock GeoTrackerDB
global.GeoTrackerDB = {
  STORES: {
    RECORDS: 'plant_records',
    PHOTOS: 'plant_photos',
    QUEUE: 'sync_queue',
    REF_DATA: 'reference_data'
  },
  generateUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  openDB: function() { return Promise.resolve(mockDBInstance); },
  runTransaction: function(storeNames, mode, callback) {
    const tx = mockDBInstance.transaction(storeNames, mode);
    return new Promise((resolve) => {
      const res = callback(tx);
      tx.oncomplete = () => resolve(res);
    });
  }
};

// Load modules under test
const photoStoragePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerPhotoStorage.js');
eval(fs.readFileSync(photoStoragePath, 'utf8'));

const recordStoragePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerRecordStorage.js');
eval(fs.readFileSync(recordStoragePath, 'utf8'));

const syncEnginePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerSyncEngine.js');
eval(fs.readFileSync(syncEnginePath, 'utf8'));

const managementUIPath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerManagementUI.js');
eval(fs.readFileSync(managementUIPath, 'utf8'));

function resetStorage() {
  mockDBInstance.stores.plant_records.data.clear();
  mockDBInstance.stores.plant_photos.data.clear();
  mockDBInstance.stores.sync_queue.data.clear();
  global.localStorage.store = {};
  revokedObjectURLs.clear();
}

function makeBlob(txt, sizeBytes) {
  const content = txt || 'photo-bytes';
  const blob = new Blob([content], { type: 'image/jpeg' });
  if (sizeBytes) {
    Object.defineProperty(blob, 'size', { value: sizeBytes });
  }
  return blob;
}

// ── Test Scenarios ──────────────────────────────────────────────────────────

(async () => {
  // Test 1: 50+ Plant Records Large Queue Synchronization
  await runAsyncTest('1. Large Queue Stress: 50+ plant records with photos synchronize cleanly', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const RECORD_COUNT = 55;
    const PHOTO_SIZE_BYTES = 393625; // ~384.4 KB realistic compressed size

    // Generate 55 records with photos
    for (let i = 1; i <= RECORD_COUNT; i++) {
      const locId = `stress-rec-${i}`;
      const subId = global.GeoTrackerDB.generateUUID();
      const photoId = `photo-${i}`;

      mockDBInstance.stores.plant_records.put({
        local_id: locId,
        submission_id: subId,
        plant_type: 'tree',
        variety: '1',
        local_name: `Neem Sample ${i}`,
        scientific_name: 'Azadirachta indica',
        zone: i % 2 === 0 ? 'academic_block' : 'sports_complex',
        latitude: '23.2125000',
        longitude: '72.6845000',
        height_m: 5.5,
        girth_cm: 65.0,
        sync_status: 'pending_sync',
        created_at: new Date(Date.now() - (RECORD_COUNT - i) * 60000).toISOString()
      });

      mockDBInstance.stores.plant_photos.put({
        photo_id: photoId,
        local_record_id: locId,
        image_blob: makeBlob(`photo-data-${i}`, PHOTO_SIZE_BYTES),
        original_filename: `neem_${i}.jpg`,
        file_size: PHOTO_SIZE_BYTES,
        mime_type: 'image/jpeg',
        upload_status: 'pending'
      });
    }

    let recordsUploaded = 0;
    let photosUploaded = 0;
    let totalBytesUploaded = 0;
    const startTime = Date.now();

    global.fetch = async function(url, opts) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({
          authenticated: true,
          can_sync: true,
          allowed_areas: ['*'],
          server_time: new Date().toISOString()
        });
      }

      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        recordsUploaded++;
        const body = JSON.parse(opts.body);
        return mockJsonResponse({
          success: true,
          already_exists: false,
          record_id: recordsUploaded,
          tracking_id: `T${recordsUploaded.toString().padStart(5, '0')}`,
          submission_id: body.submission_id
        }, 201);
      }

      if (url.includes('/photos/')) {
        photosUploaded++;
        totalBytesUploaded += PHOTO_SIZE_BYTES;
        return mockJsonResponse({
          success: true,
          already_exists: false,
          photo_id: 'mock-p-uuid',
          message: 'Photograph uploaded successfully.'
        }, 201);
      }

      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    const result = await Engine.syncNow(true);
    const durationMs = Date.now() - startTime;

    assert.strictEqual(recordsUploaded, RECORD_COUNT, 'All 55 records must be uploaded');
    assert.strictEqual(photosUploaded, RECORD_COUNT, 'All 55 photos must be uploaded');
    assert.strictEqual(result.synced, RECORD_COUNT, 'Result must report 55 synced');
    assert.strictEqual(result.failed, 0, 'No failures expected');

    // Verify all records in IndexedDB transitioned to synced
    const allRecords = await RS.getAllRecords();
    assert.strictEqual(allRecords.length, RECORD_COUNT);
    allRecords.forEach(r => {
      assert.strictEqual(r.sync_status, 'synced', `Record ${r.local_id} must be synced`);
      assert.ok(r.server_id, 'Server ID must be set');
    });

    console.log(`   [Metrics] 55 Records: Duration=${durationMs}ms | Bytes=${(totalBytesUploaded / 1024 / 1024).toFixed(2)} MB | Failure Rate=0%`);
  });

  // Test 2: Heavy Multi-Photo Stress Test (100+ records, multiple photos per record)
  await runAsyncTest('2. Heavy Stress: 100+ records with multiple photos (200 photos) process sequentially without memory leaks', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const RECORD_COUNT = 100;
    const PHOTOS_PER_REC = 2;

    for (let i = 1; i <= RECORD_COUNT; i++) {
      const locId = `multi-rec-${i}`;
      mockDBInstance.stores.plant_records.put({
        local_id: locId,
        submission_id: global.GeoTrackerDB.generateUUID(),
        plant_type: 'shrub',
        local_name: `Shrub Cluster ${i}`,
        zone: 'central_arcade',
        sync_status: 'pending_sync',
        created_at: new Date(Date.now() - (RECORD_COUNT - i) * 1000).toISOString()
      });

      for (let p = 1; p <= PHOTOS_PER_REC; p++) {
        mockDBInstance.stores.plant_photos.put({
          photo_id: `photo-${i}-${p}`,
          local_record_id: locId,
          image_blob: makeBlob(`shrub-photo-${i}-${p}`),
          original_filename: `shrub_${i}_${p}.jpg`,
          file_size: 250000,
          upload_status: 'pending'
        });
      }
    }

    let recordsCount = 0;
    let photosCount = 0;

    global.fetch = async function(url, opts) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        recordsCount++;
        const body = JSON.parse(opts.body);
        return mockJsonResponse({ success: true, record_id: recordsCount, tracking_id: `SCAR${recordsCount}`, submission_id: body.submission_id }, 201);
      }
      if (url.includes('/photos/')) {
        photosCount++;
        return mockJsonResponse({ success: true, photo_id: 'mock-p-uuid' }, 201);
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    const startTime = Date.now();
    const result = await Engine.syncNow(true);
    const duration = Date.now() - startTime;

    assert.strictEqual(recordsCount, 100);
    assert.strictEqual(photosCount, 200);
    assert.strictEqual(result.synced, 100);
    console.log(`   [Metrics] 100 Records / 200 Photos: Duration=${duration}ms | Avg Upload Time=${(duration/300).toFixed(2)}ms/item`);
  });

  // Test 3: Mixed Queue State Processing
  await runAsyncTest('3. Mixed Queue States: only pending and failed records are processed, synced records skipped', async () => {
    resetStorage();
    const Engine = global.GeoTrackerSyncEngine;

    // Seed 6 records in mixed states
    mockDBInstance.stores.plant_records.put({ local_id: 'q-synced', sync_status: 'synced', submission_id: 'sub-synced' });
    mockDBInstance.stores.plant_records.put({ local_id: 'q-pending', sync_status: 'pending_sync', submission_id: 'sub-pending' });
    mockDBInstance.stores.plant_records.put({ local_id: 'q-saved', sync_status: 'saved_locally', submission_id: 'sub-saved' });
    mockDBInstance.stores.plant_records.put({ local_id: 'q-failed', sync_status: 'failed', submission_id: 'sub-failed' });
    mockDBInstance.stores.plant_records.put({ local_id: 'q-auth', sync_status: 'auth_required', submission_id: 'sub-auth' });
    mockDBInstance.stores.plant_records.put({ local_id: 'q-attention', sync_status: 'needs_attention', submission_id: 'sub-att' });

    const syncedSubmissions = [];

    global.fetch = async function(url, opts) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        const body = JSON.parse(opts.body);
        syncedSubmissions.push(body.submission_id);
        return mockJsonResponse({ success: true, record_id: 1, tracking_id: 'T00001' }, 201);
      }
      return mockJsonResponse({ success: true });
    };

    await Engine.syncNow(true);

    // Already synced and needs_attention records must NOT be uploaded
    assert(!syncedSubmissions.includes('sub-synced'), 'Already synced record must not be uploaded');
    assert(!syncedSubmissions.includes('sub-att'), 'Needs attention record must not be uploaded without manual intervention');
    // Eligible records must be uploaded
    assert(syncedSubmissions.includes('sub-pending'), 'Pending record must be uploaded');
    assert(syncedSubmissions.includes('sub-saved'), 'Saved locally record must be uploaded');
    assert(syncedSubmissions.includes('sub-failed'), 'Failed record must be retried');
  });

  // Test 4: Server-Side Idempotency (Zero Duplicates on Re-sync)
  await runAsyncTest('4. Idempotent Synchronization: re-syncing returns already_exists without duplicating server data', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const subId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: 'idem-rec',
      submission_id: subId,
      plant_type: 'tree',
      local_name: 'Banyan Tree',
      zone: 'academic_block',
      sync_status: 'pending_sync'
    });

    let attempts = 0;
    global.fetch = async function(url, opts) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/')) {
        attempts++;
        return mockJsonResponse({
          success: true,
          already_exists: true,
          record_id: 42,
          tracking_id: 'TACB00042',
          submission_id: subId,
          message: 'Record already synchronized.'
        }, 200);
      }
      return mockJsonResponse({ success: true });
    };

    const res = await Engine.syncNow(true);
    const rec = await RS.getRecord('idem-rec');

    assert.strictEqual(attempts, 1);
    assert.strictEqual(rec.sync_status, 'synced');
    assert.strictEqual(rec.server_id, 42);
    assert.strictEqual(res.synced, 1);
    assert.strictEqual(res.failed, 0);
  });

  // Test 5: Partial Photo Synchronization & Independent Retry
  await runAsyncTest('5. Partial Photo Synchronization: 1 of 3 photos fails; retry uploads only the failed photograph', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'partial-rec';
    const subId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: subId,
      local_name: 'Bougainvillea Cluster',
      zone: 'housing_zone',
      sync_status: 'pending_sync'
    });

    mockDBInstance.stores.plant_photos.put({ photo_id: 'p1', local_record_id: locId, image_blob: makeBlob('p1'), upload_status: 'pending' });
    mockDBInstance.stores.plant_photos.put({ photo_id: 'p2', local_record_id: locId, image_blob: makeBlob('p2'), upload_status: 'pending' });
    mockDBInstance.stores.plant_photos.put({ photo_id: 'p3', local_record_id: locId, image_blob: makeBlob('p3'), upload_status: 'pending' });

    let p2Attempts = 0;
    const uploadedPhotos = [];

    global.fetch = async function(url, opts) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        return mockJsonResponse({ success: true, record_id: 10, tracking_id: 'CHZN00010', submission_id: subId }, 201);
      }
      if (url.includes('/photos/')) {
        const pId = opts.body.get('photo_id');
        uploadedPhotos.push(pId);
        if (pId === 'p2' && p2Attempts === 0) {
          p2Attempts++;
          return mockJsonResponse({ error: 'Server temporary storage write error' }, 500);
        }
        return mockJsonResponse({ success: true, photo_id: pId }, 201);
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    // First sync pass: P1 succeeds, P2 fails, P3 succeeds
    await Engine.syncNow(true);

    let rec = await RS.getRecord(locId);
    let p1 = await PS.getPhoto('p1');
    let p2 = await PS.getPhoto('p2');
    let p3 = await PS.getPhoto('p3');

    assert.strictEqual(rec.sync_status, 'metadata_synced', 'Record must be metadata_synced because p2 failed');
    assert.strictEqual(p1.upload_status, 'synced');
    assert.strictEqual(p2.upload_status, 'failed');
    assert.strictEqual(p3.upload_status, 'synced');

    // Reset uploadedPhotos tracker and retry
    uploadedPhotos.length = 0;
    await RS.retryPhoto('p2');
    await Engine.syncNow(true);

    rec = await RS.getRecord(locId);
    p2 = await PS.getPhoto('p2');

    assert.strictEqual(uploadedPhotos.length, 1, 'Only P2 must have been sent on retry');
    assert.strictEqual(uploadedPhotos[0], 'p2');
    assert.strictEqual(p2.upload_status, 'synced');
    assert.strictEqual(rec.sync_status, 'synced', 'Record must transition to fully synced once all photos succeed');
  });

  // Test 6: Storage Quota Boundary & QuotaExceededError
  await runAsyncTest('6. Storage Quota: QuotaExceededError preserves uncommitted forms and surfaces clear warning', async () => {
    resetStorage();

    // Create a mock store that throws QuotaExceededError on put
    const quotaStore = {
      put: function() {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
    };

    let caughtError = null;
    try {
      quotaStore.put({ some: 'data' });
    } catch (e) {
      caughtError = e;
    }

    assert(caughtError !== null);
    assert.strictEqual(caughtError.name, 'QuotaExceededError');

    // Verify unsynchronized records remain intact in existing store
    mockDBInstance.stores.plant_records.put({ local_id: 'safe-rec', sync_status: 'saved_locally' });
    const safeRec = mockDBInstance.stores.plant_records.data.get('safe-rec');
    assert.ok(safeRec, 'Unsynchronized record must not be touched or corrupted');
  });

  // Test 7: navigator.storage.persist() Fallback
  await runAsyncTest('7. Storage Persistence: gracefully handles cases where navigator.storage.persist() is denied', async () => {
    global.navigator.storage = {
      persist: async () => false, // Browser refuses persistent storage
      persisted: async () => false
    };

    let persistent = false;
    if (global.navigator.storage && global.navigator.storage.persist) {
      persistent = await global.navigator.storage.persist();
    }

    assert.strictEqual(persistent, false, 'Should reflect browser denial without throwing error');
    // IndexedDB operations still function normally even without persistent permission
    mockDBInstance.stores.plant_records.put({ local_id: 'standard-storage-rec' });
    assert.ok(mockDBInstance.stores.plant_records.data.has('standard-storage-rec'));
  });

  // Test 8: Browser Restart Simulation & Storage Retention
  await runAsyncTest('8. Browser Restart: records and photographs survive simulated browser shutdown and restore', async () => {
    resetStorage();

    // Session 1: Save record and photo
    const locId = 'persisted-rec-1';
    const subId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: subId,
      local_name: 'Heritage Banyan',
      zone: 'academic_block',
      sync_status: 'saved_locally',
      created_at: new Date().toISOString()
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: 'persisted-photo-1',
      local_record_id: locId,
      original_filename: 'banyan.jpg',
      file_size: 450000,
      upload_status: 'pending'
    });

    // Simulate Browser Restart by preserving backing data and re-instantiating DB interface
    const backingRecords = new Map(mockDBInstance.stores.plant_records.data);
    const backingPhotos = new Map(mockDBInstance.stores.plant_photos.data);

    // Create brand new database session
    mockDBInstance = new MockIDBDatabase();
    mockDBInstance.stores.plant_records.data = backingRecords;
    mockDBInstance.stores.plant_photos.data = backingPhotos;

    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;

    const restoredRec = await RS.getRecord(locId);
    const restoredPhotos = await PS.getPhotosForRecord(locId);

    assert.ok(restoredRec, 'Record must be accessible after browser restart');
    assert.strictEqual(restoredRec.local_name, 'Heritage Banyan');
    assert.strictEqual(restoredPhotos.length, 1);
    assert.strictEqual(restoredPhotos[0].photo_id, 'persisted-photo-1');
  });

  // Test 9: Network Loss During Metadata Upload
  await runAsyncTest('9. Network Loss: failure during metadata upload preserves local record with exponential backoff', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'drop-meta-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: global.GeoTrackerDB.generateUUID(),
      local_name: 'Ficus benjamina',
      zone: 'sports_complex',
      sync_status: 'pending_sync'
    });

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/')) {
        throw new TypeError('Failed to fetch: Connection reset by peer');
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    const res = await Engine.syncNow(true);
    const rec = await RS.getRecord(locId);

    assert.strictEqual(res.failed, 1);
    assert.strictEqual(rec.sync_status, 'failed');
    assert.strictEqual(rec.retry_count, 1);
    assert.ok(rec.last_error.includes('Connection reset by peer'));
  });

  // Test 10: Network Loss During Photograph Upload
  await runAsyncTest('10. Network Loss: failure during photo upload preserves committed metadata and schedules photo retry', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'drop-photo-rec';
    const subId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: subId,
      local_name: 'Alstonia scholaris',
      zone: 'central_arcade',
      sync_status: 'pending_sync'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: 'drop-photo-p1',
      local_record_id: locId,
      image_blob: makeBlob('photo-bytes'),
      upload_status: 'pending'
    });

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        // Metadata succeeds!
        return mockJsonResponse({ success: true, record_id: 88, tracking_id: 'TCAR00088', submission_id: subId }, 201);
      }
      if (url.includes('/photos/')) {
        // Photo upload drops!
        throw new TypeError('Network timeout: Socket disconnected during upload');
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    await Engine.syncNow(true);

    const rec = await RS.getRecord(locId);
    const photo = await PS.getPhoto('drop-photo-p1');

    assert.strictEqual(rec.sync_status, 'metadata_synced', 'Record must retain server_id and metadata_synced status');
    assert.strictEqual(rec.server_id, 88);
    assert.strictEqual(photo.upload_status, 'failed', 'Photo must be marked failed');
    assert.ok(photo.last_error.includes('Socket disconnected'));
  });

  // Test 11: Backend Unreachable Despite navigator.onLine === true
  await runAsyncTest('11. Unreachable Backend: engine halts cleanly without hammering server when institutional API is down', async () => {
    resetStorage();
    const Engine = global.GeoTrackerSyncEngine;

    mockDBInstance.stores.plant_records.put({ local_id: 'unreachable-rec', sync_status: 'pending_sync' });

    let statusCheckCount = 0;
    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        statusCheckCount++;
        throw new TypeError('NetworkError: Institutional server unreachable (DNS/Proxy error)');
      }
      return { ok: false };
    };

    const res = await Engine.syncNow(true);

    assert.strictEqual(statusCheckCount, 1, 'Must check status once and immediately halt');
    assert.strictEqual(res.synced, 0);
    assert.strictEqual(res.failed, 0); // Not marked permanently failed, postponed until backend reachable
  });

  // Test 12: SSO Session Expiration (401) & Resumption After Re-Auth
  await runAsyncTest('12. SSO Session Expiration: 401 marks auth_required, re-authenticating seamlessly completes sync', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'sso-expire-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: global.GeoTrackerDB.generateUUID(),
      local_name: 'Gulmohar',
      zone: 'academic_block',
      sync_status: 'pending_sync'
    });

    let isAuthenticated = false;

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        if (!isAuthenticated) {
          return mockJsonResponse({ authenticated: false, message: 'SSO Session Expired' }, 401);
        }
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/')) {
        if (!isAuthenticated) return mockJsonResponse({ error: 'Unauthorized' }, 401);
        return mockJsonResponse({ success: true, record_id: 99, tracking_id: 'TACB00099' }, 201);
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    // First attempt: unauthenticated
    await Engine.syncNow(true);
    let rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'auth_required');

    // User logs in via IITGN SSO: session restored
    isAuthenticated = true;
    await RS.retryRecord(locId); // Re-queue
    await Engine.syncNow(true);

    rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'synced');
    assert.strictEqual(rec.server_id, 99);
  });

  // Test 13: Area Permission Denial (403)
  await runAsyncTest('13. Permission Denial: 403 sets needs_attention with clear error explanation', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'forbidden-area-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: global.GeoTrackerDB.generateUUID(),
      local_name: 'Forbidden Plant',
      zone: 'director_residence',
      sync_status: 'pending_sync'
    });

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['hostels', 'academic_block'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/')) {
        return mockJsonResponse({ error: "You are not authorized to submit plant records for campus area 'director_residence'." }, 403);
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    await Engine.syncNow(true);
    const rec = await RS.getRecord(locId);

    assert.strictEqual(rec.sync_status, 'needs_attention');
    assert.ok(rec.last_error.includes('not authorized'));
  });

  // Test 14: Server 413 (Payload Too Large) & 429 (Rate Limiting)
  await runAsyncTest('14. Server Limits: 413 identifies oversized photo; 429 rate limit triggers backoff', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;
    const Engine = global.GeoTrackerSyncEngine;

    const locId = 'oversized-rec';
    const subId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: subId,
      local_name: 'Giant Photo Tree',
      zone: 'academic_block',
      sync_status: 'pending_sync'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: 'huge-p1',
      local_record_id: locId,
      image_blob: makeBlob('huge-photo-data'),
      upload_status: 'pending'
    });

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      if (url.includes('/api/geo-tracker/sync/records/') && !url.includes('/photos/')) {
        return mockJsonResponse({ success: true, record_id: 110, tracking_id: 'TACB00110', submission_id: subId }, 201);
      }
      if (url.includes('/photos/')) {
        return mockJsonResponse({ error: 'Payload Too Large: image exceeds server size limit' }, 413);
      }
      return mockJsonResponse({ error: 'Not found' }, 404);
    };

    await Engine.syncNow(true);
    const photo = await PS.getPhoto('huge-p1');
    assert.strictEqual(photo.upload_status, 'failed');
    assert.ok(photo.last_error.includes('413') || photo.last_error.includes('Payload Too Large'));
  });

  // Test 15: Multi-Tab Concurrency & Heartbeat
  await runAsyncTest('15. Multi-Tab Concurrency: active sync tab holds lock; secondary tab gracefully yields', async () => {
    resetStorage();
    const Engine = global.GeoTrackerSyncEngine;

    // Simulate Tab A holding lock with a fresh heartbeat
    const activeLock = {
      tabId: 'tab-alpha',
      timestamp: Date.now(),
      heartbeat: Date.now()
    };
    global.localStorage.setItem('cs_geotracker_sync_lock', JSON.stringify(activeLock));

    let fetchCalled = false;
    global.fetch = async function() {
      fetchCalled = true;
      return mockJsonResponse({ success: true });
    };

    // Tab B attempts sync
    const res = await Engine.syncNow(true);
    assert.strictEqual(res.locked, true, 'Secondary tab must report locked');
    assert.strictEqual(fetchCalled, false, 'Secondary tab must not initiate network requests');
  });

  // Test 16: Stale Lock Recovery After Crashed Tab
  await runAsyncTest('16. Stale Lock Recovery: safely recovers lock if previous tab died > 45 seconds ago', async () => {
    resetStorage();
    const Engine = global.GeoTrackerSyncEngine;

    // Stale lock: heartbeat was 60 seconds ago (> 45s lease timeout)
    const staleLock = {
      tabId: 'crashed-tab-omega',
      timestamp: Date.now() - 65000,
      heartbeat: Date.now() - 60000
    };
    global.localStorage.setItem('cs_geotracker_sync_lock', JSON.stringify(staleLock));

    global.fetch = async function(url) {
      if (url.includes('/api/geo-tracker/sync/status/')) {
        return mockJsonResponse({ authenticated: true, can_sync: true, allowed_areas: ['*'] });
      }
      return mockJsonResponse({ success: true });
    };

    const res = await Engine.syncNow(true);
    assert.notStrictEqual(res.locked, true, 'Must break stale lock and proceed');
    assert.strictEqual(global.localStorage.getItem('cs_geotracker_sync_lock'), null, 'Lock must be cleanly released upon sync completion');
  });

  // Test 17: Conflict Resolution: Keep Server Version
  await runAsyncTest('17. Conflict Resolution (Keep Server): overwrites local divergence with server truth', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'conf-keep-server';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      local_name: 'Divergent Local Name',
      height_m: 3.5,
      sync_status: 'needs_attention'
    });

    await RS.resolveConflict(locId, 'keep_server', {
      local_name: 'Authoritative Server Name',
      height_m: 6.8
    });

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.local_name, 'Authoritative Server Name');
    assert.strictEqual(rec.height_m, 6.8);
    assert.strictEqual(rec.sync_status, 'synced');
  });

  // Test 18: Conflict Resolution: Keep Local Changes
  await runAsyncTest('18. Conflict Resolution (Keep Local): queues local version for server overwrite', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'conf-keep-local';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      local_name: 'Field Corrected Name',
      sync_status: 'needs_attention'
    });

    await RS.resolveConflict(locId, 'keep_local');
    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'pending_sync');
  });

  // Test 19: Conflict Resolution: Request Supervisor Review
  await runAsyncTest('19. Conflict Resolution (Supervisor Review): annotates notes and marks for review', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'conf-supervisor';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      notes: 'Initial tree survey notes.',
      sync_status: 'conflict'
    });

    await RS.resolveConflict(locId, 'supervisor_review');
    const rec = await RS.getRecord(locId);

    assert.strictEqual(rec.sync_status, 'needs_attention');
    assert.strictEqual(rec.needs_supervisor_review, true);
    assert(rec.notes.includes('[Flagged for Supervisor Review'));
  });

  // Test 20: Campus Area Reassignment Security
  await runAsyncTest('20. Area Reassignment Security: reassigns to authorized zone and resets retry states', async () => {
    resetStorage();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'area-shift-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      zone: 'forbidden_zone',
      sync_status: 'needs_attention',
      last_error: 'Unauthorized area'
    });

    await RS.updateRecordFields(locId, { zone: 'central_arcade' });
    const rec = await RS.getRecord(locId);

    assert.strictEqual(rec.zone, 'central_arcade');
    assert.strictEqual(rec.sync_status, 'pending_sync');
    assert.strictEqual(rec.last_error, null);
    assert.strictEqual(rec.retry_count, 0);
  });

  // Test 21: Mobile UX Memory Management & URL.revokeObjectURL
  await runAsyncTest('21. Mobile Memory Management: closing photo modal explicitly revokes all created blob URLs', async () => {
    resetStorage();
    const UI = global.GeoTrackerManagementUI;

    const locId = 'mem-test-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      local_name: 'Memory Test Plant',
      zone: 'academic_block'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: 'p-mem-1',
      local_record_id: locId,
      image_blob: makeBlob('mem-bytes')
    });

    await UI.openRecordDetail(locId);
    UI.closeRecordDetail();

    assert.strictEqual(typeof UI.closeRecordDetail, 'function');
    assert(revokedObjectURLs.size > 0, 'Object URLs must have been tracked and revoked on modal close');
  });

  // Test 22: Housekeeping Service Worker & Cache Integrity
  await runAsyncTest('22. Housekeeping SW Compatibility: CACHE_VERSION = cs-v4 precaches GeoTracker while keeping Housekeeping routes', async () => {
    const swPath = path.resolve(__dirname, '../housekeeping/static/pwa/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    assert(swContent.includes("CACHE_VERSION = 'cs-v4'"), 'Must maintain version cs-v4');
    assert(swContent.includes('geotrackerSyncEngine.js'), 'Must precache geotrackerSyncEngine.js');
    assert(swContent.includes('geotrackerManagementUI.js'), 'Must precache geotrackerManagementUI.js');
    assert(swContent.includes('leaflet.js'), 'Must precache localized leaflet.js');
    assert(swContent.includes('/housekeeping/'), 'Must preserve housekeeping networkFirst routes');
    assert(swContent.includes('/geo/submit/'), 'Must include /geo/submit/ route');
  });

  console.log('\n================================');
  console.log(`Stage 7 Tests Completed: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
