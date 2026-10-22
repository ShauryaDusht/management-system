import { useEffect, useMemo, useState } from 'react'

import { getInventoryReport } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, ExportDropdown, Spinner, StatCard } from '../../components/ui'
import { exportReport } from '../../shared/exportHelper'
import { asList } from '../../shared/utils'

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

export default function ReportTab({ categoryScope = null }) {
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
        const params = categoryScope ? { category: categoryScope } : {}
        const { data } = await getInventoryReport(params)
        setReport(data || null)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to load inventory report.')
      } finally {
        setLoading(false)
      }
    })()
  }, [categoryScope])

  const items = useMemo(() => {
    const list = asList(report?.items)
    return list.filter((item) => {
      const statusOk = statusFilter === 'all' || item.status === statusFilter
      const typeOk = typeFilter === 'all' || item.type === typeFilter
      const categoryOk =
        !categoryScope ||
        String(item.category || '').trim().toLowerCase() === String(categoryScope).trim().toLowerCase()
      return statusOk && typeOk && categoryOk
    })
  }, [report, statusFilter, typeFilter, categoryScope])

  const stats = useMemo(() => {
    if (!categoryScope) {
      return {
        total: report?.total_items ?? items.length,
        value: Number(report?.total_value || 0),
        lowStock: report?.low_stock_count ?? 0,
        outOfStock: report?.out_of_stock_count ?? 0,
      }
    }
    const catItems = asList(report?.items).filter((it) =>
      String(it.category || '').trim().toLowerCase() === String(categoryScope).trim().toLowerCase()
    )
    return {
      total: catItems.length,
      value: catItems.reduce((acc, it) => acc + Number(it.total_value || 0), 0),
      lowStock: catItems.filter((it) => it.status === 'low_stock').length,
      outOfStock: catItems.filter((it) => it.status === 'out_of_stock').length,
    }
  }, [report, items, categoryScope])

  const handleExportReport = async (format) => {
    const sLabel = STATUS_OPTIONS.find((o) => o.key === statusFilter)?.label || statusFilter
    const tLabel = TYPE_OPTIONS.find((o) => o.key === typeFilter)?.label || typeFilter
    const exportData = {
      filename: `inventory_report_${statusFilter}_${typeFilter}`,
      module: categoryScope || 'Inventory Management',
      title: categoryScope ? `${categoryScope} Stock Report` : 'Inventory Stock Summary Report',
      subtitle: `Status: ${sLabel} • Type: ${tLabel}`,
      metadata: [
        { label: 'Scope', value: categoryScope || 'All Inventory' },
        { label: 'Status Filter', value: sLabel },
        { label: 'Type Filter', value: tLabel },
        { label: 'Matching Items', value: items.length },
      ],
      stats: [
        { label: 'Total Items', value: stats.total },
        {
          label: 'Total Value',
          value: `INR ${stats.value.toLocaleString('en-IN')}`,
        },
        { label: 'Low Stock', value: stats.lowStock },
        { label: 'Out of Stock', value: stats.outOfStock },
      ],
      headers: ['Item Code', 'Item Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost (INR)', 'Status'],
      rows: items.map((item) => [
        item.item_code || '—',
        item.name || '-',
        item.category || '-',
        String(item.type || '').toUpperCase(),
        `${item.available_quantity ?? 0} ${item.unit || ''}`.trim(),
        item.threshold_quantity ?? 0,
        Number(item.unit_cost || 0).toFixed(2),
        String(item.status || '').replace(/_/g, ' ').toUpperCase(),
      ]),
    }
    await exportReport(format, exportData)
  }

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
        <StatCard label="Total Items" value={stats.total} icon="IT" color="#1d4ed8" />
        <StatCard
          label="Total Value"
          value={`INR ${stats.value.toLocaleString('en-IN')}`}
          icon="VL"
          color="#16a34a"
        />
        <StatCard label="Low Stock" value={stats.lowStock} icon="LS" color="#f59e0b" />
        <StatCard label="Out of Stock" value={stats.outOfStock} icon="OS" color="#dc2626" />
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

          <ExportDropdown
            label="Download Report"
            onExport={handleExportReport}
            disabled={items.length === 0}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Item Code', 'Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost', 'Status']}
            rows={items.map((item) => [
              item.item_code || '—',
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
