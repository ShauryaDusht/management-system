import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { inventoryAPI } from '../../api/inventory'
import { usersAPI } from '../../api/users'
import { Alert, Badge, Btn, Card, DataTable, ExportDropdown, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import { getAreaGroup, triggerDownload } from '../../shared/utils'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'

const HIDDEN_STAFF_AREA_NAMES = new Set(['hostels reliever', 'old academic reliever', 'new academic reliever'])

const AREA_GROUP_LABELS = {
  hostels: 'Hostels',
  academic: 'Academic Blocks',
  others: 'Others',
  all: 'All',
}

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
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

  const getSupervisorExportData = async (format) => {
    if (!supervisor?.id) throw new Error('Supervisor report not available.')
    if (format === 'csv') {
      const response = await hkAPI.downloadSupervisorReportCSV(supervisor.id, month, year)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const safeUsername = toCsvSafe(supervisor.username, String(supervisor.id))
      triggerDownload(blob, `supervisor_${safeUsername}_${String(month).padStart(2, '0')}_${year}.csv`)
      return null
    }

    let headers = ['Date', 'Tasks Assigned', 'Tasks Completed', 'Attendance Submissions', 'Extra Work Logged']
    let rows = dailyRows.map((row) => [
      formatDate(row.date),
      row.tasks_assigned || 0,
      row.tasks_completed || 0,
      row.attendance_submissions || 0,
      row.extra_work_logged || 0,
    ])
    let titleSuffix = 'Daily Activity'
    if (activeSection === 'extra') {
      titleSuffix = 'Extra Work'
      headers = ['Date', 'Task Name', 'Area', 'Verified']
      rows = (extraWork.list || []).map((row) => [
        formatDate(row.date),
        row.task_name || '-',
        row.area_name || '-',
        row.is_verified ? 'Yes' : 'No',
      ])
    } else if (activeSection === 'stock') {
      titleSuffix = 'Stock Requests'
      headers = ['Item', 'Qty', 'Status', 'Urgent', 'Date']
      rows = (stock.list || []).map((row) => [
        row.item_name || '-',
        row.quantity || 0,
        row.status || 'pending',
        row.is_urgent ? 'Yes' : 'No',
        formatDate(row.created_at),
      ])
    }
    const safeUsername = toCsvSafe(supervisor.username, String(supervisor.id))
    return {
      title: `${toDisplayName(supervisor)} - ${titleSuffix} (${String(month).padStart(2, '0')}/${year})`,
      filename: `supervisor_${safeUsername}_${titleSuffix.toLowerCase().replace(/\s+/g, '_')}_${String(month).padStart(2, '0')}_${year}`,
      headers,
      rows,
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
        <ExportDropdown
          getData={getSupervisorExportData}
          disabled={loading || downloading || !supervisor}
          buttonText="Download Report"
          align="right"
        />
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
  const [usageUser, setUsageUser] = useState(null)
  const [usageItems, setUsageItems] = useState([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!open || !supervisor?.id) return
    setMonth(currentMonth)
    setYear(currentYear)
    setLoading(false)
    setError('')
    setUsageUser(null)
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
      setUsageUser(data?.user || null)
      setUsageItems(Array.isArray(data?.items) ? data.items : [])
      setHasLoaded(true)
      setExpanded({})
    } catch (e) {
      setUsageUser(null)
      setUsageItems([])
      setHasLoaded(true)
      setError(e.response?.data?.detail || 'Failed to load supervisor inventory usage report.')
    } finally {
      setLoading(false)
    }
  }

  const getInventoryUsageExportData = () => {
    if (!usageItems.length) throw new Error('No usage data available.')
    const safeUsername = toCsvSafe(supervisor?.username, String(supervisor?.id || 'supervisor'))
    const filename = `supervisor_inventory_usage_${safeUsername}_${String(month).padStart(2, '0')}_${year}`
    const headers = ['Item', 'Issued Qty', 'Total Used', 'Remaining', 'Usage Logs']
    const exportRows = usageItems.map((item) => {
      const logsStr = (item.logs || [])
        .map((log) => `${formatDate(log.date)}: ${log.quantity_used || 0} ${item.unit || ''} (${log.purpose || 'No purpose'})`)
        .join('; ')
      return [
        item.item_name || '-',
        `${item.issued_quantity || 0} ${item.unit || ''}`,
        `${item.total_used || 0} ${item.unit || ''}`,
        `${item.remaining || 0} ${item.unit || ''}`,
        logsStr || 'No logs',
      ]
    })
    return {
      title: `${toDisplayName(supervisor)} - Inventory Usage Report (${String(month).padStart(2, '0')}/${year})`,
      filename,
      headers,
      rows: exportRows,
    }
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
        <ExportDropdown
          getData={getInventoryUsageExportData}
          disabled={loading || !usageItems.length}
          buttonText="Download Report"
          align="right"
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <Spinner />
        </div>
      ) : !hasLoaded ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
          Select month and year, then click Load Usage.
        </div>
      ) : (
        <>
          {usageUser && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface-2)',
                fontSize: 12,
                color: 'var(--text-2)',
              }}
            >
              <strong>{usageUser.name || toDisplayName(supervisor)}</strong>
              {usageUser.area_names?.length ? ` | ${usageUser.area_names.join(', ')}` : ''}
            </div>
          )}
          {usageItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
              No inventory usage found for this supervisor in the selected month.
            </div>
          ) : (
          <Card noPad>
            <DataTable
              headers={['Item', 'Issued', 'Used', 'Remaining']}
              rows={rows}
              emptyMsg="No issued inventory items."
            />
          </Card>
          )}
        </>
      )}
    </Modal>
  )
}

