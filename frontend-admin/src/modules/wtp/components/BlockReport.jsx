import { useState, useMemo } from 'react';
import { bReport, bTotal, bGroup } from '../lib/calc';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import BarChart from './BarChart.jsx';
import { Kpi } from './Controls.jsx';
import ExportDropdown from '../../../components/ui/ExportDropdown';

export default function BlockReport({ meters, docs }) {
  const months = useMemo(() => [...new Set(docs.map((d) => d.month))].sort(), [docs]);
  const [month, setMonth] = useState('');
  const [view, setView] = useState('meter');
  const [trend, setTrend] = useState('0');
  const [find, setFind] = useState('');

  if (!months.length) {
    return (
      <p className="card empty">
        No monthly block readings yet. Operators can add them under "Monthly block meters" in the Enter readings tab.
      </p>
    );
  }

  const cur = month || (months.length ? months[months.length - 1] : new Date().toISOString().slice(0, 7));
  const rep = bReport(docs, meters, cur);
  const read = rep.filter((r) => r.cur != null).length;
  const neg = rep.filter((r) => r.used != null && r.used < 0).length;
  const top = [...rep].filter((r) => r.used > 0).sort((a, b) => b.used - a.used)[0];
  const ms = months.slice(-12);
  const all = view === 'matrix' ? ms.map((m) => bReport(docs, meters, m)) : [];

  const periodDays = view === '7days' ? 7 : view === '15days' ? 15 : view === '30days' ? 30 : null;
  const isPeriodView = !!periodDays;

  // Period totals
  const periodTotalCUM = useMemo(() => {
    if (!periodDays) return bTotal(rep);
    return rep.reduce((acc, r) => {
      if (r.used != null && r.used > 0) {
        const dailyRate = r.perday != null ? r.perday / 1000 : r.used / 30;
        return acc + dailyRate * periodDays;
      }
      return acc;
    }, 0);
  }, [rep, periodDays]);

  const periodTotalLitres = useMemo(() => {
    if (!periodDays) return 0;
    return rep.reduce((acc, r) => {
      if (r.perday != null && r.perday > 0) {
        return acc + r.perday * periodDays;
      }
      return acc;
    }, 0);
  }, [rep, periodDays]);

  // Chart data
  const chart = useMemo(() => {
    return months.slice(-12).map((m) => {
      const r = bReport(docs, meters, m);
      let val;
      if (trend === '0') {
        const tot = bTotal(r);
        val = isPeriodView ? (tot / 30) * periodDays : tot;
      } else {
        const single = r.find((x) => String(x.sr) === trend)?.used;
        val = isPeriodView && single != null ? (single / 30) * periodDays : single;
      }
      return { label: m.slice(2), value: val, title: m };
    }).filter((d) => d.value != null && d.value >= 0).map((d) => ({
      ...d,
      title: `${d.title}${isPeriodView ? ` (${periodDays}d)` : ''}: ${fmt(d.value, 2)} CUM`,
    }));
  }, [months, docs, meters, trend, isPeriodView, periodDays]);

  const curDoc = docs.find((d) => d.month === cur);
  const q = find.toLowerCase().trim();
  const filteredRep = rep.filter((r) => !q || `${r.block} ${r.meterNo} ${r.sr}`.toLowerCase().includes(q));

  const exportCsv = () => {
    if (isPeriodView) {
      return downloadCsv(`block-meters-${cur}-${periodDays}days.csv`, [
        ['Sr', 'Block', 'Meter no.', 'Reading (CUM)', `${periodDays}-day Used (CUM)`, `${periodDays}-day (L)`, 'Per day (L)'],
        ...rep.map((r) => {
          const usedP = r.used != null ? (r.perday != null ? (r.perday * periodDays) / 1000 : (r.used / 30) * periodDays) : null;
          const litresP = r.perday != null ? r.perday * periodDays : (usedP != null ? usedP * 1000 : null);
          return [
            r.sr,
            r.block,
            r.meterNo,
            r.cur,
            usedP == null ? '' : fmt(usedP, 2),
            litresP == null ? '' : Math.round(litresP),
            r.perday == null ? '' : Math.round(r.perday),
          ];
        }),
        ['TOTAL', '', '', '', fmt(periodTotalCUM, 2), Math.round(periodTotalLitres), Math.round(periodTotalLitres / periodDays)],
      ]);
    }
    return downloadCsv(`block-meters-${cur}.csv`, [
      ['Sr', 'Block', 'Meter no.', 'Reading (CUM)', 'Used CUM', 'Per day L'],
      ...rep.map((r) => [r.sr, r.block, r.meterNo, r.cur, r.used, r.perday == null ? '' : Math.round(r.perday)]),
    ]);
  };

  const exportPdf = () => {
    if (isPeriodView) {
      return downloadPdf(
        `block-meters-${cur}-${periodDays}days.pdf`,
        [
          ['Sr', 'Block', 'Meter no.', 'Reading (CUM)', `${periodDays}-day Used (CUM)`, `${periodDays}-day (L)`, 'Per day (L)'],
          ...rep.map((r) => {
            const usedP = r.used != null ? (r.perday != null ? (r.perday * periodDays) / 1000 : (r.used / 30) * periodDays) : null;
            const litresP = r.perday != null ? r.perday * periodDays : (usedP != null ? usedP * 1000 : null);
            return [
              r.sr,
              r.block,
              r.meterNo,
              r.cur,
              usedP == null ? '' : fmt(usedP, 2),
              litresP == null ? '' : Math.round(litresP),
              r.perday == null ? '' : Math.round(r.perday),
            ];
          }),
          ['TOTAL', '', '', '', fmt(periodTotalCUM, 2), Math.round(periodTotalLitres), Math.round(periodTotalLitres / periodDays)],
        ],
        `Monthly Block Meters Consumption - ${cur} (${periodDays} Days)`
      );
    }
    return downloadPdf(
      `block-meters-${cur}.pdf`,
      [
        ['Sr', 'Block', 'Meter no.', 'Reading (CUM)', 'Used CUM', 'Per day L'],
        ...rep.map((r) => [r.sr, r.block, r.meterNo, r.cur, r.used, r.perday == null ? '' : Math.round(r.perday)]),
      ],
      `Monthly Block Meters Report - ${cur}`
    );
  };

  return (
    <>
      <div className="kpis">
        <Kpi label="Month" value={cur} />
        <Kpi
          label={isPeriodView ? `Total consumption (${periodDays} Days)` : 'Total consumption (CUM)'}
          value={fmt(isPeriodView ? periodTotalCUM : bTotal(rep), 0)}
          sub={isPeriodView ? `${fmt(periodTotalLitres / 1000, 0)} CUM pro-rated` : ''}
        />
        <Kpi label="Meters read" value={`${read} / ${meters.length}`} />
        <Kpi
          label="Highest consumer"
          value={top ? top.block : '–'}
          sub={
            top
              ? isPeriodView
                ? `${fmt(top.perday != null ? (top.perday * periodDays) / 1000 : (top.used / 30) * periodDays, 0)} CUM (${periodDays}d)`
                : `${fmt(top.used, 0)} CUM`
              : ''
          }
        />
        <Kpi label="Operator" value={curDoc?.by || '–'} sub={curDoc?.date || (curDoc ? '' : 'No data')} />
      </div>
      <div className="card">
        <div className="row">
          <label>
            Calendar
            <input
              type="month"
              value={cur}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label>
            Find block or meter
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. K-Hostel or 12345" />
          </label>
          <label>
            View
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="meter">By meter</option>
              <option value="block">By block (summed)</option>
              <option value="matrix">All months (matrix)</option>
              <option value="7days">7 days</option>
              <option value="15days">15 days</option>
              <option value="30days">30 days</option>
            </select>
          </label>
          <ExportDropdown label="Export File" onExportCsv={exportCsv} onExportPdf={exportPdf} />
        </div>
        <p className="muted small">
          {!curDoc ? (
            <span className="warn">No readings recorded for {cur}. Select another month from the calendar.</span>
          ) : isPeriodView ? (
            `Showing pro-rated ${periodDays}-day consumption based on actual days between readings (${periodDays}-day Used = Daily rate × ${periodDays} days).`
          ) : (
            `Showing exact meter readings filled by operator. Used = this month's reading − previous reading (CUM).`
          )}
        </p>
        <div className="scroll tall">
          {view === 'meter' && (
            <table>
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Block</th>
                  <th>Meter no.</th>
                  <th>Reading (CUM)</th>
                  <th>Status</th>
                  <th>Used (CUM)</th>
                  <th>Per day (L)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRep.map((r) => (
                  <tr key={r.sr}>
                    <td>{r.sr}</td>
                    <td className="l">{r.block}</td>
                    <td className="l">{r.meterNo}</td>
                    <td style={{ fontWeight: 600, color: r.cur != null ? 'var(--water)' : 'var(--muted)' }}>
                      {r.cur != null ? fmt(r.cur, 3) : '–'}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            r.cur != null
                              ? 'color-mix(in srgb, var(--ok) 20%, transparent)'
                              : 'color-mix(in srgb, var(--line) 40%, transparent)',
                          color: r.cur != null ? 'var(--ok)' : 'var(--muted)',
                          fontWeight: 600,
                        }}
                      >
                        {r.cur != null ? 'Filled' : 'Pending'}
                      </span>
                    </td>
                    <td className={r.used < 0 ? 'warn' : ''} title={r.used < 0 ? 'Meter reset or entry error' : ''}>
                      {r.used != null ? fmt(r.used, 2) : '–'}
                    </td>
                    <td>{r.perday != null ? fmt(r.perday, 0) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isPeriodView && (
            <table>
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Block</th>
                  <th>Meter no.</th>
                  <th>Reading (CUM)</th>
                  <th>Status</th>
                  <th>{periodDays}-day Used (CUM)</th>
                  <th>{periodDays}-day (Litres)</th>
                  <th>Per day (L)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRep.map((r) => {
                  const usedP = r.used != null ? (r.perday != null ? (r.perday * periodDays) / 1000 : (r.used / 30) * periodDays) : null;
                  const litresP = r.perday != null ? r.perday * periodDays : (usedP != null ? usedP * 1000 : null);
                  return (
                    <tr key={r.sr}>
                      <td>{r.sr}</td>
                      <td className="l">{r.block}</td>
                      <td className="l">{r.meterNo}</td>
                      <td style={{ fontWeight: 600, color: r.cur != null ? 'var(--water)' : 'var(--muted)' }}>
                        {r.cur != null ? fmt(r.cur, 3) : '–'}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background:
                              r.cur != null
                                ? 'color-mix(in srgb, var(--ok) 20%, transparent)'
                                : 'color-mix(in srgb, var(--line) 40%, transparent)',
                            color: r.cur != null ? 'var(--ok)' : 'var(--muted)',
                            fontWeight: 600,
                          }}
                        >
                          {r.cur != null ? 'Filled' : 'Pending'}
                        </span>
                      </td>
                      <td
                        className={r.used < 0 ? 'warn' : ''}
                        style={{ fontWeight: 600, color: usedP != null && usedP > 0 ? 'var(--water)' : 'inherit' }}
                        title={r.used < 0 ? 'Meter reset or entry error' : ''}
                      >
                        {usedP != null ? fmt(usedP, 2) : '–'}
                      </td>
                      <td>{litresP != null ? fmt(litresP, 0) : '–'}</td>
                      <td>{r.perday != null ? fmt(r.perday, 0) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot
                style={{
                  position: 'sticky',
                  bottom: 0,
                  background: 'var(--field)',
                  zIndex: 1,
                  borderTop: '2px solid var(--water)',
                }}
              >
                <tr>
                  <td colSpan={5} className="l" style={{ fontWeight: 700, color: 'var(--water)' }}>
                    TOTAL ({periodDays} DAYS)
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--water)' }}>
                    {fmt(periodTotalCUM, 2)}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--water)' }}>
                    {fmt(periodTotalLitres, 0)}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--muted)' }}>
                    {periodDays > 0 ? fmt(periodTotalLitres / periodDays, 0) : '–'} L/day
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {view === 'block' && (
            <table>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Meters</th>
                  <th>Read</th>
                  <th>Used (CUM)</th>
                  <th>Per day (L)</th>
                  <th>Flagged</th>
                </tr>
              </thead>
              <tbody>
                {bGroup(rep).map((g) => (
                  <tr key={g.block}>
                    <td className="l">{g.block}</td>
                    <td>{g.n}</td>
                    <td>{g.read}</td>
                    <td>{fmt(g.used, 2)}</td>
                    <td>{fmt(g.perday, 0)}</td>
                    <td>{g.neg ? <span className="warn">{g.neg}</span> : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === 'matrix' && (
            <table>
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Block</th>
                  <th>Meter no.</th>
                  {ms.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meters.map((m, i) => (
                  <tr key={m.sr}>
                    <td>{m.sr}</td>
                    <td className="l">{m.block}</td>
                    <td className="l">{m.meterNo}</td>
                    {all.map((a, j) => (
                      <td key={j} className={a[i].used < 0 ? 'warn' : ''}>
                        {fmt(a[i].used, 2)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td></td>
                  <td className="l">
                    <b>Total</b>
                  </td>
                  <td></td>
                  {all.map((a, j) => (
                    <td key={j}>
                      <b>{fmt(bTotal(a), 0)}</b>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card">
        <div className="row">
          <label>
            Consumption trend (last 12 months)
            <select value={trend} onChange={(e) => setTrend(e.target.value)}>
              <option value="0">Total – all meters</option>
              {meters.map((m) => (
                <option key={m.sr} value={String(m.sr)}>
                  {m.sr}. {m.block} ({m.meterNo})
                </option>
              ))}
            </select>
          </label>
        </div>
        <BarChart
          data={chart}
          unit="CUM"
          title="Academic & Housing Block Consumption"
          metricName="Block Consumption"
          xAxisLabel="X-Axis: Date / Reading Shift"
          yAxisLabel="Y-Axis: Water Consumption (CUM)"
        />
      </div>
    </>
  );
}
