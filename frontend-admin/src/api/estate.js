import api from './client'

export const estateApi = {
  // Shops
  getShops: (cycle) => api.get('/estate/shops/', { params: cycle ? { cycle } : {} }),
  createShop: (data, cycle) => api.post('/estate/shops/', data, { params: cycle ? { cycle } : {} }),
  patchShop: (id, data) => api.patch(`/estate/shops/${id}/`, data),
  deleteShop: (id) => api.delete(`/estate/shops/${id}/`),
  patchAllShops: (data, cycle) => api.patch('/estate/shops/', data, { params: cycle ? { cycle } : {} }),

  // Contractors (Electricity)
  getContractors: (cycle) => api.get('/estate/contractors/', { params: cycle ? { cycle } : {} }),
  createContractor: (data, cycle) => api.post('/estate/contractors/', data, { params: cycle ? { cycle } : {} }),
  patchContractor: (id, data) => api.patch(`/estate/contractors/${id}/`, data),
  deleteContractor: (id) => api.delete(`/estate/contractors/${id}/`),
  patchAllContractors: (data, cycle) => api.patch('/estate/contractors/', data, { params: cycle ? { cycle } : {} }),

  // Settings
  getSettings: () => api.get('/estate/settings/'),
  updateSettings: (data) => api.put('/estate/settings/', data),
  sendTestEmail: (data) => api.post('/estate/settings/test-email/', data),

  // Billing Cycles / History
  getCycles: () => api.get('/estate/cycles/'),
  createCycle: (month, label) => api.post('/estate/cycles/', { month, label }),

  // Housing (Allotments & Inventory)
  getHousing: (params) => api.get('/estate/housing/', { params }),
  createHousing: (data) => api.post('/estate/housing/', data),
  patchHousing: (id, data) => api.patch(`/estate/housing/${id}/`, data),
  deleteHousing: (id) => api.delete(`/estate/housing/${id}/`),
  getHousingUnits: (params) => api.get('/estate/housing/units/', { params }),
  createHousingUnit: (data) => api.post('/estate/housing/units/', data),
  getHousingHistory: (params) => api.get('/estate/housing/history/', { params }),
  vacateHousing: (id, data) => api.post(`/estate/housing/${id}/vacate/`, data),
  relocateHousing: (id, data) => api.post(`/estate/housing/${id}/relocate/`, data),

  // Housing Clearances (Housing Status Pipeline)
  getClearances: (params) => api.get('/estate/housing/clearances/', { params }),
  createClearance: (data) => api.post('/estate/housing/clearances/', data),
  patchClearance: (id, data) => api.patch(`/estate/housing/clearances/${id}/`, data),
  deleteClearance: (id) => api.delete(`/estate/housing/clearances/${id}/`),
  deleteClearanceHistory: (data) => api.post('/estate/housing/clearances/delete-history/', data),
  getClearanceTrash: () => api.get('/estate/housing/clearances/trash/'),
  restoreClearanceTrash: (data) => api.post('/estate/housing/clearances/trash/restore/', data),
  purgeClearanceTrash: (data) => api.post('/estate/housing/clearances/trash/purge/', data),
  getClearanceAlertsStatus: () => api.get('/estate/housing/clearances/toggle-alerts/'),
  toggleClearanceAlerts: (data) => api.post('/estate/housing/clearances/toggle-alerts/', data),
}

export default estateApi
