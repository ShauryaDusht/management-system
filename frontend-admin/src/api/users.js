import api from './client'

export const usersAPI = {
  getAll: () => api.get('/auth/users/'),
  create: (data) => api.post('/auth/users/', data),
  update: (id, data) => api.patch(`/auth/users/${id}/`, data),
  delete: (id) => api.delete(`/auth/users/${id}/`),
  changePassword: (id, password) => api.patch(`/auth/users/${id}/`, { password }),
}
