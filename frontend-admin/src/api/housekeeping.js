import api from './client'

export const hkAPI = {
  getAreas: () => api.get('/housekeeping/areas/'),
  getWorkers: (areaId) =>
    api.get('/housekeeping/workers/', { params: areaId ? { area: areaId } : {} }),
  getWorkerReport: (workerId, month, year) =>
    api.get(`/housekeeping/workers/${workerId}/report/`, {
      params: { month, year },
    }),
  downloadWorkerReportCSV: (workerId, month, year) =>
    api.get(`/housekeeping/workers/${workerId}/report/csv/`, {
      params: { month, year },
      responseType: 'blob',
    }),
  createWorker: (payload) => api.post('/housekeeping/workers/create/', payload),
  updateWorker: (id, payload) => api.patch(`/housekeeping/workers/${id}/`, payload),
  deleteWorker: (id) => api.delete(`/housekeeping/workers/${id}/`),
  getWorkerSelectionRequests: (status) =>
    api.get('/housekeeping/worker-selection-requests/', {
      params: status ? { status } : {},
    }),
  createWorkerSelectionRequest: (payload) =>
    api.post('/housekeeping/worker-selection-requests/', payload),
  decideWorkerSelectionRequest: (id, payload) =>
    api.post(`/housekeeping/worker-selection-requests/${id}/decision/`, payload),
  getInchargeAssignments: (status) =>
    api.get('/housekeeping/incharge-assignments/', {
      params: status ? { status } : {},
    }),
  decideInchargeAssignment: (id, payload) =>
    api.post(`/housekeeping/incharge-assignments/${id}/decision/`, payload),
  getLeaveRequests: () => api.get('/housekeeping/leave-requests/'),
  getInchargeNotifications: () => api.get('/housekeeping/incharge-notifications/'),
  getAttendanceSummary: (date) =>
    api.get('/housekeeping/attendance-summary/', { params: { date } }),
  getDailyRecords: (areaId, date) =>
    api.get('/housekeeping/daily-records/', { params: { area: areaId, date } }),
  assignAreaTask: (payload) => api.post('/housekeeping/assign-area-task/', payload),
  promoteTaskToDaily: (recordId) =>
    api.post('/housekeeping/promote-task-to-daily/', { record_id: recordId }),
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
