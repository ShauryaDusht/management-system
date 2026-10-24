import React, { useState, useMemo } from 'react';
import { BarChart3, Download, RefreshCw, Calendar, AlertTriangle } from 'lucide-react';
import { BASE_SHEETS, mkSub, todayDate, num, isEnergy, isIncomer } from './sheetsData';
import { SubstationApi as ApiClient } from './substationApi';
import ExportDropdown from '../../components/ui/ExportDropdown';
import SubstationAnalyticsChart from './SubstationAnalyticsChart';

export default function ReportsView({ docs = [], layout = {}, user, onSaveLayout, onRefresh }) {
  const latestDocDate = useMemo(() => {
    if (!docs || !docs.length) return todayDate();
    const dates = docs.map((d) => d.date).filter(Boolean).sort();
    return dates[dates.length - 1] || todayDate();
  }, [docs]);

  const [reportType, setReportType] = useState('daily'); // 'daily' or 'monthly'
  const [section, setSection] = useState('HT');
  const [date, setDate] = useState(() => {
    const today = todayDate();
    const hasToday = docs && docs.some((d) => d.date === today);
    if (!hasToday && docs && docs.length) {
      const dates = docs.map((d) => d.date).filter(Boolean).sort();
      return dates[dates.length - 1] || today;
    }
    return today;
  });
  const [month, setMonth] = useState(() => todayDate().slice(0, 7));
  const [selectedSheetId, setSelectedSheetId] = useState('sport_ht');

  const allSheets = useMemo(() => {
    const list = [...BASE_SHEETS];
    (layout.substations || [])
      .filter((x) => !x.removed && x.id !== 'nlib')
      .forEach((x) => {
        if (!list.find((s) => s.id === x.id)) list.push(mkSub(x));
      });
    return list;
  }, [layout]);

  const sheetsInSection = useMemo(
    () => allSheets.filter((s) => s.section === section),
    [allSheets, section]
  );

  const activeSheet = useMemo(
    () => allSheets.find((s) => s.id === selectedSheetId) || sheetsInSection[0] || allSheets[0],
    [allSheets, selectedSheetId, sheetsInSection]
  );

  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const r2 = (x) => +x.toFixed(2);
  const fmt = (x) => (x == null ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: 2 }));

  // Extract reportable items for each sheet
  const getReportItems = (sh) => {
    const out = [];
    sh.tables.forEach((t) => {
      if (t.raw) return;
      if (sh.mode === 'snapshot') {
        t.rows.forEach((r) => {
          if (r.head || r.anchor) return;
          const rk = t.id + ':' + r.id;
          out.push({
            label: r.label,
            sn: r.sn,
            bold: r.kind === 'incomer',
            incoming: isIncomer(r),
            unit: sh.section === 'HT' ? 'kWh' : 'kWh',
            read: (d) => [{ ord: d.date + '|' + d.slot, v: d.rows?.[rk]?.kwh }],
          });
        });
      } else {
        t.cols.filter(isEnergy).forEach((c) =>
          out.push({
            label: c.f === 'kwh' && !/Meter/.test(c.g) ? c.g : c.g + ' · ' + c.l,
            incoming: /^Incomer/i.test(c.g) || /HT\s*TVM\s*Meter/i.test(c.g),
            unit: (c.k === 'tvm_mwh' || c.k === 'tvm_mwh2') ? 'MWh' : (c.f === 'kwh' ? 'kWh' : 'MWh'),
            read: (d) =>
              t.rows.map((hr) => ({
                ord: d.date + '|' + hr.id,
                v: d.rows?.[t.id + ':' + hr.id]?.[c.k],
              })),
          })
        );
      }
    });
    return out;
  };

  const calculateItem = (it, sheetDocs, startDate, endDate) => {
    const reads = [];
    sheetDocs.forEach((d) =>
      it.read(d).forEach((x) => {
        const n = num(x.v);
        if (n != null) reads.push({ ord: x.ord, date: d.date, v: n });
      })
    );
    reads.sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));

    const perDate = {};
    const flags = {};
    const gaps = {};
    const count = {};
    let prev = null;

    reads.forEach((r) => {
      const inRange = r.date >= startDate && r.date <= endDate;
      if (inRange) count[r.date] = (count[r.date] || 0) + 1;
      if (prev && inRange) {
        const diff = r.v - prev.v;
        if (diff < 0) flags[r.date] = true;
        else perDate[r.date] = (perDate[r.date] || 0) + diff;

        const gd = dayDiff(prev.date, r.date);
        if (gd > 1) gaps[r.date] = Math.max(gaps[r.date] || 0, gd);
      }
      prev = r;
    });

    Object.keys(perDate).forEach((k) => (perDate[k] = r2(perDate[k])));
    const total = r2(Object.values(perDate).reduce((a, b) => a + b, 0));
    return { perDate, flags, gaps, count, total, has: Object.keys(count).length > 0 };
  };

  // Date ranges
  const [rangeStart, rangeEnd, numDaysInMonth] = useMemo(() => {
    if (reportType === 'daily') {
      return [date, date, 1];
    }
    const [yy, mm] = month.split('-').map(Number);
    const nd = new Date(yy, mm, 0).getDate();
    return [`${month}-01`, `${month}-${String(nd).padStart(2, '0')}`, nd];
  }, [reportType, date, month]);

  // Build report results for all substations in section
  const sectionResults = useMemo(() => {
    return sheetsInSection.map((sh) => {
      const sheetDocs = docs.filter((d) => d.sheet === sh.id);
      const items = getReportItems(sh).map((it) => ({
        it,
        c: calculateItem(it, sheetDocs, rangeStart, rangeEnd),
      }));

      const incomingTotal = () => {
        const inc = items.filter((x) => x.it.incoming && x.c.has);
        return inc.length ? r2(inc.reduce((a, x) => a + x.c.total, 0)) : null;
      };

      return {
        sh,
        items,
        incomingTotal: incomingTotal(),
        locationsWithData: items.filter((x) => x.c.has).length,
        warningCount: items.filter(
          (x) => Object.keys(x.c.flags).length || Object.keys(x.c.gaps).length
        ).length,
      };
    });
  }, [sheetsInSection, docs, rangeStart, rangeEnd]);

  const activeResult = useMemo(
    () => sectionResults.find((x) => x.sh.id === activeSheet.id) || sectionResults[0],
    [sectionResults, activeSheet]
  );

  // CSV export
  const handleExportCsv = () => {
    const isDaily = reportType === 'daily';
    const lines = [];
    const days = [...Array(numDaysInMonth).keys()].map(
      (i) => `${month}-${String(i + 1).padStart(2, '0')}`
    );

    lines.push(
      isDaily
        ? ['Substation', 'Location', 'Unit', 'Date', 'Used']
        : ['Substation', 'Location', 'Unit', 'Total', ...days]
    );

    sectionResults.forEach(({ sh, items }) => {
      items.forEach(({ it, c }) => {
        if (isDaily) {
          lines.push([sh.full || sh.name, it.label, it.unit, rangeStart, c.perDate[rangeStart] ?? '']);
        } else {
          lines.push([
            sh.full || sh.name,
            it.label,
            it.unit,
            c.has ? c.total : '',
            ...days.map((d) => c.perDate[d] ?? ''),
          ]);
        }
      });
    });

    ApiClient.exportCsv(
      `${isDaily ? 'daily' : 'monthly'}-${section}-${isDaily ? date : month}.csv`,
      lines
    );
  };

  // PDF export
  const handleExportPdf = () => {
    const isDaily = reportType === 'daily';
    const lines = [];
    const days = [...Array(numDaysInMonth).keys()].map(
      (i) => `${month}-${String(i + 1).padStart(2, '0')}`
    );

    lines.push(
      isDaily
        ? ['Substation', 'Location', 'Unit', 'Date', 'Used']
        : ['Substation', 'Location', 'Unit', 'Total', ...days]
    );

    sectionResults.forEach(({ sh, items }) => {
      items.forEach(({ it, c }) => {
        if (isDaily) {
          lines.push([sh.full || sh.name, it.label, it.unit, rangeStart, c.perDate[rangeStart] ?? '']);
        } else {
          lines.push([
            sh.full || sh.name,
            it.label,
            it.unit,
            c.has ? c.total : '',
            ...days.map((d) => c.perDate[d] ?? ''),
          ]);
        }
      });
    });

    ApiClient.exportPdf(
      `${isDaily ? 'daily' : 'monthly'}-${section}-${isDaily ? date : month}.pdf`,
      lines,
      `Substation ${isDaily ? 'Daily' : 'Monthly'} Consumption Report - ${section} Panels (${isDaily ? date : month})`
    );
  };

  return (
    <div>
      {/* Control Bar */}
      <div className="control-bar">
        <div className="field-group">
          <label className="field-label">Panel Type</label>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${section === 'HT' ? 'active' : ''}`}
              onClick={() => {
                setSection('HT');
                const ht = allSheets.filter((s) => s.section === 'HT');
                if (ht.length) setSelectedSheetId(ht[0].id);
              }}
            >
              HT Panels
            </button>
            <button
              className={`segmented-btn ${section === 'LT' ? 'active' : ''}`}
              onClick={() => {
                setSection('LT');
                const lt = allSheets.filter((s) => s.section === 'LT');
                if (lt.length) setSelectedSheetId(lt[0].id);
              }}
            >
              LT Panels
            </button>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Report Period</label>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${reportType === 'daily' ? 'active' : ''}`}
              onClick={() => setReportType('daily')}
            >
              Daily Report
            </button>
            <button
              className={`segmented-btn ${reportType === 'monthly' ? 'active' : ''}`}
              onClick={() => setReportType('monthly')}
            >
              Monthly Report
            </button>
          </div>
        </div>

        {reportType === 'daily' ? (
          <div className="field-group">
            <label className="field-label">
              <Calendar size={13} /> Date
            </label>
            <input
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        ) : (
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
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <ExportDropdown
            variant="substation-primary"
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
          />
        </div>
      </div>

      {/* Visual Analytics & Telemetry Graphs */}
      <SubstationAnalyticsChart
        section={section}
        reportType={reportType}
        date={date}
        month={month}
        sectionResults={sectionResults}
        activeSheet={activeSheet}
        activeResult={activeResult}
        onSelectSheet={setSelectedSheetId}
        docs={docs}
        numDaysInMonth={numDaysInMonth}
        onJumpToDate={date !== latestDocDate ? () => setDate(latestDocDate) : null}
      />

      {/* Substation Summary Card */}
      <div className="glass-card">
        <div className="card-header">
          <div className="card-title">
            <BarChart3 size={17} />
            <span>
              {reportType === 'daily' ? `Daily Consumption Summary (${date})` : `Monthly Consumption (${month})`} · All {section} Substations
            </span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="l">Substation</th>
                <th>Incoming Total</th>
                <th>Unit</th>
                <th>Locations with Readings</th>
                <th>Attention Needed</th>
              </tr>
            </thead>
            <tbody>
              {sectionResults.map(({ sh, incomingTotal, items, locationsWithData, warningCount }) => (
                <tr
                  key={sh.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedSheetId(sh.id)}
                >
                  <td className="name" style={{ color: sh.id === activeSheet.id ? 'var(--accent-cyan)' : 'inherit' }}>
                    {sh.name}
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(incomingTotal)}</td>
                  <td>{items[0]?.it.unit || 'kWh'}</td>
                  <td>{locationsWithData} of {items.length}</td>
                  <td>
                    {warningCount > 0 ? (
                      <span className="chip" style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn)' }}>
                        {warningCount} location(s)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-ok)', fontSize: '12px' }}>Normal ✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Table for Active Substation */}
      {activeResult && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title">
              <span>{activeResult.sh.name}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 400 }}>
                · {reportType === 'daily' ? `Consumption on ${date}` : `Daily Consumption in ${month}`} ({activeResult.items[0]?.it.unit || 'kWh'})
              </span>
            </div>
          </div>

          <div className="table-responsive">
            {reportType === 'daily' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="l">Feeder / Location</th>
                    <th>Readings Taken</th>
                    <th>Used ({activeResult.items[0]?.it.unit || 'kWh'})</th>
                    <th className="l">Notes / Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.items.map(({ it, c }) => {
                    const used = c.perDate[rangeStart];
                    let note = '';
                    let flagClass = '';

                    if (!c.has) note = 'No reading';
                    else if (c.flags[rangeStart]) {
                      note = '⚠ Counter decremented – verify reading';
                      flagClass = 'cell bad';
                    } else if (used === undefined) note = 'No earlier baseline reading to compare';
                    else if (c.gaps[rangeStart] > 1) {
                      note = `Covers ${c.gaps[rangeStart]} days (earlier reading missing)`;
                      flagClass = 'cell warn';
                    }

                    return (
                      <tr key={it.label}>
                        <td className="name">
                          {it.sn && <span className="sno-badge">{it.sn}</span>}
                          <span style={{ fontWeight: it.incoming ? 700 : 400 }}>{it.label}</span>
                        </td>
                        <td>{c.count[rangeStart] || 0}</td>
                        <td className={flagClass} style={{ fontWeight: 600 }}>{fmt(used)}</td>
                        <td className="l">{note}</td>
                      </tr>
                    );
                  })}
                  {/* Incoming Total Row */}
                  {(() => {
                    const incs = activeResult.items.filter((x) => x.it.incoming && x.c.perDate[rangeStart] !== undefined);
                    if (!incs.length) return null;
                    const tot = r2(incs.reduce((a, x) => a + x.c.perDate[rangeStart], 0));
                    return (
                      <tr className="tot">
                        <td className="name">Incoming Total</td>
                        <td></td>
                        <td style={{ color: 'var(--accent-cyan)' }}>{fmt(tot)}</td>
                        <td className="l"></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            ) : (
              /* Monthly Table */
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="l" style={{ width: '220px' }}>Location</th>
                    <th>Month Total</th>
                    {[...Array(numDaysInMonth).keys()].map((i) => (
                      <th key={i}>{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResult.items.map(({ it, c }) => {
                    const days = [...Array(numDaysInMonth).keys()].map(
                      (i) => `${month}-${String(i + 1).padStart(2, '0')}`
                    );

                    return (
                      <tr key={it.label}>
                        <td className="name">
                          {it.sn && <span className="sno-badge">{it.sn}</span>}
                          <span style={{ fontWeight: it.incoming ? 700 : 400 }}>{it.label}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          {c.has ? fmt(c.total) : '–'}
                        </td>
                        {days.map((d) => {
                          const val = c.perDate[d];
                          const hasFlag = c.flags[d];
                          const hasGap = c.gaps[d] > 1;
                          const cls = hasFlag ? 'bad' : hasGap ? 'warn' : '';

                          return (
                            <td key={d} className={`cell ${cls}`}>
                              {val !== undefined ? fmt(val) : ''}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}




    </div>
  );
}
