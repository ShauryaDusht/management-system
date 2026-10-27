import { useEffect, useMemo, useState } from 'react'

import { getRequestsReport } from '../../api/inventory'
import { Alert, Btn, Card, DataTable, ExportDropdown, Field, Input, Spinner, StatCard } from '../../components/ui'
import { exportReport } from '../../shared/exportHelper'

const todayStr = () => new Date().toISOString().split('T')[0]

export default function RequestsReportTab({ categoryScope = null, excludeCategoryScope = null }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = async (from = dateFrom, to = dateTo) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (from) params.date_from = from
      if (to) params.date_to = to
      if (categoryScope) params.category = categoryScope
      if (excludeCategoryScope) params.exclude_category = excludeCategoryScope
      const { data } = await getRequestsReport(params)
      setReport(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load requests report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(dateFrom, dateTo)
  }, [categoryScope, excludeCategoryScope])

  const applyPreset = async (preset) => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    let from = ''
    let to = ''
    if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      from = firstDay.toISOString().split('T')[0]
      to = today
    } else if (preset === 'today') {
      from = today
      to = today
    }
    setDateFrom(from)
    setDateTo(to)
    await load(from, to)
  }

  const requests = useMemo(() => {
    let list = report?.requests || []
    if (categoryScope) {
      list = list.filter((r) => {
        const cat = r.category || ''
        return String(cat).trim().toLowerCase() === String(categoryScope).trim().toLowerCase()
          || String(cat).toLowerCase().includes('horticulture')
          || String(r.reason || '').toLowerCase().includes('[horticulture')
      })
    }
    if (excludeCategoryScope) {
      list = list.filter((r) => {
        const cat = r.category || ''
        const isExcluded = String(cat).trim().toLowerCase() === String(excludeCategoryScope).trim().toLowerCase()
          || String(cat).toLowerCase().includes('horticulture')
          || String(r.reason || '').toLowerCase().includes('[horticulture')
        return !isExcluded
      })
    }
    return list
  }, [report, categoryScope, excludeCategoryScope])

  const stats = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      issued: requests.filter((r) => r.status === 'issued' || r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    }
  }, [requests])

  const handleExportRequests = async (format) => {
    const rangeSubtitle = dateFrom || dateTo
      ? `Date Range: ${dateFrom || 'Beginning'} to ${dateTo || 'Present'}`
      : 'All Time'
    const exportData = {
      filename: `requests_report_${dateFrom || 'all'}_to_${dateTo || 'all'}`,
      module: categoryScope || 'Inventory Management',
      title: categoryScope ? `${categoryScope} Requests Report` : 'Material Requests Report',
      subtitle: rangeSubtitle,
      metadata: [
        { label: 'Scope', value: categoryScope || 'All Inventory' },
        { label: 'Date Range', value: rangeSubtitle },
        { label: 'Total Requests', value: stats.total },
      ],
      stats: [
        { label: 'Total Requests', value: stats.total },
        { label: 'Pending', value: stats.pending },
        { label: 'Issued', value: stats.issued },
        { label: 'Rejected', value: stats.rejected },
      ],
      headers: ['Requester', 'Item Code', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By', 'Issued At'],
      rows: requests.map((r) => [
        r.requester || '-',
        r.item_code || '—',
        r.item || '-',
        r.quantity ?? 0,
        (r.status === 'approved' ? 'ISSUED' : String(r.status || '')).toUpperCase(),
        r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-',
        r.reviewed_by || '-',
        r.issued_at ? new Date(r.issued_at).toLocaleString('en-IN') : '-',
      ]),
    }
    await exportReport(format, exportData)
  }

  const isAllTime = !dateFrom && !dateTo
  const isThisMonth = dateFrom && dateFrom.endsWith('-01') && dateTo === todayStr()
  const isToday = dateFrom === todayStr() && dateTo === todayStr()

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
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
                  style={{ width: 140 }}
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
                  style={{ width: 140 }}
                />
              </Field>
              <Btn onClick={() => load(dateFrom, dateTo)} style={{ marginBottom: 14 }}>
                Apply
              </Btn>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <Btn
                  size="sm"
                  variant={isAllTime ? 'primary' : 'secondary'}
                  onClick={() => applyPreset('all')}
                >
                  All Time
                </Btn>
                <Btn
                  size="sm"
                  variant={isThisMonth ? 'primary' : 'secondary'}
                  onClick={() => applyPreset('this_month')}
                >
                  This Month
                </Btn>
                <Btn
                  size="sm"
                  variant={isToday ? 'primary' : 'secondary'}
                  onClick={() => applyPreset('today')}
                >
                  Today
                </Btn>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <ExportDropdown
                label="Export Requests"
                onExport={handleExportRequests}
                disabled={loading || requests.length === 0}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(140px, 14vw, 220px), 1fr))', gap: 12, padding: 14 }}>
              <StatCard label="Total Requests" value={stats.total} icon="TT" color="#1d4ed8" />
              <StatCard label="Pending" value={stats.pending} icon="PN" color="#f59e0b" />
              <StatCard label="Issued" value={stats.issued} icon="IS" color="#7c3aed" />
              <StatCard label="Rejected" value={stats.rejected} icon="RJ" color="#dc2626" />
            </div>
            <DataTable
              headers={['Requester', 'Item Code', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By', 'Issued At']}
              rows={requests.map((r) => [
                r.requester,
                r.item_code || '—',
                r.item,
                r.quantity,
                (r.status === 'approved' ? 'ISSUED' : String(r.status || '')).toUpperCase(),
                r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-',
                r.reviewed_by || '-',
                r.issued_at ? new Date(r.issued_at).toLocaleString('en-IN') : '-',
              ])}
              emptyMsg="No requests found for the selected filter."
            />
          </>
        )}
      </Card>
    </div>
  )
}
