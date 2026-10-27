import { useEffect, useState, useMemo } from 'react';
import { api } from '../api';
import { bkey } from '../lib/calc';
import { today } from '../lib/format';

export default function BlockForm({ blockMeters, blockDocs, user, onSaved }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [date, setDate] = useState(today());
  const [by, setBy] = useState(localStorage.getItem('by') || user.name || '');
  const [find, setFind] = useState('');
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const existing = blockDocs.find((d) => d.month === month);

  const isOperator = user?.role === 'operator' || user?.role === 'wtp_operator';

  // Calculate 10-minute edit window for existing block readings
  const editWindowInfo = useMemo(() => {
    if (!existing || !isOperator) {
      return { active: false, expired: false, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const hasReadings = existing.readings && Object.keys(existing.readings).length > 0;
    if (!hasReadings) {
      return { active: false, expired: false, minutesRemaining: 0, secondsRemaining: 0 };
    }
    const ts = existing.createdAt
      ? new Date(existing.createdAt).getTime()
      : (existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0);
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
  }, [existing, isOperator, now]);

  const hasExistingReadings = Boolean(existing && existing.readings && Object.keys(existing.readings).length > 0);
  const isLockedForOperator = isOperator && hasExistingReadings && editWindowInfo.expired;

  // Show readings already saved for the chosen month so they can be corrected
  useEffect(() => {
    const v = {};
    for (const [k, x] of Object.entries(existing?.readings || {})) v[k] = String(x);
    setVals(v);
    if (existing?.date) setDate(existing.date);
  }, [month, existing?.updatedAt]);

  const q = find.toLowerCase().trim();
  const list = blockMeters.filter((m) => !q || `${m.block} ${m.meterNo}`.toLowerCase().includes(q));

  const submit = async (e) => {
    e.preventDefault();
    if (isLockedForOperator) {
      return setMsg({ err: 'The 10-minute edit window has expired. Contact Shift Engineer for any revisions.' });
    }
    const readings = {};
    for (const [k, v] of Object.entries(vals)) if (v !== '' && !Number.isNaN(parseFloat(v))) readings[k] = parseFloat(v);
    const n = Object.keys(readings).length;
    if (!n) return setMsg({ err: 'Enter at least one reading.' });
    setBusy(true);
    try {
      localStorage.setItem('by', by);
      await api.saveBlock(month, { date, by, readings });
      setMsg({ ok: `Saved ${n} meter readings for ${month}.` });
      window.scrollTo(0, 0);
      await onSaved();
    } catch (err) { setMsg({ err: `Could not save: ${err.message}` }); } finally { setBusy(false); }
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
              Monthly block readings recorded by <strong>{existing?.by || 'Operator'}</strong>. The <strong>10-minute operator edit window has expired</strong>. Locked in Read-Only mode. Contact Shift Engineer / Supervisor for any revisions.
            </span>
          </div>
        </div>
      )}

      {isOperator && hasExistingReadings && editWindowInfo.active && (
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
                Block readings recorded by <strong>{existing?.by || 'Operator'}</strong>. You have 10 minutes from creation to update/correct values.
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

      <div className="card">
        <div className="row">
          <label>Reading month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required /></label>
          <label>Reading date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Operator name<input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Your name" /></label>
          <label>Find block or meter<input value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. K-Hostel or 12345" /></label>
        </div>
        <p className="muted small">Enter this month's reading (CUM) for each block meter. Leave blank if not read. Saving the same month again updates only the meters you filled in.</p>
      </div>
      <div className="card">
        {!blockMeters.length && <p className="empty">No block meters found. Run <code>npm run seed</code> in the backend.</p>}
        <div className="scroll tall">
          <table className="block-table">
            <thead>
              <tr>
                <th className="col-sr">Sr</th>
                <th className="col-block">Block</th>
                <th className="col-meter">Meter no.</th>
                <th className="col-reading">Reading (CUM)</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.sr}>
                  <td className="col-sr">{m.sr}</td>
                  <td className="col-block">{m.block}</td>
                  <td className="col-meter">{m.meterNo}</td>
                  <td className="col-reading">
                    <input
                      className="cell"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      disabled={isLockedForOperator}
                      value={vals[bkey(m.sr)] ?? ''}
                      onChange={(e) => setVals({ ...vals, [bkey(m.sr)]: e.target.value })}
                      placeholder="Enter reading"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
          : 'Save monthly readings'}
      </button>
    </form>
  );
}
