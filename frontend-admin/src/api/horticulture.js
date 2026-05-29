import api from './client'

export const horticultureAPI = {
  getSummary: () => api.get('/horticulture/admin/summary/'),
  getAreas: () => api.get('/horticulture/admin/areas/'),
  getZoneDetail: (zoneId) => api.get(`/horticulture/admin/zone/${zoneId}/`),
  getAttendance: (date) =>
    api.get('/horticulture/admin/attendance/', {
      params: date ? { date } : {},
    }),
  getSupervisors: () => api.get('/horticulture/admin/supervisors/'),
  getWorkers: () => api.get('/horticulture/admin/workers/'),
  createWorker: (data) => api.post('/horticulture/admin/workers/', data),
  updateWorker: (id, data) => api.patch(`/horticulture/admin/workers/${id}/`, data),
  deleteWorker: (id) => api.delete(`/horticulture/admin/workers/${id}/`),
  getWorkerReport: (id, month, year) =>
    api.get(`/horticulture/admin/workers/${id}/report/`, { params: { month, year } }),
  getAttendanceSummary: (date) =>
    api.get('/horticulture/admin/attendance-summary/', { params: { date } }),
  getAttendanceRecords: (date) =>
    api.get('/horticulture/admin/attendance-records/', { params: date ? { date } : {} }),
  createAttendanceRecord: (data) => api.post('/horticulture/admin/attendance-records/', data),
  updateAttendanceRecord: (id, data) => api.patch(`/horticulture/admin/attendance-records/${id}/`, data),
  listDailyAssignments: (params = {}) =>
    api.get('/horticulture/admin/daily-assignments/', { params }),
  downloadDailyAssignmentPhoto: (id) =>
    api.get(`/horticulture/admin/daily-assignments/${id}/photo/`, { responseType: 'blob' }),
  createDailyAssignment: (data) => api.post('/horticulture/admin/daily-assignments/', data),
  updateDailyAssignment: (id, data) => api.patch(`/horticulture/admin/daily-assignments/${id}/`, data),
  deleteDailyAssignment: (id) => api.delete(`/horticulture/admin/daily-assignments/${id}/`),
  listAreaTaskAssignments: (params = {}) =>
    api.get('/horticulture/admin/area-task-assignments/', { params }),
  createAreaTaskAssignment: (data) => api.post('/horticulture/admin/area-task-assignments/', data),
  updateAreaTaskAssignment: (id, data) => api.patch(`/horticulture/admin/area-task-assignments/${id}/`, data),
  deleteAreaTaskAssignment: (id) => api.delete(`/horticulture/admin/area-task-assignments/${id}/`),
  listTaskTypes: () => api.get('/horticulture/admin/task-types/'),
  createTaskType: (data) => api.post('/horticulture/admin/task-types/', data),
  updateTaskType: (id, data) => api.patch(`/horticulture/admin/task-types/${id}/`, data),
  deleteTaskType: (id) => api.delete(`/horticulture/admin/task-types/${id}/`),
  getManagerWeeklySummary: () => api.get('/horticulture/manager/weekly-summary/'),
  updateSeason: (season) => api.patch('/horticulture/manager/season/', { season }),
  getLeaveApprovals: () => api.get('/horticulture/admin/leave-approvals/'),
  decideLeaveApproval: (id, decision, note = '') =>
    api.post(`/horticulture/admin/leave-approvals/${id}/decision/`, { decision, note }),
}
