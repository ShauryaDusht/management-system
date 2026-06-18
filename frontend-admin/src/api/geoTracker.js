import api, { BASE_URL } from './client'

export const geoApi = {
  getRecords: (params = {}) =>
    api.get('/geo-tracker/records/', { params }),

  getRecord: (id) =>
    api.get(`/geo-tracker/records/${id}/`),

  deleteRecord: (id) =>
    api.delete(`/geo-tracker/records/${id}/`),

  updateRecord: (id, data) =>
    api.patch(`/geo-tracker/records/${id}/`, data),

  getVarieties: (plantType = null) =>
    api.get('/geo-tracker/varieties/', { params: plantType ? { plant_type: plantType } : {} }),

  getZones: () =>
    api.get('/geo-tracker/zones/'),

  getStats: () =>
    api.get('/geo-tracker/stats/'),

  exportCsv: async (params = {}) => {
    const query = new URLSearchParams(params).toString()
    const url = `${BASE_URL}/geo-tracker/records/export/${query ? '?' + query : ''}`
    const token = localStorage.getItem('access_token')
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Export failed')
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'plant_records.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  },
}
