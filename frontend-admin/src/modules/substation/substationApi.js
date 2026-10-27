import api from '../../api/client'
import { downloadPdf } from '../../utils/exportPdf'

export class SubstationApi {
  static async checkHealth() {
    const res = await api.get('/substation/health')
    return res.data
  }

  static async getSheets() {
    const res = await api.get('/substation/sheets/')
    return res.data
  }

  static async query(collection, where = [], orderBy = null, limit = 1000, sig = null) {
    const res = await api.post('/substation/query', {
      collection,
      where,
      orderBy,
      limit,
      sig,
    })
    return res.data
  }

  static async getDoc(coll, id) {
    const res = await api.get(`/substation/doc/${encodeURIComponent(coll)}/${encodeURIComponent(id)}`)
    return res.data
  }

  static async saveDoc(coll, id, data) {
    const res = await api.put(`/substation/doc/${encodeURIComponent(coll)}/${encodeURIComponent(id)}`, data)
    return res.data
  }

  static async getSummary() {
    const res = await api.get('/substation/summary/')
    return res.data
  }

  // Torrent Power Electricity Bills API
  static async getTorrentBills() {
    const res = await api.get('/substation/torrent/')
    return res.data
  }

  static async getTorrentBill(month) {
    const res = await api.get(`/substation/torrent/${encodeURIComponent(month)}/`)
    return res.data
  }

  static async saveTorrentBill(data) {
    const res = await api.put('/substation/torrent/', data)
    return res.data
  }

  static async deleteTorrentBill(month) {
    const res = await api.delete(`/substation/torrent/${encodeURIComponent(month)}/`)
    return res.data
  }

  static exportCsv(filename, rows) {
    const csvContent = rows
      .map((row) =>
        row
          .map((item) => {
            const str = String(item ?? '')
            return `"${str.replace(/"/g, '""')}"`
          })
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  static exportPdf(filename, rows, title = '') {
    downloadPdf(filename, rows, title)
  }
}

export default SubstationApi
