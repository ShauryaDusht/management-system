import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, Calendar, RotateCcw } from 'lucide-react';

export default function ExportDropdown({
  onExportCsv,
  onExportPdf,
  label = 'Export',
  variant = 'default', // 'default' | 'substation' | 'substation-primary' | 'substation-ghost'
  style = {},
  disabled = false,
  // Embedded Date Range / Calendar Filter
  hasDateFilter = false,
  fromDate = '',
  toDate = '',
  onFromDateChange = null,
  onToDateChange = null,
  onClearDates = null,
  dateLabel = '',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleCsv = () => {
    setOpen(false);
    if (onExportCsv) onExportCsv();
  };

  const handlePdf = () => {
    setOpen(false);
    if (onExportPdf) onExportPdf();
  };

  const isSubstation = variant.startsWith('substation');
  const isSubstationGhost = variant === 'substation-ghost' || variant === 'substation';
  const isSubstationPrimary = variant === 'substation-primary';

  let btnClass = undefined;
  if (isSubstationPrimary) {
    btnClass = 'btn btn-primary';
  } else if (isSubstationGhost) {
    btnClass = 'btn btn-ghost';
  }

  const isFiltered = hasDateFilter && (fromDate || toDate);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={btnClass}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Download size={14} />
        <span>{label}</span>
        {isFiltered && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 10,
              background: 'var(--water, #0284c7)',
              color: '#ffffff',
              lineHeight: 1.3,
            }}
            title={dateLabel ? `Filtered: ${dateLabel}` : 'Date range filter active'}
          >
            Range
          </span>
        )}
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            right: 0,
            zIndex: 1000,
            minWidth: hasDateFilter ? 270 : 175,
            background: 'var(--card, #ffffff)',
            borderRadius: 8,
            border: '1px solid var(--line-strong, #cbd5e1)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
          }}
        >
          {/* Calendar Option Inside Export File Dropdown */}
          {hasDateFilter && (
            <div
              style={{
                padding: '10px 12px 10px',
                borderBottom: '1px solid var(--line, #e2e8f0)',
                background: 'var(--field, #f8fafc)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: 'var(--water, #0284c7)',
                  }}
                >
                  <Calendar size={13} />
                  Export Date Range
                </span>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onClearDates) onClearDates();
                      else {
                        if (onFromDateChange) onFromDateChange('');
                        if (onToDateChange) onToDateChange('');
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '2px 6px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--muted, #64748b)',
                      cursor: 'pointer',
                      borderRadius: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Clear date range to export all records"
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted, #64748b)')}
                  >
                    <RotateCcw size={10} />
                    Reset (All)
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--ink, #334155)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>From Date:</span>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => onFromDateChange && onFromDateChange(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      fontSize: 12,
                      borderRadius: 5,
                      border: '1px solid var(--line-strong, #cbd5e1)',
                      background: 'var(--card, #ffffff)',
                      color: 'var(--ink, #1e293b)',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                <label style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--ink, #334155)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>Upto Date:</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => onToDateChange && onToDateChange(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      fontSize: 12,
                      borderRadius: 5,
                      border: '1px solid var(--line-strong, #cbd5e1)',
                      background: 'var(--card, #ffffff)',
                      color: 'var(--ink, #1e293b)',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
              </div>

              {dateLabel && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--water, #0284c7)',
                    fontWeight: 600,
                    padding: '4px 6px',
                    background: 'rgba(2, 132, 199, 0.08)',
                    borderRadius: 4,
                    textAlign: 'center',
                  }}
                >
                  Selected: {dateLabel}
                </div>
              )}
            </div>
          )}

          <div style={{ padding: '4px' }}>
            <button
              type="button"
              onClick={handleCsv}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--ink, #1e293b)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--field, #f1f5f9)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center' }}>
                <FileSpreadsheet size={15} />
              </span>
              <span>Export to CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePdf}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--ink, #1e293b)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--field, #f1f5f9)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                <FileText size={15} />
              </span>
              <span>Export to PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

