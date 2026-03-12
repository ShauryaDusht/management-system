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
}
