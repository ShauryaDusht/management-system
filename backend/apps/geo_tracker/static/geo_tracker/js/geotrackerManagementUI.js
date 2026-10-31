/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Synchronization Management UI & Conflict Resolution
 * Mobile-first drawer, live counters, record inspector, and conflict resolution modal.
 */
(function(window) {
  'use strict';

  var RecordStorage = window.GeoTrackerRecordStorage;
  var PhotoStorage = window.GeoTrackerPhotoStorage;
  var SyncEngine = window.GeoTrackerSyncEngine;
  var Compressor = window.GeoTrackerImageCompressor;

  var activeFilter = 'all';
  var activeObjectURLs = [];
  var currentDetailedRecord = null;
  var currentConflictRecord = null;

  // ── Helper: Format Dates & Bytes ──────────────────────────────────────────
  function formatDate(isoStr) {
    if (!isoStr) return '–';
    try {
      var d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
             d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  }

  function formatBytes(bytes) {
    if (Compressor && Compressor.formatBytes) {
      return Compressor.formatBytes(bytes);
    }
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getPlantEmoji(type) {
    type = (type || '').toLowerCase();
    if (type === 'tree') return '🌳';
    if (type === 'shrub') return '🪴';
    if (type === 'creeper') return '🌱';
    return '🌿';
  }

  function getStatusBadge(status, hasFailedPhotos) {
    if (status === 'synced' && !hasFailedPhotos) {
      return { text: '✓ Synced', cls: 'badge-synced' };
    }
    if (status === 'metadata_synced') {
      return { text: '⏳ Photos Pending', cls: 'badge-partial' };
    }
    if (status === 'uploading') {
      return { text: '🚀 Uploading…', cls: 'badge-uploading' };
    }
    if (status === 'failed' || hasFailedPhotos) {
      return { text: '⚠️ Failed', cls: 'badge-failed' };
    }
    if (status === 'auth_required') {
      return { text: '🔒 Auth Required', cls: 'badge-auth' };
    }
    if (status === 'needs_attention' || status === 'conflict') {
      return { text: '🚨 Needs Attention', cls: 'badge-attention' };
    }
    return { text: '📦 Saved Locally', cls: 'badge-local' };
  }

  function revokeCreatedObjectURLs() {
    activeObjectURLs.forEach(function(url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    activeObjectURLs = [];
  }

  // ── Drawer Open / Close ───────────────────────────────────────────────────
  function openDrawer() {
    var overlay = document.getElementById('recordDrawerOverlay');
    var drawer = document.getElementById('recordDrawer');
    if (overlay && drawer) {
      overlay.style.display = 'block';
      setTimeout(function() {
        drawer.classList.add('open');
      }, 10);
      document.body.style.overflow = 'hidden';
      refreshDrawerData();
    }
  }

  function closeDrawer() {
    var overlay = document.getElementById('recordDrawerOverlay');
    var drawer = document.getElementById('recordDrawer');
    if (overlay && drawer) {
      drawer.classList.remove('open');
      setTimeout(function() {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
      }, 300);
    }
  }

  // ── Refresh Live Dashboard & Records ─────────────────────────────────────
  function refreshDrawerData() {
    if (!RecordStorage) return;

    RecordStorage.getDetailedSummary().then(function(summary) {
      // Update counters in Dashboard
      var elTotal = document.getElementById('cntTotal');
      var elSynced = document.getElementById('cntSynced');
      var elPending = document.getElementById('cntPending');
      var elUploading = document.getElementById('cntUploading');
      var elFailed = document.getElementById('cntFailed');
      var elAuth = document.getElementById('cntAuth');
      var elAttention = document.getElementById('cntAttention');

      if (elTotal) elTotal.textContent = summary.total || 0;
      if (elSynced) elSynced.textContent = summary.synced || 0;
      if (elPending) elPending.textContent = summary.pending || 0;
      if (elUploading) elUploading.textContent = summary.uploading || 0;
      if (elFailed) elFailed.textContent = summary.failed || 0;
      if (elAuth) elAuth.textContent = summary.auth_required || 0;
      if (elAttention) elAttention.textContent = summary.needs_attention || 0;

      // Update header badges
      var savedCountEl = document.getElementById('savedCount');
      var drawerCountEl = document.getElementById('drawerCount');
      var unsynced = (summary.total || 0) - (summary.synced || 0);
      if (savedCountEl) savedCountEl.textContent = unsynced >= 0 ? unsynced : 0;
      if (drawerCountEl) drawerCountEl.textContent = summary.total || 0;

      // Render record cards
      renderRecordCards(activeFilter);
    }).catch(function(err) {
      console.error('[ManagementUI] Summary load error:', err);
    });
  }

  // ── Render Record Cards ───────────────────────────────────────────────────
  function renderRecordCards(filter) {
    var container = document.getElementById('recordsListContainer');
    if (!container) return;

    RecordStorage.getAllRecords().then(function(records) {
      // Filter records
      var filtered = records.filter(function(r) {
        var st = r.sync_status || 'saved_locally';
        if (filter === 'synced') return st === 'synced';
        if (filter === 'pending') return st === 'saved_locally' || st === 'pending_sync' || st === 'metadata_synced';
        if (filter === 'uploading') return st === 'uploading';
        if (filter === 'failed') return st === 'failed';
        if (filter === 'auth_required') return st === 'auth_required';
        if (filter === 'needs_attention') return st === 'needs_attention' || st === 'conflict';
        return true; // 'all'
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">' +
          '<div style="font-size:28px;margin-bottom:6px">📋</div>' +
          '<div style="font-weight:700;color:#374151">No records found</div>' +
          '<div style="font-size:12px;color:#6b7280;margin-top:2px">No records match the current filter (' + filter + ').</div>' +
          '</div>';
        return;
      }

      var html = '';
      filtered.forEach(function(rec) {
        var badge = getStatusBadge(rec.sync_status);
        var trackingDisplay = rec.tracking_id ? ('<span class="tracking-pill">' + rec.tracking_id + '</span>') : '';
        var shortId = rec.submission_id ? rec.submission_id.slice(0, 8) : rec.local_id.slice(0, 8);
        var dateDisplay = formatDate(rec.created_at);
        var photoCount = rec.photo_count || 1;

        var errorHtml = '';
        if (rec.last_error) {
          errorHtml = '<div class="card-error-notice">⚠️ ' + rec.last_error + '</div>';
        }

        var isFailedOrPending = rec.sync_status === 'failed' || rec.sync_status === 'auth_required' || rec.sync_status === 'needs_attention';
        var retryBtnHtml = isFailedOrPending
          ? '<button type="button" class="btn-card-action btn-retry" onclick="window.GeoTrackerManagementUI.retryRecord(\'' + rec.local_id + '\')">🔁 Retry</button>'
          : '';

        var conflictBtnHtml = (rec.sync_status === 'needs_attention' || rec.sync_status === 'conflict' || (rec.last_error && rec.last_error.includes('Permission denied')))
          ? '<button type="button" class="btn-card-action btn-conflict" onclick="window.GeoTrackerManagementUI.openConflictModal(\'' + rec.local_id + '\')">⚡ Resolve</button>'
          : '';

        html += '<div class="record-item-card" data-id="' + rec.local_id + '">' +
          '<div class="record-item-header">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span class="record-type-icon">' + getPlantEmoji(rec.plant_type) + '</span>' +
              '<div>' +
                '<div class="record-name-title">' + (rec.local_name || 'Unnamed Plant') + ' ' + trackingDisplay + '</div>' +
                '<div class="record-meta-sub">' + (rec.scientific_name ? '<i>' + rec.scientific_name + '</i> · ' : '') + (rec.zone || 'Campus') + ' · ' + dateDisplay + '</div>' +
              '</div>' +
            '</div>' +
            '<span class="status-chip ' + badge.cls + '">' + badge.text + '</span>' +
          '</div>' +
          '<div class="record-item-body">' +
            '<div class="record-meta-grid">' +
              '<span>📷 Photos: <b>' + photoCount + '</b></span>' +
              '<span>📍 GPS: <b>' + (rec.latitude ? (parseFloat(rec.latitude).toFixed(4) + ', ' + parseFloat(rec.longitude).toFixed(4)) : 'Manual') + '</b></span>' +
              '<span>ID: <code style="font-size:10px">' + shortId + '…</code></span>' +
            '</div>' +
            errorHtml +
            '<div class="record-item-actions">' +
              '<button type="button" class="btn-card-action btn-details" onclick="window.GeoTrackerManagementUI.openRecordDetail(\'' + rec.local_id + '\')">🔍 Details</button>' +
              conflictBtnHtml +
              retryBtnHtml +
            '</div>' +
          '</div>' +
        '</div>';
      });

      container.innerHTML = html;
    });
  }

  // ── Record Detail Modal ───────────────────────────────────────────────────
  function openRecordDetail(localId) {
    if (!RecordStorage) return Promise.resolve();

    return RecordStorage.getRecordWithPhotos(localId).then(function(item) {
      if (!item) return;
      currentDetailedRecord = item;
      var rec = item.record;
      var photos = item.photos || [];

      var modal = document.getElementById('recordDetailModal');
      var contentEl = document.getElementById('recordDetailContent');
      if (!modal || !contentEl) return;

      revokeCreatedObjectURLs();

      var badge = getStatusBadge(rec.sync_status);
      var trackingText = rec.tracking_id ? ('<span class="tracking-pill">' + rec.tracking_id + '</span>') : '<span style="color:#6b7280;font-size:11px">Not yet assigned by server</span>';

      // Photos HTML
      var photosHtml = '';
      if (photos.length === 0) {
        photosHtml = '<div style="font-size:12px;color:#6b7280;font-style:italic">No local photographs stored.</div>';
      } else {
        photos.forEach(function(p, idx) {
          var imgUrl = '';
          if (p.image_blob) {
            try {
              imgUrl = URL.createObjectURL(p.image_blob);
              activeObjectURLs.push(imgUrl);
            } catch (e) {}
          }

          var pBadge = p.upload_status === 'synced'
            ? '<span class="status-chip badge-synced">✓ Uploaded</span>'
            : (p.upload_status === 'failed'
                ? '<span class="status-chip badge-failed">⚠️ Failed</span>'
                : '<span class="status-chip badge-local">⏳ Pending Upload</span>');

          var retryPhotoBtn = p.upload_status !== 'synced'
            ? '<button type="button" class="btn-card-action btn-retry" style="margin-top:6px" onclick="window.GeoTrackerManagementUI.retryPhoto(\'' + p.photo_id + '\')">🔁 Retry Upload</button>'
            : '';

          var pError = p.last_error ? ('<div style="font-size:10.5px;color:#dc2626;margin-top:4px">⚠️ ' + p.last_error + '</div>') : '';

          photosHtml += '<div class="photo-inspect-card">' +
            (imgUrl ? '<img src="' + imgUrl + '" class="photo-inspect-thumb" alt="Plant photograph">' : '<div class="photo-inspect-placeholder">📷</div>') +
            '<div style="flex:1">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<strong style="font-size:12px;color:#111827">Photograph ' + (idx + 1) + '</strong>' +
                pBadge +
              '</div>' +
              '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + (p.original_filename || 'field_photo.jpg') + ' · ' + formatBytes(p.compressed_size || p.original_size) + '</div>' +
              (p.server_photo_id ? '<div style="font-size:10px;color:#166534;margin-top:2px">Server ID: ' + p.server_photo_id + '</div>' : '') +
              pError +
              retryPhotoBtn +
            '</div>' +
          '</div>';
        });
      }

      var measurementsHtml = '';
      if (rec.plant_type === 'tree' || rec.plant_type === 'plant') {
        measurementsHtml = '<div class="detail-row"><span>Height:</span><strong>' + (rec.height_m ? rec.height_m + ' m' : '–') + '</strong></div>' +
          '<div class="detail-row"><span>Girth:</span><strong>' + (rec.girth_cm ? rec.girth_cm + ' cm' : '–') + '</strong></div>' +
          '<div class="detail-row"><span>Canopy Span:</span><strong>' + (rec.canopy_area_m ? rec.canopy_area_m + ' m' : '–') + '</strong></div>';
      } else {
        measurementsHtml = '<div class="detail-row"><span>Bed Shape:</span><strong>' + (rec.area_shape || 'Rectangle') + '</strong></div>' +
          '<div class="detail-row"><span>Total Area:</span><strong>' + (rec.total_area_m ? rec.total_area_m + ' m²' : '–') + '</strong></div>' +
          '<div class="detail-row"><span>Spacing & Pattern:</span><strong>' + (rec.plant_spacing_cm || '25') + ' cm (' + (rec.planting_pattern || 'square') + ')</strong></div>' +
          '<div class="detail-row"><span>Estimated Plant Count:</span><strong>' + (rec.plant_count || '1') + '</strong></div>';
      }

      contentEl.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">' +
        '<div>' +
          '<div style="font-size:17px;font-weight:800;color:#1a3a2a">' + getPlantEmoji(rec.plant_type) + ' ' + (rec.local_name || 'Plant Record') + '</div>' +
          '<div style="font-size:12px;color:#4b5563;margin-top:2px">' + (rec.scientific_name ? '<i>' + rec.scientific_name + '</i>' : 'Botanical name pending') + '</div>' +
        '</div>' +
        '<span class="status-chip ' + badge.cls + '">' + badge.text + '</span>' +
      '</div>' +
      '<div class="detail-section-title">Record Identification</div>' +
      '<div class="detail-row"><span>Server Tracking ID:</span>' + trackingText + '</div>' +
      '<div class="detail-row"><span>Submission UUID:</span><code style="font-size:10px">' + rec.submission_id + '</code></div>' +
      '<div class="detail-row"><span>Local ID:</span><code style="font-size:10px">' + rec.local_id + '</code></div>' +
      '<div class="detail-row"><span>Captured At:</span><strong>' + formatDate(rec.created_at) + '</strong></div>' +
      '<div class="detail-section-title">Location & Area</div>' +
      '<div class="detail-row"><span>Campus Area:</span><strong>' + (rec.zone || '–') + '</strong></div>' +
      '<div class="detail-row"><span>Coordinates:</span><strong>' + (rec.latitude ? (rec.latitude + ', ' + rec.longitude) : '–') + '</strong></div>' +
      '<div class="detail-row"><span>GPS Accuracy:</span><strong>' + (rec.gps_accuracy_m ? (rec.gps_accuracy_m + ' m') : '–') + '</strong></div>' +
      '<div class="detail-section-title">Field Measurements & Condition</div>' +
      measurementsHtml +
      '<div class="detail-row"><span>Condition:</span><strong>' + (rec.condition || 'good').toUpperCase() + '</strong></div>' +
      (rec.notes ? '<div style="font-size:11.5px;color:#374151;margin-top:6px;background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;white-space:pre-wrap"><b>Notes:</b> ' + rec.notes + '</div>' : '') +
      '<div class="detail-section-title">Photographs (' + photos.length + ')</div>' +
      photosHtml +
      '<div style="display:flex;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb">' +
        (rec.sync_status !== 'synced' ? '<button type="button" class="submit-btn" style="padding:10px;font-size:13px" onclick="window.GeoTrackerManagementUI.retryRecord(\'' + rec.local_id + '\'); window.GeoTrackerManagementUI.closeRecordDetail();">🔁 Retry Record</button>' : '') +
        '<button type="button" class="gps-btn" style="background:#e5e7eb;color:#374151;padding:10px;font-size:13px" onclick="window.GeoTrackerManagementUI.closeRecordDetail()">Close</button>' +
      '</div>';

      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    });
  }

  function closeRecordDetail() {
    var modal = document.getElementById('recordDetailModal');
    if (modal) {
      modal.style.display = 'none';
      revokeCreatedObjectURLs();
      if (!document.getElementById('recordDrawer').classList.contains('open')) {
        document.body.style.overflow = '';
      }
    }
  }

  // ── Conflict Resolution Modal ─────────────────────────────────────────────
  function openConflictModal(localId) {
    if (!RecordStorage) return;

    RecordStorage.getRecord(localId).then(function(rec) {
      if (!rec) return;
      currentConflictRecord = rec;

      var modal = document.getElementById('conflictModal');
      var contentEl = document.getElementById('conflictModalContent');
      if (!modal || !contentEl) return;

      var allowedAreas = [];
      if (SyncEngine && SyncEngine.getSyncState().lastAuthStatus) {
        allowedAreas = SyncEngine.getSyncState().lastAuthStatus.allowed_areas || [];
      }
      if (allowedAreas.indexOf('*') !== -1 || allowedAreas.length === 0) {
        var zoneSelect = document.getElementById('zone');
        if (zoneSelect && zoneSelect.options) {
          allowedAreas = [];
          for (var zi = 0; zi < zoneSelect.options.length; zi++) {
            if (zoneSelect.options[zi].value) allowedAreas.push(zoneSelect.options[zi].value);
          }
        }
      }

      var isAreaError = rec.last_error && rec.last_error.toLowerCase().includes('permission');

      var areaSelectOptions = '<option value="" disabled selected>Select an authorized area…</option>';
      allowedAreas.forEach(function(a) {
        areaSelectOptions += '<option value="' + a + '">' + a + '</option>';
      });

      var areaConflictSection = isAreaError ? (
        '<div class="conflict-card-alert">' +
          '<div style="font-weight:800;color:#991b1b;font-size:12.5px;margin-bottom:4px">🚨 Campus Area Assignment Conflict</div>' +
          '<p style="font-size:11.5px;color:#7f1d1d;line-height:1.4">This record was saved for <b>' + (rec.zone || 'Unknown') + '</b>, which is not in your authorized areas. You can either update to an authorized area or request supervisor review.</p>' +
          '<div style="margin-top:10px">' +
            '<label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Reassign to Authorized Area:</label>' +
            '<select id="conflictAreaSelect" style="font-size:13px;padding:8px 10px;width:100%;border-radius:8px;border:1.5px solid #d1d5db;background:#fff">' +
              areaSelectOptions +
            '</select>' +
            '<button type="button" class="submit-btn" style="margin-top:8px;padding:9px;font-size:12.5px" onclick="window.GeoTrackerManagementUI.resolveAreaConflict(\'' + rec.local_id + '\')">✓ Update Area &amp; Retry Sync</button>' +
          '</div>' +
        '</div>'
      ) : '';

      contentEl.innerHTML = '<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">' +
        '<div style="font-size:16px;font-weight:800;color:#1a3a2a">⚡ Conflict &amp; Attention Resolver</div>' +
        '<div style="font-size:11.5px;color:#4b5563;margin-top:2px">Record: <b>' + (rec.local_name || rec.plant_type) + '</b> (' + rec.local_id.slice(0, 8) + '…)</div>' +
      '</div>' +
      (rec.last_error ? '<div class="card-error-notice" style="margin-bottom:12px"><b>Server Error:</b> ' + rec.last_error + '</div>' : '') +
      areaConflictSection +
      '<div class="detail-section-title">Conflict Resolution Options</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' +
        '<button type="button" class="gps-btn" style="padding:11px;font-size:12.5px;background:#0e6b94;text-align:left;display:block" onclick="window.GeoTrackerManagementUI.requestSupervisorReview(\'' + rec.local_id + '\')">' +
          '📋 <b>Request Supervisor Review</b><br><span style="font-size:10.5px;opacity:0.9">Flags record for supervisor review without modifying data.</span>' +
        '</button>' +
        '<button type="button" class="gps-btn" style="padding:11px;font-size:12.5px;background:#1a3a2a;text-align:left;display:block" onclick="window.GeoTrackerManagementUI.retryRecord(\'' + rec.local_id + '\'); window.GeoTrackerManagementUI.closeConflictModal();">' +
          '🔁 <b>Retry Synchronization</b><br><span style="font-size:10.5px;opacity:0.9">Attempts synchronization again with existing data.</span>' +
        '</button>' +
        '<button type="button" class="gps-btn" style="padding:11px;font-size:12.5px;background:#e5e7eb;color:#374151;text-align:center;display:block" onclick="window.GeoTrackerManagementUI.closeConflictModal()">' +
          'Cancel' +
        '</button>' +
      '</div>';

      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    });
  }

  function resolveAreaConflict(localId) {
    var select = document.getElementById('conflictAreaSelect');
    if (!select || !select.value) {
      alert('Please select an authorized campus area.');
      return;
    }
    var newArea = select.value;
    RecordStorage.updateRecordFields(localId, { zone: newArea }).then(function() {
      closeConflictModal();
      refreshDrawerData();
      if (SyncEngine) SyncEngine.syncNow(true);
    });
  }

  function requestSupervisorReview(localId) {
    RecordStorage.resolveConflict(localId, 'supervisor_review').then(function() {
      closeConflictModal();
      refreshDrawerData();
      alert('Record flagged for Supervisor Review. Data has been preserved.');
    });
  }

  function closeConflictModal() {
    var modal = document.getElementById('conflictModal');
    if (modal) {
      modal.style.display = 'none';
      if (!document.getElementById('recordDrawer').classList.contains('open')) {
        document.body.style.overflow = '';
      }
    }
  }

  // ── Retry Controls ────────────────────────────────────────────────────────
  function retryRecord(localId) {
    if (!RecordStorage) return;
    RecordStorage.retryRecord(localId).then(function() {
      refreshDrawerData();
      if (SyncEngine) {
        SyncEngine.syncNow(true);
      }
    });
  }

  function retryPhoto(photoId) {
    if (!RecordStorage) return;
    RecordStorage.retryPhoto(photoId).then(function() {
      refreshDrawerData();
      if (currentDetailedRecord) {
        openRecordDetail(currentDetailedRecord.record.local_id);
      }
      if (SyncEngine) {
        SyncEngine.syncNow(true);
      }
    });
  }

  function retryAllFailed() {
    if (!RecordStorage) return;
    RecordStorage.retryAllFailed().then(function(count) {
      refreshDrawerData();
      if (count > 0 && SyncEngine) {
        SyncEngine.syncNow(true);
      }
    });
  }

  // ── Initialization ────────────────────────────────────────────────────────
  function init() {
    // 1. Header Button listeners
    var manageBtn = document.getElementById('manageRecordsBtn');
    if (manageBtn) manageBtn.addEventListener('click', openDrawer);

    var badgeBtn = document.getElementById('localRecordBadge');
    if (badgeBtn) {
      badgeBtn.style.cursor = 'pointer';
      badgeBtn.addEventListener('click', openDrawer);
    }

    var closeBtn = document.getElementById('closeDrawerBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    var overlay = document.getElementById('recordDrawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);

    // 2. Filter Pills
    var pills = document.querySelectorAll('.drawer-filter-pill');
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        activeFilter = pill.getAttribute('data-filter') || 'all';
        renderRecordCards(activeFilter);
      });
    });

    // 3. Retry All Failed button
    var retryFailedBtn = document.getElementById('retryAllFailedBtn');
    if (retryFailedBtn) retryFailedBtn.addEventListener('click', retryAllFailed);

    // 4. SyncEngine Listeners
    if (SyncEngine) {
      SyncEngine.on('statusChange', function() {
        refreshDrawerData();
      });
      SyncEngine.on('syncComplete', function() {
        refreshDrawerData();
      });
    }

    // Initial load
    refreshDrawerData();
  }

  // Public Interface
  window.GeoTrackerManagementUI = {
    init: init,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    refreshDrawerData: refreshDrawerData,
    openRecordDetail: openRecordDetail,
    closeRecordDetail: closeRecordDetail,
    openConflictModal: openConflictModal,
    closeConflictModal: closeConflictModal,
    resolveAreaConflict: resolveAreaConflict,
    requestSupervisorReview: requestSupervisorReview,
    retryRecord: retryRecord,
    retryPhoto: retryPhoto,
    retryAllFailed: retryAllFailed
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

