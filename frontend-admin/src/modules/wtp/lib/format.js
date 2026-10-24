export const fmt = (v, n = 1) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '–' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: n });

export const today = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};

export function downloadCsv(filename, rows, maybeRows) {
  let allRows = rows;
  if (Array.isArray(maybeRows)) {
    allRows = [rows, ...maybeRows];
  }
  if (!allRows || !allRows.length) return;

  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvContent = allRows
    .map((r) => (Array.isArray(r) ? r.map(q).join(',') : q(r)))
    .join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { downloadPdf } from '../../../utils/exportPdf';

