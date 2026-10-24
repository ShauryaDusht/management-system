import { useMemo, useState, useEffect } from 'react';
import { STATIONS, getMergedFields } from '../config';
import { api } from '../api';
import { daily, dRows, rlab, latest, meterFields } from '../lib/calc';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import BarChart from './BarChart.jsx';
import { Kpi } from './Controls.jsx';
import ExportDropdown from '../../../components/ui/ExportDropdown';

const METER_COLORS = [
  '#1a3c34', // IITGN Forest Green
  '#c2622a', // Terracotta
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#e11d48', // Rose
  '#059669', // Emerald
];

function EditReadingModal({ row, stationMeters, user, onClose, onSaved }) {
  const allFields = useMemo(() => getMergedFields(stationMeters), [stationMeters]);
  const [station, setStation] = useState('wtp');
  const [vals, setVals] = useState({});
  const [by, setBy] = useState(user?.name || user?.username || row.by || 'Shift Engineer');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const stationFields = useMemo(() => allFields.filter((f) => f.st === station), [allFields, station]);

  useEffect(() => {
    const initial = {};
    for (const f of allFields.filter((f) => f.st === station)) {
      if (row[f.k] != null) initial[f.k] = row[f.k];
    }
    setVals(initial);
  }, [station, row, allFields]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const values = {};
      for (const f of stationFields) {
        const v = parseFloat(vals[f.k]);
        if (!Number.isNaN(v)) values[f.k] = v;
      }
      if (!Object.keys(values).length) {
        setBusy(false);
        return setMsg({ err: 'Please enter at least one reading value.' });
      }

      await api.saveReading({
        date: row.date,
        shift: Number(row.shift) || 1,
        station,
        values,
        by: by || 'Shift Engineer',
      });

      setMsg({ ok: 'Readings updated successfully!' });
      setTimeout(async () => {
        await onSaved();
      }, 600);
    } catch (err) {
      setMsg({ err: `Failed to save: ${err.message}` });
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--card)',
          color: 'var(--ink)',
          borderRadius: '12px',
          border: '1px solid var(--line)',
          maxWidth: '650px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--field)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✏️</span> Edit Shift Reading
            </h3>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '12px' }}>
              <span style={{ fontWeight: 600, color: 'var(--water)' }}>Date: {row.date}</span>
              <span style={{ color: 'var(--muted)' }}>•</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Shift {row.shift || '1'}</span>
              <span style={{ color: 'var(--muted)' }}>•</span>
              <span style={{ color: 'var(--muted)' }}>Originally By: {row.by || '–'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {msg?.ok && <div className="msg ok" style={{ margin: 0 }}>{msg.ok}</div>}
            {msg?.err && <div className="msg err" style={{ margin: 0 }}>{msg.err}</div>}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 200px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Station</span>
                <select value={station} onChange={(e) => setStation(e.target.value)}>
                  {STATIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ flex: '1 1 200px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Edited / Verified By</span>
                <input
                  type="text"
                  value={by}
                  onChange={(e) => setBy(e.target.value)}
                  placeholder="Your Name / Designation"
                  required
                />
              </label>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                {STATIONS.find((s) => s.id === station)?.name} Meter Readings
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {stationFields.map((f) => (
                  <div
                    key={f.k}
                    style={{
                      background: 'var(--field)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  >
                    <label style={{ margin: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {f.label} {f.unit ? `(${f.unit})` : ''}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={vals[f.k] ?? ''}
                        onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}
                        placeholder={row[f.k] != null ? String(row[f.k]) : 'Enter reading'}
                        style={{ padding: '6px 8px', width: '100%' }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--field)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: 'var(--water)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {busy ? 'Saving Changes…' : '💾 Save Corrections'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MeterReport({ rows, stationMeters = [], user, onReload, onNavigateToEdit }) {
  const [editingRow, setEditingRow] = useState(null);
  const [st, setSt] = useState('all');
  const [view, setView] = useState('shift');
  const [ash, setAsh] = useState('all');
  const [sel, setSel] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fields = meterFields(st, stationMeters);
  const cums = fields.filter((f) => f.cum);
  const isAllMeters = sel === 'all';
  const selF = cums.find((f) => f.k === sel) || cums[0] || { k: 'c', label: 'Treated Water', cu: 'CUM' };
  const d = useMemo(() => daily(rows), [rows]);

  const isPeriodView = view === '7days' || view === '15days' || view === '30days';

  const dateMatch = (rDate) => {
    if (fromDate && toDate) return rDate >= fromDate && rDate <= toDate;
    if (fromDate && !toDate) return rDate >= fromDate;
    if (!fromDate && toDate) return rDate <= toDate;
    return true;
  };

  const dt = useMemo(() => {
    const base = dRows(d, view, ash);
    if (!fromDate && !toDate) return base;
    if (fromDate && toDate) {
      return base.filter((r) => r.date >= fromDate && r.date <= toDate);
    }
    if (fromDate && !toDate) {
      if (isPeriodView) {
        const days = base.filter((r) => r.date <= fromDate);
        const count = view === '7days' ? 7 : view === '15days' ? 15 : 30;
        return days.slice(-count);
      }
      return base.filter((r) => r.date >= fromDate);
    }
    return base.filter((r) => r.date <= toDate);
  }, [d, view, ash, fromDate, toDate, isPeriodView]);

  const shown = useMemo(() => {
    if (isPeriodView) {
      const dates = new Set(dt.map((r) => r.date));
      return rows.filter((r) => dates.has(r.date) && (ash === 'all' || String(r.shift) === ash));
    }
    return rows.filter((r) => dateMatch(r.date) && (ash === 'all' || String(r.shift) === ash));
  }, [rows, dt, isPeriodView, ash, fromDate, toDate]);

  if (!rows.length) return <p className="card empty">No readings yet. Operators can add them from the Enter readings tab.</p>;

  const lv = (k) => latest(shown.length ? shown : rows, k)?.[k];
  const treated = [...(dt.length ? dt : d)].reverse().find((r) => r.c != null)?.c;

  const meterMultiSeries = isAllMeters
    ? cums.map((f, i) => ({
        key: f.k,
        label: f.label,
        color: METER_COLORS[i % METER_COLORS.length],
      }))
    : null;

  const chart = useMemo(() => {
    const validRows = dt.slice(-30);
    if (isAllMeters) {
      return validRows.map((r) => {
        const point = {
          label: view === 'shift' && r.shift ? `${r.date.slice(5)} S${r.shift}` : r.date.slice(5),
          title: rlab(r, view),
          value: 0,
        };
        let sum = 0;
        for (const f of cums) {
          const val = r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0;
          point[f.k] = val;
          sum += val;
        }
        point.value = sum;
        return point;
      });
    }

    return validRows
      .filter((r) => r[selF.k] != null && r[selF.k] >= 0)
      .map((r) => ({
        label: view === 'shift' && r.shift ? `${r.date.slice(5)} S${r.shift}` : r.date.slice(5),
        value: r[selF.k],
        title: `${rlab(r, view)}: ${fmt(r[selF.k], 2)} ${selF.cu}`,
      }));
  }, [dt, isAllMeters, cums, selF, view]);

  const dateLabel = useMemo(() => {
    if (fromDate && toDate) return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
    if (fromDate) return fromDate;
    if (toDate) return `Upto ${toDate}`;
    return '';
  }, [fromDate, toDate]);

  const viewLabel =
    view === '7days' ? (dateLabel ? `7 days ending ${dateLabel}` : 'Last 7 days') :
    view === '15days' ? (dateLabel ? `15 days ending ${dateLabel}` : 'Last 15 days') :
    view === '30days' ? (dateLabel ? `30 days ending ${dateLabel}` : 'Last 30 days') :
    view === 'day' ? (dateLabel ? `Date: ${dateLabel}` : 'total per day') :
    (dateLabel ? `Shifts on ${dateLabel}` : 'difference between consecutive shift readings');

  const exportCsv = () => downloadCsv(
    dateLabel ? `meter-readings-${dateLabel.replace(/[\s\:]+/g, '_')}.csv` : 'meter-readings.csv',
    [['date', 'shift', 'by', ...fields.map((f) => f.label)], ...shown.map((r) => [r.date, r.shift, r.by, ...fields.map((f) => r[f.k])])]
  );

  const exportPdf = () => downloadPdf(
    dateLabel ? `meter-readings-${dateLabel.replace(/[\s\:]+/g, '_')}.pdf` : 'meter-readings.pdf',
    [['date', 'shift', 'by', ...fields.map((f) => f.label)], ...shown.map((r) => [r.date, r.shift, r.by, ...fields.map((f) => r[f.k])])],
    `WTP/STP Station Meter Readings ${dateLabel ? `(${dateLabel})` : ''}`
  );

  return (
    <>
      <div className="kpis">
        <Kpi label={dateLabel ? 'Selected period' : 'Latest reading'} value={dateLabel || (rows[rows.length - 1]?.date ?? '–')} />
        <Kpi label="Incoming (MLD)" value={fmt(lv('b'))} />
        <Kpi label="Treated last shift (CUM)" value={fmt(treated, 0)} />
        <Kpi label="pH" value={fmt(lv('d'), 2)} />
        <Kpi label="Turbidity (NTU)" value={fmt(lv('e'), 3)} />
        <Kpi label={isPeriodView ? `Entries (${viewLabel})` : dateLabel ? `Entries (${dateLabel})` : 'Entries'} value={shown.length} />
      </div>
      <div className="card">
        <div className="row">
          <label style={{ flex: '1 1 0', minWidth: 0 }}>Station
            <select value={st} onChange={(e) => setSt(e.target.value)}>
              <option value="all">All stations</option>
              {STATIONS.filter((s) => s.id !== 'jm').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 0', minWidth: 0 }}>View
            <select
              value={view === 'shift' ? (ash === 'all' ? 'shift:all' : `shift:${ash}`) : view}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('shift:')) {
                  setView('shift');
                  setAsh(v.replace('shift:', ''));
                } else {
                  setView(v);
                  setAsh('all');
                }
              }}
            >
              <option value="shift:all">Per shift (All shifts)</option>
              <option value="shift:1">Shift 1 only (Morning)</option>
              <option value="shift:2">Shift 2 only (Evening)</option>
              <option value="shift:3">Shift 3 only (Night)</option>
              <option value="day">Daily total (Per day)</option>
              <option value="7days">Last 7 days</option>
              <option value="15days">Last 15 days</option>
              <option value="30days">Last 30 days</option>
            </select>
          </label>
          <label style={{ flex: '1.35 1 0', minWidth: 0 }}>Consumption trend (last 30 readings)
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="all">⚡ All Station Meters Comparison</option>
              {cums.map((f) => <option key={f.k} value={f.k}>{f.label} ({f.cu})</option>)}
            </select>
          </label>
          <ExportDropdown
            label="Export File"
            style={{ flexShrink: 0 }}
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
          unit={isAllMeters ? 'CUM' : selF.cu}
          title={
            isAllMeters
              ? `All ${st === 'all' ? 'Stations' : (STATIONS.find((s) => s.id === st)?.name || '')} Meters Consumption (${viewLabel})`
              : `${selF.label} Consumption (${viewLabel})`
          }
          metricName={isAllMeters ? 'Consumption' : selF.label}
          color="water"
          multiSeries={meterMultiSeries}
          height={290}
          defaultChartType="bar"
        />
      </div>
      <div className="card">
        <h2>Consumption ({viewLabel})</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Date</th>{cums.map((f) => <th key={f.k}>{f.label}<br />{f.cu}</th>)}</tr></thead>
            <tbody>
              {dt.length === 0 && (
                <tr>
                  <td colSpan={cums.length + 1} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    {dateLabel ? `No readings found for ${dateLabel}. Select another date range or click "All".` : 'No readings found.'}
                  </td>
                </tr>
              )}
              {[...dt].reverse().map((r) => (
                <tr key={rlab(r, view)}>
                  <td className="l">{rlab(r, view)}</td>
                  {cums.map((f) => <td key={f.k} className={r[f.k] < 0 ? 'warn' : ''} title={r[f.k] < 0 ? 'Meter reset or entry error' : ''}>{fmt(r[f.k], 2)}</td>)}
                </tr>
              ))}
            </tbody>
            {dt.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--field)', zIndex: 1, borderTop: '2px solid var(--water)' }}>
                <tr>
                  <td className="l" style={{ fontWeight: 700, color: 'var(--water)' }}>
                    TOTAL ({view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Shifts (${dateLabel})` : 'Selected')})
                  </td>
                  {cums.map((f) => {
                    const totalVal = dt.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
                    return (
                      <td key={f.k} style={{ fontWeight: 700, color: 'var(--water)' }}>
                        {fmt(totalVal, 2)}
                      </td>
                    );
                  })}
                </tr>
                {dt.length > 1 && (
                  <tr>
                    <td className="l" style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '12px' }}>
                      AVG / DAY
                    </td>
                    {cums.map((f) => {
                      const totalVal = dt.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
                      const avg = totalVal / dt.length;
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
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <h2 style={{ margin: 0 }}>Raw readings</h2>
          {user?.role === 'supervisor' && onNavigateToEdit && (
            <button
              type="button"
              onClick={onNavigateToEdit}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                background: 'var(--water)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span>✏️</span> Edit Readings
            </button>
          )}
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Shift</th>
                <th>By</th>
                {fields.map((f) => <th key={f.k}>{f.label}</th>)}
                {user?.role === 'supervisor' && <th style={{ textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={fields.length + (user?.role === 'supervisor' ? 4 : 3)} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    {dateLabel ? `No raw readings found for ${dateLabel}.` : 'No raw readings found.'}
                  </td>
                </tr>
              )}
              {[...shown].reverse().map((r) => (
                <tr key={r.date + r.shift}>
                  <td className="l">{r.date}</td>
                  <td>{r.shift ? 'S' + r.shift : '–'}</td>
                  <td className="l">{r.by || '–'}</td>
                  {fields.map((f) => <td key={f.k}>{fmt(r[f.k], 4)}</td>)}
                  {user?.role === 'supervisor' && (
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setEditingRow(r)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '5px',
                          border: '1px solid var(--water)',
                          background: 'color-mix(in srgb, var(--water) 10%, transparent)',
                          color: 'var(--water)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                        title="Edit this shift reading"
                      >
                        ✏️ Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingRow && user?.role === 'supervisor' && (
        <EditReadingModal
          row={editingRow}
          stationMeters={stationMeters}
          user={user}
          onClose={() => setEditingRow(null)}
          onSaved={async () => {
            if (onReload) await onReload();
            setEditingRow(null);
          }}
        />
      )}
    </>
  );
}
