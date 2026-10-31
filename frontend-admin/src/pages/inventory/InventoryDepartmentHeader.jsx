import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { IconMark } from '../../components/ui'

export default function InventoryDepartmentHeader({ currentDepartment }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { badges } = useNotifications()

  const canAccessBoth = user?.role === 'admin' || user?.is_superuser
  if (!canAccessBoth) return null

  const isHousekeeping = currentDepartment === 'housekeeping'
  const isHorticulture = currentDepartment === 'horticulture'

  const hkPending = badges.inventory || 0
  const hortPending = badges.horticultureInventory || 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        padding: '10px 16px',
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}
    >
      {/* Back to Options button */}
      <button
        type="button"
        onClick={() => navigate('/inventory')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--green-900)',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
          padding: '6px 14px',
          borderRadius: 8,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--surface-2)'
        }}
      >
        <span style={{ fontSize: 14 }}>←</span>
        <span>All Inventories</span>
      </button>

      {/* Department Selector Pill Group */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'var(--surface-2)',
          padding: 4,
          borderRadius: 10,
          border: '1px solid var(--border)',
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/inventory/housekeeping')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: isHousekeeping ? 700 : 500,
            background: isHousekeeping ? 'var(--green-900)' : 'transparent',
            color: isHousekeeping ? '#ffffff' : 'var(--text-2)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: isHousekeeping ? '0 2px 6px rgba(26,60,52,0.25)' : 'none',
          }}
        >
          <IconMark
            icon="housekeeping"
            size={20}
            color={isHousekeeping ? '#ffffff' : 'var(--green-800)'}
            style={{
              background: 'transparent',
              border: 'none',
            }}
          />
          <span>Housekeeping</span>
          {hkPending > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 10,
                lineHeight: 1.2,
              }}
            >
              {hkPending}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/inventory/horticulture')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: isHorticulture ? 700 : 500,
            background: isHorticulture ? 'var(--green-900)' : 'transparent',
            color: isHorticulture ? '#ffffff' : 'var(--text-2)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: isHorticulture ? '0 2px 6px rgba(26,60,52,0.25)' : 'none',
          }}
        >
          <IconMark
            icon="horticulture"
            size={20}
            color={isHorticulture ? '#ffffff' : 'var(--green-800)'}
            style={{
              background: 'transparent',
              border: 'none',
            }}
          />
          <span>Horticulture</span>
          {hortPending > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 10,
                lineHeight: 1.2,
              }}
            >
              {hortPending}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
