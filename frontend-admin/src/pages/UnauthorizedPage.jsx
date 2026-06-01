import { Link, Navigate } from 'react-router-dom'

import { Btn, Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const ADMIN_PORTAL_ROLES = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office']

export default function UnauthorizedPage() {
  const { user, loading } = useAuth()

  if (loading) return null

  if (ADMIN_PORTAL_ROLES.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--surface-2)',
      }}
    >
      <Card style={{ maxWidth: 520, width: '100%', padding: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Access denied</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>
          You are not allowed to access this page with the current login.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <Btn>Back to Login</Btn>
          </Link>
          <a href="/portal/login/" style={{ textDecoration: 'none' }}>
            <Btn variant="secondary">Staff Portal</Btn>
          </a>
        </div>
      </Card>
    </div>
  )
}
