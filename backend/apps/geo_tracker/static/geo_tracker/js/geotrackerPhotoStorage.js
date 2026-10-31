/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Photo Storage Service (IndexedDB)
 * Manages photo Blobs and metadata associated with plant records.
 */
(function(window) {
  'use strict';

  var DB = window.GeoTrackerDB;

  function savePhoto(photoData) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    var photoId = photoData.photo_id || DB.generateUUID();
    var now = new Date().toISOString();

    var entry = {
      photo_id: photoId,
      local_record_id: photoData.local_record_id,
      original_filename: photoData.original_filename || 'field_photo.jpg',
      mime_type: photoData.mime_type || (photoData.image_blob ? photoData.image_blob.type : 'image/jpeg') || 'image/jpeg',
      image_blob: photoData.image_blob,
      original_size: photoData.original_size || (photoData.image_blob ? photoData.image_blob.size : 0),
      compressed_size: photoData.compressed_size || (photoData.image_blob ? photoData.image_blob.size : 0),
      upload_status: photoData.upload_status || 'pending',
      server_photo_id: photoData.server_photo_id || null,
      created_at: photoData.created_at || now,
      updated_at: now,
      retry_count: photoData.retry_count || 0,
      last_error: photoData.last_error !== undefined ? photoData.last_error : null
    };

    return DB.runTransaction(DB.STORES.PHOTOS, 'readwrite', function(tx) {
      var store = tx.objectStore(DB.STORES.PHOTOS);
      store.put(entry);
      return entry;
    });
  }

  function getPhoto(photoId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return new Promise(function(resolve, reject) {
      DB.openDB().then(function(db) {
        var tx = db.transaction(DB.STORES.PHOTOS, 'readonly');
        var store = tx.objectStore(DB.STORES.PHOTOS);
        var req = store.get(photoId);

        req.onsuccess = function() {
          resolve(req.result || null);
        };
        req.onerror = function() {
          reject(req.error);
        };
      }).catch(reject);
    });
  }

  function getPhotosForRecord(localRecordId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return new Promise(function(resolve, reject) {
      DB.openDB().then(function(db) {
        var tx = db.transaction(DB.STORES.PHOTOS, 'readonly');
        var store = tx.objectStore(DB.STORES.PHOTOS);
        var index = store.index('local_record_id');
        var req = index.getAll(localRecordId);

        req.onsuccess = function() {
          resolve(req.result || []);
        };
        req.onerror = function() {
          reject(req.error);
        };
      }).catch(reject);
    });
  }

  function updatePhotoStatus(photoId, uploadStatus, serverPhotoId, lastError) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return getPhoto(photoId).then(function(photo) {
      if (!photo) return false;
      photo.upload_status = uploadStatus;
      if (serverPhotoId) photo.server_photo_id = serverPhotoId;
      if (lastError !== undefined) photo.last_error = lastError;
      if (uploadStatus === 'failed') {
        photo.retry_count = (photo.retry_count || 0) + 1;
      }
      photo.updated_at = new Date().toISOString();

      return DB.runTransaction(DB.STORES.PHOTOS, 'readwrite', function(tx) {
        tx.objectStore(DB.STORES.PHOTOS).put(photo);
        return photo;
      });
    });
  }

  function deletePhoto(photoId) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return DB.runTransaction(DB.STORES.PHOTOS, 'readwrite', function(tx) {
      var store = tx.objectStore(DB.STORES.PHOTOS);
      store.delete(photoId);
    });
  }

  window.GeoTrackerPhotoStorage = {
    savePhoto: savePhoto,
    getPhoto: getPhoto,
    getPhotosForRecord: getPhotosForRecord,
    updatePhotoStatus: updatePhotoStatus,
    deletePhoto: deletePhoto
  };

})(window);

