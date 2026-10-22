import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  ChevronDown,
  Building2,
  Zap,
  CheckCircle2,
  Sliders,
  FolderPlus,
} from 'lucide-react';
import { BASE_SHEETS, mkSub } from './sheetsData';

export default function LayoutManager({
  layout = {},
  onSaveLayout,
  initialSheetId,
  section = 'LT',
  activeSheet,
  defaultOpen = true,
}) {
  // CRITICAL REQUIREMENT: Strictly render only in LT Panel
  if (section && section !== 'LT') {
    return null;
  }

  // Dropdown menu collapse/expand states
  const [subsOpen, setSubsOpen] = useState(defaultOpen !== undefined ? defaultOpen : true);
  const [incomersOpen, setIncomersOpen] = useState(defaultOpen !== undefined ? defaultOpen : true);

  const [selectedSheetId, setSelectedSheetId] = useState(
    activeSheet?.id || initialSheetId || 'hostel'
  );
  const [newSubName, setNewSubName] = useState('');
  const [newIncName, setNewIncName] = useState('');
  const [feederInputs, setFeederInputs] = useState({});
  const [msg, setMsg] = useState('');

  // Keep selected substation in sync when user clicks an LT tile above or initialSheetId changes
  useEffect(() => {
    if (activeSheet?.id && activeSheet?.section === 'LT') {
      setSelectedSheetId(activeSheet.id);
    } else if (initialSheetId) {
      setSelectedSheetId(initialSheetId);
    }
  }, [activeSheet?.id, activeSheet?.section, initialSheetId]);

  // All LT substations including dynamic ones
  const allSubstations = useMemo(() => {
    const list = BASE_SHEETS.filter((s) => s.section === 'LT');
    (layout.substations || [])
      .filter((x) => !x.removed && x.id !== 'nlib')
      .forEach((x) => {
        if (!list.find((s) => s.id === x.id)) list.push(mkSub(x));
      });
    return list;
  }, [layout]);

  const activeSubstation = useMemo(() => {
    return (
      allSubstations.find((s) => s.id === selectedSheetId) ||
      allSubstations[0]
    );
  }, [allSubstations, selectedSheetId]);

  const customSubstations = useMemo(() => {
    return (layout.substations || []).filter((s) => !s.removed && s.id !== 'nlib');
  }, [layout.substations]);

  const notify = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  // 1. Add Substation
  const handleAddSubstation = async (e) => {
    e?.preventDefault();
    const name = newSubName.trim();
    if (!name) {
      notify('Please enter a substation name first.');
      return;
    }
    const subs = [...(layout.substations || [])];
    const newId = 'nsub_' + Date.now().toString(36);
    subs.push({ id: newId, name });
    await onSaveLayout('substations', subs);
    setSelectedSheetId(newId);
    setNewSubName('');
    setSubsOpen(true);
    notify(`Substation "${name}" added successfully.`);
  };

  // 2. Remove Substation
  const handleRemoveSubstation = async (subId) => {
    const subs = (layout.substations || []).map((x) =>
      x.id === subId ? { ...x, removed: true } : x
    );
    await onSaveLayout('substations', subs);
    notify('Substation removed.');
  };

  // 3. Rename Substation
  const handleRenameSubstation = async (subId, newName) => {
    if (!newName.trim()) return;
    const subs = (layout.substations || []).map((x) =>
      x.id === subId ? { ...x, name: newName.trim() } : x
    );
    await onSaveLayout('substations', subs);
    notify('Substation name updated.');
  };

  // 4. Incomers for the active substation
  const baseAnchors = useMemo(() => {
    const t = activeSubstation?.tables?.[0];
    if (!t) return [];
    return t.rows.filter((r) => r.anchor);
  }, [activeSubstation]);

  const layoutItems = useMemo(() => {
    if (!activeSubstation) return [];
    return (layout[activeSubstation.id] || []).filter((i) => !i.removed);
  }, [layout, activeSubstation]);

  const customIncomers = useMemo(() => {
    return layoutItems.filter((i) => i.kind === 'incomer');
  }, [layoutItems]);

  const getFeedersOf = (parentId) => {
    return layoutItems.filter((i) => i.kind === 'feeder' && i.parent === parentId);
  };

  // 5. Add Incomer
  const handleAddIncomer = async (e) => {
    e?.preventDefault();
    const name = newIncName.trim();
    if (!name) {
      notify('Please enter an incomer name first.');
      return;
    }
    const items = [...(layout[activeSubstation.id] || [])];
    const newId = 'ninc_' + Date.now().toString(36);
    items.push({ id: newId, kind: 'incomer', name });
    await onSaveLayout(activeSubstation.id, items);
    setNewIncName('');
    setIncomersOpen(true);
    notify(`Incomer "${name}" added to ${activeSubstation?.name}.`);
  };

  // 6. Rename Incomer or Outgoing
  const handleRenameItem = async (itemId, newName) => {
    if (!newName.trim()) return;
    const items = (layout[activeSubstation.id] || []).map((x) =>
      x.id === itemId ? { ...x, name: newName.trim() } : x
    );
    await onSaveLayout(activeSubstation.id, items);
    notify('Name updated.');
  };

  // 7. Remove Incomer or Outgoing
  const handleRemoveItem = async (itemId) => {
    const items = (layout[activeSubstation.id] || []).map((x) =>
      x.id === itemId ? { ...x, removed: true } : x
    );
    await onSaveLayout(activeSubstation.id, items);
    notify('Item removed.');
  };

  // 8. Add Outgoing Feeder
  const handleAddFeeder = async (parentId) => {
    const name = (feederInputs[parentId] || '').trim();
    if (!name) {
      notify('Please enter an outgoing feeder name.');
      return;
    }
    const items = [...(layout[activeSubstation.id] || [])];
    const newId = 'nfd_' + Date.now().toString(36);
    items.push({ id: newId, kind: 'feeder', name, parent: parentId });
    await onSaveLayout(activeSubstation.id, items);
    setFeederInputs((prev) => ({ ...prev, [parentId]: '' }));
    notify(`Outgoing "${name}" added.`);
  };

  return (
    <div className="layout-dropdown-container">
      {msg && (
        <div className="banner ok" style={{ marginBottom: '8px' }}>
          <CheckCircle2 size={16} />
          <span>{msg}</span>
        </div>
      )}

      {/* Admin Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '4px 2px',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sliders size={16} />
          <span>Admin Portal: Substation & Incomer Layout Dropdown Menus (LT Panel Only)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => {
              setSubsOpen(true);
              setIncomersOpen(true);
            }}
          >
            Expand Menus
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => {
              setSubsOpen(false);
              setIncomersOpen(false);
            }}
          >
            Collapse Menus
          </button>
        </div>
      </div>

      {/* =========================================================================
          DROPDOWN MENU 1: ADD LT SUBSTATIONS (ADMIN)
          ========================================================================= */}
      <div className={`layout-dropdown-card ${subsOpen ? 'expanded' : ''}`}>
        <button
          type="button"
          className="layout-dropdown-header"
          onClick={() => setSubsOpen(!subsOpen)}
          aria-expanded={subsOpen}
        >
          <div className="layout-header-title">
            <Building2 size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="title-text">Add LT substations (admin)</span>
            <span className="layout-header-badge">
              {customSubstations.length} custom added
            </span>
          </div>
          <div className="layout-header-action">
            <span className="dropdown-toggle-text">
              {subsOpen ? 'Hide' : 'Click to Drop Down'}
            </span>
            <ChevronDown
              className={`chevron-icon ${subsOpen ? 'rotated' : ''}`}
              size={18}
            />
          </div>
        </button>

        {subsOpen && (
          <div className="layout-dropdown-body">
            <p
              style={{
                fontSize: '12.5px',
                color: 'var(--text-muted)',
                marginBottom: '14px',
                lineHeight: '1.5',
              }}
            >
              Add as many LT substations as needed. A new substation appears as a tile above and in the operators' list. Tap its tile, then add its incomers and outgoings in the section below.
            </p>

            {/* Form to add a new substation */}
            <form
              onSubmit={handleAddSubstation}
              style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}
            >
              <input
                type="text"
                className="field-input"
                style={{ flex: 1 }}
                placeholder="Name, e.g. Academic Sub Station 3"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={15} />
                <span>+ Add substation</span>
              </button>
            </form>

            {/* List of custom added substations */}
            {customSubstations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '2px',
                  }}
                >
                  Configured LT Substations ({customSubstations.length}):
                </div>
                {customSubstations.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: 'var(--bg-tertiary)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--glass-border)',
                    }}
                  >
                    <span className="role-pill admin" style={{ fontSize: '10px' }}>
                      Substation
                    </span>
                    <input
                      type="text"
                      className="field-input"
                      style={{ flex: 1, minHeight: '32px', fontSize: '13px' }}
                      defaultValue={sub.name}
                      onBlur={(e) => handleRenameSubstation(sub.id, e.target.value)}
                      aria-label="Substation name"
                    />
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      onClick={() => handleRemoveSubstation(sub.id)}
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  fontStyle: 'italic',
                  padding: '4px 0',
                }}
              >
                No custom substations added yet. Standard base substations (Hostel, Academic 1, Academic 2, Sports Complex, WTP, MRS) are active.
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          DROPDOWN MENU 2: ADD INCOMERS AND OUTGOINGS – {substation.name} (ADMIN)
          ========================================================================= */}
      <div className={`layout-dropdown-card ${incomersOpen ? 'expanded' : ''}`}>
        <button
          type="button"
          className="layout-dropdown-header"
          onClick={() => setIncomersOpen(!incomersOpen)}
          aria-expanded={incomersOpen}
        >
          <div className="layout-header-title">
            <Zap size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="title-text">
              Add incomers and outgoings – {activeSubstation?.name || 'LT Substation'} (admin)
            </span>
            <span className="layout-header-badge">
              {baseAnchors.length + customIncomers.length} incomers
            </span>
          </div>
          <div className="layout-header-action">
            <span className="dropdown-toggle-text">
              {incomersOpen ? 'Hide' : 'Click to Drop Down'}
            </span>
            <ChevronDown
              className={`chevron-icon ${incomersOpen ? 'rotated' : ''}`}
              size={18}
            />
          </div>
        </button>

        {incomersOpen && (
          <div className="layout-dropdown-body">
            {/* Top row: instructions and substation selector */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <p
                style={{
                  fontSize: '12.5px',
                  color: 'var(--text-muted)',
                  margin: 0,
                  flex: '1 1 300px',
                  lineHeight: '1.5',
                }}
              >
                <b>{activeSubstation?.name}</b> – To manage another LT substation, select from the dropdown below or tap its tile above. Every incomer has its own box: type an outgoing name and press Add outgoing. Add as many outgoings and incomers as needed; operators see them straight away.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                  Managing:
                </span>
                <select
                  className="field-select"
                  value={activeSubstation?.id}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  style={{ fontWeight: 600, minWidth: '220px' }}
                >
                  {allSubstations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Form to add a new incomer */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FolderPlus size={15} style={{ color: 'var(--accent-cyan)' }} />
                <span>New Incomer for {activeSubstation?.name}</span>
              </div>
              <form onSubmit={handleAddIncomer} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder={`Name, e.g. Main Incomer No 6 for ${activeSubstation?.name}`}
                  value={newIncName}
                  onChange={(e) => setNewIncName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  <Plus size={15} />
                  <span>Add incomer</span>
                </button>
              </form>
            </div>

            {/* List of all incomers (static anchors + custom dynamic incomers) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 1. Static Anchors */}
              {baseAnchors.map((anchor) => {
                const feeders = getFeedersOf(anchor.id);
                return (
                  <div
                    key={anchor.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className="role-pill"
                          style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                            fontSize: '10px',
                          }}
                        >
                          Incomer
                        </span>
                        <strong style={{ color: 'var(--text-main)', fontSize: '13.5px' }}>
                          {anchor.group}
                        </strong>
                      </div>
                      <span className={`chip ${feeders.length ? 'on' : ''}`} style={{ fontSize: '11px' }}>
                        {feeders.length} added
                      </span>
                    </div>

                    {/* Feeders list */}
                    {feeders.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 0',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <span className="role-pill" style={{ fontSize: '9px', background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}>
                          Outgoing
                        </span>
                        <input
                          type="text"
                          className="field-input"
                          style={{
                            flex: 1,
                            minHeight: '30px',
                            fontSize: '12.5px',
                            background: 'var(--bg-secondary)',
                          }}
                          defaultValue={f.name}
                          onBlur={(e) => handleRenameItem(f.id, e.target.value)}
                          aria-label="Outgoing name"
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--status-bad)' }}
                          title="Remove outgoing"
                          onClick={() => handleRemoveItem(f.id)}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}

                    {/* Add outgoing box */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <input
                        type="text"
                        className="field-input"
                        style={{ flex: 1, minHeight: '32px', fontSize: '12px' }}
                        placeholder={`New outgoing name under ${anchor.group}...`}
                        value={feederInputs[anchor.id] || ''}
                        onChange={(e) =>
                          setFeederInputs((prev) => ({
                            ...prev,
                            [anchor.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddFeeder(anchor.id);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleAddFeeder(anchor.id)}
                      >
                        + Add outgoing
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 2. Custom Dynamic Incomers */}
              {customIncomers.map((inc) => {
                const feeders = getFeedersOf(inc.id);
                return (
                  <div
                    key={inc.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--accent-cyan)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span className="role-pill admin" style={{ fontSize: '10px' }}>
                          New Incomer
                        </span>
                        <input
                          type="text"
                          className="field-input"
                          style={{
                            flex: 1,
                            minHeight: '32px',
                            fontWeight: 600,
                            fontSize: '13px',
                          }}
                          defaultValue={inc.name}
                          onBlur={(e) => handleRenameItem(inc.id, e.target.value)}
                          aria-label="Incomer name"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => handleRemoveItem(inc.id)}
                      >
                        <Trash2 size={13} />
                        <span>Remove Incomer</span>
                      </button>
                    </div>

                    {/* Feeders list */}
                    {feeders.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 0',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <span className="role-pill" style={{ fontSize: '9px', background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}>
                          Outgoing
                        </span>
                        <input
                          type="text"
                          className="field-input"
                          style={{
                            flex: 1,
                            minHeight: '30px',
                            fontSize: '12.5px',
                            background: 'var(--bg-secondary)',
                          }}
                          defaultValue={f.name}
                          onBlur={(e) => handleRenameItem(f.id, e.target.value)}
                          aria-label="Outgoing name"
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--status-bad)' }}
                          title="Remove outgoing"
                          onClick={() => handleRemoveItem(f.id)}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}

                    {/* Add outgoing box */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <input
                        type="text"
                        className="field-input"
                        style={{ flex: 1, minHeight: '32px', fontSize: '12px' }}
                        placeholder={`New outgoing name under ${inc.name}...`}
                        value={feederInputs[inc.id] || ''}
                        onChange={(e) =>
                          setFeederInputs((prev) => ({
                            ...prev,
                            [inc.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddFeeder(inc.id);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleAddFeeder(inc.id)}
                      >
                        + Add outgoing
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
