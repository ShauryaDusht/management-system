import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Card, DataTable, Modal, SelectField, Spinner } from '../../components/ui'
import { getErrorMessage } from '../../shared/utils'
import { humanizeStatus } from './helpers'

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

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-IN')
}

export default function WorkerReportModal({ open, worker, onClose }) {
  const monthOptions = useMemo(() => makeMonthOptions(), [])
  const [selectedValue, setSelectedValue] = useState(monthOptions[0]?.value || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  const selectedPeriod = useMemo(
    () => monthOptions.find((month) => month.value === selectedValue) || monthOptions[0],
    [monthOptions, selectedValue]
  )

  useEffect(() => {
    if (!open || !worker?.id || !selectedPeriod) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getWorkerReport(worker.id, selectedPeriod.month, selectedPeriod.year)
        if (mounted) setReport(data)
      } catch (err) {
        if (mounted) {
          setError(getErrorMessage(err, 'Failed to load worker report.'))
          setReport(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [open, selectedPeriod, worker?.id])

  useEffect(() => {
    if (!open) return
    setSelectedValue(monthOptions[0]?.value || '')
    setReport(null)
    setError('')
  }, [monthOptions, open, worker?.id])

  return (
    <Modal open={open} onClose={onClose} title={worker?.name || 'Worker Report'} width={860}>
      <Alert message={error} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Select Month</div>
        <SelectField value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} style={{ width: 240 }}>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
      </div>

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Attendance %</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{Number(report.attendance_pct || 0).toFixed(2)}%</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Present</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{report.days_present || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Absent</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{report.days_absent || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Half Day</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{report.half_days || 0}</div>
            </Card>
          </div>
          <Card noPad>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Day-by-Day Breakdown
            </div>
            <DataTable
              headers={['Date', 'Status', 'Supervisor']}
              rows={(report.daily_breakdown || []).map((row) => [
                formatDate(row.date),
                humanizeStatus(row.status),
                row.supervisor_name || '-',
              ])}
              emptyMsg="No attendance data for this month."
            />
          </Card>
        </>
      )}
    </Modal>
  )
}
