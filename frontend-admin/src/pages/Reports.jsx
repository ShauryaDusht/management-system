import { useEffect, useMemo, useState } from 'react'
import Layout from '../layout/Layout'
import { Button, Input, Select, Spinner, StatusBadge, Alert, Modal } from '../components/ui'
import { getInventoryReport, getRequestsReport, reportsAPI } from '../api/inventory'
import api from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportToCSV(data, filename) {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map((row) => Object.values(row).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadViaToken(url, filename) {
  // Attach JWT then trigger browser download
  const token = localStorage.getItem('access_token')
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed')
      return res.blob()
    })
    .then((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    })
    .catch(() => alert('Download failed. Please try again.'))
}

// ── Small shared components ───────────────────────────────────────────────────

function ReportCard({ title, value, color }) {
  const palette = {
    blue:   'text-blue-700',
    green:  'text-emerald-700',
    orange: 'text-amber-700',
    red:    'text-red-700',
    purple: 'text-purple-700',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${palette[color] || 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

// ── Inventory report tab ──────────────────────────────────────────────────────

function InventoryTab() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    getInventoryReport()
      .then((r) => setReport(r.data))
      .catch(() => setError('Unable to load inventory report.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const items = report?.items || []
    return statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter)
  }, [report, statusFilter])

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <>
      <Alert type="error" message={error} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <ReportCard title="Total Items"    value={report?.total_items ?? 0}                           color="blue"   />
        <ReportCard title="Total Value"    value={`₹${(report?.total_value ?? 0).toFixed(2)}`}        color="green"  />
        <ReportCard title="Low Stock"      value={report?.low_stock_count ?? 0}                       color="orange" />
        <ReportCard title="Out of Stock"   value={report?.out_of_stock_count ?? 0}                    color="red"    />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="w-56">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </Select>
        </div>
        <Button onClick={() => exportToCSV(filtered, 'inventory_report.csv')}>Export CSV</Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Item Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost', 'Total Value', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No data available.</td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{item.name}</td>
                  <td className="px-4 py-3 text-slate-700">{item.category}</td>
                  <td className="px-4 py-3 text-slate-700 capitalize">{item.type}</td>
                  <td className="px-4 py-3 text-slate-700">{item.available_quantity} {item.unit}</td>
                  <td className="px-4 py-3 text-slate-700">{item.threshold_quantity}</td>
                  <td className="px-4 py-3 text-slate-700">₹{Number(item.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700">₹{Number(item.total_value || 0).toFixed(2)}</td>
                  <td className="px-4 py-3"><StatusBadge value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── Requests report tab ───────────────────────────────────────────────────────

function RequestsTab() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const params = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo
    getRequestsReport(params)
      .then((r) => setReport(r.data))
      .catch(() => setError('Unable to load requests report.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  return (
    <>
      <Alert type="error" message={error} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</Button>
        <Button variant="outline" onClick={() => exportToCSV(report?.requests || [], 'requests_report.csv')}>
          Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <ReportCard title="Total"    value={report?.total ?? 0}    color="blue"   />
            <ReportCard title="Pending"  value={report?.pending ?? 0}  color="orange" />
            <ReportCard title="Approved" value={report?.approved ?? 0} color="green"  />
            <ReportCard title="Rejected" value={report?.rejected ?? 0} color="red"    />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Requester', 'Item', 'Quantity', 'Status', 'Date', 'Reviewed By'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report?.requests || []).length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No data available.</td></tr>
                  ) : (report?.requests || []).map((req) => (
                    <tr key={req.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{req.requester}</td>
                      <td className="px-4 py-3 text-slate-700">{req.item}</td>
                      <td className="px-4 py-3 text-slate-700">{req.quantity}</td>
                      <td className="px-4 py-3"><StatusBadge value={req.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(req.created_at).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-slate-500">{req.reviewed_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Monthly Procurement tab ───────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function monthName(m) { return MONTHS[(m ?? 1) - 1] ?? '' }

function StockStatusDot({ status }) {
  const cls = {
    in_stock:    'bg-emerald-500',
    low_stock:   'bg-amber-400',
    out_of_stock:'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${cls[status] || 'bg-slate-300'}`} />
}

function ProcurementTable({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-center text-slate-400 py-10 text-sm">No items in this report.</p>
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Item', 'Category', 'Type', 'Unit', 'Consumption', 'Current Stock', 'Threshold', 'Rec. Order', 'Unit Cost', 'Est. Cost', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.item_id ?? i} className={`border-b border-slate-50 hover:bg-slate-50 ${row.recommended_order > 0 ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.item_name}</td>
                <td className="px-4 py-3 text-slate-600">{row.category}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{row.item_type}</td>
                <td className="px-4 py-3 text-slate-600">{row.unit}</td>
                <td className="px-4 py-3 text-slate-700 tabular-nums">{row.consumption}</td>
                <td className="px-4 py-3 text-slate-700 tabular-nums">{row.current_stock}</td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">{row.threshold}</td>
                <td className="px-4 py-3 tabular-nums">
                  <span className={`font-semibold ${row.recommended_order > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                    {row.recommended_order}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">₹{Number(row.unit_cost).toFixed(2)}</td>
                <td className="px-4 py-3 font-medium text-slate-800 tabular-nums">₹{Number(row.estimated_cost).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center text-xs">
                    <StockStatusDot status={row.status} />
                    {row.status?.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MonthlyTab() {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)     // 1-12
  const [selYear, setSelYear]   = useState(now.getFullYear())

  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState('')
  const [conflictId, setConflictId]   = useState(null)     // id of existing report on 409

  const [activeReport, setActiveReport] = useState(null)  // the currently viewed report
  const [reportLoading, setReportLoading] = useState(false)

  const [history, setHistory]         = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError]     = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  // Load history on mount
  useEffect(() => {
    reportsAPI.listMonthly()
      .then((r) => setHistory(r.data))
      .catch(() => setHistoryError('Could not load report history.'))
      .finally(() => setHistoryLoading(false))
  }, [])

  const loadReport = (id) => {
    setReportLoading(true)
    setActiveReport(null)
    reportsAPI.getMonthly(id)
      .then((r) => setActiveReport(r.data))
      .catch(() => setGenError('Could not load report details.'))
      .finally(() => setReportLoading(false))
  }

  const doGenerate = async (overwrite = false) => {
    setGenerating(true)
    setGenError('')
    setConflictId(null)
    try {
      const res = await reportsAPI.generateMonthly(selMonth, selYear, overwrite)
      const newReport = res.data
      // Update history list
      setHistory((prev) => {
        const without = prev.filter((r) => r.id !== newReport.id)
        return [newReport, ...without].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
      })
      // Load full snapshot for table
      loadReport(newReport.id)
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictId(err.response.data.existing_id)
        setGenError(
          `A report for ${monthName(selMonth)} ${selYear} already exists. Click "Overwrite" to regenerate it.`
        )
      } else {
        setGenError(err.response?.data?.detail || 'Generation failed. Please try again.')
      }
    } finally {
      setGenerating(false)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await reportsAPI.deleteMonthly(deleteTarget.id)
      setHistory((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      if (activeReport?.id === deleteTarget.id) setActiveReport(null)
      setDeleteTarget(null)
    } catch {
      setGenError('Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* ── Generator panel ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Generate Monthly Procurement Report</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <Select className="w-40" value={selMonth} onChange={(e) => { setSelMonth(Number(e.target.value)); setGenError(''); setConflictId(null) }}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
            <Select className="w-28" value={selYear} onChange={(e) => { setSelYear(Number(e.target.value)); setGenError(''); setConflictId(null) }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <Button onClick={() => doGenerate(false)} disabled={generating}>
            {generating ? <><Spinner className="h-4 w-4" /> Generating…</> : 'Generate Report'}
          </Button>
          {conflictId && (
            <Button variant="danger" onClick={() => doGenerate(true)} disabled={generating}>
              Overwrite
            </Button>
          )}
        </div>

        {genError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            {genError}
          </div>
        )}
      </div>

      {/* ── Active report view ── */}
      {reportLoading && <div className="flex justify-center py-10"><Spinner /></div>}

      {activeReport && !reportLoading && (
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {activeReport.snapshot?.period_label} — Procurement Report
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Generated {new Date(activeReport.generated_at).toLocaleString('en-IN')}
                {activeReport.generated_by_name && ` · by ${activeReport.generated_by_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadViaToken(
                  reportsAPI.csvUrl(activeReport.id),
                  `procurement_${activeReport.year}_${String(activeReport.month).padStart(2,'0')}.csv`
                )}
              >
                ↓ CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadViaToken(
                  reportsAPI.pdfUrl(activeReport.id),
                  `procurement_${activeReport.year}_${String(activeReport.month).padStart(2,'0')}.pdf`
                )}
              >
                ↓ PDF
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReportCard title="Total Items"        value={activeReport.snapshot?.total_items ?? 0}            color="blue"   />
            <ReportCard title="Items to Reorder"   value={activeReport.snapshot?.items_needing_reorder ?? 0}  color="orange" />
            <ReportCard title="Est. Procurement Cost" value={`₹${(activeReport.snapshot?.total_estimated_cost ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} color="purple" />
          </div>

          {/* Procurement table */}
          <ProcurementTable items={activeReport.snapshot?.items || []} />
        </div>
      )}

      {/* ── History ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Past Reports</h2>

        {historyLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {historyError && <Alert type="error" message={historyError} />}

        {!historyLoading && history.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
            No reports generated yet. Use the form above to create one.
          </p>
        )}

        {!historyLoading && history.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Period', 'Items', 'To Reorder', 'Est. Cost', 'Generated At', 'By', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50 transition ${activeReport?.id === r.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.period_label}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{r.total_items}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={r.items_needing_reorder > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                        {r.items_needing_reorder}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">
                      ₹{Number(r.total_estimated_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.generated_at).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-slate-500">{r.generated_by_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadReport(r.id)}
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => downloadViaToken(
                            reportsAPI.csvUrl(r.id),
                            `procurement_${r.year}_${String(r.month).padStart(2,'0')}.csv`
                          )}
                          className="text-xs text-slate-500 hover:underline"
                        >
                          CSV
                        </button>
                        <button
                          onClick={() => downloadViaToken(
                            reportsAPI.pdfUrl(r.id),
                            `procurement_${r.year}_${String(r.month).padStart(2,'0')}.pdf`
                          )}
                          className="text-xs text-slate-500 hover:underline"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Report"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={doDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Are you sure you want to delete the <strong>{deleteTarget?.period_label}</strong> report?
          This will also remove the saved CSV and PDF files.
        </p>
      </Modal>
    </div>
  )
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const [activeTab, setActiveTab] = useState('procurement')

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">Inventory analytics and monthly procurement</p>
          </div>
          <div className="flex items-center gap-2">
            <TabButton active={activeTab === 'procurement'} onClick={() => setActiveTab('procurement')}>
              Monthly Procurement
            </TabButton>
            <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')}>
              Inventory Report
            </TabButton>
            <TabButton active={activeTab === 'requests'} onClick={() => setActiveTab('requests')}>
              Requests Report
            </TabButton>
          </div>
        </div>

        {activeTab === 'procurement' && <MonthlyTab />}
        {activeTab === 'inventory'   && <InventoryTab />}
        {activeTab === 'requests'    && <RequestsTab />}
      </div>
    </Layout>
  )
}
