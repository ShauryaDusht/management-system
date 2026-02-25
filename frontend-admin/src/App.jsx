import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import LoginPage      from './pages/LoginPage'
import DashboardPage  from './pages/DashboardPage'
import ItemsPage      from './pages/ItemsPage'
import RequestsPage   from './pages/RequestsPage'
import MyRequestsPage from './pages/MyRequestsPage'
import IssuesPage     from './pages/IssuesPage'
import UsersPage      from './pages/UsersPage'

function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin')      return <Navigate to="/dashboard" replace />
  if (user.role === 'manager')    return <Navigate to="/requests" replace />
  return <Navigate to="/my-requests" replace />
}

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <p className="text-4xl mb-3">🚫</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 text-sm">You don't have permission to view this page.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Admin only */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UsersPage />
            </ProtectedRoute>
          } />

          {/* Admin + Manager */}
          <Route path="/requests" element={
            <ProtectedRoute allowedRoles={['admin', 'manager']}>
              <RequestsPage />
            </ProtectedRoute>
          } />
          <Route path="/issues" element={
            <ProtectedRoute allowedRoles={['admin', 'manager']}>
              <IssuesPage />
            </ProtectedRoute>
          } />

          {/* All roles (items read for all; add/edit restricted inside the page) */}
          <Route path="/items" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
              <ItemsPage />
            </ProtectedRoute>
          } />

          {/* Supervisor only */}
          <Route path="/my-requests" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <MyRequestsPage />
            </ProtectedRoute>
          } />

          {/* Default redirect */}
          <Route path="/"   element={<RoleRedirect />} />
          <Route path="*"   element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
