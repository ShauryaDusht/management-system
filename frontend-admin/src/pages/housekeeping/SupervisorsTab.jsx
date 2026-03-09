import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Btn, Card, DataTable, Modal, SelectField, Spinner } from '../../components/ui'

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

function normalizeUsers(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function toDisplayName(user) {
  return user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '-'
}

function toCsvSafe(value, fallback = 'user') {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || fallback
}

function formatDateTime(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleString('en-IN')
}

function formatDate(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleDateString('en-IN')
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function SupervisorReportModal({ open, supervisor, onClose }) {
  const initialDate = useMemo(() => new Date(), [])
  const currentMonth = initialDate.getMonth() + 1
  const currentYear = initialDate.getFullYear()
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [activeSection, setActiveSection] = useState('task')

  const yearOptions = useMemo(
    () => [currentYear, currentYear - 1],
    [currentYear],
  )

  useEffect(() => {
    if (!open || !supervisor?.id) return
    setMonth(currentMonth)
    setYear(currentYear)
    setLoading(false)
    setDownloading(false)
    setError('')
    setReport(null)
    setActiveSection('task')
  }, [open, supervisor?.id, currentMonth, currentYear])

  const loadReport = async () => {
    if (!supervisor?.id) return
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getSupervisorReport(supervisor.id, month, year)
      setReport(data)
    } catch (e) {
      setReport(null)
      setError(e.response?.data?.detail || 'Failed to load supervisor report.')
    } finally {
      setLoading(false)
    }
  }

  const downloadCsv = async () => {
    if (!supervisor?.id) return
    setDownloading(true)
    setError('')
    try {
      const response = await hkAPI.downloadSupervisorReportCSV(supervisor.id, month, year)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeUsername = toCsvSafe(supervisor.username, String(supervisor.id))
      a.href = href
      a.download = `supervisor_${safeUsername}_${String(month).padStart(2, '0')}_${year}.csv`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to download CSV.')
    } finally {
      setDownloading(false)
    }
  }

  const snapshot = report?.snapshot || {}
  const taskOversight = snapshot.task_oversight || {}
  const attendance = snapshot.attendance_management || {}
  const extraWork = snapshot.extra_work || {}
  const reliever = snapshot.reliever_management || {}
  const stock = snapshot.stock_requests || {}
  const dailyRows = snapshot.daily_activity_breakdown || []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${toDisplayName(supervisor)} - Monthly Report`}
      width={1080}
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
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ width: 130 }}>
            <SelectField value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </SelectField>
          </div>
          <div style={{ width: 120 }}>
            <SelectField value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectField>
          </div>
          <Btn onClick={loadReport} disabled={loading || downloading || !supervisor}>
            {loading ? 'Loading...' : 'Load Report'}
          </Btn>
        </div>
        <Btn variant="secondary" onClick={downloadCsv} disabled={loading || downloading || !supervisor}>
          {downloading ? 'Downloading...' : 'Download CSV'}
        </Btn>
      </div>

      {report && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
          }}
        >
          {report.cached
            ? `Cached report from ${formatDateTime(report.generated_at)}`
            : 'Live data'}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <Spinner />
        </div>
      ) : !report ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
          Select month and year, then click Load Report.
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tasks Assigned</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{taskOversight.total_tasks_assigned || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tasks Completed</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{taskOversight.tasks_completed || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Completion Rate %</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatPct(taskOversight.completion_rate_pct)}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Days Submitted</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{attendance.unique_days_submitted || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Submission Rate %</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatPct(attendance.submission_rate_pct)}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Extra Work Logged</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{extraWork.total_extra_tasks_logged || 0}</div>
            </Card>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Btn
              size="sm"
              variant={activeSection === 'task' ? 'primary' : 'secondary'}
              onClick={() => setActiveSection('task')}
            >
              Task Breakdown
            </Btn>
            <Btn
              size="sm"
              variant={activeSection === 'extra' ? 'primary' : 'secondary'}
              onClick={() => setActiveSection('extra')}
            >
              Extra Work
            </Btn>
            <Btn
              size="sm"
              variant={activeSection === 'substitutions' ? 'primary' : 'secondary'}
              onClick={() => setActiveSection('substitutions')}
            >
              Substitutions
            </Btn>
            <Btn
              size="sm"
              variant={activeSection === 'stock' ? 'primary' : 'secondary'}
              onClick={() => setActiveSection('stock')}
            >
              Stock Requests
            </Btn>
          </div>

          {activeSection === 'task' && (
            <Card noPad>
              <DataTable
                headers={['Date', 'Assigned', 'Completed', 'Submissions', 'Extra Work']}
                rows={dailyRows.map((row) => ([
                  formatDate(row.date),
                  row.tasks_assigned || 0,
                  row.tasks_completed || 0,
                  row.attendance_submissions || 0,
                  row.extra_work_logged || 0,
                ]))}
                emptyMsg="No daily activity rows."
              />
            </Card>
          )}

          {activeSection === 'extra' && (
            <Card noPad>
              <DataTable
                headers={['Date', 'Task Name', 'Area', 'Verified']}
                rows={(extraWork.list || []).map((row) => ([
                  formatDate(row.date),
                  row.task_name || '-',
                  row.area_name || '-',
                  row.is_verified ? 'Yes' : 'No',
                ]))}
                emptyMsg="No extra work entries."
              />
            </Card>
          )}

          {activeSection === 'substitutions' && (
            <Card noPad>
              <DataTable
                headers={['Date', 'Original Worker', 'Reliever', 'Area']}
                rows={(reliever.list || []).map((row) => ([
                  formatDate(row.date),
                  row.original_worker_name || '-',
                  row.reliever_name || '-',
                  row.area_name || '-',
                ]))}
                emptyMsg="No substitution entries."
              />
            </Card>
          )}

          {activeSection === 'stock' && (
            <Card noPad>
              <DataTable
                headers={['Item', 'Qty', 'Status', 'Urgent', 'Date']}
                rows={(stock.list || []).map((row) => ([
                  row.item_name || '-',
                  row.quantity || 0,
                  <Badge key={`${row.item_name}-${row.created_at}`} value={row.status || 'pending'} />,
                  row.is_urgent ? 'Yes' : 'No',
                  formatDate(row.created_at),
                ]))}
                emptyMsg="No stock requests."
              />
            </Card>
          )}
        </>
      )}
    </Modal>
  )
}

export default function SupervisorsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [users, setUsers] = useState([])
  const [reportUser, setReportUser] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [{ data: areaData }, { data: caretakersData }, { data: supervisorsData }] =
          await Promise.all([hkAPI.getAreas(), hkAPI.getCaretakers(), hkAPI.getSupervisors()])

        if (!mounted) return

        const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
        const caretakers = normalizeUsers(caretakersData).map((u) => ({ ...u, role: 'caretaker' }))
        const supervisors = normalizeUsers(supervisorsData).map((u) => ({ ...u, role: 'supervisor' }))
        const sortedUsers = [...caretakers, ...supervisors].sort((a, b) => toDisplayName(a).localeCompare(toDisplayName(b)))

        setAreas(areaList)
        setUsers(sortedUsers)
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load supervisor/caretaker list.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const areaMap = useMemo(() => {
    const mapping = {}
    areas.forEach((a) => {
      const ids = a.caretaker_ids || []
      ids.forEach((uid) => {
        if (!mapping[uid]) mapping[uid] = []
        mapping[uid].push(a.name)
      })
    })
    return mapping
  }, [areas])

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Supervisor / Caretaker List
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Role', 'Name', 'Username', 'Phone', 'Assigned Areas', 'Status', 'Report']}
            rows={users.map((u) => {
              const areasForUser = areaMap[u.id] || []
              return [
                <Badge key={`role-${u.id}`} value={u.role} />,
                toDisplayName(u),
                <code key={`user-${u.id}`} style={{ fontSize: 12 }}>{u.username}</code>,
                u.phone || '-',
                areasForUser.length ? areasForUser.join(', ') : '-',
                <span
                  key={`status-${u.id}`}
                  style={{
                    color: u.is_active ? '#16a34a' : '#dc2626',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>,
                <Btn key={`report-${u.id}`} size="sm" variant="secondary" onClick={() => setReportUser(u)}>
                  Report
                </Btn>,
              ]
            })}
            emptyMsg="No supervisor/caretaker users found."
          />
        )}
      </Card>

      <SupervisorReportModal
        open={!!reportUser}
        supervisor={reportUser}
        onClose={() => setReportUser(null)}
      />
    </div>
  )
}
