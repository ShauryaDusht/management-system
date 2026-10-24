import React, { useState, useMemo, useEffect } from 'react';
import {
  TIME_SLOTS,
  PUMP_RATED_LIMITS,
  PUMP_GROUPS,
  getActivePumpLimits,
  saveCustomPumpLimits,
  resetCustomPumpLimits,
} from '../config';
import HvacApi from '../hvacApi';

/**
 * Industrial Mechanical Pump SVG Icon
 */
function PumpSvgIcon({ status = 'STANDBY', size = 28 }) {
  const isAlert = status === 'ALERT';
  const isNormal = status === 'NORMAL';

  const strokeColor = isAlert ? '#ef4444' : isNormal ? '#10b981' : '#94a3b8';
  const fillColor = isAlert ? '#fee2e2' : isNormal ? '#d1fae5' : '#f1f5f9';
  const accentColor = isAlert ? '#dc2626' : isNormal ? '#059669' : '#64748b';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        flexShrink: 0,
        filter: isAlert ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.45))' : 'none',
        transition: 'transform 0.2s ease',
      }}
    >
      {/* Volute / Pump Casing */}
      <circle
        cx="18"
        cy="18"
        r="11"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2.5"
      />
      {/* Discharge Nozzle (top) */}
      <path
        d="M15 7V3H21V7"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fillColor}
      />
      {/* Flange cap */}
      <line x1="13" y1="3" x2="23" y2="3" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />

      {/* Suction Nozzle (side) */}
      <path
        d="M7 15H3V21H7"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fillColor}
      />
      <line x1="3" y1="13" x2="3" y2="23" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />

      {/* Impeller Hub & Blades */}
      <circle cx="18" cy="18" r="3.2" fill={accentColor} />
      <path
        d="M18 15C19.5 13.5 21 15 21 15M21 18C22.5 19.5 21 21 21 21M18 21C16.5 22.5 15 21 15 21M15 18C13.5 16.5 15 15 15 15"
        stroke={accentColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Pump Base / Mounting Feet */}
      <path d="M12 29L10 33H26L24 29" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
      <line x1="8" y1="33" x2="28" y2="33" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function DailyPumpIconBar({
  dayLogs = [],
  selectedDate,
  isSupervisorOrEngineer = true,
  onInspectSlot,
  onNavigateToEdit,
}) {
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'ALERT' | 'PRI' | 'SEC' | 'CON'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPumpKey, setSelectedPumpKey] = useState(null);

  // Active custom rated limits state
  const [activeLimits, setActiveLimits] = useState(() => getActivePumpLimits());

  // Listen to cross-component ratings changes
  useEffect(() => {
    const handleRatingsChanged = (e) => {
      setActiveLimits(getActivePumpLimits());
    };
    window.addEventListener('hvac_pump_ratings_changed', handleRatingsChanged);
    return () => window.removeEventListener('hvac_pump_ratings_changed', handleRatingsChanged);
  }, []);

  // Modal State for Setting Ratings
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [modalPumpKey, setModalPumpKey] = useState('pri1');
  const [modalTab, setModalTab] = useState('SINGLE'); // 'SINGLE' | 'BATCH'
  const [modalForm, setModalForm] = useState({
    maxA: 21.5,
    maxV: 410,
    ratedA: '19-21.5A',
    ratedV: '390-410V',
  });
  const [batchDraft, setBatchDraft] = useState({});
  const [toastMessage, setToastMessage] = useState('');

  // Auto-hide toast notification
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Open modal with specific pump
  const handleOpenRatingModal = (pumpKey = 'pri1') => {
    const targetKey = activeLimits[pumpKey] ? pumpKey : 'pri1';
    const curr = activeLimits[targetKey] || PUMP_RATED_LIMITS[targetKey];
    setModalPumpKey(targetKey);
    setModalForm({
      maxA: curr.maxA,
      maxV: curr.maxV,
      ratedA: curr.ratedA || '',
      ratedV: curr.ratedV || '',
    });
    setBatchDraft({ ...activeLimits });
    setModalTab('SINGLE');
    setShowRatingModal(true);
  };

  // Switch pump inside modal
  const handleSelectPumpInModal = (pumpKey) => {
    setModalPumpKey(pumpKey);
    const curr = activeLimits[pumpKey] || PUMP_RATED_LIMITS[pumpKey];
    setModalForm({
      maxA: curr.maxA,
      maxV: curr.maxV,
      ratedA: curr.ratedA || '',
      ratedV: curr.ratedV || '',
    });
  };

  // Save single pump rating
  const handleSaveSingleRating = async (e) => {
    e.preventDefault();
    const numA = parseFloat(modalForm.maxA);
    const numV = parseFloat(modalForm.maxV);
    if (isNaN(numA) || isNaN(numV)) {
      alert('Please enter valid numeric values for Maximum Current (A) and Voltage (V).');
      return;
    }

    const updated = {
      ...activeLimits,
      [modalPumpKey]: {
        ...activeLimits[modalPumpKey],
        maxA: numA,
        maxV: numV,
        ratedA: modalForm.ratedA.trim() || `${numA}A`,
        ratedV: modalForm.ratedV.trim() || `${numV}V`,
      },
    };

    saveCustomPumpLimits(updated);
    setActiveLimits(updated);

    // Sync to backend API if available
    try {
      await HvacApi.savePumpRatings({
        pump_key: modalPumpKey,
        max_a: numA,
        max_v: numV,
        range_a: modalForm.ratedA.trim(),
        range_v: modalForm.ratedV.trim(),
      });
    } catch (err) {
      console.warn('Backend API sync skipped/offline; saved locally:', err);
    }

    setToastMessage(`✓ Updated rated limits for ${activeLimits[modalPumpKey]?.name || modalPumpKey} (Max ${numA} A, ${numV} V).`);
    setShowRatingModal(false);
  };

  // Reset single pump to factory default
  const handleResetSingleRating = async () => {
    const factory = PUMP_RATED_LIMITS[modalPumpKey];
    if (!factory) return;

    resetCustomPumpLimits(modalPumpKey);
    const updated = getActivePumpLimits();
    setActiveLimits(updated);

    try {
      await HvacApi.resetPumpRatings(modalPumpKey);
    } catch (err) {
      console.warn('Backend API reset skipped/offline:', err);
    }

    setModalForm({
      maxA: factory.maxA,
      maxV: factory.maxV,
      ratedA: factory.ratedA,
      ratedV: factory.ratedV,
    });

    setToastMessage(`✓ Reset ${factory.name} to factory default limits (${factory.maxA} A, ${factory.maxV} V).`);
  };

  // Reset all 31 pumps to factory defaults
  const handleResetAllRatings = async () => {
    if (!window.confirm('Are you sure you want to reset all 31 pumps to their factory default nameplate ratings?')) {
      return;
    }

    resetCustomPumpLimits();
    const updated = { ...PUMP_RATED_LIMITS };
    setActiveLimits(updated);

    try {
      await HvacApi.resetPumpRatings(null);
    } catch (err) {
      console.warn('Backend API reset all skipped/offline:', err);
    }

    setToastMessage('✓ All 31 pumps have been reset to factory default nameplate limits.');
    setShowRatingModal(false);
  };

  // Save batch table ratings
  const handleSaveBatchRatings = async () => {
    saveCustomPumpLimits(batchDraft);
    setActiveLimits(batchDraft);

    try {
      await HvacApi.savePumpRatings({ ratings: batchDraft });
    } catch (err) {
      console.warn('Backend API batch sync skipped/offline:', err);
    }

    setToastMessage('✓ Saved updated rated limits across all pump units.');
    setShowRatingModal(false);
  };

  // Compute daily telemetry & peak values for all 31 pumps using active limits
  const { pumpsData, reachedPumpsCount, hourlySlotPumpAlerts } = useMemo(() => {
    const slotAlertsMap = {};
    for (let i = 0; i < 24; i++) {
      slotAlertsMap[i] = [];
    }

    const items = Object.entries(activeLimits).map(([key, limit]) => {
      let group = 'Primary';
      let groupCode = 'PRI';
      if (key.startsWith('sec')) {
        group = 'Secondary';
        groupCode = 'SEC';
      } else if (key.startsWith('con')) {
        group = 'Condenser';
        groupCode = 'CON';
      }

      let peakA = null;
      let peakV = null;
      const reachedEvents = [];

      dayLogs.forEach((log) => {
        const valA = log.v?.[`${key}_a`];
        const valV = log.v?.[`${key}_v`];

        if (valA !== undefined && valA !== null && valA !== '') {
          const numA = Number(valA);
          if (!isNaN(numA)) {
            if (peakA === null || numA > peakA) {
              peakA = numA;
            }
            if (numA >= limit.maxA) {
              const diff = +(numA - limit.maxA).toFixed(2);
              const eventItem = {
                slot: log.slot,
                time: log.time,
                type: 'Current (A)',
                value: numA,
                limit: limit.maxA,
                diff,
                isExceeded: numA > limit.maxA,
                msg: numA > limit.maxA
                  ? `Current ${numA} A exceeds rated max ${limit.maxA} A (+${diff} A)`
                  : `Current ${numA} A reached rated max ${limit.maxA} A`,
              };
              reachedEvents.push(eventItem);
              slotAlertsMap[log.slot]?.push({
                pumpKey: key,
                name: limit.name,
                ...eventItem,
              });
            }
          }
        }

        if (valV !== undefined && valV !== null && valV !== '') {
          const numV = Number(valV);
          if (!isNaN(numV)) {
            if (peakV === null || numV > peakV) {
              peakV = numV;
            }
            if (numV >= limit.maxV) {
              const diff = +(numV - limit.maxV).toFixed(2);
              const eventItem = {
                slot: log.slot,
                time: log.time,
                type: 'Voltage (V)',
                value: numV,
                limit: limit.maxV,
                diff,
                isExceeded: numV > limit.maxV,
                msg: numV > limit.maxV
                  ? `Voltage ${numV} V exceeds rated max ${limit.maxV} V (+${diff} V)`
                  : `Voltage ${numV} V reached rated max ${limit.maxV} V`,
              };
              reachedEvents.push(eventItem);
              slotAlertsMap[log.slot]?.push({
                pumpKey: key,
                name: limit.name,
                ...eventItem,
              });
            }
          }
        }
      });

      const hasReached = reachedEvents.length > 0;
      const status = hasReached
        ? 'ALERT'
        : peakA !== null && peakA > 0
        ? 'NORMAL'
        : 'STANDBY';

      const factory = PUMP_RATED_LIMITS[key] || {};
      const isCustomized = factory.maxA !== limit.maxA || factory.maxV !== limit.maxV;

      return {
        key,
        limit,
        name: limit.name,
        group,
        groupCode,
        maxA: limit.maxA,
        maxV: limit.maxV,
        ratedA: limit.ratedA,
        ratedV: limit.ratedV,
        factoryMaxA: factory.maxA,
        factoryMaxV: factory.maxV,
        isCustomized,
        peakA,
        peakV,
        hasReached,
        status,
        reachedEvents,
      };
    });

    const reachedCount = items.filter((p) => p.hasReached).length;

    return {
      pumpsData: items,
      reachedPumpsCount: reachedCount,
      hourlySlotPumpAlerts: slotAlertsMap,
    };
  }, [dayLogs, activeLimits]);

  // Filtered pump list
  const filteredPumps = useMemo(() => {
    return pumpsData.filter((p) => {
      if (activeFilter === 'ALERT' && !p.hasReached) return false;
      if (activeFilter === 'PRI' && p.groupCode !== 'PRI') return false;
      if (activeFilter === 'SEC' && p.groupCode !== 'SEC') return false;
      if (activeFilter === 'CON' && p.groupCode !== 'CON') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [pumpsData, activeFilter, searchQuery]);

  return (
    <div
      id="daily-pump-icon-bar"
      className="hvac-card"
      style={{
        border: reachedPumpsCount > 0 ? '1.5px solid #fecdd3' : '1px solid var(--hvac-line)',
        background: reachedPumpsCount > 0
          ? 'linear-gradient(180deg, #fff5f5 0%, #ffffff 120px)'
          : '#ffffff',
        position: 'relative',
        boxShadow: reachedPumpsCount > 0
          ? '0 4px 20px rgba(239, 68, 68, 0.08)'
          : '0 1px 4px rgba(11, 30, 42, 0.04)',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: -14,
            right: 24,
            background: '#065f46',
            color: '#ffffff',
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 14,
          borderBottom: '1px solid var(--hvac-line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: reachedPumpsCount > 0 ? '#fee2e2' : '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: reachedPumpsCount > 0 ? '1.5px solid #fca5a5' : '1.5px solid #bae6fd',
            }}
          >
            <PumpSvgIcon status={reachedPumpsCount > 0 ? 'ALERT' : 'NORMAL'} size={28} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0c2535' }}>
                Pump Units Rated Status &middot; Daily Icon Bar
              </span>
              {isSupervisorOrEngineer && (
                <span
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid #cbd5e1',
                  }}
                >
                  Supervisor &amp; Engineer Portal
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--hvac-muted)', marginTop: 2 }}>
              Daily 24-hr surveillance of 31 Primary, Secondary &amp; Condenser pumps against nameplate rated limits ({selectedDate})
            </div>
          </div>
        </div>

        {/* Global Controls & Actions Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Button to Set Rating if Desired */}
          {isSupervisorOrEngineer && (
            <button
              type="button"
              onClick={() => handleOpenRatingModal('pri1')}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
              title="Click to calibrate or adjust pump rated current and voltage limits"
            >
              <span>⚙️</span>
              <span>Set Rating</span>
            </button>
          )}

          {reachedPumpsCount > 0 ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#fee2e2',
                color: '#991b1b',
                padding: '6px 14px',
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 12.5,
                border: '1.5px solid #f87171',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.25)',
              }}
            >
              <span style={{ animation: 'pulse-dot-red 1.5s infinite', display: 'inline-block' }}>🚨</span>
              <span>{reachedPumpsCount} Pumps Reached Rated Value</span>
            </div>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ecfdf5',
                color: '#065f46',
                padding: '6px 14px',
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 12,
                border: '1px solid #a7f3d0',
              }}
            >
              <span>✅</span>
              <span>All 31 Pumps Within Rated Nameplate Limits</span>
            </div>
          )}
        </div>
      </div>

      {/* Hourly 24-Hour Icon Timeline Bar for the Day */}
      <div style={{ marginTop: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--hvac-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            📅 24-Hour Slot Timeline &mdash; Pump Rated Exceedance Bar
          </span>
          <span style={{ fontSize: 11, color: 'var(--hvac-muted)' }}>
            Hover slot for pump details &middot; Click to inspect
          </span>
        </div>

        {/* Horizontal 24-Hour Icon Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(24, 1fr)',
            gap: 4,
            background: '#f8fafc',
            padding: 6,
            borderRadius: 10,
            border: '1px solid var(--hvac-line)',
            overflowX: 'auto',
          }}
        >
          {TIME_SLOTS.map((time, idx) => {
            const slotAlerts = hourlySlotPumpAlerts[idx] || [];
            const hasAlert = slotAlerts.length > 0;
            const logEntry = dayLogs.find((l) => l.slot === idx);
            const isLogged = !!logEntry;

            const tooltipText = hasAlert
              ? `⚠️ ${time} (Shift ${Math.floor(idx / 8) + 1})\n${slotAlerts.length} pump(s) reached rated limit:\n` +
                slotAlerts.map((a) => `• ${a.name}: ${a.msg}`).join('\n') +
                `\n\nClick to inspect ${time} log`
              : isLogged
              ? `✓ ${time}: All pumps operating within rated values\nClick to inspect`
              : `${time}: Reading pending entry`;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (logEntry) {
                    onInspectSlot?.(idx);
                  } else {
                    onNavigateToEdit?.(idx);
                  }
                }}
                title={tooltipText}
                style={{
                  minWidth: 32,
                  padding: '6px 2px',
                  borderRadius: 6,
                  border: hasAlert
                    ? '1.5px solid #ef4444'
                    : isLogged
                    ? '1px solid #cbd5e1'
                    : '1px dashed #e2e8f0',
                  background: hasAlert
                    ? '#fee2e2'
                    : isLogged
                    ? '#ffffff'
                    : '#f8fafc',
                  color: hasAlert
                    ? '#b91c1c'
                    : isLogged
                    ? '#0f172a'
                    : '#94a3b8',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = hasAlert
                    ? '0 4px 10px rgba(239, 68, 68, 0.3)'
                    : '0 3px 8px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 800, fontFamily: 'monospace' }}>
                  {time.split(':')[0]}h
                </span>

                {hasAlert ? (
                  <span
                    style={{
                      fontSize: 12,
                      lineHeight: 1,
                      filter: 'drop-shadow(0 0 2px rgba(239, 68, 68, 0.8))',
                    }}
                  >
                    🚨
                  </span>
                ) : isLogged ? (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
                ) : (
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#cbd5e1' }}></span>
                )}

                {hasAlert && (
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: '#991b1b',
                      background: '#fecdd3',
                      padding: '0 3px',
                      borderRadius: 4,
                    }}
                  >
                    {slotAlerts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {reachedPumpsCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('ALERT')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: activeFilter === 'ALERT' ? '1.5px solid #ef4444' : '1px solid #fca5a5',
                background: activeFilter === 'ALERT' ? '#ef4444' : '#fee2e2',
                color: activeFilter === 'ALERT' ? '#ffffff' : '#991b1b',
                boxShadow: activeFilter === 'ALERT' ? '0 2px 8px rgba(239, 68, 68, 0.35)' : 'none',
              }}
            >
              <span>🚨 Reached Rated Limit</span>
              <span
                style={{
                  background: activeFilter === 'ALERT' ? '#ffffff' : '#ef4444',
                  color: activeFilter === 'ALERT' ? '#ef4444' : '#ffffff',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 900,
                }}
              >
                {reachedPumpsCount}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: activeFilter === 'ALL' ? '1.5px solid var(--hvac-cyan)' : '1px solid var(--hvac-line)',
              background: activeFilter === 'ALL' ? 'var(--hvac-cyan)' : '#ffffff',
              color: activeFilter === 'ALL' ? '#ffffff' : 'var(--hvac-text)',
            }}
          >
            All Pumps ({pumpsData.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('PRI')}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: activeFilter === 'PRI' ? '1.5px solid var(--hvac-teal)' : '1px solid var(--hvac-line)',
              background: activeFilter === 'PRI' ? 'var(--hvac-teal)' : '#ffffff',
              color: activeFilter === 'PRI' ? '#ffffff' : 'var(--hvac-text)',
            }}
          >
            Primary (10)
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('SEC')}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: activeFilter === 'SEC' ? '1.5px solid var(--hvac-teal)' : '1px solid var(--hvac-line)',
              background: activeFilter === 'SEC' ? 'var(--hvac-teal)' : '#ffffff',
              color: activeFilter === 'SEC' ? '#ffffff' : 'var(--hvac-text)',
            }}
          >
            Secondary (11)
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('CON')}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: activeFilter === 'CON' ? '1.5px solid var(--hvac-teal)' : '1px solid var(--hvac-line)',
              background: activeFilter === 'CON' ? 'var(--hvac-teal)' : '#ffffff',
              color: activeFilter === 'CON' ? '#ffffff' : 'var(--hvac-text)',
            }}
          >
            Condenser (10)
          </button>
        </div>

        {/* Search Box & Set Rating Shortcut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search pump (e.g. Trane, Daikin, NA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px',
                paddingRight: 26,
                fontSize: 12,
                borderRadius: 20,
                border: '1px solid var(--hvac-line)',
                width: 220,
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--hvac-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The Pump Icon Cards Grid (Icon Bar Units) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {filteredPumps.map((pump) => {
          const isAlert = pump.hasReached;
          const isNormal = pump.status === 'NORMAL';
          const isSelected = selectedPumpKey === pump.key;

          const currentPct = pump.peakA !== null && pump.maxA > 0
            ? Math.round((pump.peakA / pump.maxA) * 100)
            : 0;

          return (
            <div
              key={pump.key}
              onClick={() => setSelectedPumpKey(isSelected ? null : pump.key)}
              style={{
                background: isAlert ? '#fff5f5' : isNormal ? '#ffffff' : '#fbfcfd',
                borderRadius: 12,
                border: isAlert
                  ? '1.5px solid #ef4444'
                  : isSelected
                  ? '1.5px solid var(--hvac-cyan)'
                  : '1px solid var(--hvac-line)',
                boxShadow: isAlert
                  ? '0 3px 12px rgba(239, 68, 68, 0.15)'
                  : '0 1px 3px rgba(0, 0, 0, 0.03)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {/* Header: Pump Icon & Name */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PumpSvgIcon status={pump.status} size={30} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0c2535' }}>
                        {pump.name.split(' (')[0]}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: pump.groupCode === 'PRI' ? '#e0f2fe' : pump.groupCode === 'SEC' ? '#ede9fe' : '#fef3c7',
                          color: pump.groupCode === 'PRI' ? '#0369a1' : pump.groupCode === 'SEC' ? '#6d28d9' : '#b45309',
                        }}
                      >
                        {pump.groupCode}
                      </span>
                      {pump.isCustomized && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: '#fef3c7',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                          }}
                          title="Custom rating has been set for this pump"
                        >
                          Custom
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--hvac-muted)', marginTop: 1 }}>
                      {pump.name.includes('(') ? `(${pump.name.split('(')[1]}` : `${pump.group} Water Pump`}
                    </div>
                  </div>
                </div>

                {/* Status Indicator Pill */}
                {isAlert ? (
                  <span
                    style={{
                      background: '#fee2e2',
                      color: '#991b1b',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid #f87171',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 10 }}>🚨</span> REACHED RATED
                  </span>
                ) : isNormal ? (
                  <span
                    style={{
                      background: '#ecfdf5',
                      color: '#065f46',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid #a7f3d0',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ● Nominal
                  </span>
                ) : (
                  <span
                    style={{
                      background: '#f1f5f9',
                      color: '#64748b',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 999,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Standby
                  </span>
                )}
              </div>

              {/* Rated Range Reference & Quick Edit Rating Button */}
              <div
                style={{
                  fontSize: 11,
                  background: isAlert ? 'rgba(239, 68, 68, 0.06)' : '#f8fafc',
                  border: isAlert ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: '5px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <div>
                  <strong style={{ color: 'var(--hvac-muted)' }}>Rated: </strong>
                  <span style={{ fontWeight: 700, color: '#0c2535' }}>{pump.ratedA}</span>
                  <span style={{ color: 'var(--hvac-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ fontWeight: 700, color: '#0c2535' }}>{pump.ratedV}</span>
                  <span style={{ fontSize: 10, color: 'var(--hvac-muted)', marginLeft: 6 }}>
                    (Max: {pump.maxA}A)
                  </span>
                </div>

                {/* Individual Button to Set Rating for this pump */}
                {isSupervisorOrEngineer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRatingModal(pump.key);
                    }}
                    style={{
                      padding: '2px 7px',
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 5,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0284c7',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#e0f2fe')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                    title={`Click to set or adjust rating for ${pump.name}`}
                  >
                    <span>⚙️</span>
                    <span>Set Rating</span>
                  </button>
                )}
              </div>

              {/* Peak Telemetry Recorded Today */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>
                    Peak Current Today:
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: isAlert ? '#dc2626' : isNormal ? '#0c2535' : '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    {pump.peakA !== null ? `${pump.peakA} A` : '–'}
                    {pump.peakA !== null && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          marginLeft: 4,
                          color: isAlert ? '#b91c1c' : 'var(--hvac-muted)',
                        }}
                      >
                        ({currentPct}% of max)
                      </span>
                    )}
                  </span>
                </div>

                {/* Meter Progress Bar */}
                <div
                  style={{
                    height: 5,
                    width: '100%',
                    background: '#e2e8f0',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, currentPct)}%`,
                      background: isAlert
                        ? '#ef4444'
                        : currentPct > 85
                        ? '#f59e0b'
                        : '#10b981',
                      borderRadius: 999,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)' }}>
                    Peak Voltage Today:
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0c2535', fontFamily: 'monospace' }}>
                    {pump.peakV !== null ? `${pump.peakV} V` : '–'}
                    <span style={{ fontSize: 10, color: 'var(--hvac-muted)', marginLeft: 3 }}>
                      / {pump.maxV}V
                    </span>
                  </span>
                </div>
              </div>

              {/* Offending Time Slots Pill Bar */}
              {isAlert && pump.reachedEvents.length > 0 && (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fecdd3',
                    borderRadius: 8,
                    padding: '6px 8px',
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: '#be123c',
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>⚠️ Reached in {pump.reachedEvents.length} Slot(s):</span>
                    <span style={{ fontSize: 9.5, color: '#9f1239' }}>Click slot to inspect</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {pump.reachedEvents.map((ev, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectSlot?.(ev.slot);
                        }}
                        style={{
                          background: '#fff1f2',
                          border: '1px solid #fca5a5',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: '#b91c1c',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          transition: 'all 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fff1f2';
                          e.currentTarget.style.color = '#b91c1c';
                        }}
                        title={`Inspect reading for ${ev.time} (${ev.value}${ev.type?.startsWith('Voltage') ? 'V' : 'A'} > ${ev.limit}${ev.type?.startsWith('Voltage') ? 'V' : 'A'})`}
                      >
                        <span>🕒 {ev.time}</span>
                        <span style={{ opacity: 0.85, fontSize: 9.5 }}>({ev.value}{ev.type?.startsWith('Voltage') ? 'V' : 'A'})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredPumps.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 32,
              textAlign: 'center',
              color: 'var(--hvac-muted)',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px dashed var(--hvac-line)',
            }}
          >
            No pumps match the filter &quot;{activeFilter}&quot; {searchQuery ? `with query &quot;${searchQuery}&quot;` : ''}.
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: SET PUMP RATED LIMITS (IF DESIRED)                 */}
      {/* ======================================================== */}
      {showRatingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowRatingModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: modalTab === 'BATCH' ? 880 : 580,
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--hvac-line)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                  }}
                >
                  ⚙️
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0c2535' }}>
                    Set Pump Rated Limits &amp; Calibration
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--hvac-muted)', marginTop: 2 }}>
                    Adjust nameplate rated current (A) and voltage (V) thresholds for alert surveillance.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRatingModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: 'var(--hvac-muted)',
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--hvac-line)', paddingBottom: 10 }}>
              <button
                type="button"
                onClick={() => setModalTab('SINGLE')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: modalTab === 'SINGLE' ? '1.5px solid var(--hvac-cyan)' : '1px solid var(--hvac-line)',
                  background: modalTab === 'SINGLE' ? '#e0f2fe' : '#ffffff',
                  color: modalTab === 'SINGLE' ? '#0369a1' : 'var(--hvac-muted)',
                }}
              >
                Single Pump Configuration
              </button>

              <button
                type="button"
                onClick={() => setModalTab('BATCH')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: modalTab === 'BATCH' ? '1.5px solid var(--hvac-cyan)' : '1px solid var(--hvac-line)',
                  background: modalTab === 'BATCH' ? '#e0f2fe' : '#ffffff',
                  color: modalTab === 'BATCH' ? '#0369a1' : 'var(--hvac-muted)',
                }}
              >
                Batch Overview (All 31 Pumps)
              </button>
            </div>

            {/* TAB 1: Single Pump Configuration Form */}
            {modalTab === 'SINGLE' && (
              <form onSubmit={handleSaveSingleRating} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Pump Selection Dropdown */}
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                    Select Pump to Configure:
                  </label>
                  <select
                    value={modalPumpKey}
                    onChange={(e) => handleSelectPumpInModal(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 13,
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  >
                    <optgroup label="Primary Chilled Water Pumps (10)">
                      {Object.keys(PUMP_RATED_LIMITS)
                        .filter((k) => k.startsWith('pri'))
                        .map((k) => (
                          <option key={k} value={k}>
                            {activeLimits[k]?.name || k} (Current Max: {activeLimits[k]?.maxA}A)
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Secondary Chilled Water Pumps (11)">
                      {Object.keys(PUMP_RATED_LIMITS)
                        .filter((k) => k.startsWith('sec'))
                        .map((k) => (
                          <option key={k} value={k}>
                            {activeLimits[k]?.name || k} (Current Max: {activeLimits[k]?.maxA}A)
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Condenser Water Pumps (10)">
                      {Object.keys(PUMP_RATED_LIMITS)
                        .filter((k) => k.startsWith('con'))
                        .map((k) => (
                          <option key={k} value={k}>
                            {activeLimits[k]?.name || k} (Current Max: {activeLimits[k]?.maxA}A)
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                {/* Factory Nameplate Reference Box */}
                {PUMP_RATED_LIMITS[modalPumpKey] && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 800, color: 'var(--hvac-muted)' }}>Factory Standard Nameplate: </span>
                      <span style={{ fontWeight: 700, color: '#0c2535' }}>
                        Max {PUMP_RATED_LIMITS[modalPumpKey].maxA} A &middot; Max {PUMP_RATED_LIMITS[modalPumpKey].maxV} V
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--hvac-muted)', marginTop: 2 }}>
                        Standard Range: {PUMP_RATED_LIMITS[modalPumpKey].ratedA} | {PUMP_RATED_LIMITS[modalPumpKey].ratedV}
                      </div>
                    </div>

                    {/* Badge if custom modified */}
                    {activeLimits[modalPumpKey]?.maxA !== PUMP_RATED_LIMITS[modalPumpKey]?.maxA ||
                    activeLimits[modalPumpKey]?.maxV !== PUMP_RATED_LIMITS[modalPumpKey]?.maxV ? (
                      <span
                        style={{
                          background: '#fef3c7',
                          color: '#b45309',
                          fontSize: 10.5,
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #fde68a',
                        }}
                      >
                        ⚡ Custom Limit Active
                      </span>
                    ) : (
                      <span
                        style={{
                          background: '#ecfdf5',
                          color: '#065f46',
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                        }}
                      >
                        ✓ Using Factory Standard
                      </span>
                    )}
                  </div>
                )}

                {/* Form Inputs Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Maximum Current Limit */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                      Maximum Current Limit (A): *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={modalForm.maxA}
                      onChange={(e) => setModalForm({ ...modalForm, maxA: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: '#0c2535',
                      }}
                      placeholder="e.g. 21.5"
                    />
                    <small style={{ fontSize: 10.5, color: 'var(--hvac-muted)' }}>
                      Alert triggers when current &ge; this value
                    </small>
                  </div>

                  {/* Rated Current Range Label */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                      Rated Current Range:
                    </label>
                    <input
                      type="text"
                      value={modalForm.ratedA}
                      onChange={(e) => setModalForm({ ...modalForm, ratedA: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#0c2535',
                      }}
                      placeholder="e.g. 19-21.5A"
                    />
                    <small style={{ fontSize: 10.5, color: 'var(--hvac-muted)' }}>
                      Descriptive display range on card
                    </small>
                  </div>

                  {/* Maximum Voltage Limit */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                      Maximum Voltage Limit (V): *
                    </label>
                    <input
                      type="number"
                      step="1"
                      required
                      value={modalForm.maxV}
                      onChange={(e) => setModalForm({ ...modalForm, maxV: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: '#0c2535',
                      }}
                      placeholder="e.g. 410"
                    />
                    <small style={{ fontSize: 10.5, color: 'var(--hvac-muted)' }}>
                      Alert triggers when voltage &ge; this value
                    </small>
                  </div>

                  {/* Rated Voltage Range Label */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                      Rated Voltage Range:
                    </label>
                    <input
                      type="text"
                      value={modalForm.ratedV}
                      onChange={(e) => setModalForm({ ...modalForm, ratedV: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#0c2535',
                      }}
                      placeholder="e.g. 390-410V"
                    />
                    <small style={{ fontSize: 10.5, color: 'var(--hvac-muted)' }}>
                      Descriptive display range on card
                    </small>
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleResetSingleRating}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: '#ffffff',
                        border: '1px solid #f59e0b',
                        color: '#b45309',
                        cursor: 'pointer',
                      }}
                    >
                      Reset to Factory Default
                    </button>
                    <button
                      type="button"
                      onClick={handleResetAllRatings}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      Reset All 31 Pumps
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowRatingModal(false)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 700,
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        color: '#475569',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '8px 20px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 800,
                        background: '#0284c7',
                        border: 'none',
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                      }}
                    >
                      Save Rating
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: Batch Table (All 31 Pumps) */}
            {modalTab === 'BATCH' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid var(--hvac-line)', borderRadius: 8 }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--hvac-line)', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Pump Unit</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Group</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Factory Max</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Configured Max A</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Configured Max V</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(PUMP_RATED_LIMITS).map(([k, factory]) => {
                        const curr = batchDraft[k] || factory;
                        const isModified = curr.maxA !== factory.maxA || curr.maxV !== factory.maxV;

                        return (
                          <tr key={k} style={{ borderBottom: '1px solid var(--hvac-line)', background: isModified ? '#fffbeb' : '#ffffff' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0c2535' }}>
                              {curr.name}
                            </td>
                            <td style={{ padding: '6px 10px', color: 'var(--hvac-muted)' }}>
                              {k.startsWith('pri') ? 'Primary' : k.startsWith('sec') ? 'Secondary' : 'Condenser'}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--hvac-muted)' }}>
                              {factory.maxA}A &middot; {factory.maxV}V
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <input
                                type="number"
                                step="0.1"
                                value={curr.maxA}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || factory.maxA;
                                  setBatchDraft({
                                    ...batchDraft,
                                    [k]: { ...curr, maxA: val },
                                  });
                                }}
                                style={{ width: 75, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 800, fontFamily: 'monospace' }}
                              />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <input
                                type="number"
                                step="1"
                                value={curr.maxV}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || factory.maxV;
                                  setBatchDraft({
                                    ...batchDraft,
                                    [k]: { ...curr, maxV: val },
                                  });
                                }}
                                style={{ width: 75, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 800, fontFamily: 'monospace' }}
                              />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              {isModified && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchDraft({
                                      ...batchDraft,
                                      [k]: { ...factory },
                                    });
                                  }}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    border: '1px solid #f59e0b',
                                    background: '#fff',
                                    color: '#b45309',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Reset
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowRatingModal(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBatchRatings}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 800,
                      background: '#0284c7',
                      border: 'none',
                      color: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                    }}
                  >
                    Save All Batch Ratings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
