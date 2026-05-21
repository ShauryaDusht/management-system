import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, Input, SelectField, Spinner, StatCard } from '../../components/ui'
import { asList, getErrorMessage, todayISO, triggerDownload } from '../../shared/utils'

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

export default function GalleryTab() {
  const [date, setDate] = useState(todayISO())
  const [areaFilter, setAreaFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [areas, setAreas] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [assignmentRes, areaRes] = await Promise.all([
          horticultureAPI.listDailyAssignments({ date }),
          horticultureAPI.getAreas(),
        ])
        if (!mounted) return
        setRows(asList(assignmentRes.data))
        setAreas(asList(areaRes.data))
      } catch (err) {
        if (mounted) setError(getErrorMessage(err, 'Failed to load horticulture gallery.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [date])

  const visibleRows = useMemo(
    () => (areaFilter === 'all' ? rows : rows.filter((row) => String(row.area) === String(areaFilter))),
    [areaFilter, rows]
  )
  const photoRows = useMemo(() => visibleRows.filter((row) => row.photo_url), [visibleRows])

  const exportPhotoLog = () => {
    const rowsForCsv = [
      ['Date', 'Session', 'Worker', 'Area', 'Task', 'Photo URL', 'Uploaded At'],
      ...visibleRows.map((row) => [
        row.date || '',
        row.session || '',
        row.worker_name || '',
        row.area_name || '',
        row.task_type_name || '',
        row.photo_url || '',
        row.photo_uploaded_at ? new Date(row.photo_uploaded_at).toLocaleString('en-IN') : '',
      ]),
    ]
    const csv = rowsForCsv.map((row) => row.map((cell) => csvValue(cell)).join(',')).join('\n')
    triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `horticulture_gallery_${date}.csv`)
  }

  const downloadPhoto = async (row) => {
    if (!row?.photo_url) return
    try {
      const response = await fetch(row.photo_url, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch photo.')
      const blob = await response.blob()
      const extension = blob.type?.split('/')?.[1] || 'jpg'
      triggerDownload(
        blob,
        `horticulture_${safeName(row.area_name, 'area')}_${safeName(row.task_type_name, 'task')}_${row.date || date}.${extension}`
      )
    } catch (err) {
      window.open(row.photo_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div>
      <Alert message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Assignments" value={loading ? '...' : visibleRows.length} icon="AS" color="#166534" />
        <StatCard label="Photos" value={loading ? '...' : photoRows.length} icon="PH" color="#1d4ed8" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Date</div>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Area</div>
          <SelectField value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
            <option value="all">All</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </SelectField>
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Btn size="sm" variant="secondary" onClick={exportPhotoLog} disabled={loading || !visibleRows.length}>
            Export Photo Log
          </Btn>
        </Card>
      </div>

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Task Photo Gallery
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Date', 'Session', 'Worker', 'Area', 'Task', 'Photo', 'Uploaded At']}
            rows={visibleRows.map((row) => [
              row.date,
              row.session,
              row.worker_name || '-',
              row.area_name || '-',
              row.task_type_name || '-',
              row.photo_url ? (
                <div key={`photo-${row.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(row.photo_url, '_blank', 'noopener,noreferrer')}
                  >
                    View
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => downloadPhoto(row)}>
                    Download
                  </Btn>
                </div>
              ) : '-',
              row.photo_uploaded_at ? new Date(row.photo_uploaded_at).toLocaleString('en-IN') : '-',
            ])}
            emptyMsg="No horticulture task photos or assignments found for this date."
          />
        )}
      </Card>
    </div>
  )
}
