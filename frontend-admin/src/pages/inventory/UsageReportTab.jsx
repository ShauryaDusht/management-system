import { useEffect, useMemo, useState } from 'react'
import { inventoryAPI } from '../../api/inventory'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  ExportDropdown,
  Field,
  Input,
  SelectField,
  Spinner,
  StatCard,
} from '../../components/ui'
import { exportReport } from '../../shared/exportHelper'
import { asList } from '../../shared/utils'

const localTodayISO = () => {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - offset * 60 * 1000)
  return localDate.toISOString().split('T')[0]
}

export default function UsageReportTab({ categoryScope = null, excludeCategoryScope = null }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')

  const loadData = async (from = dateFrom, to = dateTo) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (from) params.date_from = from
      if (to) params.date_to = to
      if (categoryScope) params.category = categoryScope
      if (excludeCategoryScope) params.exclude_category = excludeCategoryScope
      if (areaFilter !== 'all') params.area = areaFilter
      if (personFilter !== 'all') params.person = personFilter
      if (itemFilter !== 'all') params.item = itemFilter

      const { data } = await inventoryAPI.getUsageReport(params)
      setReport(data || null)
    } catch (e) {
      console.error('Failed to load usage report:', e)
      setError(e.response?.data?.detail || e.message || 'Failed to load usage report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(dateFrom, dateTo)
  }, [categoryScope, excludeCategoryScope, areaFilter, personFilter, itemFilter])

  const applyPreset = async (preset) => {
    const today = localTodayISO()
    let from = ''
    let to = ''
    if (preset === 'this_month') {
      const d = new Date()
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1)
      const offset = firstDay.getTimezoneOffset()
      from = new Date(firstDay.getTime() - offset * 60 * 1000).toISOString().split('T')[0]
      to = today
    } else if (preset === 'today') {
      from = today
      to = today
    }
    setDateFrom(from)
    setDateTo(to)
    await loadData(from, to)
  }

  const logs = useMemo(() => asList(report?.logs), [report])
  const summary = report?.summary || {
    total_logs: 0,
    total_quantity_used: 0,
    unique_items_count: 0,
    unique_areas_count: 0,
  }
  const itemSummary = report?.item_summary || []
  const areaSummary = report?.area_summary || []

  // Dynamic filter options
  const areaOptions = useMemo(() => {
    if (report?.filters?.areas?.length) return report.filters.areas
    const set = new Set()
    logs.forEach((l) => {
      if (l.area_name) set.add(l.area_name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [report, logs])

  const personOptions = useMemo(() => {
    if (report?.filters?.people?.length) return report.filters.people
    const set = new Set()
    logs.forEach((l) => {
      if (l.logged_by && l.logged_by !== '—') set.add(l.logged_by)
      if (l.requested_by && l.requested_by !== '—') set.add(l.requested_by)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [report, logs])

  const itemOptions = useMemo(() => {
    if (report?.filters?.items?.length) return report.filters.items
    const set = new Set()
    logs.forEach((l) => {
      if (l.item_name && l.item_name !== '—') set.add(l.item_name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [report, logs])

  const handleExport = async (format) => {
    const rangeSubtitle =
      dateFrom || dateTo
        ? `Date Range: ${dateFrom || 'Beginning'} to ${dateTo || 'Present'}`
        : 'All Time Records'

    const exportData = {
      filename: `horticulture_usage_report_${dateFrom || 'all'}_to_${dateTo || 'all'}`,
      module: categoryScope || 'Horticulture Inventory',
      title: 'Horticulture Item Usage Report',
      subtitle: rangeSubtitle,
      metadata: [
        { label: 'Scope', value: categoryScope || 'Horticulture Inventory' },
        { label: 'Date Range', value: rangeSubtitle },
        { label: 'Area Filter', value: areaFilter === 'all' ? 'All Areas' : areaFilter },
        { label: 'Person Filter', value: personFilter === 'all' ? 'All People' : personFilter },
        { label: 'Item Filter', value: itemFilter === 'all' ? 'All Items' : itemFilter },
        { label: 'Total Logs', value: summary.total_logs },
      ],
      stats: [
        { label: 'Total Usage Logs', value: summary.total_logs },
        { label: 'Total Quantity Consumed', value: summary.total_quantity_used },
        { label: 'Items Used', value: summary.unique_items_count },
        { label: 'Active Areas', value: summary.unique_areas_count },
      ],
      headers: [
        'Date & Time',
        'Area',
        'Item Name',
        'Item Code',
        'Quantity Used',
        'Unit',
        'Purpose / Work Done',
        'Reported By',
        'Requested By',
        'Issue ID',
      ],
      rows: logs.map((l) => [
        `${l.date} ${l.time}`.trim(),
        l.area_name || 'General',
        l.item_name || '—',
        l.item_code || '—',
        l.quantity_used,
        l.item_unit || '',
        l.purpose || '—',
        l.logged_by || '—',
        l.requested_by || '—',
        l.issue_id ? `#${l.issue_id}` : '—',
      ]),
    }

    await exportReport(format, exportData)
  }

  const isAllTime = !dateFrom && !dateTo
  const isThisMonth = dateFrom && dateFrom.endsWith('-01') && dateTo === localTodayISO()
  const isToday = dateFrom === localTodayISO() && dateTo === localTodayISO()

  return (
    <div>
      <Alert message={error} />

      {/* Main Filter & Action Card */}
      <Card noPad style={{ marginBottom: 14 }}>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1)' }}>
              Item Usage & Consumption Report
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Track consumable and stock usage reported by supervisors in the field
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ExportDropdown
              label="Download Report"
              onExport={handleExport}
              disabled={loading || logs.length === 0}
            />
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => loadData(dateFrom, dateTo)}
              disabled={loading}
            >
              ↻ Refresh
            </Btn>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
              Quick Presets
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn
                size="sm"
                variant={isToday ? 'primary' : 'ghost'}
                onClick={() => applyPreset('today')}
              >
                Today
              </Btn>
              <Btn
                size="sm"
                variant={isThisMonth ? 'primary' : 'ghost'}
                onClick={() => applyPreset('this_month')}
              >
                This Month
              </Btn>
              <Btn
                size="sm"
                variant={isAllTime ? 'primary' : 'ghost'}
                onClick={() => applyPreset('all_time')}
              >
                All Time
              </Btn>
            </div>
          </div>

          <div style={{ width: 145 }}>
            <Field label="From Date">
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  const val = e.target.value
                  setDateFrom(val)
                  loadData(val, dateTo)
                }}
              />
            </Field>
          </div>

          <div style={{ width: 145 }}>
            <Field label="To Date">
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  const val = e.target.value
                  setDateTo(val)
                  loadData(dateFrom, val)
                }}
              />
            </Field>
          </div>

          <div style={{ width: 180 }}>
            <Field label="Area">
              <SelectField value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                <option value="all">All Areas</option>
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>

          <div style={{ width: 170 }}>
            <Field label="Item">
              <SelectField value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
                <option value="all">All Items</option>
                {itemOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>

          <div style={{ width: 180 }}>
            <Field label="Reported By">
              <SelectField value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
                <option value="all">All People</option>
                {personOptions.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>

          {(dateFrom || dateTo || areaFilter !== 'all' || personFilter !== 'all' || itemFilter !== 'all') && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
                setAreaFilter('all')
                setPersonFilter('all')
                setItemFilter('all')
                loadData('', '')
              }}
              style={{ marginBottom: 2 }}
            >
              Clear Filters
            </Btn>
          )}
        </div>
      </Card>

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Card style={{ padding: '14px 16px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Usage Logs</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{summary.total_logs}</div>
        </Card>
        <Card style={{ padding: '14px 16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Qty Consumed</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#047857', marginTop: 4 }}>
            {summary.total_quantity_used}
          </div>
        </Card>
        <Card style={{ padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Items Consumed</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#b45309', marginTop: 4 }}>
            {summary.unique_items_count}
          </div>
        </Card>
        <Card style={{ padding: '14px 16px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Active Areas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>
            {summary.unique_areas_count}
          </div>
        </Card>
      </div>

      {/* Summary Breakdowns (Items & Areas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 16 }}>
        {itemSummary.length > 0 && (
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-1)' }}>
              Top Consumed Items
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {itemSummary.map((it) => (
                <div
                  key={it.item_name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--surface-2)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{it.item_name}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{it.log_count} log{it.log_count !== 1 ? 's' : ''}</span>
                    <strong style={{ color: '#047857', fontSize: 14 }}>
                      {it.total_used} {it.unit}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {areaSummary.length > 0 && (
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-1)' }}>
              Area Usage Activity
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {areaSummary.map((ar) => (
                <div
                  key={ar.area_name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--surface-2)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{ar.area_name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {(ar.items_used || []).join(', ')}
                    </span>
                    <Badge value={`${ar.log_count} entries`} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Main Usage Logs Table */}
      <Card noPad>
        <DataTable
          loading={loading}
          headers={[
            'Date & Time',
            'Area',
            'Item',
            'Quantity Used',
            'Purpose / Work Done',
            'Reported By',
            'Issue Reference',
          ]}
          rows={logs.map((l) => [
            <div key={`dt-${l.id}`}>
              <div style={{ fontWeight: 600 }}>{l.date}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.time}</div>
            </div>,
            <span key={`area-${l.id}`} style={{ fontWeight: 600, color: 'var(--text-2)' }}>
              {l.area_name}
            </span>,
            <div key={`item-${l.id}`}>
              <div style={{ fontWeight: 700 }}>{l.item_name}</div>
              {l.item_code && l.item_code !== '—' && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Code: {l.item_code}</div>
              )}
            </div>,
            <div key={`qty-${l.id}`} style={{ fontWeight: 800, color: '#047857', fontSize: 14 }}>
              {l.quantity_used} <span style={{ fontSize: 12, fontWeight: 500 }}>{l.item_unit}</span>
            </div>,
            <div key={`purp-${l.id}`} style={{ maxWidth: 260 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{l.purpose || '—'}</div>
              {l.notes && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{l.notes}</div>}
            </div>,
            <div key={`by-${l.id}`}>
              <div style={{ fontWeight: 600 }}>{l.logged_by}</div>
              {l.requested_by && l.requested_by !== l.logged_by && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Req: {l.requested_by}</div>
              )}
            </div>,
            <div key={`iss-${l.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {l.issue_id ? `Issue #${l.issue_id}` : '—'}
              {l.issued_quantity ? ` (${l.issued_quantity} ${l.item_unit})` : ''}
            </div>,
          ])}
          emptyMsg="No usage logs found for selected filters."
        />
      </Card>
    </div>
  )
}
