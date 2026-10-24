import { useEffect, useMemo, useState } from 'react'

import { Alert, Badge, Btn, Card, ExportDropdown, Spinner } from '../../components/ui'
import { TrendArea } from '../../components/ui/Charts'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'
import { exportReport } from '../../shared/exportHelper'
import { triggerDownload } from '../../shared/utils'
import {
  downloadPurchasePlanCSV,
  getPurchasePlan,
  listPurchasePlans,
  savePurchasePlan,
} from '../../api/inventory'


const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0)

const whole = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n) || 0)


function titleFor(month, year) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}


function shortTitleFor(month, year) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })
}


function formatDelta(value, formatter) {
  const formatted = formatter(value)
  return value > 0 ? `+${formatted}` : formatted
}


function compareText(value, formatter, previousLabel, noun = 'vs previous saved month') {
  if (!previousLabel) return 'Baseline month for planning'
  return `${formatDelta(value, formatter)} ${noun} (${previousLabel})`
}


function compareColor(value) {
  if (value > 0) return '#dc2626'
  if (value < 0) return '#16a34a'
  return 'var(--text-3)'
}


function Th({ children }) {
  return (
    <th style={{
      padding: '9px 12px',
      textAlign: 'left',
      fontWeight: 700,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--text-3)',
      borderBottom: '2px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}


function Td({ children, style }) {
  return <td style={{ padding: '10px 12px', color: 'var(--text-2)', ...style }}>{children}</td>
}


function MetricCard({ label, value, subtext, accent = '#2563eb' }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 210,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-3)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: accent }}>{value}</div>
      <div style={{ fontSize: 12, marginTop: 5, color: accent === 'var(--text)' ? 'var(--text-3)' : accent, fontWeight: 500 }}>
        {subtext}
      </div>
    </div>
  )
}


function EmptyCardState({ message }) {
  return (
    <div style={{
      minHeight: 180,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 13,
      padding: 24,
    }}>
      {message}
    </div>
  )
}


