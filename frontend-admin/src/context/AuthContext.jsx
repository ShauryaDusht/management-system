import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      authAPI.me()
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.clear()
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const { data } = await authAPI.login(username, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token')
    try {
      if (refresh) await authAPI.logout(refresh)
    } catch { /* ignore */ }
    localStorage.clear()
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isInventoryManager = user?.role === 'inventory_manager'
  const isHousekeepingManager = user?.role === 'housekeeping_manager'
  const isHorticultureManager = user?.role === 'horticulture_manager'
  const isAnyManager = isInventoryManager || isHousekeepingManager || isHorticultureManager
  const isSupervisor = user?.role === 'supervisor'
  const isCaretaker = user?.role === 'caretaker'

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin,
    isInventoryManager,
    isHousekeepingManager,
    isHorticultureManager,
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
