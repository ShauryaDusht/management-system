import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from '../shared/constants'
import { IconMark } from './ui'

if (typeof document !== 'undefined' && !document.getElementById('sidebar-hover-styles')) {
  const style = document.createElement('style')
  style.id = 'sidebar-hover-styles'
  style.textContent = `
    .sidebar-nav-link:not(.is-active):hover,
    .sidebar-nav-link:not(.is-active):focus-visible {
      --sidebar-link-bg: rgba(255, 255, 255, 0.08);
      --sidebar-link-color: #fff;
    }
    @media screen and (max-width: 1023px) {
      .sidebar-brand-text,
      .sidebar-nav-label,
      .sidebar-user-text {
        display: none !important;
      }
      .sidebar-nav-link {
        justify-content: center !important;
        padding: 10px 4px !important;
      }
      .sidebar-user-block {
        justify-content: center !important;
      }
    }
  `
  document.head.appendChild(style)
}

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
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'

  const isEngineer = user?.role === 'engineer'
  const isPlantEngineer = user?.role === 'plant_engineer'

  const isElectrical =
    user?.role === 'electrical_supervisor' ||
    user?.role === 'electrical_operator'

  const isWtp =
    user?.role === 'wtp_supervisor' ||
    user?.role === 'wtp_operator'

  const isHvac =
    user?.role === 'hvac_engineer' ||
    user?.role === 'hvac_supervisor' ||
    user?.role === 'hvac_operator'

  const navItems = isEngineer
    ? [
      { to: '/lifts', icon: 'lift', label: 'Lift Licenses' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : isPlantEngineer
    ? [
      { to: '/substation', icon: 'substation', label: 'Substation Log' },
      { to: '/wtp', icon: 'water', label: 'WTP/STP Meters' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : isElectrical
    ? [
      { to: '/substation', icon: 'substation', label: 'Substation Log' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : isWtp
    ? [
      { to: '/wtp', icon: 'water', label: 'WTP/STP Meters' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : isHvac
    ? [
      {
        to: '/hvac',
        icon: 'hvac',
        label:
          user?.role === 'hvac_engineer'
            ? 'HVAC Engineer Portal'
            : user?.role === 'hvac_supervisor'
            ? 'HVAC Supervisor Portal'
            : user?.role === 'hvac_operator'
            ? 'HVAC Operator Portal'
            : 'HVAC Plant Log',
      },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'civil_team'
    ? [
      { to: '/estate', icon: 'estate', label: 'Civil Clearances' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'electrical_team'
    ? [
      { to: '/estate', icon: 'estate', label: 'Electrical Clearances' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'estate_office'
    ? [
      { to: '/dashboard', icon: 'estate', label: 'Dashboard' },
      { to: '/insights', icon: 'insights', label: 'Insights' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'horticulture_manager'
    ? [
      { to: '/dashboard', icon: 'home', label: 'Home' },
      { to: '/horticulture-stock', icon: 'inventory', label: 'Horticulture Inventory' },
      { to: '/horticulture', icon: 'horticulture', label: 'Horticulture' },
      { to: '/geo-tracker', icon: 'map', label: 'Plant Map' },
      { to: '/insights', icon: 'insights', label: 'Insights' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : isHostelOffice
    ? [
      { to: '/dashboard', icon: 'home', label: 'Home' },
      { to: '/housekeeping', icon: 'housekeeping', label: 'Hostel Office' },
      { to: '/inventory', icon: 'inventory', label: 'Inventory Reports' },
      { to: '/insights', icon: 'insights', label: 'Insights' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'hk_inventory_manager'
    ? [
      { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
      {
        to: '/inventory', icon: 'inventory', label: 'Inventory',
        badge: badges.inventory,
        badgeYellow: false,
        extraBadge: badges.lowStock,
        extraYellow: true,
        extraTitle: 'low stock items',
      },
      {
        to: '/housekeeping', icon: 'housekeeping', label: 'Housekeeping',
        badge: badges.housekeeping,
      },
      { to: '/estate', icon: 'estate', label: 'HK Clearances' },
      { to: '/insights', icon: 'insights', label: 'Insights' },
      { to: '/users', icon: 'users', label: 'Manage Users' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : user?.role === 'supervisor'
    ? [
      { to: '/housekeeping', icon: 'housekeeping', label: 'Housekeeping' },
      { to: '/profile', icon: 'users', label: 'Profile' },
    ]
    : [
      { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
      {
        to: '/inventory', icon: 'inventory', label: 'Inventory',
        badge: (badges.inventory || 0) + (badges.horticultureInventory || 0),
        badgeYellow: false,
        extraBadge: badges.lowStock,
        extraYellow: true,
        extraTitle: 'low stock items',
      },
      {
        to: '/housekeeping', icon: 'housekeeping', label: 'Housekeeping',
        badge: badges.housekeeping,
      },
      { to: '/horticulture', icon: 'horticulture', label: 'Horticulture' },
      { to: '/geo-tracker', icon: 'map', label: 'Plant Map' },
      { to: '/estate', icon: 'estate', label: 'Estate' },
      { to: '/lifts', icon: 'lift', label: 'Lift Licenses' },
      { to: '/substation', icon: 'substation', label: 'Substation Log' },
      { to: '/wtp', icon: 'water', label: 'WTP / STP Meters' },
      { to: '/hvac', icon: 'hvac', label: 'HVAC Plant Log' },
      { to: '/insights', icon: 'insights', label: 'Insights' },
      { to: '/users', icon: 'users', label: 'Manage Users' },
      { to: '/profile', icon: 'users', label: 'Profile' },
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
          <img
            src={APP_LOGO_PATH}
            alt={APP_NAME}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              flexShrink: 0,
              background: 'rgba(255,255,255,0.95)',
              padding: 2,
              boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
            }}
          />
          <div className="sidebar-brand-text" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                color: '#fff',
                fontWeight: 800,
                fontSize: 13,
                lineHeight: 1.2,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {APP_NAME}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {APP_TAGLINE}
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
            className={({ isActive }) => `sidebar-nav-link${isActive ? ' is-active' : ''}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 9,
              marginBottom: 3,
              color: isActive ? '#fff' : 'var(--sidebar-link-color, rgba(255,255,255,0.65))',
              background: isActive ? 'rgba(255,255,255,0.14)' : 'var(--sidebar-link-bg, transparent)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              transition: 'all 0.15s',
            })}
          >
            <IconMark
              icon={icon}
              label={label}
              color="#ffffff"
              size={28}
              style={{
                borderRadius: 8,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.18)',
                flexShrink: 0,
              }}
            />

            {/* Label */}
            <span className="sidebar-nav-label" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>

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
        <NavLink
          to="/profile"
          title="View Profile"
          className="sidebar-user-block"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 10,
            textDecoration: 'none',
            padding: '4px 6px',
            borderRadius: 8,
            transition: 'background 0.15s ease',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}
          >
            {user?.role === 'engineer' ? 'L' : (user?.full_name?.[0] || user?.username?.[0]?.toUpperCase() || 'A')}
          </div>
          <div className="sidebar-user-text" style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.role === 'engineer' ? 'Lift Engineer' : (user?.full_name || user?.username)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.role === 'engineer' ? 'Electrical (Lift)' : user?.role === 'plant_engineer' ? 'Substation & WTP Engineer' : user?.role === 'electrical_supervisor' ? 'Substation Supervisor' : user?.role === 'wtp_supervisor' ? 'WTP / STP Supervisor' : user?.role === 'hvac_engineer' ? 'HVAC Engineer' : user?.role === 'hvac_supervisor' ? 'HVAC Supervisor' : user?.role === 'supervisor' ? 'Operations Supervisor' : user?.role === 'hvac_operator' ? 'HVAC Operator' : (user?.role || '').replaceAll('_', ' ')}
            </div>
          </div>
        </NavLink>
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
