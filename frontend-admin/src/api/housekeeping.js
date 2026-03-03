import api from './client'

export const hkAPI = {
  getAreas: () => api.get('/housekeeping/areas/'),
  getWorkers: (areaId) =>
    api.get('/housekeeping/workers/', { params: areaId ? { area: areaId } : {} }),
  getAttendanceSummary: (date) =>
    api.get('/housekeeping/attendance-summary/', { params: { date } }),
  getDailyRecords: (areaId, date) =>
    api.get('/housekeeping/daily-records/', { params: { area: areaId, date } }),
  getScheduleTemplates: (areaId) =>
    api.get('/housekeeping/schedule-templates/', { params: { area: areaId } }),
  getStockRequests: () => api.get('/housekeeping/stock-requests/'),
  updateStockRequestStatus: (id, status) =>
    api.patch(`/housekeeping/stock-requests/${id}/status/`, { status }),
  getAlerts: () => api.get('/housekeeping/alerts/'),
  getDashboardSummary: () => api.get('/housekeeping/dashboard-summary/'),
  getCaretakers: () => api.get('/auth/users/', { params: { role: 'caretaker' } }),
  getSupervisors: () => api.get('/auth/users/', { params: { role: 'supervisor' } }),
}
