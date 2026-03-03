import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { authAPI } from '../../api/auth'
import { useAuth } from '../../context/AuthContext'
import { Alert, Btn, Card, Field, Input } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handlePasswordUpdate = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await authAPI.changePassword(currentPassword, newPassword)
      setSuccess('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e2) {
      setError(e2.response?.data?.detail || 'Password update failed.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const initials = (user?.full_name || user?.username || 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('')

  return (
    <AdminLayout title="Admin Profile" subtitle="Account details and security settings">
      <Alert message={error} />
      <Alert type="success" message={success} />

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div
              style={{
                width: 66,
                height: 66,
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--green-700), var(--orange-600))',
                color: '#fff',
                fontSize: 22,
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {initials || 'A'}
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{user?.full_name || user?.username}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Username</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.username || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.email || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Phone</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.phone || '-'}</div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Btn variant="danger" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
              Logout
            </Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Security</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
            Change your login password.
          </div>

          <form onSubmit={handlePasswordUpdate}>
            <Field label="Current Password" required>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="New Password" required>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm New Password" required>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn type="submit" disabled={savingPassword}>
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Btn>
              <Btn
                type="button"
                variant="secondary"
                onClick={() => {
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setError('')
                  setSuccess('')
                }}
              >
                Reset
              </Btn>
            </div>
          </form>
        </Card>
      </div>
    </AdminLayout>
  )
}