function SupervisorSwitchModal({ open, supervisor, users, assignedAreas = [], onClose, onDone }) {
  const [switchType, setSwitchType] = useState('one_day')
  const [targetStaff, setTargetStaff] = useState('')
  const [date, setDate] = useState(todayIsoDate())
  const [durationDays, setDurationDays] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSwitchType('one_day')
    setTargetStaff('')
    setDate(todayIsoDate())
    setDurationDays('1')
    setSaving(false)
    setError('')
  }, [open, supervisor?.id])

  const targetOptions = useMemo(() => {
    return users.filter((u) => u.id !== supervisor?.id && u.is_active !== false)
  }, [supervisor?.id, users])

  const submit = async () => {
    if (!supervisor?.id) return
    setSaving(true)
    setError('')
    try {
      const isTemporary = switchType !== 'permanent'
      const payload = {
        mode: isTemporary ? 'temporary' : 'permanent',
        target_staff: targetStaff,
      }
      if (isTemporary) {
        payload.date = date
        payload.duration_days = switchType === 'one_day' ? 1 : durationDays
      }
      await hkAPI.switchSupervisor(supervisor.id, payload)
      onDone()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to switch supervisor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={`Switch All Areas - ${toDisplayName(supervisor)}`}
      width={540}
      footer={(
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving || !targetStaff || (switchType !== 'permanent' && (!date || !durationDays))}>
            {saving ? 'Switching...' : 'Apply Switch'}
          </Btn>
        </>
      )}
    >
      <Alert message={error} />
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 10 }}>
        This will apply to all areas currently assigned to this supervisor/caretaker.
        <div style={{ marginTop: 4, fontWeight: 700 }}>
          Areas: {assignedAreas.length ? assignedAreas.join(', ') : '-'}
        </div>
      </div>
      <Field label="Duration" required>
        <SelectField value={switchType} onChange={(e) => setSwitchType(e.target.value)}>
          <option value="one_day">1 day</option>
          <option value="custom">Custom days</option>
          <option value="permanent">Permanent</option>
        </SelectField>
      </Field>
      <Field label="Target Supervisor / Caretaker" required>
        <SelectField value={targetStaff} onChange={(e) => setTargetStaff(e.target.value)}>
          <option value="">Select staff</option>
          {targetOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {toDisplayName(u)} ({u.role})
            </option>
          ))}
        </SelectField>
      </Field>
      {switchType !== 'permanent' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', gap: 10 }}>
          <Field label="Start Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Days" required>
            <Input
              type="number"
              min="1"
              max="60"
              value={switchType === 'one_day' ? '1' : durationDays}
              disabled={switchType === 'one_day'}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {switchType !== 'permanent'
          ? 'Temporary switch gives the target staff access to all assigned areas for the selected number of days.'
          : 'Permanent switch moves all assigned areas to the target staff and updates active workers in those areas.'}
      </div>
    </Modal>
  )
}

