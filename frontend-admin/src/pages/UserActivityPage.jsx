import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { Spinner } from '../components/ui'

function Chip({ label, type = 'default' }) {
  const styles = {
    default:  { background: '#f1f5f9', color: '#475569' },
    success:  { background: '#dcfce7', color: '#166534' },
    warning:  { background: '#fef9c3', color: '#854d0e' },
    danger:   { background: '#fee2e2', color: '#991b1b' },
    info:     { background: '#dbeafe', color: '#1e40af' },
  }
  const s = styles[type] || styles.default
  return <span style={{ ...s, display: 'inline-flex', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
}

function reqChip(status) {
  const map = { pending: ['Pending', 'warning'], approved: ['Approved', 'info'], issued: ['Issued', 'success'], rejected: ['Rejected', 'danger'] }
  const [label, type] = map[status] || [status, 'default']
  return <Chip label={label} type={type} />
}

export default function UserActivityPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryAPI.getUserActivity(id)
      .then(res => setData(res.data))
      .finally(() => setLoading(false))
  }, [id])

  const fmt = dt => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  if (loading) return <Layout><div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div></Layout>

  const user = data?.user
  const summary = data?.summary
  const requests = data?.requests || []
  const fullName = user?.name || user?.username || 'User'
  const initial = fullName[0]?.toUpperCase() || 'U'

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)', borderRadius: 16, padding: '20px 28px', margin: '16px 0 0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/users')}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                ← Back
              </button>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>{initial}</div>
              <div>
                <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>{fullName}</h1>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>@{user?.username} · <span style={{ textTransform: 'capitalize' }}>{user?.role?.replace(/_/g, ' ')}</span></p>
              </div>
            </div>
          </div>
          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { icon: '📋', label: 'Total Requests', value: summary?.total ?? 0, color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0' },
              { icon: '✅', label: 'Issued', value: summary?.issued ?? 0, color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
              { icon: '⏳', label: 'Pending', value: summary?.pending ?? 0, color: '#b45309', bg: '#fffbeb', border: '#fed7aa' },
              { icon: '❌', label: 'Rejected', value: summary?.rejected ?? 0, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Requests Table */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>📋 Request History</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['#', 'Item', 'Qty', 'Purpose', 'Status', 'Requested At'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>No requests found for this user
                    </td></tr>
                  ) : requests.map((req, idx) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? 'white' : '#fafafa' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>#{req.id}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{req.item_name}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#4d7c5a' }}>{req.quantity_requested} {req.item_unit}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{req.purpose || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{reqChip(req.status)}</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(req.requested_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
