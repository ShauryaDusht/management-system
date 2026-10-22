import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import DashboardPage from './pages/dashboard/DashboardPage'
import GeoTrackerPage from './pages/geo_tracker/GeoTrackerPage'
import HorticulturePage from './pages/horticulture/HorticulturePage'
import HorticultureStockPage from './pages/horticulture/HorticultureStockPage'
import HousekeepingPage from './pages/housekeeping/HousekeepingPage'
import InsightsPage from './pages/insights/InsightsPage'
import InventoryPage from './pages/inventory/InventoryPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/profile/ProfilePage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import UsersPage from './pages/users/UsersPage'

const ADMIN_OR_HK_INVENTORY = ['admin', 'hk_inventory_manager', 'horticulture_manager']
const ADMIN_DASHBOARD_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office']
const HK_INVENTORY_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office']
const HK_PORTAL_ALLOWED = ['admin', 'hk_inventory_manager', 'hostel_office']
const HORTICULTURE_ALLOWED = ['admin', 'horticulture_manager']
const GEO_TRACKER_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager']
const INSIGHTS_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office']
const ROUTER_BASENAME = '/admin'

function getLandingRoute(user) {
  const role = user?.username === 'hostel.office' || user?.actual_role === 'hostel_office'
    ? 'hostel_office'
    : user?.role
  if (role === 'admin') return '/dashboard'
  if (role === 'hk_inventory_manager') return '/dashboard'
  if (role === 'horticulture_manager') return '/dashboard'
  if (role === 'hostel_office') return '/dashboard'
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
  const role = user?.username === 'hostel.office' || user?.actual_role === 'hostel_office'
    ? 'hostel_office'
    : user?.role
  if (!ADMIN_DASHBOARD_ALLOWED.includes(role)) {
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
              <ProtectedRoute allowedRoles={ADMIN_DASHBOARD_ALLOWED}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/*"
            element={
              <ProtectedRoute allowedRoles={HK_INVENTORY_ALLOWED}>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/housekeeping/*"
            element={
              <ProtectedRoute allowedRoles={HK_PORTAL_ALLOWED}>
                <HousekeepingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture-stock"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <HorticultureStockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture-inventory"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <HorticultureStockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture/stock"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <HorticultureStockPage />
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
            path="/geo-tracker"
            element={
              <ProtectedRoute allowedRoles={GEO_TRACKER_ALLOWED}>
                <GeoTrackerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insights"
            element={
              <ProtectedRoute allowedRoles={INSIGHTS_ALLOWED}>
                <InsightsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={ADMIN_OR_HK_INVENTORY}>
                <UsersPage />
              </ProtectedRoute>
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
