import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import { geoApi } from '../../api/geoTracker'
import AdminLayout from '../../layout/AdminLayout'
import ConfirmModal from '../../shared/components/ConfirmModal'

// Leaflet is loaded via CDN in index.html — accessed as L
// Colors per plant type
const TYPE_CONFIG = {
  tree: { color: '#16a34a', bg: '#dcfce7', label: 'Tree', emoji: 'T' },
  plant: { color: '#7c3aed', bg: '#ede9fe', label: 'Plant', emoji: 'P' },
  creeper: { color: '#0284c7', bg: '#e0f2fe', label: 'Creeper', emoji: 'C' },
}

const CONDITION_COLORS = {
  excellent: '#16a34a',
  good:      '#2563eb',
  fair:      '#ca8a04',
  poor:      '#dc2626',
  dead:      '#6b7280',
}

function buildIcon(type) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.tree
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${cfg.color};border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;
      font-size:13px;cursor:pointer;
    ">${cfg.emoji}</div>`,
  })
}

function StatChip({ label, value, color, bg }) {
  return (
    <div style={{
      background: bg, borderRadius: 10, padding: '10px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 80, border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>{label}</span>
    </div>
  )
}

export default function GeoTrackerPage() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)

  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [varieties, setVarieties] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [filters, setFilters] = useState({
    plant_type: '',
    variety: '',
    zone: '',
    condition: '',
    date_from: '',
    date_to: '',
    submitted_by: '',
  })
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Init Leaflet map once
  useEffect(() => {
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [23.2156, 72.6794], // IITGN default
      zoom: 16,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    markersLayerRef.current = L.layerGroup().addTo(map)
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Fetch dropdown data once
  useEffect(() => {
    Promise.all([geoApi.getVarieties(), geoApi.getZones(), geoApi.getStats()])
      .then(([vRes, zRes, sRes]) => {
        setVarieties(vRes.data)
        setZones(zRes.data)
        setStats(sRes.data)
      })
      .catch(() => {})
  }, [])

  const fetchRecords = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
    geoApi.getRecords(params)
      .then(res => {
        setRecords(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load records.')
        setLoading(false)
      })
  }, [filters])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Re-draw markers when records change
  useEffect(() => {
    const layer = markersLayerRef.current
    const map = mapInstanceRef.current
    if (!L || !layer || !map) return

    layer.clearLayers()
    if (records.length === 0) return

    const bounds = []
    records.forEach(r => {
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lng)
      if (isNaN(lat) || isNaN(lng)) return

      const marker = L.marker([lat, lng], { icon: buildIcon(r.plant_type) })
      const cfg = TYPE_CONFIG[r.plant_type] || TYPE_CONFIG.tree

      marker.bindPopup(`
        <div style="min-width:180px;font-family:-apple-system,sans-serif">
          <div style="font-weight:800;font-size:14px;margin-bottom:4px">
            ${cfg.emoji} ${r.tracking_id || ''} ${r.local_name}
          </div>
          ${r.scientific_name ? `<div style="font-size:11px;font-style:italic;color:#6b7280;margin-bottom:6px">${r.scientific_name}</div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
            <span style="background:${cfg.bg};color:${cfg.color};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${cfg.label}</span>
            ${r.zone ? `<span style="background:#f3f4f6;color:#374151;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${r.zone}</span>` : ''}
            <span style="background:${CONDITION_COLORS[r.condition]}22;color:${CONDITION_COLORS[r.condition]};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${r.condition_display}</span>
          </div>
          <table style="font-size:12px;width:100%;border-collapse:collapse">
            ${r.height_m ? `<tr><td style="color:#6b7280;padding:2px 0">Height</td><td style="font-weight:600;padding:2px 0 2px 8px">${r.height_m} m</td></tr>` : ''}
            ${r.girth_cm ? `<tr><td style="color:#6b7280;padding:2px 0">Girth</td><td style="font-weight:600;padding:2px 0 2px 8px">${r.girth_cm} cm</td></tr>` : ''}
            ${r.canopy_spread_m ? `<tr><td style="color:#6b7280;padding:2px 0">Canopy</td><td style="font-weight:600;padding:2px 0 2px 8px">${r.canopy_spread_m} m</td></tr>` : ''}
            <tr><td style="color:#6b7280;padding:2px 0">By</td><td style="font-weight:600;padding:2px 0 2px 8px">${r.submitted_by}</td></tr>
          </table>
          ${r.photo_url ? `<img src="${r.photo_url}" style="width:100%;border-radius:6px;margin-top:8px;max-height:120px;object-fit:cover">` : ''}
        </div>
      `, { maxWidth: 240 })

      marker.on('click', () => setSelectedRecord(r))
      layer.addLayer(marker)
      bounds.push([lat, lng])
    })

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 }) } catch (_) {}
    }
  }, [records])

  function handleFilterChange(key, val) {
    setFilters(prev => ({
      ...prev,
      [key]: val,
      ...(key === 'plant_type' ? { variety: '' } : {}),
    }))
  }

  function clearFilters() {
    setFilters({ plant_type: '', variety: '', zone: '', condition: '', date_from: '', date_to: '', submitted_by: '' })
  }

  function handleExport() {
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
    geoApi.exportCsv(params)
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    setSuccess(null)
    try {
      await geoApi.deleteRecord(deleteTarget.id)
      setRecords(prev => prev.filter(r => r.id !== deleteTarget.id))
      setSelectedRecord(null)
      setDeleteTarget(null)
      setSuccess(`Deleted ${deleteTarget.tracking_id || deleteTarget.local_name}.`)
      const [zRes, sRes] = await Promise.all([geoApi.getZones(), geoApi.getStats()])
      setZones(zRes.data)
      setStats(sRes.data)
    } catch {
      setError('Failed to delete record. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const filteredVarieties = filters.plant_type
    ? varieties.filter(v => v.plant_type === filters.plant_type)
    : varieties

  const inputStyle = {
    border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px',
    fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', width: '100%',
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  return (
    <AdminLayout>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>

      {/* Header bar */}
      <div style={{
        padding: '14px 20px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>🌿 Plant GeoTracker</h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
            Interactive map of campus trees, plants and creepers
          </p>
        </div>

        {stats && (
          <div style={{ display: 'flex', gap: 8 }}>
            <StatChip label="Total" value={stats.total} color="#374151" bg="#f3f4f6" />
            <StatChip label="Trees" value={stats.trees} color={TYPE_CONFIG.tree.color} bg={TYPE_CONFIG.tree.bg} />
            <StatChip label="Plants" value={stats.plants} color={TYPE_CONFIG.plant.color} bg={TYPE_CONFIG.plant.bg} />
            <StatChip label="Creepers" value={stats.creepers || 0} color={TYPE_CONFIG.creeper.color} bg={TYPE_CONFIG.creeper.bg} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            style={{
              padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: '1.5px solid var(--border)', cursor: 'pointer',
              background: filtersOpen ? 'var(--green-800)' : 'var(--surface)',
              color: filtersOpen ? '#fff' : 'var(--text)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ⚙ Filters {activeFilterCount > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff', borderRadius: 9,
                fontSize: 10, fontWeight: 800, padding: '1px 6px',
              }}>{activeFilterCount}</span>
            )}
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: 'var(--green-800)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div style={{
          padding: '14px 20px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12,
        }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['', 'All'],
              ['tree', TYPE_CONFIG.tree.label],
              ['plant', TYPE_CONFIG.plant.label],
              ['creeper', TYPE_CONFIG.creeper.label],
            ].map(([value, label]) => {
              const cfg = TYPE_CONFIG[value]
              const isActive = filters.plant_type === value
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, plant_type: value, variety: '' }))}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    border: `1.5px solid ${isActive ? (cfg?.color || '#374151') : 'var(--border)'}`,
                    background: isActive ? (cfg?.bg || '#f3f4f6') : 'var(--surface)',
                    color: isActive ? (cfg?.color || '#374151') : 'var(--text-2)',
                    cursor: 'pointer',
                  }}
                >
                  {cfg?.emoji ? `${cfg.emoji} ` : ''}{label}
                </button>
              )
            })}
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={filters.plant_type} onChange={e => handleFilterChange('plant_type', e.target.value)}>
              <option value="">All types</option>
              <option value="tree">🌳 Tree</option>
              <option value="plant">🌿 Plant</option>
              <option value="creeper">C Creeper</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Variety</label>
            <select style={inputStyle} value={filters.variety} onChange={e => handleFilterChange('variety', e.target.value)}>
              <option value="">All varieties</option>
              {filteredVarieties.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.scientific_name ? ` - ${v.scientific_name}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Zone</label>
            <select style={inputStyle} value={filters.zone} onChange={e => handleFilterChange('zone', e.target.value)}>
              <option value="">All zones</option>
              {zones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Condition</label>
            <select style={inputStyle} value={filters.condition} onChange={e => handleFilterChange('condition', e.target.value)}>
              <option value="">Any condition</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="dead">Dead</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>From Date</label>
            <input type="date" style={inputStyle} value={filters.date_from} onChange={e => handleFilterChange('date_from', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>To Date</label>
            <input type="date" style={inputStyle} value={filters.date_to} onChange={e => handleFilterChange('date_to', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Submitted By</label>
            <input type="text" style={inputStyle} placeholder="Name / staff ID" value={filters.submitted_by} onChange={e => handleFilterChange('submitted_by', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={clearFilters}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', cursor: 'pointer', width: '100%',
              }}
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {(success || error) && (
        <div style={{
          padding: '10px 20px',
          background: success ? '#dcfce7' : '#fee2e2',
          borderBottom: `1px solid ${success ? '#86efac' : '#fca5a5'}`,
          color: success ? '#166534' : '#991b1b',
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span>{success || error}</span>
          <button
            type="button"
            onClick={() => { setSuccess(null); setError(null) }}
            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 800 }}
          >
            Close
          </button>
        </div>
      )}

      {/* Map + sidebar layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 500,
            background: 'rgba(255,255,255,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 36, height: 36, border: '3px solid #16a34a',
                borderTopColor: 'transparent', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 10px',
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Loading records…</span>
            </div>
          </div>
        )}

        {/* Leaflet map */}
        <div ref={mapRef} style={{ flex: 1, height: '100%', zIndex: 1 }} />

        {/* Record detail panel */}
        {selectedRecord && (
          <div style={{
            width: 300, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            overflow: 'auto', flexShrink: 0, padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {TYPE_CONFIG[selectedRecord.plant_type]?.emoji} {selectedRecord.local_name}
                </div>
                {selectedRecord.tracking_id && (
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--green-800)', marginTop: 2 }}>
                    {selectedRecord.tracking_id}
                  </div>
                )}
                {selectedRecord.scientific_name && (
                  <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-2)', marginTop: 2 }}>
                    {selectedRecord.scientific_name}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                  color: 'var(--text-2)', padding: 4,
                }}
              >×</button>
            </div>

            {selectedRecord.photo_url && (
              <img
                src={selectedRecord.photo_url}
                alt={selectedRecord.local_name}
                style={{ width: '100%', borderRadius: 10, marginBottom: 14, maxHeight: 180, objectFit: 'cover' }}
              />
            )}

            {[
              ['ID', selectedRecord.tracking_id],
              ['Type', selectedRecord.plant_type_display],
              ['Variety', selectedRecord.variety_name],
              ['Zone', selectedRecord.zone],
              ['Condition', selectedRecord.condition_display],
              ['Height', selectedRecord.height_m ? `${selectedRecord.height_m} m` : null],
              ['Girth', selectedRecord.girth_cm ? `${selectedRecord.girth_cm} cm` : null],
              ['Canopy', selectedRecord.canopy_spread_m ? `${selectedRecord.canopy_spread_m} m` : null],
              ['Location', selectedRecord.location_notes],
              ['Submitted by', selectedRecord.submitted_by],
              ['Date', selectedRecord.submitted_at ? new Date(selectedRecord.submitted_at).toLocaleDateString('en-IN') : null],
              ['Lat / Lng', `${selectedRecord.lat?.toFixed(5)}, ${selectedRecord.lng?.toFixed(5)}`],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, width: 80, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
              </div>
            ) : null)}

            {selectedRecord.notes && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
                  {selectedRecord.notes}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setDeleteTarget(selectedRecord)}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1.5px solid #dc2626',
                background: '#fee2e2',
                color: '#991b1b',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Delete entry
            </button>
          </div>
        )}
      </div>

      {/* Record count footer */}
      <div style={{
        padding: '8px 20px', background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-2)', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span>{records.length} record{records.length !== 1 ? 's' : ''} shown</span>
        {/* Legend */}
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: cfg.color, display: 'inline-block',
            }} />
            {cfg.label}
          </span>
        ))}
        {error && <span style={{ color: '#dc2626', marginLeft: 'auto' }}>{error}</span>}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete plant record?"
        message={`Delete ${deleteTarget?.tracking_id || deleteTarget?.local_name || 'this record'}? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        confirmDisabled={deleting}
        cancelDisabled={deleting}
        onConfirm={handleDeleteRecord}
        onCancel={() => setDeleteTarget(null)}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
    </AdminLayout>
  )
}
