import api from './client'

export const usersAPI = {
  getAll: (params = {}) => api.get('/auth/users/', { params }),
  create: (data) => api.post('/auth/users/', data),
  update: (id, data) => api.patch(`/auth/users/${id}/`, data),
  delete: (id) => api.delete(`/auth/users/${id}/`),
  getByRole: (role) => api.get('/auth/users/', { params: { role } }),
}
