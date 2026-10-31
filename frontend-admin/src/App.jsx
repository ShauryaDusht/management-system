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
import SubstationPage from './pages/substation/SubstationPage'
import WtpPage from './pages/wtp/WtpPage'
import HvacPage from './pages/hvac/HvacPage'
import LiftLicensePage from './pages/lifts/LiftLicensePage'
import EstatePage from './pages/estate/EstatePage'

const SUBSTATION_ALLOWED = [
  'admin',
  'plant_engineer',
  'electrical_supervisor',
  'operator',
  'electrical_operator',
]

const WTP_STP_ALLOWED = [
  'admin',
  'plant_engineer',
  'wtp_supervisor',
  'operator',
  'wtp_operator',
]

const HVAC_ALLOWED = [
  'admin',
  'hvac_engineer',
  'hvac_supervisor',
  'operator',
  'hvac_operator',
]

const ADMIN_OR_HK_INVENTORY = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'technical_assistant']
const ADMIN_DASHBOARD_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office', 'estate_office', 'civil_team', 'electrical_team', 'technical_assistant']
const HK_INVENTORY_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office', 'technical_assistant']
const HK_PORTAL_ALLOWED = ['admin', 'hk_inventory_manager', 'hostel_office', 'supervisor', 'technical_assistant']
const HORTICULTURE_ALLOWED = ['admin', 'horticulture_manager', 'supervisor', 'technical_assistant']
const GEO_TRACKER_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'supervisor', 'technical_assistant']
const INSIGHTS_ALLOWED = ['admin', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office', 'estate_office', 'technical_assistant']
const LIFTS_ALLOWED = ['admin', 'engineer', 'hvac_engineer']
const ESTATE_ALLOWED = ['admin', 'estate_office', 'civil_team', 'electrical_team', 'hk_inventory_manager']
const PROFILE_ALLOWED = [
  'technical_assistant',
  'admin',
  'horticulture_manager',
  'estate_office',
  'hk_inventory_manager',
  'hostel_office',
  'civil_team',
  'electrical_team',
  'engineer',
  'plant_engineer',
  'electrical_supervisor',
  'electrical_operator',
  'wtp_supervisor',
  'wtp_operator',
  'hvac_engineer',
  'hvac_supervisor',
  'hvac_operator',
]
const ALL_PORTAL_ROLES = [
  'technical_assistant',
  'admin',
  'hk_inventory_manager',
  'horticulture_manager',
  'hostel_office',
  'supervisor',
  'estate_office',
  'civil_team',
  'electrical_team',
  'engineer',
  'plant_engineer',
  'electrical_supervisor',
  'electrical_operator',
  'wtp_supervisor',
  'wtp_operator',
  'hvac_engineer',
  'hvac_supervisor',
  'hvac_operator',
  'operator',
]
const ROUTER_BASENAME = '/admin'

function getLandingRoute(user) {
  const role = user?.username === 'hostel.office' || user?.actual_role === 'hostel_office'
    ? 'hostel_office'
    : user?.role
  if (role === 'admin') return '/dashboard'
  if (role === 'technical_assistant') return '/dashboard'
  if (role === 'estate_office') return '/dashboard'
  if (role === 'civil_team') return '/estate'
  if (role === 'electrical_team') return '/estate'
  if (role === 'hk_inventory_manager') return '/dashboard'
  if (role === 'horticulture_manager') return '/dashboard'
  if (role === 'hostel_office') return '/dashboard'
  if (role === 'engineer') return '/lifts'
  if (role === 'plant_engineer') return '/substation'
  if (
    role === 'electrical_supervisor' ||
    role === 'electrical_operator'
  ) {
    return '/substation'
  }
  if (
    role === 'wtp_supervisor' ||
    role === 'wtp_operator'
  ) {
    return '/wtp'
  }
  if (
    role === 'hvac_engineer' ||
    role === 'hvac_supervisor' ||
    role === 'hvac_operator'
  ) {
    return '/hvac'
  }
  if (role === 'supervisor') {
    return '/housekeeping'
  }
  if (role === 'operator') {
    return '/substation'
  }
  return '/unauthorized'
}

function DashboardRoute() {
  const { user } = useAuth()
  if (user?.role === 'estate_office') {
    return <EstatePage />
  }
  if (user?.role === 'civil_team' || user?.role === 'electrical_team') {
    return <Navigate to="/estate" replace />
  }
  return <DashboardPage />
}

function EstateRoute() {
  const { user } = useAuth()
  if (user?.role === 'estate_office') {
    return <Navigate to="/dashboard" replace />
  }
  return <EstatePage />
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
                <DashboardRoute />
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
                <Navigate to="/inventory/horticulture" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture-inventory"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <Navigate to="/inventory/horticulture" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture/stock"
            element={
              <ProtectedRoute allowedRoles={HORTICULTURE_ALLOWED}>
                <Navigate to="/inventory/horticulture" replace />
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
            path="/estate/*"
            element={
              <ProtectedRoute allowedRoles={ESTATE_ALLOWED}>
                <EstateRoute />
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
            path="/substation/*"
            element={
              <ProtectedRoute allowedRoles={SUBSTATION_ALLOWED}>
                <SubstationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wtp/*"
            element={
              <ProtectedRoute allowedRoles={WTP_STP_ALLOWED}>
                <WtpPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wtp-stp/*"
            element={
              <ProtectedRoute allowedRoles={WTP_STP_ALLOWED}>
                <WtpPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hvac/*"
            element={
              <ProtectedRoute allowedRoles={HVAC_ALLOWED}>
                <HvacPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hvac-engineer/*"
            element={
              <ProtectedRoute allowedRoles={HVAC_ALLOWED}>
                <HvacPage />
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
            path="/lifts"
            element={
              <ProtectedRoute allowedRoles={LIFTS_ALLOWED}>
                <LiftLicensePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={ALL_PORTAL_ROLES}>
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
