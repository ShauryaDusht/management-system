import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { inventoryAPI, reportsAPI } from '../../api/inventory'
import { hkAPI } from '../../api/housekeeping'
import { Badge, Btn, Card, Spinner, StatCard } from '../../components/ui'
import { DonutChart, TrendArea } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'

export default function DashboardPage() {
  const [invSummary, setInvSummary] = useState(null)
  const [hkSummary, setHkSummary] = useState(null)
  const [trendRange, setTrendRange] = useState('weekly')
  const [trendData, setTrendData] = useState([])
  const [trendTotals, setTrendTotals] = useState(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setTrendLoading(true)
    Promise.all([
      inventoryAPI.getDashboard().catch(() => null),
      hkAPI.getDashboardSummary().catch(() => null),
      reportsAPI.getActivityTrend({ range: trendRange }).catch(() => null),
    ]).then(([inv, hk, trend]) => {
      setInvSummary(inv?.data || null)
      setHkSummary(hk?.data || null)

      const series = Array.isArray(trend?.data?.series) ? trend.data.series : []
      setTrendData(
        series.map((row) => ({
          name: row.label || row.date,
          inventory: Number(row.inventory || 0),
          housekeeping: Number(row.housekeeping || 0),
          horticulture: Number(row.horticulture || 0),
          total: Number(row.total || 0),
        })),
      )
      setTrendTotals(trend?.data?.totals || null)
      setTrendLoading(false)
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
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

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={36} />
        </div>
      </AdminLayout>
    )
  }

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
  const trendHasActivity = trendData.some(
    (d) => (d.inventory || 0) + (d.housekeeping || 0) + (d.horticulture || 0) > 0,
  )

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
      icon: '🔄',
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
      to: '/housekeeping?tab=assign_stock',
    },
  ]

  return (
    <AdminLayout title="Admin Dashboard" subtitle={`Welcome back - ${todayLabel}`}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 24,
          position: 'relative',
          zIndex: 5,
          pointerEvents: 'auto',
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
              position: 'relative',
              zIndex: 6,
              pointerEvents: 'auto',
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>📦 Inventory</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Stock overview</div>
            </div>
            <Link to="/inventory">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>🧹 Housekeeping</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Today's tasks</div>
            </div>
            <Link to="/housekeeping">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>🌿 Horticulture</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Zone status</div>
            </div>
            <Link to="/horticulture">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
            </Link>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '30px 0',
              color: 'var(--text-3)',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 28 }}>🌿</span>
            <div style={{ fontSize: 12, textAlign: 'center' }}>Module in development</div>
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
        {trendLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        ) : trendData.length > 0 ? (
          <>
            <TrendArea
              data={trendData}
              lines={[
                { key: 'inventory', label: 'Inventory' },
                { key: 'housekeeping', label: 'Housekeeping' },
                { key: 'horticulture', label: 'Horticulture' },
              ]}
              height={220}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <div style={{ fontSize: 12 }}>Inventory: <strong>{trendTotals?.inventory ?? 0}</strong></div>
              <div style={{ fontSize: 12 }}>Housekeeping: <strong>{trendTotals?.housekeeping ?? 0}</strong></div>
              <div style={{ fontSize: 12 }}>Horticulture: <strong>{trendTotals?.horticulture ?? 0}</strong></div>
            </div>
            {!trendHasActivity ? (
              <div style={{ marginTop: 8, color: 'var(--text-3)', fontSize: 11 }}>
                No module activity found for this time range yet.
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 20 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Inventory Tasks</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge value="pending" />
            <Badge value="approved" />
            <Badge value="issued" />
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Housekeeping Tasks</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge value="ongoing" />
            <Badge value="completed" />
            <Badge value="pending" />
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Horticulture Tasks</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge value="pending" />
            <Badge value="ongoing" />
            <Badge value="completed" />
          </div>
        </Card>
      </div>
    </AdminLayout>
  )
}
