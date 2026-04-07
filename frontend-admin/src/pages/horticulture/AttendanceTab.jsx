import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Badge, Btn, Card, DataTable, Input, Spinner, StatCard } from '../../components/ui'
import { asList, getErrorMessage, todayISO } from '../../shared/utils'
import { formatDateTime, humanizeStatus } from './helpers'

export default function AttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getAttendance(date)
        if (!mounted) return
        setRows(asList(data?.supervisors))
        setExpanded({})
      } catch (err) {
        if (!mounted) return
        setError(getErrorMessage(err, 'Failed to load horticulture attendance.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [date])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          submitted: acc.submitted + (row.submitted ? 1 : 0),
          present: acc.present + Number(row.present_count || 0),
          absent: acc.absent + Number(row.absent_count || 0),
          halfDay: acc.halfDay + Number(row.half_day_count || 0),
        }),
        { submitted: 0, present: 0, absent: 0, halfDay: 0 }
      ),
    [rows]
  )

  const toggleExpanded = (supervisorId) => {
    setExpanded((current) => ({
      ...current,
      [supervisorId]: !current[supervisorId],
    }))
  }

  return (
    <div>
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <StatCard label="Submitted" value={loading ? '...' : `${totals.submitted}/${rows.length}`} icon="SB" color="#1d4ed8" />
        <StatCard label="Present" value={loading ? '...' : totals.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={loading ? '...' : totals.absent} icon="AB" color="#dc2626" />
        <StatCard label="Half Day" value={loading ? '...' : totals.halfDay} icon="HD" color="#d97706" />
      </div>

      <Card style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700 }}>Attendance Date</div>
        <div style={{ minWidth: 180 }}>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </Card>

      {loading ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No horticulture supervisors found.</div>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.supervisor_id} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{row.supervisor_name}</div>
                  <Badge value={row.submitted ? 'approved' : 'pending'} style={row.submitted ? undefined : { background: '#fee2e2', color: '#991b1b' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  {asList(row.zone_names).join(', ') || 'No zone assigned'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  {row.submitted ? `Submitted at ${formatDateTime(row.submitted_at)}` : 'Attendance not submitted yet'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>P {row.present_count}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>A {row.absent_count}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>H {row.half_day_count}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Team {row.total_workers}</span>
                <Btn size="sm" variant="secondary" onClick={() => toggleExpanded(row.supervisor_id)}>
                  {expanded[row.supervisor_id] ? 'Hide Workers' : 'View Workers'}
                </Btn>
              </div>
            </div>

            {expanded[row.supervisor_id] ? (
              <div style={{ marginTop: 14 }}>
                <DataTable
                  headers={['Worker', 'Pay Code', 'Status']}
                  rows={asList(row.workers).map((worker) => [
                    worker.worker_name,
                    worker.pay_code || '-',
                    <span
                      key={`${row.supervisor_id}-${worker.worker_id}`}
                      style={{
                        display: 'inline-block',
                        padding: '3px 9px',
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        background:
                          worker.status === 'present'
                            ? '#d1fae5'
                            : worker.status === 'absent'
                              ? '#fee2e2'
                              : worker.status === 'half_day'
                                ? '#fef3c7'
                                : '#f3f4f6',
                        color:
                          worker.status === 'present'
                            ? '#065f46'
                            : worker.status === 'absent'
                              ? '#991b1b'
                              : worker.status === 'half_day'
                                ? '#92400e'
                                : '#4b5563',
                      }}
                    >
                      {humanizeStatus(worker.status)}
                    </span>,
                  ])}
                  emptyMsg="No workers found for this supervisor."
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  )
}
