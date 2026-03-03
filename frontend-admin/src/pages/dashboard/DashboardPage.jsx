import { useEffect, useState } from 'react'

import { inventoryAPI } from '../../api/inventory'
import { hkAPI } from '../../api/housekeeping'
import { Badge, Btn, Card, Spinner, StatCard } from '../../components/ui'
import { DonutChart, TrendArea } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'

const MOCK_TREND = [
  { name: 'Mon', completed: 12, ongoing: 5, pending: 8 },
  { name: 'Tue', completed: 18, ongoing: 7, pending: 6 },
  { name: 'Wed', completed: 15, ongoing: 4, pending: 10 },
  { name: 'Thu', completed: 22, ongoing: 8, pending: 4 },
  { name: 'Fri', completed: 19, ongoing: 6, pending: 7 },
  { name: 'Sat', completed: 14, ongoing: 3, pending: 9 },
  { name: 'Sun', completed: 20, ongoing: 9, pending: 5 },
]

export default function DashboardPage() {
  const [invSummary, setInvSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hkSummary, setHkSummary] = useState(null)

  useEffect(() => {
    Promise.all([
      inventoryAPI.getDashboard().catch(() => null),
      hkAPI.getDashboardSummary().catch(() => null),
    ]).then(([inv, hk]) => {
      setInvSummary(inv?.data || null)
      setHkSummary(hk?.data || null)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={36} />
        </div>
      </AdminLayout>
    )
  }

  const invDonut = invSummary
    ? [
        {
          name: 'In Stock',
          value:
            (invSummary.total_items || 0) -
            (invSummary.low_stock_count || 0) -
            (invSummary.out_of_stock_count || 0),
        },
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

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle={`Welcome back — ${new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total Inventory Items"
          value={invSummary?.total_items ?? '—'}
          icon="📦"
          color="var(--green-800)"
          sub={`${invSummary?.pending_requests ?? 0} requests pending`}
        />
        <StatCard
          label="Low Stock Alerts"
          value={invSummary?.low_stock_count ?? '—'}
          icon="⚠️"
          color="var(--orange-600)"
          sub={`${invSummary?.out_of_stock_count ?? 0} out of stock`}
        />
        <StatCard
          label="HK Tasks Today"
          value={hkSummary?.total_tasks ?? '—'}
          icon="🧹"
          color="var(--green-700)"
          sub={`${hkSummary?.completion_pct ?? 0}% completed`}
        />
        <StatCard
          label="Workers Present"
          value={hkSummary?.present_today ?? '—'}
          icon="👷"
          color="#3b82f6"
          sub={`of ${hkSummary?.total_workers ?? 0} workers`}
        />
        <StatCard
          label="Unreturned Assets"
          value={invSummary?.unreturned_assets ?? '—'}
          icon="🔄"
          color="#f59e0b"
          sub={`${invSummary?.overdue_returns ?? 0} overdue`}
        />
        <StatCard
          label="Pending Stock Req."
          value={hkSummary?.pending_stock_requests ?? '—'}
          icon="📋"
          color="var(--orange-600)"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>📦 Inventory</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Stock overview</div>
            </div>
            <a href="/inventory">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
            </a>
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
            <a href="/housekeeping">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
            </a>
          </div>
          {hkSummary && hkDonut.some((d) => d.value > 0) ? (
            <>
              <DonutChart data={hkDonut} total={hkSummary.total_tasks} label="Tasks" size={160} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d4a3e', display: 'inline-block' }} />
                  Done: <strong>{hkSummary.done_tasks}</strong>
                </div>
                <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c2622a', display: 'inline-block' }} />
                  Pending: <strong>{hkSummary.pending_tasks}</strong>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '30px 0' }}>
              Run docker compose to seed HK data
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🌿 Horticulture</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Zone status</div>
            </div>
            <a href="/horticulture">
              <Btn size="sm" variant="ghost">
                View →
              </Btn>
            </a>
          </div>
          <DonutChart data={[{ name: 'Zones Active', value: 5 }, { name: 'Pending Setup', value: 3 }]} total={8} label="Zones" size={160} />
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
            Module in development
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>📈 Weekly Activity Trend</div>
        </div>
        <TrendArea
          data={MOCK_TREND}
          lines={[
            { key: 'completed', label: 'Completed' },
            { key: 'ongoing', label: 'Ongoing' },
            { key: 'pending', label: 'Pending' },
          ]}
          height={220}
        />
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
