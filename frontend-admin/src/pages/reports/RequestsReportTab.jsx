import { useEffect, useState } from 'react'

import { getRequestsReport } from '../../api/inventory'
import { Alert, Btn, Card, DataTable, ExportDropdown, Field, Input, Spinner, StatCard } from '../../components/ui'
import { exportReport } from '../../shared/exportHelper'

const todayStr = () => new Date().toISOString().split('T')[0]

export default function RequestsReportTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(todayStr())

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

  const handleExportRequests = async (format) => {
    const requests = report?.requests || []
    const exportData = {
      filename: `requests_report_${dateFrom}_to_${dateTo}`,
      module: 'Inventory Management',
      title: 'Material Requests Report',
      subtitle: `Date Range: ${dateFrom} to ${dateTo}`,
      metadata: [
        { label: 'Date From', value: dateFrom },
        { label: 'Date To', value: dateTo },
        { label: 'Total Requests', value: report?.total || requests.length },
      ],
      stats: [
        { label: 'Total Requests', value: report?.total || 0 },
        { label: 'Pending', value: report?.pending || 0 },
        { label: 'Approved', value: report?.approved || 0 },
        { label: 'Issued', value: report?.issued || 0 },
        { label: 'Rejected', value: report?.rejected || 0 },
      ],
      headers: ['Requester', 'Item Code', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By', 'Issued At'],
      rows: requests.map((r) => [
        r.requester || '-',
        r.item_code || '—',
        r.item || '-',
        r.quantity ?? 0,
        String(r.status || '').toUpperCase(),
        r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-',
        r.reviewed_by || '-',
        r.issued_at ? new Date(r.issued_at).toLocaleString('en-IN') : '-',
      ]),
    }
    await exportReport(format, exportData)
  }

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
            <Field label="Date From">
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || todayStr()}
                onChange={(e) => {
                  const val = e.target.value
                  setDateFrom(val)
                  if (dateTo && val > dateTo) setDateTo(val)
                }}
              />
            </Field>
            <Field label="Date To">
              <Input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={todayStr()}
                onChange={(e) => {
                  const val = e.target.value
                  setDateTo(val)
                  if (dateFrom && val < dateFrom) setDateFrom(val)
                }}
              />
            </Field>
            <Btn onClick={load} style={{ marginBottom: 14 }}>
              Apply
            </Btn>
            <div style={{ marginBottom: 14 }}>
              <ExportDropdown
                label="Export Requests"
                onExport={handleExportRequests}
                disabled={loading || (report?.requests || []).length === 0}
              />
            </div>
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
              <StatCard label="Issued" value={report?.issued || 0} icon="IS" color="#7c3aed" />
              <StatCard label="Rejected" value={report?.rejected || 0} icon="RJ" color="#dc2626" />
            </div>
            <DataTable
              headers={['Requester', 'Item Code', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By', 'Issued At']}
              rows={(report?.requests || []).map((r) => [
                r.requester,
                r.item_code || '—',
                r.item,
                r.quantity,
                String(r.status || '').toUpperCase(),
                r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-',
                r.reviewed_by || '-',
                r.issued_at ? new Date(r.issued_at).toLocaleString('en-IN') : '-',
              ])}
              emptyMsg="No requests in selected date range."
            />
          </>
        )}
      </Card>
    </div>
  )
}
