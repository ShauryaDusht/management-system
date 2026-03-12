import api from './client'

export const hkAPI = {
  getAreas: () => api.get('/housekeeping/areas/'),
  createArea: (payload) => api.post('/housekeeping/areas/', payload),
  getWorkers: (areaId) =>
    api.get('/housekeeping/workers/', { params: areaId ? { area: areaId } : {} }),
  getWorkerReport: (workerId, month, year) =>
    api.get(`/housekeeping/workers/${workerId}/report/`, {
      params: { month, year },
    }),
  getSupervisorReport: (supervisorId, month, year) =>
    api.get(`/housekeeping/supervisors/${supervisorId}/report/`, {
      params: { month, year },
    }),
  downloadWorkerReportCSV: (workerId, month, year) =>
    api.get(`/housekeeping/workers/${workerId}/report/csv/`, {
      params: { month, year },
      responseType: 'blob',
    }),
  downloadSupervisorReportCSV: (supervisorId, month, year) =>
    api.get(`/housekeeping/supervisors/${supervisorId}/report/csv/`, {
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
  getInchargeReport: (month, year) =>
    api.get('/housekeeping/incharge-assignments/report/', { params: { month, year } }),
  decideInchargeAssignment: (id, payload) =>
    api.post(`/housekeeping/incharge-assignments/${id}/decision/`, payload),
  getLeaveRequests: () => api.get('/housekeeping/leave-requests/'),
  getGallery: (params) => api.get('/admin/gallery/', { params: params || {} }),
  getGalleryGroupedByArea: (params) =>
    api.get('/admin/gallery/grouped-by-area/', { params: params || {} }),
  getGalleryStats: (params) => api.get('/admin/gallery/stats/', { params: params || {} }),
  getGalleryTaskPhotos: (taskId, params) =>
    api.get(`/admin/gallery/photos/${taskId}/`, { params: params || {} }),
  deleteGalleryPhoto: (photoId) => api.delete(`/admin/gallery/photo/${photoId}/delete/`),
  flagGalleryPhoto: (photoId, payload) => api.post(`/admin/gallery/photo/${photoId}/flag/`, payload || {}),
  exportGalleryCsv: (params) =>
    api.get('/admin/gallery/export-csv/', { params: params || {}, responseType: 'blob' }),
  downloadTaskPhotosZip: (taskId) =>
    api.get(`/admin/gallery/task/${taskId}/download-zip/`, { responseType: 'blob' }),
  getAttendanceSummary: (date) =>
    api.get('/housekeeping/attendance-summary/', { params: { date } }),
  getStaffAttendance: (date) =>
    api.get('/housekeeping/staff-attendance/', { params: { date } }),
  getDailyRecords: (areaOrParams, date) => {
    const params = {}
    if (areaOrParams && typeof areaOrParams === 'object' && !Array.isArray(areaOrParams)) {
      Object.assign(params, areaOrParams)
    } else {
      if (areaOrParams != null && areaOrParams !== '') params.area = areaOrParams
      if (date) params.date = date
    }
    return api.get('/housekeeping/daily-records/', { params })
  },
  assignAreaTask: (payload) => api.post('/housekeeping/assign-area-task/', payload),
  promoteTaskToDaily: (recordId) =>
    api.post('/housekeeping/promote-task-to-daily/', { record_id: recordId }),
  listScheduleTemplates: (params = {}) =>
    api.get('/housekeeping/schedule-templates/', { params }),
  createScheduleTemplate: (payload) => api.post('/housekeeping/schedule-templates/', payload),
  updateScheduleTemplate: (id, payload) => api.patch(`/housekeeping/schedule-templates/${id}/`, payload),
  deleteScheduleTemplate: (id) => api.delete(`/housekeeping/schedule-templates/${id}/`),
  getScheduleTemplates: (areaId) =>
    api.get('/housekeeping/schedule-templates/', { params: areaId ? { area: areaId } : {} }),
  getStockRequests: () => api.get('/housekeeping/stock-requests/'),
  updateStockRequestStatus: (id, status) =>
    api.patch(`/housekeeping/stock-requests/${id}/status/`, { status }),
  getAlerts: () => api.get('/housekeeping/alerts/'),
  getDashboardSummary: () => api.get('/housekeeping/dashboard-summary/'),
}
