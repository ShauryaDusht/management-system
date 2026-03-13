import { useEffect, useMemo, useState } from 'react'

import { reportsAPI } from '../../api/inventory'
import { Btn, Card, Spinner } from '../../components/ui'
import { BarGroupChart, DonutChart } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'
import { exportCsv, todayISO } from '../../shared/utils'

const VIEW_OPTIONS = [
  { key: 'caretaker', label: 'Caretaker/Supervisor Trend' },
  { key: 'area_hk', label: 'Area-wise HK Completion' },
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

const PIE_COLORS = ['#2d4a3e', '#c2622a', '#3b82f6', '#f59e0b', '#dc2626', '#0d9488']

function formatNum(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)
}

function buildTaskMix(rows) {
  const slices = [
    { name: 'Completed', value: sumRows(rows, 'done') },
    { name: 'Pending', value: sumRows(rows, 'pending') },
    { name: 'In Progress', value: sumRows(rows, 'in_progress') },
    { name: 'Skipped', value: sumRows(rows, 'skipped') },
  ].filter((item) => item.value > 0)

  return {
    total: slices.reduce((total, item) => total + item.value, 0),
    data: slices,
  }
}

function buildTopItemsShare(rows) {
  const ranked = rows
    .map((row) => ({
      name: row.item_name,
      value: Number(row.quantity || 0),
    }))
    .filter((row) => row.value > 0)

  const topRows = ranked.slice(0, 5)
  const total = ranked.reduce((sum, row) => sum + row.value, 0)
  const topTotal = topRows.reduce((sum, row) => sum + row.value, 0)
  const otherValue = Math.max(total - topTotal, 0)
  const data = otherValue > 0 ? [...topRows, { name: 'Others', value: otherValue }] : topRows

  return { total, data }
}

