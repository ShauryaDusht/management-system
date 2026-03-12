import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { APP_NAME } from '../shared/constants'

function Badge({ count, yellow }) {
  if (!count || count === 0) return null
  return (
    <span style={{
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      background: yellow ? '#f59e0b' : '#ef4444',
      color: '#fff',
      fontSize: 10,
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 5px',
      marginLeft: 'auto',
      flexShrink: 0,
      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { badges } = useNotifications()
  const navigate = useNavigate()

  const navItems = [
    { to: '/dashboard', icon: 'DB', label: 'Dashboard' },
    {
      to: '/inventory', icon: 'IN', label: 'Inventory',
      badge: badges.inventory,
      badgeYellow: false,
      extraBadge: badges.lowStock,
      extraYellow: true,
      extraTitle: 'low stock items',
    },
    {
      to: '/housekeeping', icon: 'HK', label: 'Housekeeping',
      badge: badges.housekeeping,
    },
    { to: '/horticulture', icon: 'HT', label: 'Horticulture' },
    { to: '/insights', icon: 'AN', label: 'Insights' },
    { to: '/users', icon: 'US', label: 'Manage Users' },
    { to: '/profile', icon: 'PR', label: 'Profile' },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        background: 'var(--green-900)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
              display: 'grid', placeItems: 'center',
              color: '#fff', flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 20h16M6 19V9M10 19V9M14 19V9M18 19V9M4 9l8-4 8 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                color: '#fff',
                fontWeight: 800,
                fontSize: 13,
                lineHeight: 1.2,
                letterSpacing: 0.2,
              }}
            >
              {APP_NAME}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {navItems.map(({ to, icon, label, badge, badgeYellow, extraBadge, extraYellow, extraTitle }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 9,
              marginBottom: 3,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
              background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              transition: 'all 0.15s',
            })}
          >
            {/* Icon box */}
            <span
              style={{
                width: 24, height: 24, borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'grid', placeItems: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}
            >
              {icon}
            </span>

            {/* Label */}
            <span style={{ flex: 1 }}>{label}</span>

            {/* Low stock yellow badge (shows alongside red) */}
            {extraBadge > 0 && (
              <span title={`${extraBadge} ${extraTitle || ''}`}>
                <Badge count={extraBadge} yellow={extraYellow} />
              </span>
            )}

            {/* Main red badge */}
            {badge > 0 && (
              <Badge count={badge} yellow={badgeYellow} />
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}
          >
            {user?.full_name?.[0] || user?.username?.[0]?.toUpperCase() || 'A'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.full_name || user?.username}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'capitalize' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '8px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
