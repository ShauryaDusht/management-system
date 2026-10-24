import api from '../../api/client'

export const WtpApi = {
  me: async () => {
    try {
      const res = await api.get('/auth/me/')
      return res.data
    } catch {
      return null
    }
  },

  readings: async (params = {}) => {
    const res = await api.get('/wtp/readings', { params })
    return res.data
  },

  saveReading: async (body) => {
    const res = await api.put('/wtp/readings', body)
    return res.data
  },

  deleteReading: async (id) => {
    const res = await api.delete(`/wtp/readings/${id}`)
    return res.data
  },

  blockMeters: async () => {
    const res = await api.get('/wtp/blocks/meters')
    return res.data
  },

  addBlockMeter: async (body) => {
    const res = await api.post('/wtp/blocks/meters', body)
    return res.data
  },

  deleteBlockMeter: async (sr) => {
    const res = await api.delete(`/wtp/blocks/meters/${sr}`)
    return res.data
  },

  blockReadings: async () => {
    const res = await api.get('/wtp/blocks')
    return res.data
  },

  saveBlock: async (month, body) => {
    const res = await api.put(`/wtp/blocks/${encodeURIComponent(month)}`, body)
    return res.data
  },

  deleteBlock: async (month) => {
    const res = await api.delete(`/wtp/blocks/${encodeURIComponent(month)}`)
    return res.data
  },

  supervisorLogs: async (date = null) => {
    const res = await api.get('/wtp/supervisor/logs', { params: date ? { date } : {} })
    return res.data
  },

  saveSupervisorLog: async (body) => {
    const res = await api.put('/wtp/supervisor/logs', body)
    return res.data
  },

  verifyShift: async (body) => {
    const res = await api.put('/wtp/supervisor/verify', body)
    return res.data
  },

  supervisorOverview: async (date = null) => {
    const res = await api.get('/wtp/supervisor/overview', { params: date ? { date } : {} })
    return res.data
  },

  stationMeters: async () => {
    const res = await api.get('/wtp/station-meters')
    return res.data
  },

  addStationMeter: async (body) => {
    const res = await api.post('/wtp/station-meters', body)
    return res.data
  },

  deleteStationMeter: async (id) => {
    const res = await api.delete(`/wtp/station-meters/${encodeURIComponent(id)}`)
    return res.data
  },

  getSummary: async () => {
    const res = await api.get('/wtp/summary')
    return res.data
  },

  gwssbBills: async () => {
    const res = await api.get('/wtp/gwssb')
    return res.data
  },

  gwssbBill: async (month) => {
    const res = await api.get(`/wtp/gwssb/${encodeURIComponent(month)}`)
    return res.data
  },

  saveGwssbBill: async (body) => {
    const res = await api.put('/wtp/gwssb', body)
    return res.data
  },

  deleteGwssbBill: async (month) => {
    const res = await api.delete(`/wtp/gwssb/${encodeURIComponent(month)}`)
    return res.data
  },
}

export const WtpApiService = WtpApi
export default WtpApi
