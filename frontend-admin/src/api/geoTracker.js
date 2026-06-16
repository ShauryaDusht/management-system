import api from './client'

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

  exportCsv: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    const url = `/api/geo-tracker/records/export/${query ? '?' + query : ''}`
    window.open(url, '_blank')
  },
}
