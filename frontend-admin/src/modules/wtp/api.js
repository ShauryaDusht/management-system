import WtpApi from './WtpApi'

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { id: 'admin', username: 'admin', name: 'Administrator', role: 'admin' }
}

export const setStoredUser = (u) => {
  if (u) {
    localStorage.setItem('user', JSON.stringify(u))
  }
}

export const clearToken = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export const api = WtpApi
export default WtpApi
