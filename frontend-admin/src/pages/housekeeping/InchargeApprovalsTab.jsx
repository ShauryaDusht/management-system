import { useCallback, useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Btn, Card, DataTable, Modal, SelectField, Spinner } from '../../components/ui'
import { useNotifications } from '../../context/NotificationContext'

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

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN')
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN')
}

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadBlob(data, filename) {
  const href = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(href), 150)
}

function InchargeReportModal({ open, onClose }) {
  const initialDate = useMemo(() => new Date(), [])
  const currentMonth = initialDate.getMonth() + 1
  const currentYear = initialDate.getFullYear()
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  const yearOptions = useMemo(
    () => [currentYear, currentYear - 1],
    [currentYear],
  )

  useEffect(() => {
    if (!open) return
    setMonth(currentMonth)
    setYear(currentYear)
    setLoading(false)
    setDownloading(false)
    setError('')
    setReport(null)
  }, [open, currentMonth, currentYear])

  const loadReport = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getInchargeReport(month, year)
      setReport(data)
    } catch (e) {
      setReport(null)
      setError(e.response?.data?.detail || 'Failed to load incharge report.')
    } finally {
      setLoading(false)
    }
  }

  const downloadCsv = () => {
    if (!report?.rows?.length) return
    setDownloading(true)
    try {
      const headers = ['Leave Staff', 'Area', 'Leave Date', 'Incharge', 'Status', 'Admin Note']
      const csvRows = report.rows.map((row) => ([
        row.leave_staff || '',
        row.cover_all_areas ? 'All Areas' : (row.area || ''),
        row.leave_date || '',
        row.incharge || '',
        row.status || '',
        row.admin_action_note || '',
      ]))
      const csvBody = [headers, ...csvRows]
        .map((r) => r.map((cell) => toCsvValue(cell)).join(','))
        .join('\n')
      const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv' })
      const filename = `incharge_report_${String(month).padStart(2, '0')}_${year}.csv`
      downloadBlob(blob, filename)
    } finally {
      setDownloading(false)
    }
  }

  const summary = report?.summary || {}
  const tableRows = (report?.rows || []).map((row, idx) => ([
    row.leave_staff || '-',
    row.cover_all_areas ? 'All Areas' : (row.area || '-'),
    formatDate(row.leave_date),
    row.incharge || '-',
    <Badge key={`st-${idx}`} value={row.status} />,
    row.admin_action_note || '-',
  ]))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Monthly Incharge Report"
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
          <Btn onClick={loadReport} disabled={loading || downloading}>
            {loading ? 'Loading...' : 'Load Report'}
          </Btn>
        </div>
        <Btn variant="secondary" onClick={downloadCsv} disabled={loading || downloading || !report?.rows?.length}>
          {downloading ? 'Preparing...' : 'Download CSV'}
        </Btn>
      </div>

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
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Approved</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.approved || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Rejected</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.rejected || 0}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Pending</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.pending || 0}</div>
            </Card>
          </div>

          <Card noPad>
            <DataTable
              headers={['Leave Staff', 'Area', 'Leave Date', 'Incharge', 'Status', 'Admin Note']}
              rows={tableRows}
              emptyMsg="No incharge assignments found for this month."
            />
          </Card>
        </>
      )}
    </Modal>
  )
}

export default function InchargeApprovalsTab() {
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [decisionLoadingId, setDecisionLoadingId] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const { refresh: refreshBadges } = useNotifications()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getInchargeAssignments()
      setRows(normalizeList(data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load incharge assignments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (id, decision) => {
    setDecisionLoadingId(id)
    setError('')
    setSuccess('')
    try {
      await hkAPI.decideInchargeAssignment(id, { decision })
      setSuccess(decision === 'approved' ? 'Incharge assignment approved.' : 'Incharge assignment rejected.')
      await load()
      refreshBadges()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update assignment decision.')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  const statusCounts = useMemo(() => {
    const acc = { all: rows.length, pending_admin_approval: 0, approved: 0, admin_rejected: 0, declined: 0, pending_acceptance: 0 }
    rows.forEach((r) => {
      if (r.status in acc) acc[r.status] += 1
    })
    return acc
  }, [rows])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  const tableRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        const ta = new Date(a.created_at).getTime() || 0
        const tb = new Date(b.created_at).getTime() || 0
        return tb - ta
      })
      .map((r) => [
        r.leave_staff_name || r.leave_staff_username || '-',
        r.area_label || r.area_name || '-',
        r.leave_date || '-',
        r.assigned_staff_name || r.assigned_staff_username || '-',
        <Badge key={`st-${r.id}`} value={r.status} />,
        r.status === 'pending_admin_approval' ? (
          <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
            <Btn
              size="sm"
              variant="success"
              onClick={() => decide(r.id, 'approved')}
              disabled={decisionLoadingId === r.id}
            >
              Approve
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => decide(r.id, 'rejected')}
              disabled={decisionLoadingId === r.id}
            >
              Reject
            </Btn>
          </div>
        ) : (
          '-'
        ),
      ])
  }, [decisionLoadingId, filteredRows])

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
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Incharge Approvals</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn size="sm" variant={statusFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('all')}>
              All ({statusCounts.all})
            </Btn>
            <Btn
              size="sm"
              variant={statusFilter === 'pending_admin_approval' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('pending_admin_approval')}
            >
              Pending ({statusCounts.pending_admin_approval})
            </Btn>
            <Btn size="sm" variant={statusFilter === 'approved' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('approved')}>
              Approved ({statusCounts.approved})
            </Btn>
            <Btn
              size="sm"
              variant={statusFilter === 'admin_rejected' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('admin_rejected')}
            >
              Rejected ({statusCounts.admin_rejected})
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setReportOpen(true)}>
              Monthly Report
            </Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Leave Staff', 'Area / Hostel', 'Leave Date', 'Assigned Incharge', 'Status', 'Actions']}
            rows={tableRows}
            emptyMsg="No incharge assignments found."
          />
        )}
      </Card>

      {!loading && rows.length ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Latest update: {formatDateTime(rows[0]?.updated_at)}
          </div>
        </Card>
      ) : null}

      <InchargeReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  )
}
