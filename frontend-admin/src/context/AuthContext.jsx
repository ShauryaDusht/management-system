import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api/auth'

const AuthContext = createContext(null)
const ALLOWED_PORTAL_ROLES = [
  'admin',
  'horticulture_manager',
  'hk_inventory_manager',
  'hostel_office',
  'estate_office',
  'civil_team',
  'electrical_team',
  'engineer',
]

function normalizePortalUser(user) {
  if (user?.username === 'hostel.office' || user?.actual_role === 'hostel_office') {
    return { ...user, role: 'hostel_office' }
  }
  return user
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      authAPI.me()
        .then(({ data }) => {
          const portalUser = normalizePortalUser(data)
          if (!ALLOWED_PORTAL_ROLES.includes(portalUser?.role)) {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            setUser(null)
            setUnauthorized(true)
            return
          }
          setUser(portalUser)
          setUnauthorized(false)
        })
        .catch(() => {
          localStorage.clear()
          setUser(null)
          setUnauthorized(false)
        })
        .finally(() => setLoading(false))
    } else {
      setUnauthorized(false)
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const { data } = await authAPI.login(username, password)
    const portalUser = normalizePortalUser(data?.user)
    if (!ALLOWED_PORTAL_ROLES.includes(portalUser?.role)) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      setUser(null)
      setUnauthorized(true)
      const err = new Error('Not authorized')
      err.code = 'NON_ADMIN'
      throw err
    }
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    setUser(portalUser)
    setUnauthorized(false)
    return portalUser
  }, [])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token')
    try {
      if (refresh) await authAPI.logout(refresh)
    } catch { /* ignore */ }
    localStorage.clear()
    setUser(null)
    setUnauthorized(false)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isInventoryManager = user?.role === 'inventory_manager'
  const isHousekeepingManager = false
  const isHKInventoryManager = user?.role === 'hk_inventory_manager'
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const isHorticultureManager = user?.role === 'horticulture_manager'
  const isEngineer = user?.role === 'engineer'
  const isEstateOffice = user?.role === 'estate_office' || user?.actual_role === 'estate_office' || user?.username === 'estate.office'
  const isAnyManager = isInventoryManager || isHKInventoryManager || isHostelOffice || isHorticultureManager || isEstateOffice || isEngineer
  const isCivilTeam = user?.role === 'civil_team'
  const isElectricalTeam = user?.role === 'electrical_team'
  const isSupervisor = user?.role === 'supervisor'
  const isCaretaker = user?.role === 'caretaker'

  const value = {
    user,
    loading,
    login,
    logout,
    unauthorized,
    isAdmin,
    isEngineer,
    isInventoryManager,
    isHousekeepingManager,
    isHKInventoryManager,
    isHostelOffice,
    isHorticultureManager,
    isEstateOffice,
    isCivilTeam,
    isElectricalTeam,
    isAnyManager,
    isSupervisor,
    isCaretaker,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
