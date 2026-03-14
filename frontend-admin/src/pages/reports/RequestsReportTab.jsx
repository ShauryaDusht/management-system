import { useEffect, useState } from 'react'

import { getRequestsReport } from '../../api/inventory'
import { Alert, Btn, Card, DataTable, Field, Input, Spinner, StatCard } from '../../components/ui'
import { exportCsv } from '../../shared/utils'

export default function RequestsReportTab() {
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
              <StatCard label="Issued" value={report?.issued || 0} icon="IS" color="#7c3aed" />
              <StatCard label="Rejected" value={report?.rejected || 0} icon="RJ" color="#dc2626" />
            </div>
            <DataTable
              headers={['Requester', 'Item Code', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By']}
              rows={(report?.requests || []).map((r) => [
                r.requester,
                r.item_code || '—',
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
