/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Record Storage Service (IndexedDB)
 * Manages local plant records, offline drafts, and synchronization queue.
 */
(function(window) {
  'use strict';

  var DB = window.GeoTrackerDB;
  var PhotoStorage = window.GeoTrackerPhotoStorage;

  var SYNC_STATUS = {
    DRAFT: 'draft',
    SAVED_LOCALLY: 'saved_locally',
    METADATA_SYNCED: 'metadata_synced',
    PENDING_SYNC: 'pending_sync',
    UPLOADING: 'uploading',
    SYNCED: 'synced',
    FAILED: 'failed',
    AUTH_REQUIRED: 'auth_required',
    NEEDS_ATTENTION: 'needs_attention',
    CONFLICT: 'conflict'
  };

  /**
   * Save a plant record with its attached photograph(s) atomically into IndexedDB.
   */
  function saveRecordWithPhotos(recordFields, photoItems) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    var localId = DB.generateUUID();
    var submissionId = DB.generateUUID();
    var now = new Date().toISOString();

    var plantRecord = {
      local_id: localId,
      submission_id: submissionId,
      server_id: null,
      tracking_id: null,

      // Plant identity
      plant_type: recordFields.plant_type || 'tree',
      variety: recordFields.variety || '',
      local_name: recordFields.local_name || '',
      scientific_name: recordFields.scientific_name || '',

      // Geographic coordinates
      latitude: recordFields.latitude || null,
      longitude: recordFields.longitude || null,
      gps_accuracy_m: recordFields.gps_accuracy_m ? parseFloat(recordFields.gps_accuracy_m) : null,
      zone: recordFields.zone || '',

      // Tree/Plant measurements
      height_m: recordFields.height_m ? parseFloat(recordFields.height_m) : null,
      girth_cm: recordFields.girth_cm ? parseFloat(recordFields.girth_cm) : null,
      canopy_area_m: recordFields.canopy_area_m ? parseFloat(recordFields.canopy_area_m) : null,

      // Shrub/Creeper bed measurements
      area_shape: recordFields.area_shape || '',
      length_m: recordFields.length_m ? parseFloat(recordFields.length_m) : null,
      width_m: recordFields.width_m ? parseFloat(recordFields.width_m) : null,
      total_area_m: recordFields.total_area_m ? parseFloat(recordFields.total_area_m) : null,
      plant_spacing_cm: recordFields.plant_spacing_cm ? parseFloat(recordFields.plant_spacing_cm) : null,
      planting_pattern: recordFields.planting_pattern || '',
      plant_count: recordFields.plant_count ? parseInt(recordFields.plant_count, 10) : 1,

      // Condition & Notes
      condition: recordFields.condition || 'good',
      notes: recordFields.notes || '',

      // Metadata & Sync State
      photo_count: Array.isArray(photoItems) ? photoItems.length : (photoItems ? 1 : 0),
      created_at: now,
      updated_at: now,
      sync_status: SYNC_STATUS.SAVED_LOCALLY,
      retry_count: 0,
      last_sync_attempt: null,
      last_error: null
    };

    var recordQueueEntry = {
      queue_id: DB.generateUUID(),
      submission_id: submissionId,
      local_record_id: localId,
      operation_type: 'record_create',
      queue_status: 'pending',
      retry_count: 0,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
      last_error: null
    };

    return DB.runTransaction([DB.STORES.RECORDS, DB.STORES.QUEUE], 'readwrite', function(tx) {
      var recordStore = tx.objectStore(DB.STORES.RECORDS);
      var queueStore = tx.objectStore(DB.STORES.QUEUE);

      recordStore.put(plantRecord);
      queueStore.put(recordQueueEntry);

      return plantRecord;
    }).then(function(savedRecord) {
      // Process and save photo items if present
      var photos = Array.isArray(photoItems) ? photoItems : (photoItems ? [photoItems] : []);
      if (photos.length === 0) {
        return { record: savedRecord, photos: [] };
      }

      var photoPromises = photos.map(function(item) {
        var photoBlob = item.blob || item.file || item;
        var pId = item.photo_id || DB.generateUUID();
        return PhotoStorage.savePhoto({
          photo_id: pId,
          local_record_id: localId,
          original_filename: item.filename || item.name || 'plant_photo.jpg',
          mime_type: photoBlob.type || 'image/jpeg',
          image_blob: photoBlob,
          original_size: item.original_size || (photoBlob ? photoBlob.size : 0),
          compressed_size: item.compressed_size || (photoBlob ? photoBlob.size : 0),
          upload_status: 'pending'
        }).then(function(savedPhoto) {
          // Add photo upload entry to sync queue
          return DB.runTransaction(DB.STORES.QUEUE, 'readwrite', function(tx) {
            tx.objectStore(DB.STORES.QUEUE).put({
              queue_id: DB.generateUUID(),
              submission_id: submissionId,
              local_record_id: localId,
              photo_id: pId,
              operation_type: 'photo_upload',
              queue_status: 'pending',
              retry_count: 0,
              next_retry_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_error: null
            });
            return savedPhoto;
          });
        });
      });

      return Promise.all(photoPromises).then(function(savedPhotos) {
        return { record: savedRecord, photos: savedPhotos };
      });
    });
  }

  function getRecord(localId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return new Promise(function(resolve, reject) {
      DB.openDB().then(function(db) {
        var tx = db.transaction(DB.STORES.RECORDS, 'readonly');
        var store = tx.objectStore(DB.STORES.RECORDS);
        var req = store.get(localId);

        req.onsuccess = function() {
          resolve(req.result || null);
        };
        req.onerror = function() {
          reject(req.error);
        };
      }).catch(reject);
    });
  }

  function getAllRecords() {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return new Promise(function(resolve, reject) {
      DB.openDB().then(function(db) {
        var tx = db.transaction(DB.STORES.RECORDS, 'readonly');
        var store = tx.objectStore(DB.STORES.RECORDS);
        var req = store.getAll();

        req.onsuccess = function() {
          var records = req.result || [];
          // Sort newest first
          records.sort(function(a, b) {
            return new Date(b.created_at) - new Date(a.created_at);
          });
          resolve(records);
        };
        req.onerror = function() {
          reject(req.error);
        };
      }).catch(reject);
    });
  }

  function updateRecordStatus(localId, status, serverId, lastError, trackingId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return getRecord(localId).then(function(record) {
      if (!record) return false;
      record.sync_status = status;
      if (serverId) record.server_id = serverId;
      if (trackingId) record.tracking_id = trackingId;
      if (lastError !== undefined) record.last_error = lastError;
      if (status === SYNC_STATUS.FAILED) {
        record.retry_count = (record.retry_count || 0) + 1;
      }
      record.last_sync_attempt = new Date().toISOString();
      record.updated_at = new Date().toISOString();

      return DB.runTransaction(DB.STORES.RECORDS, 'readwrite', function(tx) {
        tx.objectStore(DB.STORES.RECORDS).put(record);
        return record;
      });
    });
  }

  function deleteRecord(localId, force) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return getRecord(localId).then(function(record) {
      if (!record) return Promise.resolve(false);

      if (!force && record.sync_status !== SYNC_STATUS.SYNCED && record.sync_status !== SYNC_STATUS.DRAFT) {
        throw new Error('Cannot delete an unsynchronized record without explicit confirmation.');
      }

      // Delete record, associated photos, and queue entries
      return DB.runTransaction([DB.STORES.RECORDS, DB.STORES.PHOTOS, DB.STORES.QUEUE], 'readwrite', function(tx) {
        var recStore = tx.objectStore(DB.STORES.RECORDS);
        var photoStore = tx.objectStore(DB.STORES.PHOTOS);
        var qStore = tx.objectStore(DB.STORES.QUEUE);

        recStore.delete(localId);

        // Delete photos for this record
        var pIndex = photoStore.index('local_record_id');
        var pReq = pIndex.getAll(localId);
        pReq.onsuccess = function() {
          var photos = pReq.result || [];
          photos.forEach(function(p) {
            photoStore.delete(p.photo_id);
          });
        };

        // Delete queue items for this record
        var qIndex = qStore.index('local_record_id');
        var qReq = qIndex.getAll(localId);
        qReq.onsuccess = function() {
          var items = qReq.result || [];
          items.forEach(function(item) {
            qStore.delete(item.queue_id);
          });
        };

        return true;
      });
    });
  }

  function getSyncSummary() {
    return getAllRecords().then(function(records) {
      var summary = {
        total: records.length,
        saved_locally: 0,
        pending_sync: 0,
        uploading: 0,
        synced: 0,
        failed: 0,
        auth_required: 0,
        needs_attention: 0
      };

      records.forEach(function(r) {
        var st = r.sync_status || SYNC_STATUS.SAVED_LOCALLY;
        if (st === SYNC_STATUS.NEEDS_ATTENTION || st === SYNC_STATUS.CONFLICT) {
          summary.needs_attention++;
        } else if (summary.hasOwnProperty(st)) {
          summary[st]++;
        } else {
          summary.saved_locally++;
        }
      });

      return summary;
    });
  }

  function getDetailedSummary() {
    return getAllRecords().then(function(records) {
      var summary = {
        total: records.length,
        synced: 0,
        pending: 0,
        uploading: 0,
        failed: 0,
        auth_required: 0,
        needs_attention: 0
      };

      records.forEach(function(r) {
        var st = r.sync_status || SYNC_STATUS.SAVED_LOCALLY;
        if (st === SYNC_STATUS.SYNCED) {
          summary.synced++;
        } else if (st === SYNC_STATUS.FAILED) {
          summary.failed++;
        } else if (st === SYNC_STATUS.AUTH_REQUIRED) {
          summary.auth_required++;
        } else if (st === SYNC_STATUS.NEEDS_ATTENTION || st === SYNC_STATUS.CONFLICT) {
          summary.needs_attention++;
        } else if (st === SYNC_STATUS.UPLOADING) {
          summary.uploading++;
        } else {
          // saved_locally, pending_sync, metadata_synced
          summary.pending++;
        }
      });

      return summary;
    });
  }

  function getRecordWithPhotos(localId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));
    return getRecord(localId).then(function(record) {
      if (!record) return null;
      return PhotoStorage.getPhotosForRecord(localId).then(function(photos) {
        return { record: record, photos: photos || [] };
      });
    });
  }

  function retryRecord(localId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));
    return DB.runTransaction([DB.STORES.RECORDS, DB.STORES.PHOTOS], 'readwrite', function(tx) {
      var rStore = tx.objectStore(DB.STORES.RECORDS);
      var pStore = tx.objectStore(DB.STORES.PHOTOS);

      var rReq = rStore.get(localId);
      rReq.onsuccess = function() {
        var r = rReq.result;
        if (r && r.sync_status !== SYNC_STATUS.SYNCED) {
          r.sync_status = r.server_id ? 'metadata_synced' : SYNC_STATUS.PENDING_SYNC;
          r.retry_count = 0;
          r.next_retry_at = null;
          r.last_error = null;
          rStore.put(r);
        }
      };

      var pIndex = pStore.index('local_record_id');
      var pReq = pIndex.getAll(localId);
      pReq.onsuccess = function() {
        var photos = pReq.result || [];
        photos.forEach(function(p) {
          if (p.upload_status !== 'synced') {
            p.upload_status = 'pending';
            p.retry_count = 0;
            p.last_error = null;
            pStore.put(p);
          }
        });
      };
    });
  }

  function retryPhoto(photoId) {
    if (!PhotoStorage) return Promise.reject(new Error('PhotoStorage not initialized'));
    return PhotoStorage.updatePhotoStatus(photoId, 'pending', null, null);
  }

  function retryAllFailed() {
    return getAllRecords().then(function(records) {
      var targets = records.filter(function(r) {
        return r.sync_status === SYNC_STATUS.FAILED ||
               r.sync_status === SYNC_STATUS.AUTH_REQUIRED ||
               r.sync_status === SYNC_STATUS.NEEDS_ATTENTION;
      });

      var promises = targets.map(function(r) {
        return retryRecord(r.local_id);
      });

      return Promise.all(promises).then(function() {
        return targets.length;
      });
    });
  }

  function updateRecordFields(localId, fieldsToUpdate) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));
    return getRecord(localId).then(function(record) {
      if (!record) return false;
      Object.assign(record, fieldsToUpdate);
      record.sync_status = SYNC_STATUS.PENDING_SYNC;
      record.retry_count = 0;
      record.next_retry_at = null;
      record.last_error = null;
      record.updated_at = new Date().toISOString();

      return DB.runTransaction(DB.STORES.RECORDS, 'readwrite', function(tx) {
        tx.objectStore(DB.STORES.RECORDS).put(record);
        return record;
      });
    });
  }

  function resolveConflict(localId, resolutionType, serverData) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return getRecord(localId).then(function(record) {
      if (!record) return false;

      if (resolutionType === 'keep_server' && serverData) {
        if (serverData.variety) record.variety = String(serverData.variety);
        if (serverData.local_name) record.local_name = serverData.local_name;
        if (serverData.scientific_name) record.scientific_name = serverData.scientific_name;
        if (serverData.zone) record.zone = serverData.zone;
        if (serverData.condition) record.condition = serverData.condition;
        if (serverData.height_m) record.height_m = serverData.height_m;
        if (serverData.girth_cm) record.girth_cm = serverData.girth_cm;
        if (serverData.canopy_area_m) record.canopy_area_m = serverData.canopy_area_m;
        if (serverData.notes) record.notes = serverData.notes;
        if (serverData.version !== undefined) record.version = serverData.version;
        if (serverData.updated_at) record.server_updated_at = serverData.updated_at;

        record.sync_status = SYNC_STATUS.SYNCED;
        record.conflict = null;
        record.last_error = null;
        record.updated_at = new Date().toISOString();

        var PhotoStorage = window.GeoTrackerPhotoStorage;
        var photoPromise = PhotoStorage ? PhotoStorage.getPhotosForRecord(localId) : Promise.resolve([]);

        return photoPromise.then(function(photos) {
          return DB.runTransaction([DB.STORES.RECORDS, DB.STORES.PHOTOS, DB.STORES.QUEUE], 'readwrite', function(tx) {
            var recStore = tx.objectStore(DB.STORES.RECORDS);
            var photoStore = tx.objectStore(DB.STORES.PHOTOS);
            var qStore = tx.objectStore(DB.STORES.QUEUE);

            recStore.put(record);

            if (photos && photos.length > 0) {
              photos.forEach(function(ph) {
                if (ph.upload_status !== 'synced') {
                  ph.upload_status = 'synced';
                  ph.last_error = null;
                  ph.updated_at = new Date().toISOString();
                  photoStore.put(ph);
                }
              });
            }

            var qIndex = qStore.index('local_record_id');
            var qReq = qIndex.getAll(localId);
            qReq.onsuccess = function() {
              var qItems = qReq.result || [];
              qItems.forEach(function(item) {
                if (item.status !== 'synced') {
                  item.status = 'synced';
                  qStore.put(item);
                }
              });
            };

            return record;
          });
        });
      }

      if (resolutionType === 'keep_local') {
        return updateRecordStatus(localId, SYNC_STATUS.PENDING_SYNC, null, null);
      }

      if (resolutionType === 'supervisor_review') {
        record.sync_status = SYNC_STATUS.NEEDS_ATTENTION;
        record.needs_supervisor_review = true;
        record.notes = (record.notes ? record.notes + '\n' : '') + '[Flagged for Supervisor Review: Conflict resolution requested by field staff]';
        record.updated_at = new Date().toISOString();

        return DB.runTransaction(DB.STORES.RECORDS, 'readwrite', function(tx) {
          tx.objectStore(DB.STORES.RECORDS).put(record);
          return record;
        });
      }

      if (resolutionType === 'resubmit_as_new') {
        record.submission_id = DB.generateUUID(); // Fresh submission ID
        record.server_id = null;
        record.tracking_id = null;
        record.sync_status = SYNC_STATUS.PENDING_SYNC;
        record.retry_count = 0;
        record.last_error = null;
        record.updated_at = new Date().toISOString();

        var PhotoStorage = window.GeoTrackerPhotoStorage;
        var photoPromise = PhotoStorage ? PhotoStorage.getPhotosForRecord(localId) : Promise.resolve([]);

        return photoPromise.then(function(photos) {
          return DB.runTransaction([DB.STORES.RECORDS, DB.STORES.PHOTOS, DB.STORES.QUEUE], 'readwrite', function(tx) {
            var recStore = tx.objectStore(DB.STORES.RECORDS);
            var photoStore = tx.objectStore(DB.STORES.PHOTOS);
            var qStore = tx.objectStore(DB.STORES.QUEUE);

            recStore.put(record);

            if (photos && photos.length > 0) {
              photos.forEach(function(oldPhoto) {
                photoStore.delete(oldPhoto.photo_id);
                var freshPhoto = Object.assign({}, oldPhoto, {
                  photo_id: DB.generateUUID(),
                  server_photo_id: null,
                  upload_status: 'pending',
                  retry_count: 0,
                  last_error: null,
                  updated_at: new Date().toISOString()
                });
                photoStore.put(freshPhoto);
              });
            }

            var qIndex = qStore.index('local_record_id');
            var qReq = qIndex.getAll(localId);
            qReq.onsuccess = function() {
              var qItems = qReq.result || [];
              qItems.forEach(function(item) {
                item.submission_id = record.submission_id;
                item.status = 'pending';
                item.retry_count = 0;
                item.last_error = null;
                qStore.put(item);
              });
            };

            return record;
          });
        });
      }

      return false;
    });
  }

  window.GeoTrackerRecordStorage = {
    SYNC_STATUS: SYNC_STATUS,
    saveRecordWithPhotos: saveRecordWithPhotos,
    getRecord: getRecord,
    getAllRecords: getAllRecords,
    getRecordWithPhotos: getRecordWithPhotos,
    updateRecordStatus: updateRecordStatus,
    updateRecordFields: updateRecordFields,
    retryRecord: retryRecord,
    retryPhoto: retryPhoto,
    retryAllFailed: retryAllFailed,
    resolveConflict: resolveConflict,
    deleteRecord: deleteRecord,
    getSyncSummary: getSyncSummary,
    getDetailedSummary: getDetailedSummary
  };

})(window);

