import React, { useState, useMemo } from 'react';
import {
  Shield,
  Download,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  Calendar,
  Layers,
  History,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  BASE_SHEETS,
  mkSub,
  todayDate,
  docId,
  isEnergy,
  num,
  flagInfo,
} from './sheetsData';
import { SubstationApi as ApiClient } from './substationApi';
import ExportDropdown from '../../components/ui/ExportDropdown';

export default function SupervisorView({
  docs,
  layout,
  user,
  onSaveDoc,
  onSaveLayout,
}) {
  const [section, setSection] = useState('HT');
  const [sheetId, setSheetId] = useState('sport_ht');
  const [date, setDate] = useState(todayDate());
  const [metric, setMetric] = useState('kwh');
  const [isEditing, setIsEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [statusMsg, setStatusMsg] = useState('');

  // Admin cannot edit readings - ensure editing mode is disabled for admin
  React.useEffect(() => {
    if (user?.role === 'admin') {
      setIsEditing(false);
      setEdits({});
    }
  }, [user?.role]);

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
    () => allSheets.find((s) => s.id === sheetId) || sheetsInSection[0] || allSheets[0],
    [allSheets, sheetId, sheetsInSection]
  );

  const availableMetrics = useMemo(() => {
    const list = [];
    activeSheet.tables.forEach((t) => {
      if (!t.raw) {
        t.cols.forEach((c) => {
          if (!list.find((m) => m.f === c.f)) list.push(c);
        });
      }
    });
    return list;
  }, [activeSheet]);

  const buildEffectiveRows = (t) => {
    const items = layout[activeSheet.id] || [];
    const out = [];
    const isGone = (i) => !!i.removed || (i.kind === 'feeder' && !!items.find((x) => x.id === i.parent && x.removed));

    t.rows.forEach((r) => {
      if (r.anchor) {
        items
          .filter((i) => i.kind === 'feeder' && i.parent === r.id)
          .forEach((i) =>
            out.push({ id: i.id, sn: '+', label: i.name, dyn: true, kind: i.kind, parent: i.parent, removed: isGone(i) })
          );
      }
      out.push(r);
    });

    if (activeSheet.section === 'LT') {
      items
        .filter((i) => i.kind === 'incomer')
        .forEach((inc) => {
          out.push({ id: inc.id, sn: '+', label: inc.name, dyn: true, kind: inc.kind, removed: isGone(inc), divBefore: true });
          items
            .filter((f) => f.kind === 'feeder' && f.parent === inc.id)
            .forEach((f) =>
              out.push({ id: f.id, sn: '+', label: f.name, dyn: true, kind: f.kind, parent: f.parent, removed: isGone(f) })
            );
          if (!inc.removed) out.push({ id: 'z' + inc.id, anchor: true, div: true });
        });
    }
    return out;
  };

  const getVisibleRows = (t) => {
    const effRows = buildEffectiveRows(t);
    const hasData = (r) => {
      const k = t.id + ':' + r.id;
      return docs.some(
        (d) =>
          d.sheet === activeSheet.id &&
          d.rows &&
          d.rows[k] &&
          Object.values(d.rows[k]).some((v) => v !== '' && v != null)
      );
    };

    const list = [];
    effRows.forEach((r, ri) => {
      if (r.anchor) {
        if (r.div && list.length) list[list.length - 1].div = true;
        return;
      }
      const vis = !r.dyn || !r.removed;
      if (vis) {
        if (r.divBefore && list.length) list[list.length - 1].div = true;
        list.push({ r, ri, div: !!r.div });
      }
    });
    return list;
  };

  // Track edit changes
  const handleEditCell = (docKey, rowKey, colKey, val) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (!next[docKey]) next[docKey] = {};
      if (!next[docKey][rowKey]) next[docKey][rowKey] = {};
      next[docKey][rowKey][colKey] = val.trim();
      return next;
    });
  };

  const editCount = useMemo(() => {
    let n = 0;
    Object.entries(edits).forEach(([dId, rows]) => {
      const doc = docs.find((d) => d._id === dId);
      Object.entries(rows).forEach(([rk, cols]) => {
        Object.entries(cols).forEach(([ck, val]) => {
          const old = doc?.rows?.[rk]?.[ck] ?? '';
          if (String(old) !== String(val)) n++;
        });
      });
    });
    return n;
  }, [edits, docs]);

  const handleSaveEdits = async () => {
    if (!editCount) {
      setIsEditing(false);
      return;
    }

    const writes = [];
    let hasBad = false;

    Object.entries(edits).forEach(([dId, rows]) => {
      const doc = docs.find((d) => d._id === dId);
      if (!doc) return;
      const sheet = allSheets.find((s) => s.id === doc.sheet);
      if (!sheet) return;

      const nextRows = JSON.parse(JSON.stringify(doc.rows || {}));
      const auditLog = [];

      Object.entries(rows).forEach(([rk, cols]) => {
        Object.entries(cols).forEach(([ck, val]) => {
          const old = (nextRows[rk] && nextRows[rk][ck]) ?? '';
          if (String(old) === String(val)) return;

          const t = sheet.tables.find((x) => x.id === rk.split(':')[0]);
          const c = t && t.cols.find((x) => x.k === ck);
          if (!c) return;

          if (!c.txt && val !== '' && (num(val) == null || (c.f === 'pf' && (num(val) < 0 || num(val) > 1)))) {
            hasBad = true;
            return;
          }

          if (val === '') {
            if (nextRows[rk]) {
              delete nextRows[rk][ck];
              if (!Object.keys(nextRows[rk]).length) delete nextRows[rk];
            }
          } else {
            (nextRows[rk] = nextRows[rk] || {})[ck] = val;
          }

          auditLog.push({
            rk,
            ck,
            from: String(old),
            to: String(val),
            by: user?.name || 'Engineer',
            at: Date.now(),
          });
        });
      });

      if (auditLog.length > 0) {
        writes.push({
          ...doc,
          rows: nextRows,
          updatedAt: Date.now(),
          editedBy: user?.name || 'Engineer',
          edits: [...(doc.edits || []), ...auditLog].slice(-300),
        });
      }
    });

    if (hasBad) {
      setStatusMsg('Some values are invalid numbers or out of range. Please fix them.');
      return;
    }

    try {
      for (const w of writes) {
        await onSaveDoc(w);
      }
      setStatusMsg(`Saved corrections in ${writes.length} shift log(s).`);
      setIsEditing(false);
      setEdits({});
    } catch (e) {
      setStatusMsg(`Error saving corrections: ${e.message}`);
    }
  };

  // CSV Export for chosen date
  const handleExportCsv = () => {
    const lines = [
      ['Sheet', 'Substation', 'Date', 'Shift', 'Time', 'Operator', 'Section', 'Row', 'Field', 'Value'],
    ];

    activeSheet.slots.forEach((sl) => {
      const d = docs.find((doc) => doc._id === docId(activeSheet.id, date, sl));
      if (!d) return;

      activeSheet.tables.forEach((t) => {
        getVisibleRows(t).forEach(({ r }) => {
          t.cols.forEach((c) => {
            const v = d.rows?.[t.id + ':' + r.id]?.[c.k];
            if (v != null && v !== '') {
              lines.push([
                activeSheet.id,
                activeSheet.name,
                d.date,
                sl === 'day' ? 'Full Day' : sl,
                d.time || '',
                d.operator || '',
                t.title,
                r.label,
                (c.g ? c.g + ' ' : '') + c.l,
                v,
              ]);
            }
          });
        });
      });
    });

    if (lines.length === 1) {
      alert('No readings recorded for this date.');
      return;
    }

    ApiClient.exportCsv(`${activeSheet.id}-${date}.csv`, lines);
  };

  // PDF Export for chosen date
  const handleExportPdf = () => {
    const lines = [
      ['Sheet', 'Substation', 'Date', 'Shift', 'Time', 'Operator', 'Section', 'Row', 'Field', 'Value'],
    ];

    activeSheet.slots.forEach((sl) => {
      const d = docs.find((doc) => doc._id === docId(activeSheet.id, date, sl));
      if (!d) return;

      activeSheet.tables.forEach((t) => {
        getVisibleRows(t).forEach(({ r }) => {
          t.cols.forEach((c) => {
            const v = d.rows?.[t.id + ':' + r.id]?.[c.k];
            if (v != null && v !== '') {
              lines.push([
                activeSheet.id,
                activeSheet.name,
                d.date,
                sl === 'day' ? 'Full Day' : sl,
                d.time || '',
                d.operator || '',
                t.title,
                r.label,
                (c.g ? c.g + ' ' : '') + c.l,
                v,
              ]);
            }
          });
        });
      });
    });

    if (lines.length === 1) {
      alert('No readings recorded for this date.');
      return;
    }

    ApiClient.exportPdf(`${activeSheet.id}-${date}.pdf`, lines, `${activeSheet.name} Log Report (${date})`);
  };

  // Layout Actions
  const handleAddSubstation = async () => {
    if (!newSubName.trim()) return;
    const subs = [...(layout.substations || [])];
    const newId = 'n' + Date.now().toString(36);
    subs.push({ id: newId, name: newSubName.trim() });
    await onSaveLayout('substations', subs);
    setNewSubName('');
    setStatusMsg(`Substation "${newSubName.trim()}" created.`);
  };

  const handleRemoveSubstation = async (subId) => {
    const subs = (layout.substations || []).map((x) =>
      x.id === subId ? { ...x, removed: true } : x
    );
    await onSaveLayout('substations', subs);
    setStatusMsg('Substation removed.');
  };

  const handleAddIncomer = async () => {
    if (!newIncName.trim()) return;
    const items = [...(layout[activeSheet.id] || [])];
    items.push({ id: 'inc_' + Date.now().toString(36), kind: 'incomer', name: newIncName.trim() });
    await onSaveLayout(activeSheet.id, items);
    setNewIncName('');
    setStatusMsg(`Incomer "${newIncName.trim()}" added.`);
  };

  const handleAddFeeder = async (parentId) => {
    const name = (feederInputs[parentId] || '').trim();
    if (!name) return;
    const items = [...(layout[activeSheet.id] || [])];
    items.push({ id: 'fd_' + Date.now().toString(36), kind: 'feeder', name, parent: parentId });
    await onSaveLayout(activeSheet.id, items);
    setFeederInputs((prev) => ({ ...prev, [parentId]: '' }));
    setStatusMsg(`Outgoing "${name}" added.`);
  };

  const handleRemoveLayoutItem = async (itemId) => {
    const items = (layout[activeSheet.id] || []).map((x) =>
      x.id === itemId ? { ...x, removed: true } : x
    );
    await onSaveLayout(activeSheet.id, items);
    setStatusMsg('Item removed.');
  };

  // Recent corrections log
  const allCorrections = useMemo(() => {
    const list = [];
    docs.forEach((d) => {
      (d.edits || []).forEach((e) => list.push({ ...e, d }));
    });
    list.sort((a, b) => b.at - a.at);
    return list.slice(0, 20);
  }, [docs]);

  // Recent submissions
  const recentSubmissions = useMemo(() => {
    return [...docs]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 15);
  }, [docs]);

  return (
    <div>
      {/* Top Filter Bar */}
      <div className="control-bar">
        <div className="field-group">
          <label className="field-label">Panel Type</label>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${section === 'HT' ? 'active' : ''}`}
              onClick={() => {
                setSection('HT');
                const htSheets = allSheets.filter((s) => s.section === 'HT');
                if (htSheets.length) setSheetId(htSheets[0].id);
              }}
            >
              HT Panel
            </button>
            <button
              className={`segmented-btn ${section === 'LT' ? 'active' : ''}`}
              onClick={() => {
                setSection('LT');
                const ltSheets = allSheets.filter((s) => s.section === 'LT');
                if (ltSheets.length) setSheetId(ltSheets[0].id);
              }}
            >
              LT Panel
            </button>
          </div>
        </div>

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

        <div className="field-group">
          <label className="field-label">Display Metric</label>
          <select
            className="field-select"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {availableMetrics.map((m) => (
              <option key={m.f} value={m.f}>
                {m.l}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ExportDropdown
            variant="substation-ghost"
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
          />

          {user?.role === 'supervisor' && (
            !isEditing ? (
              <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                <Edit3 size={15} />
                <span>Edit Readings</span>
              </button>
            ) : (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setEdits({});
                  }}
                >
                  <X size={15} />
                  <span>Cancel</span>
                </button>
                <button className="btn btn-primary" onClick={handleSaveEdits}>
                  <Save size={15} />
                  <span>Save Corrections ({editCount})</span>
                </button>
              </>
            )
          )}
        </div>
      </div>


      {statusMsg && (
        <div className="banner ok" style={{ marginBottom: '16px' }}>
          <CheckCircle size={16} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Substation Tiles Grid */}
      <div className="tiles-grid">
        {sheetsInSection.map((s) => {
          const isSelected = s.id === activeSheet.id;
          return (
            <div
              key={s.id}
              className={`status-tile ${isSelected ? 'active' : ''}`}
              onClick={() => setSheetId(s.id)}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}>
                {s.name}
              </div>
              <div className="chip-group">
                {s.mode === 'snapshot' ? (
                  s.slots.map((sl, idx) => {
                    const done = docs.some((d) => d._id === docId(s.id, date, sl));
                    return (
                      <span key={sl} className={`chip ${done ? 'on' : ''}`}>
                        Shift {idx + 1} {done ? '✓' : ''}
                      </span>
                    );
                  })
                ) : (
                  <span
                    className={`chip ${
                      docs.some((d) => d._id === docId(s.id, date, 'day')) ? 'on' : ''
                    }`}
                  >
                    Hourly Log
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Substation Inspection Tables */}
      {activeSheet.tables.map((table) => {
        const visibleRows = getVisibleRows(table);
        const shiftDocs = activeSheet.slots.map((sl) =>
          docs.find((d) => d._id === docId(activeSheet.id, date, sl))
        );

        const isColForMetric = (c, m) => c.f === m || (m === 'kwh' && (c.f === 'mwh' || c.k === 'tvm_mwh' || c.k === 'tvm_mwh2'));
        const activeCol = table.cols.find((c) => isColForMetric(c, metric)) || table.cols[0];

        return (
          <div key={table.id} className="glass-card">
            <div className="card-header">
              <div className="card-title">
                <span>
                  {activeSheet.name} · {table.title}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>
                  [{table.raw ? (table.id === 'torrent' ? 'DAILY' : 'PER SHIFT') : (metric?.toUpperCase() || activeCol?.l || 'METRIC')}]
                </span>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  {activeSheet.mode === 'snapshot' ? (
                    <tr>
                      <th className="l" style={{ width: '220px' }}>Location</th>
                      {activeSheet.slots.map((sl, i) => {
                        const d = shiftDocs[i];
                        return (
                          <th key={sl} className="gb">
                            Shift {i + 1}
                            {d && (
                              <span className="delta-hint">
                                {d.time} · {d.operator}
                              </span>
                            )}
                          </th>
                        );
                      })}
                      {isEnergy(activeCol) && <th>Used (Shift 3 − Shift 1)</th>}
                    </tr>
                  ) : table.raw ? (
                    <tr>
                      <th className="l" style={{ width: '120px' }}>{table.id === 'torrent' ? 'Meter' : 'Shift'}</th>
                      {table.cols.map((c) => (
                        <th key={c.k} className="gb">
                          {c.l}
                        </th>
                      ))}
                    </tr>
                  ) : (
                    <tr>
                      <th className="l" style={{ width: '120px' }}>Hour</th>
                      {table.cols
                        .filter((c) => isColForMetric(c, metric))
                        .map((c) => (
                          <th key={c.k} className="gb">
                            {c.g}
                          </th>
                        ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {visibleRows.map(({ r, div }) => {
                    if (r.head) {
                      return (
                        <tr key={r.id} className="subhead">
                          <td colSpan={activeSheet.slots.length + 2}>{r.label}</td>
                        </tr>
                      );
                    }

                    if (activeSheet.mode === 'snapshot') {
                      const vals = [];
                      return (
                        <tr key={r.id} className={div ? 'div' : ''}>
                          <td className="name">
                            {r.sn && <span className="sno-badge">{r.sn}</span>}
                            <span style={{ fontWeight: r.kind === 'incomer' ? 700 : 400 }}>
                              {r.label}
                            </span>
                          </td>
                          {activeSheet.slots.map((sl, i) => {
                            const d = shiftDocs[i];
                            const docKey = docId(activeSheet.id, date, sl);
                            const rowKey = `${table.id}:${r.id}`;
                            const pendingVal = edits[docKey]?.[rowKey]?.[activeCol.k];
                            const savedVal = d?.rows?.[rowKey]?.[activeCol.k] ?? '';
                            const displayVal = pendingVal !== undefined ? pendingVal : savedVal;

                            if (num(displayVal) != null) vals.push(num(displayVal));

                            return (
                              <td key={sl} className="gb">
                                {isEditing && d ? (
                                  <input
                                    className="num-input"
                                    value={displayVal}
                                    onChange={(e) =>
                                      handleEditCell(docKey, rowKey, activeCol.k, e.target.value)
                                    }
                                  />
                                ) : (
                                  <span>{displayVal || '–'}</span>
                                )}
                              </td>
                            );
                          })}
                          {isEnergy(activeCol) && (
                            <td style={{ fontWeight: 600 }}>
                              {vals.length > 1
                                ? (vals[vals.length - 1] - vals[0]).toFixed(2)
                                : '–'}
                            </td>
                          )}
                        </tr>
                      );
                    } else if (table.raw) {
                      const d = shiftDocs[0];
                      return (
                        <tr key={r.id}>
                          <td className="name">{r.label}</td>
                          {table.cols.map((c) => {
                            const docKey = docId(activeSheet.id, date, 'day');
                            const rowKey = `${table.id}:${r.id}`;
                            const pendingVal = edits[docKey]?.[rowKey]?.[c.k];
                            const savedVal = d?.rows?.[rowKey]?.[c.k] ?? '';
                            const displayVal = pendingVal !== undefined ? pendingVal : savedVal;

                            return (
                              <td key={c.k} className="gb">
                                {isEditing && d ? (
                                  <input
                                    className="num-input"
                                    value={displayVal}
                                    onChange={(e) =>
                                      handleEditCell(docKey, rowKey, c.k, e.target.value)
                                    }
                                  />
                                ) : (
                                  <span>{displayVal || '–'}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    } else {
                      // Hourly table
                      const d = shiftDocs[0];
                      const targetCols = table.cols.filter((c) => isColForMetric(c, metric));
                      return (
                        <tr key={r.id}>
                          <td className="name">{r.label}</td>
                          {targetCols.map((c) => {
                            const docKey = docId(activeSheet.id, date, 'day');
                            const rowKey = `${table.id}:${r.id}`;
                            const pendingVal = edits[docKey]?.[rowKey]?.[c.k];
                            const savedVal = d?.rows?.[rowKey]?.[c.k] ?? '';
                            const displayVal = pendingVal !== undefined ? pendingVal : savedVal;

                            return (
                              <td key={c.k} className="gb">
                                {isEditing && d ? (
                                  <input
                                    className="num-input"
                                    value={displayVal}
                                    onChange={(e) =>
                                      handleEditCell(docKey, rowKey, c.k, e.target.value)
                                    }
                                  />
                                ) : (
                                  <span>{displayVal || '–'}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}





      {/* Corrections Audit Log Card */}
      <div className="glass-card">
        <div className="card-header">
          <div className="card-title">
            <History size={16} />
            <span>Audit Trail & Engineer Corrections Log ({allCorrections.length})</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="l">When</th>
                <th className="l">Substation</th>
                <th>Date</th>
                <th>Shift</th>
                <th className="l">Field / Location</th>
                <th>Previous</th>
                <th>Corrected To</th>
                <th className="l">Corrected By</th>
              </tr>
            </thead>
            <tbody>
              {allCorrections.length ? (
                allCorrections.map((entry, idx) => (
                  <tr key={idx}>
                    <td className="l">{new Date(entry.at).toLocaleString()}</td>
                    <td className="l">{entry.d.substation || entry.d.sheet}</td>
                    <td>{entry.d.date}</td>
                    <td>{entry.d.slot}</td>
                    <td className="l">{entry.rk} · {entry.ck}</td>
                    <td style={{ color: 'var(--status-bad)', textDecoration: 'line-through' }}>
                      {entry.from}
                    </td>
                    <td style={{ color: 'var(--status-ok)', fontWeight: 600 }}>{entry.to}</td>
                    <td className="l">{entry.by}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No corrections recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Submissions */}
      <div className="glass-card">
        <div className="card-header">
          <div className="card-title">
            <CheckCircle size={16} />
            <span>Recent Logbook Submissions</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="l">Substation / Sheet</th>
                <th>Date</th>
                <th>Shift</th>
                <th>Time</th>
                <th className="l">Operator</th>
                <th>Cells Filled</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {recentSubmissions.map((d) => (
                <tr key={d._id}>
                  <td className="name">{d.panelName || d.substation || d.sheet}</td>
                  <td>{d.date}</td>
                  <td>{d.slot === 'day' ? 'Full Day' : d.slot}</td>
                  <td>{d.time || '–'}</td>
                  <td className="l">{d.operator || 'Unknown'}</td>
                  <td>{d.filled ?? '–'}</td>
                  <td>{new Date(d.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
