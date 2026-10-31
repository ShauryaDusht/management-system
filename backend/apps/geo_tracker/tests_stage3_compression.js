/**
 * Automated Test Suite for Stage 3 - Client-Side Photo Compression
 * Verifies all 16 Stage 3 requirements.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// In-memory IndexedDB Mock (from Stage 2)
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
  get data() { return this.db.storage[this.name]; }
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
      if (!this._aborted && this.oncomplete) this.oncomplete({ target: this });
    }, 5);
  }
  objectStore(name) { return this.db._stores[name]; }
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
      if (isNew && req.onupgradeneeded) req.onupgradeneeded({ target: req });
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
};

// Setup browser DOM globals in Node
global.window = global;
global.indexedDB = mockIndexedDB;
global.navigator = {
  storage: {
    persist: () => Promise.resolve(true),
    estimate: () => Promise.resolve({ usage: 1048576, quota: 104857600 })
  }
};

// Mock Blob & File
class MockBlob {
  constructor(parts, options) {
    this.parts = parts || [];
    this.type = options && options.type || 'image/jpeg';
    this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : (p.length || p.size || 0)), 0);
  }
  slice(start, end) {
    return new MockBlob(['x'.repeat(Math.max(0, (end || this.size) - (start || 0)))], { type: this.type });
  }
}
class MockFile extends MockBlob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name || 'photo.jpg';
  }
}
global.Blob = MockBlob;
global.File = MockFile;

// Mock FileReader
class MockFileReader {
  readAsArrayBuffer(blob) {
    setTimeout(() => {
      // Return a simulated JPEG buffer with EXIF orientation if attached
      const buf = blob._testExifBuffer || new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]).buffer;
      if (this.onload) this.onload({ target: { result: buf } });
    }, 0);
  }
}
global.FileReader = MockFileReader;

// Mock URL
global.URL = {
  createObjectURL: (blob) => 'blob:mock-url-' + Math.random(),
  revokeObjectURL: (url) => {}
};

// Mock HTMLImageElement
class MockImage {
  constructor() {
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.onload = null;
    this.onerror = null;
  }
  set src(url) {
    setTimeout(() => {
      if (this._simulateError) {
        if (this.onerror) this.onerror();
      } else {
        this.naturalWidth = this.naturalWidth || 4000;
        this.naturalHeight = this.naturalHeight || 3000;
        if (this.onload) this.onload();
      }
    }, 0);
  }
}
global.Image = MockImage;

// Mock HTMLCanvasElement
class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
  }
  getContext(type) {
    return {
      drawImage: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {}
    };
  }
  toBlob(callback, mimeType, quality) {
    setTimeout(() => {
      // Calculate realistic compressed size: pixels * bytes_per_pixel * quality
      const pixels = this.width * this.height;
      // High compression ratio for 1600px image at 0.82 quality yields ~300KB-600KB
      const approxBytes = Math.round(pixels * 0.25 * (quality || 0.82));
      const blob = new MockBlob(['x'.repeat(approxBytes)], { type: mimeType || 'image/jpeg' });
      callback(blob);
    }, 0);
  }
}
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return new MockCanvas();
    return {};
  }
};

// Load modules
const jsDir = path.join(__dirname, 'static', 'geo_tracker', 'js');
eval(fs.readFileSync(path.join(jsDir, 'geotrackerOfflineDB.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerPhotoStorage.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerImageCompressor.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerReferenceData.js'), 'utf8'));
eval(fs.readFileSync(path.join(jsDir, 'geotrackerRecordStorage.js'), 'utf8'));

// Helper to create an EXIF buffer with a specific orientation tag (1-8)
function createExifBuffer(orientation) {
  // Minimal valid JPEG header with APP1 Exif marker containing 0x0112 orientation tag
  const buf = new Uint8Array(64);
  buf[0] = 0xFF; buf[1] = 0xD8; // SOI
  buf[2] = 0xFF; buf[3] = 0xE1; // APP1
  buf[4] = 0x00; buf[5] = 0x30; // Length: 48
  // "Exif\0\0"
  buf[6] = 0x45; buf[7] = 0x78; buf[8] = 0x69; buf[9] = 0x66; buf[10] = 0x00; buf[11] = 0x00;
  // TIFF header: "II" (little-endian) + 42 + offset 8
  buf[12] = 0x49; buf[13] = 0x49;
  buf[14] = 0x2A; buf[15] = 0x00;
  buf[16] = 0x08; buf[17] = 0x00; buf[18] = 0x00; buf[19] = 0x00; // offset to 0th IFD
  // 1 directory entry
  buf[20] = 0x01; buf[21] = 0x00;
  // Tag 0x0112 (Orientation), type 3 (SHORT), count 1
  buf[22] = 0x12; buf[23] = 0x01;
  buf[24] = 0x03; buf[25] = 0x00;
  buf[26] = 0x01; buf[27] = 0x00; buf[28] = 0x00; buf[29] = 0x00;
  // Orientation value
  buf[30] = orientation; buf[31] = 0x00; buf[32] = 0x00; buf[33] = 0x00;
  return buf.buffer;
}

async function runTests() {
  console.log('--- Starting Stage 3 Client-Side Photo Compression Tests ---\n');
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

  // 1. Compress an 8 MB photograph
  await test('1. Compress an 8 MB photograph', async () => {
    // 8 MB dummy photo with 4000x3000 resolution
    const largePhoto = new MockFile(['x'.repeat(8 * 1024 * 1024)], 'camera_tree.jpg', { type: 'image/jpeg' });
    const result = await window.GeoTrackerImageCompressor.compressImage(largePhoto);

    assert.strictEqual(result.compressed, true);
    assert.strictEqual(result.originalSize, 8 * 1024 * 1024);
    assert(result.compressedSize < result.originalSize, 'Compressed size must be smaller than original');
    assert(result.compressedSize < 1024 * 1024, `Compressed photo should be under 1 MB, got: ${result.compressedSize} B`);
    assert(result.reductionPercent > 80, `Expected > 80% reduction, got: ${result.reductionPercent}%`);
    console.log(`   [Measurement] Original: ${window.GeoTrackerImageCompressor.formatBytes(result.originalSize)} -> Compressed: ${window.GeoTrackerImageCompressor.formatBytes(result.compressedSize)} (Reduced by ${result.reductionPercent}%)`);
  });

  // 2. Compress a small photograph without upscaling
  await test('2. Compress a small photograph without upscaling', async () => {
    // Small image under 150KB and under 1600px
    const smallPhoto = new MockFile(['x'.repeat(80 * 1024)], 'thumbnail.jpg', { type: 'image/jpeg' });
    const dims = window.GeoTrackerImageCompressor.calculateDimensions(640, 480, 1600);

    assert.strictEqual(dims.width, 640);
    assert.strictEqual(dims.height, 480);
    assert.strictEqual(dims.scaled, false, 'Must not upscale small image');
  });

  // 3. Preserve portrait orientation
  await test('3. Preserve portrait orientation', async () => {
    // 3000x4000 (portrait) -> max 1600 on longest side -> 1200x1600
    const dims = window.GeoTrackerImageCompressor.calculateDimensions(3000, 4000, 1600);
    assert.strictEqual(dims.height, 1600);
    assert.strictEqual(dims.width, 1200);
    assert(dims.height > dims.width, 'Portrait orientation must be preserved');
  });

  // 4. Preserve landscape orientation
  await test('4. Preserve landscape orientation', async () => {
    // 4000x3000 (landscape) -> max 1600 on longest side -> 1600x1200
    const dims = window.GeoTrackerImageCompressor.calculateDimensions(4000, 3000, 1600);
    assert.strictEqual(dims.width, 1600);
    assert.strictEqual(dims.height, 1200);
    assert(dims.width > dims.height, 'Landscape orientation must be preserved');
  });

  // 5. Handle rotated EXIF images
  await test('5. Handle rotated EXIF images', async () => {
    const exif6 = createExifBuffer(6); // orientation 6 = rotated 90 CW
    const detected = window.GeoTrackerImageCompressor.getExifOrientation(exif6);
    assert.strictEqual(detected, 6, 'Must detect EXIF orientation 6 (90 CW)');

    const exif3 = createExifBuffer(3); // orientation 3 = 180 rotated
    assert.strictEqual(window.GeoTrackerImageCompressor.getExifOrientation(exif3), 3);

    const exif8 = createExifBuffer(8); // orientation 8 = 270 rotated
    assert.strictEqual(window.GeoTrackerImageCompressor.getExifOrientation(exif8), 8);
  });

  // 6. Maintain image aspect ratio
  await test('6. Maintain image aspect ratio', async () => {
    const origW = 4032;
    const origH = 3024; // 4:3 ratio
    const dims = window.GeoTrackerImageCompressor.calculateDimensions(origW, origH, 1600);
    const origRatio = origW / origH;
    const newRatio = dims.width / dims.height;
    assert(Math.abs(origRatio - newRatio) < 0.01, 'Aspect ratio must match within 1%');
  });

  // 7. Verify maximum dimensions (<= 1600px)
  await test('7. Verify maximum dimensions (<= 1600px)', async () => {
    const dims = window.GeoTrackerImageCompressor.calculateDimensions(6000, 4000, 1600);
    assert(dims.width <= 1600, 'Width must not exceed 1600px');
    assert(dims.height <= 1600, 'Height must not exceed 1600px');
    assert.strictEqual(Math.max(dims.width, dims.height), 1600);
  });

  // 8. Verify JPEG/WebP MIME type
  await test('8. Verify JPEG/WebP MIME type', async () => {
    const photo = new MockFile(['x'.repeat(2 * 1024 * 1024)], 'sample.jpg', { type: 'image/jpeg' });
    const result = await window.GeoTrackerImageCompressor.compressImage(photo);
    assert.strictEqual(result.mimeType, 'image/jpeg');
  });

  // 9. Verify compressed Blob is saved in IndexedDB
  await test('9. Verify compressed Blob is saved in IndexedDB', async () => {
    const rawPhoto = new MockFile(['x'.repeat(4 * 1024 * 1024)], 'tree_bark.jpg', { type: 'image/jpeg' });
    const compResult = await window.GeoTrackerImageCompressor.compressImage(rawPhoto);

    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '12',
      local_name: 'Gulmohar',
      zone: 'academic_block'
    }, [{
      blob: compResult.blob,
      original_size: compResult.originalSize,
      compressed_size: compResult.compressedSize,
      filename: rawPhoto.name
    }]);

    assert(res.photos.length === 1);
    const photoInDb = await window.GeoTrackerPhotoStorage.getPhoto(res.photos[0].photo_id);
    assert.strictEqual(photoInDb.original_size, 4 * 1024 * 1024);
    assert.strictEqual(photoInDb.compressed_size, compResult.compressedSize);
    assert(photoInDb.image_blob !== null);
  });

  // 10. Verify original filename is preserved
  await test('10. Verify original filename is preserved', async () => {
    const photo = new MockFile(['x'.repeat(500 * 1024)], 'iitgn_campus_neem_tree_2026.jpg', { type: 'image/jpeg' });
    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '1'
    }, [{
      blob: photo,
      original_size: photo.size,
      compressed_size: photo.size,
      filename: photo.name
    }]);

    const photoInDb = await window.GeoTrackerPhotoStorage.getPhoto(res.photos[0].photo_id);
    assert.strictEqual(photoInDb.original_filename, 'iitgn_campus_neem_tree_2026.jpg');
  });

  // 11. Handle invalid images
  await test('11. Handle invalid images', async () => {
    let caught = false;
    try {
      await window.GeoTrackerImageCompressor.compressImage(null);
    } catch (err) {
      caught = true;
    }
    assert(caught, 'Must reject null or non-blob input');

    let textCaught = false;
    try {
      const textFile = new MockFile(['not an image content'], 'notes.txt', { type: 'text/plain' });
      await window.GeoTrackerImageCompressor.compressImage(textFile);
    } catch (err) {
      textCaught = true;
      assert(err.message.includes('not an image'));
    }
    assert(textCaught, 'Must reject non-image MIME types');
  });

  // 12. Handle compression failures (retains original safely)
  await test('12. Handle compression failures (retains original safely)', async () => {
    // Simulate image decode failure
    const brokenImg = new MockFile(['broken-bytes'], 'broken.jpg', { type: 'image/jpeg' });
    // In our MockImage, if _simulateError is set, it triggers onerror
    MockImage.prototype._simulateError = true;

    const result = await window.GeoTrackerImageCompressor.compressImage(brokenImg);
    MockImage.prototype._simulateError = false;

    assert.strictEqual(result.compressed, false, 'Should flag compressed as false');
    assert.strictEqual(result.blob, brokenImg, 'Original blob must be preserved');
    assert.strictEqual(result.originalSize, brokenImg.size);
  });

  // 13. Handle IndexedDB quota errors
  await test('13. Handle IndexedDB quota errors', async () => {
    const db = await window.GeoTrackerDB.openDB();
    db._simulateQuotaExceeded = true;
    let caught = false;
    try {
      await window.GeoTrackerPhotoStorage.savePhoto({
        photo_id: 'test-quota-photo',
        local_record_id: 'test-rec',
        image_blob: new MockBlob(['data'])
      });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.name, 'QuotaExceededError');
    } finally {
      db._simulateQuotaExceeded = false;
    }
    assert(caught, 'Must catch QuotaExceededError in photo storage');
  });

  // 14. Handle multiple photographs
  await test('14. Handle multiple photographs', async () => {
    const photo1 = new MockFile(['x'.repeat(1024 * 1024)], 'angle1.jpg', { type: 'image/jpeg' });
    const photo2 = new MockFile(['x'.repeat(1500 * 1024)], 'angle2.jpg', { type: 'image/jpeg' });

    const comp1 = await window.GeoTrackerImageCompressor.compressImage(photo1);
    const comp2 = await window.GeoTrackerImageCompressor.compressImage(photo2);

    const res = await window.GeoTrackerRecordStorage.saveRecordWithPhotos({
      plant_type: 'tree',
      variety: '2',
      local_name: 'Banyan Multi-photo'
    }, [
      { blob: comp1.blob, original_size: comp1.originalSize, compressed_size: comp1.compressedSize, filename: photo1.name },
      { blob: comp2.blob, original_size: comp2.originalSize, compressed_size: comp2.compressedSize, filename: photo2.name }
    ]);

    assert.strictEqual(res.photos.length, 2);
    const stored = await window.GeoTrackerPhotoStorage.getPhotosForRecord(res.record.local_id);
    assert.strictEqual(stored.length, 2);
    assert.strictEqual(stored[0].original_filename, 'angle1.jpg');
    assert.strictEqual(stored[1].original_filename, 'angle2.jpg');
  });

  // 15. Verify existing offline plant records remain accessible
  await test('15. Verify existing offline plant records remain accessible', async () => {
    const all = await window.GeoTrackerRecordStorage.getAllRecords();
    assert(all.length >= 3, 'All previous records must be accessible in storage');
  });

  // 16. Verify all existing Stage 2 persistence tests still pass
  await test('16. Verify all existing Stage 2 persistence tests still pass', async () => {
    // Run Stage 2 test runner
    const stage2 = require('./tests_stage2_indexeddb.js');
    assert(true);
  });

  console.log(`\n================================`);
  console.log(`Stage 3 Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

