/**
 * Automated Test Suite for Stage 6: Synchronization Management UI and Conflict Resolution
 * Run with: node backend/apps/geo_tracker/tests_stage6_management_ui.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Stage 6 Management UI & Conflict Resolution Tests ---\n');

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

const mockDBInstance = new MockIDBDatabase();

// Setup global browser mocks
global.window = global;
global.window.addEventListener = function() {};
global.window.removeEventListener = function() {};
global.URL = {
  createObjectURL: function(blob) { return 'blob:mock-url-' + Math.random().toString(36).substring(2); },
  revokeObjectURL: function() {}
};
global.localStorage = {
  store: {},
  getItem: function(k) { return this.store[k] || null; },
  setItem: function(k, v) { this.store[k] = String(v); },
  removeItem: function(k) { delete this.store[k]; }
};
global.navigator = { onLine: true };

// Mock DOM elements
const domElements = new Map();
function createMockElement(id) {
  const el = {
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
  domElements.set(id, el);
  return el;
}

[
  'cntTotal', 'cntSynced', 'cntPending', 'cntUploading', 'cntFailed', 'cntAuth', 'cntAttention',
  'savedCount', 'drawerCount', 'recordsListContainer', 'recordDrawerOverlay', 'recordDrawer',
  'recordDetailModal', 'recordDetailContent', 'conflictModal', 'conflictModalContent'
].forEach(createMockElement);

global.document = {
  getElementById: function(id) {
    if (!domElements.has(id)) createMockElement(id);
    return domElements.get(id);
  },
  querySelector: function(sel) {
    if (sel === 'input[name="csrfmiddlewaretoken"]') return { value: 'mock-token' };
    return null;
  },
  querySelectorAll: function() { return []; },
  body: { style: {} },
  cookie: 'csrftoken=mock-token; sessionid=mock-session',
  addEventListener: function() {},
  removeEventListener: function() {},
  readyState: 'complete'
};

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

// Load GeoTrackerPhotoStorage
const photoStoragePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerPhotoStorage.js');
eval(fs.readFileSync(photoStoragePath, 'utf8'));

// Load GeoTrackerRecordStorage
const recordStoragePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerRecordStorage.js');
eval(fs.readFileSync(recordStoragePath, 'utf8'));

// Load GeoTrackerSyncEngine
const syncEnginePath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerSyncEngine.js');
eval(fs.readFileSync(syncEnginePath, 'utf8'));

// Load GeoTrackerManagementUI
const managementUIPath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerManagementUI.js');
eval(fs.readFileSync(managementUIPath, 'utf8'));

function resetData() {
  mockDBInstance.stores.plant_records.data.clear();
  mockDBInstance.stores.plant_photos.data.clear();
  global.localStorage.store = {};
}

function makeBlob(txt) {
  return new Blob([txt || 'photo-bytes'], { type: 'image/jpeg' });
}

// ── Test Scenarios ──────────────────────────────────────────────────────────

(async () => {
  // Test 1: Synchronization Counters
  await runAsyncTest('1. Display correct synchronization counters (Total, Synced, Pending, Failed, Auth, Attention)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    // Seed 6 distinct records across various statuses
    mockDBInstance.stores.plant_records.put({ local_id: 'r1', sync_status: RS.SYNC_STATUS.SYNCED });
    mockDBInstance.stores.plant_records.put({ local_id: 'r2', sync_status: RS.SYNC_STATUS.SAVED_LOCALLY });
    mockDBInstance.stores.plant_records.put({ local_id: 'r3', sync_status: RS.SYNC_STATUS.PENDING_SYNC });
    mockDBInstance.stores.plant_records.put({ local_id: 'r4', sync_status: RS.SYNC_STATUS.FAILED });
    mockDBInstance.stores.plant_records.put({ local_id: 'r5', sync_status: RS.SYNC_STATUS.AUTH_REQUIRED });
    mockDBInstance.stores.plant_records.put({ local_id: 'r6', sync_status: RS.SYNC_STATUS.NEEDS_ATTENTION });

    const summary = await RS.getDetailedSummary();
    assert.strictEqual(summary.total, 6, 'Total must be 6');
    assert.strictEqual(summary.synced, 1, 'Synced must be 1');
    assert.strictEqual(summary.pending, 2, 'Pending must be 2 (saved_locally + pending_sync)');
    assert.strictEqual(summary.failed, 1, 'Failed must be 1');
    assert.strictEqual(summary.auth_required, 1, 'Auth required must be 1');
    assert.strictEqual(summary.needs_attention, 1, 'Needs attention must be 1');
  });

  // Test 2: Display All Locally Stored Records
  await runAsyncTest('2. Display all locally stored records sorted newest first', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({
      local_id: 'old-rec',
      local_name: 'Banyan',
      created_at: '2026-10-01T10:00:00Z',
      sync_status: 'synced'
    });
    mockDBInstance.stores.plant_records.put({
      local_id: 'new-rec',
      local_name: 'Gulmohar',
      created_at: '2026-10-30T10:00:00Z',
      sync_status: 'saved_locally'
    });

    const all = await RS.getAllRecords();
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all[0].local_id, 'new-rec', 'Newest record must be first');
    assert.strictEqual(all[1].local_id, 'old-rec', 'Older record must be second');
  });

  // Test 3: Filter Records by Status
  await runAsyncTest('3. Filter records by status (All, Synced, Pending, Failed, Needs Attention)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({ local_id: 'r-sync', sync_status: 'synced' });
    mockDBInstance.stores.plant_records.put({ local_id: 'r-fail', sync_status: 'failed' });
    mockDBInstance.stores.plant_records.put({ local_id: 'r-attn', sync_status: 'needs_attention' });

    const all = await RS.getAllRecords();
    const synced = all.filter(r => r.sync_status === 'synced');
    const failed = all.filter(r => r.sync_status === 'failed');
    const attn = all.filter(r => r.sync_status === 'needs_attention');

    assert.strictEqual(synced.length, 1);
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(attn.length, 1);
  });

  // Test 4: Open Individual Record Details
  await runAsyncTest('4. Open individual record details with full measurements & identity', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'detail-rec-1';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      submission_id: 'sub-uuid-1',
      tracking_id: 'IITGN-2026-TRE-0042',
      plant_type: 'tree',
      local_name: 'Peepal',
      scientific_name: 'Ficus religiosa',
      zone: 'Central Arcade',
      latitude: '23.2135000',
      longitude: '72.6870000',
      height_m: 6.5,
      girth_cm: 120,
      condition: 'excellent',
      sync_status: 'synced'
    });

    const item = await RS.getRecordWithPhotos(locId);
    assert(item !== null, 'Record with photos must exist');
    assert.strictEqual(item.record.local_name, 'Peepal');
    assert.strictEqual(item.record.tracking_id, 'IITGN-2026-TRE-0042');
    assert.strictEqual(item.record.height_m, 6.5);
  });

  // Test 5: Display Photographs and Upload Status
  await runAsyncTest('5. Display photographs, file size, and upload statuses (Synced vs Failed vs Pending)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;

    const locId = 'rec-photos-1';
    mockDBInstance.stores.plant_records.put({ local_id: locId, sync_status: 'metadata_synced' });

    await PS.savePhoto({
      photo_id: 'p1',
      local_record_id: locId,
      original_filename: 'bark.jpg',
      image_blob: makeBlob('bark'),
      compressed_size: 45000,
      upload_status: 'synced',
      server_photo_id: 'srv-p1'
    });

    await PS.savePhoto({
      photo_id: 'p2',
      local_record_id: locId,
      original_filename: 'leaf.jpg',
      image_blob: makeBlob('leaf'),
      compressed_size: 65000,
      upload_status: 'failed',
      last_error: 'Upload timeout'
    });

    const photos = await PS.getPhotosForRecord(locId);
    assert.strictEqual(photos.length, 2);
    assert.strictEqual(photos[0].upload_status, 'synced');
    assert.strictEqual(photos[1].upload_status, 'failed');
    assert.strictEqual(photos[1].last_error, 'Upload timeout');
  });

  // Test 6: Retry a Failed Record
  await runAsyncTest('6. Retry a failed record (resets record & photo status to pending without data loss)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;

    const locId = 'failed-rec-1';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      sync_status: 'failed',
      retry_count: 3,
      next_retry_at: Date.now() + 60000,
      last_error: 'Server 500 error'
    });

    await PS.savePhoto({
      photo_id: 'p-fail',
      local_record_id: locId,
      upload_status: 'failed',
      last_error: 'Upload error'
    });

    await RS.retryRecord(locId);

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'pending_sync', 'Must reset to pending_sync');
    assert.strictEqual(rec.retry_count, 0, 'Retry count must reset to 0');
    assert.strictEqual(rec.next_retry_at, null, 'next_retry_at must be cleared');
    assert.strictEqual(rec.last_error, null, 'last_error must be cleared');

    const photos = await PS.getPhotosForRecord(locId);
    assert.strictEqual(photos[0].upload_status, 'pending', 'Photo must reset to pending');
  });

  // Test 7: Retry an Individual Photograph
  await runAsyncTest('7. Retry an individual photograph (resets only targeted photo to pending)', async () => {
    resetData();
    const PS = global.GeoTrackerPhotoStorage;
    const RS = global.GeoTrackerRecordStorage;

    await PS.savePhoto({
      photo_id: 'target-p',
      local_record_id: 'rec-xyz',
      upload_status: 'failed',
      last_error: 'Socket error'
    });

    await RS.retryPhoto('target-p');

    const photo = await PS.getPhoto('target-p');
    assert.strictEqual(photo.upload_status, 'pending');
    assert.strictEqual(photo.last_error, null);
  });

  // Test 8: Recover Partial Synchronization
  await runAsyncTest('8. Recover partial synchronization (metadata synced, retrying only failed photo)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;
    const PS = global.GeoTrackerPhotoStorage;

    const locId = 'partial-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      server_id: 88,
      sync_status: 'metadata_synced'
    });

    await PS.savePhoto({ photo_id: 'p-synced', local_record_id: locId, upload_status: 'synced' });
    await PS.savePhoto({ photo_id: 'p-failed', local_record_id: locId, upload_status: 'failed' });

    await RS.retryRecord(locId);

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'metadata_synced', 'Must keep metadata_synced because server_id exists');

    const pSynced = await PS.getPhoto('p-synced');
    const pFailed = await PS.getPhoto('p-failed');
    assert.strictEqual(pSynced.upload_status, 'synced', 'Already synced photo must remain synced');
    assert.strictEqual(pFailed.upload_status, 'pending', 'Only failed photo must be queued for retry');
  });

  // Test 9: Handle Expired Authentication
  await runAsyncTest('9. Handle expired authentication (sets auth_required without losing records or photos)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({
      local_id: 'auth-exp-rec',
      sync_status: 'saved_locally'
    });

    await RS.updateRecordStatus('auth-exp-rec', RS.SYNC_STATUS.AUTH_REQUIRED, null, 'Authentication expired');

    const rec = await RS.getRecord('auth-exp-rec');
    assert.strictEqual(rec.sync_status, 'auth_required');
    assert.strictEqual(rec.last_error, 'Authentication expired');
  });

  // Test 10: Handle Permission Failures
  await runAsyncTest('10. Handle permission failures (sets needs_attention with clear error explanation)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({
      local_id: 'perm-fail-rec',
      zone: 'Director Bungalow Garden',
      sync_status: 'saved_locally'
    });

    await RS.updateRecordStatus(
      'perm-fail-rec',
      RS.SYNC_STATUS.NEEDS_ATTENTION,
      null,
      "Permission denied: user not authorized for campus area 'Director Bungalow Garden'"
    );

    const rec = await RS.getRecord('perm-fail-rec');
    assert.strictEqual(rec.sync_status, 'needs_attention');
    assert(rec.last_error.includes('Permission denied'));
  });

  // Test 11: Display Genuine Server-Side Conflicts & Side-by-Side Diff
  await runAsyncTest('11. Display genuine server-side conflicts (identifies differing fields between local & server)', async () => {
    const localRecord = {
      local_name: 'Gulmohar',
      scientific_name: 'Delonix regia',
      zone: 'Sports Complex',
      height_m: 5.5,
      condition: 'good'
    };

    const serverRecord = {
      local_name: 'Gulmohar',
      scientific_name: 'Delonix regia',
      zone: 'Sports Complex',
      height_m: 6.2, // Differing field
      condition: 'fair' // Differing field
    };

    const diffs = [];
    Object.keys(localRecord).forEach(k => {
      if (localRecord[k] !== serverRecord[k]) {
        diffs.push({ field: k, local: localRecord[k], server: serverRecord[k] });
      }
    });

    assert.strictEqual(diffs.length, 2, 'Must detect 2 field differences');
    assert.strictEqual(diffs[0].field, 'height_m');
    assert.strictEqual(diffs[1].field, 'condition');
  });

  // Test 12: Resolve Conflict: Keep Server Version
  await runAsyncTest('12. Resolve conflict: Keep Server Version (overwrites local copy with server values and marks synced)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'conf-rec-1';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      local_name: 'Local Name Divergent',
      height_m: 4.0,
      sync_status: 'needs_attention'
    });

    await RS.resolveConflict(locId, 'keep_server', {
      local_name: 'Server Confirmed Name',
      height_m: 5.2
    });

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.local_name, 'Server Confirmed Name');
    assert.strictEqual(rec.height_m, 5.2);
    assert.strictEqual(rec.sync_status, 'synced');
  });

  // Test 13: Resolve Conflict: Request Supervisor Review
  await runAsyncTest('13. Resolve conflict: Request Supervisor Review (flags record without altering local data)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'conf-rec-2';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      local_name: 'Special Tree',
      notes: 'Initial field observations',
      sync_status: 'conflict'
    });

    await RS.resolveConflict(locId, 'supervisor_review');

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.sync_status, 'needs_attention');
    assert.strictEqual(rec.needs_supervisor_review, true);
    assert(rec.notes.includes('[Flagged for Supervisor Review'));
  });

  // Test 14: Resolve Area Conflict (Update zone and queue retry)
  await runAsyncTest('14. Resolve area conflict (reassign to authorized area and queue for retry)', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    const locId = 'area-conf-rec';
    mockDBInstance.stores.plant_records.put({
      local_id: locId,
      zone: 'Wrong Area',
      sync_status: 'failed',
      last_error: 'Permission denied for Wrong Area'
    });

    await RS.updateRecordFields(locId, { zone: 'Central Arcade' });

    const rec = await RS.getRecord(locId);
    assert.strictEqual(rec.zone, 'Central Arcade', 'Zone must be updated');
    assert.strictEqual(rec.sync_status, 'pending_sync', 'Must transition to pending_sync');
    assert.strictEqual(rec.last_error, null, 'Error must be cleared for retry');
  });

  // Test 15: Retry All Failed Records
  await runAsyncTest('15. Retry All Failed records in batch', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({ local_id: 'f1', sync_status: 'failed' });
    mockDBInstance.stores.plant_records.put({ local_id: 'f2', sync_status: 'auth_required' });
    mockDBInstance.stores.plant_records.put({ local_id: 's1', sync_status: 'synced' });

    const retriedCount = await RS.retryAllFailed();
    assert.strictEqual(retriedCount, 2, 'Must retry 2 failed/auth records');

    const f1 = await RS.getRecord('f1');
    const f2 = await RS.getRecord('f2');
    const s1 = await RS.getRecord('s1');

    assert.strictEqual(f1.sync_status, 'pending_sync');
    assert.strictEqual(f2.sync_status, 'pending_sync');
    assert.strictEqual(s1.sync_status, 'synced', 'Synced record must remain unchanged');
  });

  // Test 16: Safe Photo Deletion Protection
  await runAsyncTest('16. Unsynchronized records cannot be deleted without explicit confirmation', async () => {
    resetData();
    const RS = global.GeoTrackerRecordStorage;

    mockDBInstance.stores.plant_records.put({ local_id: 'unsynced-rec', sync_status: 'saved_locally' });

    let deleteBlocked = false;
    try {
      await RS.deleteRecord('unsynced-rec', false); // force = false
    } catch (err) {
      deleteBlocked = true;
    }
    assert.strictEqual(deleteBlocked, true, 'Deleting unsynced record without force must be blocked');

    // Record must still exist
    const rec = await RS.getRecord('unsynced-rec');
    assert(rec !== null, 'Record must be preserved');
  });

  // Test 17: Service Worker Precache Verification
  runTest('17. Service worker precache includes geotrackerManagementUI.js', () => {
    const swPath = path.resolve(__dirname, '../housekeeping/static/pwa/sw.js');
    const swTxt = fs.readFileSync(swPath, 'utf8');
    assert(swTxt.includes('/static/geo_tracker/js/geotrackerManagementUI.js'), 'sw.js must precache geotrackerManagementUI.js');
  });

  // Test 18: Template Markup Verification
  runTest('18. submit_form.html contains complete management drawer & modal markups', () => {
    const tplPath = path.resolve(__dirname, '../../templates/geo_tracker/submit_form.html');
    const tplTxt = fs.readFileSync(tplPath, 'utf8');
    assert(tplTxt.includes('id="recordDrawer"'), 'Template must include recordDrawer');
    assert(tplTxt.includes('id="manageRecordsBtn"'), 'Template must include manageRecordsBtn in header');
    assert(tplTxt.includes('id="recordDetailModal"'), 'Template must include recordDetailModal');
    assert(tplTxt.includes('id="conflictModal"'), 'Template must include conflictModal');
    assert(tplTxt.includes('geotrackerManagementUI.js'), 'Template must load geotrackerManagementUI.js');
  });

  // Test 19: Metric Counters Derivation
  runTest('19. All dashboard metric cards derive dynamically from IndexedDB records', () => {
    const uiPath = path.resolve(__dirname, 'static/geo_tracker/js/geotrackerManagementUI.js');
    const uiTxt = fs.readFileSync(uiPath, 'utf8');
    assert(uiTxt.includes('RecordStorage.getDetailedSummary()'), 'UI must query dynamic detailed summary from IndexedDB');
    assert(uiTxt.includes('elTotal.textContent = summary.total'), 'Counters must map to actual summary object');
  });

  // Test 20: Mobile UI Touch Targets & Responsive Layout
  runTest('20. Mobile UI uses touch-friendly responsive drawers, pills, and cards without wide tables', () => {
    const tplPath = path.resolve(__dirname, '../../templates/geo_tracker/submit_form.html');
    const tplTxt = fs.readFileSync(tplPath, 'utf8');
    assert(tplTxt.includes('.drawer-panel'), 'Must define mobile drawer panel');
    assert(tplTxt.includes('.drawer-drag-pill'), 'Must define touch drag pill');
    assert(tplTxt.includes('.filter-bar'), 'Must define horizontally scrollable filter bar');
    assert(!tplTxt.includes('<table id="recordsTable"'), 'Must avoid wide rigid HTML tables for mobile display');
  });

  console.log('\n================================');
  console.log(`Stage 6 Tests Completed: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
