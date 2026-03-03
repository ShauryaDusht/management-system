import { useEffect, useMemo, useState } from 'react'

import AdminLayout from '../../layout/AdminLayout'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner, StatCard, Tabs } from '../../components/ui'
import {
  csvUrl,
  deleteMonthly,
  generateMonthly,
  getInventoryReport,
  getMonthly,
  getRequestsReport,
  listMonthly,
  pdfUrl,
} from '../../api/inventory'

function downloadWithToken(url, filename) {
  const token = localStorage.getItem('access_token')
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed')
      return res.blob()
    })
    .then((blob) => {
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.click()
      URL.revokeObjectURL(href)
    })
    .catch(() => window.alert('Download failed.'))
}

function exportCsv(data, filename) {
  if (!Array.isArray(data) || !data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map((row) => headers.map((k) => JSON.stringify(row[k] ?? '')).join(','))
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

function InventoryReportTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await getInventoryReport()
        setReport(data)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to load inventory report.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const items = useMemo(() => {
    const base = report?.items || []
    if (statusFilter === 'all') return base
    return base.filter((i) => i.status === statusFilter)
  }, [report, statusFilter])

  return (
    <div>
      <Alert message={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Items" value={report?.total_items ?? 0} icon="IT" color="#1d4ed8" />
        <StatCard label="Total Value" value={`INR ${Number(report?.total_value || 0).toLocaleString('en-IN')}`} icon="VL" color="#16a34a" />
        <StatCard label="Low Stock" value={report?.low_stock_count ?? 0} icon="LS" color="#f59e0b" />
        <StatCard label="Out of Stock" value={report?.out_of_stock_count ?? 0} icon="OS" color="#dc2626" />
      </div>

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Inventory Report</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SelectField value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 170 }}>
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </SelectField>
            <Btn variant="secondary" onClick={() => exportCsv(items, 'inventory_report.csv')}>
              Export CSV
            </Btn>
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Item', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost', 'Status']}
            rows={items.map((item) => [
              item.name,
              item.category,
              item.type,
              `${item.available_quantity} ${item.unit || ''}`.trim(),
              item.threshold_quantity,
              `INR ${Number(item.unit_cost || 0).toFixed(2)}`,
              String(item.status || '').replace(/_/g, ' '),
            ])}
            emptyMsg="No inventory report rows."
          />
        )}
      </Card>
    </div>
  )
}

function RequestsReportTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const { data } = await getRequestsReport(params)
      setReport(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load requests report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
            <Field label="Date From">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="Date To">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
            <Btn onClick={load} style={{ marginBottom: 14 }}>
              Apply
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => exportCsv(report?.requests || [], 'requests_report.csv')}
              style={{ marginBottom: 14 }}
            >
              Export CSV
            </Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 14 }}>
              <StatCard label="Total" value={report?.total || 0} icon="TT" color="#1d4ed8" />
              <StatCard label="Pending" value={report?.pending || 0} icon="PN" color="#f59e0b" />
              <StatCard label="Approved" value={report?.approved || 0} icon="AP" color="#16a34a" />
              <StatCard label="Rejected" value={report?.rejected || 0} icon="RJ" color="#dc2626" />
            </div>
            <DataTable
              headers={['Requester', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By']}
              rows={(report?.requests || []).map((r) => [
                r.requester,
                r.item,
                r.quantity,
                String(r.status || '').toUpperCase(),
                r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-',
                r.reviewed_by || '-',
              ])}
              emptyMsg="No requests in selected date range."
            />
          </>
        )}
      </Card>
    </div>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function MonthlyTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingSelected, setLoadingSelected] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), [now])

  const loadHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await listMonthly()
      setHistory(Array.isArray(data) ? data : data?.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load monthly report history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const generate = async (overwrite = false) => {
    setError('')
    try {
      const { data } = await generateMonthly(month, year, overwrite)
      await loadHistory()
      await viewReport(data.id)
    } catch (e) {
      const detail = e.response?.data?.detail || e.response?.data?.message || 'Monthly generation failed.'
      setError(detail)
    }
  }

  const viewReport = async (id) => {
    setLoadingSelected(true)
    setError('')
    try {
      const { data } = await getMonthly(id)
      setSelected(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load selected monthly report.')
    } finally {
      setLoadingSelected(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMonthly(confirmDelete.id)
      setConfirmDelete(null)
      if (selected?.id === confirmDelete.id) setSelected(null)
      await loadHistory()
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed.')
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Month">
            <SelectField value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 160 }}>
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Year">
            <SelectField value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>
          </Field>
          <Btn onClick={() => generate(false)} style={{ marginBottom: 14 }}>
            Generate Report
          </Btn>
          <Btn variant="danger" onClick={() => generate(true)} style={{ marginBottom: 14 }}>
            Overwrite
          </Btn>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 14 }}>
        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            Monthly History
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <Spinner />
            </div>
          ) : (
            <DataTable
              headers={['Period', 'Items', 'Reorder', 'Actions']}
              rows={history.map((r) => [
                r.period_label || `${MONTHS[(r.month || 1) - 1]} ${r.year}`,
                r.total_items || 0,
                r.items_needing_reorder || 0,
                <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => viewReport(r.id)}>
                    View
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => setConfirmDelete(r)}>
                    Delete
                  </Btn>
                </div>,
              ])}
              emptyMsg="No monthly reports generated yet."
            />
          )}
        </Card>

        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Selected Report</div>
            {selected && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadWithToken(
                      csvUrl(selected.id),
                      `procurement_${selected.year}_${String(selected.month).padStart(2, '0')}.csv`
                    )
                  }
                >
                  CSV
                </Btn>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadWithToken(
                      pdfUrl(selected.id),
                      `procurement_${selected.year}_${String(selected.month).padStart(2, '0')}.pdf`
                    )
                  }
                >
                  PDF
                </Btn>
              </div>
            )}
          </div>
          {loadingSelected ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <Spinner />
            </div>
          ) : selected ? (
            <DataTable
              headers={['Item', 'Category', 'Current', 'Threshold', 'Recommended', 'Est. Cost']}
              rows={(selected.snapshot?.items || []).map((i) => [
                i.item_name,
                i.category,
                i.current_stock,
                i.threshold,
                i.recommended_order,
                `INR ${Number(i.estimated_cost || 0).toFixed(2)}`,
              ])}
              emptyMsg="No item snapshot available for this report."
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
              Select a monthly report from history to view details.
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Monthly Report"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Btn>
            <Btn variant="danger" onClick={doDelete}>
              Delete
            </Btn>
          </>
        }
      >
        <p style={{ fontSize: 14 }}>
          Delete report <strong>{confirmDelete?.period_label}</strong>?
        </p>
      </Modal>
    </div>
  )
}

const TAB_ITEMS = [
  { key: 'monthly', label: 'Monthly Procurement', icon: 'MP' },
  { key: 'inventory', label: 'Inventory Report', icon: 'IR' },
  { key: 'requests', label: 'Requests Report', icon: 'RR' },
]

export default function ReportsPage() {
  const [active, setActive] = useState('monthly')

  return (
    <AdminLayout title="Reports" subtitle="Inventory analytics and procurement reporting">
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_ITEMS} active={active} onChange={setActive} />
      </div>

      {active === 'monthly' && <MonthlyTab />}
      {active === 'inventory' && <InventoryReportTab />}
      {active === 'requests' && <RequestsReportTab />}
    </AdminLayout>
  )
}
