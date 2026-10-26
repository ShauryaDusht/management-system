import { useState, useMemo } from 'react';
import { FIELDS, isChem } from '../config';
import { rlab, latest } from '../lib/calc';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import BarChart from './BarChart.jsx';
import { ViewControls, Kpi } from './Controls.jsx';
import ExportDropdown from '../../../components/ui/ExportDropdown';

const C = FIELDS.filter(isChem);

export default function ChemReport({ rows }) {
  const [view, setView] = useState('shift');
  const [ash, setAsh] = useState('all');
  const [sel, setSel] = useState('cl_wtp');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const isPeriodView = view === '7days' || view === '15days' || view === '30days';
  const base = rows.filter((r) => C.some((f) => r[f.k] != null));

  const dateMatch = (rDate) => {
    if (fromDate && toDate) return rDate >= fromDate && rDate <= toDate;
    if (fromDate && !toDate) return rDate >= fromDate;
    if (!fromDate && toDate) return rDate <= toDate;
    return true;
  };

  const dateLabel = useMemo(() => {
    if (fromDate && toDate) return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
    if (fromDate) return `From ${fromDate}`;
    if (toDate) return `Upto ${toDate}`;
    return '';
  }, [fromDate, toDate]);

  const cr = useMemo(() => {
    if (view === 'day' || isPeriodView) {
      const m = new Map();
      for (const r of base) {
        let o = m.get(r.date);
        if (!o) { o = { date: r.date }; m.set(r.date, o); }
        for (const f of C) if (r[f.k] != null) o[f.k] = (o[f.k] || 0) + r[f.k];
      }
      const days = [...m.values()];
      if (fromDate && toDate) {
        return days.filter((r) => r.date >= fromDate && r.date <= toDate);
      }
      if (fromDate && !toDate) {
        return days.filter((r) => r.date >= fromDate);
      }
      if (!fromDate && toDate) {
        if (isPeriodView) {
          const count = view === '7days' ? 7 : view === '15days' ? 15 : 30;
          return days.filter((r) => r.date <= toDate).slice(-count);
        }
        return days.filter((r) => r.date <= toDate);
      }
      if (isPeriodView) {
        const count = view === '7days' ? 7 : view === '15days' ? 15 : 30;
        return days.slice(-count);
      }
      return days;
    }

    const filteredBase = ash === 'all' ? base : base.filter((r) => String(r.shift) === ash);
    return filteredBase.filter((r) => dateMatch(r.date));
  }, [base, view, isPeriodView, ash, fromDate, toDate]);

  if (!base.length) return <p className="card empty">No chlorination entries yet. Operators enter them in each station form under "Chlorine used this shift".</p>;

  const isAllChem = sel === 'all';
  const f0 = C.find((f) => f.k === sel) || C[0];

  const allChartData = isAllChem
    ? cr.map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        title: rlab(r, view),
        cl_wtp: Number(r.cl_wtp) || 0,
        cl_stp: Number(r.cl_stp) || 0,
        alum: Number(r.alum) || 0,
        value: (Number(r.cl_wtp) || 0) + (Number(r.cl_stp) || 0) + (Number(r.alum) || 0),
      }))
    : cr.filter((r) => r[f0.k] != null).map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        value: r[f0.k],
        title: `${rlab(r, view)}: ${fmt(r[f0.k], 2)} ${f0.unit}`,
      }));

  const chart = isAllChem
    ? cr.slice(-30).map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        title: rlab(r, view),
        cl_wtp: Number(r.cl_wtp) || 0,
        cl_stp: Number(r.cl_stp) || 0,
        alum: Number(r.alum) || 0,
        value: (Number(r.cl_wtp) || 0) + (Number(r.cl_stp) || 0) + (Number(r.alum) || 0),
      }))
    : cr.filter((r) => r[f0.k] != null).slice(-30).map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        value: r[f0.k],
        title: `${rlab(r, view)}: ${fmt(r[f0.k], 2)} ${f0.unit}`,
      }));

  const chemMultiSeries = isAllChem
    ? [
        { key: 'cl_wtp', label: 'WTP Chlorine (kg)', color: '#c2622a' },
        { key: 'cl_stp', label: 'STP Chlorine (kg)', color: '#2d4a3e' },
        { key: 'alum', label: 'Alum (kg)', color: '#d97706' },
      ]
    : null;

  const exportCsv = () => {
    const filename = dateLabel
      ? `chlorination-${dateLabel.replace(/[\s\:]+/g, '_')}-${view}.csv`
      : `chlorination-${view}.csv`;
    const headers = ['Date / Shift', ...C.map((f) => `${f.label} (${f.unit})`)];
    const dataRows = cr.map((r) => [
      rlab(r, view),
      ...C.map((f) => (r[f.k] != null ? r[f.k] : ''))
    ]);
    const totalRow = [
      `TOTAL (${view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Shifts (${dateLabel})` : 'Selected')})`,
      ...C.map((f) => {
        const totalVal = cr.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
        return fmt(totalVal, 2);
      })
    ];
    downloadCsv(filename, [headers, ...dataRows, totalRow]);
  };

  const exportPdf = () => {
    const filename = dateLabel
      ? `chlorination-${dateLabel.replace(/[\s\:]+/g, '_')}-${view}.pdf`
      : `chlorination-${view}.pdf`;
    const headers = ['Date / Shift', ...C.map((f) => `${f.label} (${f.unit})`)];
    const dataRows = cr.map((r) => [
      rlab(r, view),
      ...C.map((f) => (r[f.k] != null ? r[f.k] : ''))
    ]);
    const totalRow = [
      `TOTAL (${view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Shifts (${dateLabel})` : 'Selected')})`,
      ...C.map((f) => {
        const totalVal = cr.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
        return fmt(totalVal, 2);
      })
    ];
    downloadPdf(filename, [headers, ...dataRows, totalRow], `Chlorine & Alum Dosing Report (${view})${dateLabel ? ` (${dateLabel})` : ''}`);
  };

  return (
    <>
      <div className="kpis">
        {C.map((f) => {
          const r = latest(cr.length ? cr : base, f.k);
          return <Kpi key={f.k} label={f.label} value={r ? `${fmt(r[f.k], 2)} ${f.unit}` : '–'} sub={r ? rlab(r, view) : ''} />;
        })}
      </div>
      <div className="card">
        <div className="row">
          <ViewControls view={view} setView={setView} ash={ash} setAsh={setAsh} />
          <label>Chemical
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="all">⚡ All Chemicals Combined</option>
              {C.map((f) => <option key={f.k} value={f.k}>{f.label} ({f.unit})</option>)}
            </select>
          </label>
          <ExportDropdown
            label="Export File"
            hasDateFilter={true}
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClearDates={() => { setFromDate(''); setToDate(''); }}
            dateLabel={dateLabel}
            onExportCsv={exportCsv}
            onExportPdf={exportPdf}
          />
        </div>
        <BarChart
          data={chart}
          allData={allChartData}
          unit={isAllChem ? 'kg' : f0.unit}
          title={isAllChem ? 'Combined Chemical Dosing Trend (WTP Cl₂, STP Cl₂, Alum)' : `${f0.label} Consumption Trend`}
          metricName={isAllChem ? 'Total Dosed' : f0.label}
          color="chemical"
          multiSeries={chemMultiSeries}
          height={300}
        />
      </div>
      <div className="card">
        <h2>
          Chlorine & alum usage ({
            view === '7days' ? (dateLabel ? `7 days ending ${dateLabel}` : 'Last 7 days') :
            view === '15days' ? (dateLabel ? `15 days ending ${dateLabel}` : 'Last 15 days') :
            view === '30days' ? (dateLabel ? `30 days ending ${dateLabel}` : 'Last 30 days') :
            view === 'day' ? (dateLabel ? `Date: ${dateLabel}` : 'total per day') :
            (dateLabel ? `Shifts on ${dateLabel}` : 'per shift')
          })
        </h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Date</th>{C.map((f) => <th key={f.k}>{f.label}<br />{f.unit}</th>)}</tr></thead>
            <tbody>
              {cr.length === 0 && (
                <tr>
                  <td colSpan={C.length + 1} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    {dateLabel ? `No chemical usage found for ${dateLabel}. Select another date range or click "All".` : 'No chemical entries found.'}
                  </td>
                </tr>
              )}
              {[...cr].reverse().map((r) => (
                <tr key={rlab(r, view)}><td className="l">{rlab(r, view)}</td>{C.map((f) => <td key={f.k}>{fmt(r[f.k], 2)}</td>)}</tr>
              ))}
            </tbody>
            {cr.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--field)', zIndex: 1, borderTop: '2px solid var(--water)' }}>
                <tr>
                  <td className="l" style={{ fontWeight: 700, color: 'var(--water)' }}>
                    TOTAL ({view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Shifts (${dateLabel})` : 'Selected')})
                  </td>
                  {C.map((f) => {
                    const totalVal = cr.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
                    return (
                      <td key={f.k} style={{ fontWeight: 700, color: 'var(--water)' }}>
                        {fmt(totalVal, 2)}
                      </td>
                    );
                  })}
                </tr>
                {cr.length > 1 && (
                  <tr>
                    <td className="l" style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '12px' }}>
                      AVG / DAY
                    </td>
                    {C.map((f) => {
                      const totalVal = cr.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
                      const avg = totalVal / cr.length;
                      return (
                        <td key={f.k} style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '12px' }}>
                          {fmt(avg, 2)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}