function InsightPiePanel({ title, subtitle, data, total, label, note }) {
  if (!data.length) return null

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
          {subtitle ? (
            <div style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 10 }}>{subtitle}</div>
          ) : null}
          <DonutChart data={data} total={total} label={label} size={220} />
        </div>

        <div>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.map((item, index) => {
              const percent = total > 0 ? (Number(item.value || 0) * 100) / total : 0
              return (
                <div
                  key={`${item.name}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: '#f8fafc',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: PIE_COLORS[index % PIE_COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{item.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{formatNum(item.value)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{percent.toFixed(1)}%</div>
                  </div>
                </div>
              )
            })}
          </div>

          {note ? (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)' }}>{note}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function InsightsPage() {
  const [range, setRange] = useState('weekly')
  const [areaClass, setAreaClass] = useState('all')
  const [activeView, setActiveView] = useState('caretaker')

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
        completion_pct: Number(row.completion_pct || 0),
        attendance_pct: Number(row.attendance_pct || 0),
        fair_score: Number(row.fair_score || 0),
      })),
    [areaRows],
  )

  const caretakerChartData = useMemo(
    () =>
      caretakerRows.slice(0, 15).map((row) => ({
        name: row.staff_name,
        completion_pct: Number(row.completion_pct || 0),
        attendance_pct: Number(row.attendance_pct || 0),
        fair_score: Number(row.fair_score || 0),
      })),
    [caretakerRows],
  )

  const workerChartData = useMemo(
    () =>
      workerRows.slice(0, 15).map((row) => ({
        name: row.worker_name,
        completion_pct: Number(row.completion_pct || 0),
        attendance_pct: Number(row.attendance_pct || 0),
        fair_score: Number(row.fair_score || 0),
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

  const caretakerTaskMix = useMemo(() => buildTaskMix(caretakerRows), [caretakerRows])
  const areaTaskMix = useMemo(() => buildTaskMix(areaRows), [areaRows])
  const workerTaskMix = useMemo(() => buildTaskMix(workerRows), [workerRows])
  const inventoryTypeMix = useMemo(
    () => ({
      total: Number(consumptionTotals.total_qty || 0),
      data: [
        { name: 'Consumables', value: Number(consumptionTotals.consumable_qty || 0) },
        { name: 'Assets', value: Number(consumptionTotals.asset_qty || 0) },
      ].filter((item) => item.value > 0),
    }),
    [consumptionTotals],
  )
  const topItemsShare = useMemo(() => buildTopItemsShare(topItemRows), [topItemRows])

  const exportCurrentCsv = () => {
    const day = todayISO()
    const baseName = `insights_${activeView}_${range}_${areaClass}_${day}.csv`

    if (activeView === 'caretaker') {
      exportCsv(
        baseName,
        [
          'Staff',
          'Role',
          'Areas',
          'Worker Count',
          'Total Tasks',
          'Completed',
          'Pending',
          'In Progress',
          'Skipped',
          'Completion %',
          'Attendance %',
          'Tasks/Worker',
          'Fair Score',
        ],
        caretakerRows.map((r) => [
          r.staff_name,
          r.role,
          (r.areas || []).join(' | '),
          r.worker_count || 0,
          r.total || 0,
          r.done || 0,
          r.pending || 0,
          r.in_progress || 0,
          r.skipped || 0,
          Number(r.completion_pct || 0).toFixed(1),
          Number(r.attendance_pct || 0).toFixed(1),
          Number(r.tasks_per_worker || 0).toFixed(2),
          Number(r.fair_score || 0).toFixed(2),
        ]),
      )
      return
    }

    if (activeView === 'area_hk') {
      exportCsv(
        baseName,
        [
          'Area',
          'Area Class',
          'Worker Count',
          'Total Tasks',
          'Completed',
          'Pending',
          'In Progress',
          'Skipped',
          'Completion %',
          'Attendance %',
          'Tasks/Worker',
          'Fair Score',
        ],
        areaRows.map((r) => [
          r.area_name,
          r.area_class,
          r.worker_count || 0,
          r.total || 0,
          r.done || 0,
          r.pending || 0,
          r.in_progress || 0,
          r.skipped || 0,
          Number(r.completion_pct || 0).toFixed(1),
          Number(r.attendance_pct || 0).toFixed(1),
          Number(r.tasks_per_worker || 0).toFixed(2),
          Number(r.fair_score || 0).toFixed(2),
        ]),
      )
      return
    }

    if (activeView === 'workers') {
      exportCsv(
        baseName,
        [
          'Worker',
          'Areas',
          'Total Tasks',
          'Completed',
          'Pending',
          'In Progress',
          'Skipped',
          'Completion %',
          'Attendance %',
          'Fair Score',
        ],
        workerRows.map((r) => [
          r.worker_name,
          (r.areas || []).join(' | '),
          r.total || 0,
          r.done || 0,
          r.pending || 0,
          r.in_progress || 0,
          r.skipped || 0,
          Number(r.completion_pct || 0).toFixed(1),
          Number(r.attendance_pct || 0).toFixed(1),
          Number(r.fair_score || 0).toFixed(2),
        ]),
      )
      return
    }

    if (activeView === 'area_inventory') {
      exportCsv(
        baseName,
        ['Area', 'Area Class', 'Transactions', 'Consumable Qty', 'Asset Qty', 'Total Qty'],
        invAreaRows.map((r) => [
          r.area_name,
          r.area_class,
          r.transactions || 0,
          r.consumable_qty || 0,
          r.asset_qty || 0,
          r.total_qty || 0,
        ]),
      )
      return
    }

    exportCsv(
      baseName,
      ['Item', 'Type', 'Quantity', 'Transactions', 'Area Count', 'Areas'],
      topItemRows.map((r) => [
        r.item_name,
        r.item_type,
        r.quantity || 0,
        r.transactions || 0,
        r.areas_count || 0,
        (r.areas || []).join(' | '),
      ]),
    )
  }

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <Btn size="sm" variant="secondary" onClick={exportCurrentCsv}>Export CSV</Btn>
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
        ) : activeView === 'caretaker' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Caretaker / Supervisor Trend</div>
            {caretakerChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={caretakerChartData}
                  bars={[
                    { key: 'completion_pct', label: 'Completion %' },
                    { key: 'attendance_pct', label: 'Attendance %' },
                    { key: 'fair_score', label: 'Fair Score' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Winner: <strong>{caretakerWinner?.staff_name || '-'}</strong>
                  {' '}| Score {Number(caretakerWinner?.fair_score || 0).toFixed(2)}
                  {' '}| Completion {Number(caretakerWinner?.completion_pct || 0).toFixed(1)}%
                  {' '}| Attendance {Number(caretakerWinner?.attendance_pct || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
                  Comparison is fairness-based: completion, attendance, task-volume confidence and workload per worker.
                </div>
                <InsightPiePanel
                  title="Task Distribution"
                  subtitle="Combined status mix for the selected caretaker and supervisor group"
                  data={caretakerTaskMix.data}
                  total={caretakerTaskMix.total}
                  label="Total Tasks"
                  note="This pie view helps admin quickly see whether the selected staff pool is closing tasks or carrying too much pending load."
                />
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No caretaker/supervisor data for selected filters.</div>
            )}
          </>
        ) : activeView === 'area_hk' ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Area-wise HK Completion</div>
            {areaChartData.length > 0 ? (
              <>
                <BarGroupChart
                  data={areaChartData}
                  bars={[
                    { key: 'completion_pct', label: 'Completion %' },
                    { key: 'attendance_pct', label: 'Attendance %' },
                    { key: 'fair_score', label: 'Fair Score' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Winner: <strong>{areaWinner?.area_name || '-'}</strong>
                  {' '}| Score {Number(areaWinner?.fair_score || 0).toFixed(2)}
                  {' '}| Completion {Number(areaWinner?.completion_pct || 0).toFixed(1)}%
                  {' '}| Attendance {Number(areaWinner?.attendance_pct || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
                  Fair score balances completion quality with worker strength and load, so low-volume areas are not over-favored.
                </div>
                <InsightPiePanel
                  title="Area Task Distribution"
                  subtitle="Overall task outcome split across the selected housekeeping areas"
                  data={areaTaskMix.data}
                  total={areaTaskMix.total}
                  label="Total Tasks"
                  note="Use this second visual to judge whether the selected zone mix is mostly completed work or still carrying pending and in-progress tasks."
                />
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No area-wise HK data for selected filters.</div>
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
                    { key: 'completion_pct', label: 'Completion %' },
                    { key: 'attendance_pct', label: 'Attendance %' },
                    { key: 'fair_score', label: 'Fair Score' },
                  ]}
                  height={320}
                />
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Top worker: <strong>{workerWinner?.worker_name || '-'}</strong>
                  {' '}| Score {Number(workerWinner?.fair_score || 0).toFixed(2)}
                  {' '}| Completion {Number(workerWinner?.completion_pct || 0).toFixed(1)}%
                  {' '}| Attendance {Number(workerWinner?.attendance_pct || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
                  Ranking uses fair score so very small task samples do not dominate.
                </div>
                <InsightPiePanel
                  title="Worker Task Distribution"
                  subtitle="Combined task status split across the selected worker set"
                  data={workerTaskMix.data}
                  total={workerTaskMix.total}
                  label="Total Tasks"
                  note="This lower pie chart gives admin a quick workload health view for workers beyond the fair-score ranking above."
                />
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
                <InsightPiePanel
                  title="Consumption Type Split"
                  subtitle="Overall material mix for the selected inventory area filter"
                  data={inventoryTypeMix.data}
                  total={inventoryTypeMix.total}
                  label="Total Qty"
                  note="Admin can use this pie to see whether the current consumption load is dominated by consumables or by asset movement."
                />
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
                <InsightPiePanel
                  title="Top Item Share"
                  subtitle="Top five items by quantity with the remaining items grouped together"
                  data={topItemsShare.data}
                  total={topItemsShare.total}
                  label="Consumed Qty"
                  note="This second view helps admin judge whether inventory usage is concentrated in a few items or spread widely across stock."
                />
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
