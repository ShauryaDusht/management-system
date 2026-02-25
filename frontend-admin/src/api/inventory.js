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

  // NEW — Item history & stock entries
  getItemHistory: (id) => api.get(`/inventory/items/${id}/history/`),
  getItemStockEntries: (id) => api.get(`/inventory/items/${id}/stock-entries/`),

  // NEW — Stock entries (replenishment)
  getStockEntries: (params = {}) => api.get('/inventory/stock-entries/', { params }),
  createStockEntry: (data) => api.post('/inventory/stock-entries/', data),

  // Requests
  getRequests: () => api.get('/inventory/requests/'),
  createRequest: (data) => api.post('/inventory/requests/', data),
  reviewRequest: (id, data) => api.post(`/inventory/requests/${id}/review/`, data),
  issueRequest: (id, data) => api.post(`/inventory/requests/${id}/issue/`, data),

  // Issues
  getIssues: () => api.get('/inventory/issues/'),

  // NEW — Return asset (manager)
  returnAsset: (issueId, data) => api.post(`/inventory/issues/${issueId}/return/`, data),

  // NEW — Finalize consumable (supervisor)
  finalizeConsumable: (issueId, data) => api.post(`/inventory/issues/${issueId}/finalize/`, data),

  // NEW — User activity (admin)
  getUserActivity: (userId) => api.get(`/inventory/activity/users/${userId}/`),
}
