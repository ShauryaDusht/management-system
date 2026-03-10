import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Modal, SelectField, Spinner } from '../../components/ui'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function makeMonthOptions() {
  const out = []
  const now = new Date()
  for (let i = 0; i <= 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return out
}

function formatPct(value) {
  const n = Number(value || 0)
  return `${n.toFixed(2)}%`
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-IN')
}

function toLabel(value) {
  if (!value || value === 'unmarked') return '-'
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function toSafeName(name, fallback) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || fallback
}

export default function WorkerReportModal({ open, worker, onClose }) {
  const monthOptions = useMemo(() => makeMonthOptions(), [])
  const [selectedValue, setSelectedValue] = useState(monthOptions[0]?.value || '')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  const selectedPeriod = useMemo(
    () => monthOptions.find((m) => m.value === selectedValue) || monthOptions[0],
    [monthOptions, selectedValue],
  )

  const now = new Date()
  const isCurrentMonth =
    selectedPeriod &&
    selectedPeriod.month === now.getMonth() + 1 &&
    selectedPeriod.year === now.getFullYear()

  useEffect(() => {
    if (!open) return
    setSelectedValue(monthOptions[0]?.value || '')
    setReport(null)
    setError('')
  }, [monthOptions, open, worker?.id])

  useEffect(() => {
    if (!open || !worker?.id || !selectedPeriod) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await hkAPI.getWorkerReport(worker.id, selectedPeriod.month, selectedPeriod.year)
        if (!cancelled) setReport(data)
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.detail || 'Failed to load worker report.')
          setReport(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, worker?.id, selectedPeriod])

  const onDownloadCSV = async () => {
    if (!worker?.id || !selectedPeriod) return
    setDownloading(true)
    setError('')
    try {
      const response = await hkAPI.downloadWorkerReportCSV(worker.id, selectedPeriod.month, selectedPeriod.year)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `worker_${toSafeName(worker.name, worker.id)}_${String(selectedPeriod.month).padStart(2, '0')}_${selectedPeriod.year}.csv`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(href), 150)
    } catch (e) {
      setError(e.response?.data?.detail || 'CSV download failed.')
    } finally {
      setDownloading(false)
    }
  }

  const snap = report?.snapshot || {}
  const attendance = snap.attendance || {}
  const tasks = snap.tasks || {}

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={worker?.name || 'Worker Report'}
      width={980}
      footer={(
        <Btn variant="ghost" onClick={onClose} disabled={loading || downloading}>Close</Btn>
      )}
    >
      <Alert message={error} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110 }}>Select Month</div>
          <SelectField
            value={selectedValue}
            onChange={(e) => setSelectedValue(e.target.value)}
            style={{ width: 240 }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectField>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Area: <strong>{snap?.worker?.area_name || worker?.area_name || '-'}</strong>
          </div>
        </div>
        <Btn size="sm" onClick={onDownloadCSV} disabled={loading || downloading || !worker}>
          {downloading ? 'Downloading...' : 'Download CSV'}
        </Btn>
      </div>

      {isCurrentMonth && (
        <div style={{ marginBottom: 10, fontSize: 12, color: '#92400e' }}>
          Live data - report will be cached at month end.
        </div>
      )}
      {report?.cached && report?.generated_at && (
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-3)' }}>
          Cached on {new Date(report.generated_at).toLocaleString('en-IN')}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner />
        </div>
      ) : !report ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
          Report not available.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Attendance %</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatPct(snap.attendance_pct)}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Days Present / Absent</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {attendance.days_present || 0} / {attendance.days_absent || 0}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tasks Completed</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {tasks.total_completed || 0} / {tasks.total_assigned || 0}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Completion %</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatPct(tasks.completion_pct)}</div>
            </Card>
          </div>

          <Card noPad>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Day-by-Day Breakdown
            </div>
            <DataTable
              headers={['Date', 'First Half', 'Second Half', 'Tasks Assigned', 'Tasks Completed', 'Extra Work']}
              rows={(snap.daily_breakdown || []).map((row) => ([
                formatDate(row.date),
                toLabel(row.attendance_first_half),
                toLabel(row.attendance_second_half),
                row.tasks_assigned || 0,
                row.tasks_completed || 0,
                row.extra_work || 0,
              ]))}
              emptyMsg="No daily data for this month."
            />
          </Card>
        </>
      )}
    </Modal>
  )
}
