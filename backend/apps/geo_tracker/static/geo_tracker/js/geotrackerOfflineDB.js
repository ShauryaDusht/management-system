/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Offline Database Service
 * Database Name: campus_geotracker_offline (IndexedDB)
 */
(function(window) {
  'use strict';

  var DB_NAME = 'campus_geotracker_offline';
  var DB_VERSION = 1;

  var STORES = {
    RECORDS: 'plant_records',
    PHOTOS: 'plant_photos',
    QUEUE: 'sync_queue',
    REF_DATA: 'reference_data'
  };

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function openDB() {
    return new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not supported on this browser/device.'));
        return;
      }

      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(event) {
        var db = event.target.result;

        // 1. plant_records store
        if (!db.objectStoreNames.contains(STORES.RECORDS)) {
          var recordStore = db.createObjectStore(STORES.RECORDS, { keyPath: 'local_id' });
          recordStore.createIndex('submission_id', 'submission_id', { unique: true });
          recordStore.createIndex('sync_status', 'sync_status', { unique: false });
          recordStore.createIndex('created_at', 'created_at', { unique: false });
          recordStore.createIndex('zone', 'zone', { unique: false });
        }

        // 2. plant_photos store
        if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
          var photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: 'photo_id' });
          photoStore.createIndex('local_record_id', 'local_record_id', { unique: false });
          photoStore.createIndex('upload_status', 'upload_status', { unique: false });
        }

        // 3. sync_queue store
        if (!db.objectStoreNames.contains(STORES.QUEUE)) {
          var queueStore = db.createObjectStore(STORES.QUEUE, { keyPath: 'queue_id' });
          queueStore.createIndex('submission_id', 'submission_id', { unique: false });
          queueStore.createIndex('local_record_id', 'local_record_id', { unique: false });
          queueStore.createIndex('queue_status', 'queue_status', { unique: false });
          queueStore.createIndex('next_retry_at', 'next_retry_at', { unique: false });
        }

        // 4. reference_data store
        if (!db.objectStoreNames.contains(STORES.REF_DATA)) {
          db.createObjectStore(STORES.REF_DATA, { keyPath: 'key' });
        }
      };

      request.onsuccess = function(event) {
        resolve(event.target.result);
      };

      request.onerror = function(event) {
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = function() {
        console.warn('[GeoTrackerDB] Database upgrade blocked by another open tab.');
      };
    });
  }

  function runTransaction(storeNames, mode, callback) {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var names = Array.isArray(storeNames) ? storeNames : [storeNames];
        var tx;
        try {
          tx = db.transaction(names, mode);
        } catch (err) {
          reject(err);
          return;
        }

        var result;

        tx.oncomplete = function() {
          resolve(result);
        };

        tx.onerror = function(event) {
          var error = event.target.error || tx.error || new Error('Transaction failed');
          if (error.name === 'QuotaExceededError') {
            console.error('[GeoTrackerDB] Browser storage quota exceeded.');
          }
          reject(error);
        };

        tx.onabort = function(event) {
          var error = event.target.error || tx.error || new Error('Transaction aborted');
          reject(error);
        };

        try {
          result = callback(tx);
        } catch (err) {
          try { tx.abort(); } catch(e) {}
          reject(err);
        }
      });
    });
  }

  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().then(function(persistent) {
        if (persistent) {
          console.log('[GeoTrackerDB] Storage is persistent.');
        } else {
          console.log('[GeoTrackerDB] Storage persistence not granted by browser.');
        }
        return persistent;
      }).catch(function(err) {
        console.warn('[GeoTrackerDB] Persistent storage request error:', err);
        return false;
      });
    }
    return Promise.resolve(false);
  }

  function checkStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function(estimate) {
        var usageMb = (estimate.usage || 0) / (1024 * 1024);
        var quotaMb = (estimate.quota || 0) / (1024 * 1024);
        var percent = quotaMb > 0 ? ((usageMb / quotaMb) * 100).toFixed(1) : 0;
        return {
          usageBytes: estimate.usage || 0,
          quotaBytes: estimate.quota || 0,
          usageMb: usageMb.toFixed(2),
          quotaMb: quotaMb.toFixed(2),
          percentUsed: percent,
          lowStorage: quotaMb > 0 && (quotaMb - usageMb < 20) // less than 20MB remaining
        };
      }).catch(function() {
        return null;
      });
    }
    return Promise.resolve(null);
  }

  // Export to global namespace
  window.GeoTrackerDB = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORES: STORES,
    openDB: openDB,
    runTransaction: runTransaction,
    generateUUID: generateUUID,
    requestPersistence: requestPersistence,
    checkStorageQuota: checkStorageQuota
  };

})(window);

