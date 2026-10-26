import { useMemo, useState } from 'react';
import { FIELDS, JMT } from '../config';
import { daily, dRows } from '../lib/calc';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import BarChart from './BarChart.jsx';
import { Kpi } from './Controls.jsx';
import ExportDropdown from '../../../components/ui/ExportDropdown';

const J = FIELDS.filter((f) => f.st === 'jm' && !f.cum);
const M = FIELDS.filter((f) => f.st === 'jm' && f.cum);

const jmLabel = (shift) => (shift === 2 ? 'Final Value' : 'Initial Value');

export default function JalmandapamReport({ rows }) {
  const [unit, setUnit] = useState('m');
  const [sel, setSel] = useState('jm1');
  const [view, setView] = useState('day');
  const [readingFilter, setReadingFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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

  const jr = rows.filter((r) => J.some((f) => r[f.k] != null));
  const filteredJr = useMemo(() => {
    let list = jr.filter((r) => dateMatch(r.date));
    if (readingFilter === '1') list = list.filter((r) => r.shift === 1);
    if (readingFilter === '2') list = list.filter((r) => r.shift === 2);
    return list;
  }, [jr, fromDate, toDate, readingFilter]);

  const act = M.filter((f) => rows.some((r) => r[f.k] != null));

  const isPeriodView = view === '7days' || view === '15days' || view === '30days';
  const calcView = isPeriodView ? view : view === 'day' ? 'day' : 'shift';

  const dt = useMemo(() => {
    const base = dRows(daily(rows), calcView, readingFilter).filter((r) => act.some((f) => r[f.k] != null));
    if (!fromDate && !toDate) return base;
    if (fromDate && toDate) {
      return base.filter((r) => r.date >= fromDate && r.date <= toDate);
    }
    if (fromDate && !toDate) {
      return base.filter((r) => r.date >= fromDate);
    }
    if (isPeriodView) {
      const days = base.filter((r) => r.date <= toDate);
      const count = view === '7days' ? 7 : view === '15days' ? 15 : 30;
      return days.slice(-count);
    }
    return base.filter((r) => r.date <= toDate);
  }, [rows, calcView, readingFilter, act, fromDate, toDate, isPeriodView, view]);

  if (!jr.length && !act.length)
    return <p className="card empty">No Jalmandapam readings yet. Operators can add them by choosing the Jalmandapam station.</p>;

  const conv = (k, v) => (unit === 'cum' ? (v / JMT[k].h) * JMT[k].cap : v);
  const show = (f, r) => (unit === 'cum' ? `${fmt(conv(f.k, r[f.k]), 1)} CUM` : `${fmt(r[f.k], 3)} m`);
  const lastOf = (k, list) => [...list].reverse().find((r) => r[k] != null);
  const isAllTanks = sel === 'all';
  const selField = J.find((f) => f.k === sel) || J[0];
  const refVal = isAllTanks ? null : (unit === 'cum' ? (JMT[sel]?.cap || 1400) : 4.0);
  const refLabel = isAllTanks ? null : (unit === 'cum' ? `Max Capacity (${refVal} CUM)` : `Max Safe Limit (4.0 m)`);

  const allChartData = useMemo(() => {
    if (isAllTanks) {
      return filteredJr.map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        title: `${r.date} (${jmLabel(r.shift)})`,
        jm1: conv('jm1', r.jm1 ?? 0),
        jm2: conv('jm2', r.jm2 ?? 0),
        jm3: conv('jm3', r.jm3 ?? 0),
        jm4: conv('jm4', r.jm4 ?? 0),
        jm5: conv('jm5', r.jm5 ?? 0),
        value: conv('jm1', r.jm1 ?? 0),
      }));
    }
    return filteredJr
      .filter((r) => r[sel] != null)
      .map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        value: conv(sel, r[sel]),
        title: `${r.date} (${jmLabel(r.shift)}): ${fmt(conv(sel, r[sel]), 2)} ${unit === 'cum' ? 'CUM' : 'm'}`,
      }));
  }, [filteredJr, isAllTanks, sel, unit]);

  const chart = useMemo(() => {
    const subset = filteredJr.slice(-30);
    if (isAllTanks) {
      return subset.map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        title: `${r.date} (${jmLabel(r.shift)})`,
        jm1: conv('jm1', r.jm1 ?? 0),
        jm2: conv('jm2', r.jm2 ?? 0),
        jm3: conv('jm3', r.jm3 ?? 0),
        jm4: conv('jm4', r.jm4 ?? 0),
        jm5: conv('jm5', r.jm5 ?? 0),
        value: conv('jm1', r.jm1 ?? 0),
      }));
    }
    return subset
      .filter((r) => r[sel] != null)
      .map((r) => ({
        date: r.date,
        label: r.date.slice(5),
        value: conv(sel, r[sel]),
        title: `${r.date} (${jmLabel(r.shift)}): ${fmt(conv(sel, r[sel]), 2)} ${unit === 'cum' ? 'CUM' : 'm'}`,
      }));
  }, [filteredJr, isAllTanks, sel, unit]);

  const jmMultiSeries = isAllTanks
    ? [
        { key: 'jm1', label: 'Jalmandap 1', color: '#1a3c34' },
        { key: 'jm2', label: 'Jalmandap 2', color: '#2d4a3e' },
        { key: 'jm3', label: 'Jalmandap 3', color: '#3d6b55' },
        { key: 'jm4', label: 'Jalmandap 4', color: '#c2622a' },
        { key: 'jm5', label: 'Jalmandap 5', color: '#1b6b66' },
      ]
    : null;

  const exportLevelsCsv = () => {
    const filename = dateLabel ? `jalmandapam-levels-${dateLabel.replace(/[\s\:]+/g, '_')}.csv` : 'jalmandapam-levels.csv';
    const headers = ['Date', 'Reading', 'By', ...J.map((f) => `${f.label} (${unit === 'cum' ? 'CUM' : 'm'})`)];
    const dataRows = filteredJr.map((r) => [
      r.date,
      jmLabel(r.shift),
      r.by || '',
      ...J.map((f) => (r[f.k] == null ? '' : unit === 'cum' ? fmt(conv(f.k, r[f.k]), 2) : fmt(r[f.k], 3)))
    ]);
    downloadCsv(filename, [headers, ...dataRows]);
  };

  const exportLevelsPdf = () => {
    const filename = dateLabel ? `jalmandapam-levels-${dateLabel.replace(/[\s\:]+/g, '_')}.pdf` : 'jalmandapam-levels.pdf';
    const headers = ['Date', 'Reading', 'By', ...J.map((f) => `${f.label} (${unit === 'cum' ? 'CUM' : 'm'})`)];
    const dataRows = filteredJr.map((r) => [
      r.date,
      jmLabel(r.shift),
      r.by || '',
      ...J.map((f) => (r[f.k] == null ? '' : unit === 'cum' ? fmt(conv(f.k, r[f.k]), 2) : fmt(r[f.k], 3)))
    ]);
    downloadPdf(filename, [headers, ...dataRows], `Jalmandapam Tank Levels (${unit === 'cum' ? 'CUM' : 'm'})${dateLabel ? ` (${dateLabel})` : ''}`);
  };

  const exportFlowCsv = () => {
    const filename = dateLabel ? `jalmandapam-flow-${dateLabel.replace(/[\s\:]+/g, '_')}-${view}.csv` : `jalmandapam-flow-${view}.csv`;
    const headers = ['Date / Reading', ...act.map((f) => `${f.label} (CUM)`)];
    const dataRows = dt.map((r) => {
      const isDailyView = view === 'day' || view === '7days' || view === '15days' || view === '30days';
      const rowLabel = isDailyView || !r.shift ? r.date : `${r.date} · ${jmLabel(r.shift)}`;
      return [
        rowLabel,
        ...act.map((f) => (r[f.k] != null ? fmt(r[f.k], 2) : ''))
      ];
    });
    const totalRow = [
      `TOTAL (${view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Readings (${dateLabel})` : 'Selected')})`,
      ...act.map((f) => {
        const totalVal = dt.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
        return fmt(totalVal, 2);
      })
    ];
    downloadCsv(filename, [headers, ...dataRows, totalRow]);
  };

  const exportFlowPdf = () => {
    const filename = dateLabel ? `jalmandapam-flow-${dateLabel.replace(/[\s\:]+/g, '_')}-${view}.pdf` : `jalmandapam-flow-${view}.pdf`;
    const headers = ['Date / Reading', ...act.map((f) => `${f.label} (CUM)`)];
    const dataRows = dt.map((r) => {
      const isDailyView = view === 'day' || view === '7days' || view === '15days' || view === '30days';
      const rowLabel = isDailyView || !r.shift ? r.date : `${r.date} · ${jmLabel(r.shift)}`;
      return [
        rowLabel,
        ...act.map((f) => (r[f.k] != null ? fmt(r[f.k], 2) : ''))
      ];
    });
    const totalRow = [
      `TOTAL (${view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Readings (${dateLabel})` : 'Selected')})`,
      ...act.map((f) => {
        const totalVal = dt.reduce((acc, r) => acc + (r[f.k] != null && r[f.k] >= 0 ? r[f.k] : 0), 0);
        return fmt(totalVal, 2);
      })
    ];
    downloadPdf(filename, [headers, ...dataRows, totalRow], `Jalmandapam Flow Meters Consumption (${view})${dateLabel ? ` (${dateLabel})` : ''}`);
  };

  return (
    <>
      <div className="kpis">
        {J.map((f) => {
          const r = lastOf(f.k, filteredJr.length ? filteredJr : jr);
          return (
            <Kpi
              key={f.k}
              label={f.label}
              value={r ? show(f, r) : '–'}
              sub={`${r ? `${r.date} (${jmLabel(r.shift)}) · ${fmt((r[f.k] / JMT[f.k].h) * 100, 0)}% full · ` : ''}capacity ${JMT[f.k].cap} CUM`}
            />
          );
        })}
      </div>
      <div className="card">
        <div className="row">
          <label style={{ flex: '1 1 0', minWidth: 0 }}>Reading filter
            <select value={readingFilter} onChange={(e) => setReadingFilter(e.target.value)}>
              <option value="all">All Readings (Initial & Final)</option>
              <option value="1">Initial Value only (Morning)</option>
              <option value="2">Final Value only (Evening)</option>
            </select>
          </label>
          <label style={{ flex: '1 1 0', minWidth: 0 }}>Show levels in
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="m">Metres (m)</option><option value="cum">Volume (CUM)</option>
            </select>
          </label>
          <label style={{ flex: '1.35 1 0', minWidth: 0 }}>Level trend (last 30 readings)
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="all">⚡ All 5 Tanks Comparison</option>
              {J.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
            </select>
          </label>
          <ExportDropdown
            label="Export File (Levels)"
            style={{ flexShrink: 0 }}
            hasDateFilter={true}
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClearDates={() => { setFromDate(''); setToDate(''); }}
            dateLabel={dateLabel}
            onExportCsv={exportLevelsCsv}
            onExportPdf={exportLevelsPdf}
          />
        </div>
        <BarChart
          data={chart}
          allData={allChartData}
          unit={unit === 'cum' ? 'CUM' : 'm'}
          title={isAllTanks ? `All 5 Jalmandapam Storage Tanks (${unit === 'cum' ? 'Volume CUM' : 'Level Metres'})` : `${selField.label} Storage Level Trend`}
          metricName={isAllTanks ? 'Level' : selField.label}
          color="water"
          referenceValue={refVal}
          referenceLabel={refLabel}
          multiSeries={jmMultiSeries}
          height={300}
        />
      </div>
      <div className="card">
        <h2>Level readings ({unit === 'cum' ? 'CUM' : 'm'}){dateLabel ? ` · ${dateLabel}` : ''}</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reading</th>
                <th>By</th>
                {J.map((f) => <th key={f.k}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredJr.length === 0 && (
                <tr>
                  <td colSpan={J.length + 3} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    {dateLabel ? `No level readings found for ${dateLabel}. Select another date range or click "All".` : 'No level readings found.'}
                  </td>
                </tr>
              )}
              {[...filteredJr].reverse().map((r) => (
                <tr key={r.date + '-' + r.shift}>
                  <td className="l">{r.date}</td>
                  <td>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: r.shift === 1 ? 'color-mix(in srgb, var(--water) 18%, transparent)' : 'color-mix(in srgb, var(--ok) 18%, transparent)',
                      color: r.shift === 1 ? 'var(--water)' : 'var(--ok)',
                    }}>
                      {jmLabel(r.shift)}
                    </span>
                  </td>
                  <td className="l">{r.by || '–'}</td>
                  {J.map((f) => <td key={f.k}>{r[f.k] == null ? '–' : unit === 'cum' ? fmt(conv(f.k, r[f.k]), 1) : fmt(r[f.k], 3)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>
          Flow meter consumption ({
            view === '7days' ? (dateLabel ? `7 days ending ${dateLabel}` : 'Last 7 days') :
            view === '15days' ? (dateLabel ? `15 days ending ${dateLabel}` : 'Last 15 days') :
            view === '30days' ? (dateLabel ? `30 days ending ${dateLabel}` : 'Last 30 days') :
            view === 'day' ? (dateLabel ? `Date: ${dateLabel}` : 'Daily total') :
            (dateLabel ? `Readings on ${dateLabel}` : 'Per reading (Initial / Final)')
          } · CUM)
        </h2>
        {!act.length ? (
          <p className="empty">No Jalmandapam meter readings yet. Tanks without a meter can stay blank – a meter can be added any time by entering its reading.</p>
        ) : (
          <>
            <div className="row">
              <label>View
                <select value={view} onChange={(e) => setView(e.target.value)}>
                  <option value="day">Daily consumption (Total)</option>
                  <option value="reading">Per reading (Initial / Final breakdown)</option>
                  <option value="7days">7 days</option>
                  <option value="15days">15 days</option>
                  <option value="30days">30 days</option>
                </select>
              </label>
              {view === 'reading' && (
                <label>Reading
                  <select value={readingFilter} onChange={(e) => setReadingFilter(e.target.value)}>
                    <option value="all">All readings (Initial & Final)</option>
                    <option value="1">Initial Value only</option>
                    <option value="2">Final Value only</option>
                  </select>
                </label>
              )}
              <ExportDropdown
                label="Export File (Flow)"
                hasDateFilter={true}
                fromDate={fromDate}
                toDate={toDate}
                onFromDateChange={setFromDate}
                onToDateChange={setToDate}
                onClearDates={() => { setFromDate(''); setToDate(''); }}
                dateLabel={dateLabel}
                onExportCsv={exportFlowCsv}
                onExportPdf={exportFlowPdf}
              />
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>{view === 'reading' ? 'Date / Reading' : 'Date'}</th>
                    {act.map((f) => <th key={f.k}>{f.label}<br />CUM</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dt.length === 0 && (
                    <tr>
                      <td colSpan={act.length + 1} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        {dateLabel ? `No flow meter readings found for ${dateLabel}. Select another date range or click "All".` : 'No flow meter readings found.'}
                      </td>
                    </tr>
                  )}
                  {[...dt].reverse().map((r) => {
                    const isDailyView = view === 'day' || view === '7days' || view === '15days' || view === '30days';
                    const rowLabel = isDailyView || !r.shift ? r.date : `${r.date} · ${jmLabel(r.shift)}`;
                    return (
                      <tr key={rowLabel}>
                        <td className="l">{rowLabel}</td>
                        {act.map((f) => <td key={f.k} className={r[f.k] < 0 ? 'warn' : ''}>{fmt(r[f.k], 2)}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
                {dt.length > 0 && (
                  <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--field)', zIndex: 1, borderTop: '2px solid var(--water)' }}>
                    <tr>
                      <td className="l" style={{ fontWeight: 700, color: 'var(--water)' }}>
                        TOTAL ({view === '7days' ? '7 Days' : view === '15days' ? '15 Days' : view === '30days' ? '30 Days' : view === 'day' ? (dateLabel ? dateLabel : 'All Days') : (dateLabel ? `Readings (${dateLabel})` : 'Selected')})
                      </td>
                      {act.map((f) => {
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
                        {act.map((f) => {
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
          </>
        )}
      </div>
    </>
  );
}
