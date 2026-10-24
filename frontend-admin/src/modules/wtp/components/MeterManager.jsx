import { useState, useMemo } from 'react';
import { api } from '../api';
import { GROUPS } from '../config';

export default function MeterManager({ blockMeters = [], stationMeters = [], reload }) {
  const [subTab, setSubTab] = useState('wsc'); // 'wsc' | 'stp' | 'block'
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // WSC meter form state
  const [wscStation, setWscStation] = useState('wtp'); // 'wtp' for WSC-II, 'stp' for WSC-I, 'wsc3' for WSC-III
  const [wscGroup, setWscGroup] = useState('WSC-II Hostel');
  const [wscLabel, setWscLabel] = useState('');
  const [wscUnit, setWscUnit] = useState('CUM');
  const [wscCum, setWscCum] = useState(true);
  const [wscCoef, setWscCoef] = useState('1');

  // STP meter form state
  const [stpGroup, setStpGroup] = useState('STP ultra filtration');
  const [stpLabel, setStpLabel] = useState('');
  const [stpUnit, setStpUnit] = useState('CUM');
  const [stpCum, setStpCum] = useState(true);
  const [stpCoef, setStpCoef] = useState('1');

  // Block meter form state
  const nextSr = useMemo(() => {
    if (!blockMeters.length) return 1;
    return Math.max(...blockMeters.map((m) => m.sr || 0)) + 1;
  }, [blockMeters]);

  const [blockSr, setBlockSr] = useState(String(nextSr));
  const [blockName, setBlockName] = useState('');
  const [blockMeterNo, setBlockMeterNo] = useState('');
  const [blockSearch, setBlockSearch] = useState('');

  // Built-in WSC meters
  const defaultWsc = useMemo(() => {
    return GROUPS.filter((g) =>
      g.name.includes('WSC') || g.st === 'wsc3'
    ).flatMap((g) => g.fields.map((f) => ({ ...f, groupName: g.name, isDefault: true })));
  }, []);

  // Built-in STP meters (excluding WSC-I which is in WSC tab)
  const defaultStp = useMemo(() => {
    return GROUPS.filter((g) =>
      g.st === 'stp' && !g.name.includes('WSC') && !g.name.includes('Chlorine')
    ).flatMap((g) => g.fields.map((f) => ({ ...f, groupName: g.name, isDefault: true })));
  }, []);

  // Custom WSC meters
  const customWsc = useMemo(() => {
    return stationMeters.filter((m) =>
      m.station === 'wsc3' ||
      (m.station === 'wtp' && m.groupName?.includes('WSC')) ||
      (m.station === 'stp' && m.groupName?.includes('WSC'))
    );
  }, [stationMeters]);

  // Custom STP meters
  const customStp = useMemo(() => {
    return stationMeters.filter((m) =>
      m.station === 'stp' && !m.groupName?.includes('WSC')
    );
  }, [stationMeters]);

  // Handle Add WSC Meter
  const handleAddWsc = async (e) => {
    e.preventDefault();
    if (!wscLabel.trim()) return setMsg({ err: 'Meter name is required' });
    setBusy(true);
    setMsg(null);
    try {
      await api.addStationMeter({
        label: wscLabel.trim(),
        station: wscStation,
        groupName: wscGroup.trim(),
        unit: wscUnit.trim(),
        cum: wscCum,
        coef: parseFloat(wscCoef) || 1,
      });
      setMsg({ ok: `WSC Meter "${wscLabel.trim()}" added successfully!` });
      setWscLabel('');
      await reload();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Handle Add STP Meter
  const handleAddStp = async (e) => {
    e.preventDefault();
    if (!stpLabel.trim()) return setMsg({ err: 'Meter name is required' });
    setBusy(true);
    setMsg(null);
    try {
      await api.addStationMeter({
        label: stpLabel.trim(),
        station: 'stp',
        groupName: stpGroup.trim(),
        unit: stpUnit.trim(),
        cum: stpCum,
        coef: parseFloat(stpCoef) || 1,
      });
      setMsg({ ok: `STP Meter "${stpLabel.trim()}" added successfully!` });
      setStpLabel('');
      await reload();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Handle Add Block Meter
  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (!blockName.trim() || !blockMeterNo.trim()) {
      return setMsg({ err: 'Block name and Meter number are required' });
    }
    setBusy(true);
    setMsg(null);
    try {
      const srNum = parseInt(blockSr, 10) || nextSr;
      await api.addBlockMeter({
        sr: srNum,
        block: blockName.trim(),
        meterNo: blockMeterNo.trim(),
      });
      setMsg({ ok: `Block Meter "${blockName.trim()}" (Sr ${srNum}) added successfully!` });
      setBlockName('');
      setBlockMeterNo('');
      setBlockSr(String(srNum + 1));
      await reload();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Handle Delete Station Meter
  const handleDeleteStationMeter = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.deleteStationMeter(id);
      setMsg({ ok: `Meter "${name}" removed.` });
      await reload();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Handle Delete Block Meter
  const handleDeleteBlockMeter = async (sr, block) => {
    if (!window.confirm(`Are you sure you want to delete Sr ${sr} (${block})?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.deleteBlockMeter(sr);
      setMsg({ ok: `Block Meter Sr ${sr} (${block}) removed.` });
      await reload();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Filter block meters for search
  const filteredBlockMeters = useMemo(() => {
    const q = blockSearch.toLowerCase().trim();
    if (!q) return blockMeters;
    return blockMeters.filter((m) =>
      String(m.sr).includes(q) ||
      m.block?.toLowerCase().includes(q) ||
      m.meterNo?.toLowerCase().includes(q)
    );
  }, [blockMeters, blockSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub tabs: WSC, STP, Block */}
      <div className="seg">
        <button
          type="button"
          className={subTab === 'wsc' ? 'on' : ''}
          onClick={() => { setSubTab('wsc'); setMsg(null); }}
        >
          WSC Meters ({defaultWsc.length + customWsc.length})
        </button>
        <button
          type="button"
          className={subTab === 'stp' ? 'on' : ''}
          onClick={() => { setSubTab('stp'); setMsg(null); }}
        >
          STP Meters ({defaultStp.length + customStp.length})
        </button>
        <button
          type="button"
          className={subTab === 'block' ? 'on' : ''}
          onClick={() => { setSubTab('block'); setMsg(null); setBlockSr(String(nextSr)); }}
        >
          Block Meters ({blockMeters.length})
        </button>
      </div>

      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      {/* ---------------- WSC METERS SECTION ---------------- */}
      {subTab === 'wsc' && (
        <>
          <div className="card">
            <h2>+ Add New WSC Meter</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Add a new meter for WSC-I (STP Plant), WSC-II (WTP Plant), or WSC-III (Housing). It will appear in operator shift entry and reports.
            </p>
            <form onSubmit={handleAddWsc}>
              <div className="row">
                <label>
                  WSC Plant / Station
                  <select
                    value={wscStation}
                    onChange={(e) => {
                      const st = e.target.value;
                      setWscStation(st);
                      if (st === 'wtp') setWscGroup('WSC-II Hostel');
                      else if (st === 'stp') setWscGroup('WSC-I');
                      else if (st === 'wsc3') setWscGroup('WSC-III Housing');
                    }}
                  >
                    <option value="wtp">WSC-II (WTP Plant / Hostel)</option>
                    <option value="stp">WSC-I (STP Plant)</option>
                    <option value="wsc3">WSC-III (Housing)</option>
                  </select>
                </label>

                <label>
                  Section / Group
                  <input
                    value={wscGroup}
                    onChange={(e) => setWscGroup(e.target.value)}
                    placeholder="e.g. WSC-II Hostel"
                    list="wsc-group-list"
                    required
                  />
                  <datalist id="wsc-group-list">
                    {wscStation === 'wsc3' ? (
                      <>
                        <option value="WSC-III Housing" />
                        <option value="Chlorine used this shift" />
                      </>
                    ) : wscStation === 'stp' ? (
                      <>
                        <option value="WSC-I" />
                        <option value="Irrigation" />
                        <option value="Sewage pumping" />
                        <option value="STP ultra filtration" />
                      </>
                    ) : (
                      <>
                        <option value="WSC-II Hostel" />
                        <option value="Incoming & treatment" />
                      </>
                    )}
                  </datalist>
                </label>

                <label>
                  Meter Name / Label
                  <input
                    value={wscLabel}
                    onChange={(e) => setWscLabel(e.target.value)}
                    placeholder="e.g. WSC-2 New Hostel Wing Fresh"
                    required
                  />
                </label>

                <label>
                  Unit
                  <select value={wscUnit} onChange={(e) => setWscUnit(e.target.value)}>
                    <option value="CUM">CUM (m³)</option>
                    <option value="USMG">USMG (Reported in CUM)</option>
                    <option value="MLD">MLD</option>
                    <option value="Litre">Litre</option>
                    <option value="kg">kg</option>
                    <option value="gm">gm</option>
                  </select>
                </label>

                <label>
                  Multiplier (Coef)
                  <input
                    type="number"
                    step="any"
                    value={wscCoef}
                    onChange={(e) => setWscCoef(e.target.value)}
                    placeholder="1 or 3.7854"
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 16px' }}>
                <input
                  type="checkbox"
                  id="wscCum"
                  checked={wscCum}
                  onChange={(e) => setWscCum(e.target.checked)}
                />
                <label htmlFor="wscCum" style={{ cursor: 'pointer', margin: 0 }}>
                  Cumulative flow meter (reports consumption as difference between consecutive readings)
                </label>
              </div>

              <button className="primary" disabled={busy}>
                {busy ? 'Adding…' : '+ Add WSC Meter'}
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Current WSC Meters List</h2>
            <div className="scroll tall">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Station</th>
                    <th style={{ textAlign: 'left' }}>Group</th>
                    <th style={{ textAlign: 'left' }}>Meter Name</th>
                    <th>Unit</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Default built-in WSC meters */}
                  {defaultWsc.map((f) => (
                    <tr key={f.k}>
                      <td style={{ textAlign: 'left' }}>{f.st === 'wsc3' ? 'WSC-III' : f.st === 'wtp' ? 'WSC-II (WTP)' : 'WSC-I (STP)'}</td>
                      <td style={{ textAlign: 'left' }}>{f.groupName}</td>
                      <td style={{ textAlign: 'left' }}><strong>{f.label}</strong></td>
                      <td>{f.unit}</td>
                      <td>{f.cum ? 'Cumulative' : 'Instant'}</td>
                      <td><span style={{ fontSize: '11px', background: 'var(--field)', padding: '2px 6px', borderRadius: '4px' }}>System Default</span></td>
                      <td>–</td>
                    </tr>
                  ))}
                  {/* Custom added WSC meters */}
                  {customWsc.map((m) => (
                    <tr key={m._id || m.k}>
                      <td style={{ textAlign: 'left' }}>{m.station === 'wsc3' ? 'WSC-III' : m.station === 'wtp' ? 'WSC-II (WTP)' : 'WSC-I (STP)'}</td>
                      <td style={{ textAlign: 'left' }}>{m.groupName}</td>
                      <td style={{ textAlign: 'left' }}><strong>{m.label}</strong></td>
                      <td>{m.unit}</td>
                      <td>{m.cum ? 'Cumulative' : 'Instant'}</td>
                      <td><span style={{ fontSize: '11px', background: 'color-mix(in srgb, var(--water) 20%, transparent)', color: 'var(--water)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Custom Added</span></td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteStationMeter(m._id, m.label)}
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--amber)', border: '1px solid var(--amber)', background: 'transparent' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---------------- STP METERS SECTION ---------------- */}
      {subTab === 'stp' && (
        <>
          <div className="card">
            <h2>+ Add New STP Meter</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Add a new meter for Sewage Treatment Plant (Filtration, Sewage Pumping, Irrigation, etc.).
            </p>
            <form onSubmit={handleAddStp}>
              <div className="row">
                <label>
                  STP Section / Group
                  <select
                    value={stpGroup}
                    onChange={(e) => setStpGroup(e.target.value)}
                  >
                    <option value="STP ultra filtration">STP ultra filtration</option>
                    <option value="Sewage pumping">Sewage pumping</option>
                    <option value="Irrigation">Irrigation</option>
                    <option value="STP General">STP General / Others</option>
                  </select>
                </label>

                <label>
                  Meter Name / Label
                  <input
                    value={stpLabel}
                    onChange={(e) => setStpLabel(e.target.value)}
                    placeholder="e.g. STP SKID-3 Ultra Filtration"
                    required
                  />
                </label>

                <label>
                  Unit
                  <select value={stpUnit} onChange={(e) => setStpUnit(e.target.value)}>
                    <option value="CUM">CUM (m³)</option>
                    <option value="USMG">USMG (Reported in CUM)</option>
                    <option value="MLD">MLD</option>
                    <option value="kg">kg</option>
                    <option value="gm">gm</option>
                  </select>
                </label>

                <label>
                  Multiplier (Coef)
                  <input
                    type="number"
                    step="any"
                    value={stpCoef}
                    onChange={(e) => setStpCoef(e.target.value)}
                    placeholder="1"
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 16px' }}>
                <input
                  type="checkbox"
                  id="stpCum"
                  checked={stpCum}
                  onChange={(e) => setStpCum(e.target.checked)}
                />
                <label htmlFor="stpCum" style={{ cursor: 'pointer', margin: 0 }}>
                  Cumulative flow meter (reports consumption as difference between consecutive readings)
                </label>
              </div>

              <button className="primary" disabled={busy}>
                {busy ? 'Adding…' : '+ Add STP Meter'}
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Current STP Meters List</h2>
            <div className="scroll tall">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Group</th>
                    <th style={{ textAlign: 'left' }}>Meter Name</th>
                    <th>Unit</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Default built-in STP meters */}
                  {defaultStp.map((f) => (
                    <tr key={f.k}>
                      <td style={{ textAlign: 'left' }}>{f.groupName}</td>
                      <td style={{ textAlign: 'left' }}><strong>{f.label}</strong></td>
                      <td>{f.unit}</td>
                      <td>{f.cum ? 'Cumulative' : 'Instant'}</td>
                      <td><span style={{ fontSize: '11px', background: 'var(--field)', padding: '2px 6px', borderRadius: '4px' }}>System Default</span></td>
                      <td>–</td>
                    </tr>
                  ))}
                  {/* Custom added STP meters */}
                  {customStp.map((m) => (
                    <tr key={m._id || m.k}>
                      <td style={{ textAlign: 'left' }}>{m.groupName}</td>
                      <td style={{ textAlign: 'left' }}><strong>{m.label}</strong></td>
                      <td>{m.unit}</td>
                      <td>{m.cum ? 'Cumulative' : 'Instant'}</td>
                      <td><span style={{ fontSize: '11px', background: 'color-mix(in srgb, var(--water) 20%, transparent)', color: 'var(--water)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Custom Added</span></td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteStationMeter(m._id, m.label)}
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--amber)', border: '1px solid var(--amber)', background: 'transparent' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---------------- BLOCK METERS SECTION ---------------- */}
      {subTab === 'block' && (
        <>
          <div className="card">
            <h2>+ Add New Monthly Block Meter</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Add a residential, hostel, or academic block water meter. Operators record readings for these meters every month.
            </p>
            <form onSubmit={handleAddBlock}>
              <div className="row">
                <label style={{ maxWidth: '140px' }}>
                  Sr No.
                  <input
                    type="number"
                    value={blockSr}
                    onChange={(e) => setBlockSr(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Block Name
                  <input
                    value={blockName}
                    onChange={(e) => setBlockName(e.target.value)}
                    placeholder="e.g. K-Hostel or Guest House"
                    required
                  />
                </label>

                <label>
                  Meter Serial Number
                  <input
                    value={blockMeterNo}
                    onChange={(e) => setBlockMeterNo(e.target.value)}
                    placeholder="e.g. 24/03/12425"
                    required
                  />
                </label>
              </div>

              <div style={{ marginTop: '14px' }}>
                <button className="primary" disabled={busy}>
                  {busy ? 'Adding…' : '+ Add Block Meter'}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="row" style={{ alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0 }}>Existing Block Meters ({blockMeters.length})</h2>
              <input
                style={{ maxWidth: '280px', marginLeft: 'auto' }}
                value={blockSearch}
                onChange={(e) => setBlockSearch(e.target.value)}
                placeholder="Search block or meter no..."
              />
            </div>
            <div className="scroll tall">
              <table className="block-table">
                <thead>
                  <tr>
                    <th className="col-sr">Sr</th>
                    <th className="col-block">Block</th>
                    <th className="col-meter">Meter no.</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlockMeters.map((m) => (
                    <tr key={m.sr}>
                      <td className="col-sr">{m.sr}</td>
                      <td className="col-block"><strong>{m.block}</strong></td>
                      <td className="col-meter" style={{ fontFamily: 'monospace' }}>{m.meterNo}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteBlockMeter(m.sr, m.block)}
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--amber)', border: '1px solid var(--amber)', background: 'transparent' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
