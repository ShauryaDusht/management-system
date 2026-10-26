import React, { useState, useEffect, useMemo } from 'react';
import { CHILLERS, runningChillers, deriveLogValues } from '../config';
import HvacApi from '../hvacApi';
import ExportDropdown from '../../../components/ui/ExportDropdown';

export default function MonthlyReport({ defaultMonth }) {
  const [month, setMonth] = useState(defaultMonth || new Date().toISOString().slice(0, 7));
  const [monthLogs, setMonthLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Reset custom date filter when switching month
  useEffect(() => {
    setFromDate('');
    setToDate('');
  }, [month]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await HvacApi.getLogs({ month });
        if (active) {
          setMonthLogs((data || []).map((l) => ({ ...l, v: deriveLogValues(l.v || {}) })));
        }
      } catch (err) {
        console.error('Failed to load monthly logs:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [month]);

  // Month date bounds and recorded range
  const { minMonthDate, maxMonthDate, daysInMonth } = useMemo(() => {
    if (!month || !month.includes('-')) {
      return { minMonthDate: '', maxMonthDate: '', daysInMonth: 31 };
    }
    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const days = new Date(y, m, 0).getDate();
    return {
      minMonthDate: `${month}-01`,
      maxMonthDate: `${month}-${String(days).padStart(2, '0')}`,
      daysInMonth: days,
    };
  }, [month]);

  const isDateFiltered = Boolean(fromDate || toDate);

  const dateFilterLabel = useMemo(() => {
    if (fromDate && toDate) {
      return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
    }
    if (toDate) {
      return `Upto ${toDate}`;
    }
    if (fromDate) {
      return `From ${fromDate}`;
    }
    return '';
  }, [fromDate, toDate]);

  // Filter logs based on date selection
  const filteredLogs = useMemo(() => {
    if (!isDateFiltered) return monthLogs;
    return monthLogs.filter((l) => {
      if (!l.date) return false;
      if (fromDate && l.date < fromDate) return false;
      if (toDate && l.date > toDate) return false;
      return true;
    });
  }, [monthLogs, fromDate, toDate, isDateFiltered]);

  // Calculations
  const report = useMemo(() => {
    const days = {};
    filteredLogs.forEach((r) => {
      if (!days[r.date]) days[r.date] = [];
      days[r.date].push(r);
    });

    const rd = (arr, key) => {
      const b = arr.filter((x) => x.v[key] !== undefined && x.v[key] !== null);
      if (b.length < 2) return null;
      const diff = b[b.length - 1].v[key] - b[0].v[key];
      return diff >= 0 ? Number(diff.toFixed(2)) : null;
    };

    const sm = (x, y) => {
      if (x === null && y === null) return null;
      return Number(((x || 0) + (y || 0)).toFixed(2));
    };

    const rows = Object.keys(days).sort().map((d) => {
      const arr = days[d].sort((a, b) => a.slot - b.slot);
      const e1 = rd(arr, 'pn1_mwh');
      const e2 = rd(arr, 'pn2_mwh');
      const w1 = rd(arr, 'wm1_kl');
      const w2 = rd(arr, 'wm2_kl');
      const w3 = rd(arr, 'wm3_kl') ?? rd(arr, 'wm_chilled_kl');
      return {
        date: d,
        count: arr.length,
        p1: e1,
        p2: e2,
        totalEnergy: sm(e1, e2),
        w1,
        w2,
        w3,
        totalWater: sm(sm(w1, w2), w3),
      };
    });

    // Totals
    const totCount = rows.reduce((acc, r) => acc + r.count, 0);
    const totP1 = rows.reduce((acc, r) => acc + (r.p1 || 0), 0);
    const totP2 = rows.reduce((acc, r) => acc + (r.p2 || 0), 0);
    const totEnergy = rows.reduce((acc, r) => acc + (r.totalEnergy || 0), 0);
    const totW1 = rows.reduce((acc, r) => acc + (r.w1 || 0), 0);
    const totW2 = rows.reduce((acc, r) => acc + (r.w2 || 0), 0);
    const totW3 = rows.reduce((acc, r) => acc + (r.w3 || 0), 0);
    const totWater = rows.reduce((acc, r) => acc + (r.totalWater || 0), 0);

    // Chiller running hours (each slot logged with chiller on = 1 operating hour)
    const chillerHours = CHILLERS.map(([n, nm, tr]) => {
      const hrs = filteredLogs.filter((l) => runningChillers(l.v).some((c) => c[0] === n)).length;
      return { num: n, name: nm, tr, hours: hrs };
    });

    return {
      rows,
      totals: {
        count: totCount,
        p1: Number(totP1.toFixed(2)),
        p2: Number(totP2.toFixed(2)),
        totalEnergy: Number(totEnergy.toFixed(2)),
        w1: Number(totW1.toFixed(2)),
        w2: Number(totW2.toFixed(2)),
        w3: Number(totW3.toFixed(2)),
        totalWater: Number(totWater.toFixed(2)),
      },
      chillerHours,
    };
  }, [filteredLogs]);

  // Export handlers
  const handleExportCsv = () => {
    const titleSuffix = dateFilterLabel ? ` (${dateFilterLabel})` : '';
    const fileSuffix = dateFilterLabel
      ? `_${dateFilterLabel.toLowerCase().replace(/[\s\:]+/g, '_')}`
      : '';
    const csvRows = [
      ['HVAC Monthly Consumption Report', `${month}${titleSuffix}`],
      [],
      ['Date', 'Readings Logged', 'Panel 1 MWh', 'Panel 2 MWh', 'Total Energy MWh', 'Old Water kL', 'New Water kL', 'Chilled Water kL', 'Total Water kL'],
      ...report.rows.map((r) => [
        r.date,
        r.count,
        r.p1 ?? '',
        r.p2 ?? '',
        r.totalEnergy ?? '',
        r.w1 ?? '',
        r.w2 ?? '',
        r.w3 ?? '',
        r.totalWater ?? '',
      ]),
      [
        'Total',
        report.totals.count,
        report.totals.p1,
        report.totals.p2,
        report.totals.totalEnergy,
        report.totals.w1,
        report.totals.w2,
        report.totals.w3,
        report.totals.totalWater,
      ],
      [],
      ['Chiller', 'TR Rating', 'Operating Hours'],
      ...report.chillerHours.map((c) => [c.name, c.tr, c.hours]),
    ];
    HvacApi.exportCsv(`hvac_monthly_${month}${fileSuffix}.csv`, csvRows);
  };

  const handleExportPdf = () => {
    const titleSuffix = dateFilterLabel ? ` (${dateFilterLabel})` : '';
    const fileSuffix = dateFilterLabel
      ? `_${dateFilterLabel.toLowerCase().replace(/[\s\:]+/g, '_')}`
      : '';
    const pdfRows = [
      ['Date', 'Slots', 'Panel 1 MWh', 'Panel 2 MWh', 'Total Energy', 'Old kL', 'New kL', 'Chilled kL', 'Total Water'],
      ...report.rows.map((r) => [
        r.date,
        String(r.count),
        r.p1 != null ? String(r.p1) : '–',
        r.p2 != null ? String(r.p2) : '–',
        r.totalEnergy != null ? `${r.totalEnergy} MWh` : '–',
        r.w1 != null ? String(r.w1) : '–',
        r.w2 != null ? String(r.w2) : '–',
        r.w3 != null ? String(r.w3) : '–',
        r.totalWater != null ? `${r.totalWater} kL` : '–',
      ]),
      [
        'TOTAL',
        String(report.totals.count),
        String(report.totals.p1),
        String(report.totals.p2),
        `${report.totals.totalEnergy} MWh`,
        String(report.totals.w1),
        String(report.totals.w2),
        String(report.totals.w3),
        `${report.totals.totalWater} kL`,
      ],
    ];
    HvacApi.exportPdf(
      `hvac_monthly_${month}${fileSuffix}.pdf`,
      pdfRows,
      `HVAC Monthly Plant Consumption & Operations - ${month}${titleSuffix}`
    );
  };

  return (
    <div>
      {/* Controls Card */}
      <div className="hvac-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Month:</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ padding: '6px 12px', fontWeight: 700, borderRadius: 8, border: '1px solid var(--hvac-line, #cbd5e1)' }}
              />
            </label>
            <span className="pill pill-blue">
              {report.rows.length} Active Days
            </span>
            {isDateFiltered && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: '#e0f2fe',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                }}
              >
                <span>📅 Scope: {dateFilterLabel}</span>
                <button
                  type="button"
                  onClick={() => { setFromDate(''); setToDate(''); }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#0369a1',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title="Clear date filter"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExportDropdown
              label="Export Monthly Report"
              hasDateFilter={true}
              fromDate={fromDate}
              toDate={toDate}
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
              onClearDates={() => { setFromDate(''); setToDate(''); }}
              dateLabel={dateFilterLabel}
              minDate={minMonthDate}
              maxDate={maxMonthDate}
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
              disabled={report.rows.length === 0}
            />
          </div>
        </div>

        {/* Date Selection Bar Under Export Monthly Report */}
        <div
          style={{
            paddingTop: 12,
            borderTop: '1px solid var(--hvac-line, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            background: '#f8fafc',
            margin: '0 -18px -16px -18px',
            padding: '12px 18px',
            borderRadius: '0 0 12px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--hvac-muted, #64748b)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span>🗓️</span>
              <span>Report Date Range:</span>
            </span>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 11, fontWeight: 600, color: '#334155' }}>
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                min={minMonthDate}
                max={toDate || maxMonthDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: fromDate ? '1.5px solid #0284c7' : '1px solid var(--hvac-line, #cbd5e1)',
                  background: fromDate ? '#f0f9ff' : '#ffffff',
                }}
              />
            </label>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
              <span>Report Upto:</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || minMonthDate}
                max={maxMonthDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: toDate ? '1.5px solid #0284c7' : '1px solid var(--hvac-line, #cbd5e1)',
                  background: toDate ? '#f0f9ff' : '#ffffff',
                  color: '#0369a1',
                }}
              />
            </label>

            {isDateFiltered && (
              <button
                type="button"
                onClick={() => { setFromDate(''); setToDate(''); }}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#dc2626',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ✕ Reset to Full Month
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="hvac-card" style={{ textAlign: 'center', padding: 40, color: 'var(--hvac-muted)' }}>
          Loading monthly logs...
        </div>
      ) : (
        <>
          {/* Monthly KPI Overview */}
          <div className="hvac-kpis">
            <div className="hvac-kpi-card">
              <span>Month Total Energy</span>
              <b>{report.totals.totalEnergy} MWh</b>
              <small>Across Panel 1 & 2</small>
            </div>
            <div className="hvac-kpi-card">
              <span>Month Total Water</span>
              <b>{report.totals.totalWater} kL</b>
              <small>Across Old, New &amp; Chilled</small>
            </div>
            <div className="hvac-kpi-card">
              <span>Days With Data</span>
              <b>{report.rows.length} Days</b>
              <small>{report.totals.count} total slot readings</small>
            </div>
            <div className="hvac-kpi-card">
              <span>Active Chillers</span>
              <b>{report.chillerHours.filter((c) => c.hours > 0).length} / 7</b>
              <small>Units operated this month</small>
            </div>
          </div>

          {/* Monthly Consumption Table */}
          <div className="hvac-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hvac-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0c2535', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Daily Consumption Summary &middot; {month}</span>
                  {dateFilterLabel && (
                    <span className="pill pill-blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                      📅 {dateFilterLabel}
                    </span>
                  )}
                </div>
                <small style={{ color: 'var(--hvac-muted)' }}>
                  Daily consumption computed as closing minus opening meter readings for each 24-hr period
                  {isDateFiltered ? ` (Showing ${report.rows.length} filtered days)` : ''}
                </small>
              </div>
              {isDateFiltered && (
                <span style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 700, background: '#f0f9ff', padding: '3px 10px', borderRadius: 8, border: '1px solid #bae6fd' }}>
                  Scope: {dateFilterLabel} ({report.rows.length} Day{report.rows.length === 1 ? '' : 's'})
                </span>
              )}
            </div>

            <div className="hvac-scroll">
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Slots Logged</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Panel 1 MWh</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Panel 2 MWh</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Energy MWh</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Old kL</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>New kL</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Chilled kL</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Water kL</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.date} style={{ borderBottom: '1px solid var(--hvac-line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 800 }}>{r.date}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span className="pill pill-gray">{r.count} / 24</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r.p1 ?? '–'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r.p2 ?? '–'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>
                        {r.totalEnergy != null ? `${r.totalEnergy}` : '–'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r.w1 ?? '–'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r.w2 ?? '–'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r.w3 ?? '–'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                        {r.totalWater != null ? `${r.totalWater}` : '–'}
                      </td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ padding: 24, textAlign: 'center', color: 'var(--hvac-muted)' }}>
                        No records found for {month}{dateFilterLabel ? ` (${dateFilterLabel})` : ''}.
                      </td>
                    </tr>
                  )}
                  {report.rows.length > 0 && (
                    <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                      <td style={{ padding: '10px 12px' }}>
                        {isDateFiltered ? `Total Consumption (${dateFilterLabel})` : 'Total Monthly Consumption'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{report.totals.count}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{report.totals.p1}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{report.totals.p2}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontSize: 13.5 }}>
                        {report.totals.totalEnergy} MWh
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{report.totals.w1}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{report.totals.w2}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{report.totals.w3}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontSize: 13.5 }}>
                        {report.totals.totalWater} kL
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chiller Running Hours */}
          <div className="hvac-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hvac-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0c2535', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Chiller Operating Hours Breakdown &middot; {month}</span>
                  {dateFilterLabel && (
                    <span className="pill pill-blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                      📅 {dateFilterLabel}
                    </span>
                  )}
                </div>
                <small style={{ color: 'var(--hvac-muted)' }}>
                  Cumulative hours of active operation logged per chiller unit
                  {isDateFiltered ? ` across selected ${report.rows.length} days` : ''}
                </small>
              </div>
              {isDateFiltered && (
                <span style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 700, background: '#f0f9ff', padding: '3px 10px', borderRadius: 8, border: '1px solid #bae6fd' }}>
                  Max Window: {report.rows.length * 24} hrs/chiller
                </span>
              )}
            </div>

            <div className="hvac-scroll">
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Unit #</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Chiller Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Capacity (TR)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Operating Hours</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Utilization %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.chillerHours.map((c) => {
                    const maxPossibleHrs = report.rows.length * 24;
                    const utilPct = maxPossibleHrs > 0 ? ((c.hours / maxPossibleHrs) * 100).toFixed(1) : 0;
                    return (
                      <tr key={c.num} style={{ borderBottom: '1px solid var(--hvac-line)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 800 }}>Chiller {c.num}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{c.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{c.tr} TR</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: c.hours > 0 ? '#0284c7' : 'inherit' }}>
                          {c.hours} hrs
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <span className={`pill ${c.hours > 0 ? 'pill-green' : 'pill-gray'}`}>
                            {utilPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
