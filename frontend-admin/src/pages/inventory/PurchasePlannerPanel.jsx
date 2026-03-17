import { useEffect, useMemo, useState } from 'react'

import { Alert, Badge, Btn, Card, Spinner } from '../../components/ui'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'
import { triggerDownload } from '../../shared/utils'
import {
  downloadPurchasePlanCSV,
  getPurchasePlan,
  savePurchasePlan,
} from '../../api/inventory'


const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0)


function titleFor(month, year) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
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


export default function PurchasePlannerPanel() {
  const { month, year, setMonth, setYear } = useMonthYear()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState('')
  const [onlyRequested, setOnlyRequested] = useState(false)
  const [dirty, setDirty] = useState(false)

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
      if (!silent) setNotice(`Saved ${titleFor(month, year)} purchase plan.`)
      return data
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save purchase plan.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    let latest = plan
    if (dirty) {
      latest = await handleSave({ silent: true })
      if (!latest) return
    }
    try {
      const resp = await downloadPurchasePlanCSV(month, year)
      triggerDownload(resp.data, `purchase_plan_${year}_${String(month).padStart(2, '0')}.csv`)
    } catch {
      setError('CSV export failed.')
    }
  }

  const categories = useMemo(() => {
    const set = new Set((plan?.rows || []).map((row) => row.category).filter(Boolean))
    return [...set].sort()
  }, [plan])

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

  const visibleEstimatedCost = filteredRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0)

  return (
    <div>
      <Alert message={error} />
      <Alert message={notice} type="success" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Purchase Planner</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Saved monthly purchase worksheet with editable quantity, unit price, and CSV export.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <MonthYearPicker month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
            <Btn variant="secondary" onClick={() => loadPlan(month, year)} disabled={loading || saving} style={{ marginBottom: 14 }}>
              Refresh
            </Btn>
            <Btn onClick={() => handleSave()} disabled={loading || saving || !plan} style={{ marginBottom: 14 }}>
              {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
            </Btn>
            <Btn variant="secondary" onClick={handleExport} disabled={loading || saving || !plan} style={{ marginBottom: 14 }}>
              Export CSV
            </Btn>
          </div>
        </div>
      </Card>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>
        : <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Period</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{plan?.period_label || titleFor(month, year)}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>
                {plan?.updated_by_name ? `Last saved by ${plan.updated_by_name}` : 'Default plan ready'}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Items To Purchase</div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: '#2563eb' }}>{plan?.summary?.purchase_items_count || 0}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#2563eb', fontWeight: 500 }}>
                {plan?.summary?.total_purchase_quantity || 0} total units
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estimated Purchase Cost</div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: '#dc2626' }}>{inr(plan?.summary?.total_estimated_cost || 0)}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#dc2626', fontWeight: 500 }}>
                {dirty ? 'Unsaved edits included on screen' : 'Saved planner total'}
              </div>
            </div>
          </div>

          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{plan?.period_label || titleFor(month, year)} Purchase Worksheet</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {plan?.summary?.items_count || 0} items · Showing {filteredRows.length} · Visible estimated cost: <strong>{inr(visibleEstimatedCost)}</strong>
                  </div>
                </div>
                {dirty && <Badge value="unsaved" />}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  placeholder="Search item / code / category..."
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
                    <Th>Current Cost</Th>
                    <Th>Purchase Cost</Th>
                    <Th>Want To Purchase</Th>
                    <Th>Estimated Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0
                    ? <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>No items match the current filters.</td></tr>
                    : filteredRows.map((row) => (
                      <tr key={row.item_id} style={{ borderBottom: '1px solid var(--border)', background: row.purchase_quantity > 0 ? '#eff6ff55' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-3)' }}>{row.item_code || '—'}</td>
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
