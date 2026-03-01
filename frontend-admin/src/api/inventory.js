import api from './client'

export const inventoryAPI = {
  // Dashboard
  getDashboard: () => api.get('/inventory/dashboard/'),

  // Categories
  getCategories: () => api.get('/inventory/categories/'),
  createCategory: (data) => api.post('/inventory/categories/', data),

  // Items
  getItems: (params = {}) => api.get('/inventory/items/', { params }),
  getLowStockItems: () => api.get('/inventory/items/low-stock/'),
  getItem: (id) => api.get(`/inventory/items/${id}/`),
  createItem: (data) => api.post('/inventory/items/', data),
  updateItem: (id, data) => api.patch(`/inventory/items/${id}/`, data),
  deleteItem: (id) => api.delete(`/inventory/items/${id}/`),

  // Item history and stock entries
  getItemHistory: (id) => api.get(`/inventory/items/${id}/history/`),
  getItemStockEntries: (id) => api.get(`/inventory/items/${id}/stock-entries/`),

  // Stock entries (replenishment)
  getStockEntries: (params = {}) => api.get('/inventory/stock-entries/', { params }),
  createStockEntry: (data) => api.post('/inventory/stock-entries/', data),

  // Requests
  getRequests: () => api.get('/inventory/requests/'),
  createRequest: (data) => api.post('/inventory/requests/', data),
  reviewRequest: (id, data) => api.post(`/inventory/requests/${id}/review/`, data),
  issueRequest: (id, data) => api.post(`/inventory/requests/${id}/issue/`, data),

  // Issues
  getIssues: () => api.get('/inventory/issues/'),

  // Return asset (manager)
  returnAsset: (issueId, data) => api.post(`/inventory/issues/${issueId}/return/`, data),

  // Finalize consumable (supervisor)
  finalizeConsumable: (issueId, data) => api.post(`/inventory/issues/${issueId}/finalize/`, data),

  // User activity (admin)
  getUserActivity: (userId) => api.get(`/inventory/activity/users/${userId}/`),
}

export const getItems = (params = {}) => api.get('/inventory/api/items/', { params })
export const createItem = (data) => api.post('/inventory/api/items/', data)
export const updateItem = (id, data) => api.put(`/inventory/api/items/${id}/`, data)
export const deleteItem = (id) => api.delete(`/inventory/api/items/${id}/`)
export const adjustStock = (id, action, quantity) =>
  api.post(`/inventory/api/items/${id}/adjust-stock/`, { action, quantity })
export const getStats = () => api.get('/inventory/api/stats/')
export const getCategories = () => api.get('/inventory/api/categories/')
export const getRequests = (params = {}) => api.get('/inventory/api/requests/', { params })
export const createRequest = (data) => api.post('/inventory/api/requests/', data)
export const approveRequest = (id) => api.post(`/inventory/api/requests/${id}/approve/`)
export const rejectRequest = (id, reason) =>
  api.post(`/inventory/api/requests/${id}/reject/`, { rejection_reason: reason })
export const markUrgent = (id, isUrgent) =>
  api.post(`/inventory/api/requests/${id}/mark-urgent/`, { is_urgent: isUrgent })
export const getInventoryReport = () => api.get('/reports/inventory/')
export const getRequestsReport = (params = {}) => api.get('/reports/requests/', { params })

// Monthly procurement reports
export const reportsAPI = {
  // List all saved monthly reports
  listMonthly: () => api.get('/reports/monthly/'),

  // Generate a new monthly report
  generateMonthly: (month, year, overwrite = false) =>
    api.post('/reports/monthly/generate/', { month, year, overwrite }),

  // Get a single report (with full snapshot rows)
  getMonthly: (id) => api.get(`/reports/monthly/${id}/`),

  // Delete a saved report
  deleteMonthly: (id) => api.delete(`/reports/monthly/${id}/`),

  // Download URLs — open directly in browser to trigger file download
  csvUrl: (id) => `${api.defaults.baseURL}/reports/monthly/${id}/csv/`,
  pdfUrl: (id) => `${api.defaults.baseURL}/reports/monthly/${id}/pdf/`,
}