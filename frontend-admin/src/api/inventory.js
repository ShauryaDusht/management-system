import api from './client'

export const inventoryAPI = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboard: () => api.get('/inventory/dashboard/'),
  getStats: () => api.get('/inventory/dashboard/'),   // alias — same endpoint as getDashboard

  // ── Categories ─────────────────────────────────────────────────────────────
  getCategories: () => api.get('/inventory/categories/'),
  createCategory: (data) => api.post('/inventory/categories/', data),

  // ── Items ──────────────────────────────────────────────────────────────────
  getItems: (params = {}) => api.get('/inventory/items/', { params: { page_size: 200, ...params } }),
  getLowStockItems: () => api.get('/inventory/items/low-stock/'),
  getItem: (id) => api.get(`/inventory/items/${id}/`),
  createItem: (data) => api.post('/inventory/items/', data),
  updateItem: (id, data) => api.patch(`/inventory/items/${id}/`, data),
  deleteItem: (id) => api.delete(`/inventory/items/${id}/`),

  // Stock adjust — maps to the /api/ route which is the only remaining
  // endpoint from the legacy api_views.py set that has no equivalent in views.py
  adjustStock: (id, action, quantity) =>
    api.post(`/inventory/api/items/${id}/adjust-stock/`, { action, quantity }),

  // ── Item history and stock entries ─────────────────────────────────────────
  getItemHistory: (id) => api.get(`/inventory/items/${id}/history/`),
  getItemStockEntries: (id) => api.get(`/inventory/items/${id}/stock-entries/`),

  // ── Stock entries (replenishment) ──────────────────────────────────────────
  getStockEntries: (params = {}) => api.get('/inventory/stock-entries/', { params: { page_size: 200, ...params } }),
  createStockEntry: (data) => api.post('/inventory/stock-entries/', data),

  // ── Requests ───────────────────────────────────────────────────────────────
  getRequests: (params = {}) => api.get('/inventory/requests/', { params: { page_size: 200, ...params } }),
  createRequest: (data) => api.post('/inventory/requests/', data),
  reviewRequest: (id, data) => api.post(`/inventory/requests/${id}/review/`, data),
  issueRequest: (id, data) => api.post(`/inventory/requests/${id}/issue/`, data),

  // approve / reject use the /api/ legacy routes because those are the ones
  // the frontend has always called and they work correctly after BUG-05 was fixed.
  approveRequest: (id) => api.post(`/inventory/api/requests/${id}/approve/`),
  rejectRequest: (id, reason) =>
    api.post(`/inventory/api/requests/${id}/reject/`, { rejection_reason: reason }),
  markUrgent: (id, isUrgent) =>
    api.post(`/inventory/api/requests/${id}/mark-urgent/`, { is_urgent: isUrgent }),

  // ── Issues ─────────────────────────────────────────────────────────────────
  getIssues: (params = {}) => api.get('/inventory/issues/', { params: { page_size: 200, ...params } }),

  // Return asset (manager)
  returnAsset: (issueId, data) => api.post(`/inventory/issues/${issueId}/return/`, data),

  // Finalize consumable (supervisor)
  finalizeConsumable: (issueId, data) => api.post(`/inventory/issues/${issueId}/finalize/`, data),

  // ── User activity (admin) ──────────────────────────────────────────────────
  getUserActivity: (userId) => api.get(`/inventory/activity/users/${userId}/`),
}

// ── Reports API ────────────────────────────────────────────────────────────
// Kept as a separate export since it belongs to the reports domain, not inventory.
export const getInventoryReport = () => api.get('/reports/inventory/')
export const getRequestsReport = (params = {}) => api.get('/reports/requests/', { params })
export const listMonthly = () => api.get('/reports/monthly/')
export const generateMonthly = (month, year, overwrite = false) =>
  api.post('/reports/monthly/generate/', { month, year, overwrite })
export const getMonthly = (id) => api.get(`/reports/monthly/${id}/`)
export const deleteMonthly = (id) => api.delete(`/reports/monthly/${id}/`)
export const csvUrl = (id) => `${api.defaults.baseURL}/reports/monthly/${id}/csv/`
export const pdfUrl = (id) => `${api.defaults.baseURL}/reports/monthly/${id}/pdf/`
export const getConsumptionReports = () => api.get('/reports/consumption/')
export const generateConsumptionReport = (month, year, overwrite = false) =>
  api.post('/reports/consumption/generate/', { month, year, overwrite })
export const getConsumptionReportDetail = (id) => api.get(`/reports/consumption/${id}/`)
export const downloadConsumptionItemCSV = (id) =>
  api.get(`/reports/consumption/${id}/csv/items/`, { responseType: 'blob' })
export const downloadConsumptionRequesterCSV = (id) =>
  api.get(`/reports/consumption/${id}/csv/requesters/`, { responseType: 'blob' })

export const reportsAPI = {
  getInventoryReport,
  getRequestsReport,

  // Monthly procurement reports (Phase 3 — backend not yet wired)
  listMonthly,
  generateMonthly,
  getMonthly,
  deleteMonthly,
  csvUrl,
  pdfUrl,
  getAreaIssuesReport: (params = {}) => api.get('/reports/area-issues/', { params }),
  downloadAreaIssuesCSV: (params = {}) =>
    api.get('/reports/area-issues/', {
      params: { ...params, download: 'csv' },
      responseType: 'blob',
    }),

  // Item consumption reports
  getConsumptionReports,
  generateConsumptionReport,
  getConsumptionReportDetail,
  downloadConsumptionItemCSV,
  downloadConsumptionRequesterCSV,
}
