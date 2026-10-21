import api, { BASE_URL } from './client'

export const liftApi = {
  getLifts: (params = {}) => api.get('/lifts/', { params }),

  getStats: (params = {}) => api.get('/lifts/stats/', { params }),

  getConfig: () => api.get('/lifts/config/'),

  updateConfig: (data) => api.post('/lifts/config/', data),

  triggerAlert: (data = {}) => api.post('/lifts/trigger-alert/', data),

  getLift: (id) => api.get(`/lifts/${id}/`),

  createLift: (data) => api.post('/lifts/', data),

  updateLift: (id, data) => api.patch(`/lifts/${id}/`, data),

  deleteLift: (id) => api.delete(`/lifts/${id}/`),

  exportCsv: async () => {
    const url = `${BASE_URL}/lifts/export/`
    const token = localStorage.getItem('access_token')
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Export failed')
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `lift_licenses_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  },
}
