import { useCallback, useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Input, SelectField, Spinner } from '../../components/ui'
import { triggerDownload } from '../../shared/utils'
import ConfirmModal from '../../shared/components/ConfirmModal'

const todayStr = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const API_ORIGIN = (() => {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
    return new URL(apiUrl, window.location.origin).origin
  } catch {
    return 'http://localhost:8000'
  }
})()

function list(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

function fmt(v) {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function saveBlob(blob, name) {
  triggerDownload(blob, name)
}

function fmtBytes(bytes) {
  const size = Number(bytes || 0)
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function normalizeMediaUrl(raw) {
  if (!raw) return ''
  try {
    const baseOrigin = raw.startsWith('/media/') || raw.startsWith('/static/')
      ? API_ORIGIN
      : window.location.origin
    const parsed = new URL(raw, baseOrigin)
    const internal = ['backend', 'web', 'app', 'django', 'server']
    const mediaPath = parsed.pathname.startsWith('/media/') || parsed.pathname.startsWith('/static/')
    const missingPublicPort = ['localhost', '127.0.0.1'].includes(parsed.hostname) && !parsed.port
    if ((internal.includes(parsed.hostname) || (mediaPath && missingPublicPort)) && mediaPath) {
      const publicApp = new URL(window.location.origin)
      parsed.protocol = publicApp.protocol
      parsed.hostname = publicApp.hostname
      parsed.port = publicApp.port
    }
    return parsed.toString()
  } catch {
    return raw
  }
}

const PHOTO_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='220'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EPhoto unavailable%3C/text%3E%3C/svg%3E"

function handlePhotoError(e) {
  const el = e.currentTarget
  if (el.dataset.fallbackApplied === '1') return
  el.dataset.fallbackApplied = '1'
  el.src = PHOTO_PLACEHOLDER
}

function PhotoTile({ src, label, height, onClick }) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <img
        src={src}
        alt={label}
        loading="lazy"
        onError={handlePhotoError}
        onClick={onClick}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default' }}
      />
      <span style={{ position: 'absolute', left: 6, top: 6, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 10, borderRadius: 6, padding: '2px 6px', letterSpacing: 0.2 }}>
        {label}
      </span>
    </div>
  )
}

function BeforeAfterBlock({ beforeUrl, afterUrl, height, layout = 'split', onBeforeClick, onAfterClick }) {
  if (!beforeUrl) {
    return <PhotoTile src={afterUrl} label="After" height={height} onClick={onAfterClick} />
  }
  if (layout === 'stack') {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <PhotoTile src={beforeUrl} label="Before" height={height} onClick={onBeforeClick} />
        <PhotoTile src={afterUrl} label="After" height={height} onClick={onAfterClick} />
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      <PhotoTile src={beforeUrl} label="Before" height={height} onClick={onBeforeClick} />
      <PhotoTile src={afterUrl} label="After" height={height} onClick={onAfterClick} />
    </div>
  )
}

export default function GalleryTab() {
  const [view, setView] = useState('area')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState({
    area: '',
    taskId: '',
    staffId: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  })
  const [stats, setStats] = useState({
    totalPhotos: 0,
    thisWeekPhotos: 0,
    areasWithPhotos: 0,
    totalAreas: 0,
    avgPhotosPerTask: 0,
    storageOriginalBytes: 0,
    storageUsedBytes: 0,
    storageSavedBytes: 0,
    storageSavedPercent: 0,
  })
  const [grouped, setGrouped] = useState([])
  const [photos, setPhotos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [box, setBox] = useState({ open: false, photos: [], index: 0, loading: false, view: 'after' })

  const resolveView = useCallback((photo, preferred = 'after') => {
    if (!photo?.beforeUrl) return 'after'
    return preferred === 'before' ? 'before' : 'after'
  }, [])

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p[k] = v
    })
    return p
  }, [filters])

  const loadAll = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const [s, g, p] = await Promise.all([
        hkAPI.getGalleryStats(params),
        hkAPI.getGalleryGroupedByArea(params),
        hkAPI.getGallery({ ...params, page: nextPage, limit: 50, sort }),
      ])
      setStats({
        totalPhotos: Number(s.data?.totalPhotos || 0),
        thisWeekPhotos: Number(s.data?.thisWeekPhotos || 0),
        areasWithPhotos: Number(s.data?.areasWithPhotos || 0),
        totalAreas: Number(s.data?.totalAreas || 0),
        avgPhotosPerTask: Number(s.data?.avgPhotosPerTask || 0),
        storageOriginalBytes: Number(s.data?.storageOriginalBytes || 0),
        storageUsedBytes: Number(s.data?.storageUsedBytes || 0),
        storageSavedBytes: Number(s.data?.storageSavedBytes || 0),
        storageSavedPercent: Number(s.data?.storageSavedPercent || 0),
      })
      const groupedIncoming = list(g.data).map((area) => ({
        ...area,
        tasks: list(area.tasks).map((task) => ({
          ...task,
          recentPhotos: list(task.recentPhotos).map((photo) => ({
            ...photo,
            beforeUrl: normalizeMediaUrl(photo.beforeUrl),
            beforeThumbnailUrl: normalizeMediaUrl(photo.beforeThumbnailUrl || photo.beforeUrl),
            url: normalizeMediaUrl(photo.url),
            thumbnailUrl: normalizeMediaUrl(photo.thumbnailUrl || photo.url),
          })),
        })),
      }))
      setGrouped(groupedIncoming)
      const incoming = list(p.data?.photos).map((photo) => ({
        ...photo,
        beforeUrl: normalizeMediaUrl(photo.beforeUrl),
        beforeThumbnailUrl: normalizeMediaUrl(photo.beforeThumbnailUrl || photo.beforeUrl),
        url: normalizeMediaUrl(photo.url),
        thumbnailUrl: normalizeMediaUrl(photo.thumbnailUrl || photo.url),
      }))
      setPhotos((prev) => (append ? [...prev, ...incoming] : incoming))
      setPage(Number(p.data?.page || nextPage))
      setTotal(Number(p.data?.total || 0))
      setHasMore(Boolean(p.data?.hasMore))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load gallery.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [params, sort])

  useEffect(() => {
    loadAll(1, false)
  }, [loadAll])

  const areaOptions = useMemo(() => {
    const m = new Map()
    grouped.forEach((a) => m.set(String(a.areaId), a.areaName))
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [grouped])

  const taskOptions = useMemo(() => {
    const m = new Map()
    grouped.forEach((a) => list(a.tasks).forEach((t) => m.set(String(t.taskId), t.taskName)))
    photos.forEach((p) => { if (p.taskId != null) m.set(String(p.taskId), p.taskName) })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [grouped, photos])

  const staffOptions = useMemo(() => {
    const m = new Map()
    photos.forEach((p) => { if (p.staffId != null) m.set(String(p.staffId), p.staffName) })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [photos])

  const openLightbox = async (photo, preferredView = 'after') => {
    if (!photo) return
    const initialView = resolveView(photo, preferredView)
    setBox({ open: true, photos: [photo], index: 0, loading: true, view: initialView })
    try {
      const { data } = await hkAPI.getGalleryTaskPhotos(photo.taskId, params)
      const arr = list(data?.photos).map((p) => ({
        ...p,
        beforeUrl: normalizeMediaUrl(p.beforeUrl),
        beforeThumbnailUrl: normalizeMediaUrl(p.beforeThumbnailUrl || p.beforeUrl),
        url: normalizeMediaUrl(p.url),
        thumbnailUrl: normalizeMediaUrl(p.thumbnailUrl || p.url),
      }))
      const idx = Math.max(0, arr.findIndex((p) => Number(p.id) === Number(photo.id)))
      const selected = arr.length ? arr[idx] : photo
      const view = resolveView(selected, preferredView)
      setBox({ open: true, photos: arr.length ? arr : [photo], index: arr.length ? idx : 0, loading: false, view })
    } catch {
      const view = resolveView(photo, preferredView)
      setBox({ open: true, photos: [photo], index: 0, loading: false, view })
    }
  }

  const moveBox = useCallback((delta) => {
    setBox((prev) => {
      if (!prev.photos.length) return prev
      const idx = (prev.index + delta + prev.photos.length) % prev.photos.length
      const next = prev.photos[idx]
      const view = resolveView(next, prev.view)
      return { ...prev, index: idx, view }
    })
  }, [resolveView])

  const current = box.photos[box.index]
  const currentView = resolveView(current, box.view)
  const currentUrl = currentView === 'before' ? (current?.beforeUrl || current?.url) : current?.url

  useEffect(() => {
    if (!box.open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setBox({ open: false, photos: [], index: 0, loading: false, view: 'after' })
      if (e.key === 'ArrowLeft') moveBox(-1)
      if (e.key === 'ArrowRight') moveBox(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [box.open, moveBox])

  const exportCsv = async () => {
    try {
      const { data } = await hkAPI.exportGalleryCsv(params)
      saveBlob(data, 'housekeeping_gallery_export.csv')
      setSuccess('Gallery log exported.')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to export CSV.')
    }
  }

  const downloadTaskZip = async (taskId, taskName) => {
    try {
      const { data } = await hkAPI.downloadTaskPhotosZip(taskId)
      const safe = String(taskName || 'task').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()
      saveBlob(data, `${safe || 'task'}_photos.zip`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to download ZIP.')
    }
  }

  const toggleFlag = async (photo) => {
    try {
      await hkAPI.flagGalleryPhoto(photo.id, { flagged: !photo.flagged })
      await loadAll(1, false)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update flag.')
    }
  }

  const doDelete = async () => {
    if (!deleteTarget?.id) return
    try {
      await hkAPI.deleteGalleryPhoto(deleteTarget.id)
      setDeleteTarget(null)
      setSuccess('Photo deleted.')
      await loadAll(1, false)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to delete photo.')
    }
  }

  const listRows = photos.map((p) => [
    <div style={{ width: 80 }}>
      <BeforeAfterBlock
        beforeUrl={p.beforeThumbnailUrl}
        afterUrl={p.thumbnailUrl || p.url}
        height={36}
        layout="stack"
        onBeforeClick={() => openLightbox(p, 'before')}
        onAfterClick={() => openLightbox(p, 'after')}
      />
    </div>,
    p.areaName || '-',
    p.taskName || '-',
    p.staffName || '-',
    fmt(p.capturedAt),
    <div style={{ display: 'flex', gap: 6 }}>
      <Btn size="sm" variant="ghost" onClick={() => openLightbox(p)}>View</Btn>
      <Btn size="sm" variant={p.flagged ? 'orange' : 'secondary'} onClick={() => toggleFlag(p)}>{p.flagged ? 'Unflag' : 'Flag'}</Btn>
      <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(p)}>Delete</Btn>
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
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Visual log of all task completions across areas</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{total.toLocaleString()} photos</span>
            <Input value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} placeholder="Search area, task, staff..." style={{ width: 250 }} />
            <Btn variant="secondary" onClick={exportCsv}>Export Photo Log</Btn>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 12 }}>
        <Card><div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Photos</div><div style={{ fontSize: 23, fontWeight: 800 }}>{stats.totalPhotos}</div></Card>
        <Card><div style={{ fontSize: 12, color: 'var(--text-3)' }}>This Week</div><div style={{ fontSize: 23, fontWeight: 800 }}>{stats.thisWeekPhotos}</div></Card>
        <Card><div style={{ fontSize: 12, color: 'var(--text-3)' }}>Areas with Coverage</div><div style={{ fontSize: 23, fontWeight: 800 }}>{stats.areasWithPhotos} / {stats.totalAreas}</div></Card>
        <Card><div style={{ fontSize: 12, color: 'var(--text-3)' }}>Avg Photos per Task</div><div style={{ fontSize: 23, fontWeight: 800 }}>{stats.avgPhotosPerTask}</div></Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Storage Saved</div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>{stats.storageSavedPercent}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {fmtBytes(stats.storageSavedBytes)} saved
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
            {fmtBytes(stats.storageUsedBytes)} used / {fmtBytes(stats.storageOriginalBytes)} original
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <SelectField value={filters.area} onChange={(e) => setFilters((p) => ({ ...p, area: e.target.value }))}>
            <option value="">All Areas</option>
            {areaOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <SelectField value={filters.taskId} onChange={(e) => setFilters((p) => ({ ...p, taskId: e.target.value }))}>
            <option value="">All Tasks</option>
            {taskOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <SelectField value={filters.staffId} onChange={(e) => setFilters((p) => ({ ...p, staffId: e.target.value }))}>
            <option value="">All Staff</option>
            {staffOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <SelectField value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="area_az">Area A-Z</option>
            <option value="most_photos">Most Photos</option>
          </SelectField>
          <Input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || todayStr()}
            onChange={(e) => {
              const val = e.target.value
              setFilters((p) => (
                p.dateTo && val > p.dateTo
                  ? { ...p, dateFrom: val, dateTo: val }
                  : { ...p, dateFrom: val }
              ))
            }}
          />
          <Input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            max={todayStr()}
            onChange={(e) => {
              const val = e.target.value
              setFilters((p) => (
                p.dateFrom && val < p.dateFrom
                  ? { ...p, dateFrom: val, dateTo: val }
                  : { ...p, dateTo: val }
              ))
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <Btn size="sm" variant={view === 'area' ? 'primary' : 'secondary'} onClick={() => setView('area')}>Area View</Btn>
          <Btn size="sm" variant={view === 'grid' ? 'primary' : 'secondary'} onClick={() => setView('grid')}>Grid</Btn>
          <Btn size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>List</Btn>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
      ) : view === 'area' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {grouped.length === 0 ? <Card><div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>No photos found.</div></Card> : null}
          {grouped.map((area) => (
            <Card key={area.areaId} noPad>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                {area.areaIcon || '[Area]'} {area.areaName} ({area.totalPhotos} photos)
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gap: 12 }}>
                {list(area.tasks).map((task) => (
                  <div key={task.taskId} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Task: {task.taskName}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{task.photoCount} photos</span>
                        <Btn size="sm" variant="ghost" onClick={() => { setFilters((p) => ({ ...p, taskId: String(task.taskId) })); setView('grid') }}>View All</Btn>
                        <Btn size="sm" variant="secondary" onClick={() => downloadTaskZip(task.taskId, task.taskName)}>ZIP</Btn>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 8 }}>
                      {list(task.recentPhotos).map((p) => (
                        <BeforeAfterBlock
                          key={p.id}
                          beforeUrl={p.beforeThumbnailUrl}
                          afterUrl={p.thumbnailUrl || p.url}
                          height={96}
                          layout="split"
                          onBeforeClick={() => openLightbox(p, 'before')}
                          onAfterClick={() => openLightbox(p, 'after')}
                        />
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
          {photos.map((p) => (
            <Card key={p.id} noPad>
              <div style={{ position: 'relative' }}>
                <BeforeAfterBlock
                  beforeUrl={p.beforeThumbnailUrl}
                  afterUrl={p.thumbnailUrl || p.url}
                  height={145}
                  layout="split"
                  onBeforeClick={() => openLightbox(p, 'before')}
                  onAfterClick={() => openLightbox(p, 'after')}
                />
                <span style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 10, borderRadius: 8, padding: '2px 6px' }}>
                  {(p.format || 'img').toUpperCase()} · {fmtBytes(p.fileSize)}
                </span>
              </div>
              <div style={{ padding: '10px 11px', fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>Task: {p.taskName}</div>
                <div>Area: {p.areaName}</div>
                <div>Staff: {p.staffName}</div>
                <div style={{ color: 'var(--text-3)', marginTop: 3 }}>Time: {fmt(p.capturedAt)}</div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card noPad>
          <DataTable headers={['Thumbnail', 'Area', 'Task Name', 'Staff Name', 'Captured At', 'Actions']} rows={listRows} emptyMsg="No photos found." />
        </Card>
      )}

      {(view === 'grid' || view === 'list') && hasMore ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <Btn variant="secondary" onClick={() => loadAll(page + 1, true)} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </Btn>
        </div>
      ) : null}

      {box.open ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.86)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={(e) => { if (e.target === e.currentTarget) setBox({ open: false, photos: [], index: 0, loading: false, view: 'after' }) }}
          onTouchStart={(e) => { e.currentTarget.dataset.touchStartX = String(e.changedTouches?.[0]?.clientX || 0) }}
          onTouchEnd={(e) => {
            const start = Number(e.currentTarget.dataset.touchStartX || 0)
            const end = Number(e.changedTouches?.[0]?.clientX || 0)
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
                {current ? <Btn size="sm" variant="secondary" onClick={() => window.open(normalizeMediaUrl(currentUrl), '_blank')}>Download</Btn> : null}
                <Btn size="sm" variant="danger" onClick={() => setBox({ open: false, photos: [], index: 0, loading: false, view: 'after' })}>Close</Btn>
              </div>
            </div>
            {current?.beforeUrl ? (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 6 }}>
                <Btn size="sm" variant={currentView === 'before' ? 'primary' : 'secondary'} onClick={() => setBox((prev) => ({ ...prev, view: 'before' }))}>Before</Btn>
                <Btn size="sm" variant={currentView === 'after' ? 'primary' : 'secondary'} onClick={() => setBox((prev) => ({ ...prev, view: 'after' }))}>After</Btn>
              </div>
            ) : null}
            <div style={{ minHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {box.loading ? (
                <Spinner />
              ) : current ? (
                <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '72vh' }}>
                  <img
                    src={currentUrl}
                    alt={current.taskName}
                    onError={handlePhotoError}
                    style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
                  />
                  {current?.beforeUrl ? (
                    <span style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 11, borderRadius: 6, padding: '3px 7px', letterSpacing: 0.2 }}>
                      {currentView === 'before' ? 'Before' : 'After'}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div style={{ padding: '8px 10px', color: '#dbeafe', fontSize: 12 }}>
              Photo {box.photos.length ? box.index + 1 : 0} of {box.photos.length} | {current ? `${current.taskName} | ${current.areaName} | ${fmt(current.capturedAt)}` : ''}
              {current ? ` | Original: ${fmtBytes(current.originalSize)} | Stored: ${fmtBytes(current.savedSize || current.fileSize)} | Saved: ${current.compressionRatio || 0}%` : ''}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Photo"
        message="Delete this photo? This cannot be undone."
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
