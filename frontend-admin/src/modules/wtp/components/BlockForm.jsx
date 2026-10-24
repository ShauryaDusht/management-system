import { useEffect, useState } from 'react';
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

  const existing = blockDocs.find((d) => d.month === month);
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
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save monthly readings'}</button>
    </form>
  );
}
