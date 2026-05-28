import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { inventoryAPI } from '../../api/inventory'
import { usersAPI } from '../../api/users'
import { Alert, Badge, Btn, Card, DataTable, Modal, Spinner } from '../../components/ui'
import { triggerDownload } from '../../shared/utils'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'

const HIDDEN_STAFF_AREA_NAMES = new Set(['hostels reliever', 'old academic reliever', 'new academic reliever'])

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

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function SupervisorReportModal({ open, supervisor, onClose }) {
  const initialDate = useMemo(() => new Date(), [])
  const currentMonth = initialDate.getMonth() + 1
  const currentYear = initialDate.getFullYear()
  const { month, year, setMonth, setYear } = useMonthYear()
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [activeSection, setActiveSection] = useState('task')

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
      const safeUsername = toCsvSafe(supervisor.username, String(supervisor.id))
      triggerDownload(blob, `supervisor_${safeUsername}_${String(month).padStart(2, '0')}_${year}.csv`)
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
          <MonthYearPicker
            month={month}
            year={year}
            onMonthChange={setMonth}
            onYearChange={setYear}
          />
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

function SupervisorInventoryUsageModal({ open, supervisor, onClose }) {
  const initialDate = useMemo(() => new Date(), [])
  const currentMonth = initialDate.getMonth() + 1
  const currentYear = initialDate.getFullYear()
  const { month, year, setMonth, setYear } = useMonthYear()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usageItems, setUsageItems] = useState([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!open || !supervisor?.id) return
    setMonth(currentMonth)
    setYear(currentYear)
    setLoading(false)
    setError('')
    setUsageItems([])
    setHasLoaded(false)
    setExpanded({})
  }, [open, supervisor?.id, currentMonth, currentYear])

  const loadInventoryUsage = async () => {
    if (!supervisor?.id) return
    setLoading(true)
    setError('')

    try {
      const { data } = await inventoryAPI.getUserUsageLogs(supervisor.id, month, year)
      setUsageItems(Array.isArray(data?.items) ? data.items : [])
      setHasLoaded(true)
      setExpanded({})
    } catch (e) {
      setUsageItems([])
      setHasLoaded(true)
      setError(e.response?.data?.detail || 'Failed to load supervisor inventory usage report.')
    } finally {
      setLoading(false)
    }
  }

  const downloadCsv = () => {
    if (!usageItems.length) return
    const rows = []
    rows.push(['Report Title', 'Supervisor Inventory Usage Report'])
    rows.push(['Supervisor', toDisplayName(supervisor)])
    rows.push(['Pay Code', supervisor.pay_code || '-'])
    rows.push(['Period', `${String(month).padStart(2, '0')}/${year}`])
    rows.push([])
    rows.push(['Item', 'Issued', 'Used', 'Remaining'])
    usageItems.forEach((item) => {
      rows.push([
        item.item_name || '',
        `${item.issued_quantity || 0} ${item.unit || ''}`,
        `${item.total_used || 0} ${item.unit || ''} used`,
        `${item.remaining || 0} ${item.unit || ''}`,
      ])
      if (item.logs?.length) {
        rows.push(['  Date', 'Qty Used', 'Purpose', ''])
        item.logs.forEach((log) => {
          rows.push([
            formatDate(log.date),
            `${log.quantity_used || 0} ${item.unit || ''}`,
            log.purpose || '',
            '',
          ])
        })
      }
      rows.push([])
    })

    const csvBody = rows.map((row) => row.map((cell) => toCsvValue(cell)).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv' })
    const safeUsername = toCsvSafe(supervisor?.username, String(supervisor?.id || 'supervisor'))
    triggerDownload(blob, `supervisor_inventory_usage_${safeUsername}_${String(month).padStart(2, '0')}_${year}.csv`)
  }

  const toggleExpanded = (issueId) => {
    setExpanded((prev) => ({
      ...prev,
      [issueId]: !prev[issueId],
    }))
  }

  const rows = []
  usageItems.forEach((item) => {
    const isOpen = !!expanded[item.issue_id]
    rows.push([
      <div key={`item-${item.issue_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => toggleExpanded(item.issue_id)}
          style={{ padding: '4px 8px' }}
        >
          {isOpen ? 'Hide' : 'View'}
        </Btn>
        <span>{item.item_name || '-'}</span>
      </div>,
      `${item.issued_quantity || 0} ${item.unit || ''}`,
      `${item.total_used || 0} ${item.unit || ''} used`,
      `${item.remaining || 0} ${item.unit || ''}`,
    ])
    if (isOpen) {
      rows.push([
        <div key={`logs-${item.issue_id}`} style={{ padding: '6px 0' }}>
          {item.logs && item.logs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {item.logs.map((log, idx) => (
                <div key={`${item.issue_id}-${idx}`} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {formatDate(log.date)} • <strong>{log.quantity_used}</strong> • {log.purpose || '-'}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No usage logs.</div>
          )}
        </div>,
        '',
        '',
      ])
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${toDisplayName(supervisor)} - Inventory Usage Report`}
      width={960}
      footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}
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
          <MonthYearPicker
            month={month}
            year={year}
            onMonthChange={setMonth}
            onYearChange={setYear}
          />
          <Btn onClick={loadInventoryUsage} disabled={loading || !supervisor}>
            {loading ? 'Loading...' : 'Load Usage'}
          </Btn>
        </div>
        <Btn variant="secondary" onClick={downloadCsv} disabled={loading || !usageItems.length}>
          Download CSV
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <Spinner />
        </div>
      ) : !hasLoaded ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
          Select month and year, then click Load Usage.
        </div>
      ) : usageItems.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
          No inventory usage found for this supervisor in the selected month.
        </div>
      ) : (
        <>
          <Card noPad>
            <DataTable
              headers={['Item', 'Issued', 'Used', 'Remaining']}
              rows={rows}
              emptyMsg="No issued inventory items."
            />
          </Card>
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
  const [inventoryReportUser, setInventoryReportUser] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [{ data: areaData }, { data: caretakersData }, { data: supervisorsData }] =
          await Promise.all([
            hkAPI.getAreas(),
            usersAPI.getByRole('caretaker'),
            usersAPI.getByRole('supervisor'),
          ])

        if (!mounted) return

        const areaList = (Array.isArray(areaData) ? areaData : areaData?.results || [])
          .filter((a) => !HIDDEN_STAFF_AREA_NAMES.has(String(a.name || '').toLowerCase()))
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
            headers={['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas', 'Status', 'Report']}
            rows={users.map((u) => {
              const areasForUser = areaMap[u.id] || []
              return [
                <Badge key={`role-${u.id}`} value={u.role} />,
                toDisplayName(u),
                <span key={`pc-${u.id}`} style={{ fontSize: 13, fontWeight: 700, color: u.pay_code ? 'var(--green-800)' : 'var(--text-3)' }}>
                  {u.pay_code || '-'}
                </span>,
                u.email || '-',
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
                <div key={`report-actions-${u.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="secondary" onClick={() => setReportUser(u)}>
                    HK Report
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setInventoryReportUser(u)}>
                    Inventory Usage
                  </Btn>
                </div>,
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

      <SupervisorInventoryUsageModal
        open={!!inventoryReportUser}
        supervisor={inventoryReportUser}
        onClose={() => setInventoryReportUser(null)}
      />
    </div>
  )
}
