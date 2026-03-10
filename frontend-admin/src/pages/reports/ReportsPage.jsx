import { useEffect, useMemo, useState } from 'react'

import api from '../../api/client'
import AdminLayout from '../../layout/AdminLayout'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner, StatCard, Tabs } from '../../components/ui'
import RequestsReportTab from './RequestsReportTab'
import {
  inventoryAPI,
  csvUrl,
  downloadConsumptionItemCSV,
  downloadConsumptionRequesterCSV,
  deleteMonthly,
  generateConsumptionReport,
  generateMonthly,
  getConsumptionReportDetail,
  getConsumptionReports,
  getInventoryReport,
  getMonthly,
  listMonthly,
  pdfUrl,
} from '../../api/inventory'
import { useNotifications } from '../../context/NotificationContext'

async function downloadWithToken(url, filename) {
  try {
    const response = await api.get(url, { responseType: 'blob' })
    const href = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  } catch {
    window.alert('Download failed.')
  }
}

function downloadBlob(data, filename) {
  const href = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const str = String(value)
  // Only wrap in quotes if the value contains a delimiter or quote character
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function exportCsv(data, filename) {
  if (!Array.isArray(data) || !data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map((row) => headers.map((k) => csvEscape(row[k])).join(','))
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
  const [typeFilter, setTypeFilter] = useState('all')

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
    return base.filter((i) => {
      const statusOk = statusFilter === 'all' || i.status === statusFilter
      const typeOk = typeFilter === 'all' || i.type === typeFilter
      return statusOk && typeOk
    })
  }, [report, statusFilter, typeFilter])

  const typeCounts = useMemo(() => {
    const base = report?.items || []
    return {
      assets: base.filter((i) => i.type === 'asset').length,
      consumables: base.filter((i) => i.type === 'consumable').length,
    }
  }, [report])

  return (
    <div>
      <Alert message={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Items" value={report?.total_items ?? 0} icon="IT" color="#1d4ed8" />
        <StatCard label="Total Value" value={`INR ${Number(report?.total_value || 0).toLocaleString('en-IN')}`} icon="VL" color="#16a34a" />
        <StatCard label="Low Stock" value={report?.low_stock_count ?? 0} icon="LS" color="#f59e0b" />
        <StatCard label="Out of Stock" value={report?.out_of_stock_count ?? 0} icon="OS" color="#dc2626" />
        <StatCard label="Assets" value={typeCounts.assets} icon="AS" color="#2563eb" />
        <StatCard label="Consumables" value={typeCounts.consumables} icon="CS" color="#7c3aed" />
      </div>

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Inventory Report</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SelectField value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 170 }}>
                <option value="all">All</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </SelectField>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 150 }}>
                <option value="all">All Types</option>
                <option value="asset">Assets</option>
                <option value="consumable">Consumables</option>
              </SelectField>
              <Btn variant="secondary" onClick={() => exportCsv(items, `inventory_report_${statusFilter}_${typeFilter}.csv`)}>
                Export CSV
              </Btn>
            </div>
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function MonthlyTab() {
  const now = new Date()
  const { refresh: refreshBadges, markSeen } = useNotifications()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingSelected, setLoadingSelected] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [purchaseRows, setPurchaseRows] = useState([])
  const [purchaseFilter, setPurchaseFilter] = useState('pending')
  const [purchaseLoading, setPurchaseLoading] = useState(true)
  const [purchaseActingId, setPurchaseActingId] = useState(null)

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

  const loadPurchaseRequests = async () => {
    setPurchaseLoading(true)
    setError('')
    try {
      const params = purchaseFilter === 'all' ? {} : { status: purchaseFilter }
      const { data } = await inventoryAPI.getPurchaseRequests(params)
      const rows = Array.isArray(data) ? data : data?.results || []
      setPurchaseRows(rows)
      if (rows.length > 0) {
        markSeen('inventory')
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load purchase requests.')
    } finally {
      setPurchaseLoading(false)
    }
  }

  useEffect(() => {
    loadPurchaseRequests()
  }, [purchaseFilter])

  const decidePurchaseRequest = async (id, decision) => {
    setPurchaseActingId(id)
    setError('')
    try {
      await inventoryAPI.decidePurchaseRequest(id, { decision })
      await loadPurchaseRequests()
      refreshBadges()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update purchase request.')
    } finally {
      setPurchaseActingId(null)
    }
  }

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

      <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0, 1fr) 360px', gap: 14 }}>
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

        <Card noPad>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>MP Notifications</div>
            <Badge value="pending" style={{ fontSize: 10, padding: '2px 8px' }} />
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <Btn
              size="sm"
              variant={purchaseFilter === 'pending' ? 'primary' : 'secondary'}
              onClick={() => setPurchaseFilter('pending')}
            >
              Pending
            </Btn>
            <Btn
              size="sm"
              variant={purchaseFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setPurchaseFilter('all')}
            >
              All
            </Btn>
          </div>
          {purchaseLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 22 }}>
              <Spinner />
            </div>
          ) : purchaseRows.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              No purchase requests found.
            </div>
          ) : (
            <div style={{ maxHeight: 560, overflow: 'auto', padding: 10 }}>
              {purchaseRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    background: row.status === 'pending' ? '#fff7ed' : 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{row.item_name}</div>
                    <Badge value={row.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2 }}>
                    {row.quantity_requested} {row.unit} - {String(row.item_type || 'consumable').replace(/^./, (x) => x.toUpperCase())} - {row.category_name || 'No category'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2 }}>
                    By: {row.requested_by_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                    {new Date(row.created_at).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {row.reason}
                  </div>
                  {row.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <Btn
                        size="sm"
                        variant="success"
                        onClick={() => decidePurchaseRequest(row.id, 'approved')}
                        disabled={purchaseActingId === row.id}
                      >
                        Approve
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        onClick={() => decidePurchaseRequest(row.id, 'rejected')}
                        disabled={purchaseActingId === row.id}
                      >
                        Reject
                      </Btn>
                    </div>
                  )}
                </div>
              ))}
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

function ConsumptionTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [history, setHistory] = useState([])
  const [report, setReport] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [subTab, setSubTab] = useState('item')
  const [selectedRequesterId, setSelectedRequesterId] = useState(null)

  const years = useMemo(() => Array.from({ length: 3 }, (_, i) => now.getFullYear() - i), [now])

  const selectedCachedReport = useMemo(
    () => history.find((row) => Number(row.month) === month && Number(row.year) === year),
    [history, month, year]
  )

  const loadHistory = async () => {
    setLoadingHistory(true)
    setError('')
    try {
      const { data } = await getConsumptionReports()
      setHistory(Array.isArray(data) ? data : data?.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load consumption report history.')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const loadDetail = async (id) => {
    setLoadingReport(true)
    setError('')
    try {
      const { data } = await getConsumptionReportDetail(id)
      setReport(data)
      const firstRequester = data?.snapshot?.requester_rows?.[0]
      setSelectedRequesterId(firstRequester ? firstRequester.requester_id : null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load consumption report detail.')
      setReport(null)
      setSelectedRequesterId(null)
    } finally {
      setLoadingReport(false)
    }
  }

  const handleGenerateOrLoad = async () => {
    if (selectedCachedReport) {
      await loadDetail(selectedCachedReport.id)
      return
    }

    setBusy(true)
    setError('')
    try {
      const { data } = await generateConsumptionReport(month, year, false)
      await loadHistory()
      await loadDetail(data.id)
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.existing_id) {
        await loadHistory()
        await loadDetail(e.response.data.existing_id)
      } else {
        setError(e.response?.data?.detail || 'Failed to generate/load consumption report.')
      }
    } finally {
      setBusy(false)
    }
  }

  const downloadItemCsv = async () => {
    if (!report?.id) return
    setBusy(true)
    setError('')
    try {
      const response = await downloadConsumptionItemCSV(report.id)
      downloadBlob(response.data, `consumption_items_${report.year}_${String(report.month).padStart(2, '0')}.csv`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to download item CSV.')
    } finally {
      setBusy(false)
    }
  }

  const downloadRequesterCsv = async () => {
    if (!report?.id) return
    setBusy(true)
    setError('')
    try {
      const response = await downloadConsumptionRequesterCSV(report.id)
      downloadBlob(
        response.data,
        `consumption_requesters_${report.year}_${String(report.month).padStart(2, '0')}.csv`
      )
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to download requester CSV.')
    } finally {
      setBusy(false)
    }
  }

  const snapshot = report?.snapshot || {}
  const summary = snapshot.summary || {}
  const itemRows = useMemo(() => {
    const rows = Array.isArray(snapshot.item_rows) ? [...snapshot.item_rows] : []
    rows.sort((a, b) => {
      const cat = String(a.category_name || '').localeCompare(String(b.category_name || ''))
      if (cat !== 0) return cat
      return String(a.item_name || '').localeCompare(String(b.item_name || ''))
    })
    return rows
  }, [snapshot.item_rows])
  const requesterRows = useMemo(() => {
    const rows = Array.isArray(snapshot.requester_rows) ? [...snapshot.requester_rows] : []
    rows.sort((a, b) => Number(b.total_estimated_cost || 0) - Number(a.total_estimated_cost || 0))
    return rows
  }, [snapshot.requester_rows])

  const selectedRequester = useMemo(() => {
    if (!requesterRows.length) return null
    return requesterRows.find((row) => row.requester_id === selectedRequesterId) || requesterRows[0]
  }, [requesterRows, selectedRequesterId])

  useEffect(() => {
    if (!requesterRows.length) {
      setSelectedRequesterId(null)
      return
    }
    if (!requesterRows.some((row) => row.requester_id === selectedRequesterId)) {
      setSelectedRequesterId(requesterRows[0].requester_id)
    }
  }, [requesterRows, selectedRequesterId])

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Item Consumption</div>
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
          <Btn onClick={handleGenerateOrLoad} disabled={busy || loadingHistory || loadingReport} style={{ marginBottom: 14 }}>
            {busy || loadingReport ? 'Please wait...' : 'Generate / Load Report'}
          </Btn>
          {selectedCachedReport && (
            <span
              style={{
                marginBottom: 14,
                fontSize: 12,
                color: '#1d4ed8',
                background: '#dbeafe',
                border: '1px solid #93c5fd',
                borderRadius: 999,
                padding: '6px 10px',
                fontWeight: 600,
              }}
            >
              Cached on {new Date(selectedCachedReport.generated_at).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </Card>

      {loadingHistory ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : loadingReport ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : !report ? (
        <Card>
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>
            Select month/year and click Generate / Load Report.
          </div>
        </Card>
      ) : (
        <>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>
              {report.period_label} ({report.month}/{report.year})
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Generated: {report.generated_at ? new Date(report.generated_at).toLocaleString('en-IN') : '-'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <Btn size="sm" variant={subTab === 'item' ? 'primary' : 'secondary'} onClick={() => setSubTab('item')}>
              By Item
            </Btn>
            <Btn size="sm" variant={subTab === 'requester' ? 'primary' : 'secondary'} onClick={() => setSubTab('requester')}>
              By Requester
            </Btn>
          </div>

          {subTab === 'item' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
                <StatCard label="Active Items" value={summary.total_items_active || 0} icon="AI" color="#1d4ed8" />
                <StatCard label="Total Issued" value={summary.total_issued_transactions || 0} icon="IS" color="#16a34a" />
                <StatCard label="Stock Added" value={summary.total_stock_added || 0} icon="SA" color="#2563eb" />
                <StatCard label="Est. Cost (₹)" value={`INR ${Number(summary.total_estimated_cost || 0).toFixed(2)}`} icon="EC" color="#7c3aed" />
                <StatCard label="Unfinalized" value={summary.unfinalized_consumables || 0} icon="UF" color="#f59e0b" />
                <StatCard label="Pending Returns" value={summary.pending_asset_returns || 0} icon="PR" color="#dc2626" />
              </div>

              <Card noPad>
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Item Breakdown</div>
                  <Btn size="sm" variant="secondary" onClick={downloadItemCsv} disabled={busy}>
                    Download Item CSV
                  </Btn>
                </div>
                <DataTable
                  headers={['Item Name', 'Category', 'Type', 'Stock Added', 'Issued', 'Consumed', 'Est. Cost (₹)', 'Current Stock', 'Status']}
                  rows={itemRows.map((row) => [
                    row.item_name || '-',
                    row.category_name || '-',
                    String(row.item_type || '').replace(/^./, (x) => x.toUpperCase()),
                    row.stock_added || 0,
                    row.total_issued || 0,
                    row.actual_consumed || 0,
                    `INR ${Number(row.estimated_cost || 0).toFixed(2)}`,
                    `${row.current_stock || 0} ${row.unit || ''}`.trim(),
                    <Badge key={`status-${row.item_id}`} value={row.status || 'in_stock'} />,
                  ])}
                  emptyMsg="No item activity found for this month."
                />
              </Card>
            </>
          )}

          {subTab === 'requester' && (
            <>
              <Card noPad style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Requester Summary</div>
                  <Btn size="sm" variant="secondary" onClick={downloadRequesterCsv} disabled={busy}>
                    Download Requester CSV
                  </Btn>
                </div>
                <DataTable
                  headers={['Requester', 'Role', 'Requests', 'Issued', 'Rejected', 'Urgent', 'Est. Cost (₹)', 'Details']}
                  rows={requesterRows.map((row) => [
                    row.requester_name || row.username || '-',
                    <Badge key={`role-${row.requester_id}`} value={row.role || ''} />,
                    row.total_requests || 0,
                    row.issued_requests || 0,
                    row.rejected_requests || 0,
                    row.urgent_requests || 0,
                    `INR ${Number(row.total_estimated_cost || 0).toFixed(2)}`,
                    <Btn
                      key={`details-${row.requester_id}`}
                      size="sm"
                      variant={selectedRequester?.requester_id === row.requester_id ? 'primary' : 'ghost'}
                      onClick={() => setSelectedRequesterId(row.requester_id)}
                    >
                      View Items
                    </Btn>,
                  ])}
                  emptyMsg="No requester activity found for this month."
                />
              </Card>

              <Card noPad>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                  {selectedRequester ? `${selectedRequester.requester_name} - Item Detail` : 'Requester Item Detail'}
                </div>
                {selectedRequester ? (
                  <DataTable
                    headers={['Requester', 'Item', 'Category', 'Unit', 'Qty Issued', 'Actual Used', 'Finalized']}
                    rows={(selectedRequester.items_received || []).map((item) => [
                      selectedRequester.requester_name || '-',
                      item.item_name || '-',
                      item.category || '-',
                      item.unit || '-',
                      item.quantity_issued || 0,
                      item.actual_used || 0,
                      item.usage_finalized ? 'Yes' : 'No',
                    ])}
                    emptyMsg="No issued item details for this requester."
                  />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                    Select a requester to view item detail.
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}

const TAB_ITEMS = [
  { key: 'monthly', label: 'Monthly Procurement', icon: 'MP' },
  { key: 'consumption', label: 'Item Consumption', icon: 'IC' },
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
      {active === 'consumption' && <ConsumptionTab />}
      {active === 'inventory' && <InventoryReportTab />}
      {active === 'requests' && <RequestsReportTab />}
    </AdminLayout>
  )
}
