import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'admin'
  const canManageModules = ['admin', 'manager', 'inventory_manager'].includes(user?.role)

  const navItems = [
    ...(canManageModules ? [{ to: '/dashboard', icon: 'DB', label: 'Dashboard' }] : []),
    { to: '/inventory', icon: 'IN', label: 'Inventory' },
    ...(canManageModules ? [{ to: '/housekeeping', icon: 'HK', label: 'Housekeeping' }] : []),
    ...(canManageModules ? [{ to: '/horticulture', icon: 'HT', label: 'Horticulture' }] : []),
    ...(canManageModules ? [{ to: '/reports', icon: 'RP', label: 'Reports' }] : []),
    ...(isAdmin ? [{ to: '/users', icon: 'US', label: 'Manage Users' }] : []),
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
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            CM
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>IITGN Campus</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Management System</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {navItems.map(({ to, icon, label }) => (
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
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {icon}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {user?.full_name?.[0] || user?.username?.[0]?.toUpperCase() || 'A'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
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
            width: '100%',
            padding: '8px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 12,
            fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
