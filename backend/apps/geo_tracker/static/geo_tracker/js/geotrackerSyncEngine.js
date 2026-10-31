/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Persistent Synchronization Engine
 * Manages reliable, idempotent synchronization of offline plant records
 * and photographs with the Django backend.
 */
(function(window) {
  'use strict';

  var DB = window.GeoTrackerDB;
  var RecordStorage = window.GeoTrackerRecordStorage;
  var PhotoStorage = window.GeoTrackerPhotoStorage;

  // Synchronization Constants
  var API_ENDPOINTS = {
    STATUS: '/api/geo-tracker/sync/status/',
    RECORDS: '/api/geo-tracker/sync/records/',
    PHOTOS_TEMPLATE: '/api/geo-tracker/sync/records/{submission_id}/photos/'
  };

  var LOCK_KEY = 'cs_geotracker_sync_lock';
  var LOCK_LEASE_MS = 45000;       // 45 seconds lease timeout for crash safety
  var HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds heartbeat while syncing
  var REQUEST_TIMEOUT_MS = 15000;   // 15 seconds per API request
  var AUTO_SYNC_COOLDOWN_MS = 10000; // 10 seconds minimum between automatic triggers

  // Exponential backoff base intervals in ms [5s, 15s, 30s, 60s, 120s]
  var BACKOFF_INTERVALS = [5000, 15000, 30000, 60000, 120000];

  // Engine State
  var tabId = (function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'tab_' + Math.random().toString(36).substring(2, 11);
  })();

  var isSyncing = false;
  var heartbeatTimer = null;
  var lastAutoSyncAttempt = 0;
  var eventListeners = {};

  var syncState = {
    status: 'idle', // 'idle' | 'checking' | 'syncing' | 'offline' | 'auth_required' | 'error'
    message: '',
    progress: { current: 0, total: 0 },
    lastSyncTime: null,
    lastAuthStatus: null
  };

  // ── Event Bus ─────────────────────────────────────────────────────────────
  function on(event, callback) {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(callback);
  }

  function off(event, callback) {
    if (!eventListeners[event]) return;
    eventListeners[event] = eventListeners[event].filter(function(cb) { return cb !== callback; });
  }

  function emit(event, data) {
    var listeners = eventListeners[event] || [];
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](data);
      } catch (e) {
        console.error('[SyncEngine] Error in event listener for ' + event + ':', e);
      }
    }
  }

  function updateState(status, message, progress) {
    syncState.status = status;
    if (message !== undefined) syncState.message = message;
    if (progress !== undefined) syncState.progress = progress;
    emit('statusChange', syncState);
  }

  // ── CSRF Token Extraction ────────────────────────────────────────────────
  function getCsrfToken() {
    // 1. From DOM form input
    var input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input && input.value) return input.value;

    // 2. From document cookie
    var cookieMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

    // 3. From meta tag
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;

    return '';
  }

  // ── Multi-Tab Concurrency Lock ───────────────────────────────────────────
  function acquireLock() {
    try {
      var now = Date.now();
      var raw = localStorage.getItem(LOCK_KEY);
      if (raw) {
        var lock = JSON.parse(raw);
        if (lock.tabId !== tabId && (now - lock.timestamp) < LOCK_LEASE_MS) {
          // Lock is held by another active tab
          return false;
        }
      }
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: tabId, timestamp: now }));
      startHeartbeat();
      return true;
    } catch (e) {
      // LocalStorage access may fail in private mode; fallback to tab-level lock
      return true;
    }
  }

  function releaseLock() {
    stopHeartbeat();
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      if (raw) {
        var lock = JSON.parse(raw);
        if (lock.tabId === tabId) {
          localStorage.removeItem(LOCK_KEY);
        }
      }
    } catch (e) {}
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(function() {
      try {
        localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: tabId, timestamp: Date.now() }));
      } catch (e) {}
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ── Exponential Backoff with Jitter ──────────────────────────────────────
  function calculateBackoffMs(retryCount) {
    var index = Math.min(retryCount, BACKOFF_INTERVALS.length - 1);
    var baseMs = BACKOFF_INTERVALS[index];
    // Add +/- 20% jitter
    var jitter = baseMs * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }

  // ── Fetch with Timeout Helper ────────────────────────────────────────────
  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || REQUEST_TIMEOUT_MS;
    return new Promise(function(resolve, reject) {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function() {
        if (controller) controller.abort();
        var err = new Error('Request timed out after ' + (timeoutMs / 1000) + 's');
        err.isTimeout = true;
        reject(err);
      }, timeoutMs);

      var fetchOpts = Object.assign({}, options);
      if (controller) fetchOpts.signal = controller.signal;

      fetch(url, fetchOpts)
        .then(function(res) {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(function(err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // ── 1. Authentication and Connectivity Validation ─────────────────────────
  /**
   * Validates backend reachability, user session, and area permissions.
   * Resolves to:
   * {
   *   ok: boolean,
   *   authenticated: boolean,
   *   can_sync: boolean,
   *   unreachable: boolean,
   *   allowed_areas: string[],
   *   user: object|null,
   *   message: string
   * }
   */
  function checkSyncStatus() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      updateState('offline', 'Device is offline. Saved records remain safely stored locally.');
      return Promise.resolve({
        ok: false,
        authenticated: false,
        can_sync: false,
        unreachable: true,
        allowed_areas: [],
        user: null,
        message: 'Device is offline. Saved records remain safely stored on this device.'
      });
    }

    updateState('checking', 'Checking server connection and authentication…');

    return fetchWithTimeout(API_ENDPOINTS.STATUS, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin'
    }, 8000).then(function(res) {
      var contentType = (res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : (res.headers ? res.headers['content-type'] : '')) || '';

      // Guard against HTML login pages / SSO redirects being treated as 200 OK
      if (contentType.indexOf('application/json') === -1) {
        syncState.lastAuthStatus = { authenticated: false, can_sync: false };
        updateState('auth_required', 'Authentication required. Please log in through the approved portal.');
        return {
          ok: false,
          authenticated: false,
          can_sync: false,
          unreachable: false,
          allowed_areas: [],
          user: null,
          message: 'Received HTML redirect instead of JSON. Authentication required.'
        };
      }

      if (res.status === 401) {
        return res.json().then(function(data) {
          syncState.lastAuthStatus = { authenticated: false, can_sync: false };
          updateState('auth_required', data.message || 'Authentication required.');
          return {
            ok: false,
            authenticated: false,
            can_sync: false,
            unreachable: false,
            allowed_areas: [],
            user: null,
            message: data.message || 'Authentication required.'
          };
        }).catch(function() {
          syncState.lastAuthStatus = { authenticated: false, can_sync: false };
          updateState('auth_required', 'Authentication required.');
          return {
            ok: false,
            authenticated: false,
            can_sync: false,
            unreachable: false,
            allowed_areas: [],
            user: null,
            message: 'Authentication required.'
          };
        });
      }

      if (!res.ok) {
        updateState('error', 'Server error (' + res.status + ') during status check.');
        return {
          ok: false,
          authenticated: false,
          can_sync: false,
          unreachable: false,
          allowed_areas: [],
          user: null,
          message: 'Server returned HTTP ' + res.status
        };
      }

      return res.json().then(function(data) {
        syncState.lastAuthStatus = data;
        if (data.can_sync) {
          updateState('idle', 'Institutional network connected and ready.');
          return {
            ok: true,
            authenticated: !!data.authenticated,
            can_sync: true,
            unreachable: false,
            allowed_areas: data.allowed_areas || ['*'],
            user: data.user || null,
            message: data.message || 'Authorized on IITGN Institutional Network'
          };
        } else if (data.authenticated && !data.can_sync) {
          updateState('error', 'User has no authorized campus areas for synchronization.');
          return {
            ok: false,
            authenticated: true,
            can_sync: false,
            unreachable: false,
            allowed_areas: [],
            user: data.user || null,
            message: 'User has no authorized campus areas.'
          };
        } else {
          updateState('auth_required', data.message || 'Institutional network access required.');
          return {
            ok: false,
            authenticated: false,
            can_sync: false,
            unreachable: false,
            allowed_areas: [],
            user: null,
            message: data.message || 'Institutional network access required.'
          };
        }
      });
    }).catch(function(err) {
      console.warn('[SyncEngine] Backend unreachable or check timed out:', err.message);
      updateState('offline', 'Campus Sanchalika backend unreachable. Records remain saved locally.');
      return {
        ok: false,
        authenticated: false,
        can_sync: false,
        unreachable: true,
        allowed_areas: [],
        user: null,
        message: 'Backend server unreachable. Connect to IITGN SSO Wi-Fi.'
      };
    });
  }

  // ── 2. Metadata Synchronization Worker ────────────────────────────────────
  function syncRecordMetadata(record, csrfToken) {
    var payload = {
      submission_id: record.submission_id,
      plant_type: record.plant_type,
      variety: record.variety,
      local_name: record.local_name,
      scientific_name: record.scientific_name,
      latitude: record.latitude,
      longitude: record.longitude,
      gps_accuracy_m: record.gps_accuracy_m,
      zone: record.zone,
      height_m: record.height_m,
      girth_cm: record.girth_cm,
      canopy_area_m: record.canopy_area_m,
      area_shape: record.area_shape,
      length_m: record.length_m,
      width_m: record.width_m,
      total_area_m: record.total_area_m,
      plant_spacing_cm: record.plant_spacing_cm,
      planting_pattern: record.planting_pattern,
      plant_count: record.plant_count,
      condition: record.condition,
      notes: record.notes
    };

    // Strip undefined or null properties that backend doesn't expect
    Object.keys(payload).forEach(function(k) {
      if (payload[k] === null || payload[k] === undefined || payload[k] === '') {
        delete payload[k];
      }
    });
    // Ensure essential identifiers are always passed
    payload.submission_id = record.submission_id;
    payload.zone = record.zone;
    if (record.plant_type) payload.plant_type = record.plant_type;

    return fetchWithTimeout(API_ENDPOINTS.RECORDS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }, REQUEST_TIMEOUT_MS).then(function(res) {
      if (res.status === 401) {
        return { success: false, auth_required: true, status: 401 };
      }
      if (res.status === 403) {
        return res.json().then(function(d) {
          return { success: false, forbidden: true, status: 403, error: d.error || 'Permission denied' };
        }).catch(function() {
          return { success: false, forbidden: true, status: 403, error: 'Permission denied for this campus area.' };
        });
      }
      if (res.status === 400) {
        return res.json().then(function(d) {
          var msg = d.errors ? JSON.stringify(d.errors) : (d.error || 'Validation error');
          return { success: false, validation_error: true, status: 400, error: msg };
        }).catch(function() {
          return { success: false, validation_error: true, status: 400, error: 'Validation error' };
        });
      }
      if (!res.ok) {
        return { success: false, server_error: true, status: res.status, error: 'Server error: ' + res.status };
      }

      return res.json().then(function(data) {
        if (data.success || data.already_exists) {
          var serverId = data.record_id || data.record_pk;
          var trackingId = data.tracking_id || data.id;

          // Update record in IndexedDB with server identifiers
          return RecordStorage.updateRecordStatus(record.local_id, 'metadata_synced', serverId, null, trackingId).then(function() {
            return {
              success: true,
              server_id: serverId,
              tracking_id: trackingId,
              already_exists: !!data.already_exists
            };
          });
        }
        return { success: false, error: data.message || 'Unknown response from server' };
      });
    });
  }

  // ── 3. Photograph Synchronization Worker ─────────────────────────────────
  function syncSinglePhoto(photo, submissionId, csrfToken) {
    if (!photo.image_blob) {
      return Promise.resolve({ success: false, error: 'No image blob in local storage' });
    }

    var uploadUrl = API_ENDPOINTS.PHOTOS_TEMPLATE.replace('{submission_id}', encodeURIComponent(submissionId));
    var formData = new FormData();
    var photoBlob = photo.image_blob;
    if (typeof Blob !== 'undefined' && !(photoBlob instanceof Blob)) {
      try {
        photoBlob = new Blob([photoBlob], { type: photo.mime_type || 'image/jpeg' });
      } catch (e) {}
    }

    formData.append('photo', photoBlob, photo.original_filename || 'field_photo.jpg');
    formData.append('photo_id', photo.photo_id);
    if (photo.original_filename) formData.append('original_filename', photo.original_filename);

    return fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin',
      body: formData
    }, 30000).then(function(res) {
      if (res.status === 401) {
        return { success: false, auth_required: true, status: 401 };
      }
      if (res.status === 403) {
        return { success: false, forbidden: true, status: 403, error: 'Permission denied for photo upload' };
      }
      if (res.status === 413) {
        return { success: false, oversized: true, status: 413, error: 'HTTP 413 Payload Too Large: Photograph exceeds server upload size limit.' };
      }
      if (!res.ok) {
        return { success: false, server_error: true, status: res.status, error: 'Photo upload HTTP ' + res.status };
      }

      return res.json().then(function(data) {
        if (data.success || data.already_exists) {
          var serverPhotoId = data.photo_id;
          return PhotoStorage.updatePhotoStatus(photo.photo_id, 'synced', serverPhotoId, null).then(function() {
            return {
              success: true,
              photo_id: photo.photo_id,
              server_photo_id: serverPhotoId,
              photo_url: data.photo_url,
              already_exists: !!data.already_exists
            };
          });
        }
        return { success: false, error: data.message || 'Photo upload unsuccessful' };
      });
    });
  }

  // ── 4. Main Persistent Synchronization Routine ───────────────────────────
  /**
   * Executes a synchronization pass over all pending offline records and photos.
   * Can be invoked automatically or manually.
   *
   * @param {boolean} force - If true, bypasses backoff retry delays (Manual Sync Now).
   */
  function syncNow(force) {
    if (isSyncing) {
      console.log('[SyncEngine] Synchronization is already in progress.');
      return Promise.resolve({ already_in_progress: true, syncState: syncState });
    }

    if (!acquireLock()) {
      console.log('[SyncEngine] Another tab is currently synchronizing.');
      return Promise.resolve({ locked: true, locked_by_other_tab: true });
    }

    isSyncing = true;
    emit('syncStart', { force: !!force });

    var csrfToken = getCsrfToken();
    var authInfo = null;

    // Step A: Validate Backend Reachability & Authentication
    return checkSyncStatus().then(function(statusRes) {
      authInfo = statusRes;

      if (statusRes.unreachable) {
        // Backend cannot be reached (e.g. on mobile data outside SSO proxy)
        updateState('offline', 'Campus Sanchalika backend is currently unreachable. Connect to IITGN SSO network to sync.');
        return { stopped: true, reason: 'unreachable', message: statusRes.message, synced: 0, failed: 0, total: 0 };
      }

      if (!statusRes.can_sync) {
        if (statusRes.authenticated) {
          updateState('error', 'Synchronization is currently unavailable on this network.');
          return { stopped: true, reason: 'network_unavailable', message: statusRes.message };
        } else {
          updateState('auth_required', statusRes.message || 'Institutional network access required.');
          // Mark pending records as auth_required in IndexedDB without deleting anything
          return markPendingRecordsAuthRequired().then(function() {
            emit('authRequired', statusRes);
            return { stopped: true, reason: 'auth_required', message: statusRes.message };
          });
        }
      }

      // Step B: Load all local records from IndexedDB
      return RecordStorage.getAllRecords().then(function(allRecords) {
        // Find unsynchronized records eligible for sync (including any previously blocked by auth requirement)
        var pendingRecords = allRecords.filter(function(r) {
          var st = r.sync_status || RecordStorage.SYNC_STATUS.SAVED_LOCALLY;
          return st === RecordStorage.SYNC_STATUS.SAVED_LOCALLY ||
                 st === RecordStorage.SYNC_STATUS.PENDING_SYNC ||
                 st === RecordStorage.SYNC_STATUS.FAILED ||
                 st === RecordStorage.SYNC_STATUS.METADATA_SYNCED ||
                 st === RecordStorage.SYNC_STATUS.AUTH_REQUIRED;
        });

        if (pendingRecords.length === 0) {
          updateState('idle', 'All records are synchronized.');
          emit('syncComplete', { total: 0, synced: 0, failed: 0 });
          return { total: 0, synced: 0, failed: 0 };
        }

        var totalRecords = pendingRecords.length;
        var syncedCount = 0;
        var failedCount = 0;
        var now = Date.now();

        updateState('syncing', 'Syncing 0 of ' + totalRecords + ' records…', { current: 0, total: totalRecords });

        // Step C: Process records sequentially to preserve bandwidth and stability
        var chain = Promise.resolve();

        pendingRecords.forEach(function(record, index) {
          chain = chain.then(function() {
            // Check if record is currently in exponential backoff delay (unless force=true)
            if (!force && record.next_retry_at && record.next_retry_at > now) {
              console.log('[SyncEngine] Skipping record ' + record.local_id + ' (backoff until ' + new Date(record.next_retry_at).toLocaleTimeString() + ')');
              return;
            }

            var recordNum = index + 1;
            updateState('syncing', 'Syncing record ' + recordNum + ' of ' + totalRecords + ' (' + (record.local_name || record.plant_type) + ')…', {
              current: recordNum,
              total: totalRecords
            });

            // Phase 1: Sync Metadata if needed
            var metadataPromise;
            if (record.server_id || record.sync_status === 'metadata_synced') {
              metadataPromise = Promise.resolve({ success: true, server_id: record.server_id });
            } else {
              metadataPromise = syncRecordMetadata(record, csrfToken);
            }

            return metadataPromise.then(function(metaRes) {
              if (metaRes.auth_required) {
                updateState('auth_required', 'Authentication expired during synchronization.');
                throw new Error('AUTH_REQUIRED');
              }

              if (metaRes.forbidden) {
                failedCount++;
                return RecordStorage.updateRecordStatus(record.local_id, RecordStorage.SYNC_STATUS.NEEDS_ATTENTION, null, metaRes.error);
              }

              if (!metaRes.success) {
                failedCount++;
                var backoffMs = calculateBackoffMs(record.retry_count || 0);
                record.next_retry_at = Date.now() + backoffMs;
                return RecordStorage.updateRecordStatus(record.local_id, RecordStorage.SYNC_STATUS.FAILED, null, metaRes.error);
              }

              // Phase 2: Sync Photographs for this record
              return PhotoStorage.getPhotosForRecord(record.local_id).then(function(photos) {
                var pendingPhotos = photos.filter(function(p) { return p.upload_status !== 'synced'; });

                if (pendingPhotos.length === 0) {
                  // No photos or all photos already uploaded -> record is 100% synced!
                  syncedCount++;
                  return RecordStorage.updateRecordStatus(record.local_id, RecordStorage.SYNC_STATUS.SYNCED, metaRes.server_id, null);
                }

                // Upload pending photos sequentially
                var photoChain = Promise.resolve();
                var photoFailures = 0;

                pendingPhotos.forEach(function(photo, pIdx) {
                  photoChain = photoChain.then(function() {
                    updateState('syncing', 'Syncing record ' + recordNum + ' of ' + totalRecords + ' (Photo ' + (pIdx + 1) + '/' + pendingPhotos.length + ')…', {
                      current: recordNum,
                      total: totalRecords
                    });

                    return syncSinglePhoto(photo, record.submission_id, csrfToken).then(function(pRes) {
                      if (pRes.auth_required) throw new Error('AUTH_REQUIRED');
                      if (!pRes.success) {
                        photoFailures++;
                        return PhotoStorage.updatePhotoStatus(photo.photo_id, 'failed', null, pRes.error);
                      }
                    }).catch(function(pErr) {
                      if (pErr.message === 'AUTH_REQUIRED') throw pErr;
                      photoFailures++;
                      console.warn('[SyncEngine] Photo upload failed:', pErr);
                      return PhotoStorage.updatePhotoStatus(photo.photo_id, 'failed', null, pErr.message || String(pErr));
                    });
                  });
                });

                return photoChain.then(function() {
                  if (photoFailures === 0) {
                    // All photos confirmed uploaded -> mark overall record as SYNCED
                    syncedCount++;
                    return RecordStorage.updateRecordStatus(record.local_id, RecordStorage.SYNC_STATUS.SYNCED, metaRes.server_id, null);
                  } else {
                    // Partial sync: metadata is synced, but some photos failed
                    // Keep record in metadata_synced state so next retry only syncs remaining photos!
                    failedCount++;
                    var backoffMs = calculateBackoffMs(record.retry_count || 0);
                    record.next_retry_at = Date.now() + backoffMs;
                    return RecordStorage.updateRecordStatus(record.local_id, 'metadata_synced', metaRes.server_id, photoFailures + ' photograph(s) pending retry.');
                  }
                });
              });
            }).catch(function(recErr) {
              if (recErr.message === 'AUTH_REQUIRED') throw recErr;
              failedCount++;
              console.error('[SyncEngine] Record processing error:', recErr);
              var backoffMs = calculateBackoffMs(record.retry_count || 0);
              record.next_retry_at = Date.now() + backoffMs;
              return RecordStorage.updateRecordStatus(record.local_id, RecordStorage.SYNC_STATUS.FAILED, null, recErr.message || String(recErr));
            });
          });
        });

        return chain.then(function() {
          syncState.lastSyncTime = new Date().toISOString();
          var summaryMsg = (failedCount === 0)
            ? '✓ Synchronized ' + syncedCount + ' record(s) successfully.'
            : '✓ ' + syncedCount + ' record(s) synced, ' + failedCount + ' pending retry.';

          updateState(failedCount === 0 ? 'idle' : 'error', summaryMsg, { current: syncedCount, total: totalRecords });
          emit('syncComplete', { total: totalRecords, synced: syncedCount, failed: failedCount });
          return { total: totalRecords, synced: syncedCount, failed: failedCount };
        }).catch(function(fatalErr) {
          if (fatalErr.message === 'AUTH_REQUIRED') {
            updateState('auth_required', 'Authentication required to complete synchronization.');
            emit('authRequired', { authenticated: false });
            return { stopped: true, reason: 'auth_required' };
          }
          throw fatalErr;
        });
      });
    }).catch(function(topErr) {
      console.error('[SyncEngine] Synchronization cycle error:', topErr);
      updateState('error', 'Sync interrupted: ' + (topErr.message || topErr));
      emit('syncError', topErr);
      return { stopped: true, error: topErr.message };
    }).finally(function() {
      isSyncing = false;
      releaseLock();
    });
  }

  // ── Helper: Mark pending records as auth_required ─────────────────────────
  function markPendingRecordsAuthRequired() {
    return RecordStorage.getAllRecords().then(function(records) {
      var promises = records.map(function(r) {
        if (r.sync_status !== RecordStorage.SYNC_STATUS.SYNCED &&
            r.sync_status !== RecordStorage.SYNC_STATUS.DRAFT) {
          return RecordStorage.updateRecordStatus(r.local_id, RecordStorage.SYNC_STATUS.AUTH_REQUIRED, r.server_id, 'Authentication required');
        }
        return Promise.resolve();
      });
      return Promise.all(promises);
    });
  }

  // ── Auto-Sync Trigger Manager ─────────────────────────────────────────────
  function triggerAutoSync(reason) {
    var now = Date.now();
    if (now - lastAutoSyncAttempt < AUTO_SYNC_COOLDOWN_MS) {
      return;
    }
    lastAutoSyncAttempt = now;

    // Verify browser reports online before triggering
    if (!navigator.onLine) {
      updateState('offline', 'Device is offline. Saved records remain local.');
      return;
    }

    console.log('[SyncEngine] Automatic sync triggered by: ' + reason);
    syncNow(false);
  }

  // ── Engine Initialization ────────────────────────────────────────────────
  function init() {
    // 1. Online event listener
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', function() {
        setTimeout(function() { triggerAutoSync('window.online'); }, 1500);
      });
      window.addEventListener('focus', function() {
        triggerAutoSync('window.focus');
      });
    }

    // 2. Tab focus / visibility change
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          triggerAutoSync('document.visible');
        }
      });
    }

    // 3. Database open initialization
    if (DB && DB.openDB) {
      DB.openDB().then(function() {
        // Initial auto-sync attempt if online
        if (navigator.onLine) {
          setTimeout(function() { triggerAutoSync('engine.init'); }, 2000);
        }
      }).catch(function(err) {
        console.warn('[SyncEngine] DB open deferred:', err);
      });
    }

    console.log('[SyncEngine] Initialized on tab ' + tabId);
  }

  // Public API
  window.GeoTrackerSyncEngine = {
    init: init,
    syncNow: syncNow,
    getTabId: function() { return tabId; },
    checkSyncStatus: checkSyncStatus,
    getSyncState: function() { return Object.assign({}, syncState); },
    on: on,
    off: off,
    calculateBackoffMs: calculateBackoffMs,
    getCsrfToken: getCsrfToken
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
