import React from 'react';
import { AlertTriangle, CheckCircle, Edit3, X, ArrowUpRight, Zap, ShieldAlert } from 'lucide-react';

export default function ExceedanceModal({
  open,
  onClose,
  onConfirm,
  mode = 'operator', // 'operator' | 'supervisor'
  items = [],
  metadata = {},
  saving = false,
}) {
  if (!open || !items || items.length === 0) return null;

  const isOperator = mode === 'operator';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #fed7aa',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #fed7aa',
            backgroundColor: '#fff7ed',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#ffedd5',
                border: '1.5px solid #fdba74',
                color: '#c2410c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isOperator ? <AlertTriangle size={24} /> : <ShieldAlert size={24} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#9a3412' }}>
                  {isOperator
                    ? '⚠️ High Reading Alert: > 30% Exceedance Detected'
                    : '🛡️ Supervisor & Engineer Telemetry Audit: > 30% Spike'}
                </h3>
                <span
                  style={{
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {items.length} {items.length === 1 ? 'Reading Flagged' : 'Readings Flagged'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7c2d12', lineHeight: '1.4' }}>
                {isOperator
                  ? 'One or more values you entered exceed the previous shift baseline by over 30%. Please verify your logbook before saving.'
                  : 'Reviewing operator-filled readings exceeding previous shift baseline by over 30%.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#9a3412',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Metadata Chips Bar */}
        <div
          style={{
            padding: '10px 24px',
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fef3c7',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '12px',
            color: '#92400e',
            fontWeight: 600,
          }}
        >
          {metadata.substationName && (
            <span>
              <strong>Substation:</strong> {metadata.substationName}
            </span>
          )}
          {metadata.date && (
            <span>
              <strong>Date:</strong> {metadata.date}
            </span>
          )}
          {metadata.slot && (
            <span>
              <strong>Slot/Shift:</strong> {metadata.slot === 'day' ? 'Full Day' : metadata.slot}
            </span>
          )}
          {metadata.operatorName && (
            <span>
              <strong>Operator:</strong> {metadata.operatorName}
            </span>
          )}
        </div>

        {/* Modal Scrollable Table Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              border: '1px solid #fed7aa',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa', color: '#9a3412', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Feeder / Panel</th>
                  <th style={{ padding: '10px 14px' }}>Parameter</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Previous Value</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Entered Value</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Spike %</th>
                  <th style={{ padding: '10px 14px' }}>Context / Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const unitStr = it.unit ? ` ${it.unit}` : '';
                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: idx === items.length - 1 ? 'none' : '1px solid #fef3c7',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fffdfa',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>
                        {it.sn && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#e2e8f0',
                              color: '#334155',
                              fontSize: '11px',
                              marginRight: '6px',
                            }}
                          >
                            {it.sn}
                          </span>
                        )}
                        <span>{it.rowLabel}</span>
                        {it.tableTitle && (
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                            {it.tableTitle}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0369a1' }}>
                        {it.colLabel || it.field}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
                        {it.prev != null ? `${it.prev}${unitStr}` : '–'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#c2410c', fontWeight: 700, fontSize: '14px' }}>
                        {it.curr != null ? `${it.curr}${unitStr}` : '–'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            backgroundColor: '#ffedd5',
                            color: '#c2410c',
                            border: '1px solid #fdba74',
                            borderRadius: '9999px',
                            padding: '3px 8px',
                            fontWeight: 800,
                            fontSize: '12px',
                          }}
                        >
                          +{it.pct}% <ArrowUpRight size={13} />
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#475569' }}>
                        {it.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Operational Guidance */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12.5px',
              color: '#334155',
            }}
          >
            <Zap size={16} style={{ color: '#ea580c', flexShrink: 0 }} />
            <span>
              {isOperator
                ? 'Tip: If an appliance or plant load (e.g., Chillers, Stadium Floodlights, Pumps) was legitimately energized during your shift, confirm to save. If there was a decimal or digit mistake, choose Review & Correct.'
                : 'Note: As Supervisor / Shift Engineer, verify with the operator or switchboard meters before making corrective overrides.'}
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Edit3 size={15} />
            <span>{isOperator ? '✏️ Review & Correct Entries' : 'Close Audit'}</span>
          </button>

          {isOperator ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="btn btn-primary"
              style={{
                padding: '9px 20px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: '8px',
                backgroundColor: '#c2410c',
                color: '#ffffff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(194, 65, 12, 0.3)',
              }}
            >
              <CheckCircle size={16} />
              <span>{saving ? 'Saving...' : '✓ Confirm & Save Anyway'}</span>
            </button>
          ) : (
            onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                className="btn btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  backgroundColor: '#1e3a8a',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Edit3 size={15} />
                <span>✏️ Open Reading Editor</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
