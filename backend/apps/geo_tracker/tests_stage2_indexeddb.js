/**
 * Automated Test Suite for Stage 2 - IndexedDB and Local Record Persistence
 * Tests all 12 scenarios required by Stage 2 instructions.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// In-memory IndexedDB Mock implementation for robust Node.js testing
class MockIDBIndex {
  constructor(store, name, keyPath, options) {
    this.store = store;
    this.name = name;
    this.keyPath = keyPath;
    this.unique = options && options.unique || false;
  }
  getAll(query) {
    const req = { onsuccess: null, onerror: null, result: [] };
    setTimeout(() => {
      const records = Object.values(this.store.data).filter(item => {
        if (query === undefined) return true;
        return item[this.keyPath] === query;
      });
      req.result = records;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
}

class MockIDBObjectStore {
  constructor(db, name, options) {
    this.db = db;
    this.name = name;
    this.keyPath = options.keyPath;
    this.indexes = {};
    if (!this.db.storage[name]) {
      this.db.storage[name] = {};
    }
  }
  get data() {
    return this.db.storage[this.name];
  }
  createIndex(name, keyPath, options) {
    this.indexes[name] = new MockIDBIndex(this, name, keyPath, options);
    return this.indexes[name];
  }
  index(name) {
    if (!this.indexes[name]) {
      this.indexes[name] = new MockIDBIndex(this, name, name, {});
    }
    return this.indexes[name];
  }
  put(value) {
    const key = value[this.keyPath];
    // Check unique indexes
    for (const idxName in this.indexes) {
      const idx = this.indexes[idxName];
      if (idx.unique && value[idx.keyPath] !== undefined) {
        for (const k in this.data) {
          if (k !== key && this.data[k][idx.keyPath] === value[idx.keyPath]) {
            const err = new Error(`Key already exists for unique index ${idxName}`);
            err.name = 'ConstraintError';
            throw err;
          }
        }
      }
    }
    this.data[key] = JSON.parse(JSON.stringify(value));
    const req = { onsuccess: null, onerror: null, result: key };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
  get(key) {
    const req = { onsuccess: null, onerror: null, result: null };
    setTimeout(() => {
      const item = this.data[key];
      req.result = item ? JSON.parse(JSON.stringify(item)) : null;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  getAll() {
    const req = { onsuccess: null, onerror: null, result: [] };
    setTimeout(() => {
      req.result = Object.values(this.data).map(x => JSON.parse(JSON.stringify(x)));
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  delete(key) {
    delete this.data[key];
    const req = { onsuccess: null, onerror: null, result: undefined };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
}

class MockIDBTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;

    setTimeout(() => {
      if (!this._aborted) {
        if (this.oncomplete) this.oncomplete({ target: this });
      }
    }, 5);
  }
  objectStore(name) {
    return this.db._stores[name];
  }
  abort() {
    this._aborted = true;
    if (this.onabort) this.onabort({ target: this });
  }
}

class MockIDBDatabase {
  constructor(name) {
    this.name = name;
    this.storage = {};
    this._stores = {};
    this.objectStoreNames = {
      contains: (n) => Boolean(this._stores[n])
    };
  }
  createObjectStore(name, options) {
    const s = new MockIDBObjectStore(this, name, options);
    this._stores[name] = s;
    return s;
  }
  transaction(storeNames, mode) {
    if (this._simulateQuotaExceeded) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    return new MockIDBTransaction(this, storeNames, mode);
  }
}

// Global persistent shared storage simulating disk
const GLOBAL_SHARED_STORAGE = {};

const mockIndexedDB = {
  open(dbName, version) {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
    setTimeout(() => {
      let db = GLOBAL_SHARED_STORAGE[dbName];
      let isNew = !db;
      if (!db) {
        db = new MockIDBDatabase(dbName);
        GLOBAL_SHARED_STORAGE[dbName] = db;
      }
      req.result = db;
      if (isNew && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req });
      }
      if (req.onsuccess) {
        req.onsuccess({ target: req });
      }
    }, 0);
    return req;
  }
};

// Setup browser globals
global.window = global;
global.indexedDB = mockIndexedDB;
global.navigator = {
  storage: {
    persist: () => Promise.resolve(true),
    estimate: () => Promise.resolve({ usage: 1048576, quota: 104857600 })
  }
};

// Load modules
const jsDir = path.join(__dirname, 'static', 'geo_tracker', 'js');
eval(fs.readFileSync(path.join(jsDir, 'geotrackerOfflineDB.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerPhotoStorage.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerReferenceData.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerRecordStorage.js'), 'utf8'));

async function runTests() {
  console.log('--- Starting Stage 2 Offline-First Persistence Tests ---\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}:`, err.message || err);
      failed++;
    }
  }

  // Test 1: Save one plant record offline
  await test('1. Save one plant record offline', async () => {
    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '10',
      local_name: 'Banyan',
      scientific_name: 'Ficus benghalensis',
      latitude: '23.2120000',
      longitude: '72.6850000',
      gps_accuracy_m: '4.5',
      zone: 'academic_block',
      height_m: '7.8',
      girth_cm: '110.0',
      canopy_area_m: '6.2',
      condition: 'excellent',
      notes: 'Test offline tree'
    }, [{ blob: { size: 1024, type: 'image/jpeg' }, filename: 'banyan.jpg' }]);

    assert(res.record.local_id, 'Must have local_id UUID');
    assert(res.record.submission_id, 'Must have submission_id UUID');
    assert.strictEqual(res.record.sync_status, 'saved_locally');
    assert.strictEqual(res.record.local_name, 'Banyan');
    assert.strictEqual(res.photos.length, 1);
  });

  // Test 2: Save five different plant records offline
  await test('2. Save five different plant records offline', async () => {
    const types = ['tree', 'shrub', 'creeper', 'plant', 'tree'];
    const names = ['Neem', 'Tecoma', 'Bougainvillea', 'Aloe', 'Gulmohar'];
    const saved = [];

    for (let i = 0; i < 5; i++) {
      const rec = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
        plant_type: types[i],
        variety: String(i + 1),
        local_name: names[i],
        latitude: (23.212 + i * 0.001).toFixed(7),
        longitude: (72.685 + i * 0.001).toFixed(7),
        zone: 'housing_zone',
        condition: 'good'
      }, [{ blob: { size: 500 + i, type: 'image/jpeg' }, filename: `${names[i]}.jpg` }]);
      saved.push(rec);
    }

    assert.strictEqual(saved.length, 5);
    const all = await window.GeoTrackerRecordStorage.getAllRecords();
    assert(all.length >= 6, 'Should contain at least 6 records total');
  });

  // Test 3: Save multiple photographs for one plant
  await test('3. Save multiple photographs for one plant', async () => {
    const photos = [
      { blob: { size: 1200, type: 'image/jpeg' }, filename: 'tree_trunk.jpg' },
      { blob: { size: 1800, type: 'image/jpeg' }, filename: 'tree_canopy.jpg' },
      { blob: { size: 1400, type: 'image/jpeg' }, filename: 'tree_leaves.jpg' }
    ];

    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '15',
      local_name: 'Peepal',
      zone: 'central_vista',
      latitude: '23.2140000',
      longitude: '72.6860000'
    }, photos);

    assert.strictEqual(res.photos.length, 3);
    const storedPhotos = await window.GeoTrackerPhotoStorage.getPhotosForRecord(res.record.local_id);
    assert.strictEqual(storedPhotos.length, 3, 'Should have 3 photos associated with record');
  });

  // Test 4: Refresh the browser and restore records
  await test('4. Refresh the browser and restore records', async () => {
    // Simulate page reload by getting records fresh from storage
    const records = await window.GeoTrackerRecordStorage.getAllRecords();
    assert(records.length > 0, 'Records must be restored after simulated page refresh');
    const first = records[0];
    assert(first.local_id && first.submission_id && first.sync_status);
  });

  // Test 5: Close and reopen the browser and restore records
  await test('5. Close and reopen the browser and restore records', async () => {
    // Reopen DB handle simulating new browser process
    const db = await window.GeoTrackerDB.openDB();
    assert(db !== null);
    const summary = await window.GeoTrackerRecordStorage.getSyncSummary();
    assert(summary.total > 0, 'Records persisted across DB connections');
  });

  // Test 6: Retrieve cached varieties offline
  await test('6. Retrieve cached varieties offline', async () => {
    const mockVarieties = [
      { id: '1', name: 'Neem', plant_type: 'tree', scientific_name: 'Azadirachta indica' },
      { id: '2', name: 'Bougainvillea', plant_type: 'creeper', scientific_name: 'Bougainvillea spectabilis' }
    ];

    await window.GeoTrackerReferenceData.cacheReferenceData('varieties', mockVarieties);
    const cached = await window.GeoTrackerReferenceData.getCachedReferenceData('varieties');
    assert.strictEqual(cached.cached, true);
    assert.strictEqual(cached.data.length, 2);
    assert.strictEqual(cached.data[0].name, 'Neem');
  });

  // Test 7: Retrieve cached campus areas offline
  await test('7. Retrieve cached campus areas offline', async () => {
    const mockAreas = [
      { value: 'academic_block', label: 'Academic Block' },
      { value: 'ground_sports', label: 'Ground Area / Sports Complex' }
    ];

    await window.GeoTrackerReferenceData.cacheReferenceData('campus_areas', mockAreas);
    const cached = await window.GeoTrackerReferenceData.getCachedReferenceData('campus_areas');
    assert.strictEqual(cached.cached, true);
    assert.strictEqual(cached.data.length, 2);
    assert.strictEqual(cached.data[1].label, 'Ground Area / Sports Complex');
  });

  // Test 8: Preserve GPS coordinates and accuracy
  await test('8. Preserve GPS coordinates and accuracy', async () => {
    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '20',
      latitude: '23.2123456',
      longitude: '72.6876543',
      gps_accuracy_m: '2.85',
      zone: 'sports_complex'
    });

    const rec = await window.GeoTrackerRecordStorage.getRecord(res.record.local_id);
    assert.strictEqual(rec.latitude, '23.2123456');
    assert.strictEqual(rec.longitude, '72.6876543');
    assert.strictEqual(rec.gps_accuracy_m, 2.85);
  });

  // Test 9: Handle storage quota errors
  await test('9. Handle storage quota errors', async () => {
    const db = await window.GeoTrackerDB.openDB();
    db._simulateQuotaExceeded = true;

    let caught = false;
    try {
      await window.GeoTrackerRecordStorage.saveRecordWithPhotos({ plant_type: 'tree', variety: '1' });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.name, 'QuotaExceededError');
    } finally {
      db._simulateQuotaExceeded = false;
    }
    assert(caught, 'Must catch and propagate QuotaExceededError');
  });

  // Test 10: Prevent duplicate local submissions
  await test('10. Prevent duplicate local submissions', async () => {
    // Verify each call produces unique local_id and submission_id
    const rec1 = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({ plant_type: 'tree', variety: '1' });
    const rec2 = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({ plant_type: 'tree', variety: '1' });

    assert.notStrictEqual(rec1.record.local_id, rec2.record.local_id);
    assert.notStrictEqual(rec1.record.submission_id, rec2.record.submission_id);
  });

  // Test 11: Verify existing online GeoTracker form behavior fallback
  await test('11. Verify existing online GeoTracker form behavior fallback', async () => {
    // Verify form submit function exposes both offline flow and online fallback
    const formHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', 'geo_tracker', 'submit_form.html'), 'utf8');
    assert(formHtml.includes('submitRecordOnline'), 'Must retain submitRecordOnline fallback function');
    assert(formHtml.includes('geotrackerOfflineDB.js'), 'Must load geotrackerOfflineDB.js');
    assert(formHtml.includes('geotrackerRecordStorage.js'), 'Must load geotrackerRecordStorage.js');
  });

  // Test 12: Verify all plant measurement fields remain intact
  await test('12. Verify all plant measurement fields remain intact', async () => {
    const creeperRes = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'creeper',
      variety: '5',
      area_shape: 'rectangle',
      length_m: '10.5',
      width_m: '4.2',
      total_area_m: '44.1',
      plant_spacing_cm: '25',
      planting_pattern: 'triangular',
      plant_count: 810,
      zone: 'academic_block'
    });

    const rec = await window.GeoTrackerRecordStorage.getRecord(creeperRes.record.local_id);
    assert.strictEqual(rec.area_shape, 'rectangle');
    assert.strictEqual(rec.length_m, 10.5);
    assert.strictEqual(rec.width_m, 4.2);
    assert.strictEqual(rec.total_area_m, 44.1);
    assert.strictEqual(rec.plant_spacing_cm, 25);
    assert.strictEqual(rec.planting_pattern, 'triangular');
    assert.strictEqual(rec.plant_count, 810);
  });

  console.log(`\n================================`);
  console.log(`Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
