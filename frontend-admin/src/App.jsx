import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import DashboardPage from './pages/dashboard/DashboardPage'
import HorticulturePage from './pages/horticulture/HorticulturePage'
import HousekeepingPage from './pages/housekeeping/HousekeepingPage'
import InsightsPage from './pages/insights/InsightsPage'
import InventoryPage from './pages/inventory/InventoryPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/profile/ProfilePage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import UsersPage from './pages/users/UsersPage'

const ADMIN_ONLY = ['admin']
const HORTICULTURE_ALLOWED = ['admin', 'horticulture_manager']
const ROUTER_BASENAME = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

function getLandingRoute(user) {
  if (user?.role === 'admin') return '/dashboard'
  if (user?.role === 'horticulture_manager') return '/horticulture'
  return '/unauthorized'
}

function AdminOnlyRedirectRoute({ children }) {
  const { user, loading, unauthorized } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }
  if (unauthorized) return <Navigate to="/unauthorized" replace />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') {
    return <Navigate to={getLandingRoute(user)} replace />
  }
  return children
}

function RoleRedirect() {
  const { user, loading, unauthorized } = useAuth()
  if (loading) return null
  if (unauthorized) return <Navigate to="/unauthorized" replace />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={getLandingRoute(user)} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/housekeeping/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <HousekeepingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture/*"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <HorticulturePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insights"
            element={
              <AdminOnlyRedirectRoute>
                <InsightsPage />
              </AdminOnlyRedirectRoute>
            }
          />
          <Route
            path="/users"
            element={
              <AdminOnlyRedirectRoute>
                <UsersPage />
              </AdminOnlyRedirectRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
