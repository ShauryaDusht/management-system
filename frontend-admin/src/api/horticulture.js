import api from './client'

export const horticultureAPI = {
  getSummary: () => api.get('/horticulture/admin/summary/'),
  getZoneDetail: (zoneId) => api.get(`/horticulture/admin/zone/${zoneId}/`),
  getAttendance: (date) =>
    api.get('/horticulture/admin/attendance/', {
      params: date ? { date } : {},
    }),
  getSupervisors: () => api.get('/horticulture/admin/supervisors/'),
  getManagerWeeklySummary: () => api.get('/horticulture/manager/weekly-summary/'),
  updateSeason: (season) => api.patch('/horticulture/manager/season/', { season }),
}
