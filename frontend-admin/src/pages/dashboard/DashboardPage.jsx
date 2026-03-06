import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { inventoryAPI } from '../../api/inventory'
import { hkAPI } from '../../api/housekeeping'
import { Badge, Btn, Card, Spinner } from '../../components/ui'
import { DonutChart } from '../../components/ui/Charts'
import AdminLayout from '../../layout/AdminLayout'

function ClickableStatCard({ label, value, icon, color = 'var(--green-800)', sub, to }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => to && navigate(to)}
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '16px 20px',
        cursor: to ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!to) return
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
      title={to ? `View ${label}` : undefined}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
      {to && <span style={{ color: 'var(--text-3)', fontSize: 16 }}>›</span>}
    </div>
  )
}

export default function DashboardPage() {
  const [invSummary, setInvSummary] = useState(null)
  const [hkSummary, setHkSummary] = useState(null)
  const [loading, setLoading] = useState(true)

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

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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

  const hkDonut = hkSummary
    ? [
        { name: 'Done', value: hkSummary.done_tasks || 0 },
        { name: 'Pending', value: hkSummary.pending_tasks || 0 },
      ]
    : []
  const hkHasActivity = hkDonut.some((d) => d.value > 0)
  const hkDonutData = hkHasActivity ? hkDonut : [{ name: 'No Activity', value: 1 }]

  // Stat cards — each linked to the relevant filtered view
  const invStatCards = [
    {
      label: 'Total Items',
      value: invSummary?.total_items ?? '—',
      icon: '📦',
      color: 'var(--green-800)',
      sub: `${invSummary?.pending_requests ?? 0} requests pending`,
      to: '/inventory?tab=items',
    },
    {
      label: 'Low Stock Alerts',
      value: invSummary?.low_stock_count ?? '—',
      icon: '⚠️',
      color: '#d97706',
      sub: 'Click to view items',
      to: '/inventory?tab=items&status=low_stock',
    },
    {
      label: 'Out of Stock',
      value: invSummary?.out_of_stock_count ?? '—',
      icon: '🚫',
      color: '#dc2626',
      sub: 'Click to view items',
      to: '/inventory?tab=items&status=out_of_stock',
    },
    {
      label: 'Pending Requests',
      value: invSummary?.pending_requests ?? '—',
      icon: '📋',
      color: '#3b82f6',
      sub: 'Click to review',
      to: '/inventory?tab=requests',
    },
    {
      label: 'Unreturned Assets',
      value: invSummary?.unreturned_assets ?? '—',
      icon: '🔄',
      color: '#f59e0b',
      sub: `${invSummary?.overdue_returns ?? 0} overdue`,
      to: '/inventory?tab=issues',
    },
    {
      label: 'Pending Stock Req.',
      value: hkSummary?.pending_stock_requests ?? '—',
      icon: '🏗️',
      color: '#8b5cf6',
      sub: 'Open approval queue',
      to: '/housekeeping?tab=assign_stock',
    },
  ]

  const hkStatCards = [
    {
      label: 'HK Tasks Today',
      value: hkSummary?.total_tasks ?? '—',
      icon: '🧹',
      color: 'var(--green-700)',
      sub: `${hkSummary?.completion_pct ?? 0}% completed`,
      to: '/housekeeping?tab=overview',
    },
    {
      label: 'Workers Present',
      value: hkSummary?.present_today ?? '—',
      icon: '👷',
      color: '#3b82f6',
      sub: `of ${hkSummary?.total_workers ?? 0} workers`,
      to: '/housekeeping?tab=attendance',
    },
  ]

  return (
    <AdminLayout title="Admin Dashboard" subtitle={`Welcome back — ${todayLabel}`}>

      {/* Section: Inventory */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-2)' }}>📦 Inventory</div>
          <Link to="/inventory"><Btn size="sm" variant="ghost">View all →</Btn></Link>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}>
          {invStatCards.map((card) => (
            <ClickableStatCard key={card.label} {...card} />
          ))}
        </div>
      </div>

      {/* Section: Housekeeping + charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-2)' }}>🧹 Housekeeping</div>
            <Link to="/housekeeping"><Btn size="sm" variant="ghost">View all →</Btn></Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 10, marginBottom: 14 }}>
            {hkStatCards.map((card) => (
              <ClickableStatCard key={card.label} {...card} />
            ))}
          </div>

          {/* Horticulture placeholder */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>🌿 Horticulture</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Zone status</div>
              </div>
              <Link to="/horticulture"><Btn size="sm" variant="ghost">View →</Btn></Link>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '20px 0', color: 'var(--text-3)', gap: 6,
            }}>
              <span style={{ fontSize: 26 }}>🌿</span>
              <div style={{ fontSize: 12 }}>Module in development</div>
            </div>
          </Card>
        </div>

        {/* Housekeeping donut */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🧹 HK Task Status</div>
          {hkSummary ? (
            <>
              <DonutChart
                data={hkDonutData}
                total={hkSummary.total_tasks}
                label={hkHasActivity ? 'Tasks' : 'No Activity'}
                size={180}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d4a3e', display: 'inline-block' }} />
                  Done: <strong>{hkSummary.done_tasks || 0}</strong>
                </div>
                <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c2622a', display: 'inline-block' }} />
                  Pending: <strong>{hkSummary.pending_tasks || 0}</strong>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '30px 0' }}>No housekeeping data yet</div>
          )}
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/inventory?tab=requests">
            <Btn variant="secondary">📋 Review Requests</Btn>
          </Link>
          <Link to="/inventory?tab=stocklog">
            <Btn variant="secondary">🧾 Stock Log</Btn>
          </Link>
          <Link to="/inventory?tab=tasks">
            <Btn variant="secondary">✅ Assign Task</Btn>
          </Link>
          <Link to="/users">
            <Btn variant="secondary">👥 Manage Users</Btn>
          </Link>
          <Link to="/reports">
            <Btn variant="secondary">📊 Reports</Btn>
          </Link>
        </div>
      </Card>
    </AdminLayout>
  )
}
