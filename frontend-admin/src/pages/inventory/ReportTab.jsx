import { useEffect, useMemo, useState } from 'react'

import { getInventoryReport } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, Spinner, StatCard } from '../../components/ui'
import { asList, exportCsv } from '../../shared/utils'

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
]
const TYPE_OPTIONS = [
  { key: 'all', label: 'All Types' },
  { key: 'asset', label: 'Assets' },
  { key: 'consumable', label: 'Consumables' },
]

export default function ReportTab() {
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
        setReport(data || null)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to load inventory report.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const items = useMemo(() => {
    const list = asList(report?.items)
    return list.filter((item) => {
      const statusOk = statusFilter === 'all' || item.status === statusFilter
      const typeOk = typeFilter === 'all' || item.type === typeFilter
      return statusOk && typeOk
    })
  }, [report, statusFilter, typeFilter])

  const csvRows = useMemo(
    () =>
      items.map((item) => ({
        Item: item.name || '',
        Category: item.category || '',
        Type: item.type || '',
        Available: `${item.available_quantity ?? 0} ${item.unit || ''}`.trim(),
        Threshold: item.threshold_quantity ?? 0,
        UnitCost: Number(item.unit_cost || 0).toFixed(2),
        Status: String(item.status || '').replace(/_/g, ' ').toUpperCase(),
      })),
    [items]
  )

  const csvFilename = `inventory_report_${statusFilter}_${typeFilter}.csv`

  return (
    <div>
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <StatCard label="Total Items" value={report?.total_items ?? 0} icon="IT" color="#1d4ed8" />
        <StatCard
          label="Total Value"
          value={`INR ${Number(report?.total_value || 0).toLocaleString('en-IN')}`}
          icon="VL"
          color="#16a34a"
        />
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
            alignItems: 'flex-start',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((option) => (
                <Btn
                  key={option.key}
                  size="sm"
                  variant={statusFilter === option.key ? 'primary' : 'secondary'}
                  onClick={() => setStatusFilter(option.key)}
                >
                  {option.label}
                </Btn>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TYPE_OPTIONS.map((option) => (
                <Btn
                  key={option.key}
                  size="sm"
                  variant={typeFilter === option.key ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter(option.key)}
                >
                  {option.label}
                </Btn>
              ))}
            </div>
          </div>

          <Btn
            variant="secondary"
            onClick={() => exportCsv(csvRows, csvFilename)}
            disabled={csvRows.length === 0}
          >
            Download CSV
          </Btn>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost', 'Status']}
            rows={items.map((item) => [
              item.name || '-',
              item.category || '-',
              String(item.type || '').toUpperCase(),
              `${item.available_quantity ?? 0} ${item.unit || ''}`.trim(),
              item.threshold_quantity ?? 0,
              `INR ${Number(item.unit_cost || 0).toFixed(2)}`,
              <Badge key={`st-${item.id}`} value={item.status} />,
            ])}
            emptyMsg="No items found for the selected filter."
          />
        )}
      </Card>
    </div>
  )
}
