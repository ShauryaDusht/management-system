import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../api/auth'

const NAV = {
  admin: [
    { to: '/dashboard',    label: 'Dashboard',     icon: 'chart'     },
    { to: '/inventory',    label: 'Inventory',      icon: 'box'       },
    { to: '/requests',     label: 'All Requests',   icon: 'clipboard' },
    { to: '/reports',      label: 'Reports',        icon: 'report'    },
    { to: '/issues',       label: 'Issued Items',   icon: 'arrows'    },
    { to: '/stock-entries',label: 'Stock Log',      icon: 'stack'     },
    { to: '/users',        label: 'Users',          icon: 'users'     },
  ],
  inventory_manager: [
    { to: '/requests',     label: 'Requests',       icon: 'clipboard' },
    { to: '/reports',      label: 'Reports',        icon: 'report'    },
  ],
  manager: [
    { to: '/requests',     label: 'Requests',       icon: 'clipboard' },
    { to: '/reports',      label: 'Reports',        icon: 'report'    },
    { to: '/issues',       label: 'Issued Items',   icon: 'arrows'    },
    { to: '/inventory',    label: 'Inventory',      icon: 'box'       },
  ],
  supervisor: [
    { to: '/requests',     label: 'My Requests',    icon: 'clipboard' },
    { to: '/issues',       label: 'My Issues',      icon: 'arrows'    },
    { to: '/items',        label: 'Browse Items',   icon: 'box'       },
  ],
}

const ICONS = {
  chart: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  box: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  clipboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  arrows: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  ),
  stack: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  report: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V7a2 2 0 012-2h4.586A2 2 0 0111 5.586l1.414 1.414A2 2 0 0013.828 8H19a2 2 0 012 2v9a2 2 0 01-2 2z" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

function getDisplayName(user) {
  if (!user) return 'Unknown User'
  if (user.full_name && user.full_name.trim()) return user.full_name
  const composed = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  if (composed) return composed
  return user.username || 'Unknown User'
}

function getRoleLabel(role) {
  return String(role || 'user').replaceAll('_', ' ')
}

function getInventoryBlocks(role) {
  if (role === 'admin') {
    return ['All Categories']
  }
  if (role === 'manager' || role === 'inventory_manager') {
    return [
      'Cleaning Supplies',
      'Housekeeping Supplies',
      'Maintenance Supplies',
      'Garden & Horticulture Equipment',
      'Tools & Equipment',
    ]
  }
  if (role === 'supervisor') {
    return ['Cleaning Supplies', 'Consumables']
  }
  return ['Housekeeping Supplies', 'Cleaning Supplies']
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const profilePanelRef = useRef(null)

  const navItems = NAV[user?.role] || []
  const displayName = useMemo(() => getDisplayName(user), [user])
  const roleLabel = useMemo(() => getRoleLabel(user?.role), [user])
  const inventoryBlocks = useMemo(() => getInventoryBlocks(user?.role), [user])
  const avatarLetter = displayName?.[0]?.toUpperCase() || 'U'

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profilePanelRef.current && !profilePanelRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const resetPasswordForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setPasswordSuccess('')
  }

  const submitPasswordChange = async (event) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }

    setPasswordLoading(true)
    try {
      await authAPI.changePassword(currentPassword, newPassword)
      setPasswordSuccess('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setPasswordError(error?.response?.data?.error || 'Unable to change password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className={`flex flex-col bg-slate-900 text-white transition-all duration-200 ${open ? 'w-56' : 'w-16'} shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
            {ICONS.box}
          </div>
          {open && <span className="font-semibold text-sm tracking-wide truncate">Inventory</span>}
          <button onClick={() => setOpen(!open)} className="ml-auto text-slate-400 hover:text-white transition">
            <svg className={`w-4 h-4 transition-transform ${open ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="shrink-0">{ICONS[icon]}</span>
              {open && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Profile section */}
        <div className="border-t border-slate-700 p-3 relative" ref={profilePanelRef}>
          <div className={`flex items-center ${open ? 'gap-2' : 'justify-center'}`}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-[#2d4a3e] border border-slate-600 text-white flex items-center justify-center text-sm font-bold shrink-0"
              title="Open profile"
            >
              {avatarLetter}
            </button>
            {open && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                <p className="text-xs text-slate-400 capitalize truncate">{roleLabel}</p>
              </div>
            )}
            {open && (
              <button
                onClick={handleLogout}
                title="Logout"
                className="text-slate-400 hover:text-red-400 transition"
              >
                {ICONS.logout}
              </button>
            )}
          </div>

          {profileOpen && (
            <div
              className={`absolute z-30 rounded-xl border border-slate-200 bg-white shadow-xl p-4 text-slate-700 ${
                open ? 'left-3 right-3 bottom-14' : 'left-[calc(100%+8px)] bottom-0 w-72'
              }`}
            >
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                aria-label="Close profile"
              >
                ×
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-[#2d4a3e] text-white flex items-center justify-center font-bold">
                  {avatarLetter}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 capitalize truncate">{roleLabel}</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3">{user?.phone || 'No phone number'}</p>

              <div className="border-t border-slate-200 pt-3 mb-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Inventory Blocks In Charge</p>
                <ul className="space-y-1">
                  {inventoryBlocks.map((block) => (
                    <li key={block} className="text-xs text-slate-600">• {block}</li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordOpen(true)
                    setProfileOpen(false)
                    resetPasswordForm()
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-lg bg-[#2d4a3e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1f342b]"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>

      {passwordOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
              <button
                type="button"
                onClick={() => {
                  setPasswordOpen(false)
                  resetPasswordForm()
                }}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitPasswordChange} className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Current Password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">New Password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Confirm Password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  required
                />
              </label>

              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-emerald-700">{passwordSuccess}</p>
              )}

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordOpen(false)
                    resetPasswordForm()
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-lg bg-[#2d4a3e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1f342b] disabled:opacity-60"
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
