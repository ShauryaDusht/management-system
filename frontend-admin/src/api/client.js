import axios from 'axios'

function defaultApiUrl() {
  const { protocol, hostname, port } = window.location
  if (protocol === 'https:') {
    const apiPort = port === '9443' ? '8443' : port
    return `${protocol}//${hostname}${apiPort ? `:${apiPort}` : ''}/api`
  }
  return `http://${hostname}:8000/api`
}

const BASE_URL = import.meta.env.VITE_API_URL || defaultApiUrl()

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
// access token is attached with request to allow the global 401 handler to trigger on expired tokens
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Track in-progress refresh to avoid multiple simultaneous refresh calls ───
let isRefreshing = false
let failedQueue = []    // requests waiting while refresh is in progress

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// global 401 handler with refresh + redirect
// Previously there was no protection against multiple simultaneous refresh
// attempts: if 3 requests all got 401 at the same time, 3 refresh calls fired.
// Now a queue holds the waiting requests until the single refresh completes.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Don't intercept refresh calls themselves (avoid infinite loop)
    if (original.url?.includes('/auth/token/refresh/')) {
      localStorage.clear()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        // Queue this request until the refresh finishes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`
            return api(original)
          })
          .catch((err) => Promise.reject(err))
      }

      original._retry = true
      isRefreshing = true

      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
        localStorage.setItem('access_token', data.access)
        // If the server rotates refresh tokens, store the new one
        if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
        api.defaults.headers.common.Authorization = `Bearer ${data.access}`
        processQueue(null, data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