export default function PurchasePlannerPanel() {
  const { month, year, setMonth, setYear } = useMonthYear()
  const [plan, setPlan] = useState(null)
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState('')
  const [onlyRequested, setOnlyRequested] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadPeriods = async () => {
    setOverviewLoading(true)
    try {
      const { data } = await listPurchasePlans()
      setPeriods(data?.periods || [])
    } catch {
      setPeriods([])
    } finally {
      setOverviewLoading(false)
    }
  }

  const loadPlan = async (targetMonth, targetYear) => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const { data } = await getPurchasePlan(targetMonth, targetYear)
      setPlan(data)
      setDirty(false)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load purchase plan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlan(month, year)
    loadPeriods()
  }, [month, year])

  const updateRow = (itemId, field, value) => {
    setPlan((prev) => {
      if (!prev) return prev
      const nextRows = prev.rows.map((row) => {
        if (row.item_id !== itemId) return row
        const nextValue = field === 'purchase_quantity'
          ? Math.max(0, Number.parseInt(value || 0, 10) || 0)
          : Math.max(0, Number.parseFloat(value || 0) || 0)
        const nextRow = {
          ...row,
          [field]: nextValue,
        }
        nextRow.estimated_cost = Number((nextRow.purchase_quantity * nextRow.planned_unit_cost).toFixed(2))
        return nextRow
      })

      const summary = nextRows.reduce((acc, row) => {
        if (row.purchase_quantity > 0) {
          acc.purchase_items_count += 1
          acc.total_purchase_quantity += row.purchase_quantity
          acc.total_estimated_cost += Number(row.estimated_cost || 0)
        }
        return acc
      }, {
        items_count: nextRows.length,
        purchase_items_count: 0,
        total_purchase_quantity: 0,
        total_estimated_cost: 0,
      })
      summary.total_estimated_cost = Number(summary.total_estimated_cost.toFixed(2))

      return {
        ...prev,
        rows: nextRows,
        summary,
      }
    })
    setDirty(true)
    setNotice('')
  }

  const handleSave = async ({ silent = false } = {}) => {
    if (!plan) return null
    setSaving(true)
    setError('')
    if (!silent) setNotice('')
    try {
      const { data } = await savePurchasePlan(month, year, plan.rows)
      setPlan(data)
      setDirty(false)
      await loadPeriods()
      if (!silent) setNotice(`Saved ${titleFor(month, year)} purchase plan and updated inventory for newly received quantities.`)
      return data
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save purchase plan.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async (format) => {
    let latest = plan
    if (dirty) {
      latest = await handleSave({ silent: true })
      if (!latest) throw new Error('Could not save purchase plan.')
    }
    try {
      const visibleItemIds = filteredRows.map((row) => row.item_id)
      if (!visibleItemIds.length) {
        setError('No visible rows to export.')
        return
      }
      const suffix = hasActiveFilters ? '_filtered' : ''

      if (format === 'csv') {
        const resp = await downloadPurchasePlanCSV(month, year, visibleItemIds)
        triggerDownload(resp.data, `purchase_plan_${year}_${String(month).padStart(2, '0')}${suffix}.csv`)
        return
      }

      const exportData = {
        filename: `purchase_plan_${year}_${String(month).padStart(2, '0')}${suffix}`,
        module: 'Inventory Procurement',
        title: 'Monthly Purchase Plan Worksheet',
        subtitle: `Period: ${shortTitleFor(month, year)} • Items: ${filteredRows.length}`,
        metadata: [
          { label: 'Period', value: shortTitleFor(month, year) },
          { label: 'Category Filter', value: category || 'All Categories' },
          { label: 'Type Filter', value: type || 'All Types' },
          { label: 'Total Items In Plan', value: filteredRows.length },
        ],
        stats: [
          { label: 'Items To Purchase', value: filteredSummary.purchase_items_count },
          { label: 'Total Purchase Qty', value: filteredSummary.total_purchase_quantity },
          { label: 'Total Estimated Cost', value: inr(visibleEstimatedCost) },
        ],
        headers: ['Code', 'Item Name', 'Category', 'Type', 'Unit', 'Available', 'Purchase Price', 'Purchase Qty', 'Estimated Cost (INR)', 'Vendor', 'Notes'],
        rows: filteredRows.map((row) => [
          row.item_code || '-',
          row.item_name || '-',
          row.category || '-',
          String(row.item_type || '-').toUpperCase(),
          row.unit || '-',
          row.available_quantity ?? 0,
          Number(row.unit_cost ?? row.current_unit_cost ?? 0).toFixed(2),
          row.purchase_quantity ?? 0,
          Number(row.estimated_cost ?? 0).toFixed(2),
          row.vendor || '-',
          row.notes || '-',
        ]),
      }
      await exportReport(format, exportData)
    } catch {
      setError('Export failed.')
    }
  }

  const categories = useMemo(() => {
    const set = new Set((plan?.rows || []).map((row) => row.category).filter(Boolean))
    return [...set].sort()
  }, [plan])

  const requestedRows = useMemo(
    () => (plan?.rows || []).filter((row) => Number(row.purchase_quantity || 0) > 0),
    [plan]
  )

  const categorySpend = useMemo(() => {
    const totals = requestedRows.reduce((acc, row) => {
      const key = row.category || 'Uncategorized'
      if (!acc[key]) {
        acc[key] = { category: key, estimated_cost: 0, purchase_quantity: 0, items_count: 0 }
      }
      acc[key].estimated_cost += Number(row.estimated_cost || 0)
      acc[key].purchase_quantity += Number(row.purchase_quantity || 0)
      acc[key].items_count += 1
      return acc
    }, {})
    return Object.values(totals).sort((a, b) => b.estimated_cost - a.estimated_cost)
  }, [requestedRows])

  const topSpendRows = useMemo(
    () => [...requestedRows].sort((a, b) => Number(b.estimated_cost || 0) - Number(a.estimated_cost || 0)).slice(0, 5),
    [requestedRows]
  )

  const attentionRows = useMemo(() => (
    requestedRows
      .map((row) => ({
        ...row,
        shortfall_quantity: Math.max(Number(row.purchase_quantity || 0) - Number(row.available_quantity || 0), 0),
      }))
      .filter((row) => row.available_quantity <= 0 || row.shortfall_quantity > 0)
      .sort((a, b) => (
        Number(b.shortfall_quantity || 0) - Number(a.shortfall_quantity || 0)
        || Number(b.estimated_cost || 0) - Number(a.estimated_cost || 0)
      ))
      .slice(0, 5)
  ), [requestedRows])

  const zeroStockRequested = requestedRows.filter((row) => Number(row.available_quantity || 0) === 0).length
  const shortfallUnits = requestedRows.reduce(
    (sum, row) => sum + Math.max(Number(row.purchase_quantity || 0) - Number(row.available_quantity || 0), 0),
    0
  )
  const averageSpendPerItem = plan?.summary?.purchase_items_count
    ? Number(plan.summary.total_estimated_cost || 0) / Number(plan.summary.purchase_items_count || 1)
    : 0

  const timelinePeriods = useMemo(() => {
    const byKey = new Map()
    for (const period of periods) {
      byKey.set(`${period.year}-${period.month}`, period)
    }
    if (plan) {
      byKey.set(`${year}-${month}`, {
        id: plan.id,
        month,
        year,
        period_label: plan.period_label || titleFor(month, year),
        updated_at: plan.updated_at,
        updated_by_name: plan.updated_by_name,
        summary: plan.summary || {
          purchase_items_count: 0,
          total_purchase_quantity: 0,
          total_estimated_cost: 0,
        },
      })
    }
    return [...byKey.values()].sort((a, b) => (a.year - b.year) || (a.month - b.month))
  }, [month, year, periods, plan])

  const currentPeriodIndex = timelinePeriods.findIndex((period) => period.month === month && period.year === year)
  const previousPeriod = currentPeriodIndex > 0 ? timelinePeriods[currentPeriodIndex - 1] : null

  const costDelta = Number(plan?.summary?.total_estimated_cost || 0) - Number(previousPeriod?.summary?.total_estimated_cost || 0)
  const unitDelta = Number(plan?.summary?.total_purchase_quantity || 0) - Number(previousPeriod?.summary?.total_purchase_quantity || 0)

  const investmentTrend = timelinePeriods.map((period) => ({
    name: shortTitleFor(period.month, period.year),
    investment: Number(period.summary?.total_estimated_cost || 0),
  }))

  const filteredRows = useMemo(() => {
    let rows = plan?.rows || []
    if (category) rows = rows.filter((row) => row.category === category)
    if (type) rows = rows.filter((row) => row.item_type === type)
    if (onlyRequested) rows = rows.filter((row) => Number(row.purchase_quantity || 0) > 0)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((row) =>
        (row.item_name || '').toLowerCase().includes(q) ||
        (row.item_code || '').toLowerCase().includes(q) ||
        (row.category || '').toLowerCase().includes(q) ||
        (row.unit || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [plan, category, type, onlyRequested, search])

  const filteredSummary = filteredRows.reduce((acc, row) => {
    const quantity = Number(row.purchase_quantity || 0)
    const estimatedCost = Number(row.estimated_cost || 0)
    if (quantity > 0) {
      acc.purchase_items_count += 1
      acc.total_purchase_quantity += quantity
      acc.total_estimated_cost += estimatedCost
    }
    return acc
  }, {
    purchase_items_count: 0,
    total_purchase_quantity: 0,
    total_estimated_cost: 0,
  })
  const visibleEstimatedCost = Number(filteredSummary.total_estimated_cost || 0)
  const hasActiveFilters = Boolean(search.trim() || category || type || onlyRequested)
  const maxCategoryCost = categorySpend.length ? categorySpend[0].estimated_cost : 0

  return (
    <div>
      <Alert message={error} />
      <Alert message={notice} type="success" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Monthly Purchase Planner</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Enter received purchase quantities, save to update inventory stock once, and export the visible filtered worksheet.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <MonthYearPicker month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
            <Btn variant="secondary" onClick={() => { loadPlan(month, year); loadPeriods() }} disabled={loading || saving} style={{ marginBottom: 14 }}>
              Refresh
            </Btn>
            <Btn onClick={() => handleSave()} disabled={loading || saving || !plan} style={{ marginBottom: 14 }}>
              {saving ? 'Saving...' : dirty ? 'Save & Update Stock' : 'Saved'}
            </Btn>
            <div style={{ marginBottom: 14 }}>
              <ExportDropdown
                label="Export Plan"
                onExport={handleExport}
                disabled={loading || saving || !plan || !filteredRows.length}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Saved Monthly Plans
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {timelinePeriods.map((period) => {
              const active = period.month === month && period.year === year
              return (
                <button
                  key={`${period.year}-${period.month}`}
                  type="button"
                  onClick={() => {
                    setMonth(period.month)
                    setYear(period.year)
                  }}
                  style={{
                    borderRadius: 999,
                    border: active ? '1px solid #2563eb' : '1px solid var(--border)',
                    background: active ? '#eff6ff' : 'var(--surface)',
                    color: active ? '#1d4ed8' : 'var(--text-2)',
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {shortTitleFor(period.month, period.year)}
                </button>
              )
            })}
            {!timelinePeriods.length && (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {overviewLoading ? 'Loading saved months...' : 'No saved plans yet.'}
              </div>
            )}
          </div>
        </div>
      </Card>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>
        : <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <MetricCard
              label="Period"
              value={plan?.period_label || titleFor(month, year)}
              subtext={plan?.updated_by_name ? `Last saved by ${plan.updated_by_name}` : 'Default plan ready for review'}
              accent="var(--text)"
            />
            <MetricCard
              label="Planned Investment"
              value={inr(plan?.summary?.total_estimated_cost || 0)}
              subtext={compareText(costDelta, inr, previousPeriod?.period_label)}
              accent={compareColor(costDelta)}
            />
            <MetricCard
              label="Requested Materials"
              value={whole(plan?.summary?.purchase_items_count || 0)}
              subtext={`${whole(plan?.summary?.total_purchase_quantity || 0)} units planned, ${compareText(unitDelta, whole, previousPeriod?.period_label, 'units vs previous saved month')}`}
              accent="#2563eb"
            />
            <MetricCard
              label="Immediate Attention"
              value={whole(attentionRows.length)}
              subtext={`${whole(zeroStockRequested)} zero-stock items, shortfall of ${whole(shortfallUnits)} units`}
              accent="#ea580c"
            />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <Card style={{ flex: 1.35, minWidth: 360 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Month-by-Month Investment</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    Compare planned purchase value across saved months.
                  </div>
                </div>
                <Badge value={dirty ? 'unsaved' : 'saved'} style={dirty ? undefined : { background: '#d1fae5', color: '#065f46' }} />
              </div>

              {overviewLoading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} /></div>
                : investmentTrend.length
                  ? <>
                    <TrendArea
                      data={investmentTrend}
                      lines={[{ key: 'investment', label: 'Planned Investment' }]}
                      height={230}
                    />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                      <div style={{ flex: 1, minWidth: 180, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Average Spend Per Requested Item</div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5 }}>{inr(averageSpendPerItem)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 180, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Current Month Share</div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5 }}>
                          {timelinePeriods.length
                            ? `${((Number(plan?.summary?.total_estimated_cost || 0) / Math.max(1, timelinePeriods.reduce((sum, period) => sum + Number(period.summary?.total_estimated_cost || 0), 0))) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </div>
                      </div>
                    </div>
                  </>
                  : <EmptyCardState message="Saved monthly investment data will appear here once a purchase plan exists." />
              }
            </Card>

            <Card style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Category Spend Split</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Budget concentration for the current month purchase plan.
              </div>

              {!categorySpend.length
                ? <EmptyCardState message="Add requested quantities to see how the monthly budget is split by category." />
                : <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
                  {categorySpend.slice(0, 6).map((entry) => (
                    <div key={entry.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{entry.category}</div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#2563eb' }}>{inr(entry.estimated_cost)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {whole(entry.purchase_quantity)} units across {whole(entry.items_count)} items
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 9, marginTop: 7, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${maxCategoryCost ? Math.max(8, (entry.estimated_cost / maxCategoryCost) * 100) : 0}%`,
                          background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                          borderRadius: 999,
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              }
            </Card>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <Card style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Top Cost Drivers</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Highest investment items in {plan?.period_label || titleFor(month, year)}.
              </div>

              {!topSpendRows.length
                ? <EmptyCardState message="The biggest spend items will appear here once you add requested quantities." />
                : <div style={{ marginTop: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <Th>Item</Th>
                        <Th>Qty</Th>
                        <Th>Estimated Cost</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSpendRows.map((row) => (
                        <tr key={row.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{row.item_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                              {row.item_code || 'No code'} - {row.category || 'Uncategorized'}
                            </div>
                          </td>
                          <Td style={{ fontWeight: 700 }}>{whole(row.purchase_quantity)}</Td>
                          <Td style={{ fontWeight: 800, color: '#dc2626' }}>{inr(row.estimated_cost)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </Card>

            <Card style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Restock Watchlist</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Requested items where current stock is zero or cannot fully cover the plan.
              </div>

              {!attentionRows.length
                ? <EmptyCardState message="Current stock can cover the requested items, or there are no requested items yet." />
                : <div style={{ marginTop: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <Th>Item</Th>
                        <Th>Available</Th>
                        <Th>Shortfall</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {attentionRows.map((row) => (
                        <tr key={row.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{row.item_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                              Need {whole(row.purchase_quantity)} units
                            </div>
                          </td>
                          <Td style={{ fontWeight: 700, color: row.available_quantity === 0 ? '#dc2626' : '#ea580c' }}>
                            {whole(row.available_quantity)}
                          </Td>
                          <Td style={{ fontWeight: 800, color: '#dc2626' }}>
                            {whole(row.shortfall_quantity || row.purchase_quantity)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </Card>
          </div>

          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{plan?.period_label || titleFor(month, year)} Purchase Worksheet</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {plan?.summary?.items_count || 0} items total. Showing {filteredRows.length}. Visible estimated cost: <strong>{inr(visibleEstimatedCost)}</strong>
                  </div>
                </div>
                {dirty && <Badge value="unsaved" />}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  placeholder="Search item, code, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none', minWidth: 220 }}
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
                >
                  <option value="">All Categories</option>
                  {categories.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
                >
                  <option value="">All Types</option>
                  <option value="consumable">Consumable</option>
                  <option value="asset">Asset</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                  <input type="checkbox" checked={onlyRequested} onChange={(e) => setOnlyRequested(e.target.checked)} />
                  Only requested
                </label>
                {hasActiveFilters && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch('')
                      setCategory('')
                      setType('')
                      setOnlyRequested(false)
                    }}
                  >
                    Clear filters
                  </Btn>
                )}
              </div>
            </div>

            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Item</Th>
                    <Th>Category</Th>
                    <Th>Type</Th>
                    <Th>Unit</Th>
                    <Th>Available</Th>
                    <Th>Current Price</Th>
                    <Th>Purchase Price</Th>
                    <Th>Want To Purchase</Th>
                    <Th>Updated</Th>
                    <Th>Pending</Th>
                    <Th>Estimated Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0
                    ? <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>No items match the current filters.</td></tr>
                    : filteredRows.map((row) => (
                      <tr key={row.item_id} style={{ borderBottom: '1px solid var(--border)', background: row.purchase_quantity > 0 ? '#eff6ff55' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-3)' }}>{row.item_code || '-'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{row.item_name}</td>
                        <Td>{row.category}</Td>
                        <Td><Badge value={row.item_type} /></Td>
                        <Td>{row.unit}</Td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: row.available_quantity === 0 ? '#dc2626' : '#16a34a' }}>{row.available_quantity}</td>
                        <Td>{inr(row.current_unit_cost)}</Td>
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.planned_unit_cost}
                            onChange={(e) => updateRow(row.item_id, 'planned_unit_cost', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                          />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.purchase_quantity}
                            onChange={(e) => updateRow(row.item_id, 'purchase_quantity', e.target.value)}
                            style={{ width: 100, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                          />
                        </td>
                        <Td style={{ fontWeight: 700, color: Number(row.received_quantity || 0) > 0 ? '#065f46' : 'var(--text-3)' }}>
                          {whole(row.received_quantity || 0)}
                        </Td>
                        <Td style={{ fontWeight: 700, color: Number(row.pending_quantity || 0) > 0 ? '#c2410c' : 'var(--text-3)' }}>
                          {whole(row.pending_quantity || 0)}
                        </Td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{inr(row.estimated_cost)}</td>
                      </tr>
                    ))
                  }
                  {filteredRows.length > 0 && (
                    <tr style={{ background: 'var(--surface-2)', fontWeight: 800 }}>
                      <td colSpan={8} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>
                        Visible total estimated cost:
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1d4ed8' }}>
                        {filteredRows.reduce((sum, row) => sum + row.purchase_quantity, 0)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#065f46' }}>
                        {filteredRows.reduce((sum, row) => sum + Number(row.received_quantity || 0), 0)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c2410c' }}>
                        {filteredRows.reduce((sum, row) => sum + Number(row.pending_quantity || 0), 0)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 900, fontSize: 14, color: '#dc2626' }}>
                        {inr(visibleEstimatedCost)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      }
    </div>
  )
}

