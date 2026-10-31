import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { inventoryAPI } from '../../api/inventory'
import { horticultureAPI } from '../../api/horticulture'
import { useNotifications } from '../../context/NotificationContext'
import AdminLayout from '../../layout/AdminLayout'
import { IconMark } from '../../components/ui'
import { asList } from '../../shared/utils'

export default function InventorySelectView() {
  const navigate = useNavigate()
  const { badges } = useNotifications()

  const [hkSummary, setHkSummary] = useState(null)
  const [hortSummary, setHortSummary] = useState(null)
  const [hortPending, setHortPending] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const loadData = async () => {
      try {
        const [hkRes, hortRes, hortReqRes] = await Promise.allSettled([
          inventoryAPI.getDashboard(),
          horticultureAPI.getAreaStocks(),
          inventoryAPI.getRequests({ category: 'Garden & Horticulture Equipment', status: 'pending', page_size: 200 }),
        ])

        if (!alive) return

        if (hkRes.status === 'fulfilled') {
          setHkSummary(hkRes.value?.data || null)
        }
        if (hortRes.status === 'fulfilled') {
          setHortSummary(hortRes.value?.data?.items_summary || null)
        }
        if (hortReqRes.status === 'fulfilled') {
          const list = asList(hortReqRes.value?.data)
          const pCount = list.filter((r) => r.status === 'pending').length
          setHortPending(pCount)
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadData()
    return () => { alive = false }
  }, [])

  const hkPendingCount = badges.inventory || hkSummary?.pending_requests || 0
  const hortPendingCount = badges.horticultureInventory || hortPending || 0

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Select an inventory department to view and manage stock, requests, and reports"
    >
      <div style={{ maxWidth: 1100, margin: '10px auto 40px' }}>
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--green-900) 0%, #204e43 100%)',
            borderRadius: 16,
            padding: '28px 32px',
            color: '#ffffff',
            marginBottom: 28,
            boxShadow: '0 8px 24px rgba(26,60,52,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.22)',
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Central Inventory Hub
            </span>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>
              Choose Inventory Department
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '8px 0 0', lineHeight: 1.5 }}>
              Access dedicated dashboards for Housekeeping and Horticulture. Each department maintains independent stock registers, approval queues, and procurement audits.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              background: 'rgba(255,255,255,0.08)',
              padding: '12px 18px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>2</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sections</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: (hkPendingCount + hortPendingCount) > 0 ? '#fca5a5' : '#ffffff' }}>
                {hkPendingCount + hortPendingCount}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pending Reqs</div>
            </div>
          </div>
        </div>

        {/* 2 Main Department Options */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 24,
            marginBottom: 28,
          }}
        >
          {/* Card 1: Housekeeping */}
          <div
            onClick={() => navigate('/inventory/housekeeping')}
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: '28px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(26,60,52,0.12)'
              e.currentTarget.style.borderColor = 'var(--green-700)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {/* Top decorative stripe */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--green-800)' }} />

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <IconMark
                  icon="housekeeping"
                  size={52}
                  color="var(--green-800)"
                  style={{
                    background: 'var(--green-100)',
                    border: '1px solid #a7f3d0',
                    borderRadius: 14,
                  }}
                />
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--green-700)',
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Facilities & Cleaning
                  </span>
                  <h3 style={{ fontSize: 22, fontWeight: 800, margin: '2px 0 0', color: 'var(--green-900)' }}>
                    Housekeeping
                  </h3>
                </div>
              </div>

              {hkPendingCount > 0 && (
                <span
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626' }} />
                  {hkPendingCount} Pending
                </span>
              )}
            </div>

            {/* Description */}
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 20px', flex: '0 0 auto' }}>
              Consumables, cleaning chemicals, amenities, tools, hostel materials, supervisor requests, and stock issuance logs.
            </p>

            {/* Live Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginBottom: 20,
                background: 'var(--surface-2)',
                padding: '12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Total Items</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {hkSummary?.total_items ?? (loading ? '...' : '75')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Low Stock</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f59e0b', marginTop: 2 }}>
                  {hkSummary?.low_stock_count ?? (loading ? '...' : '4')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Pending Reqs</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: hkPendingCount > 0 ? '#ef4444' : 'var(--text)', marginTop: 2 }}>
                  {hkPendingCount}
                </div>
              </div>
            </div>

            {/* Modules Included */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 20, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Includes
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Stock Catalog', 'Requests Approval', 'Issued Items', 'Replenishment Log', 'Monthly Reports'].map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: 11.5,
                      background: '#ffffff',
                      border: '1px solid var(--border)',
                      padding: '3px 9px',
                      borderRadius: 6,
                      color: 'var(--text-2)',
                      fontWeight: 500,
                    }}
                  >
                    ✓ {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/inventory/housekeeping')
              }}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: 10,
                background: 'var(--green-900)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: 13.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--green-800)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--green-900)' }}
            >
              <span>Open Housekeeping Dashboard</span>
              <span style={{ fontSize: 16 }}>→</span>
            </button>
          </div>

          {/* Card 2: Horticulture */}
          <div
            onClick={() => navigate('/inventory/horticulture')}
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: '28px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(22,101,52,0.12)'
              e.currentTarget.style.borderColor = '#16a34a'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {/* Top decorative stripe */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#16a34a' }} />

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <IconMark
                  icon="horticulture"
                  size={52}
                  color="#15803d"
                  style={{
                    background: '#dcfce7',
                    border: '1px solid #86efac',
                    borderRadius: 14,
                  }}
                />
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#15803d',
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Garden & Grounds
                  </span>
                  <h3 style={{ fontSize: 22, fontWeight: 800, margin: '2px 0 0', color: 'var(--green-900)' }}>
                    Horticulture
                  </h3>
                </div>
              </div>

              {hortPendingCount > 0 ? (
                <span
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626' }} />
                  {hortPendingCount} Pending
                </span>
              ) : (
                <span
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 20,
                  }}
                >
                  Active
                </span>
              )}
            </div>

            {/* Description */}
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 20px', flex: '0 0 auto' }}>
              Garden machinery, pruning tools, lawnmowers, fertilizers, organic pesticides, seeds, plant stock, and field requests.
            </p>

            {/* Live Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginBottom: 20,
                background: 'var(--surface-2)',
                padding: '12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Total Items</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {hortSummary?.total_items ?? (loading ? '...' : '25')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Low Stock</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f59e0b', marginTop: 2 }}>
                  {hortSummary?.low_stock ?? (loading ? '...' : '0')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Pending Reqs</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: hortPendingCount > 0 ? '#ef4444' : 'var(--text)', marginTop: 2 }}>
                  {hortPendingCount}
                </div>
              </div>
            </div>

            {/* Modules Included */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 20, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Includes
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Equipment Catalog', 'Field Requests', 'Issued Tools', 'Stock Log', 'Usage Reports'].map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: 11.5,
                      background: '#ffffff',
                      border: '1px solid var(--border)',
                      padding: '3px 9px',
                      borderRadius: 6,
                      color: 'var(--text-2)',
                      fontWeight: 500,
                    }}
                  >
                    ✓ {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/inventory/horticulture')
              }}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: 10,
                background: '#166534',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: 13.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#14532d' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#166534' }}
            >
              <span>Open Horticulture Dashboard</span>
              <span style={{ fontSize: 16 }}>→</span>
            </button>
          </div>
        </div>

        {/* Security / Separation Info Card */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: 'var(--text-2)',
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--green-100)',
              color: 'var(--green-900)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            ✓
          </div>
          <div style={{ lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--green-900)' }}>Operational Separation:</strong> Stock catalogs, supervisor material requests, and audit logs are kept strictly separated by department to prevent data mixing.
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
