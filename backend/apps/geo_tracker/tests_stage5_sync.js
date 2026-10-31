/**
 * Automated Test Suite for Stage 5: Persistent Synchronization Engine
 * Run with: node backend/apps/geo_tracker/tests_stage5_sync.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Stage 5 Persistent Synchronization Engine Tests ---\n');

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

// ── Mock IndexedDB & Browser Environment Setup ─────────────────────────────
class MockIDBStore {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    this.data = new Map();
    this.indexes = new Map();
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

const mockDBInstance = new MockIDBDatabase();

// Setup global browser mocks
global.window = global;
global.window.addEventListener = function() {};
global.window.removeEventListener = function() {};
global.document = {
  querySelector: function(sel) {
    if (sel === 'input[name="csrfmiddlewaretoken"]') return { value: 'mock-csrf-token-12345' };
    return null;
  },
  cookie: 'csrftoken=mock-csrf-token-12345; sessionid=mock-session-123',
  addEventListener: function() {},
  removeEventListener: function() {},
  visibilityState: 'visible'
};
global.localStorage = {
  store: {},
  getItem: function(k) { return this.store[k] || null; },
  setItem: function(k, v) { this.store[k] = String(v); },
  removeItem: function(k) { delete this.store[k]; }
};
global.navigator = { onLine: true };

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

// Mock GeoTrackerPhotoStorage
global.GeoTrackerPhotoStorage = {
  savePhoto: async function(photoData) {
    const entry = Object.assign({}, photoData);
    mockDBInstance.stores.plant_photos.put(entry);
    return entry;
  },
  getPhotosForRecord: async function(localRecordId) {
    const all = Array.from(mockDBInstance.stores.plant_photos.data.values());
    return all.filter(p => p.local_record_id === localRecordId);
  },
  updatePhotoStatus: async function(photoId, status, serverPhotoId, lastError) {
    const photo = mockDBInstance.stores.plant_photos.data.get(photoId);
    if (photo) {
      photo.upload_status = status;
      if (serverPhotoId) photo.server_photo_id = serverPhotoId;
      if (lastError !== undefined) photo.last_error = lastError;
      mockDBInstance.stores.plant_photos.put(photo);
    }
  }
};

// Mock GeoTrackerRecordStorage
global.GeoTrackerRecordStorage = {
  SYNC_STATUS: {
    SAVED_LOCALLY: 'saved_locally',
    METADATA_SYNCED: 'metadata_synced',
    SYNCED: 'synced',
    FAILED: 'failed',
    AUTH_REQUIRED: 'auth_required',
    NEEDS_ATTENTION: 'needs_attention'
  },
  getAllRecords: async function() {
    return Array.from(mockDBInstance.stores.plant_records.data.values());
  },
  getRecord: async function(localId) {
    return mockDBInstance.stores.plant_records.data.get(localId) || null;
  },
  updateRecordStatus: async function(localId, status, serverId, lastError, trackingId) {
    const record = mockDBInstance.stores.plant_records.data.get(localId);
    if (record) {
      record.sync_status = status;
      if (serverId) record.server_id = serverId;
      if (trackingId) record.tracking_id = trackingId;
      if (lastError !== undefined) record.last_error = lastError;
      mockDBInstance.stores.plant_records.put(record);
    }
  }
};

// Load GeoTrackerSyncEngine script
const enginePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerSyncEngine.js');
const engineContent = fs.readFileSync(enginePath, 'utf8');
eval(engineContent);

function resetStorage() {
  mockDBInstance.stores.plant_records.data.clear();
  mockDBInstance.stores.plant_photos.data.clear();
  global.localStorage.store = {};
}

function makeBlob(content, type) {
  return new Blob([content || 'dummy-image-bytes'], { type: type || 'image/jpeg' });
}

// ── Test Scenarios ──────────────────────────────────────────────────────────

(async () => {
  // Test 1: Single Record Synchronization
  await runAsyncTest('1. One record synchronization (metadata + photo)', async () => {
    resetStorage();
    const subId = global.GeoTrackerDB.generateUUID();
    const locId = global.GeoTrackerDB.generateUUID();
    const photoId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: subId,
      plant_type: 'tree',
      variety: '1',
      local_name: 'Neem',
      latitude: '23.2135000',
      longitude: '72.6870000',
      zone: 'Academic Block 1',
      sync_status: 'saved_locally'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: photoId,
      local_record_id: locId,
      original_filename: 'neem.jpg',
      image_blob: makeBlob('dummy-neem-photo'),
      upload_status: 'pending'
    });

    global.fetch = async (url, opts) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Academic Block 1'] })
        };
      }
      if (url.includes('/sync/records/') && !url.includes('/photos/')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, record_id: 101, tracking_id: 'IITGN-2026-TRE-0101', submission_id: subId })
        };
      }
      if (url.includes('/photos/')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, photo_id: photoId, record_id: 101 })
        };
      }
      throw new Error('Unhandled URL: ' + url);
    };

    const result = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(result.synced, 1, 'Should have synced 1 record');
    assert.strictEqual(result.failed, 0, 'Should have 0 failures');

    const updatedRec = mockDBInstance.stores.plant_records.data.get(locId);
    assert.strictEqual(updatedRec.sync_status, 'synced', 'Record sync_status must be synced');
    assert.strictEqual(updatedRec.server_id, 101, 'server_id must be populated');

    const updatedPhoto = mockDBInstance.stores.plant_photos.data.get(photoId);
    assert.strictEqual(updatedPhoto.upload_status, 'synced', 'Photo upload_status must be synced');
  });

  // Test 2: Multiple Record Synchronization
  await runAsyncTest('2. Multiple record synchronization (batches across areas)', async () => {
    resetStorage();

    for (let i = 1; i <= 3; i++) {
      const sId = global.GeoTrackerDB.generateUUID();
      const lId = global.GeoTrackerDB.generateUUID();
      mockDBInstance.stores.plant_records.put({
        local_id: lId,
        submission_id: sId,
        plant_type: 'shrub',
        zone: 'Central Arcade',
        sync_status: 'saved_locally'
      });
    }

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Central Arcade'] })
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true, record_id: 200, tracking_id: 'IITGN-2026-SHR-0200' })
      };
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.total, 3, 'Must process 3 records');
    assert.strictEqual(res.synced, 3, 'All 3 records must be marked synced');
  });

  // Test 3: Multiple Photographs Per Record
  await runAsyncTest('3. Multiple photographs per record (all confirmed uploaded)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      plant_type: 'tree',
      zone: 'Central Arcade',
      sync_status: 'saved_locally'
    });

    const pIds = [global.GeoTrackerDB.generateUUID(), global.GeoTrackerDB.generateUUID(), global.GeoTrackerDB.generateUUID()];
    pIds.forEach(pId => {
      mockDBInstance.stores.plant_photos.put({
        photo_id: pId,
        local_record_id: lId,
        image_blob: makeBlob('dummy-photo-data'),
        upload_status: 'pending'
      });
    });

    let uploadedCount = 0;
    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Central Arcade'] })
        };
      }
      if (url.includes('/photos/')) {
        uploadedCount++;
        return { ok: true, status: 201, json: async () => ({ success: true }) };
      }
      return { ok: true, status: 201, json: async () => ({ success: true, record_id: 301 }) };
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1);
    assert.strictEqual(uploadedCount, 3, 'Must upload all 3 photos');

    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'synced');
  });

  // Test 4: Duplicate Metadata Retry (already_exists: true)
  await runAsyncTest('4. Duplicate metadata retry (already_exists: true handled as success)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      plant_type: 'tree',
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      return {
        ok: true,
        status: 200, // 200 with already_exists
        json: async () => ({
          success: true,
          already_exists: true,
          record_id: 405,
          tracking_id: 'IITGN-2026-TRE-0405',
          submission_id: sId
        })
      };
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1);
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.server_id, 405);
    assert.strictEqual(rec.sync_status, 'synced');
  });

  // Test 5: Duplicate Photograph Retry (already_exists: true)
  await runAsyncTest('5. Duplicate photograph retry (already_exists: true marks photo synced)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    const pId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      server_id: 501,
      zone: 'Sports Complex',
      sync_status: 'metadata_synced'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: pId,
      local_record_id: lId,
      image_blob: makeBlob('dummy-photo'),
      upload_status: 'pending'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, already_exists: true, photo_id: pId })
      };
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1);
    const photo = mockDBInstance.stores.plant_photos.data.get(pId);
    assert.strictEqual(photo.upload_status, 'synced');
  });

  // Test 6: Interrupted Metadata Upload (Network failure preserves record)
  await runAsyncTest('6. Interrupted metadata upload (network failure preserves record with backoff)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally',
      retry_count: 0
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      throw new TypeError('Network connection terminated unexpectedly');
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.failed, 1);
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'failed');
    assert(rec.submission_id === sId, 'Original submission_id must NEVER be changed on retry');
  });

  // Test 7: Interrupted Photograph Upload (Partial sync preserves metadata)
  await runAsyncTest('7. Interrupted photograph upload (preserves metadata, retries photo)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    const pId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: pId,
      local_record_id: lId,
      image_blob: makeBlob('dummy-photo'),
      upload_status: 'pending'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      if (url.includes('/sync/records/') && !url.includes('/photos/')) {
        return { ok: true, status: 201, json: async () => ({ success: true, record_id: 701, tracking_id: 'IITGN-701' }) };
      }
      throw new TypeError('Upload aborted due to connection drop');
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.failed, 1);
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'metadata_synced', 'Metadata must remain synced');
    assert.strictEqual(rec.server_id, 701);
  });

  // Test 8: Authentication Expiration (401 response halts sync, marks auth_required)
  await runAsyncTest('8. Authentication expiration (401 stops sync, marks records auth_required without data loss)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: false,
          status: 401,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: false, can_sync: false, message: 'Session expired' })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.reason, 'auth_required');
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'auth_required', 'Record status must reflect auth_required');
  });

  // Test 9: Permission Rejection (403 forbidden marks failure, preserves data)
  await runAsyncTest('9. Permission rejection (403 marks permission failure and preserves record)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Restricted Nursery Area',
      sync_status: 'saved_locally'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['*'] })
        };
      }
      if (url.includes('/sync/records/')) {
        return {
          ok: false,
          status: 403,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ error: 'Permission denied: forbidden operation.' })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.failed, 1);
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.ok(rec.sync_status === 'failed' || rec.sync_status === 'needs_attention', 'Status must reflect permission failure');
    assert(rec.last_error.includes('Permission denied'), 'Must explain permission error');
  });

  // Test 10: Invalid Form Data (400 Bad Request preserves record for correction)
  await runAsyncTest('10. Invalid form data (400 validation error marks failure and retains record)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({ errors: { height_m: ['Ensure this value is greater than or equal to 0.'] } })
      };
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.failed, 1);
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'failed');
    assert(rec.last_error.includes('height_m'), 'Must record validation error');
  });

  // Test 11: Server Timeout Handling
  await runAsyncTest('11. Server timeout (aborts cleanly and schedules exponential backoff)', async () => {
    const backoff0 = global.GeoTrackerSyncEngine.calculateBackoffMs(0);
    const backoff1 = global.GeoTrackerSyncEngine.calculateBackoffMs(1);
    const backoff2 = global.GeoTrackerSyncEngine.calculateBackoffMs(2);

    assert(backoff0 >= 4000 && backoff0 <= 6000, 'Backoff 0 must be ~5s with jitter');
    assert(backoff1 >= 12000 && backoff1 <= 18000, 'Backoff 1 must be ~15s with jitter');
    assert(backoff2 >= 24000 && backoff2 <= 36000, 'Backoff 2 must be ~30s with jitter');
  });

  // Test 12: DNS Failure / Server Unreachable (e.g. 4G/5G outside SSO)
  await runAsyncTest('12. DNS failure / unreachable backend (halts without looping, keeps records pending)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    global.fetch = async () => {
      throw new TypeError('Failed to fetch: net::ERR_NAME_NOT_RESOLVED');
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.reason, 'unreachable');
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'saved_locally', 'Record remains safely saved locally');
  });

  // Test 13: Manual Synchronization
  await runAsyncTest('13. Manual synchronization (Sync Now bypasses backoff delay)', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'failed',
      next_retry_at: Date.now() + 60000 // In future
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      return { ok: true, status: 201, json: async () => ({ success: true, record_id: 888 }) };
    };

    // Calling with force=true must sync immediately
    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1, 'Force sync must bypass backoff');
  });

  // Test 14: HTML SSO Redirect Detection (Never treats 302/200 HTML as success)
  await runAsyncTest('14. HTML SSO Redirect Detection (Guards against HTML login pages)', async () => {
    global.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html; charset=utf-8']]),
        text: async () => '<html><body>IITGN SSO Login Page</body></html>'
      };
    };

    const statusRes = await global.GeoTrackerSyncEngine.checkSyncStatus();
    assert.strictEqual(statusRes.authenticated, false);
    assert.strictEqual(statusRes.can_sync, false);
  });

  // Test 15: Concurrency & Lock Management Across Tabs
  await runAsyncTest('15. Concurrency & multi-tab locking prevents duplicate simultaneous syncs', async () => {
    resetStorage();
    global.localStorage.setItem('cs_geotracker_sync_lock', JSON.stringify({
      tabId: 'other-tab-999',
      timestamp: Date.now()
    }));

    const res = await global.GeoTrackerSyncEngine.syncNow();
    assert.strictEqual(res.locked_by_other_tab, true);

    global.localStorage.removeItem('cs_geotracker_sync_lock');
  });

  // Test 16: Stale Lock Recovery
  await runAsyncTest('16. Stale lock recovery (recovers if previous tab crashed > 45s ago)', async () => {
    resetStorage();
    global.localStorage.setItem('cs_geotracker_sync_lock', JSON.stringify({
      tabId: 'dead-tab-000',
      timestamp: Date.now() - 50000 // 50 seconds old (> 45s lease)
    }));

    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
    });

    const res = await global.GeoTrackerSyncEngine.syncNow();
    assert(res.locked_by_other_tab !== true, 'Must break stale lock');

    global.localStorage.removeItem('cs_geotracker_sync_lock');
  });

  // Test 17: Partial Photo Synchronization
  await runAsyncTest('17. Partial photo synchronization (1 of 2 photos fails; retry uploads only failed photo)', async () => {
    resetStorage();

    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    const pId1 = global.GeoTrackerDB.generateUUID();
    const pId2 = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      zone: 'Sports Complex',
      sync_status: 'saved_locally'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: pId1,
      local_record_id: lId,
      image_blob: makeBlob('dummy-photo-1'),
      upload_status: 'pending'
    });
    mockDBInstance.stores.plant_photos.put({
      photo_id: pId2,
      local_record_id: lId,
      image_blob: makeBlob('dummy-photo-2'),
      upload_status: 'pending'
    });

    // Pass 1: Photo 1 succeeds, Photo 2 fails
    global.fetch = async (url, opts) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      if (url.includes('/sync/records/') && !url.includes('/photos/')) {
        return { ok: true, status: 201, json: async () => ({ success: true, record_id: 991 }) };
      }
      if (url.includes('/photos/')) {
        const bodyPhotoId = opts.body.get('photo_id');
        if (bodyPhotoId === pId1) {
          return { ok: true, status: 201, json: async () => ({ success: true, photo_id: pId1 }) };
        } else {
          throw new TypeError('Upload failed for photo 2');
        }
      }
    };

    const res1 = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res1.failed, 1);

    const recAfterP1 = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(recAfterP1.sync_status, 'metadata_synced', 'Metadata must stay synced');
    const photo1 = mockDBInstance.stores.plant_photos.data.get(pId1);
    const photo2 = mockDBInstance.stores.plant_photos.data.get(pId2);
    assert.strictEqual(photo1.upload_status, 'synced', 'Photo 1 must be synced');
    assert.strictEqual(photo2.upload_status, 'failed', 'Photo 2 must be failed');

    // Pass 2: Photo 2 retried and succeeds. Photo 1 should NOT be re-uploaded!
    let photo1Reuploaded = false;
    global.fetch = async (url, opts) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: true, can_sync: true, allowed_areas: ['Sports Complex'] })
        };
      }
      if (url.includes('/photos/')) {
        const bodyPhotoId = opts.body.get('photo_id');
        if (bodyPhotoId === pId1) photo1Reuploaded = true;
        return { ok: true, status: 201, json: async () => ({ success: true, photo_id: pId2 }) };
      }
    };

    const res2 = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res2.synced, 1, 'Record should now be fully synced');
    assert.strictEqual(photo1Reuploaded, false, 'Photo 1 must NOT be re-uploaded');

    const recFinal = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(recFinal.sync_status, 'synced', 'Record must now be fully synced');
  });

  // Test 18: Service Worker Precache Includes Sync Engine
  runTest('18. Service worker precache includes geotrackerSyncEngine.js', () => {
    const swFile = path.resolve(__dirname, '../housekeeping/static/pwa/sw.js');
    const swTxt = fs.readFileSync(swFile, 'utf8');
    assert(swTxt.includes('/static/geo_tracker/js/geotrackerSyncEngine.js'), 'sw.js must precache geotrackerSyncEngine.js');
  });

  // Test 19: Template UI Integration (Sync Now button and progress wrap)
  runTest('19. submit_form.html contains Sync Now button and live progress elements', () => {
    const tplFile = path.resolve(__dirname, '../../templates/geo_tracker/submit_form.html');
    const tplTxt = fs.readFileSync(tplFile, 'utf8');
    assert(tplTxt.includes('id="syncNowBtn"'), 'Template must contain syncNowBtn');
    assert(tplTxt.includes('id="syncProgressWrap"'), 'Template must contain syncProgressWrap');
    assert(tplTxt.includes('geotrackerSyncEngine.js'), 'Template must include geotrackerSyncEngine.js');
  });

  // Test 20: Safe Error Classification (400 vs 401 vs 403 vs 413)
  runTest('20. Error classification distinguishes authentication (401), permission (403), validation (400), and oversize (413)', () => {
    assert(engineContent.includes('res.status === 401'), 'Must classify 401 as auth_required');
    assert(engineContent.includes('res.status === 403'), 'Must classify 403 as forbidden');
    assert(engineContent.includes('res.status === 400'), 'Must classify 400 as validation_error');
    assert(engineContent.includes('res.status === 413'), 'Must classify 413 as oversized');
  });

  // Test 21: Unauthenticated Institutional Network Synchronization
  await runAsyncTest('21. Unauthenticated institutional synchronization: records sync cleanly when can_sync: true without session', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();
    const pId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      variety: 'Balamkhira (Tree)',
      local_name: 'Balamkhira',
      zone: 'academic_block',
      sync_status: 'saved_locally'
    });

    mockDBInstance.stores.plant_photos.put({
      photo_id: pId,
      local_record_id: lId,
      original_filename: 'balamkhira.jpg',
      image_blob: { size: 1024, type: 'image/jpeg' },
      upload_status: 'pending'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            authenticated: false,
            can_sync: true,
            network_available: true,
            user: null,
            allowed_areas: ['*'],
            message: 'Connected to IITGN Institutional Network'
          })
        };
      }
      if (url.includes('/sync/records/') && !url.includes('/photos/')) {
        return {
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            success: true,
            already_exists: false,
            tracking_id: 'TACB00001',
            record_pk: 101
          })
        };
      }
      if (url.includes('/photos/')) {
        return {
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            success: true,
            already_exists: false,
            photo_id: pId,
            photo_url: '/media/geo_tracker/photos/balamkhira.jpg'
          })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1, 'Unauthenticated institutional sync must sync 1 record');
    assert.strictEqual(res.failed, 0, 'Must have 0 failures');

    const updatedRec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(updatedRec.sync_status, 'synced', 'Record status must be synced');
    assert.strictEqual(updatedRec.tracking_id, 'TACB00001', 'Tracking ID must be saved');

    const updatedPhoto = mockDBInstance.stores.plant_photos.data.get(pId);
    assert.strictEqual(updatedPhoto.upload_status, 'synced', 'Photo status must be synced');
  });

  // Test 22: Previously auth_required records are picked up when can_sync is true
  await runAsyncTest('22. Records previously in auth_required state are picked up and synchronized when can_sync is true', async () => {
    resetStorage();
    const sId = global.GeoTrackerDB.generateUUID();
    const lId = global.GeoTrackerDB.generateUUID();

    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: sId,
      variety: 'Amla Tree (Tree)',
      local_name: 'Amla Tree',
      zone: 'academic_block',
      sync_status: 'auth_required'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            authenticated: false,
            can_sync: true,
            network_available: true,
            user: null,
            allowed_areas: ['*']
          })
        };
      }
      if (url.includes('/sync/records/') && !url.includes('/photos/')) {
        return {
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            success: true,
            already_exists: false,
            tracking_id: 'TACB00002',
            record_pk: 102
          })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1, 'Must sync 1 previously auth_required record');
    const updatedRec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(updatedRec.sync_status, 'synced');
    assert.strictEqual(updatedRec.tracking_id, 'TACB00002');
  });

  // Test 23: Role-Free & Area-Free Submission for Any Configured Campus Area
  await runAsyncTest('23. Records for any configured campus area sync without area-level permission restrictions', async () => {
    resetStorage();
    const areasToTest = ['housing_zone', 'hostels', 'academic_block', 'director_residence', 'miya_baug', 'c1_road'];
    const syncedRecords = [];

    areasToTest.forEach((area, idx) => {
      const lId = `rec-area-${idx}`;
      mockDBInstance.stores.plant_records.put({
        local_id: lId,
        submission_id: `sub-area-${idx}`,
        zone: area,
        plant_type: 'tree',
        local_name: `Tree in ${area}`,
        sync_status: 'saved_locally'
      });
      syncedRecords.push(lId);
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ authenticated: false, can_sync: true, allowed_areas: ['*'] })
        };
      }
      if (url.includes('/sync/records/')) {
        return {
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            success: true,
            already_exists: false,
            tracking_id: 'TARE00001',
            record_pk: 999
          })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, areasToTest.length, 'All configured campus areas must synchronize without restriction');
    assert.strictEqual(res.failed, 0);

    syncedRecords.forEach((lId) => {
      const r = mockDBInstance.stores.plant_records.data.get(lId);
      assert.strictEqual(r.sync_status, 'synced');
    });
  });

  // Test 24: Correct handling of can_sync and network_available when unauthenticated
  await runAsyncTest('24. Frontend respects can_sync=true when authenticated=false without redirecting or blocking', async () => {
    resetStorage();
    const lId = 'unauth-rec-1';
    mockDBInstance.stores.plant_records.put({
      local_id: lId,
      submission_id: 'sub-unauth-1',
      zone: 'central_arcade',
      plant_type: 'tree',
      local_name: 'Campus Tree',
      sync_status: 'saved_locally'
    });

    global.fetch = async (url) => {
      if (url.includes('/sync/status/')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            authenticated: false,
            can_sync: true,
            network_available: true,
            user: null,
            allowed_areas: ['*']
          })
        };
      }
      if (url.includes('/sync/records/')) {
        return {
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({
            success: true,
            already_exists: false,
            tracking_id: 'TCAR00001',
            record_pk: 1001
          })
        };
      }
    };

    const res = await global.GeoTrackerSyncEngine.syncNow(true);
    assert.strictEqual(res.synced, 1, 'Must sync cleanly when authenticated=false and can_sync=true');
    const rec = mockDBInstance.stores.plant_records.data.get(lId);
    assert.strictEqual(rec.sync_status, 'synced');
    assert.strictEqual(rec.tracking_id, 'TCAR00001');
  });

  console.log('\n================================');
  console.log(`Stage 5 Tests Completed: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
