import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Card, DataTable, Input, Spinner } from '../../components/ui'

function todayISO() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}

const STATUS_META = {
  present: { label: 'Present', color: '#166534', bg: '#dcfce7' },
  absent: { label: 'Absent', color: '#b91c1c', bg: '#fee2e2' },
  leave: { label: 'Leave', color: '#c2410c', bg: '#ffedd5' },
}

function formatSource(value) {
  if (!value) return '-'
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status || '-', color: '#0f172a', bg: '#e2e8f0' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
      }}
    >
      {meta.label}
    </span>
  )
}

export default function StaffAttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (selectedDate) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getStaffAttendance(selectedDate)
      const list = Array.isArray(data) ? data : data?.results || []
      setRows(list)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load staff attendance.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(date)
  }, [date])

  const tableRows = useMemo(
    () => rows.map((r) => [
      r.staff_name || '-',
      r.date || '-',
      <StatusPill status={r.status} />,
      formatSource(r.source),
      r.note || '-',
    ]),
    [rows],
  )

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Staff Attendance</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      <Card noPad>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Staff Name', 'Date', 'Status', 'Source', 'Note']}
            rows={tableRows}
            emptyMsg="No staff attendance records found for this date."
          />
        )}
      </Card>
    </div>
  )
}
