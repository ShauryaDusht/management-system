import React, { useState, useMemo } from 'react';
import {
  TIME_SLOTS,
  CHILLERS,
  PANELS,
  WATER_METERS,
  LABELS,
  runningChillers,
  evaluateAlerts,
  deriveLogValues,
  shiftKey,
  PUMP_RATED_LIMITS,
} from '../config';
import HvacApi from '../hvacApi';
import ExportDropdown from '../../../components/ui/ExportDropdown';
import DailyPumpIconBar from './DailyPumpIconBar';

export default function DailyPlantStatus({
  logs = [],
  selectedDate,
  onDateChange,
  isSupervisor = false,
  isSupervisorOrEngineer = true,
  onNavigateToEdit,
}) {
  const [shiftFilter, setShiftFilter] = useState('');
  const [metricKey, setMetricKey] = useState('c5_dt');
  const [modalLog, setModalLog] = useState(null);

  // Derived filtered logs
  const dayLogs = useMemo(() => {
    return logs
      .map((l) => ({ ...l, v: deriveLogValues(l.v || {}) }))
      .sort((a, b) => a.slot - b.slot);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!shiftFilter) return dayLogs;
    return dayLogs.filter((l) => shiftKey(l) === shiftFilter);
  }, [dayLogs, shiftFilter]);

  const latestLog = dayLogs.length ? dayLogs[dayLogs.length - 1] : null;
  const running = latestLog ? runningChillers(latestLog.v) : [];

  // Alerts (includes pump rated limit alerts for Supervisor and Engineer)
  const allAlerts = useMemo(() => {
    return dayLogs.flatMap((l) =>
      evaluateAlerts(l.v, isSupervisorOrEngineer).map((msg) => ({ time: l.time, slot: l.slot, msg }))
    );
  }, [dayLogs, isSupervisorOrEngineer]);

  // Available metrics for the chart
  const availableMetrics = useMemo(() => {
    const keys = new Set();
    dayLogs.forEach((l) => {
      Object.keys(l.v).forEach((k) => {
        if (LABELS[k] && !k.endsWith('_st')) keys.add(k);
      });
    });
    return Array.from(keys);
  }, [dayLogs]);

  // Selected chart metric
  const activeMetric = availableMetrics.includes(metricKey)
    ? metricKey
    : availableMetrics[0] || 'c5_dt';

  // Chart data points
  const chartPoints = useMemo(() => {
    return filteredLogs
      .filter((l) => l.v[activeMetric] !== undefined && l.v[activeMetric] !== null)
      .map((l) => [l.slot, Number(l.v[activeMetric])]);
  }, [filteredLogs, activeMetric]);

  // Calculations: Energy Report
  const energyReport = useMemo(() => {
    const f2 = (x) => (x == null || isNaN(x) ? '–' : Number(x).toFixed(2));
    const panelsData = PANELS.map(([k, nm]) => {
      const records = dayLogs.filter((r) => r.v[`${k}_mwh`] !== undefined);
      if (!records.length) {
        return { name: nm, empty: true };
      }
      const open = records[0].v[`${k}_mwh`];
      const close = records[records.length - 1].v[`${k}_mwh`];
      const cons = Math.max(0, close - open);

      const amps = dayLogs.map((r) => r.v[`${k}_amp`]).filter((x) => x != null);
      const avgAmp = amps.length ? amps.reduce((a, b) => a + b, 0) / amps.length : null;

      const pfs = dayLogs.map((r) => r.v[`${k}_pf`]).filter((x) => x != null);
      const avgPf = pfs.length ? pfs.reduce((a, b) => a + b, 0) / pfs.length : null;

      return {
        key: k,
        name: nm,
        openTime: records[0].time,
        openMwh: open,
        closeTime: records[records.length - 1].time,
        closeMwh: close,
        consumption: cons,
        avgAmp: f2(avgAmp),
        avgPf: f2(avgPf),
      };
    });

    const totalCons = panelsData.reduce((acc, p) => acc + (p.consumption || 0), 0);

    // Shifts breakdown
    const shiftData = [1, 2, 3].map((s) => {
      const sLogs = dayLogs.filter((r) => shiftKey(r) === String(s));
      const p1Cons = sLogs.length && sLogs[sLogs.length - 1].v.pn1_mwh != null && sLogs[0].v.pn1_mwh != null
        ? Math.max(0, sLogs[sLogs.length - 1].v.pn1_mwh - sLogs[0].v.pn1_mwh)
        : null;
      const p2Cons = sLogs.length && sLogs[sLogs.length - 1].v.pn2_mwh != null && sLogs[0].v.pn2_mwh != null
        ? Math.max(0, sLogs[sLogs.length - 1].v.pn2_mwh - sLogs[0].v.pn2_mwh)
        : null;
      const sTot = (p1Cons || 0) + (p2Cons || 0);
      return { shift: `Shift ${s}`, p1: f2(p1Cons), p2: f2(p2Cons), total: f2(sTot) };
    });

    return { panels: panelsData, totalCons: f2(totalCons), shifts: shiftData };
  }, [dayLogs]);

  // Calculations: Water Report
  const waterReport = useMemo(() => {
    const f2 = (x) => (x == null || isNaN(x) ? '–' : Number(x).toFixed(2));
    const getVal = (v, k) => v[`${k}_kl`] ?? (k === 'wm3' ? v.wm_chilled_kl : undefined);

    const metersData = WATER_METERS.map(([k, nm]) => {
      const records = dayLogs.filter((r) => getVal(r.v, k) !== undefined);
      if (!records.length) {
        return { name: nm, empty: true };
      }
      const open = getVal(records[0].v, k);
      const close = getVal(records[records.length - 1].v, k);
      const cons = (close != null && open != null) ? Math.max(0, close - open) : null;
      const hrs = records[records.length - 1].slot - records[0].slot;
      const avgRate = hrs > 0 && cons != null ? cons / hrs : null;

      return {
        key: k,
        name: nm,
        openTime: records[0].time,
        openKl: open,
        closeTime: records[records.length - 1].time,
        closeKl: close,
        consumption: cons,
        avgRate: f2(avgRate),
      };
    });

    const totalWater = metersData.reduce((acc, m) => acc + (m.consumption || 0), 0);

    const shiftData = [1, 2, 3].map((s) => {
      const sLogs = dayLogs.filter((r) => shiftKey(r) === String(s));
      let sTot = 0;
      WATER_METERS.forEach(([k]) => {
        const cons = sLogs.length && getVal(sLogs[sLogs.length - 1].v, k) != null && getVal(sLogs[0].v, k) != null
          ? Math.max(0, getVal(sLogs[sLogs.length - 1].v, k) - getVal(sLogs[0].v, k))
          : null;
        if (cons != null) sTot += cons;
      });
      return { shift: `Shift ${s}`, total: f2(sTot) };
    });

    return { meters: metersData, totalWater: f2(totalWater), shifts: shiftData };
  }, [dayLogs]);

  // Export handlers
  const handleExportCsv = () => {
    const rows = [
      ['Date', selectedDate],
      ['Time', 'Shift', 'Operator', 'Set Point °C', 'Chillers On', 'Panel 1 MWh', 'Panel 2 MWh', 'Old Water kL', 'New Water kL', 'Chilled Water kL', 'Alerts Count'],
      ...dayLogs.map((l) => [
        l.time,
        `Shift ${shiftKey(l)}`,
        l.operator || '',
        l.setpoint ?? '',
        runningChillers(l.v).map((c) => c[1]).join('; '),
        l.v.pn1_mwh ?? '',
        l.v.pn2_mwh ?? '',
        l.v.wm1_kl ?? '',
        l.v.wm2_kl ?? '',
        l.v.wm3_kl ?? l.v.wm_chilled_kl ?? '',
        evaluateAlerts(l.v, isSupervisorOrEngineer).length,
      ]),
    ];
    HvacApi.exportCsv(`hvac_daily_log_${selectedDate}.csv`, rows);
  };

  const handleExportPdf = () => {
    const rows = [
      ['Time', 'Shift', 'Operator', 'SP °C', 'Chillers On', 'P1 MWh', 'P2 MWh', 'Old kL', 'New kL', 'Chilled kL', 'Alerts'],
      ...dayLogs.map((l) => [
        l.time,
        `Shift ${shiftKey(l)}`,
        l.operator || '',
        l.setpoint != null ? String(l.setpoint) : '–',
        runningChillers(l.v).map((c) => c[1]).join(', ') || 'None',
        l.v.pn1_mwh != null ? String(l.v.pn1_mwh) : '–',
        l.v.pn2_mwh != null ? String(l.v.pn2_mwh) : '–',
        l.v.wm1_kl != null ? String(l.v.wm1_kl) : '–',
        l.v.wm2_kl != null ? String(l.v.wm2_kl) : '–',
        l.v.wm3_kl != null ? String(l.v.wm3_kl) : (l.v.wm_chilled_kl != null ? String(l.v.wm_chilled_kl) : '–'),
        String(evaluateAlerts(l.v, isSupervisorOrEngineer).length),
      ]),
    ];
    HvacApi.exportPdf(`hvac_daily_log_${selectedDate}.pdf`, rows, `HVAC Plant Daily Log Report - ${selectedDate}`);
  };

  return (
    <div>
      {/* Top Controls Card */}
      <div className="hvac-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                style={{ padding: '6px 12px', fontWeight: 700, borderRadius: 8 }}
              />
            </label>

            <label style={{ margin: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Shift:</span>
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                style={{ padding: '6px 12px', fontWeight: 700, borderRadius: 8 }}
              >
                <option value="">All Shifts (24 Hrs)</option>
                <option value="1">Shift 1 (07:30 – 15:30)</option>
                <option value="2">Shift 2 (15:30 – 23:30)</option>
                <option value="3">Shift 3 (23:30 – 07:30)</option>
              </select>
            </label>
          </div>

          <div>
            <ExportDropdown
              label="Export Daily Log"
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
              disabled={dayLogs.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Demo Mode Notice Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14, 111, 143, 0.08), rgba(2, 132, 199, 0.12))',
        border: '1.5px solid rgba(2, 132, 199, 0.3)',
        borderRadius: 12,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>❄️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>HVAC Plant Simulation Running (Demo Mode Active)</span>
              <span style={{
                background: '#e0f2fe',
                color: '#0369a1',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 800,
                border: '1px solid #bae6fd',
              }}>
                LIVE TELEMETRY
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Active 24-hour continuous log dataset with 7 campus chillers (Trane 1-4, Carrier 5, Daikin 6-7), Panel 1 &amp; 2 energy, and water makeup meters.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
            Demo Logins: <code style={{ color: '#0369a1', fontWeight: 800 }}>hvac.engineer</code> / <code style={{ color: '#0369a1', fontWeight: 800 }}>hvac.operator</code> (pwd: <code style={{ color: '#0369a1', fontWeight: 800 }}>IITGN@2025</code>)
          </span>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="hvac-kpis">
        <div className="hvac-kpi-card">
          <span>Slots Logged</span>
          <b>{dayLogs.length} / 24</b>
          <small>{dayLogs.length === 24 ? 'All slots complete' : `${24 - dayLogs.length} slots remaining`}</small>
        </div>

        <div className="hvac-kpi-card">
          <span>Running Chillers</span>
          <b>{running.length ? running.map((c) => c[0]).join(', ') : 'None'}</b>
          <small>{running.length} units in active operation</small>
        </div>

        <div className="hvac-kpi-card">
          <span>Active Alerts</span>
          <b style={{ color: allAlerts.length ? '#ef4444' : '#10b981' }}>{allAlerts.length}</b>
          <small>{allAlerts.length ? 'Attention needed' : 'All parameters nominal'}</small>
        </div>

        <div className="hvac-kpi-card">
          <span>Latest Reading</span>
          <b>{latestLog ? latestLog.time : '–'}</b>
          <small>{latestLog ? `Operator: ${latestLog.operator}` : 'No readings yet'}</small>
        </div>

        <div className="hvac-kpi-card">
          <span>Total Energy Cons.</span>
          <b>{energyReport.totalCons} MWh</b>
          <small>Across Panel 1 & 2</small>
        </div>
      </div>

      {/* Chillers Status Tiles */}
      <div className="hvac-card">
        <div className="hvac-card-header">
          <div className="hvac-card-title">
            <span>Plant Chillers Telemetry ({CHILLERS.length} Installed Units)</span>
          </div>
          <span className="pill pill-blue">{running.length} Running</span>
        </div>

        <div className="hvac-tiles">
          {CHILLERS.map(([n, nm, tr]) => {
            const isRunning = running.some((c) => c[0] === n);
            const ein = latestLog?.v[`c${n}_evapIn`];
            const eout = latestLog?.v[`c${n}_evapOut`];
            const rla = latestLog?.v[`c${n}_rla`];
            const dt = (ein != null && eout != null) ? +(Number(ein) - Number(eout)).toFixed(2) : null;
            const isDtHigh = isRunning && dt != null && dt > 4.0;

            return (
              <div
                key={n}
                className={`hvac-tile ${isRunning ? 'on' : ''} ${isDtHigh ? 'alert-high-dt' : ''}`}
                style={isDtHigh ? { borderColor: '#ef4444', background: '#fff5f5' } : undefined}
              >
                <span className="dot"></span>
                <b>{nm}</b>
                <small>{tr} TR &middot; {isRunning ? 'Running' : 'Standby'}</small>
                {isRunning ? (
                  <div>
                    In {ein ?? '–'}° &rarr; Out {eout ?? '–'}°
                    {dt != null && (
                      <span style={{ fontWeight: 800, color: isDtHigh ? '#dc2626' : '#0369a1', marginLeft: 4 }}>
                        (Δ{dt}°)
                      </span>
                    )}
                    <br />
                    RLA: {rla ?? '–'}%
                    {isDtHigh && (
                      <div style={{ marginTop: 6 }}>
                        <span
                          className="pill pill-red"
                          style={{
                            fontSize: 10,
                            padding: '3px 7px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #f87171',
                          }}
                        >
                          🚨 High ΔT: {dt}°C (&gt; 4°C)
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--hvac-muted)' }}>Off</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend Through The Day (Custom SVG Chart) */}
      <div className="hvac-card">
        <div className="hvac-card-header">
          <div className="hvac-card-title">
            <span>Day Telemetry Trend Graph</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--hvac-muted)' }}>Select Parameter:</span>
            <select
              value={activeMetric}
              onChange={(e) => setMetricKey(e.target.value)}
              style={{ padding: '5px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8 }}
            >
              {availableMetrics.map((k) => (
                <option key={k} value={k}>
                  {LABELS[k] || k}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Graph Axis Guide */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '7px 14px',
            background: 'var(--hvac-bg, #f8fafc)',
            borderRadius: '8px',
            border: '1px solid var(--hvac-line, #e2e8f0)',
            fontSize: '12px',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontWeight: 700, color: '#0284c7' }}>📌 Graph Axis Labels:</span>
          <span>
            <strong style={{ color: 'var(--hvac-muted)' }}>X-Axis:</strong> Time of Reading (Hourly Time Slot)
          </span>
          <span style={{ color: 'var(--hvac-line)' }}>•</span>
          <span>
            <strong style={{ color: 'var(--hvac-muted)' }}>Y-Axis:</strong> {LABELS[activeMetric] || activeMetric}
          </span>
        </div>

        {chartPoints.length < 2 ? (
          <p style={{ textAlign: 'center', color: 'var(--hvac-muted)', padding: '30px 0' }}>
            Not enough data points recorded for {LABELS[activeMetric] || activeMetric} on this date.
          </p>
        ) : (
          (() => {
            const ys = chartPoints.map((p) => p[1]);
            const lo = Math.min(...ys);
            const hi = Math.max(...ys);
            const sp = hi - lo || 1;
            const X_ORIGIN = 85;
            const CHART_WIDTH = 515;
            const X = (s) => X_ORIGIN + s * (CHART_WIDTH / 23);
            const Y = (y) => 175 - ((y - lo) / sp) * 135;

            const polyPoints = `${X(chartPoints[0][0])},175 ` +
              chartPoints.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ') +
              ` ${X(chartPoints[chartPoints.length - 1][0])},175`;

            const linePoints = chartPoints.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');

            return (
              <div className="hvac-scroll">
                <svg viewBox="0 0 650 245" width="100%" style={{ minWidth: 540, height: 230 }}>
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Y-Axis Name (Rotated along vertical axis) */}
                  <text
                    transform="rotate(-90)"
                    x="-105"
                    y="22"
                    fontSize="11.5"
                    fill="var(--hvac-ink)"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    Y-Axis: {LABELS[activeMetric] || activeMetric}
                  </text>

                  {/* Axis lines */}
                  <line x1={X_ORIGIN} y1="175" x2={X_ORIGIN + CHART_WIDTH} y2="175" stroke="var(--hvac-line)" strokeWidth="1.5" />
                  <line x1={X_ORIGIN} y1="30" x2={X_ORIGIN} y2="175" stroke="var(--hvac-line)" strokeWidth="1.5" />

                  {/* Y values */}
                  <text x={X_ORIGIN - 8} y="34" fontSize="11" fill="var(--hvac-muted)" textAnchor="end" fontWeight="600">{hi.toFixed(1)}</text>
                  <text x={X_ORIGIN - 8} y="106" fontSize="11" fill="var(--hvac-muted)" textAnchor="end" fontWeight="600">{((hi + lo) / 2).toFixed(1)}</text>
                  <text x={X_ORIGIN - 8} y="179" fontSize="11" fill="var(--hvac-muted)" textAnchor="end" fontWeight="600">{lo.toFixed(1)}</text>

                  {/* Horizontal gridlines */}
                  <line x1={X_ORIGIN} y1="30" x2={X_ORIGIN + CHART_WIDTH} y2="30" stroke="var(--hvac-line)" strokeDasharray="3 4" />
                  <line x1={X_ORIGIN} y1="102" x2={X_ORIGIN + CHART_WIDTH} y2="102" stroke="var(--hvac-line)" strokeDasharray="3 4" />

                  {/* Gradient Area */}
                  <polygon points={polyPoints} fill="url(#chartGrad)" />

                  {/* Polyline */}
                  <polyline points={linePoints} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinejoin="round" />

                  {/* Points */}
                  {chartPoints.map((p, idx) => (
                    <circle key={idx} cx={X(p[0])} cy={Y(p[1])} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5">
                      <title>{TIME_SLOTS[p[0]]}: {p[1]}</title>
                    </circle>
                  ))}

                  {/* X Axis tick labels */}
                  {[0, 4, 8, 12, 16, 20, 23].map((s) => (
                    <text key={s} x={X(s)} y="196" fontSize="10.5" fill="var(--hvac-muted)" textAnchor="middle" fontWeight="600">
                      {TIME_SLOTS[s]}
                    </text>
                  ))}

                  {/* X-Axis Name */}
                  <text
                    x={X_ORIGIN + CHART_WIDTH / 2}
                    y="226"
                    fontSize="12"
                    fill="var(--hvac-ink)"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    X-Axis: Time of Reading (Hourly Time Slot)
                  </text>
                </svg>
              </div>
            );
          })()
        )}
      </div>

      {/* Daily Energy & Water Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18, marginBottom: 18 }}>
        {/* Energy Card */}
        <div className="hvac-card" style={{ margin: 0 }}>
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>⚡ Daily Energy Consumption (MWh)</span>
            </div>
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Panel</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Open MWh</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Close MWh</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Used MWh</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Avg Amp</th>
              </tr>
            </thead>
            <tbody>
              {energyReport.panels.map((p) => (
                <tr key={p.name} style={{ borderBottom: '1px solid var(--hvac-line)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.name}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.openMwh ?? '–'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.closeMwh ?? '–'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#0c2535' }}>
                    {p.consumption != null ? p.consumption.toFixed(2) : '–'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.avgAmp}</td>
                </tr>
              ))}
              <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                <td style={{ padding: '6px 8px' }}>Total Consumption</td>
                <td colSpan="2"></td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0284c7', fontSize: 13 }}>
                  {energyReport.totalCons} MWh
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Shift Breakdown:</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
              {energyReport.shifts.map((s) => (
                <div key={s.shift} style={{ background: '#f8fafc', border: '1px solid var(--hvac-line)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>{s.shift}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0c2535', marginTop: 2 }}>{s.total} MWh</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Water Card */}
        <div className="hvac-card" style={{ margin: 0 }}>
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>💧 Daily Water Consumption (kL = m³)</span>
            </div>
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Meter</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Open kL</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Close kL</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Used kL</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>kL / hr</th>
              </tr>
            </thead>
            <tbody>
              {waterReport.meters.map((m) => (
                <tr key={m.name} style={{ borderBottom: '1px solid var(--hvac-line)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{m.name}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.openKl ?? '–'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.closeKl ?? '–'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#0c2535' }}>
                    {m.consumption != null ? m.consumption.toFixed(2) : '–'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.avgRate}</td>
                </tr>
              ))}
              <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                <td style={{ padding: '6px 8px' }}>Total Water</td>
                <td colSpan="2"></td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0284c7', fontSize: 13 }}>
                  {waterReport.totalWater} kL
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Shift Breakdown:</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
              {waterReport.shifts.map((s) => (
                <div key={s.shift} style={{ background: '#f8fafc', border: '1px solid var(--hvac-line)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>{s.shift}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0c2535', marginTop: 2 }}>{s.total} kL</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pumps Operational & Rated Limit Status Daily Icon Bar (Supervisor & Engineer) */}
      {isSupervisorOrEngineer && (
        <DailyPumpIconBar
          dayLogs={dayLogs}
          selectedDate={selectedDate}
          isSupervisorOrEngineer={isSupervisorOrEngineer}
          onInspectSlot={(slot) => {
            const found = dayLogs.find((l) => l.slot === slot);
            if (found) setModalLog(found);
          }}
          onNavigateToEdit={onNavigateToEdit}
        />
      )}

      {/* Hourly Log Sheet Table */}
      <div className="hvac-card">
        <div className="hvac-card-header">
          <div className="hvac-card-title">
            <span>Hourly Shift Log Entries ({filteredLogs.length} Records)</span>
          </div>
          <small style={{ color: 'var(--hvac-muted)' }}>Click any row to inspect all parameters</small>
        </div>

        <div className="hvac-scroll">
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Time</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Shift</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Operator</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Set Point</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Chillers Running</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Panel 1 MWh</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Panel 2 MWh</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Alerts</th>
                {isSupervisor && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((l) => {
                const runChillers = runningChillers(l.v);
                const logAlerts = evaluateAlerts(l.v, isSupervisorOrEngineer);
                return (
                  <tr
                    key={l.id}
                    onClick={() => setModalLog(l)}
                    style={{
                      borderBottom: '1px solid var(--hvac-line)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 10px', fontWeight: 800 }}>{l.time}</td>
                    <td style={{ padding: '8px 10px' }}>Shift {shiftKey(l)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.operator || '–'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{l.setpoint != null ? `${l.setpoint}°C` : '–'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {runChillers.length ? runChillers.map((c) => c[1]).join(', ') : <span style={{ color: 'var(--hvac-muted)' }}>None</span>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{l.v.pn1_mwh ?? '–'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{l.v.pn2_mwh ?? '–'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {logAlerts.length > 0 ? (
                        <span className="pill pill-red">{logAlerts.length}</span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 800 }}>&check;</span>
                      )}
                    </td>
                    {isSupervisor && (
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToEdit?.(l.slot);
                          }}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11.5,
                            fontWeight: 700,
                            borderRadius: 6,
                            border: '1px solid #0284c7',
                            background: 'rgba(2,132,199,0.1)',
                            color: '#0284c7',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={`Edit ${l.time} reading`}
                        >
                          ✏️ Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={isSupervisor ? 9 : 8} style={{ padding: 24, textAlign: 'center', color: 'var(--hvac-muted)' }}>
                    No readings found for this date & shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog for detailed row inspect */}
      {modalLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setModalLog(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              maxWidth: 680,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hvac-line)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0c2535' }}>
                  {modalLog.date} &middot; {modalLog.time} (Shift {shiftKey(modalLog)})
                </h3>
                <small style={{ color: 'var(--hvac-muted)' }}>Logged by: {modalLog.operator} &middot; SP: {modalLog.setpoint ?? '–'}°C</small>
              </div>
              <button
                type="button"
                onClick={() => setModalLog(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Slot Alerts */}
            {evaluateAlerts(modalLog.v, isSupervisorOrEngineer).length > 0 && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 800, color: '#be123c', fontSize: 12.5, marginBottom: 6 }}>
                  ⚠️ Telemetry &amp; Pump Overload Alerts ({evaluateAlerts(modalLog.v, isSupervisorOrEngineer).length}):
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#9f1239', fontSize: 12, lineHeight: 1.5 }}>
                  {evaluateAlerts(modalLog.v, isSupervisorOrEngineer).map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(modalLog.v).map(([k, val]) => {
                    const isPumpA = k.endsWith('_a');
                    const isPumpV = k.endsWith('_v');
                    const baseKey = isPumpA ? k.slice(0, -2) : (isPumpV ? k.slice(0, -2) : null);
                    const limit = baseKey ? PUMP_RATED_LIMITS[baseKey] : null;
                    const isExceeded = limit && (
                      (isPumpA && Number(val) > limit.maxA) ||
                      (isPumpV && Number(val) > limit.maxV)
                    );

                    return (
                      <tr key={k} style={{ borderBottom: '1px solid var(--hvac-line)', background: isExceeded ? '#fff1f2' : 'transparent' }}>
                        <td style={{ padding: '6px 8px', color: isExceeded ? '#be123c' : 'var(--hvac-muted)', fontWeight: isExceeded ? 700 : 600 }}>
                          {LABELS[k] || k}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 800, textAlign: 'right', color: isExceeded ? '#e11d48' : '#0c2535' }}>
                          {String(val)}
                          {isExceeded && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, marginLeft: 6, color: '#be123c' }}>
                              (Exceeds {isPumpA ? `${limit.maxA} A` : `${limit.maxV} V`} rated limit)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              {isSupervisor && (
                <button
                  type="button"
                  onClick={() => {
                    const slotToEdit = modalLog.slot;
                    setModalLog(null);
                    onNavigateToEdit?.(slotToEdit);
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: '1px solid #0284c7',
                    background: '#0284c7',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ✏️ Edit This Slot
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalLog(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1.5px solid var(--hvac-line)',
                  background: '#f8fafc',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
