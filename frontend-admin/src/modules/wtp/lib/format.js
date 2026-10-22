export const fmt = (v, n = 1) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '–' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: n });

export const today = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};

export function downloadCsv(filename, rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export { downloadPdf } from '../../../utils/exportPdf';

