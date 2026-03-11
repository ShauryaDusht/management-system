import { useEffect, useMemo, useState } from 'react'

import { reportsAPI } from '../../api/inventory'
import { Btn, Card, Spinner } from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'

const VIEW_OPTIONS = [
  { key: 'area_hk', label: 'Area-wise HK Completion' },
  { key: 'caretaker', label: 'Caretaker/Supervisor Trend' },
  { key: 'area_inventory', label: 'Area-wise Inventory Consumption' },
  { key: 'top_items', label: 'Most Consumed Inventory Items' },
  { key: 'workers', label: 'Worker Performance Trend' },
]

const AREA_CLASS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'hostels', label: 'Hostels' },
  { key: 'academic', label: 'Academic Blocks' },
  { key: 'others', label: 'Others' },
]

function formatNum(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

export default function InsightsPage() {
  const [range, setRange] = useState('weekly')
  const [areaClass, setAreaClass] = useState('all')
  const [activeView, setActiveView] = useState('area_hk')

  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await reportsAPI.getDashboardInsights({
          range,
          area_class: areaClass,
        })
        if (!alive) return
        setInsights(data || null)
      } catch (e) {
        if (!alive) return
        setError(e?.response?.data?.detail || 'Failed to load insights data.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [range, areaClass])

  const areaRows = Array.isArray(insights?.area_performance?.rows) ? insights.area_performance.rows : []
  const caretakerRows = Array.isArray(insights?.caretaker_supervisor_performance?.rows)
    ? insights.caretaker_supervisor_performance.rows
    : []
  const workerRows = Array.isArray(insights?.worker_performance?.rows) ? insights.worker_performance.rows : []
  const invAreaRows = Array.isArray(insights?.inventory_consumption?.areas)
    ? insights.inventory_consumption.areas
    : []
  const topItemRows = Array.isArray(insights?.inventory_consumption?.top_items)
    ? insights.inventory_consumption.top_items
    : []

  const areaWinner = insights?.area_performance?.winner || null
  const caretakerWinner = insights?.caretaker_supervisor_performance?.winner || null
  const workerWinner = insights?.worker_performance?.winner || null
  const consumptionTotals = insights?.inventory_consumption?.totals || {
    transactions: 0,
    consumable_qty: 0,
    asset_qty: 0,
    total_qty: 0,
  }

  const areaChartData = useMemo(
    () =>
      areaRows.slice(0, 15).map((row) => ({
        name: row.area_name,
        completed: Number(row.done || 0),
        pending: Number(row.pending_total || 0),
        total: Number(row.total || 0),
      })),
    [areaRows],
  )

  const caretakerChartData = useMemo(
    () =>
      caretakerRows.slice(0, 15).map((row) => ({
        name: row.staff_name,
        completed: Number(row.done || 0),
        pending: Number(row.pending_total || 0),
        total: Number(row.total || 0),
      })),
    [caretakerRows],
  )

  const workerChartData = useMemo(
    () =>
      workerRows.slice(0, 15).map((row) => ({
        name: row.worker_name,
        completed: Number(row.done || 0),
        pending: Number(row.pending_total || 0),
        total: Number(row.total || 0),
      })),
    [workerRows],
  )

  const invAreaChartData = useMemo(
    () =>
      invAreaRows.slice(0, 15).map((row) => ({
        name: row.area_name,
        consumables: Number(row.consumable_qty || 0),
        assets: Number(row.asset_qty || 0),
        total: Number(row.total_qty || 0),
      })),
    [invAreaRows],
  )

  const topItemChartData = useMemo(
    () =>
      topItemRows.slice(0, 15).map((row) => ({
        name: row.item_name,
        quantity: Number(row.quantity || 0),
        transactions: Number(row.transactions || 0),
      })),
    [topItemRows],
  )

  return (
    <AdminLayout
      title="Insights"
      subtitle="Area, staff and worker performance with inventory consumption trends"
    >
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {VIEW_OPTIONS.map((option) => (
            <Btn
              key={option.key}
              size="sm"
              variant={activeView === option.key ? 'primary' : 'secondary'}
              onClick={() => setActiveView(option.key)}
            >
              {option.label}
            </Btn>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant={range === 'today' ? 'primary' : 'secondary'} onClick={() => setRange('today')}>
              Today
            </Btn>
            <Btn size="sm" variant={range === 'weekly' ? 'primary' : 'secondary'} onClick={() => setRange('weekly')}>
              Weekly
            </Btn>
            <Btn size="sm" variant={range === 'monthly' ? 'primary' : 'secondary'} onClick={() => setRange('monthly')}>
              Monthly
            </Btn>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {AREA_CLASS_OPTIONS.map((option) => (
              <Btn
                key={option.key}
                size="sm"
                variant={areaClass === option.key ? 'primary' : 'secondary'}
                onClick={() => setAreaClass(option.key)}
              >
                {option.label}
              </Btn>
            ))}
          </div>
        </div>
      </Card>

      {error ? (
        <Card style={{ marginBottom: 14, borderColor: '#fecaca', background: '#fff1f2' }}>
          <div style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{error}</div>
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
            <Spinner />
          </div>
        ) : activeView === 'area_hk' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Area-wise HK Completion</div>
            {areaChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={areaChartData}
                  bars={[
                    { key: 'completed', label: 'Completed' },
                    { key: 'pending', label: 'Pending + In Progress' },
                    { key: 'total', label: 'Total Tasks' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Winner: <strong>{areaWinner?.area_name || '-'}</strong> ({Number(areaWinner?.completion_pct || 0).toFixed(1)}%)
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No area-wise HK data for selected filters.</div>
            )}
          </>
        ) : activeView === 'caretaker' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Caretaker / Supervisor Trend</div>
            {caretakerChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={caretakerChartData}
                  bars={[
                    { key: 'completed', label: 'Completed' },
                    { key: 'pending', label: 'Pending + In Progress' },
                    { key: 'total', label: 'Total Tasks' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Top performer: <strong>{caretakerWinner?.staff_name || '-'}</strong> ({Number(caretakerWinner?.completion_pct || 0).toFixed(1)}%)
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No caretaker/supervisor data for selected filters.</div>
            )}
          </>
        ) : activeView === 'workers' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Worker Performance Trend</div>
            {workerChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={workerChartData}
                  bars={[
                    { key: 'completed', label: 'Completed' },
                    { key: 'pending', label: 'Pending + In Progress' },
                    { key: 'total', label: 'Total Tasks' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Top worker: <strong>{workerWinner?.worker_name || '-'}</strong> ({Number(workerWinner?.completion_pct || 0).toFixed(1)}%)
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No worker-level data for selected filters.</div>
            )}
          </>
        ) : activeView === 'area_inventory' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Area-wise Inventory Consumption</div>
            {invAreaChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={invAreaChartData}
                  bars={[
                    { key: 'consumables', label: 'Consumables Qty' },
                    { key: 'assets', label: 'Assets Qty' },
                    { key: 'total', label: 'Total Qty' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div>Transactions: <strong>{formatNum(consumptionTotals.transactions)}</strong></div>
                  <div>Total Qty: <strong>{formatNum(consumptionTotals.total_qty)}</strong></div>
                  <div>Consumables: <strong>{formatNum(consumptionTotals.consumable_qty)}</strong></div>
                  <div>Assets: <strong>{formatNum(consumptionTotals.asset_qty)}</strong></div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No area-wise inventory consumption data.</div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Most Consumed Inventory Items</div>
            {topItemChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={topItemChartData}
                  bars={[
                    { key: 'quantity', label: 'Consumed Qty' },
                    { key: 'transactions', label: 'Transactions' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Most consumed: <strong>{topItemRows[0]?.item_name || '-'}</strong> ({formatNum(topItemRows[0]?.quantity)} units)
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No item consumption data for selected filters.</div>
            )}
          </>
        )}
      </Card>
    </AdminLayout>
  )
}
