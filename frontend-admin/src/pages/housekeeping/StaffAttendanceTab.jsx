import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Input, Spinner } from '../../components/ui'
import { todayISO, triggerDownload } from '../../shared/utils'

const STATUS_META = {
  present: { label: 'Present', color: '#166534', bg: '#dcfce7' },
  absent: { label: 'Absent', color: '#b91c1c', bg: '#fee2e2' },
  leave: { label: 'Leave', color: '#c2410c', bg: '#ffedd5' },
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

  const totals = useMemo(
    () => rows.reduce((acc, r) => {
      acc.total += 1
      if (r.status === 'present') acc.present += 1
      else if (r.status === 'absent') acc.absent += 1
      else if (r.status === 'leave') acc.leave += 1
      return acc
    }, { total: 0, present: 0, absent: 0, leave: 0 }),
    [rows],
  )

  const tableRows = useMemo(
    () => rows.map((r) => [
      r.staff_name || '-',
      <span
        key={`pc-${r.id}`}
        style={{ fontSize: 13, fontWeight: 700, color: r.staff_pay_code ? 'var(--green-800)' : 'var(--text-3)' }}
      >
        {r.staff_pay_code || '-'}
      </span>,
      Array.isArray(r.staff_areas) && r.staff_areas.length ? r.staff_areas.join(', ') : '-',
      r.staff_role || '-',
      <StatusPill status={r.status} />,
    ]),
    [rows],
  )

  const downloadCsv = () => {
    if (!rows.length) return
    const headers = ['Staff Name', 'Pay Code', 'Area', 'Role', 'Date', 'Status']
    const csvRows = rows.map((r) => [
      r.staff_name || '-',
      r.staff_pay_code || '-',
      Array.isArray(r.staff_areas) && r.staff_areas.length ? r.staff_areas.join('; ') : '-',
      r.staff_role || '-',
      r.date || date,
      r.status || '-',
    ])
    const csvBody = [headers, ...csvRows]
      .map((row) => row.map((cell) => {
        const s = String(cell ?? '')
        return /["\,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
      .join('\n')
    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv' })
    triggerDownload(blob, `staff_attendance_${date}.csv`)
  }

  return (
    <div>
      <Alert message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Staff</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totals.total}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Present</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totals.present}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Absent</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totals.absent}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>On Leave</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totals.leave}</div>
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Date</div>
          <Btn size="sm" variant="secondary" onClick={downloadCsv} disabled={!rows.length}>
              Export CSV
            </Btn>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Card>
      </div>

      <Card noPad>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Staff Name', 'Pay Code', 'Area', 'Role', 'Status']}
            rows={tableRows}
            emptyMsg="No staff attendance records found for this date."
          />
        )}
      </Card>
    </div>
  )
}
