import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function getLandingRoute(user) {
  const role = getEffectiveRole(user)
  if (role === 'civil_team' || role === 'electrical_team') {
    return '/estate'
  }
  if (['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office', 'estate_office'].includes(role)) {
    return '/dashboard'
  }
  if (role === 'engineer') {
    return '/lifts'
  }
  return '/unauthorized'
}

function getEffectiveRole(user) {
  if (user?.username === 'hostel.office' || user?.actual_role === 'hostel_office') {
    return 'hostel_office'
  }
  return user?.role
}

/**
 * Wrap any route that requires auth.
 * Optionally pass `allowedRoles` to restrict by role.
 *
 * <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, unauthorized } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (unauthorized) {
    return <Navigate to="/unauthorized" replace />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(getEffectiveRole(user))) {
    return <Navigate to={getLandingRoute(user)} replace />
  }

  return children
}
