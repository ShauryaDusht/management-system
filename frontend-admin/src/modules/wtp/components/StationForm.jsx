import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { STATIONS, SHIFTS, GROUPS, FIELDS, JMT, getMergedGroups, getMergedFields } from '../config';
import { fmt, today } from '../lib/format';
import { calcMeterDelta, isMeterRollover, prevOf } from '../lib/calc';

function Hint({ f, rows = [], date, shift, value }) {
  const v = parseFloat(value);
  const jm = JMT[f.k];
  const isJm = f.st === 'jm';

  // For Jalmandapam, if entering Final reading (shift 2), show discharged water relative to Initial reading (shift 1)
  let prevVal = null;
  if (isJm && shift === 2) {
    const todayInit = rows.find((r) => r.date === date && r.shift === 1)?.[f.k];
    if (todayInit != null && todayInit !== '') prevVal = parseFloat(todayInit);
  } else if (f.cum) {
    // For cumulative flow meters, find the most recent previous reading
    const prevRow = prevOf(rows, date, shift, f.k);
    if (prevRow?.[f.k] != null && prevRow[f.k] !== '') {
      prevVal = parseFloat(prevRow[f.k]);
    }
  }

  const hasDiff = !Number.isNaN(v) && prevVal != null && !Number.isNaN(prevVal);
  const isRolled = f.cum && hasDiff && isMeterRollover(v, prevVal, f.k);
  const diff = hasDiff ? (f.cum ? calcMeterDelta(v, prevVal, f.coef || 1, f.k) : prevVal - v) : null;
  const diffCum = hasDiff && jm ? (diff / jm.h) * jm.cap : null;

  if (Number.isNaN(v) || (!jm && !hasDiff)) return null;

  return (
    <div className="hint" style={{ marginTop: '4px' }}>
      {jm && !Number.isNaN(v) && (
        <span>≈ {fmt((v / jm.h) * jm.cap, 1)} CUM ({fmt((v / jm.h) * 100, 0)}% full)</span>
      )}
      {hasDiff && (
        <span style={{ display: 'block', marginTop: '2px', color: diff >= 0 ? 'var(--ok)' : 'var(--amber)', fontWeight: 500 }}>
          {f.cum
            ? `Net flow: ${fmt(diff, 2)} CUM${isRolled ? ' 🔄 (10,000 CUM WSC / STP Rollover Detected)' : ''} (prev: ${fmt(prevVal, 2)})`
            : `Water discharged (today): ${fmt(diff, 2)} m ≈ ${fmt(diffCum, 1)} CUM`}
        </span>
      )}
    </div>
  );
}

