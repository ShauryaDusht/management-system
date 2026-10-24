import { useState, useEffect, useMemo } from 'react';
import { STATIONS, JMT } from '../config';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import { api } from '../api';
import ExportDropdown from '../../../components/ui/ExportDropdown';

export default function SupervisorDashboard({ rows = [], reload, user, onNavigateToTab }) {
  // Find latest date from rows or use today
  const latestDate = useMemo(() => {
    if (rows.length) return rows[rows.length - 1].date;
    return new Date().toISOString().slice(0, 10);
  }, [rows]);

  const [date, setDate] = useState(latestDate);
  const [overview, setOverview] = useState(null);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Sync date when latestDate changes initially
  useEffect(() => {
    if (latestDate) setDate(latestDate);
  }, [latestDate]);

  // Load supervisor overview for selected date
  const loadSupervisorData = async () => {
    try {
      const ov = await api.supervisorOverview(date);
      setOverview(ov);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSupervisorData();
  }, [date]);

  // Filter rows for current date
  const dayRows = useMemo(() => {
    return rows.filter((r) => r.date === date);
  }, [rows, date]);


  // Latest tank levels for current date
  const latestTankRow = useMemo(() => {
    return [...dayRows].reverse().find((r) => r.jm1 != null || r.jm2 != null) || {};
  }, [dayRows]);

  // Calculate Jalmandapam total capacity & current water volume
  const tankStats = useMemo(() => {
    let currentVol = 0;
    let totalCap = 0;
    for (let i = 1; i <= 5; i++) {
      const key = `jm${i}`;
      const conf = JMT[key] || { cap: 1400, h: 4 };
      totalCap += conf.cap;
      const h = Number(latestTankRow[key]);
      if (Number.isFinite(h)) {
        currentVol += Math.min(conf.cap, (h / conf.h) * conf.cap);
      }
    }
    const pct = totalCap ? Math.round((currentVol / totalCap) * 100) : 0;
    return { currentVol, totalCap, pct };
  }, [latestTankRow]);

  // Chemical totals for the selected day
  const chemicalTotals = useMemo(() => {
    let cl = 0;
    let alum = 0;
    for (const r of dayRows) {
      if (r.cl_wtp) cl += Number(r.cl_wtp);
      if (r.cl_stp) cl += Number(r.cl_stp);
      if (r.alum) alum += Number(r.alum);
    }
    return { cl, alum };
  }, [dayRows]);

  // Combined anomalies: server anomalies + dynamic tank overflow alerts (> 4.0 m)
  const activeAlerts = useMemo(() => {
    const list = [...(overview?.anomalies || [])];
    for (let i = 1; i <= 5; i++) {
      const key = `jm${i}`;
      const lvl = Number(latestTankRow[key]);
      if (Number.isFinite(lvl) && lvl > 4.0) {
        const text = `Jalmandap-${i} water level exceeded 4.0 m limit (${fmt(lvl, 2)} m) - Overfill Alert`;
        if (!list.some((a) => a.text.includes(`Jalmandap-${i}`) && a.text.includes('exceeded'))) {
          list.unshift({ type: 'danger', text });
        }
      }
    }
    return list;
  }, [overview, latestTankRow]);

  // Export engineer report
  const exportLog = () => {
    const headers = ['Date', 'Shift', 'Station', 'Entered By', 'Verification Status', 'Engineer Remarks'];
    const dataRows = (overview?.readings || []).map((r) => [
      r.date,
      `Shift ${r.shift}`,
      r.station.toUpperCase(),
      r.by || '–',
      r.status || 'pending',
      r.supervisorNote || '–',
    ]);
    downloadCsv(`engineer-log-${date}.csv`, [headers, ...dataRows]);
  };

  const exportPdfLog = () => {
    const headers = ['Date', 'Shift', 'Station', 'Entered By', 'Verification Status', 'Engineer Remarks'];
    const dataRows = (overview?.readings || []).map((r) => [
      r.date,
      `Shift ${r.shift}`,
      r.station.toUpperCase(),
      r.by || '–',
      r.status || 'pending',
      r.supervisorNote || '–',
    ]);
    downloadPdf(`engineer-log-${date}.pdf`, [headers, ...dataRows], `WTP/STP Shift Engineer Log (${date})`);
  };

  return (
    <div className="supervisor-section">
      {/* Header controls & date navigation */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Tank Monitoring</h2>
            <p className="muted" style={{ margin: 0, fontSize: '13px' }}>Shift oversight, tank levels & verification</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: '12px' }}>Date:</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '6px 10px', width: 'auto' }} />
          </label>

          <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onNavigateToTab && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigateToTab('enter')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: 'var(--water)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span>✏️</span> Edit
              </button>
            )}
            <ExportDropdown label="Export File" onExportCsv={exportLog} onExportPdf={exportPdfLog} />
          </div>
        </div>
      </div>

      {msg.text && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      {/* Operational KPI summary */}
      <div className="kpis">
        <div className="kpi">
          <span>Date & Compliance</span>
          <b>{date}</b>
          <small className="muted">{dayRows.length ? `${dayRows.length} shift entries` : 'No entries yet'}</small>
        </div>

        <div className="kpi">
          <span>Jalmandapam Storage</span>
          <b>{fmt(tankStats.currentVol, 0)} <span style={{ fontSize: '14px' }}>/ {fmt(tankStats.totalCap, 0)} CUM</span></b>
          <div style={{ background: 'var(--line)', height: '6px', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--water)', width: `${tankStats.pct}%`, height: '100%' }} />
          </div>
          <small className="muted">{tankStats.pct}% full</small>
        </div>

        <div className="kpi">
          <span>Treated Water (Shift)</span>
          <b>{fmt([...dayRows].reverse().find((r) => r.c != null)?.c, 0)} <span style={{ fontSize: '13px' }}>CUM</span></b>
          <small className="muted">After treatment flow</small>
        </div>

        <div className="kpi">
          <span>Water Quality</span>
          <b>pH {fmt([...dayRows].reverse().find((r) => r.d != null)?.d, 2) || '–'}</b>
          <small className="muted">Turbidity: {fmt([...dayRows].reverse().find((r) => r.e != null)?.e, 2) || '–'} NTU</small>
        </div>

        <div className="kpi">
          <span>Chemicals Used Today</span>
          <b>{fmt(chemicalTotals.cl, 1)} <span style={{ fontSize: '13px' }}>kg Cl₂</span></b>
          <small className="muted">{fmt(chemicalTotals.alum, 1)} kg Alum</small>
        </div>
      </div>

      {/* Anomaly & Safety Warnings banner */}
      {activeAlerts.length > 0 && (
        <div className="card" style={{
          borderColor: activeAlerts.some((a) => a.type === 'danger') ? '#dc2626' : 'var(--amber)',
          background: activeAlerts.some((a) => a.type === 'danger') ? 'color-mix(in srgb, #dc2626 10%, var(--card))' : 'color-mix(in srgb, var(--amber) 8%, var(--card))',
          marginBottom: '14px',
        }}>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: '14px',
            color: activeAlerts.some((a) => a.type === 'danger') ? '#dc2626' : 'var(--amber)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>⚠️</span> Active Operational Alerts ({activeAlerts.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
            {activeAlerts.map((a, idx) => (
              <li key={idx} style={{
                marginBottom: '4px',
                color: a.type === 'danger' ? '#dc2626' : 'inherit',
                fontWeight: a.type === 'danger' ? 600 : 'normal',
              }}>
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Jalmandapam Tank Levels Gauge Section */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Jalmandapam Real-Time Tank Monitoring</span>
          <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>Tank Capacity: 4.0 m</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '12px' }}>
          {[1, 2, 3, 4, 5].map((num) => {
            const key = `jm${num}`;
            const conf = JMT[key] || { cap: 1400, h: 4 };
            const lvl = Number(latestTankRow[key]);
            const hasLvl = Number.isFinite(lvl);
            const height = hasLvl ? lvl : 0;
            const pct = Math.min(100, Math.round((height / (conf.h || 4)) * 100));
            const cum = hasLvl ? Math.round((height / (conf.h || 4)) * conf.cap) : 0;
            const isLow = hasLvl && height < 1.0;
            const isExceeded = hasLvl && height > 4.0;
            const isNearFull = hasLvl && height >= 3.8 && !isExceeded;

            return (
              <div key={key} style={{
                background: 'var(--field)',
                border: isExceeded ? '1px solid #dc2626' : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Jalmandap-{num}</strong>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: isExceeded ? '#dc2626' : isLow ? 'var(--amber)' : isNearFull ? 'var(--water)' : 'var(--ok)',
                    color: '#fff',
                    fontWeight: 600,
                  }}>
                    {isExceeded ? 'EXCEEDED (> 4m)' : isLow ? 'LOW' : isNearFull ? 'NEAR FULL' : 'NORMAL'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 600, color: isExceeded ? '#dc2626' : 'inherit' }}>
                    {hasLvl ? `${fmt(height, 2)} m` : '–'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    / 4.0 m
                  </span>
                </div>

                {/* Vertical-like fill meter */}
                <div style={{ height: '8px', background: 'var(--line)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, pct)}%`,
                    background: isExceeded ? '#dc2626' : isLow ? 'var(--amber)' : 'var(--water)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>{fmt(cum, 0)} CUM</span>
                  <span style={{ fontWeight: 500, color: isExceeded ? '#dc2626' : 'var(--ink)' }}>
                    {isExceeded ? `Exceeded 4 m (${pct}%)` : `Capacity: 4 m (${pct}%)`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
