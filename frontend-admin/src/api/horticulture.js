import api from './client'

export const horticultureAPI = {
  getSummary: () => api.get('/horticulture/summary/'),
}
