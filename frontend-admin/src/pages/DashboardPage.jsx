import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getStats, inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { Spinner } from '../components/ui'

function StatCard({ icon, label, value, color, bg, border, alert }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '16px 20px', position: 'relative' }}>
      {alert && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />}
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value ?? '—'}</div>
    </div>
  )
}

function StockBar({ available, total, threshold }) {
  const pct = total > 0 ? (available / total) * 100 : 0
  const isLow = available <= threshold
  const isOut = available === 0
  const color = isOut ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ width: '100%', background: '#f1f5f9', borderRadius: 4, height: 5, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function Chip({ label, type = 'default' }) {
  const styles = {
    default: { background: '#f1f5f9', color: '#475569' },
    success: { background: '#dcfce7', color: '#166534' },
    warning: { background: '#fef9c3', color: '#854d0e' },
    danger:  { background: '#fee2e2', color: '#991b1b' },
  }
  const s = styles[type] || styles.default
  return <span style={{ ...s, display: 'inline-flex', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [recentRequests, setRecentRequests] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [lowStockLoading, setLowStockLoading] = useState(true)

  const displayName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'User'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  useEffect(() => {
    getStats()
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false))

    inventoryAPI.getLowStockItems()
      .then(r => setLowStock(r.data?.items || r.data?.results || r.data || []))
      .catch(() => {})
      .finally(() => setLowStockLoading(false))

    inventoryAPI.getRequests()
      .then(r => {
        const list = r.data?.results ?? r.data ?? []
        setRecentRequests(list.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

        {/* Hero Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)',
            borderRadius: 16, padding: '24px 28px', margin: '16px 0', position: 'relative', overflow: 'hidden'
          }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 120, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', top: 20, right: 200, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 6px' }}>{today}</p>
                <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
                  {greeting}, {displayName} 👋
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0, textTransform: 'capitalize' }}>
                  {user?.role?.replace(/_/g, ' ')} · Inventory Management System
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => navigate('/inventory')}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📦 Inventory
                </button>
                <button onClick={() => navigate('/requests')}
                  style={{ background: '#c2622a', border: 'none', color: 'white', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  📋 Requests
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

          {/* Stat Cards */}
          {statsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', height: 96 }}>
                  <div style={{ background: '#f1f5f9', borderRadius: 8, height: 12, width: '60%', marginBottom: 8 }} />
                  <div style={{ background: '#f1f5f9', borderRadius: 8, height: 28, width: '40%' }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard icon="🗂️" label="Total Items" value={stats?.total_items} color="#1e40af" bg="#eff6ff" border="#bfdbfe" />
              <StatCard icon="⚠️" label="Low Stock" value={stats?.low_stock_count} color="#b45309" bg="#fffbeb" border="#fed7aa" alert={stats?.low_stock_count > 0} />
              <StatCard icon="🕐" label="Pending Requests" value={stats?.pending_requests_count} color="#7c3aed" bg="#faf5ff" border="#ddd6fe" alert={stats?.pending_requests_count > 0} />
              <StatCard icon="📭" label="Out of Stock" value={stats?.out_of_stock_count} color="#dc2626" bg="#fef2f2" border="#fecaca" alert={stats?.out_of_stock_count > 0} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

            {/* Low Stock Table */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>⚠️ Items Below Threshold</h2>
                {!lowStockLoading && lowStock.length > 0 && (
                  <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700 }}>
                    {lowStock.length} need attention
                  </span>
                )}
              </div>

              {lowStockLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Spinner /></div>
              ) : lowStock.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <p style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>All items sufficiently stocked</p>
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>No items below threshold</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        {['Item', 'Category', 'Available Stock', 'Threshold', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? 'white' : '#fafafa' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                          onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{item.unit}</div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b' }}>{item.category_name}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, color: item.available_quantity === 0 ? '#ef4444' : '#f59e0b', marginBottom: 4 }}>
                              {item.available_quantity} {item.unit}
                            </div>
                            <StockBar available={item.available_quantity} total={item.total_quantity} threshold={item.threshold_quantity} />
                          </td>
                          <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{item.threshold_quantity}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {item.available_quantity === 0
                              ? <Chip label="❌ Out of Stock" type="danger" />
                              : <Chip label="⚠️ Low Stock" type="warning" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Recent Requests */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>📋 Recent Requests</h3>
                  <button onClick={() => navigate('/requests')} style={{ fontSize: 11, color: '#4d7c5a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View All →</button>
                </div>
                {recentRequests.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No requests yet</div>
                ) : (
                  <div>
                    {recentRequests.map((req, i) => {
                      const statusStyle = { pending: { bg: '#fef9c3', color: '#854d0e' }, approved: { bg: '#dbeafe', color: '#1e40af' }, issued: { bg: '#dcfce7', color: '#166534' }, rejected: { bg: '#fee2e2', color: '#991b1b' } }
                      const s = statusStyle[req.status] || { bg: '#f1f5f9', color: '#475569' }
                      return (
                        <div key={req.id} style={{ padding: '12px 16px', borderBottom: i < recentRequests.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4d7c5a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {(req.requester_name || 'U')[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.item_name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{req.requester_name} · {req.quantity_requested} {req.item_unit}</div>
                          </div>
                          <span style={{ background: s.bg, color: s.color, fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{req.status}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Quick Navigation */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>Quick Navigation</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { icon: '📦', label: 'Inventory Portal', path: '/inventory', color: '#4d7c5a', bg: '#f0fdf4', border: '#bbf7d0' },
                    { icon: '📋', label: 'Manage Requests', path: '/requests', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
                    { icon: '🔄', label: 'Issued Items', path: '/issues', color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
                    { icon: '📊', label: 'Reports', path: '/reports', color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
                    { icon: '📋', label: 'Stock Log', path: '/stock-entries', color: '#b45309', bg: '#fffbeb', border: '#fed7aa' },
                  ].map(item => (
                    <button key={item.path} onClick={() => navigate(item.path)}
                      style={{ width: '100%', background: item.bg, color: item.color, border: `1px solid ${item.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* System Status */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>System Status</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Inventory Data', status: 'Live', ok: true },
                    { label: 'Request Queue', status: stats?.pending_requests_count > 0 ? `${stats.pending_requests_count} Pending` : 'Clear', ok: !stats?.pending_requests_count },
                    { label: 'Stock Alerts', status: (stats?.low_stock_count || 0) + (stats?.out_of_stock_count || 0) > 0 ? 'Action Needed' : 'All Good', ok: !((stats?.low_stock_count || 0) + (stats?.out_of_stock_count || 0)) },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>{s.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: s.ok ? '#166534' : '#b45309', background: s.ok ? '#dcfce7' : '#fef9c3', padding: '2px 8px', borderRadius: 99 }}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
