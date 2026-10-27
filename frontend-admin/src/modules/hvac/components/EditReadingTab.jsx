import React, { useState, useEffect, useMemo } from 'react';
import {
  TIME_SLOTS,
  CHILLERS,
  PUMP_GROUPS,
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

        {/* 2. Pumps Status */}
        <div className="hvac-card">
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>2. Pumps Operational Status</span>
            </div>
            <small style={{ color: 'var(--hvac-muted)' }}>Click pump button to toggle On / Off</small>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PUMP_GROUPS.map(([grpKey, grpLabel, pumpList]) => (
              <div key={grpKey}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--hvac-teal)', marginBottom: 6 }}>
                  {grpLabel} Pumps ({pumpList.length} Units):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pumpList.map((pName) => {
                    const k = grpKey + pName.replace(/\s+/g, '');
                    const isOn = values[k] === 'on';
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleTogglePump(k)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: isOn ? '1.5px solid #16a34a' : '1px solid var(--hvac-line)',
                          background: isOn ? '#dcfce7' : '#f8fafc',
                          color: isOn ? '#166534' : 'var(--hvac-muted)',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
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
            ))}
          </div>
        </div>

        {/* 3. Cooling Towers */}
        <div className="hvac-card">
          <div className="hvac-card-header">
            <div className="hvac-card-title">
              <span>3. Cooling Towers</span>
            </div>
            <small style={{ color: 'var(--hvac-muted)' }}>Toggle operational status</small>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COOLING_TOWERS.map(([ctKey, ctName]) => {
              const isOn = values[ctKey] === 'on';
              return (
                <button
                  key={ctKey}
                  type="button"
                  onClick={() => handleTogglePump(ctKey)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: isOn ? '1.5px solid #0284c7' : '1px solid var(--hvac-line)',
                    background: isOn ? '#e0f2fe' : '#f8fafc',
                    color: isOn ? '#0369a1' : 'var(--hvac-muted)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
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