export default function SupervisorsTab({ hostelOnly = false }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areas, setAreas] = useState([])
  const [users, setUsers] = useState([])
  const [areaClassFilter, setAreaClassFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [reportUser, setReportUser] = useState(null)
  const [inventoryReportUser, setInventoryReportUser] = useState(null)
  const [switchUser, setSwitchUser] = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    pay_code: '',
    is_active: true,
    area_ids: [],
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const loadData = async (mounted = true) => {
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
      const scopedUserIds = new Set(areaList.flatMap((area) => area.caretaker_ids || []))
      const staffList = hostelOnly
        ? [...caretakers, ...supervisors].filter((u) => scopedUserIds.has(u.id))
        : [...caretakers, ...supervisors]
      const sortedUsers = staffList.sort((a, b) => toDisplayName(a).localeCompare(toDisplayName(b)))

      setAreas(areaList)
      setUsers(sortedUsers)
    } catch (e) {
      if (!mounted) return
      setError(e.response?.data?.detail || 'Failed to load supervisor/caretaker list.')
    } finally {
      if (mounted) setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    loadData(mounted)
    return () => {
      mounted = false
    }
  }, [])

  const handleSwitchDone = async () => {
    setSwitchUser(null)
    setSuccess('Supervisor/caretaker change applied.')
    await loadData(true)
  }

  const openEditUser = (user) => {
    setEditUser(user)
    setEditError('')
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      pay_code: user.pay_code || '',
      is_active: user.is_active !== false,
      area_ids: user.assigned_area_ids || [],
    })
  }

  const toggleEditArea = (areaId) => {
    setEditForm((prev) => {
      const exists = prev.area_ids.some((id) => String(id) === String(areaId))
      return {
        ...prev,
        area_ids: exists
          ? prev.area_ids.filter((id) => String(id) !== String(areaId))
          : [...prev.area_ids, areaId],
      }
    })
  }

  const submitEditUser = async () => {
    if (!editUser?.id) return
    setEditSaving(true)
    setEditError('')
    setSuccess('')
    try {
      await usersAPI.update(editUser.id, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone: editForm.phone,
        pay_code: editForm.pay_code,
        is_active: editForm.is_active,
        area_ids: editForm.area_ids,
      })
      setEditUser(null)
      setSuccess('Staff details updated.')
      await loadData(true)
    } catch (e) {
      setEditError(e.response?.data?.detail || 'Failed to update staff details.')
    } finally {
      setEditSaving(false)
    }
  }

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

  const areaDetailsByUser = useMemo(() => {
    const mapping = {}
    areas.forEach((area) => {
      const ids = area.caretaker_ids || []
      ids.forEach((uid) => {
        if (!mapping[uid]) mapping[uid] = []
        mapping[uid].push(area)
      })
    })
    return mapping
  }, [areas])

  const areaOptions = useMemo(() => {
    const filtered = areaClassFilter === 'all'
      ? areas
      : areas.filter((area) => getAreaGroup(area.name, area.area_type) === areaClassFilter)

    return [...filtered].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }, [areaClassFilter, areas])

  const visibleUsers = useMemo(() => {
    return users.filter((user) => {
      const assignedAreas = areaDetailsByUser[user.id] || []
      if (areaFilter !== 'all') {
        return assignedAreas.some((area) => String(area.id) === String(areaFilter))
      }
      if (areaClassFilter !== 'all') {
        return assignedAreas.some((area) => getAreaGroup(area.name, area.area_type) === areaClassFilter)
      }
      return true
    })
  }, [areaClassFilter, areaDetailsByUser, areaFilter, users])

  const selectAreaClass = (value) => {
    setAreaClassFilter(value)
    setAreaFilter('all')
  }

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Supervisor / Caretaker List</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Showing {visibleUsers.length} of {users.length}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!hostelOnly && (
              <>
                <Btn
                  size="sm"
                  variant={areaClassFilter === 'hostels' ? 'primary' : 'secondary'}
                  onClick={() => selectAreaClass('hostels')}
                >
                  Hostels
                </Btn>
                <Btn
                  size="sm"
                  variant={areaClassFilter === 'academic' ? 'primary' : 'secondary'}
                  onClick={() => selectAreaClass('academic')}
                >
                  Academic Blocks
                </Btn>
                <Btn
                  size="sm"
                  variant={areaClassFilter === 'others' ? 'primary' : 'secondary'}
                  onClick={() => selectAreaClass('others')}
                >
                  Others
                </Btn>
                <Btn
                  size="sm"
                  variant={areaClassFilter === 'all' ? 'primary' : 'secondary'}
                  onClick={() => selectAreaClass('all')}
                >
                  All
                </Btn>
              </>
            )}
            <SelectField
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              style={{ width: 220, minHeight: 34, padding: '6px 10px' }}
            >
              <option value="all">{hostelOnly ? 'All hostel areas' : `${AREA_GROUP_LABELS[areaClassFilter]} Areas`}</option>
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </SelectField>
            <ExportDropdown
              headers={['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas']}
              data={visibleUsers.map((u) => {
                const areasForUser = areaMap[u.id] || []
                return [
                  u.role || '-',
                  toDisplayName(u),
                  u.pay_code || '-',
                  u.email || '-',
                  u.username || '-',
                  u.phone || '-',
                  areasForUser.length ? areasForUser.join(', ') : '-',
                ]
              })}
              title="Housekeeping Supervisors & Staff List"
              filename="housekeeping_supervisors_list"
              disabled={loading || !visibleUsers.length}
              buttonText="Download Report"
              align="right"
            />
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas', 'Actions', 'Report']}
            rows={visibleUsers.map((u) => {
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
                <div key={`actions-${u.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="secondary" onClick={() => setSwitchUser(u)}>
                    Switch All Areas
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => openEditUser(u)}>
                    Edit
                  </Btn>
                </div>,
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
            emptyMsg="No supervisor/caretaker users found for this filter."
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

      <SupervisorSwitchModal
        open={!!switchUser}
        supervisor={switchUser}
        users={users}
        assignedAreas={switchUser ? areaMap[switchUser.id] || [] : []}
        onClose={() => setSwitchUser(null)}
        onDone={handleSwitchDone}
      />

      <Modal
        open={!!editUser}
        onClose={editSaving ? undefined : () => setEditUser(null)}
        title={`Edit ${toDisplayName(editUser)}`}
        width={680}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setEditUser(null)} disabled={editSaving}>Cancel</Btn>
            <Btn onClick={submitEditUser} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save'}
            </Btn>
          </>
        )}
      >
        <Alert message={editError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="First Name">
            <Input value={editForm.first_name} onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))} />
          </Field>
          <Field label="Last Name">
            <Input value={editForm.last_name} onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
          </Field>
          <Field label="Pay Code">
            <Input value={editForm.pay_code} onChange={(e) => setEditForm((p) => ({ ...p, pay_code: e.target.value }))} />
          </Field>
          <Field label="Status">
            <SelectField
              value={editForm.is_active ? 'active' : 'inactive'}
              onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.value === 'active' }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Areas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, maxHeight: 220, overflow: 'auto' }}>
            {areas.map((area) => (
              <label key={area.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={editForm.area_ids.some((id) => String(id) === String(area.id))}
                  onChange={() => toggleEditArea(area.id)}
                />
                <span>{area.name}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
