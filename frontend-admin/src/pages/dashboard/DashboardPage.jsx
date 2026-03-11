import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI, reportsAPI } from '../../api/inventory'
import { hkAPI } from '../../api/housekeeping'
import { Btn, Card, Spinner, StatCard } from '../../components/ui'
import { DonutChart, TrendArea } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'

function getHortiStatus(task) {
  return String(task?.status || '').toLowerCase()
}

export default function DashboardPage() {
  const [invSummary, setInvSummary] = useState(null)
  const [hkSummary, setHkSummary] = useState(null)
  const [hortiSummary, setHortiSummary] = useState(null)

  const [trendRange, setTrendRange] = useState('weekly')
  const [trendModule, setTrendModule] = useState('all')
  const [trendData, setTrendData] = useState([])
  const [trendTotals, setTrendTotals] = useState(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const fetchData = async () => {
      setTrendLoading(true)
      try {
        const [inv, hk, horti, trend] = await Promise.all([
          inventoryAPI.getDashboard().catch(() => null),
          hkAPI.getDashboardSummary().catch(() => null),
          horticultureAPI.getSummary().catch(() => null),
          reportsAPI.getActivityTrend({ range: trendRange }).catch(() => null),
        ])

        if (!alive) return

        setInvSummary(inv?.data || null)
        setHkSummary(hk?.data || null)
        setHortiSummary(horti?.data || null)

        const series = Array.isArray(trend?.data?.series) ? trend.data.series : []
        setTrendData(
          series.map((row) => ({
            name: row.label || row.date,
            inventory: Number(row.inventory || 0),
            housekeeping: Number(row.housekeeping || 0),
            horticulture: Number(row.horticulture || 0),
            total: Number(row.total || 0),
            inventory_requests: Number(row.inventory_requests || 0),
            inventory_issues: Number(row.inventory_issues || 0),
            inventory_stock_additions: Number(row.inventory_stock_additions || 0),
            inventory_purchase_requests: Number(row.inventory_purchase_requests || 0),
            hk_done: Number(row.hk_done || 0),
            hk_pending: Number(row.hk_pending || 0),
            hk_in_progress: Number(row.hk_in_progress || 0),
            hk_skipped: Number(row.hk_skipped || 0),
          })),
        )
        setTrendTotals(trend?.data?.totals || null)
      } finally {
        if (alive) {
          setTrendLoading(false)
          setLoading(false)
        }
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [trendRange])

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  )

  const inStockCount = invSummary
    ? invSummary.in_stock_count ??
      Math.max(
        0,
        (invSummary.total_items || 0) -
          (invSummary.low_stock_count || 0) -
          (invSummary.out_of_stock_count || 0),
      )
    : 0

  const invDonut = invSummary
    ? [
        { name: 'In Stock', value: inStockCount },
        { name: 'Low Stock', value: invSummary.low_stock_count || 0 },
        { name: 'Out of Stock', value: invSummary.out_of_stock_count || 0 },
      ]
    : []

  const hkDonut = hkSummary
    ? [
        { name: 'Done', value: hkSummary.done_tasks || 0 },
        { name: 'Pending', value: hkSummary.pending_tasks || 0 },
      ]
    : []
  const hkHasActivity = hkDonut.some((d) => d.value > 0)
  const hkDonutData = hkHasActivity ? hkDonut : [{ name: 'No Activity', value: 1 }]

  const hortiTasks = Array.isArray(hortiSummary?.tasks) ? hortiSummary.tasks : []
  const hortiDone = hortiTasks.filter((task) => ['done', 'completed'].includes(getHortiStatus(task))).length
  const hortiOngoing = hortiTasks.filter((task) => ['ongoing', 'in_progress'].includes(getHortiStatus(task))).length
  const hortiPending = Math.max(0, hortiTasks.length - hortiDone - hortiOngoing)
  const hortiDonut = [
    { name: 'Completed', value: hortiDone },
    { name: 'Ongoing', value: hortiOngoing },
    { name: 'Pending', value: hortiPending },
  ]
  const hortiHasActivity = hortiDonut.some((d) => d.value > 0)
  const hortiDonutData = hortiHasActivity ? hortiDonut : [{ name: 'No Activity', value: 1 }]

  const trendLines =
    trendModule === 'inventory'
      ? [
          { key: 'inventory', label: 'Total Inventory Activity' },
          { key: 'inventory_requests', label: 'Requests' },
          { key: 'inventory_issues', label: 'Issues' },
          { key: 'inventory_stock_additions', label: 'Stock Additions' },
          { key: 'inventory_purchase_requests', label: 'Purchase Requests' },
        ]
      : trendModule === 'housekeeping'
        ? [
            { key: 'housekeeping', label: 'Total HK Tasks' },
            { key: 'hk_done', label: 'Completed' },
            { key: 'hk_pending', label: 'Pending' },
            { key: 'hk_in_progress', label: 'In Progress' },
            { key: 'hk_skipped', label: 'Skipped' },
          ]
        : trendModule === 'horticulture'
          ? [{ key: 'horticulture', label: 'Horticulture Activity' }]
          : [
              { key: 'inventory', label: 'Inventory' },
              { key: 'housekeeping', label: 'Housekeeping' },
              { key: 'horticulture', label: 'Horticulture' },
            ]

  const trendHasActivity = trendData.some((row) =>
    trendLines.some((line) => Number(row?.[line.key] || 0) > 0),
  )

  const trendSummaryItems =
    trendModule === 'inventory'
      ? [
          { label: 'Total Inventory', value: trendTotals?.inventory ?? 0 },
          { label: 'Requests', value: trendTotals?.inventory_requests ?? 0 },
          { label: 'Issues', value: trendTotals?.inventory_issues ?? 0 },
          { label: 'Stock Additions', value: trendTotals?.inventory_stock_additions ?? 0 },
          { label: 'Purchase Requests', value: trendTotals?.inventory_purchase_requests ?? 0 },
        ]
      : trendModule === 'housekeeping'
        ? [
            { label: 'Total HK Tasks', value: trendTotals?.housekeeping ?? 0 },
            { label: 'Completed', value: trendTotals?.hk_done ?? 0 },
            { label: 'Pending', value: trendTotals?.hk_pending ?? 0 },
            { label: 'In Progress', value: trendTotals?.hk_in_progress ?? 0 },
            { label: 'Skipped', value: trendTotals?.hk_skipped ?? 0 },
          ]
        : trendModule === 'horticulture'
          ? [{ label: 'Total Horticulture', value: trendTotals?.horticulture ?? 0 }]
          : [
              { label: 'Inventory', value: trendTotals?.inventory ?? 0 },
              { label: 'Housekeeping', value: trendTotals?.housekeeping ?? 0 },
              { label: 'Horticulture', value: trendTotals?.horticulture ?? 0 },
            ]

  const statCards = [
    {
      label: 'Total Inventory Items',
      value: invSummary?.total_items ?? '-',
      icon: '📦',
      color: 'var(--green-800)',
      sub: `${invSummary?.pending_requests ?? 0} requests pending`,
      to: '/inventory?tab=items',
    },
    {
      label: 'Low Stock Alerts',
      value: invSummary?.low_stock_count ?? '-',
      icon: '⚠️',
      color: 'var(--orange-600)',
      sub: `${invSummary?.out_of_stock_count ?? 0} out of stock`,
      to: '/inventory?tab=items',
    },
    {
      label: 'HK Tasks Today',
      value: hkSummary?.total_tasks ?? '-',
      icon: '🧹',
      color: 'var(--green-700)',
      sub: `${hkSummary?.completion_pct ?? 0}% completed`,
      to: '/housekeeping?tab=overview',
    },
    {
      label: 'HK Workers',
      value: hkSummary?.total_workers ?? '-',
      icon: '👷',
      color: '#3b82f6',
      sub: `${hkSummary?.present_today ?? 0} present today`,
      to: '/housekeeping?tab=attendance',
    },
    {
      label: 'Unreturned Assets',
      value: invSummary?.unreturned_assets ?? '-',
      icon: '🔁',
      color: '#f59e0b',
      sub: `${invSummary?.overdue_returns ?? 0} overdue`,
      to: '/inventory?tab=issues',
    },
    {
      label: 'Pending Stock Req.',
      value: hkSummary?.pending_stock_requests ?? '-',
      icon: '📋',
      color: 'var(--orange-600)',
      sub: 'Open approval queue',
      to: '/inventory?tab=requests',
    },
  ]

  return (
    <AdminLayout title="Admin Dashboard" subtitle={`Welcome back - ${todayLabel}`}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={36} />
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {statCards.map((card) => (
              <a
                key={card.label}
                href={card.to}
                style={{
                  height: '100%',
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                title={`Open ${card.label}`}
              >
                <StatCard
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  color={card.color}
                  sub={card.sub}
                  style={{ height: '100%', cursor: 'pointer', userSelect: 'none' }}
                />
              </a>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Stock overview</div>
                </div>
                <Link to="/inventory">
                  <Btn size="sm" variant="ghost">View -&gt;</Btn>
                </Link>
              </div>
              {invSummary && invDonut.some((d) => d.value > 0) ? (
                <>
                  <DonutChart data={invDonut} total={invSummary.total_items} label="Items" size={160} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    {invDonut.map((d, i) => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: ['#2d4a3e', '#c2622a', '#dc2626'][i],
                            display: 'inline-block',
                          }}
                        />
                        {d.name}: <strong>{d.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '30px 0' }}>No data</div>
              )}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Housekeeping</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Today tasks</div>
                </div>
                <Link to="/housekeeping">
                  <Btn size="sm" variant="ghost">View -&gt;</Btn>
                </Link>
              </div>
              {hkSummary ? (
                <>
                  <DonutChart
                    data={hkDonutData}
                    total={hkSummary.total_tasks}
                    label={hkHasActivity ? 'Tasks' : 'No Activity'}
                    size={160}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d4a3e', display: 'inline-block' }} />
                      Done: <strong>{hkSummary.done_tasks || 0}</strong>
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c2622a', display: 'inline-block' }} />
                      Pending: <strong>{hkSummary.pending_tasks || 0}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '30px 0' }}>No housekeeping data yet</div>
              )}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Horticulture</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Task status</div>
                </div>
                <Link to="/horticulture">
                  <Btn size="sm" variant="ghost">View -&gt;</Btn>
                </Link>
              </div>
              <DonutChart
                data={hortiDonutData}
                total={hortiTasks.length}
                label={hortiHasActivity ? 'Tasks' : 'No Activity'}
                size={160}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {hortiDonut.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: ['#2d4a3e', '#c2622a', '#dc2626'][i],
                        display: 'inline-block',
                      }}
                    />
                    {d.name}: <strong>{d.value}</strong>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>Activity Trend</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn
                  size="sm"
                  variant={trendRange === 'today' ? 'primary' : 'secondary'}
                  onClick={() => setTrendRange('today')}
                >
                  Today
                </Btn>
                <Btn
                  size="sm"
                  variant={trendRange === 'weekly' ? 'primary' : 'secondary'}
                  onClick={() => setTrendRange('weekly')}
                >
                  Weekly
                </Btn>
                <Btn
                  size="sm"
                  variant={trendRange === 'monthly' ? 'primary' : 'secondary'}
                  onClick={() => setTrendRange('monthly')}
                >
                  Monthly
                </Btn>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <Btn
                size="sm"
                variant={trendModule === 'all' ? 'primary' : 'secondary'}
                onClick={() => setTrendModule('all')}
              >
                All
              </Btn>
              <Btn
                size="sm"
                variant={trendModule === 'inventory' ? 'primary' : 'secondary'}
                onClick={() => setTrendModule('inventory')}
              >
                Inventory
              </Btn>
              <Btn
                size="sm"
                variant={trendModule === 'housekeeping' ? 'primary' : 'secondary'}
                onClick={() => setTrendModule('housekeeping')}
              >
                Housekeeping
              </Btn>
              <Btn
                size="sm"
                variant={trendModule === 'horticulture' ? 'primary' : 'secondary'}
                onClick={() => setTrendModule('horticulture')}
              >
                Horticulture
              </Btn>
            </div>
            {trendLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Spinner />
              </div>
            ) : trendData.length > 0 ? (
              <>
                <TrendArea
                  data={trendData}
                  lines={trendLines}
                  height={220}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {trendSummaryItems.map((item) => (
                    <div key={item.label} style={{ fontSize: 12 }}>
                      {item.label}: <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                {!trendHasActivity ? (
                  <div style={{ marginTop: 8, color: 'var(--text-3)', fontSize: 11 }}>
                    No {trendModule === 'all' ? 'module' : trendModule} activity found for this time range yet.
                  </div>
                ) : null}
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 220,
                  color: 'var(--text-3)',
                  fontSize: 13,
                  flexDirection: 'column',
                  gap: 8,
                  border: '1px dashed var(--border)',
                  borderRadius: 8,
                }}
              >
                <div>No trend rows available.</div>
              </div>
            )}
          </Card>
        </>
      )}
    </AdminLayout>
  )
}
