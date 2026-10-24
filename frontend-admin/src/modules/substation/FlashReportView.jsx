import React, { useState, useMemo } from 'react';
import { FileText, Download, Sliders, Calendar, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  BASE_SHEETS,
  mkSub,
  todayDate,
  docId,
  num,
  FL_SS,
  FL_TR,
  FL_OG,
  trKva,
  lvAmp,
  isIncomer,
} from './sheetsData';
import { SubstationApi as ApiClient } from './substationApi';
import ExportDropdown from '../../components/ui/ExportDropdown';

export default function FlashReportView({
  docs,
  flashConfig,
  onSaveFlashConfig,
  onResetFlashConfig,
  onRefresh,
}) {
  const [view, setView] = useState('daily'); // 'daily', 'voltage', 'setup'
  const [month, setMonth] = useState(todayDate().slice(0, 7));
  const [setupMsg, setSetupMsg] = useState('');

  const cfg = useMemo(() => {
    const c = flashConfig || {};
    return {
      sanctioned: num(c.sanctioned) ?? 3200,
      dgKva: num(c.dgKva) ?? 1040,
      cap11: num(c.cap11) ?? 168,
      kva: c.kva || {},
      map: c.map || {},
      ogMap: c.ogMap || {},
    };
  }, [flashConfig]);

  const flAvg = (arr) => {
    const vals = arr.map(num).filter((x) => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const kvOf = (v) => (v >= 1000 ? v / 1000 : v);
  const lineV = (v) => Math.round(v < 300 ? v * 1.7320508 : v);
  const hh = (h) => 'h' + String(h).padStart(2, '0');
  const dstr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const flDate = (D) => D.split('-').reverse().join('-');
  const flTime = (h) => (h == null ? '–' : String(h).padStart(2, '0') + ':00');

  const numOfIncomer = (r) => {
    const m = String(r.label).match(/incomer\s*(?:no\.?\s*)?(\d+)\s*$/i);
    return m ? +m[1] : null;
  };

  const getIncomerRows = (sheetId) => {
    const sh = BASE_SHEETS.find((s) => s.id === sheetId);
    if (!sh || !sh.tables[0]) return [];
    return sh.tables[0].rows.filter((r) => !r.head && !r.anchor && isIncomer(r));
  };

  const resolveTransformerRow = (t) => {
    const rows = getIncomerRows(t.sheet);
    const o = cfg.map[t.id];
    if (o) {
      const r = rows.find((x) => x.id === o);
      if (r) return r;
    }
    if (rows.some((r) => numOfIncomer(r) != null)) {
      return rows.find((r) => numOfIncomer(r) === t.idx + 1) || null;
    }
    return rows[t.idx] || null;
  };

  // Perform full engineering calculations for Flash Report
  const flashData = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const numDays = new Date(y, m, 0).getDate();
    const days = [];

    const getReading = (sheetId, targetDate, slot) =>
      docs.find((d) => d._id === docId(sheetId, targetDate, slot) || (d.sheet === sheetId && d.date === targetDate && d.slot === slot));

    for (let i = 1; i <= numDays + 1; i++) {
      const dDate = dstr(new Date(y, m - 1, i));
      const day = { date: dDate, tr: {}, vmm: {}, og: {}, ht: {} };

      const oldHtDoc = getReading('oldht', dDate, 'day');
      const hr = (h) => oldHtDoc && oldHtDoc.rows && oldHtDoc.rows['hr:' + hh(h)];

      // 11kV Input Voltage and Peak Load
      const vs = [];
      let best = null;
      for (let h = 0; h < 24; h++) {
        const r = hr(h);
        if (!r) continue;
        const v = num(r.mfm_vol);
        if (v > 0) vs.push(kvOf(v));
        const a = flAvg([r.mfm_a1, r.mfm_a2, r.mfm_a3]);
        if (a != null && (best == null || a > best.a)) best = { a, h };
      }

      day.minV = vs.length ? Math.min(...vs) : null;
      day.maxV = vs.length ? Math.max(...vs) : null;
      day.peakA = best ? Math.round(best.a) : null;
      day.peakH = best ? best.h : null;
      day.ht.main = day.minV == null ? null : [day.minV, day.maxV];

      // HT Outgoing Amps at Peak Hour
      FL_OG.forEach((o) => {
        const src = cfg.ogMap[o.id] || { sheet: o.sheet, group: o.group };
        const doc = getReading(src.sheet, dDate, 'day');
        const r = doc && doc.rows && day.peakH != null ? doc.rows['hr:' + hh(day.peakH)] : null;
        const a = r ? flAvg([r[src.group + '_a1'], r[src.group + '_a2'], r[src.group + '_a3']]) : null;
        day.og[o.id] = a == null ? null : Math.round(a);
      });

      // LT Incomers at Peak Hour
      FL_TR.forEach((t) => {
        const row = resolveTransformerRow(t);
        const sh = BASE_SHEETS.find((s) => s.id === t.sheet);
        if (!sh || !row) {
          day.tr[t.id] = null;
          day.vmm[t.id] = null;
          return;
        }

        const rk = 't0:' + row.id;
        const candidates = sh.slots
          .map((sl, k) => {
            const d = getReading(sh.id, dDate, sl);
            if (!d || !d.rows || !d.rows[rk]) return null;
            const r = d.rows[rk];
            return {
              slotIdx: k,
              a: flAvg([r.a1, r.a2, r.a3]),
              v: num(r.vol),
            };
          })
          .filter(Boolean);

        const withAmps = candidates.filter((c) => c.a != null);
        day.tr[t.id] = withAmps.length ? Math.round(withAmps[withAmps.length - 1].a) : null;

        const voltVals = candidates
          .map((c) => c.v)
          .filter((v) => v > 0)
          .map(lineV);
        day.vmm[t.id] = voltVals.length ? [Math.min(...voltVals), Math.max(...voltVals)] : null;
      });

      // TVM Meter at 00:00
      let t0 = null;
      for (let h = 0; h < 24 && !t0; h++) {
        const r = hr(h);
        if (r && num(r.tvm_mwh) != null) t0 = r;
      }
      day.mwh = t0 ? num(t0.tvm_mwh) : null;
      day.mvah = t0 ? num(t0.tvm_mvah) : null;

      const pfs = [];
      for (let h = 0; h < 24; h++) {
        const r = hr(h);
        const v = r && num(r.tvm_pf);
        if (v > 0) pfs.push(v);
      }
      day.pfAvg = pfs.length ? pfs.reduce((a, b) => a + b, 0) / pfs.length : null;

      days.push(day);
    }

    // Differences between consecutive days
    for (let i = 0; i < numDays; i++) {
      const a = days[i];
      const b = days[i + 1];
      a.dMwh = a.mwh != null && b.mwh != null ? +(b.mwh - a.mwh).toFixed(2) : null;
      a.dMvah = a.mvah != null && b.mvah != null ? +(b.mvah - a.mvah).toFixed(2) : null;
      a.pf = a.pfAvg != null ? a.pfAvg : a.dMwh > 0 && a.dMvah > 0 ? a.dMwh / a.dMvah : null;
    }

    const monthDays = days.slice(0, numDays);
    const validDays = monthDays.filter((d) => d.peakA != null);
    const peakDay = validDays.length ? validDays.reduce((p, c) => (c.peakA > p.peakA ? c : p)) : null;

    const mins = monthDays.map((d) => d.minV).filter((v) => v != null);
    const maxs = monthDays.map((d) => d.maxV).filter((v) => v != null);
    const sMw = monthDays.map((d) => d.dMwh).filter((v) => v != null);
    const sMv = monthDays.map((d) => d.dMvah).filter((v) => v != null);

    const summary = {
      minV: mins.length ? Math.min(...mins) : null,
      maxV: maxs.length ? Math.max(...maxs) : null,
      peakA: peakDay ? peakDay.peakA : null,
      peakH: peakDay ? peakDay.peakH : null,
      peakDate: peakDay ? peakDay.date : null,
      og: peakDay ? peakDay.og : {},
      tr: peakDay ? peakDay.tr : {},
      dMwh: sMw.length ? +sMw.reduce((a, b) => a + b, 0).toFixed(2) : null,
      dMvah: sMv.length ? +sMv.reduce((a, b) => a + b, 0).toFixed(2) : null,
      pf:
        sMw.length && sMv.length && sMw.reduce((a, b) => a + b, 0) > 0
          ? sMw.reduce((a, b) => a + b, 0) / sMv.reduce((a, b) => a + b, 0)
          : null,
    };

    return { days: monthDays, summary, numDays };
  }, [month, docs, cfg]);

  const totalCapacityKva = useMemo(() => {
    return FL_TR.reduce((acc, t) => acc + trKva(cfg, t), 0);
  }, [cfg]);

  // CSV Export for Flash Report
  const handleExportCsv = () => {
    const isDaily = view === 'daily';
    const lines = [];

    if (isDaily) {
      lines.push([
        'Date',
        'Min kV',
        'Max kV',
        'Peak Load A (11 kV)',
        'Peak Hour',
        ...FL_OG.map((o) => `${o.panel} ${o.label} (${o.og})`),
        ...FL_TR.map((t) => `${t.ssName} ${t.id}`),
        'Overall PF',
        'MWh at 00:00',
        'MVAh at 00:00',
        'Diff MWh',
        'Diff MVAh',
      ]);

      flashData.days.forEach((d) => {
        lines.push([
          d.date,
          d.minV ?? '',
          d.maxV ?? '',
          d.peakA ?? '',
          flTime(d.peakH),
          ...FL_OG.map((o) => d.og[o.id] ?? ''),
          ...FL_TR.map((t) => d.tr[t.id] ?? ''),
          d.pf ? d.pf.toFixed(3) : '',
          d.mwh ?? '',
          d.mvah ?? '',
          d.dMwh ?? '',
          d.dMvah ?? '',
        ]);
      });

      ApiClient.exportCsv(`R-01-flash-report-${month}.csv`, lines);
    } else if (view === 'voltage') {
      const headers = ['Date', 'Main HT 11kV Min', 'Main HT 11kV Max'];
      FL_TR.forEach((t) => {
        headers.push(`${t.id} Min (V)`);
        headers.push(`${t.id} Max (V)`);
      });
      lines.push(headers);

      flashData.days.forEach((d) => {
        const row = [d.date, d.minV?.toFixed(2) || '', d.maxV?.toFixed(2) || ''];
        FL_TR.forEach((t) => {
          const v = d.vmm[t.id];
          row.push(v ? v[0] : '');
          row.push(v ? v[1] : '');
        });
        lines.push(row);
      });

      ApiClient.exportCsv(`R-01-supply-voltage-${month}.csv`, lines);
    }
  };

  // PDF Export for Flash Report
  const handleExportPdf = () => {
    const isDaily = view === 'daily';
    const lines = [];

    if (isDaily) {
      lines.push([
        'Date',
        'Min kV',
        'Max kV',
        'Peak A',
        'Peak Hr',
        ...FL_OG.map((o) => `${o.label}`),
        ...FL_TR.map((t) => `${t.id}`),
        'PF',
        'Diff MWh',
        'Diff MVAh',
      ]);

      flashData.days.forEach((d) => {
        lines.push([
          d.date,
          d.minV ?? '',
          d.maxV ?? '',
          d.peakA ?? '',
          flTime(d.peakH),
          ...FL_OG.map((o) => d.og[o.id] ?? ''),
          ...FL_TR.map((t) => d.tr[t.id] ?? ''),
          d.pf ? d.pf.toFixed(3) : '',
          d.dMwh ?? '',
          d.dMvah ?? '',
        ]);
      });

      ApiClient.exportPdf(`R-01-flash-report-${month}.pdf`, lines, `R-01 Flash Power Demand Report (${month})`);
    } else if (view === 'voltage') {
      const headers = ['Date', 'Main HT 11kV Min', 'Main HT 11kV Max'];
      FL_TR.forEach((t) => {
        headers.push(`${t.id} Min`);
        headers.push(`${t.id} Max`);
      });
      lines.push(headers);

      flashData.days.forEach((d) => {
        const row = [d.date, d.minV?.toFixed(2) || '', d.maxV?.toFixed(2) || ''];
        FL_TR.forEach((t) => {
          const v = d.vmm[t.id];
          row.push(v ? v[0] : '');
          row.push(v ? v[1] : '');
        });
        lines.push(row);
      });

      ApiClient.exportPdf(`R-01-supply-voltage-${month}.pdf`, lines, `R-01 Supply Voltage Report (${month})`);
    }
  };

  return (
    <div>
      {/* Top Controls */}
      <div className="control-bar">
        <div className="field-group">
          <label className="field-label">
            <Calendar size={13} /> Month
          </label>
          <input
            type="month"
            className="field-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Flash View</label>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${view === 'daily' ? 'active' : ''}`}
              onClick={() => setView('daily')}
            >
              Daily Flash (R-01)
            </button>
            <button
              className={`segmented-btn ${view === 'voltage' ? 'active' : ''}`}
              onClick={() => setView('voltage')}
            >
              Supply Voltage
            </button>
            <button
              className={`segmented-btn ${view === 'setup' ? 'active' : ''}`}
              onClick={() => setView('setup')}
            >
              Setup & Ratings
            </button>
          </div>
        </div>

        {view !== 'setup' && (
          <div>
            <ExportDropdown
              variant="substation-primary"
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
            />
          </div>
        )}
      </div>

      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, rgba(6, 182, 212, 0.08), transparent)',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
          IIT GANDHINAGAR · CAMPUS ELECTRICAL OPERATIONS
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-cyan)', marginTop: '2px' }}>
          R-01 {view === 'daily' ? 'DAILY FLASH REPORT (TRANSFORMER LOAD POSITION)' : 'SUPPLY VOLTAGE LOG'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Sanctioned Load: {cfg.sanctioned} kW · Transformer Capacity: {totalCapacityKva.toLocaleString()} kVA ({FL_TR.length} Transformers) · DG Capacity: {cfg.dgKva} kVA
        </div>
      </div>

      {/* View 1: Daily Flash Table */}
      {view === 'daily' && (
        <div className="glass-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="l" rowSpan={2} style={{ width: '100px' }}>Date</th>
                  <th colSpan={2} className="gb">11 kV Input (kV)</th>
                  <th colSpan={2} className="gb">11 kV Peak Load</th>
                  <th colSpan={4} className="gb">MRS HT PANEL 1 (A)</th>
                  <th colSpan={4} className="gb">MRS HT PANEL 2 (A)</th>
                  {FL_SS.map(([k, name]) => {
                    const count = FL_TR.filter((t) => t.ss === k).length;
                    return (
                      <th key={k} colSpan={count} className="gb" style={{ textAlign: 'center' }}>
                        {name}
                      </th>
                    );
                  })}
                  <th rowSpan={2} className="gb">Overall PF</th>
                  <th colSpan={4} className="gb">TVM Meter Daily at 00:00</th>
                </tr>
                <tr>
                  <th className="gb">Min</th>
                  <th>Max</th>
                  <th className="gb">Amp</th>
                  <th>Time</th>
                  {FL_OG.map((o, i) => (
                    <th key={o.id} className={i % 4 === 0 ? 'gb' : ''}>
                      {o.label} <span className="delta-hint">{o.og}</span>
                    </th>
                  ))}
                  {FL_TR.map((t) => (
                    <th key={t.id} className={t.idx === 0 ? 'gb' : ''}>
                      {t.id}
                    </th>
                  ))}
                  <th className="gb">MWh</th>
                  <th>MVAh</th>
                  <th>Diff MWh</th>
                  <th>Diff MVAh</th>
                </tr>
              </thead>
              <tbody>
                {/* Summary Row */}
                <tr className="tot">
                  <td className="name" style={{ color: 'var(--accent-cyan)' }}>
                    Month Peak
                    {flashData.summary.peakDate && (
                      <span className="delta-hint">{flDate(flashData.summary.peakDate)}</span>
                    )}
                  </td>
                  <td className="gb">{flashData.summary.minV?.toFixed(2) || '–'}</td>
                  <td>{flashData.summary.maxV?.toFixed(2) || '–'}</td>
                  <td className="gb" style={{ color: 'var(--status-warn)', fontWeight: 700 }}>
                    {flashData.summary.peakA || '–'}
                  </td>
                  <td>{flTime(flashData.summary.peakH)}</td>
                  {FL_OG.map((o, i) => (
                    <td key={o.id} className={i % 4 === 0 ? 'gb' : ''}>
                      {flashData.summary.og[o.id] || '–'}
                    </td>
                  ))}
                  {FL_TR.map((t) => (
                    <td key={t.id} className={t.idx === 0 ? 'gb' : ''}>
                      {flashData.summary.tr[t.id] || '–'}
                    </td>
                  ))}
                  <td className="gb">{flashData.summary.pf ? flashData.summary.pf.toFixed(3) : '–'}</td>
                  <td className="gb"></td>
                  <td></td>
                  <td style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                    {flashData.summary.dMwh ?? '–'}
                  </td>
                  <td>{flashData.summary.dMvah ?? '–'}</td>
                </tr>

                {/* Day-by-Day Rows */}
                {flashData.days.map((d) => (
                  <tr key={d.date}>
                    <td className="name">{flDate(d.date)}</td>
                    <td className="gb">{d.minV?.toFixed(2) || '–'}</td>
                    <td>{d.maxV?.toFixed(2) || '–'}</td>
                    <td className="gb">{d.peakA || '–'}</td>
                    <td>{flTime(d.peakH)}</td>
                    {FL_OG.map((o, i) => (
                      <td key={o.id} className={i % 4 === 0 ? 'gb' : ''}>
                        {d.og[o.id] || '–'}
                      </td>
                    ))}
                    {FL_TR.map((t) => {
                      const a = d.tr[t.id];
                      const ratedAmp = lvAmp(trKva(cfg, t));
                      const loadPct = a != null ? a / ratedAmp : 0;
                      const isWarn = loadPct >= 0.8 && loadPct < 1;
                      const isBad = loadPct >= 1;

                      return (
                        <td
                          key={t.id}
                          className={`${t.idx === 0 ? 'gb' : ''} ${
                            isBad ? 'cell bad' : isWarn ? 'cell warn' : ''
                          }`}
                          title={a != null ? `${Math.round(loadPct * 100)}% of rated ${ratedAmp} A` : ''}
                        >
                          {a != null ? a : '–'}
                        </td>
                      );
                    })}
                    <td className="gb">{d.pf ? d.pf.toFixed(3) : '–'}</td>
                    <td className="gb">{d.mwh ?? '–'}</td>
                    <td>{d.mvah ?? '–'}</td>
                    <td style={{ fontWeight: 600 }}>{d.dMwh ?? '–'}</td>
                    <td>{d.dMvah ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 2: Supply Voltage Table */}
      {view === 'voltage' && (
        <div className="glass-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="l" rowSpan={2} style={{ width: '100px' }}>Date</th>
                  <th colSpan={2} className="gb">Main HT 11 kV</th>
                  {FL_SS.map(([k, name]) => (
                    <th
                      key={k}
                      colSpan={FL_TR.filter((t) => t.ss === k).length * 2}
                      className="gb"
                    >
                      {name} (415 V Line Voltage)
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="gb">Min</th>
                  <th>Max</th>
                  {FL_TR.map((t) => (
                    <React.Fragment key={t.id}>
                      <th className={t.idx === 0 ? 'gb' : ''}>{t.id} Min</th>
                      <th>{t.id} Max</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flashData.days.map((d) => (
                  <tr key={d.date}>
                    <td className="name">{flDate(d.date)}</td>
                    <td className="gb">{d.minV?.toFixed(2) || '–'}</td>
                    <td>{d.maxV?.toFixed(2) || '–'}</td>
                    {FL_TR.map((t) => {
                      const v = d.vmm[t.id];
                      const outOfNominal = v && (v[0] < 380 || v[1] > 440);
                      return (
                        <React.Fragment key={t.id}>
                          <td className={`${t.idx === 0 ? 'gb' : ''} ${outOfNominal ? 'cell warn' : ''}`}>
                            {v ? v[0] : '–'}
                          </td>
                          <td className={outOfNominal ? 'cell warn' : ''}>
                            {v ? v[1] : '–'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 3: Setup & Transformer Ratings */}
      {view === 'setup' && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title">
              <Sliders size={17} />
              <span>Flash Report Parameter Setup</span>
            </div>
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '18px' }}>
              Define transformer kVA ratings, load capacities, and feeder routing. Daily calculations update automatically based on these engineering constants.
            </p>

            {setupMsg && (
              <div className="banner ok" style={{ marginBottom: '16px' }}>
                <CheckCircle2 size={16} />
                <span>{setupMsg}</span>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              <div className="field-group">
                <label className="field-label">Sanctioned Load (kW)</label>
                <input
                  type="number"
                  className="field-input"
                  value={cfg.sanctioned}
                  onChange={(e) =>
                    onSaveFlashConfig({ ...cfg, sanctioned: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="field-group">
                <label className="field-label">DG Capacity (kVA)</label>
                <input
                  type="number"
                  className="field-input"
                  value={cfg.dgKva}
                  onChange={(e) =>
                    onSaveFlashConfig({ ...cfg, dgKva: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="l">Transformer ID</th>
                    <th className="l">Substation</th>
                    <th>Rated Capacity (kVA)</th>
                    <th>Rated LV Current (A)</th>
                  </tr>
                </thead>
                <tbody>
                  {FL_TR.map((t) => {
                    const currentKva = trKva(cfg, t);
                    return (
                      <tr key={t.id}>
                        <td className="name">{t.id}</td>
                        <td className="l">{t.ssName}</td>
                        <td>
                          <input
                            type="number"
                            className="num-input"
                            value={currentKva}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updatedKva = { ...cfg.kva, [t.id]: val };
                              onSaveFlashConfig({ ...cfg, kva: updatedKva });
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{lvAmp(currentKva)} A</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await onResetFlashConfig();
                  setSetupMsg('Reset to campus defaults.');
                }}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
