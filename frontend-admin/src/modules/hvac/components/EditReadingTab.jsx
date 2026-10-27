import React, { useState, useEffect, useMemo } from 'react';
import {
  TIME_SLOTS,
  CHILLERS,
  PUMP_GROUPS,
  PUMP_RATED_LIMITS,
  COOLING_TOWERS,
  PANELS,
  WATER_METERS,
  evaluateAlerts,
} from '../config';
import HvacApi from '../hvacApi';

export default function EditReadingTab({
  selectedDate,
  onDateChange,
  initialSlot = 0,
  logs = [],
  onSaved,
  isOperator = false,
  isSupervisorOrEngineer = false,
  user = null,
}) {
  const [slot, setSlot] = useState(initialSlot);
  const [operator, setOperator] = useState('');
  const [setpoint, setSetpoint] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Section 2 & 3 open/collapse state
  const [pumpsSectionOpen, setPumpsSectionOpen] = useState(true);
  const [towersSectionOpen, setTowersSectionOpen] = useState(true);
  const [openPumpGroups, setOpenPumpGroups] = useState({ pri: true, sec: true, con: true });

  const runningPumpsCount = useMemo(() => {
    let count = 0;
    PUMP_GROUPS.forEach(([grpKey, , pumpList]) => {
      pumpList.forEach((pName) => {
        const k = grpKey + pName.replace(/\s+/g, '');
        if (values[k] === 'on') count++;
      });
    });
    return count;
  }, [values]);

  const totalPumpsCount = useMemo(() => {
    return PUMP_GROUPS.reduce((acc, [, , list]) => acc + list.length, 0);
  }, []);

  const runningTowersCount = useMemo(() => {
    return COOLING_TOWERS.filter(([ctKey]) => values[ctKey] === 'on').length;
  }, [values]);

  useEffect(() => {
    if (initialSlot !== undefined && initialSlot !== null && initialSlot >= 0 && initialSlot < 24) {
      setSlot(initialSlot);
    }
  }, [initialSlot]);

  // Time & shift for active slot
  const time = TIME_SLOTS[slot] || '07:30';
  const shift = String(Math.floor(slot / 8) + 1);

  // Map of existing logs for this date by slot
  const slotLogsMap = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      map[l.slot] = l;
    });
    return map;
  }, [logs]);

  // Telemetry and pump alerts for active slot (Supervisor & Engineer)
  const currentSlotAlerts = useMemo(() => {
    return evaluateAlerts(values, isSupervisorOrEngineer);
  }, [values, isSupervisorOrEngineer]);

  // When selectedDate or slot changes, populate form with existing data if present
  useEffect(() => {
    const existing = slotLogsMap[slot];
    if (existing) {
      setOperator(existing.operator || '');
      setSetpoint(existing.setpoint != null ? String(existing.setpoint) : '');
      setValues(existing.v || existing.values || {});
    } else {
      const defaultOp = user?.get_full_name || user?.name || user?.username || (isOperator ? 'HVAC Operator' : 'Shift Engineer');
      setOperator(defaultOp);
      setSetpoint('');
      setValues({});
    }
    setMsg(null);
  }, [selectedDate, slot, slotLogsMap, isOperator, user]);

  const handleValChange = (key, val) => {
    setValues((prev) => {
      const copy = { ...prev };
      if (val === '' || val === null || val === undefined) {
        delete copy[key];
        if (key === 'wm3_kl') delete copy['wm_chilled_kl'];
      } else {
        copy[key] = val;
        if (key === 'wm3_kl') copy['wm_chilled_kl'] = val;
      }
      return copy;
    });
  };

  const handleTogglePump = (key) => {
    setValues((prev) => {
      const curr = prev[key];
      const next = curr === 'on' ? 'off' : 'on';
      return { ...prev, [key]: next };
    });
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      const defaultOp = user?.get_full_name || user?.name || user?.username || (isOperator ? 'HVAC Operator' : 'Shift Engineer');
      const cleanOperator = operator.trim() || defaultOp;
      const cleanV = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) {
          const num = Number(v);
          cleanV[k] = !Number.isNaN(num) && typeof v !== 'boolean' && v !== 'on' && v !== 'off' ? num : v;
        }
      });

      const payload = {
        date: selectedDate,
        time,
        slot,
        shift,
        operator: cleanOperator,
        setpoint: setpoint ? Number(setpoint) : null,
        v: cleanV,
      };

      await HvacApi.saveLog(payload);
      setMsg({ type: 'success', text: `Saved readings for ${time} (${selectedDate}) successfully!` });
      onSaved?.();
    } catch (err) {
      console.error('Error saving HVAC log:', err);
      setMsg({ type: 'error', text: err?.response?.data?.error || err.message || 'Failed to save readings.' });
    } finally {
      setSaving(false);
    }
  };

  const existingEntry = slotLogsMap[slot];
  const editWindowInfo = useMemo(() => {
    if (!existingEntry || !isOperator) return { active: false, expired: false, minutesRemaining: 0, secondsRemaining: 0 };
    const ts = existingEntry.createdAt ? new Date(existingEntry.createdAt).getTime() : (existingEntry.ts || 0);
    if (!ts) return { active: false, expired: true, minutesRemaining: 0, secondsRemaining: 0 };
    const diffMs = Date.now() - ts;
    const windowMs = 10 * 60 * 1000;
    if (diffMs > windowMs) {
      return { active: false, expired: true, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const remSec = Math.max(0, Math.floor((windowMs - diffMs) / 1000));
    const remMin = Math.max(1, Math.ceil(remSec / 60));
    return { active: true, expired: false, minutesRemaining: remMin, secondsRemaining: remSec };
  }, [existingEntry, isOperator]);

  const isLockedForOperator = isOperator && Boolean(existingEntry) && editWindowInfo.expired;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Banner Card: Date, Slot & Status */}
      <div className="hvac-card" style={{ borderLeft: `4px solid ${isOperator ? '#10b981' : '#0284c7'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{isOperator ? '📝' : '✏️'}</span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0c2535' }}>
                {isOperator ? 'HVAC Operator · Hourly Log Entry' : 'HVAC Engineer · Edit & Record Slot Readings'}
              </h2>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--hvac-muted)' }}>
              {isOperator
                ? 'Central AC & Chiller Operations • Record hourly slot telemetry for Chillers, Pumps, Cooling Towers & Meters'
                : 'Authorized Shift Engineer Revision Mode • Select date and hourly slot to update telemetry'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>
                Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange?.(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1.5px solid var(--hvac-line)',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              />
            </div>
            <div style={{ marginTop: 14 }}>
              {existingEntry ? (
                <span className="pill pill-green" style={{ fontSize: 12 }}>✓ Saved Log</span>
              ) : (
                <span className="pill pill-orange" style={{ fontSize: 12 }}>New Slot</span>
              )}
            </div>
          </div>
        </div>

        {/* 24-Hour Slot Selector Strip */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--hvac-muted)', marginBottom: 6 }}>
            Select Time Slot (24h):
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {TIME_SLOTS.map((t, idx) => {
              const hasLog = Boolean(slotLogsMap[idx]);
              const isActive = idx === slot;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSlot(idx)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: isActive ? '2px solid #0284c7' : '1px solid var(--hvac-line)',
                    background: isActive ? '#0284c7' : hasLog ? '#f0fdf4' : '#ffffff',
                    color: isActive ? '#ffffff' : hasLog ? '#166534' : 'var(--hvac-text)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{t}</span>
                  {hasLog && <span style={{ fontSize: 8, color: isActive ? '#fff' : '#10b981' }}>●</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
            border: `1.5px solid ${msg.type === 'success' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          {msg.text}
        </div>
      )}

      {isLockedForOperator && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            background: '#fffbeb',
            color: '#92400e',
            border: '1.5px solid #fde68a',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🔒</span>
          <div>
            <div style={{ fontWeight: 800 }}>Locked (Read-Only Mode)</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
              The 10-minute operator edit window has expired for this slot. If any corrections are needed, please contact the Shift Engineer.
            </div>
          </div>
        </div>
      )}

      {isOperator && existingEntry && editWindowInfo.active && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            background: '#f0fdf4',
            color: '#166534',
            border: '1.5px solid #86efac',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⏱️</span>
            <div>
              <div style={{ fontWeight: 800 }}>10-Minute Editable Window Active</div>
              <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                Reading logged by <b>{existingEntry.operator || 'Operator'}</b>. You have 10 minutes from creation to update/correct values.
              </div>
            </div>
          </div>
          <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 800 }}>
            {editWindowInfo.minutesRemaining} min remaining
          </span>
        </div>
      )}

      {/* Active Alerts for this Slot (Supervisor & Engineer Portal Only) */}
      {currentSlotAlerts.length > 0 && isSupervisorOrEngineer && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fff1f2',
            border: '1.5px solid #fecdd3',
          }}
        >
          <div style={{ fontWeight: 800, color: '#be123c', fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span>
            <span>Active Telemetry &amp; Pump Rated Limit Warnings ({currentSlotAlerts.length})</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#9f1239', fontSize: 12, lineHeight: 1.5 }}>
            {currentSlotAlerts.map((a, idx) => (
              <li key={idx}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Entry Form */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Slot Metadata Card */}
        <div className="hvac-card">
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>Slot Parameters ({time} &bull; Shift {shift})</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Operator / Recorded By
              </label>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Staff / Engineer Name"
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1.5px solid var(--hvac-line)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Chilled Water Setpoint (°C)
              </label>
              <input
                type="number"
                step="any"
                value={setpoint}
                onChange={(e) => setSetpoint(e.target.value)}
                placeholder="e.g. 7.0"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1.5px solid var(--hvac-line)',
                  fontSize: 13,
                }}
              />
            </div>
          </div>
        </div>

        {/* 1. Chillers (7 Units) */}
        <div className="hvac-card">
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>1. Chillers (7 Units)</span>
            </div>
            <small style={{ color: 'var(--hvac-muted)' }}>Status, % RLA, Evaporator & Condenser telemetry</small>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CHILLERS.map(([num, name, tr]) => {
              const prefix = `c${num}_`;
              const status = values[`${prefix}st`] || '';
              const rla = values[`${prefix}rla`] ?? '';
              const evapIn = values[`${prefix}evapIn`] ?? '';
              const evapOut = values[`${prefix}evapOut`] ?? '';
              const evapP = values[`${prefix}evapP`] ?? '';
              const condIn = values[`${prefix}condIn`] ?? '';
              const condOut = values[`${prefix}condOut`] ?? '';
              const condP = values[`${prefix}condP`] ?? '';
              const drift = values[`${prefix}drift`] ?? '';
              const oilP = values[`${prefix}oilP`] ?? '';

              const isRunning = status === 'on' || evapOut !== '';

              const dt = (evapIn !== '' && evapOut !== '' && evapIn != null && evapOut != null)
                ? +(Number(evapIn) - Number(evapOut)).toFixed(2)
                : null;
              const isDtHigh = (isRunning || rla !== '') && dt !== null && dt > 4.0;

              return (
                <details
                  key={num}
                  open={isRunning || rla !== '' || isDtHigh}
                  style={{
                    border: isDtHigh ? '2px solid #ef4444' : '1.5px solid var(--hvac-line)',
                    borderRadius: 10,
                    padding: 12,
                    background: isDtHigh ? '#fff5f5' : isRunning ? '#f8fafc' : '#ffffff',
                    transition: 'all 0.2s',
                  }}
                >
                  <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{name} ({tr} TR)</span>
                      {dt !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: isDtHigh ? '#dc2626' : '#0369a1' }}>
                          ΔT: {dt}°C
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isRunning ? (
                        <span className="pill pill-green" style={{ fontSize: 11 }}>Running</span>
                      ) : (
                        <span className="pill pill-gray" style={{ fontSize: 11 }}>Standby</span>
                      )}
                      {isDtHigh && (
                        <span
                          className="pill pill-red"
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #f87171',
                          }}
                        >
                          🚨 High ΔT (&gt; 4°C)
                        </span>
                      )}
                    </div>
                  </summary>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                    {isDtHigh && (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          background: '#fee2e2',
                          border: '1.5px solid #ef4444',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: '#991b1b',
                          fontSize: 12,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>🚨</span>
                        <div>
                          <b>High Delta T Alert:</b> Entering ({evapIn}°C) &minus; Leaving ({evapOut}°C) = {dt}°C exceeds the 4.0°C limit. Please verify chilled water flow and setpoint.
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Status</label>
                      <select
                        value={status}
                        onChange={(e) => handleValChange(`${prefix}st`, e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      >
                        <option value="">-- Standby --</option>
                        <option value="on">🟢 Running</option>
                        <option value="off">⚪ Off</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>% RLA</label>
                      <input
                        type="number"
                        step="any"
                        value={rla}
                        onChange={(e) => handleValChange(`${prefix}rla`, e.target.value)}
                        placeholder="e.g. 52.4"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Evap In (°C)</label>
                      <input
                        type="number"
                        step="any"
                        value={evapIn}
                        onChange={(e) => handleValChange(`${prefix}evapIn`, e.target.value)}
                        placeholder="10.2"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Evap Out (°C)</label>
                      <input
                        type="number"
                        step="any"
                        value={evapOut}
                        onChange={(e) => handleValChange(`${prefix}evapOut`, e.target.value)}
                        placeholder="6.8"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Evap P (kPa)</label>
                      <input
                        type="number"
                        step="any"
                        value={evapP}
                        onChange={(e) => handleValChange(`${prefix}evapP`, e.target.value)}
                        placeholder="350"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Cond In (°C)</label>
                      <input
                        type="number"
                        step="any"
                        value={condIn}
                        onChange={(e) => handleValChange(`${prefix}condIn`, e.target.value)}
                        placeholder="28.4"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Cond Out (°C)</label>
                      <input
                        type="number"
                        step="any"
                        value={condOut}
                        onChange={(e) => handleValChange(`${prefix}condOut`, e.target.value)}
                        placeholder="33.1"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Cond P (kPa)</label>
                      <input
                        type="number"
                        step="any"
                        value={condP}
                        onChange={(e) => handleValChange(`${prefix}condP`, e.target.value)}
                        placeholder="840"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Refrig Diff (kPa)</label>
                      <input
                        type="number"
                        step="any"
                        value={drift}
                        onChange={(e) => handleValChange(`${prefix}drift`, e.target.value)}
                        placeholder="180"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>Oil Press (kPa)</label>
                      <input
                        type="number"
                        step="any"
                        value={oilP}
                        onChange={(e) => handleValChange(`${prefix}oilP`, e.target.value)}
                        placeholder="520"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {/* 2. Pumps Status & Telemetry */}
        <details
          open={pumpsSectionOpen}
          className="hvac-card"
          style={{ transition: 'all 0.2s', padding: pumpsSectionOpen ? 18 : '14px 18px' }}
        >
          <summary
            onClick={(e) => {
              e.preventDefault();
              setPumpsSectionOpen((prev) => !prev);
            }}
            className="hvac-card-header"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: pumpsSectionOpen ? 14 : 0,
            }}
          >
            <div className="hvac-card-title">
              <span style={{ fontSize: 13, transform: pumpsSectionOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
                ▶
              </span>
              <span>2. Pumps Operational Status</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="pill pill-green" style={{ fontSize: 11, fontWeight: 700 }}>
                {runningPumpsCount} / {totalPumpsCount} Running
              </span>
              <small style={{ color: 'var(--hvac-muted)', fontSize: 12 }}>
                {pumpsSectionOpen ? 'Click to collapse' : 'Click to open section'}
              </small>
            </div>
          </summary>

          {pumpsSectionOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {PUMP_GROUPS.map(([grpKey, grpLabel, pumpList]) => {
                const isGroupOpen = openPumpGroups[grpKey] ?? true;
                const groupRunningCount = pumpList.filter((pName) => {
                  const k = grpKey + pName.replace(/\s+/g, '');
                  return values[k] === 'on';
                }).length;

                return (
                  <details
                    key={grpKey}
                    open={isGroupOpen}
                    style={{
                      border: '1.5px solid var(--hvac-line)',
                      borderRadius: 10,
                      padding: 12,
                      background: '#ffffff',
                      transition: 'all 0.2s',
                    }}
                  >
                    <summary
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenPumpGroups((prev) => ({ ...prev, [grpKey]: !(prev[grpKey] ?? true) }));
                      }}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        listStyle: 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 800,
                        marginBottom: isGroupOpen ? 10 : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, transform: isGroupOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', color: 'var(--hvac-teal)' }}>
                          ▶
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--hvac-teal)' }}>
                          {grpLabel} Pumps ({pumpList.length} Units)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={groupRunningCount > 0 ? 'pill pill-green' : 'pill pill-gray'} style={{ fontSize: 10.5 }}>
                          {groupRunningCount} / {pumpList.length} Running
                        </span>
                        <small style={{ fontSize: 11, color: 'var(--hvac-muted)' }}>
                          {isGroupOpen ? 'Collapse' : 'Expand'}
                        </small>
                      </div>
                    </summary>

                    {isGroupOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Quick Toggle Status Strip */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', marginBottom: 6 }}>
                            Quick Status Toggle (click to toggle On / Off):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {pumpList.map((pName) => {
                              const k = grpKey + pName.replace(/\s+/g, '');
                              const isOn = values[k] === 'on';
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  disabled={isLockedForOperator}
                                  onClick={() => handleTogglePump(k)}
                                  style={{
                                    padding: '5px 11px',
                                    borderRadius: 6,
                                    border: isOn ? '1.5px solid #16a34a' : '1px solid var(--hvac-line)',
                                    background: isOn ? '#dcfce7' : '#f8fafc',
                                    color: isOn ? '#166534' : 'var(--hvac-muted)',
                                    fontWeight: 700,
                                    fontSize: 11.5,
                                    cursor: isLockedForOperator ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <span>{isOn ? '🟢' : '⚪'}</span>
                                  <span>{pName}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Pump Telemetry Cards Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                          {pumpList.map((pName) => {
                            const k = grpKey + pName.replace(/\s+/g, '');
                            const isOn = values[k] === 'on';
                            const limit = PUMP_RATED_LIMITS[k];
                            const vVal = values[`${k}_v`] ?? '';
                            const aVal = values[`${k}_a`] ?? '';
                            const isOverAmp = limit?.maxA && aVal !== '' && Number(aVal) >= limit.maxA;
                            const isOverVolt = limit?.maxV && vVal !== '' && Number(vVal) >= limit.maxV;

                            return (
                              <div
                                key={k}
                                style={{
                                  background: (isOverAmp || isOverVolt) ? '#fff1f2' : isOn ? '#f0fdf4' : '#f8fafc',
                                  padding: 10,
                                  borderRadius: 8,
                                  border: (isOverAmp || isOverVolt)
                                    ? '1.5px solid #ef4444'
                                    : isOn
                                    ? '1.5px solid #86efac'
                                    : '1px solid var(--hvac-line)',
                                  transition: 'all 0.2s',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0c2535' }}>
                                    {pName.startsWith('NA') ? `${grpLabel} ${pName}` : `${grpLabel} Pump ${pName}`}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isLockedForOperator}
                                    onClick={() => handleTogglePump(k)}
                                    style={{
                                      border: 'none',
                                      background: isOn ? '#dcfce7' : '#e2e8f0',
                                      color: isOn ? '#166534' : '#64748b',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      cursor: isLockedForOperator ? 'not-allowed' : 'pointer',
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <span>{isOn ? '🟢 Running' : '⚪ Standby'}</span>
                                  </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  <div>
                                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--hvac-muted)' }}>
                                      Volts (V)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      disabled={isLockedForOperator}
                                      value={vVal}
                                      onChange={(e) => handleValChange(`${k}_v`, e.target.value)}
                                      placeholder="415"
                                      style={{
                                        width: '100%',
                                        padding: '5px 7px',
                                        borderRadius: 6,
                                        border: isOverVolt ? '1.5px solid #ef4444' : '1px solid var(--hvac-line)',
                                        fontSize: 12,
                                        background: isLockedForOperator ? '#f1f5f9' : '#ffffff',
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--hvac-muted)' }}>
                                      Current (A)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      disabled={isLockedForOperator}
                                      value={aVal}
                                      onChange={(e) => handleValChange(`${k}_a`, e.target.value)}
                                      placeholder={limit?.maxA ? String(limit.maxA) : '21.5'}
                                      style={{
                                        width: '100%',
                                        padding: '5px 7px',
                                        borderRadius: 6,
                                        border: isOverAmp ? '1.5px solid #ef4444' : '1px solid var(--hvac-line)',
                                        fontSize: 12,
                                        background: isLockedForOperator ? '#f1f5f9' : '#ffffff',
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </details>

        {/* 3. Cooling Towers */}
        <details
          open={towersSectionOpen}
          className="hvac-card"
          style={{ transition: 'all 0.2s', padding: towersSectionOpen ? 18 : '14px 18px' }}
        >
          <summary
            onClick={(e) => {
              e.preventDefault();
              setTowersSectionOpen((prev) => !prev);
            }}
            className="hvac-card-header"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: towersSectionOpen ? 14 : 0,
            }}
          >
            <div className="hvac-card-title">
              <span style={{ fontSize: 13, transform: towersSectionOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
                ▶
              </span>
              <span>3. Cooling Towers</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="pill pill-blue" style={{ fontSize: 11, fontWeight: 700 }}>
                {runningTowersCount} / {COOLING_TOWERS.length} Running
              </span>
              <small style={{ color: 'var(--hvac-muted)', fontSize: 12 }}>
                {towersSectionOpen ? 'Click to collapse' : 'Click to open section'}
              </small>
            </div>
          </summary>

          {towersSectionOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Quick Toggle Status Strip */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', marginBottom: 6 }}>
                  Quick Status Toggle (click to toggle operational status):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COOLING_TOWERS.map(([ctKey, ctName]) => {
                    const isOn = values[ctKey] === 'on';
                    return (
                      <button
                        key={ctKey}
                        type="button"
                        disabled={isLockedForOperator}
                        onClick={() => handleTogglePump(ctKey)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: isOn ? '1.5px solid #0284c7' : '1px solid var(--hvac-line)',
                          background: isOn ? '#e0f2fe' : '#f8fafc',
                          color: isOn ? '#0369a1' : 'var(--hvac-muted)',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: isLockedForOperator ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span>{isOn ? '🟢' : '⚪'}</span>
                        <span>{ctName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Individual Cooling Towers with Fan Telemetry */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {COOLING_TOWERS.map(([ctKey, ctName, fanCount = 2]) => {
                  const isOn = values[ctKey] === 'on';
                  return (
                    <div
                      key={ctKey}
                      style={{
                        background: isOn ? '#f0f9ff' : '#f8fafc',
                        border: isOn ? '1.5px solid #7dd3fc' : '1px solid var(--hvac-line)',
                        borderRadius: 8,
                        padding: 10,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0c2535' }}>
                          {ctName}
                        </span>
                        <button
                          type="button"
                          disabled={isLockedForOperator}
                          onClick={() => handleTogglePump(ctKey)}
                          style={{
                            border: 'none',
                            background: isOn ? '#e0f2fe' : '#e2e8f0',
                            color: isOn ? '#0369a1' : '#64748b',
                            padding: '2px 8px',
                            borderRadius: 4,
                            cursor: isLockedForOperator ? 'not-allowed' : 'pointer',
                            fontSize: 10.5,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span>{isOn ? '🟢 Running' : '⚪ Standby'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fanCount > 2 ? 2 : fanCount}, 1fr)`, gap: 6 }}>
                        {Array.from({ length: fanCount }, (_, idx) => {
                          const fNum = idx + 1;
                          const fKey = `${ctKey}_f${fNum}`;
                          return (
                            <div key={fKey}>
                              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--hvac-muted)' }}>
                                Fan {fNum} (A)
                              </label>
                              <input
                                type="number"
                                step="any"
                                disabled={isLockedForOperator}
                                value={values[fKey] ?? ''}
                                onChange={(e) => handleValChange(fKey, e.target.value)}
                                placeholder="e.g. 18.2"
                                style={{
                                  width: '100%',
                                  padding: '5px 7px',
                                  borderRadius: 6,
                                  border: '1px solid var(--hvac-line)',
                                  fontSize: 12,
                                  background: isLockedForOperator ? '#f1f5f9' : '#ffffff',
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </details>

        {/* 4. Electrical Panels & Water Meters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {/* Main Incomer Panels */}
          <div className="hvac-card" style={{ margin: 0 }}>
            <div className="hvac-card-title" style={{ marginBottom: 10 }}>
              <span>4. Main Power Panels (MWh)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PANELS.map(([pKey, pLabel]) => (
                <div key={pKey} style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid var(--hvac-line)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0c2535', marginBottom: 6 }}>{pLabel}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hvac-muted)' }}>Energy (MWh)</label>
                      <input
                        type="number"
                        step="any"
                        value={values[`${pKey}_mwh`] ?? ''}
                        onChange={(e) => handleValChange(`${pKey}_mwh`, e.target.value)}
                        placeholder="e.g. 1420.5"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hvac-muted)' }}>Power Factor</label>
                      <input
                        type="number"
                        step="any"
                        value={values[`${pKey}_pf`] ?? ''}
                        onChange={(e) => handleValChange(`${pKey}_pf`, e.target.value)}
                        placeholder="0.98"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Water Meters */}
          <div className="hvac-card" style={{ margin: 0 }}>
            <div className="hvac-card-title" style={{ marginBottom: 10 }}>
              <span>5. Cooling Tower Makeup Water (kL)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {WATER_METERS.map(([wmKey, wmLabel]) => (
                <div key={wmKey} style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid var(--hvac-line)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0c2535', marginBottom: 6 }}>{wmLabel}</div>
                  <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hvac-muted)' }}>Cumulative Reading (kL)</label>
                    <input
                      type="number"
                      step="any"
                      value={values[`${wmKey}_kl`] ?? (wmKey === 'wm3' ? (values.wm_chilled_kl ?? '') : '')}
                      onChange={(e) => handleValChange(`${wmKey}_kl`, e.target.value)}
                      placeholder="e.g. 8945.0"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hvac-line)', fontSize: 12.5 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Actions Card */}
        <div className="hvac-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--hvac-muted)' }}>
            Updating Slot <b>{time}</b> for Date <b>{selectedDate}</b> &bull; Changes will recalculate ΔT and daily energy/water analytics
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={saving || isLockedForOperator}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                background: isLockedForOperator
                  ? '#94a3b8'
                  : isOperator
                  ? 'linear-gradient(135deg, #166534 0%, #10b981 100%)'
                  : 'linear-gradient(135deg, #15506b 0%, #0284c7 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 13.5,
                border: 'none',
                cursor: (saving || isLockedForOperator) ? 'not-allowed' : 'pointer',
                boxShadow: isLockedForOperator
                  ? 'none'
                  : isOperator
                  ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                  : '0 4px 12px rgba(2, 132, 199, 0.3)',
              }}
            >
              {saving
                ? 'Saving...'
                : isLockedForOperator
                ? '🔒 Locked (Edit Window Expired)'
                : isOperator && existingEntry
                ? '💾 Update Slot Readings (Edit Window Active)'
                : isOperator
                ? '💾 Submit Slot Readings'
                : '💾 Save Slot Readings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
