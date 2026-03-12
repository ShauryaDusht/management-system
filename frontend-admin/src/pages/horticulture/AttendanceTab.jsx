import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Card, DataTable, Input, Spinner, StatCard } from '../../components/ui'
import { todayISO } from '../../shared/utils'

export default function AttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workers, setWorkers] = useState([])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.getSummary()
      const list = Array.isArray(data?.workers) ? data.workers : []
      setWorkers(list)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load horticulture attendance data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [date])

  const summary = useMemo(
    () =>
      workers.reduce(
        (acc, w) => {
          const st = String(w.status || '').toLowerCase()
          if (st === 'present' || st === 'late') acc.present += 1
          else if (st) acc.absent += 1
          acc.total += 1
          return acc
        },
        { total: 0, present: 0, absent: 0 }
      ),
    [workers]
  )

  return (
    <div>
      <Alert type="warn" message="Worker attendance sync for horticulture is under development." />
      <Alert message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Workers" value={summary.total} icon="WK" color="#1d4ed8" />
        <StatCard label="Present" value={summary.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={summary.absent} icon="AB" color="#dc2626" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Card>
      </div>

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Worker Attendance
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Worker', 'Zone', 'Status']}
            rows={workers.map((w) => [w.name || '-', w.zone || '-', (w.status || 'pending').toUpperCase()])}
            emptyMsg="No worker attendance records available yet."
          />
        )}
      </Card>
    </div>
  )
}
