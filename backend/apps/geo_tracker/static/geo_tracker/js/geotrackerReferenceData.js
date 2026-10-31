/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Reference Data Service (IndexedDB)
 * Caches varieties and campus areas so the dropdowns function 100% offline.
 */
(function(window) {
  'use strict';

  var DB = window.GeoTrackerDB;

  var KEYS = {
    VARIETIES: 'varieties',
    CAMPUS_AREAS: 'campus_areas'
  };

  function cacheReferenceData(key, items) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve();

    var entry = {
      key: key,
      data: items,
      last_updated: new Date().toISOString(),
      cache_version: 1
    };

    return DB.runTransaction(DB.STORES.REF_DATA, 'readwrite', function(tx) {
      var store = tx.objectStore(DB.STORES.REF_DATA);
      store.put(entry);
      return entry;
    });
  }

  function getCachedReferenceData(key) {
    if (!DB) return Promise.reject(new Error('GeoTrackerDB not initialized'));

    return new Promise(function(resolve, reject) {
      DB.openDB().then(function(db) {
        var tx = db.transaction(DB.STORES.REF_DATA, 'readonly');
        var store = tx.objectStore(DB.STORES.REF_DATA);
        var req = store.get(key);

        req.onsuccess = function() {
          if (req.result && Array.isArray(req.result.data)) {
            resolve({
              data: req.result.data,
              last_updated: req.result.last_updated,
              cached: true
            });
          } else {
            resolve({
              data: [],
              last_updated: null,
              cached: false
            });
          }
        };

        req.onerror = function() {
          reject(req.error);
        };
      }).catch(reject);
    });
  }

  /**
   * Seed reference cache directly from existing HTML DOM select elements.
   * On initial page load (when online), Django server renders all varieties & campus_areas
   * inside the <select> elements. This function extracts them so that subsequent offline launches
   * have access to all master data immediately without extra network roundtrips.
   */
  function seedFromDOM() {
    var varietySelect = document.getElementById('variety');
    var zoneSelect = document.getElementById('zone');

    var varieties = [];
    if (varietySelect && varietySelect.options) {
      for (var i = 0; i < varietySelect.options.length; i++) {
        var opt = varietySelect.options[i];
        if (opt.value && !opt.disabled) {
          varieties.push({
            id: opt.value,
            name: opt.getAttribute('data-name') || opt.text,
            plant_type: opt.getAttribute('data-type') || '',
            scientific_name: opt.getAttribute('data-scientific') || '',
            display: opt.text
          });
        }
      }
    }

    var campusAreas = [];
    if (zoneSelect && zoneSelect.options) {
      for (var j = 0; j < zoneSelect.options.length; j++) {
        var zOpt = zoneSelect.options[j];
        if (zOpt.value && !zOpt.disabled) {
          campusAreas.push({
            value: zOpt.value,
            label: zOpt.text
          });
        }
      }
    }

    var tasks = [];
    if (varieties.length > 0) {
      tasks.push(cacheReferenceData(KEYS.VARIETIES, varieties));
    }
    if (campusAreas.length > 0) {
      tasks.push(cacheReferenceData(KEYS.CAMPUS_AREAS, campusAreas));
    }

    return Promise.all(tasks).then(function() {
      return { varietiesCount: varieties.length, campusAreasCount: campusAreas.length };
    });
  }

  /**
   * Populate dropdowns from IndexedDB reference data when launched offline.
   */
  function populateSelectsFromCache() {
    return Promise.all([
      getCachedReferenceData(KEYS.VARIETIES),
      getCachedReferenceData(KEYS.CAMPUS_AREAS)
    ]).then(function(results) {
      var varietiesResult = results[0];
      var areasResult = results[1];

      var varietySelect = document.getElementById('variety');
      if (varietySelect && varietiesResult.data && varietiesResult.data.length > 0) {
        // If select is empty or has only placeholder
        if (varietySelect.options.length <= 1) {
          varietySelect.innerHTML = '<option value="" disabled selected>Select local name...</option>';
          varietiesResult.data.forEach(function(v) {
            var opt = document.createElement('option');
            opt.value = v.id;
            opt.setAttribute('data-type', v.plant_type);
            opt.setAttribute('data-name', v.name);
            opt.setAttribute('data-scientific', v.scientific_name);
            opt.textContent = v.display || (v.name + (v.plant_type ? ' (' + v.plant_type + ')' : ''));
            varietySelect.appendChild(opt);
          });
        }
      }

      var zoneSelect = document.getElementById('zone');
      if (zoneSelect && areasResult.data && areasResult.data.length > 0) {
        if (zoneSelect.options.length <= 1) {
          zoneSelect.innerHTML = '<option value="" selected disabled>Select Campus Area</option>';
          areasResult.data.forEach(function(a) {
            var opt = document.createElement('option');
            opt.value = a.value;
            opt.textContent = a.label;
            zoneSelect.appendChild(opt);
          });
        }
      }

      return {
        varietiesLoaded: (varietiesResult.data || []).length,
        areasLoaded: (areasResult.data || []).length
      };
    });
  }

  window.GeoTrackerReferenceData = {
    KEYS: KEYS,
    cacheReferenceData: cacheReferenceData,
    getCachedReferenceData: getCachedReferenceData,
    seedFromDOM: seedFromDOM,
    populateSelectsFromCache: populateSelectsFromCache
  };

})(window);

