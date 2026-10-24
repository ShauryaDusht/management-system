import { useState, useMemo, useEffect } from 'react';
import { STATIONS, getMergedFields } from '../config';
import { fmt, downloadCsv } from '../lib/format';
import { calcMeterDelta, isMeterRollover } from '../lib/calc';
import BarChart from './BarChart.jsx';

export default function SupervisorConsumption({ rows = [], stationMeters = [] }) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Sorted list of all available dates in data
  const availableDates = useMemo(() => {
    const set = new Set(rows.map((r) => r.date).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const latestDate = availableDates[availableDates.length - 1] || todayStr;
  const earliestDate = availableDates[0] || todayStr;

  // Calendar filter state
  const [dateMode, setDateMode] = useState('range'); // 'range' | 'single' | 'month'
  const [fromDate, setFromDate] = useState(() => {
    if (!latestDate) return todayStr;
    const ref = new Date(latestDate + 'T00:00:00');
    ref.setDate(ref.getDate() - 6); // default to last 7 days
    return ref.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(latestDate);
  const [singleDate, setSingleDate] = useState(latestDate);
  const [selectedMonth, setSelectedMonth] = useState(latestDate.slice(0, 7));
  const [activePreset, setActivePreset] = useState('last7');

  // Operational filters
  const [station, setStation] = useState('all');
  const [viewType, setViewType] = useState('day'); // 'day' | 'shift'
  const [shiftFilter, setShiftFilter] = useState('all');
  const [chartMeter, setChartMeter] = useState('c');

  // Update dates if rows load later
  useEffect(() => {
    if (availableDates.length > 0 && !rows.find((r) => r.date === toDate)) {
      setToDate(latestDate);
      const ref = new Date(latestDate + 'T00:00:00');
      ref.setDate(ref.getDate() - 6);
      setFromDate(ref.toISOString().slice(0, 10));
      setSingleDate(latestDate);
      setSelectedMonth(latestDate.slice(0, 7));
    }
  }, [availableDates.length, latestDate]);

  // All cumulative meters (including custom station meters)
  const allFields = useMemo(() => getMergedFields(stationMeters), [stationMeters]);
  const allCums = useMemo(() => allFields.filter((f) => f.cum), [allFields]);

  // Meters filtered by station
  const stationCums = useMemo(() => {
    if (station === 'all') return allCums;
    return allCums.filter((f) => f.st === station);
  }, [allCums, station]);

  // Keep chart meter valid for currently selected station
  useEffect(() => {
    if (!stationCums.some((m) => m.k === chartMeter)) {
      if (stationCums.length > 0) setChartMeter(stationCums[0].k);
    }
  }, [station, stationCums, chartMeter]);

  // 1. Calculate cumulative delta consumption across all chronological records first
  const computedHistory = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (Number(a.shift) || 0) - (Number(b.shift) || 0);
    });

    const lastVals = {};
    return sorted.map((r) => {
      const out = { date: r.date, shift: r.shift, by: r.by };
      for (const f of allCums) {
        const v = r[f.k];
        if (v != null && lastVals[f.k] != null) {
          out[f.k] = calcMeterDelta(v, lastVals[f.k], f.coef || 1, f.k);
          if (isMeterRollover(v, lastVals[f.k], f.k)) {
            out[f.k + '_rolled'] = true;
          }
        } else {
          out[f.k] = null;
        }
        if (v != null) lastVals[f.k] = v;
      }
      return out;
    });
  }, [rows, allCums]);

  // 2. Filter computed history by calendar date selection
  const calendarFiltered = useMemo(() => {
    return computedHistory.filter((r) => {
      if (dateMode === 'range') {
        if (fromDate && r.date < fromDate) return false;
        if (toDate && r.date > toDate) return false;
        return true;
      }
      if (dateMode === 'single') {
        return r.date === singleDate;
      }
      if (dateMode === 'month') {
        return r.date.startsWith(selectedMonth);
      }
      return true;
    });
  }, [computedHistory, dateMode, fromDate, toDate, singleDate, selectedMonth]);

  // 3. Aggregate view (per day vs per shift)
  const displayRows = useMemo(() => {
    if (viewType === 'day') {
      const dayMap = new Map();
      for (const r of calendarFiltered) {
        let dObj = dayMap.get(r.date);
        if (!dObj) {
          dObj = { date: r.date, shiftsCount: 0 };
          dayMap.set(r.date, dObj);
        }
        dObj.shiftsCount++;
        for (const f of allCums) {
          if (r[f.k] != null && r[f.k] >= 0) {
            dObj[f.k] = (dObj[f.k] || 0) + r[f.k];
          }
          if (r[f.k + '_rolled']) {
            dObj[f.k + '_rolled'] = true;
          }
        }
      }
      return [...dayMap.values()];
    }

    // Shift view
    if (shiftFilter === 'all') return calendarFiltered;
    return calendarFiltered.filter((r) => String(r.shift) === String(shiftFilter));
  }, [calendarFiltered, viewType, shiftFilter, allCums]);

  // Summary totals for each meter over the filtered calendar period
  const totals = useMemo(() => {
    const t = {};
    for (const f of stationCums) {
      let sum = 0;
      let count = 0;
      for (const r of displayRows) {
        if (r[f.k] != null && r[f.k] >= 0) {
          sum += r[f.k];
          count++;
        }
      }
      t[f.k] = { sum, count };
    }
    return t;
  }, [displayRows, stationCums]);

  // Overall KPI metrics
  const kpiStats = useMemo(() => {
    const totalWater = Object.values(totals).reduce((acc, curr) => acc + (curr.sum || 0), 0);
    const uniqueDays = new Set(displayRows.map((r) => r.date)).size;
    const dailyAvg = uniqueDays > 0 ? totalWater / uniqueDays : 0;

    let peakDay = null;
    let peakVal = 0;
    if (viewType === 'day') {
      for (const r of displayRows) {
        let daySum = 0;
        for (const f of stationCums) {
          if (r[f.k] != null && r[f.k] > 0) daySum += r[f.k];
        }
        if (daySum > peakVal) {
          peakVal = daySum;
          peakDay = r.date;
        }
      }
    }

    return { totalWater, uniqueDays, dailyAvg, peakDay, peakVal };
  }, [totals, displayRows, viewType, stationCums]);

  // Prepare chart data for the selected meter
  const currentChartField = allCums.find((f) => f.k === chartMeter) || stationCums[0] || allCums[0];
  const chartData = useMemo(() => {
    if (!currentChartField) return [];
    return displayRows
      .filter((r) => r[currentChartField.k] != null && r[currentChartField.k] >= 0)
      .slice(-30)
      .map((r) => {
        const lbl = viewType === 'day' ? r.date.slice(5) : `${r.date.slice(5)} S${r.shift}`;
        return {
          label: lbl,
          value: r[currentChartField.k],
          title: `${r.date}${r.shift ? ` Shift ${r.shift}` : ''}: ${fmt(r[currentChartField.k], 2)} ${currentChartField.cu || 'CUM'}`,
        };
      });
  }, [displayRows, currentChartField, viewType]);

  // Calendar Presets Handlers
  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    setDateMode('range');
    const ref = latestDate ? new Date(latestDate + 'T00:00:00') : new Date();

    if (presetKey === 'today') {
      const s = latestDate || todayStr;
      setFromDate(s);
      setToDate(s);
      setSingleDate(s);
    } else if (presetKey === 'yesterday') {
      const y = new Date(ref);
      y.setDate(y.getDate() - 1);
      const s = y.toISOString().slice(0, 10);
      setFromDate(s);
      setToDate(s);
      setSingleDate(s);
    } else if (presetKey === 'last7') {
      const past = new Date(ref);
      past.setDate(past.getDate() - 6);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(latestDate || todayStr);
    } else if (presetKey === 'last30') {
      const past = new Date(ref);
      past.setDate(past.getDate() - 29);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(latestDate || todayStr);
    } else if (presetKey === 'month') {
      const mStr = latestDate.slice(0, 7);
      setFromDate(`${mStr}-01`);
      setToDate(latestDate || todayStr);
      setSelectedMonth(mStr);
    } else if (presetKey === 'all') {
      setFromDate(earliestDate);
      setToDate(latestDate);
    }
  };

  // Step single date
  const stepSingleDate = (deltaDays) => {
    const cur = singleDate ? new Date(singleDate + 'T00:00:00') : new Date();
    cur.setDate(cur.getDate() + deltaDays);
    const n = cur.toISOString().slice(0, 10);
    setSingleDate(n);
    setActivePreset('');
  };

  // CSV Export for filtered consumption report
  const handleExportCsv = () => {
    const headers = [
      'Date',
      ...(viewType === 'shift' ? ['Shift', 'Recorded By'] : ['Shifts Included']),
      ...stationCums.map((f) => `${f.label} (${f.cu || 'CUM'})`),
    ];

    const dataRows = [...displayRows].reverse().map((r) => [
      r.date,
      ...(viewType === 'shift' ? [`Shift ${r.shift}`, r.by || '–'] : [`${r.shiftsCount || 'All'} shifts`]),
      ...stationCums.map((f) => (r[f.k] != null ? fmt(r[f.k], 2) : '–')),
    ]);

    // Totals row at the bottom
    const totalRow = [
      'TOTAL CONSUMPTION',
      ...(viewType === 'shift' ? ['', ''] : ['']),
      ...stationCums.map((f) => fmt(totals[f.k]?.sum, 2)),
    ];

    const rangeLabel =
      dateMode === 'range' ? `${fromDate}_to_${toDate}` : dateMode === 'single' ? singleDate : selectedMonth;

    downloadCsv(`consumption-report-${rangeLabel}.csv`, [headers, ...dataRows, totalRow]);
  };

  return (
    <div className="supervisor-consumption-report">
      {/* 1. Main Calendar & Controls Card */}
      <div className="card" style={{ borderLeft: '4px solid var(--water)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📅</span> Consumption Report & Calendar Analysis
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Select desired calendar dates, ranges, or shifts to analyze water consumption across stations
            </p>
          </div>

          <button
            type="button"
            className="primary"
            onClick={handleExportCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}
          >
            <span>📥</span> Export Filtered CSV
          </button>
        </div>

        {/* Quick Calendar Presets Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginRight: '4px' }}>
            Calendar Presets:
          </span>
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'last7', label: 'Last 7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'last30', label: 'Last 30 Days' },
            { id: 'all', label: 'All Records' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: activePreset === p.id ? 'var(--water)' : 'var(--field)',
                color: activePreset === p.id ? 'var(--on)' : 'var(--ink)',
                fontWeight: activePreset === p.id ? 600 : 'normal',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Interactive Calendar Date Picker Controls */}
        <div className="row" style={{ alignItems: 'flex-end', gap: '12px' }}>
          {/* Date Picker Mode */}
          <label style={{ flex: '0 1 150px' }}>
            <span>Calendar View Mode</span>
            <select
              value={dateMode}
              onChange={(e) => {
                setDateMode(e.target.value);
                setActivePreset('');
              }}
            >
              <option value="range">Date Range (From – To)</option>
              <option value="single">Single Day</option>
              <option value="month">Entire Month</option>
            </select>
          </label>

          {/* Range Mode: From & To */}
          {dateMode === 'range' && (
            <>
              <label style={{ flex: '1 1 150px' }}>
                <span>From Date (Calendar)</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setActivePreset('');
                  }}
                />
              </label>
              <label style={{ flex: '1 1 150px' }}>
                <span>Upto Date (Calendar)</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setActivePreset('');
                  }}
                />
              </label>
            </>
          )}

          {/* Single Day Mode */}
          {dateMode === 'single' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flex: '1 1 240px' }}>
              <button
                type="button"
                onClick={() => stepSingleDate(-1)}
                title="Previous Day"
                style={{ padding: '8px 12px', background: 'var(--field)' }}
              >
                ◀
              </button>
              <label style={{ flex: 1, margin: 0 }}>
                <span>Selected Date (Calendar)</span>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => {
                    setSingleDate(e.target.value);
                    setActivePreset('');
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => stepSingleDate(1)}
                title="Next Day"
                style={{ padding: '8px 12px', background: 'var(--field)' }}
              >
                ▶
              </button>
            </div>
          )}

          {/* Month Mode */}
          {dateMode === 'month' && (
            <label style={{ flex: '1 1 180px' }}>
              <span>Month (Calendar)</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setActivePreset('');
                }}
              />
            </label>
          )}

          {/* Station Selection */}
          <label style={{ flex: '1 1 170px' }}>
            <span>Station Filter</span>
            <select value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="all">All Stations</option>
              {STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {/* Grouping View */}
          <label style={{ flex: '0 1 140px' }}>
            <span>Aggregation</span>
            <select value={viewType} onChange={(e) => setViewType(e.target.value)}>
              <option value="day">Per Day (Total)</option>
              <option value="shift">Per Shift</option>
            </select>
          </label>

          {/* Shift Filter if Shift view */}
          {viewType === 'shift' && (
            <label style={{ flex: '0 1 130px' }}>
              <span>Shift Filter</span>
              <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
                <option value="all">All Shifts</option>
                <option value="1">Shift 1</option>
                <option value="2">Shift 2</option>
                <option value="3">Shift 3</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {/* 2. Key Performance Indicators for the Selected Calendar Window */}
      <div className="kpis">
        <div className="kpi">
          <span>Active Calendar Window</span>
          <b style={{ fontSize: '1.1rem' }}>
            {dateMode === 'range' ? `${fromDate} → ${toDate}` : dateMode === 'single' ? singleDate : selectedMonth}
          </b>
          <small className="muted">{kpiStats.uniqueDays} days included · {displayRows.length} entries</small>
        </div>

        <div className="kpi">
          <span>Total Consumption</span>
          <b>{fmt(kpiStats.totalWater, 0)} <span style={{ fontSize: '13px' }}>CUM</span></b>
          <small className="muted">Sum of {stationCums.length} active meters</small>
        </div>

        <div className="kpi">
          <span>Daily Average</span>
          <b>{fmt(kpiStats.dailyAvg, 1)} <span style={{ fontSize: '13px' }}>CUM / day</span></b>
          <small className="muted">Across selected period</small>
        </div>

        {kpiStats.peakDay ? (
          <div className="kpi">
            <span>Peak Consumption Day</span>
            <b>{fmt(kpiStats.peakVal, 0)} <span style={{ fontSize: '13px' }}>CUM</span></b>
            <small className="muted">{kpiStats.peakDay}</small>
          </div>
        ) : (
          <div className="kpi">
            <span>Peak Consumption Day</span>
            <b>–</b>
            <small className="muted">No peak recorded</small>
          </div>
        )}

        <div className="kpi">
          <span>Reporting Meters</span>
          <b>{stationCums.length}</b>
          <small className="muted">{station === 'all' ? 'All plant stations' : STATIONS.find((s) => s.id === station)?.name}</small>
        </div>
      </div>

      {/* 3. Visual Consumption Trend Chart */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>
              Consumption Trend Chart ({currentChartField?.label || 'Selected Meter'})
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Visual trend for the selected calendar range
            </p>
          </div>

          <label style={{ margin: 0, minWidth: '220px' }}>
            <span style={{ fontSize: '12px' }}>Choose Meter to Chart:</span>
            <select
              value={currentChartField?.k || ''}
              onChange={(e) => setChartMeter(e.target.value)}
              style={{ padding: '6px 10px' }}
            >
              {stationCums.map((f) => (
                <option key={f.k} value={f.k}>
                  {f.label} ({f.cu || 'CUM'})
                </option>
              ))}
            </select>
          </label>
        </div>

        <BarChart
          data={chartData}
          unit={currentChartField?.cu || 'CUM'}
          metricName={currentChartField?.label || 'Water Consumption'}
          xAxisLabel={viewType === 'day' ? 'Date' : 'Date / Shift'}
          yAxisLabel={`Water Consumption (${currentChartField?.cu || 'CUM'})`}
        />
      </div>

      {/* 4. Detailed Tabular Report with Sticky Header & Bottom Totals */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <h2 style={{ margin: 0 }}>
            Consumption Log Table ({viewType === 'day' ? 'Daily Aggregated Totals' : 'Per Shift Readings'})
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Showing {displayRows.length} rows · Values in CUM (cubic metres)
          </span>
        </div>

        {displayRows.length === 0 ? (
          <p className="empty">No readings found for the selected calendar date range.</p>
        ) : (
          <div className="scroll" style={{ maxHeight: '520px' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: '110px' }}>Date</th>
                  {viewType === 'shift' && <th style={{ textAlign: 'center', width: '70px' }}>Shift</th>}
                  {viewType === 'shift' && <th style={{ textAlign: 'left', minWidth: '90px' }}>Recorded By</th>}
                  {stationCums.map((f) => (
                    <th key={f.k} style={{ minWidth: '120px' }}>
                      <span style={{ fontSize: '11px', opacity: 0.75, display: 'block' }}>
                        {f.st.toUpperCase()}
                      </span>
                      {f.label}
                      <br />
                      <span style={{ fontSize: '11px', color: 'var(--water)' }}>({f.cu || 'CUM'})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...displayRows].reverse().map((r, idx) => (
                  <tr key={r.date + (r.shift || '') + idx}>
                    <td className="l" style={{ fontWeight: 600 }}>
                      {r.date}
                    </td>
                    {viewType === 'shift' && (
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background:
                              r.shift === 1
                                ? 'color-mix(in srgb, var(--water) 20%, transparent)'
                                : r.shift === 2
                                ? 'color-mix(in srgb, var(--ok) 20%, transparent)'
                                : 'color-mix(in srgb, var(--amber) 20%, transparent)',
                            color: r.shift === 1 ? 'var(--water)' : r.shift === 2 ? 'var(--ok)' : 'var(--amber)',
                          }}
                        >
                          S{r.shift}
                        </span>
                      </td>
                    )}
                    {viewType === 'shift' && <td className="l" style={{ color: 'var(--muted)', fontSize: '12px' }}>{r.by || '–'}</td>}
                    {stationCums.map((f) => {
                      const val = r[f.k];
                      const isRolled = r[f.k + '_rolled'];
                      const isNegative = val != null && val < 0;
                      return (
                        <td
                          key={f.k}
                          className={isNegative ? 'warn' : ''}
                          title={isRolled ? '10,000 CUM WSC / STP Meter Rollover Automatically Detected' : isNegative ? 'Meter reset or reading anomaly' : ''}
                          style={{ fontWeight: val != null ? 500 : 400 }}
                        >
                          {val != null ? fmt(val, 2) : '–'}
                          {isRolled && (
                            <span
                              title="10,000 CUM WSC / STP Meter Rollover Detected"
                              style={{
                                display: 'inline-block',
                                marginLeft: '4px',
                                fontSize: '10px',
                                padding: '1px 4px',
                                borderRadius: '4px',
                                background: 'color-mix(in srgb, var(--water) 20%, transparent)',
                                color: 'var(--water)',
                                fontWeight: 700,
                              }}
                            >
                              🔄 10k
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--field)', zIndex: 1, borderTop: '2px solid var(--water)' }}>
                <tr>
                  <td className="l" style={{ fontWeight: 700, color: 'var(--water)' }}>
                    TOTAL (CUM)
                  </td>
                  {viewType === 'shift' && <td style={{ textAlign: 'center', fontWeight: 600 }}>–</td>}
                  {viewType === 'shift' && <td style={{ fontWeight: 600 }}>–</td>}
                  {stationCums.map((f) => (
                    <td key={f.k} style={{ fontWeight: 700, color: 'var(--water)' }}>
                      {fmt(totals[f.k]?.sum, 2)}
                    </td>
                  ))}
                </tr>
                {kpiStats.uniqueDays > 1 && (
                  <tr>
                    <td className="l" style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '12px' }}>
                      AVG / DAY (CUM)
                    </td>
                    {viewType === 'shift' && <td></td>}
                    {viewType === 'shift' && <td></td>}
                    {stationCums.map((f) => {
                      const avg = (totals[f.k]?.sum || 0) / kpiStats.uniqueDays;
                      return (
                        <td key={f.k} style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '12px' }}>
                          {fmt(avg, 2)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
