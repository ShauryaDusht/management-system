import { useCallback, useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, Input, SelectField, Spinner, StatCard } from '../../components/ui'
import { normalizeMediaUrl } from '../../shared/media'
import { asList, getErrorMessage, todayISO, triggerDownload } from '../../shared/utils'

const PHOTO_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='220'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EPhoto unavailable%3C/text%3E%3C/svg%3E"

function handlePhotoError(event) {
  const img = event.currentTarget
  if (img.dataset.fallbackApplied === '1') return
  img.dataset.fallbackApplied = '1'
  img.src = PHOTO_PLACEHOLDER
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`
  return str
}

function safeName(value, fallback = 'photo') {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return text || fallback
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN')
}

function PhotoTile({ row, height = 150, onClick }) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <img
        src={row.photo_url}
        alt={`${row.task_type_name || 'Task'} - ${row.area_name || 'Area'}`}
        loading="lazy"
        onClick={onClick}
        onError={handlePhotoError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid var(--border)',
          cursor: onClick ? 'pointer' : 'default',
          background: '#f3f4f6',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 7,
          top: 7,
          background: 'rgba(15,23,42,.74)',
          color: '#fff',
          fontSize: 10,
          borderRadius: 6,
          padding: '2px 6px',
        }}
      >
        {row.session || 'task'}
      </span>
    </div>
  )
}

export default function GalleryTab() {
  const [view, setView] = useState('area')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState({
    area: '',
    worker: '',
    task: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rows, setRows] = useState([])
  const [areas, setAreas] = useState([])
  const [box, setBox] = useState({ open: false, index: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [assignmentRes, areaRes] = await Promise.all([
        horticultureAPI.listDailyAssignments(),
        horticultureAPI.getAreas(),
      ])
      setRows(
        asList(assignmentRes.data).flatMap((row) => {
          const beforeUrl = normalizeMediaUrl(row.photo_before_url)
          const afterUrl = normalizeMediaUrl(row.photo_after_url || row.photo_url)
          return [
            beforeUrl ? { ...row, photo_url: beforeUrl, photo_type: 'before', photo_key: `${row.id}-before`, photo_uploaded_at: row.photo_before_uploaded_at || row.started_at } : null,
            afterUrl ? { ...row, photo_url: afterUrl, photo_type: 'after', photo_key: `${row.id}-after`, photo_uploaded_at: row.photo_after_uploaded_at || row.photo_uploaded_at || row.completed_at } : null,
          ].filter(Boolean)
        })
      )
      setAreas(asList(areaRes.data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture gallery.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const photoRows = useMemo(() => rows.filter((row) => row.photo_url), [rows])

  const workerOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      if (row.worker) map.set(String(row.worker), row.worker_name || `Worker #${row.worker}`)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const taskOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      if (row.task_type) map.set(String(row.task_type), row.task_type_name || `Task #${row.task_type}`)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filteredPhotos = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    const list = photoRows.filter((row) => {
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      if (filters.dateFrom && row.date < filters.dateFrom) return false
      if (filters.dateTo && row.date > filters.dateTo) return false
      if (!query) return true
      return [
        row.area_name,
        row.worker_name,
        row.task_type_name,
        row.session,
        row.note,
        row.assigned_by_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    return [...list].sort((a, b) => {
      if (sort === 'oldest') return String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
      if (sort === 'area_az') return String(a.area_name || '').localeCompare(String(b.area_name || ''))
      if (sort === 'worker_az') return String(a.worker_name || '').localeCompare(String(b.worker_name || ''))
      return String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id)
    })
  }, [filters, photoRows, sort])

  const groupedByArea = useMemo(() => {
    const map = new Map()
    filteredPhotos.forEach((row) => {
      const key = String(row.area || 'unknown')
      if (!map.has(key)) {
        map.set(key, {
          areaId: key,
          areaName: row.area_name || 'Unknown Area',
          rows: [],
          tasks: new Map(),
        })
      }
      const group = map.get(key)
      group.rows.push(row)
      const taskKey = String(row.task_type || 'task')
      if (!group.tasks.has(taskKey)) {
        group.tasks.set(taskKey, {
          taskId: taskKey,
          taskName: row.task_type_name || 'Task',
          rows: [],
        })
      }
      group.tasks.get(taskKey).rows.push(row)
    })
    return Array.from(map.values()).map((group) => ({
      ...group,
      tasks: Array.from(group.tasks.values()),
    }))
  }, [filteredPhotos])

  const stats = useMemo(() => {
    const areasWithPhotos = new Set(photoRows.map((row) => row.area).filter(Boolean)).size
    const thisWeekCutoff = new Date()
    thisWeekCutoff.setDate(thisWeekCutoff.getDate() - 7)
    const thisWeek = photoRows.filter((row) => {
      const date = new Date(row.date)
      return !Number.isNaN(date.getTime()) && date >= thisWeekCutoff
    }).length
    return {
      totalPhotos: photoRows.length,
      visiblePhotos: filteredPhotos.length,
      thisWeek,
      areasWithPhotos,
      totalAreas: areas.length,
    }
  }, [areas.length, filteredPhotos.length, photoRows])

  const openLightbox = (row) => {
    const index = filteredPhotos.findIndex((photo) => photo.photo_key === row.photo_key)
    setBox({ open: true, index: Math.max(0, index) })
  }

  const moveBox = useCallback((delta) => {
    setBox((prev) => {
      if (!filteredPhotos.length) return prev
      const index = (prev.index + delta + filteredPhotos.length) % filteredPhotos.length
      return { ...prev, index }
    })
  }, [filteredPhotos.length])

  useEffect(() => {
    if (!box.open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setBox({ open: false, index: 0 })
      if (event.key === 'ArrowLeft') moveBox(-1)
      if (event.key === 'ArrowRight') moveBox(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [box.open, moveBox])

  const exportPhotoLog = () => {
    const rowsForCsv = [
      ['Date', 'Type', 'Session', 'Worker', 'Area', 'Task', 'Assigned By', 'Photo URL', 'Uploaded At', 'Note'],
      ...filteredPhotos.map((row) => [
        row.date || '',
        row.photo_type || 'after',
        row.session || '',
        row.worker_name || '',
        row.area_name || '',
        row.task_type_name || '',
        row.assigned_by_name || '',
        row.photo_url || '',
        row.photo_uploaded_at ? new Date(row.photo_uploaded_at).toLocaleString('en-IN') : '',
        row.note || '',
      ]),
    ]
    const csv = rowsForCsv.map((row) => row.map((cell) => csvValue(cell)).join(',')).join('\n')
    triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `horticulture_gallery_${todayISO()}.csv`)
    setSuccess('Horticulture gallery log exported.')
  }

  const downloadPhoto = async (row) => {
    if (!row?.id) return
    try {
      const response = row.photo_type === 'before'
        ? await fetch(row.photo_url)
        : await horticultureAPI.downloadDailyAssignmentPhoto(row.id)
      const blob = row.photo_type === 'before' ? await response.blob() : response.data
      const extension = blob.type?.split('/')?.[1] || 'jpg'
      triggerDownload(
        blob,
    `horticulture_${safeName(row.photo_type, 'photo')}_${safeName(row.area_name, 'area')}_${safeName(row.task_type_name, 'task')}_${row.date || 'photo'}.${extension}`
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Photo download failed.'))
    }
  }

  const current = filteredPhotos[box.index]
  const listRows = filteredPhotos.map((row) => [
    <div key={`thumb-${row.photo_key}`} style={{ width: 86 }}>
      <PhotoTile row={row} height={48} onClick={() => openLightbox(row)} />
    </div>,
    row.area_name || '-',
    <span key={`type-${row.photo_key}`} style={{ textTransform: 'capitalize' }}>{row.photo_type || 'after'}</span>,
    row.task_type_name || '-',
    row.worker_name || '-',
    formatDateTime(row.photo_uploaded_at || row.assigned_at),
    <div key={`actions-${row.photo_key}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Btn size="sm" variant="ghost" onClick={() => openLightbox(row)}>View</Btn>
      <Btn size="sm" variant="secondary" onClick={() => downloadPhoto(row)}>Download</Btn>
    </div>,
  ])

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Task Photo Gallery</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Before and after horticulture task photos uploaded by staff</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{stats.visiblePhotos.toLocaleString()} photos</span>
            <Input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search area, task, worker..."
              style={{ width: 250 }}
            />
            <Btn variant="secondary" onClick={exportPhotoLog} disabled={!filteredPhotos.length}>Export Photo Log</Btn>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Photos" value={loading ? '...' : stats.totalPhotos} icon="PH" color="#1d4ed8" />
        <StatCard label="Visible Photos" value={loading ? '...' : stats.visiblePhotos} icon="VI" color="#166534" />
        <StatCard label="This Week" value={loading ? '...' : stats.thisWeek} icon="WK" color="#7c3aed" />
        <StatCard label="Areas with Photos" value={loading ? '...' : `${stats.areasWithPhotos} / ${stats.totalAreas}`} icon="AR" color="#c2410c" />
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <SelectField value={filters.area} onChange={(event) => setFilters((prev) => ({ ...prev, area: event.target.value }))}>
            <option value="">All Areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </SelectField>
          <SelectField value={filters.task} onChange={(event) => setFilters((prev) => ({ ...prev, task: event.target.value }))}>
            <option value="">All Tasks</option>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>{task.name}</option>
            ))}
          </SelectField>
          <SelectField value={filters.worker} onChange={(event) => setFilters((prev) => ({ ...prev, worker: event.target.value }))}>
            <option value="">All Workers</option>
            {workerOptions.map((worker) => (
              <option key={worker.id} value={worker.id}>{worker.name}</option>
            ))}
          </SelectField>
          <SelectField value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="area_az">Area A-Z</option>
            <option value="worker_az">Worker A-Z</option>
          </SelectField>
          <Input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || todayISO()}
            onChange={(event) => {
              const value = event.target.value
              setFilters((prev) => (
                prev.dateTo && value > prev.dateTo
                  ? { ...prev, dateFrom: value, dateTo: value }
                  : { ...prev, dateFrom: value }
              ))
            }}
          />
          <Input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            max={todayISO()}
            onChange={(event) => {
              const value = event.target.value
              setFilters((prev) => (
                prev.dateFrom && value < prev.dateFrom
                  ? { ...prev, dateFrom: value, dateTo: value }
                  : { ...prev, dateTo: value }
              ))
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Btn size="sm" variant={view === 'area' ? 'primary' : 'secondary'} onClick={() => setView('area')}>Area View</Btn>
          <Btn size="sm" variant={view === 'grid' ? 'primary' : 'secondary'} onClick={() => setView('grid')}>Grid</Btn>
          <Btn size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>List</Btn>
          <Btn size="sm" variant="ghost" onClick={load} disabled={loading}>Refresh</Btn>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
      ) : filteredPhotos.length === 0 ? (
        <Card>
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>
            No horticulture task photos found for these filters.
          </div>
        </Card>
      ) : view === 'area' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {groupedByArea.map((area) => (
            <Card key={area.areaId} noPad>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                {area.areaName} ({area.rows.length} photos)
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gap: 12 }}>
                {area.tasks.map((task) => (
                  <div key={task.taskId} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Task: {task.taskName}</div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{task.rows.length} photos</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 8 }}>
                      {task.rows.slice(0, 8).map((row) => (
                        <PhotoTile key={row.photo_key} row={row} height={105} onClick={() => openLightbox(row)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {filteredPhotos.map((row) => (
            <Card key={row.photo_key} noPad>
              <PhotoTile row={row} height={155} onClick={() => openLightbox(row)} />
              <div style={{ padding: '10px 11px', fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>Task: {row.task_type_name || '-'}</div>
                <div>Area: {row.area_name || '-'}</div>
                <div>Worker: {row.worker_name || '-'}</div>
                <div style={{ color: 'var(--text-3)', marginTop: 3 }}>Uploaded: {formatDateTime(row.photo_uploaded_at || row.assigned_at)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="ghost" onClick={() => openLightbox(row)}>View</Btn>
                  <Btn size="sm" variant="secondary" onClick={() => downloadPhoto(row)}>Download</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card noPad>
          <DataTable
            headers={['Thumbnail', 'Area', 'Type', 'Task Name', 'Worker', 'Uploaded At', 'Actions']}
            rows={listRows}
            emptyMsg="No horticulture task photos found."
          />
        </Card>
      )}

      {box.open ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.86)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={(event) => { if (event.target === event.currentTarget) setBox({ open: false, index: 0 }) }}
          onTouchStart={(event) => { event.currentTarget.dataset.touchStartX = String(event.changedTouches?.[0]?.clientX || 0) }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.touchStartX || 0)
            const end = Number(event.changedTouches?.[0]?.clientX || 0)
            const diff = end - start
            if (Math.abs(diff) > 45) moveBox(diff < 0 ? 1 : -1)
          }}
        >
          <div style={{ width: 'min(1100px,100%)', background: '#0b1220', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="secondary" onClick={() => moveBox(-1)}>Prev</Btn>
                <Btn size="sm" variant="secondary" onClick={() => moveBox(1)}>Next</Btn>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {current ? <Btn size="sm" variant="secondary" onClick={() => downloadPhoto(current)}>Download</Btn> : null}
                <Btn size="sm" variant="danger" onClick={() => setBox({ open: false, index: 0 })}>Close</Btn>
              </div>
            </div>
            <div style={{ minHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {current ? (
                <img
                  src={current.photo_url}
                  alt={current.task_type_name || 'Horticulture task'}
                  onError={handlePhotoError}
                  style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
                />
              ) : null}
            </div>
            <div style={{ padding: '8px 10px', color: '#dbeafe', fontSize: 12 }}>
              Photo {filteredPhotos.length ? box.index + 1 : 0} of {filteredPhotos.length}
              {current ? ` | ${(current.photo_type || 'after').toUpperCase()} | ${current.task_type_name || '-'} | ${current.area_name || '-'} | ${formatDate(current.date)}` : ''}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
