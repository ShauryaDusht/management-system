import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import DashboardPage from './pages/dashboard/DashboardPage'
import HorticulturePage from './pages/horticulture/HorticulturePage'
import HousekeepingPage from './pages/housekeeping/HousekeepingPage'
import InventoryPage from './pages/inventory/InventoryPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/profile/ProfilePage'
import ReportsPage from './pages/reports/ReportsPage'
import UsersPage from './pages/users/UsersPage'

const ALL_AUTH = ['admin', 'manager', 'inventory_manager', 'supervisor', 'caretaker']
const ADMIN_MANAGER = ['admin', 'manager', 'inventory_manager']
const ADMIN_ONLY = ['admin']

function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (['admin', 'manager', 'inventory_manager'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Navigate to="/inventory" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/*"
            element={
              <ProtectedRoute allowedRoles={ALL_AUTH}>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/housekeeping/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
                <HousekeepingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/horticulture/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
                <HorticulturePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={ALL_AUTH}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
