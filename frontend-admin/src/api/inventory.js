import api from './client'

export const inventoryAPI = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboard: () => api.get('/inventory/dashboard/'),

  // ── Categories ─────────────────────────────────────────────────────────────
  getCategories: () => api.get('/inventory/categories/'),
  // UNUSED - no UI implemented yet
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
  // UNUSED - no UI implemented yet
  getItemStockEntries: (id) => api.get(`/inventory/items/${id}/stock-entries/`),

  // ── Stock entries (replenishment) ──────────────────────────────────────────
  getStockEntries: (params = {}) => api.get('/inventory/stock-entries/', { params: { page_size: 200, ...params } }),
  createStockEntry: (data) => api.post('/inventory/stock-entries/', data),

  // ── Requests ───────────────────────────────────────────────────────────────
  getRequests: (params = {}) => api.get('/inventory/requests/', { params: { page_size: 200, ...params } }),
  createRequest: (data) => api.post('/inventory/requests/', data),
  createRequestBatch: (data) => api.post('/inventory/requests/batch/', data),
  reviewRequest: (id, data) => api.post(`/inventory/requests/${id}/review/`, data),
  issueRequest: (id, data) => api.post(`/inventory/requests/${id}/issue/`, data),
  getPurchaseRequests: (params = {}) => api.get('/inventory/purchase-requests/', { params: { page_size: 200, ...params } }),
  createPurchaseRequest: (data) => api.post('/inventory/purchase-requests/', data),
  decidePurchaseRequest: (id, data) => api.post(`/inventory/purchase-requests/${id}/decision/`, data),

  // reject and markUrgent use the /api/ legacy routes
  rejectRequest: (id, reason) =>
    api.post(`/inventory/api/requests/${id}/reject/`, { rejection_reason: reason }),
  markUrgent: (id, isUrgent) =>
    api.post(`/inventory/api/requests/${id}/mark-urgent/`, { is_urgent: isUrgent }),

  // ── Issues ─────────────────────────────────────────────────────────────────
  getIssues: (params = {}) => api.get('/inventory/issues/', { params: { page_size: 200, ...params } }),
  adjustIssue: (issueId, data) => api.post(`/inventory/issues/${issueId}/adjust/`, data),
  getIssueAdjustments: (issueId) => api.get(`/inventory/issues/${issueId}/adjustments/`),

  // Return asset (manager)
  returnAsset: (issueId, data) => api.post(`/inventory/issues/${issueId}/return/`, data),

  // Finalize consumable (supervisor)
  finalizeConsumable: (issueId, data) => api.post(`/inventory/issues/${issueId}/finalize/`, data),

  // Usage logs (caretaker/supervisor)
  logUsage: (issueId, data) => api.post(`/inventory/issues/${issueId}/log-usage/`, data),
  getUsageLogs: (issueId, params = {}) =>
    api.get(`/inventory/issues/${issueId}/log-usage/`, { params }),
  getUserIssueLogs: (issueId, params = {}) =>
    api.get(`/inventory/issues/${issueId}/log-usage/`, { params }),
  getUserUsageLogs: (userId, month, year) =>
    api.get(`/inventory/users/${userId}/usage-logs/`, { params: { month, year } }),

  // ── User activity (admin) ──────────────────────────────────────────────────
  // UNUSED - no UI implemented yet
  getUserActivity: (userId) => api.get(`/inventory/activity/users/${userId}/`),
}

// ── Reports API ────────────────────────────────────────────────────────────
// Kept as a separate export since it belongs to the reports domain, not inventory.
export const getInventoryReport = (params = {}) => api.get('/reports/inventory/', { params })
export const getRequestsReport = (params = {}) => api.get('/reports/requests/', { params })
export const listMonthly = () => api.get('/reports/monthly/')
export const generateMonthly = (month, year, overwrite = false) =>
  api.post('/reports/monthly/generate/', { month, year, overwrite })
export const getMonthly = (id) => api.get(`/reports/monthly/${id}/`)
export const deleteMonthly = (id) => api.delete(`/reports/monthly/${id}/`)
export const csvUrl = (id) => `${api.defaults.baseURL}/reports/monthly/${id}/csv/`
export const pdfUrl = (id) => `${api.defaults.baseURL}/reports/monthly/${id}/pdf/`
export const getActivityTrend = (params = {}) => api.get('/reports/activity-trend/', { params })
export const getDashboardInsights = (params = {}) => api.get('/reports/dashboard-insights/', { params })
export const getConsumptionReports = () => api.get('/reports/consumption/')
export const generateConsumptionReport = (month, year, overwrite = false) =>
  api.post('/reports/consumption/generate/', { month, year, overwrite })
export const getConsumptionReportDetail = (id) => api.get(`/reports/consumption/${id}/`)
export const downloadConsumptionItemCSV = (id) =>
  api.get(`/reports/consumption/${id}/csv/items/`, { responseType: 'blob' })
export const downloadConsumptionRequesterCSV = (id) =>
  api.get(`/reports/consumption/${id}/csv/requesters/`, { responseType: 'blob' })

export const getAnnualBudget = (year) => api.get('/reports/annual-budget/', { params: { year } })
export const downloadAnnualStockRegisterCSV = (year) =>
  api.get('/reports/annual-budget/', {
    params: { year, download: 'stock_register_csv' },
    responseType: 'blob',
  })
export const listPurchasePlans = () => api.get('/reports/purchase-plan/periods/')
export const getPurchasePlan = (month, year) =>
  api.get('/reports/purchase-plan/', { params: { month, year } })
export const savePurchasePlan = (month, year, rows) =>
  api.post('/reports/purchase-plan/', { month, year, rows })
export const downloadPurchasePlanCSV = (month, year, itemIds = []) =>
  api.get('/reports/purchase-plan/csv/', {
    params: {
      month,
      year,
      ...(itemIds.length ? { item_ids: itemIds.join(',') } : {}),
    },
    responseType: 'blob',
  })

export const reportsAPI = {
  getInventoryReport,
  getRequestsReport,
  getActivityTrend,
  getDashboardInsights,

  // Monthly procurement reports (Phase 3 — backend not yet wired)
  listMonthly,
  generateMonthly,
  getMonthly,
  deleteMonthly,
  csvUrl,
  pdfUrl,
  listPurchasePlans,
  getPurchasePlan,
  savePurchasePlan,
  downloadPurchasePlanCSV,
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
