import { CUMS, FIELDS, isChem, getMergedFields } from '../config';

// ---- Station readings -------------------------------------------------
// The API stores one document per date + shift + station; reports work on one row per date + shift.
export const sk = (r) => `${r.date}|${r.shift}`;

export function mergeReadings(docs) {
  const m = new Map();
  for (const d of docs) {
    const k = `${d.date}|${d.shift}`;
    let r = m.get(k);
    if (!r) { r = { date: d.date, shift: d.shift, by: d.by || '' }; m.set(k, r); }
    Object.assign(r, d.values);
    if (d.by) r.by = d.by;
  }
  return [...m.values()].sort((a, b) => (sk(a) < sk(b) ? -1 : 1));
}

export function prevOf(rows, date, shift, k) {
  const ck = `${date}|${shift}`;
  let p = null;
  for (const r of rows) if (sk(r) < ck && r[k] != null) p = r;
  return p;
}

/**
 * Calculates consumption between consecutive cumulative meter readings with automatic
 * rollover detection.
 * Rule:
 * - Jab reading 10,000 tak pahunch kar 0 par roll over ho tabhi change hoga: (10,000 - prev) + curr.
 * - Agar 10,000 se zyada reading ho (prev > 10000 ya curr > 10000), to rollover change bilkul NAHI hoga.
 */
export function calcMeterDelta(curr, prev, coef = 1, meterKey = null) {
  if (curr == null || prev == null || curr === '' || prev === '') return null;
  const c = Number(curr);
  const p = Number(prev);
  if (isNaN(c) || isNaN(p)) return null;

  let delta = c - p;
  if (delta < 0) {
    // Condition: Jab 10000 ke baad 0 par roll over ho tabhi change ho.
    // Agar 10000 se zyada reading ho to change NAHI ho.
    const isOver10k = p > 10000 || c > 10000 || meterKey === 'c' || meterKey === 'f';
    if (!isOver10k && p <= 10000 && p >= 5000 && c < p && c < 5000 && c >= 0) {
      const rolledDelta = (10000 - p) + c;
      if (rolledDelta >= 0 && rolledDelta < 10000) {
        delta = rolledDelta;
      }
    }
  }

  // Prevent negative consumption from affecting charts or totals
  if (delta < 0) delta = 0;

  return Number((delta * (coef || 1)).toFixed(3));
}

/**
 * Checks if reading drop represents a genuine 10,000 CUM rollover to 0.
 * Agar reading 10,000 se zyada ho to rollover nahi hoga.
 */
export function isMeterRollover(curr, prev, meterKey = null) {
  if (curr == null || prev == null || curr === '' || prev === '') return false;
  const c = Number(curr);
  const p = Number(prev);
  if (isNaN(c) || isNaN(p)) return false;

  // Agar 10,000 se zyada reading ho ya WTP bulk meter ho, to rollover change nahi hoga
  if (p > 10000 || c > 10000 || meterKey === 'c' || meterKey === 'f') return false;

  // Jab 10000 ke baad 0 par roll over ho tabhi true
  return c < p && p >= 5000 && p <= 10000 && c < 5000 && c >= 0;
}

// Consumption of each cumulative meter = reading − the meter's previous reading, × coefficient (with automatic WSC & STP 10,000 CUM rollover detection)
export function daily(rows) {
  const last = {};
  return rows.map((r) => {
    const o = { date: r.date, shift: r.shift };
    for (const f of CUMS) {
      const v = r[f.k];
      o[f.k] = v != null && last[f.k] != null ? calcMeterDelta(v, last[f.k], f.coef, f.k) : null;
      if (v != null) last[f.k] = v;
    }
    return o;
  });
}

// view 'shift' (optionally one shift), 'day' (shifts added up per date), '7days', '15days', or '30days'
export function dRows(d, view, ash) {
  if (view === 'day' || view === '7days' || view === '15days' || view === '30days') {
    const m = new Map();
    for (const r of d) {
      let o = m.get(r.date);
      if (!o) { o = { date: r.date }; m.set(r.date, o); }
      for (const f of CUMS) if (r[f.k] != null && r[f.k] >= 0) o[f.k] = (o[f.k] || 0) + r[f.k];
    }
    const days = [...m.values()];
    if (view === '7days') return days.slice(-7);
    if (view === '15days') return days.slice(-15);
    if (view === '30days') return days.slice(-30);
    return days;
  }
  return ash === 'all' ? d : d.filter((r) => String(r.shift) === String(ash));
}

export const rlab = (r, view) => (view !== 'shift' || !r.shift ? r.date : `${r.date} · S${r.shift}`);
export const plab = (p) => `${p.date}${p.shift ? ' S' + p.shift : ''}`;
export const latest = (rows, k) => [...rows].reverse().find((r) => r[k] != null);

export const meterFields = (st, customMeters = []) =>
  getMergedFields(customMeters).filter((f) => f.st !== 'jm' && !isChem(f) && (st === 'all' || f.st === st));

// ---- Monthly block meters --------------------------------------------
export const bkey = (sr) => 'm' + sr;

export function bprev(docs, month, sr) {
  let p = null;
  for (const d of docs) if (d.month < month && d.readings?.[bkey(sr)] != null) p = d;
  return p ? { v: p.readings[bkey(sr)], month: p.month, date: p.date } : null;
}

export function bReport(docs, meters, month) {
  const doc = docs.find((d) => d.month === month);
  return meters.map((m) => {
    const cur = doc?.readings?.[bkey(m.sr)] ?? null;
    const p = bprev(docs, month, m.sr);
    let used = null, perday = null;
    if (cur != null && p) {
      used = calcMeterDelta(cur, p.v, 1);
      let days = doc.date && p.date ? Math.round((new Date(doc.date) - new Date(p.date)) / 864e5) : 30;
      if (!(days > 0)) days = 30;
      perday = (used / days) * 1000;
    }
    return { sr: m.sr, block: m.block, meterNo: m.meterNo, cur, prev: p ? p.v : null, used, perday };
  });
}

export const bTotal = (rep) => rep.reduce((a, r) => a + (r.used > 0 ? r.used : 0), 0);

export function bGroup(rep) {
  const g = new Map();
  for (const r of rep) {
    let o = g.get(r.block);
    if (!o) { o = { block: r.block, n: 0, read: 0, used: 0, perday: 0, neg: 0 }; g.set(r.block, o); }
    o.n++;
    if (r.cur != null) o.read++;
    if (r.used != null) { if (r.used < 0) o.neg++; else { o.used += r.used; o.perday += r.perday; } }
  }
  return [...g.values()];
}
