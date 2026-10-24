import api from '../../api/client';
import { downloadPdf } from '../../utils/exportPdf';

export const HvacApi = {
  getLogs: async (params = {}) => {
    const res = await api.get('/hvac/logs/', { params });
    return res.data;
  },

  getLog: async (id) => {
    const res = await api.get(`/hvac/logs/${id}/`);
    return res.data;
  },

  saveLog: async (body) => {
    const res = await api.post('/hvac/logs/', body);
    return res.data;
  },

  deleteLog: async (id) => {
    const res = await api.delete(`/hvac/logs/${id}/`);
    return res.data;
  },

  getOverview: async (date) => {
    const res = await api.get('/hvac/overview/', { params: date ? { date } : {} });
    return res.data;
  },

  getSupervisorLogs: async (date) => {
    const res = await api.get('/hvac/supervisor/', { params: date ? { date } : {} });
    return res.data;
  },

  saveSupervisorLog: async (body) => {
    const res = await api.post('/hvac/supervisor/', body);
    return res.data;
  },

  getPumpRatings: async () => {
    const res = await api.get('/hvac/pump-ratings/');
    return res.data;
  },

  savePumpRatings: async (body) => {
    const res = await api.post('/hvac/pump-ratings/', body);
    return res.data;
  },

  resetPumpRatings: async (pumpKey = null) => {
    const res = await api.post('/hvac/pump-ratings/', { action: 'reset', pump_key: pumpKey });
    return res.data;
  },

  exportCsv: (filename, rows) => {
    if (!rows || !rows.length) return;
    const csvContent = rows
      .map((r) =>
        r
          .map((v) => {
            const str = v === null || v === undefined ? '' : String(v);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  exportPdf: (filename, rows, title = '') => {
    return downloadPdf(filename, rows, title);
  },
};

export default HvacApi;