export default function StationForm({ rows = [], readings = [], user, onSaved, stationMeters = [] }) {
  const [station, setStation] = useState('wtp');
  const [shift, setShift] = useState(1);
  const [date, setDate] = useState(today());
  const [by, setBy] = useState(localStorage.getItem('by') || user.name || '');
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isJm = station === 'jm';
  const allGroups = getMergedGroups(stationMeters);
  const allFields = getMergedFields(stationMeters);
  const groups = allGroups.filter((g) => g.st === station);
  const stationName = STATIONS.find((s) => s.id === station).name;

  // Find exact station reading document
  const existingDoc = readings.find(
    (r) => r.date === date && Number(r.shift) === Number(shift) && r.station === station
  );

  const isOperator = user?.role === 'operator' || user?.role === 'wtp_operator';

  // Calculate 10-minute edit window for existing records
  const editWindowInfo = useMemo(() => {
    if (!existingDoc || !isOperator) {
      return { active: false, expired: false, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const hasValues = existingDoc.values && Object.keys(existingDoc.values).length > 0;
    if (!hasValues) {
      return { active: false, expired: false, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const ts = existingDoc.createdAt
      ? new Date(existingDoc.createdAt).getTime()
      : (existingDoc.updatedAt ? new Date(existingDoc.updatedAt).getTime() : 0);
    if (!ts) {
      return { active: false, expired: true, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const diffMs = now - ts;
    const windowMs = 10 * 60 * 1000;
    if (diffMs > windowMs) {
      return { active: false, expired: true, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const remSec = Math.max(0, Math.floor((windowMs - diffMs) / 1000));
    const remMin = Math.max(1, Math.ceil(remSec / 60));
    return { active: true, expired: false, minutesRemaining: remMin, secondsRemaining: remSec };
  }, [existingDoc, isOperator, now]);

  const hasExistingValues = Boolean(existingDoc && existingDoc.values && Object.keys(existingDoc.values).length > 0);
  const isLockedForOperator = isOperator && hasExistingValues && editWindowInfo.expired;

  // Pre-fill existing readings for date and shift when switching station, date, or shift
  useEffect(() => {
    const existing = rows.find((r) => r.date === date && r.shift === shift);
    const newVals = {};
    if (existing) {
      for (const f of allFields.filter((f) => f.st === station)) {
        if (existing[f.k] != null) newVals[f.k] = existing[f.k];
      }
    }
    setVals(newVals);
  }, [date, shift, station, rows, stationMeters]);

  const submit = async (e) => {
    e.preventDefault();
    if (isLockedForOperator) {
      return setMsg({ err: 'The 10-minute edit window has expired. Contact Shift Engineer for any revisions.' });
    }
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem('by', by);

      const values = {};
      for (const f of allFields.filter((f) => f.st === station)) {
        const v = parseFloat(vals[f.k]);
        if (!Number.isNaN(v)) values[f.k] = v;
      }
      const n = Object.keys(values).length;
      if (!n) {
        setBusy(false);
        return setMsg({ err: 'Enter at least one reading.' });
      }
      await api.saveReading({ date, shift, station, values, by });
      const label = isJm
        ? `Jalmandapam ${shift === 1 ? 'Initial Value' : 'Final Value'}`
        : `${SHIFTS.find((s) => s.id === shift)?.name || 'Shift ' + shift} (${stationName})`;
      setMsg({ ok: `Saved ${n} readings for ${date}, ${label}.` });

      window.scrollTo(0, 0);
      await onSaved();
    } catch (err) {
      setMsg({ err: `Could not save: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      {isLockedForOperator && (
        <div
          style={{
            background: '#fffbeb',
            border: '1.5px solid #fde68a',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#92400e',
          }}
        >
          <span style={{ fontSize: '20px' }}>🔒</span>
          <div>
            <strong style={{ fontSize: '13px', display: 'block' }}>
              Locked (Read-Only Mode)
            </strong>
            <span style={{ fontSize: '12px' }}>
              Readings logged by <strong>{existingDoc?.by || 'Operator'}</strong>. The <strong>10-minute operator edit window has expired</strong>. Locked in Read-Only mode. Contact Shift Engineer / Supervisor for any revisions.
            </span>
          </div>
        </div>
      )}

      {isOperator && hasExistingValues && editWindowInfo.active && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
            color: '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⏱️</span>
            <div>
              <strong style={{ fontSize: '13px', display: 'block' }}>
                10-Minute Editable Window Active
              </strong>
              <span style={{ fontSize: '12px' }}>
                Readings logged by <strong>{existingDoc?.by || 'Operator'}</strong>. You have 10 minutes from creation to update/correct values.
              </span>
            </div>
          </div>
          <span
            style={{
              background: '#dcfce7',
              color: '#15803d',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            ⏳ {Math.floor(editWindowInfo.secondsRemaining / 60)}:{String(editWindowInfo.secondsRemaining % 60).padStart(2, '0')} remaining
          </span>
        </div>
      )}

      {user?.role !== 'operator' && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--water) 8%, var(--card))',
            border: '1px solid var(--water)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <div>
              <strong style={{ color: 'var(--water)', fontSize: '13px', display: 'block' }}>
                Shift Engineer / Supervisor Edit Mode
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Select any station, date, and shift to modify existing readings or log new entries. Pre-filled values represent currently recorded data.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row">
          <label>Station
            <select
              value={station}
              onChange={(e) => {
                const nextSt = e.target.value;
                setStation(nextSt);
                if (nextSt === 'jm' && shift === 3) setShift(1);
                setVals({});
                setMsg(null);
              }}
            >
              {STATIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Reading date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>{user?.role === 'operator' ? 'Operator name' : 'Entered / Edited by'}<input value={by} onChange={(e) => setBy(e.target.value)} placeholder={user?.name || "Your name"} /></label>
        </div>

        {/* If Jalmandapam: show Initial Value / Final Value. For other stations: show Shift 1, 2, 3 */}
        {isJm ? (
          <>
            <p className="label">Reading</p>
            <div className="seg">
              <button
                type="button"
                className={shift === 1 ? 'on' : ''}
                onClick={() => setShift(1)}
              >
                Initial Value<small>Morning / Starting Level</small>
              </button>
              <button
                type="button"
                className={shift === 2 ? 'on' : ''}
                onClick={() => setShift(2)}
              >
                Final Value<small>Evening / Closing Level</small>
              </button>
            </div>
            <p className="muted small">
              {shift === 1
                ? 'Enter morning starting levels and initial flow meter readings.'
                : 'Enter evening closing levels and final flow meter readings.'}
            </p>
          </>
        ) : (
          <>
            <p className="label">Shift</p>
            <div className="seg">
              {SHIFTS.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={s.id === shift ? 'on' : ''}
                  onClick={() => setShift(s.id)}
                >
                  {s.name}<small>{s.time}</small>
                </button>
              ))}
            </div>
            <p className="muted small">Enter readings for the selected station and shift. Leave a field blank if it was not read.</p>
          </>
        )}
      </div>

      {/* Form groups */}
      {(() => {
        const renderCard = (g) => (
          <div className="card" key={g.name}>
            <h2>{g.name}</h2>
            <div className="grid">
              {g.fields.map((f) => (
                <label key={f.k}>
                  {f.label}{f.unit && ` (${f.unit}${f.coef && f.coef !== 1 ? ` · reports ×${f.coef} = CUM` : ''})`}
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    disabled={isLockedForOperator}
                    value={vals[f.k] ?? ''}
                    onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}
                    placeholder={isJm ? (shift === 1 ? 'Initial value' : 'Final value') : (f.unit ? `in ${f.unit}` : '')}
                  />
                  <Hint f={f} rows={rows} date={date} shift={shift} value={vals[f.k]} />
                </label>
              ))}
            </div>
          </div>
        );

        return groups.map(renderCard);
      })()}

      <button
        className="primary"
        disabled={busy || isLockedForOperator}
        style={isLockedForOperator ? { opacity: 0.6, cursor: 'not-allowed', background: '#64748b' } : {}}
      >
        {busy
          ? 'Saving…'
          : isLockedForOperator
          ? '🔒 Locked (Edit Window Expired)'
          : editWindowInfo.active
          ? `Update Readings (Edit Window Active: ${Math.floor(editWindowInfo.secondsRemaining / 60)}:${String(editWindowInfo.secondsRemaining % 60).padStart(2, '0')})`
          : user?.role !== 'operator'
          ? '💾 Save Corrections / Readings'
          : 'Save readings'}
      </button>
    </form>
  );
}
