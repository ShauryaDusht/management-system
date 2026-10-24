import React, { useState, useEffect, useMemo } from 'react';
import { Save, Clock, Calendar, CheckCircle, AlertTriangle, AlertCircle, Check } from 'lucide-react';
import {
  BASE_SHEETS,
  mkSub,
  todayDate,
  nowHM,
  docId,
  orderKey,
  isEnergy,
  num,
  flagInfo,
} from './sheetsData';
import { SubstationApi as ApiClient } from './substationApi';

export default function OperatorView({
  docs,
  layout,
  user,
  onSaveDoc,
}) {
  const [section, setSection] = useState('HT');
  const [sheetId, setSheetId] = useState('sport_ht');
  const [date, setDate] = useState(todayDate());
  const [slot, setSlot] = useState('R1');
  const [time, setTime] = useState(nowHM());
  const [operator, setOperator] = useState(user?.name || localStorage.getItem('sslog_operator') || '');
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Combine static sheets with dynamic LT substations from layout config
  const allSheets = useMemo(() => {
    const list = [...BASE_SHEETS];
    (layout.substations || [])
      .filter((x) => !x.removed && x.id !== 'nlib')
      .forEach((x) => {
        if (!list.find((s) => s.id === x.id)) {
          list.push(mkSub(x));
        }
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

  // Switch sheet if current not in section
  useEffect(() => {
    if (activeSheet.section !== section && sheetsInSection.length > 0) {
      setSheetId(sheetsInSection[0].id);
      setSlot(sheetsInSection[0].slots[0]);
    } else if (activeSheet.mode === 'hourly' || activeSheet.id === 'newht' || activeSheet.id === 'oldht') {
      if (slot !== 'day') setSlot('day');
    }
  }, [section, sheetsInSection, activeSheet, slot]);

  // Current doc id
  const currentDocId = docId(activeSheet.id, date, slot);
  const savedDoc = useMemo(() => docs.find((d) => d._id === currentDocId || (d.sheet === activeSheet.id && d.date === date && d.slot === slot)), [docs, currentDocId, activeSheet.id, date, slot]);

  // Load draft when sheet, date, or slot changes
  useEffect(() => {
    if (savedDoc) {
      setDraft(JSON.parse(JSON.stringify(savedDoc.rows || {})));
      setTime(savedDoc.time || nowHM());
      if (savedDoc.operator && !operator) setOperator(savedDoc.operator);
    } else {
      setDraft({});
      setTime(nowHM());
    }
    setDirty(false);
    setSaveMsg('');
  }, [currentDocId, savedDoc]);

  // Calculate dynamic rows with incomers and feeders
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
      return (
        (draft && draft[k] && Object.values(draft[k]).some((v) => v !== '' && v != null)) ||
        docs.some((d) => d.sheet === activeSheet.id && d.rows && d.rows[k] && Object.values(d.rows[k]).some((v) => v !== '' && v != null))
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

  // Find previous value for energy check and reference placeholder
  const latestBefore = (sheet, curDate, curSlot) => {
    const cur = orderKey(curDate, curSlot);
    let best = null;
    let bestKey = '';
    docs.forEach((d) => {
      if (d.sheet !== sheet) return;
      const k = orderKey(d.date, d.slot);
      if (k < cur && k > bestKey) {
        best = d;
        bestKey = k;
      }
    });
    return best;
  };

  const getPrevValue = (t, ri, col, rowList) => {
    if (t.hourly) {
      for (let j = ri - 1; j >= 0; j--) {
        const v = num(draft[t.id + ':' + t.rows[j].id]?.[col.k]);
        if (v != null) return v;
      }
      const pd = latestBefore(activeSheet.id, date, slot);
      if (pd) {
        for (let j = t.rows.length - 1; j >= 0; j--) {
          const v = num(pd.rows?.[t.id + ':' + t.rows[j].id]?.[col.k]);
          if (v != null) return v;
        }
      }
      return null;
    }
    const pd = latestBefore(activeSheet.id, date, slot);
    if (!pd) return null;
    const targetRow = rowList[ri]?.r;
    return targetRow ? num(pd.rows?.[t.id + ':' + targetRow.id]?.[col.k]) : null;
  };

  const handleCellChange = (tableId, rowId, colKey, val, colObj, prevVal) => {
    setDraft((prev) => {
      const next = { ...prev };
      const rowKey = `${tableId}:${rowId}`;
      next[rowKey] = { ...(next[rowKey] || {}), [colKey]: val.trim() };
      return next;
    });
    setDirty(true);
    setSaveMsg('');
  };

  const totalCells = useMemo(() => {
    return activeSheet.tables.reduce((acc, t) => {
      const rows = getVisibleRows(t).filter((x) => !x.r.head);
      return acc + rows.length * t.cols.length;
    }, 0);
  }, [activeSheet, draft, docs]);

  const filledCount = useMemo(() => {
    let n = 0;
    Object.values(draft || {}).forEach((row) => {
      Object.values(row || {}).forEach((v) => {
        if (v !== '' && v != null) n++;
      });
    });
    return n;
  }, [draft]);

  const handleSave = async () => {
    if (!operator.trim()) {
      setSaveMsg('Please enter your operator name before saving.');
      return;
    }

    let badCount = 0;
    const cleanedRows = {};

    activeSheet.tables.forEach((t) => {
      const rows = getVisibleRows(t);
      rows.forEach(({ r, ri }) => {
        t.cols.forEach((c) => {
          const v = draft[t.id + ':' + r.id]?.[c.k];
          if (v === '' || v == null) return;
          if (!c.txt && num(v) == null) badCount++;
          if (c.f === 'pf' && num(v) != null && (num(v) < 0 || num(v) > 1)) badCount++;
          (cleanedRows[t.id + ':' + r.id] = cleanedRows[t.id + ':' + r.id] || {})[c.k] = v;
        });
      });
    });

    if (badCount > 0) {
      setSaveMsg(`${badCount} cell(s) contain invalid numbers (highlighted in red). Please correct them.`);
      return;
    }

    if (!filledCount) {
      setSaveMsg('No readings entered. Please fill at least one cell.');
      return;
    }

    setSaving(true);
    const docTime = time || nowHM();
    const doc = {
      _id: currentDocId,
      sheet: activeSheet.id,
      date,
      slot,
      time: docTime,
      operator: operator.trim(),
      updatedAt: Date.now(),
      rows: cleanedRows,
      filled: filledCount,
      total: totalCells,
      panelType: activeSheet.section,
      section: activeSheet.section,
      substation: activeSheet.name,
      panelName: activeSheet.full || activeSheet.name,
    };

    try {
      await onSaveDoc(doc);
      setDirty(false);
      setSaveMsg(`Successfully saved at ${new Date().toLocaleTimeString()}!`);
    } catch (err) {
      setSaveMsg(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Top Controls Bar */}
      <div className="control-bar">
        <div className="field-group">
          <label className="field-label">Panel Type</label>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${section === 'HT' ? 'active' : ''}`}
              onClick={() => {
                setSection('HT');
                const htSheets = allSheets.filter((s) => s.section === 'HT');
                if (htSheets.length) {
                  setSheetId(htSheets[0].id);
                  setSlot(htSheets[0].slots[0]);
                }
              }}
            >
              HT Panel (11 kV)
            </button>
            <button
              className={`segmented-btn ${section === 'LT' ? 'active' : ''}`}
              onClick={() => {
                setSection('LT');
                const ltSheets = allSheets.filter((s) => s.section === 'LT');
                if (ltSheets.length) {
                  setSheetId(ltSheets[0].id);
                  setSlot(ltSheets[0].slots[0]);
                }
              }}
            >
              LT Panel (415 V)
            </button>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Substation</label>
          <select
            className="field-select"
            value={sheetId}
            onChange={(e) => {
              setSheetId(e.target.value);
              const sh = allSheets.find((s) => s.id === e.target.value);
              if (sh) setSlot(sh.slots[0]);
            }}
          >
            {sheetsInSection.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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

        {activeSheet.mode === 'snapshot' ? (
          <>
            <div className="field-group">
              <label className="field-label">Shift</label>
              <select
                className="field-select"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
              >
                {activeSheet.slots.map((s, i) => {
                  const isSubmitted = docs.some((d) => d._id === docId(activeSheet.id, date, s));
                  return (
                    <option key={s} value={s}>
                      Shift {i + 1} {isSubmitted ? '✓' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">
                <Clock size={13} /> Time
              </label>
              <input
                type="time"
                className="field-input"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
          </>
        ) : (
          <div className="field-group">
            <label className="field-label">Logging Mode</label>
            <div
              className="chip on"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: '36px',
                boxSizing: 'border-box',
                background: 'rgba(124, 58, 237, 0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(124, 58, 237, 0.3)',
              }}
            >
              ⏱️ Hourly Log (24 Hours)
            </div>
          </div>
        )}

        <div className="field-group" style={{ flex: '1 1 180px' }}>
          <label className="field-label">Operator Name</label>
          <input
            type="text"
            className="field-input"
            placeholder="Your name"
            value={operator}
            onChange={(e) => {
              setOperator(e.target.value);
              try { localStorage.setItem('sslog_operator', e.target.value); } catch (_) {}
            }}
          />
        </div>
      </div>

      {/* Substation Navigation Pills */}
      <div className="pill-grid">
        {sheetsInSection.map((s) => {
          const isSelected = s.id === activeSheet.id;
          const isHourly = s.mode === 'hourly' || s.id === 'newht' || s.id === 'oldht';
          const shiftDoneCount = s.slots.filter((sl) =>
            docs.some((d) => d._id === docId(s.id, date, sl))
          ).length;
          const hourlyDone = docs.some((d) => d._id === docId(s.id, date, 'day') || (d.sheet === s.id && d.date === date));

          return (
            <button
              key={s.id}
              className={`substation-pill ${isSelected ? 'active' : ''}`}
              onClick={() => {
                setSheetId(s.id);
                setSlot(s.slots[0]);
              }}
            >
              <span>{s.name}</span>
              {!isHourly ? (
                <span
                  className={`chip ${shiftDoneCount > 0 ? 'on' : ''}`}
                  style={{ fontSize: '10px', padding: '1px 6px' }}
                >
                  {shiftDoneCount}/{s.slots.length}
                </span>
              ) : (
                <span
                  className={`chip ${hourlyDone ? 'on' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    background: hourlyDone ? 'var(--status-ok-bg)' : 'rgba(124, 58, 237, 0.2)',
                    color: hourlyDone ? 'var(--status-ok)' : '#c4b5fd',
                    border: '1px solid rgba(124, 58, 237, 0.35)',
                  }}
                >
                  Hourly
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status banner if already saved */}
      {savedDoc && (
        <div className="banner ok">
          <CheckCircle size={18} />
          <span>
            {activeSheet.mode === 'hourly' || activeSheet.id === 'newht' || activeSheet.id === 'oldht' ? 'Hourly readings logged' : 'Shift logged'} by <strong>{savedDoc.operator || 'Unknown'}</strong> on{' '}
            {new Date(savedDoc.updatedAt).toLocaleString()}. You can update readings and save again.
          </span>
        </div>
      )}

      {/* Tables Display */}
      {activeSheet.tables.map((table) => {
        const visibleRows = getVisibleRows(table);
        if (!visibleRows.length) {
          return (
            <div key={table.id} className="glass-card">
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No incomers or feeders added to this panel yet. Engineers can configure feeders in the Engineer tab.
              </div>
            </div>
          );
        }

        const hasGrouping = table.cols[0]?.g;
        const colGroups = [];
        if (hasGrouping) {
          table.cols.forEach((col) => {
            const last = colGroups[colGroups.length - 1];
            if (last && last.g === col.g) last.span++;
            else colGroups.push({ g: col.g, span: 1 });
          });
        }

        return (
          <div key={table.id} className="glass-card">
            <div className="card-header">
              <div className="card-title">
                <span>{table.title}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({activeSheet.name})
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {visibleRows.filter((x) => !x.r.head).length} rows
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  {hasGrouping ? (
                    <>
                      <tr>
                        <th className="l" rowSpan={2} style={{ width: '180px' }}>
                          {table.hourly ? 'Hour' : 'Feeder / Location'}
                        </th>
                        {colGroups.map((grp, gi) => (
                          <th key={gi} colSpan={grp.span} className="gb" style={{ textAlign: 'center' }}>
                            {grp.g}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {table.cols.map((col, ci) => (
                          <th
                            key={col.k}
                            className={table.cols[ci - 1]?.g !== col.g && ci > 0 ? 'gb' : ''}
                          >
                            {col.l}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th className="l" style={{ width: '220px' }}>
                        {table.id === 'torrent' || table.title?.toLowerCase().includes('torrent')
                          ? 'Meter'
                          : table.id === 'shift' || table.title?.toLowerCase().includes('shift')
                          ? 'Shift'
                          : 'Location / Feeder'}
                      </th>
                      {table.cols.map((col) => (
                        <th key={col.k}>{col.l}</th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {visibleRows.map(({ r, ri, div }) => {
                    if (r.head) {
                      return (
                        <tr key={r.id} className="subhead">
                          <td colSpan={table.cols.length + 1}>{r.label}</td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={r.id} className={div ? 'div' : ''}>
                        <td className="name">
                          {r.sn && <span className="sno-badge">{r.sn}</span>}
                          <span style={{ fontWeight: r.kind === 'incomer' ? 700 : 400 }}>
                            {r.label}
                          </span>
                        </td>
                        {table.cols.map((col, ci) => {
                          const cellVal = draft[table.id + ':' + r.id]?.[col.k] ?? '';
                          const prevVal = isEnergy(col) ? getPrevValue(table, ri, col, visibleRows) : null;
                          const [flag, why] = flagInfo(col, cellVal, prevVal);
                          const isGroupBorder = table.cols[ci - 1]?.g !== col.g && ci > 0;

                          return (
                            <td key={col.k} className={isGroupBorder ? 'gb' : ''}>
                              <input
                                className={`num-input ${col.txt ? 'txt' : ''} ${flag}`}
                                type={col.txt ? 'text' : 'text'}
                                inputMode={col.txt ? 'text' : 'decimal'}
                                value={cellVal}
                                placeholder={prevVal != null ? String(prevVal) : ''}
                                title={why || (prevVal != null ? `Previous reading: ${prevVal}` : '')}
                                onChange={(e) =>
                                  handleCellChange(table.id, r.id, col.k, e.target.value, col, prevVal)
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Sticky Bottom Save Bar */}
      <div className="save-bar">
        <div className="save-info">
          <div className="progress-track" title={`${filledCount} of ${totalCells} cells filled`}>
            <div
              className="progress-fill"
              style={{
                width: `${totalCells > 0 ? Math.min(100, (filledCount / totalCells) * 100) : 0}%`,
              }}
            />
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            <strong>{filledCount}</strong> of {totalCells} cells filled
            {dirty && <span style={{ color: 'var(--status-warn)', marginLeft: '6px' }}>• Unsaved changes</span>}
          </span>
          {saveMsg && (
            <span
              style={{
                fontSize: '13px',
                color: saveMsg.includes('Successfully') ? 'var(--status-ok)' : 'var(--status-bad)',
                fontWeight: 500,
              }}
            >
              {saveMsg}
            </span>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} />
          <span>
            {saving
              ? 'Saving readings…'
              : activeSheet.mode === 'hourly' || activeSheet.id === 'newht' || activeSheet.id === 'oldht'
              ? 'Save Hourly Readings (24h)'
              : `Save Shift ${slot} Readings`}
          </span>
        </button>
      </div>
    </div>
  );
}
