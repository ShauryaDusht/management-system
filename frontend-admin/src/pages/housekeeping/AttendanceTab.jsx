import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Card, DataTable, Input, Spinner, StatCard } from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'

function todayISO() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}

export default function AttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (selectedDate) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getAttendanceSummary(selectedDate)
      setRows(Array.isArray(data) ? data : data?.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load attendance summary.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(date)
  }, [date])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          present: acc.present + (r.present || 0),
          absent: acc.absent + (r.absent || 0),
          total: acc.total + (r.total_workers || 0),
        }),
        { present: 0, absent: 0, total: 0 }
      ),
    [rows]
  )

  return (
    <div>
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <StatCard label="Total Workers" value={totals.total} icon="WK" color="#1d4ed8" />
        <StatCard label="Present" value={totals.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={totals.absent} icon="AB" color="#dc2626" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            Worker Attendance by Area
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <Spinner />
            </div>
          ) : (
            <DataTable
              headers={['Area', 'Present', 'Absent', 'Total', 'Attendance %']}
              rows={rows.map((r) => {
                const pct = r.total_workers ? Math.round((r.present / r.total_workers) * 100) : 0
                return [r.area_name, r.present, r.absent, r.total_workers, `${pct}%`]
              })}
              emptyMsg="No attendance entries found for the selected date."
            />
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Attendance Trend (Area-wise)</div>
          <BarGroupChart
            data={rows.map((r) => ({
              name: r.area_name.length > 10 ? `${r.area_name.slice(0, 10)}...` : r.area_name,
              present: r.present || 0,
              absent: r.absent || 0,
            }))}
            bars={[
              { key: 'present', label: 'Present' },
              { key: 'absent', label: 'Absent' },
            ]}
            height={260}
          />
        </Card>
      </div>
    </div>
  )
}
