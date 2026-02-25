import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import LoginPage         from './pages/LoginPage'
import DashboardPage     from './pages/DashboardPage'
import ItemsPage         from './pages/ItemsPage'
import ItemHistoryPage   from './pages/ItemHistoryPage'
import RequestsPage      from './pages/RequestsPage'
import MyRequestsPage    from './pages/MyRequestsPage'
import IssuesPage        from './pages/IssuesPage'
import Reports           from './pages/Reports'
import UsersPage         from './pages/UsersPage'
import UserActivityPage  from './pages/UserActivityPage'
import StockEntriesPage  from './pages/StockEntriesPage'

function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin')   return <Navigate to="/dashboard" replace />
  if (user.role === 'inventory_manager') return <Navigate to="/requests" replace />
  if (user.role === 'manager') return <Navigate to="/requests" replace />
  if (user.role === 'caretaker') return <Navigate to="/requests" replace />
  return <Navigate to="/my-requests" replace />
}

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <p className="text-4xl mb-3">🚫</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 text-sm">You do not have permission to view this page.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Admin only */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['admin']}><UsersPage /></ProtectedRoute>
          } />
          <Route path="/users/:id/activity" element={
            <ProtectedRoute allowedRoles={['admin']}><UserActivityPage /></ProtectedRoute>
          } />
          <Route path="/stock-entries" element={
            <ProtectedRoute allowedRoles={['admin']}><StockEntriesPage /></ProtectedRoute>
          } />
          <Route path="/items/:id/history" element={
            <ProtectedRoute allowedRoles={['admin']}><ItemHistoryPage /></ProtectedRoute>
          } />

          {/* Admin + Manager */}
          <Route path="/requests" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'inventory_manager', 'caretaker', 'supervisor']}><RequestsPage /></ProtectedRoute>
          } />
          <Route path="/issues" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}><IssuesPage /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'inventory_manager']}><Reports /></ProtectedRoute>
          } />

          {/* All roles */}
          <Route path="/items" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}><ItemsPage /></ProtectedRoute>
          } />

          {/* Supervisor only */}
          <Route path="/my-requests" element={
            <ProtectedRoute allowedRoles={['supervisor']}><MyRequestsPage /></ProtectedRoute>
          } />

          <Route path="/"  element={<RoleRedirect />} />
          <Route path="*"  element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
