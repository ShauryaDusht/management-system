import api from './client'

export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login/', { username, password }),

  logout: (refresh_token) =>
    api.post('/auth/logout/', { refresh: refresh_token }),

  me: () => api.get('/auth/me/'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  getUsers: () => api.get('/auth/users/'),
  createUser: (data) => api.post('/auth/users/', data),
  updateUser: (id, data) => api.patch(`/auth/users/${id}/`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}/`),
}
