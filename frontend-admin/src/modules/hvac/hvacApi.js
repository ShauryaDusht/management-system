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

  importData: async (file, preview = false) => {
    const formData = new FormData();
    formData.append('file', file);
    if (preview) {
      formData.append('preview', 'true');
    }
    const res = await api.post('/hvac/import-csv/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  importCsv: async (file, preview = false) => {
    return HvacApi.importData(file, preview);
  },

  undoImport: async (batchId = null) => {
    const res = await api.post('/hvac/import-undo/', batchId ? { batch_id: batchId } : {});
    return res.data;
  },

  getImportHistory: async () => {
    const res = await api.get('/hvac/import-history/');
    return res.data;
  },

  downloadTemplate: async (format = 'xlsx') => {
    const res = await api.get('/hvac/import-template/', {
      params: { format },
      responseType: 'blob',
    });
    const isXlsx = format === 'xlsx';
    const mimeType = isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv;charset=utf-8;';
    const filename = isXlsx
      ? 'hvac_plant_telemetry_template.xlsx'
      : 'hvac_plant_log_template.csv';

    const blob = new Blob([res.data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
