import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import DashboardPage from './pages/dashboard/DashboardPage'
import HorticulturePage from './pages/horticulture/HorticulturePage'
import HousekeepingPage from './pages/housekeeping/HousekeepingPage'
import InventoryPage from './pages/inventory/InventoryPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/profile/ProfilePage'
import ReportsPage from './pages/reports/ReportsPage'
import UsersPage from './pages/users/UsersPage'

const ADMIN_ONLY = ['admin']

function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/dashboard" replace />
  window.location.href = '/portal/'
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

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
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <HorticulturePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
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
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
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
