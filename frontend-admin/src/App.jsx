import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

// Root redirect based on role
function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/dashboard" replace />
  if (user.role === 'manager') return <Navigate to="/requests" replace />
  return <Navigate to="/my-requests" replace />
}

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500 text-sm">You don't have permission to view this page.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Admin routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardPage />
            </ProtectedRoute>
          } />

          {/* Placeholder routes — add pages as you build them */}
          <Route path="/requests" element={
            <ProtectedRoute allowedRoles={['admin', 'manager']}>
              <div className="p-8 text-gray-500">Requests page — coming soon</div>
            </ProtectedRoute>
          } />

          <Route path="/my-requests" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <div className="p-8 text-gray-500">My Requests page — coming soon</div>
            </ProtectedRoute>
          } />

          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
