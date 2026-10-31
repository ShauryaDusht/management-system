import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { authAPI } from '../../api/auth'
import { hkAPI } from '../../api/housekeeping'
import { useAuth } from '../../context/AuthContext'
import { Alert, Btn, Card, Field, Input, Modal, Spinner } from '../../components/ui'

export default function ProfileTab() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Edit details modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await hkAPI.getProfile()
      setProfileData(res.data)
      const u = res.data?.user || user
      setEditForm({
        first_name: u?.first_name || '',
        last_name: u?.last_name || '',
        email: u?.email || '',
        phone: u?.phone || '',
      })
    } catch {
      // Fallback to user from context
      setEditForm({
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        email: user?.email || '',
        phone: user?.phone || '',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handlePasswordUpdate = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await authAPI.changePassword(currentPassword, newPassword)
      setPasswordSuccess('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e2) {
      setPasswordError(e2.response?.data?.detail || 'Password update failed.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setSavingProfile(true)
    try {
      await hkAPI.updateProfile(editForm)
      setProfileSuccess('Profile details updated successfully.')
      setEditOpen(false)
      if (typeof refreshUser === 'function') {
        await refreshUser()
      }
      await fetchProfile()
    } catch (err) {
      setProfileError(err.response?.data?.detail || 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const displayUser = profileData?.user || user
  const areas = profileData?.areas || []
  const tempAreas = profileData?.temporary_areas || []
  const stats = profileData?.worker_stats || null

  const initials = (displayUser?.full_name || displayUser?.username || 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('')

  if (loading && !profileData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      {passwordError && <Alert message={passwordError} style={{ marginBottom: 12 }} />}
      {passwordSuccess && <Alert type="success" message={passwordSuccess} style={{ marginBottom: 12 }} />}
      {profileSuccess && <Alert type="success" message={profileSuccess} style={{ marginBottom: 12 }} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 16 }}>
        {/* Account Details Card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
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
                flexShrink: 0,
              }}
            >
              {initials || 'A'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayUser?.full_name || displayUser?.username}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize', marginTop: 2 }}>
                {displayUser?.role?.replaceAll('_', ' ')}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Username</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayUser?.username || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayUser?.email || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Phone</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayUser?.phone || '-'}</div>
            </div>
          </div>

          {/* Assigned Housekeeping Areas */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
              Areas In Charge ({areas.length})
            </div>
            {areas.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {areas.map((a) => (
                  <span
                    key={a.id}
                    style={{
                      background: 'rgba(45,74,62,0.08)',
                      color: 'var(--green-800)',
                      border: '1px solid rgba(45,74,62,0.18)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {['admin', 'hk_inventory_manager'].includes(displayUser?.role)
                  ? 'All Housekeeping Areas (Administrator)'
                  : 'No specific areas assigned.'}
              </div>
            )}
          </div>

          {/* Temporary Area Assignments */}
          {tempAreas.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                🔄 Temporary Areas In Charge
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tempAreas.map((ta) => (
                  <span
                    key={ta.id}
                    style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                    title={`${ta.start_date} to ${ta.end_date}${ta.note ? ` (${ta.note})` : ''}`}
                  >
                    {ta.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Supervised Worker Stats */}
          {stats && stats.total > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
                Supervised Workers
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: 'var(--surface-2)', padding: '8px 4px', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{stats.total}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Total</div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '8px 4px', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{stats.floor + stats.washroom}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Regular</div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '8px 4px', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#c2410c' }}>{stats.relievers}</div>
                  <div style={{ fontSize: 10, color: '#c2410c' }}>Relievers</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
            <Btn
              variant="secondary"
              onClick={() => {
                setProfileError('')
                setProfileSuccess('')
                setEditOpen(true)
              }}
              style={{ justifyContent: 'center' }}
            >
              Edit Details
            </Btn>
            <Btn variant="danger" onClick={handleLogout} style={{ justifyContent: 'center' }}>
              Logout
            </Btn>
          </div>
        </Card>

        {/* Security & Password Card */}
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

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
                  setPasswordError('')
                  setPasswordSuccess('')
                }}
              >
                Reset
              </Btn>
            </div>
          </form>
        </Card>
      </div>

      {/* Edit Profile Modal */}
      {editOpen && (
        <Modal title="Edit Profile Details" onClose={() => setEditOpen(false)}>
          {profileError && <Alert message={profileError} style={{ marginBottom: 12 }} />}
          <form onSubmit={handleProfileSave}>
            <Field label="First Name">
              <Input
                value={editForm.first_name}
                onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
              />
            </Field>
            <Field label="Last Name">
              <Input
                value={editForm.last_name}
                onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Btn variant="secondary" type="button" onClick={() => setEditOpen(false)}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
