import { useEffect, useRef, useState } from 'react'

const FORMATS = [
  {
    key: 'csv',
    label: 'CSV Spreadsheet',
    ext: '.csv',
    badgeColor: '#16a34a',
    badgeBg: '#dcfce7',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    description: 'Tabular data for Excel & Sheets',
  },
  {
    key: 'pdf',
    label: 'PDF Document',
    ext: '.pdf',
    badgeColor: '#dc2626',
    badgeBg: '#fee2e2',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15h6" />
        <path d="M9 11h6" />
      </svg>
    ),
    description: 'Formatted printable report',
  },
  {
    key: 'word',
    label: 'Word Document',
    ext: '.docx',
    badgeColor: '#2563eb',
    badgeBg: '#dbeafe',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
    description: 'Editable Microsoft Word (.docx)',
  },
  {
    key: 'slides',
    label: 'Presentation Slides',
    ext: '.pptx',
    badgeColor: '#ea580c',
    badgeBg: '#ffedd5',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    description: 'Executive slides for PowerPoint',
  },
]

export default function ExportDropdown({
  label = 'Download',
  onExport,
  onExportCsv,
  onExportPdf,
  onExportWord,
  onExportPresentation,
  disabled = false,
  size = 'sm',
  variant = 'secondary',
  align = 'right',
  style,
  // Embedded Date Range / Calendar Filter (for Substation / WTP / HVAC)
  hasDateFilter = false,
  fromDate = '',
  toDate = '',
  onFromDateChange = null,
  onToDateChange = null,
  onClearDates = null,
  dateLabel = '',
}) {
  const [open, setOpen] = useState(false)
  const [busyFormat, setBusyFormat] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSelect = async (formatKey) => {
    if (disabled || busyFormat) return
    setBusyFormat(formatKey)
    try {
      if (formatKey === 'csv' && typeof onExportCsv === 'function') {
        await onExportCsv()
      } else if (formatKey === 'pdf' && typeof onExportPdf === 'function') {
        await onExportPdf()
      } else if (formatKey === 'word' && typeof onExportWord === 'function') {
        await onExportWord()
      } else if (formatKey === 'slides' && typeof onExportPresentation === 'function') {
        await onExportPresentation()
      } else if (typeof onExport === 'function') {
        await onExport(formatKey)
      }
      setOpen(false)
    } catch (err) {
      console.error('Export error:', err)
      window.alert(`Failed to export ${formatKey.toUpperCase()}: ${err.message || err}`)
    } finally {
      setBusyFormat(null)
    }
  }

  const isPrimary = variant === 'primary' || variant === 'substation-primary'
  const isSubstation = variant.startsWith('substation')
  const isFiltered = Boolean(fromDate || toDate)

  // Visible formats: if only onExportCsv / onExportPdf passed and no general onExport, show those
  const visibleFormats = FORMATS.filter((fmt) => {
    if (typeof onExport === 'function') return true
    if (fmt.key === 'csv') return Boolean(onExportCsv)
    if (fmt.key === 'pdf') return Boolean(onExportPdf)
    if (fmt.key === 'word') return Boolean(onExportWord)
    if (fmt.key === 'slides') return Boolean(onExportPresentation)
    return true
  })

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block', zIndex: open ? 1000 : undefined, ...style }}>
      <button
        type="button"
        disabled={disabled || Boolean(busyFormat)}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 9,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          border: isPrimary ? 'none' : '1px solid var(--border, #cbd5e1)',
          background: isPrimary ? 'var(--green-800, #1e3a2f)' : 'var(--surface-2, #ffffff)',
          color: isPrimary ? '#ffffff' : 'var(--text, #1e293b)',
          fontSize: size === 'sm' ? 12 : 13,
          padding: size === 'sm' ? '6px 12px' : '9px 16px',
          transition: 'all 0.15s ease-in-out',
          boxShadow: open ? '0 0 0 2px rgba(45, 74, 62, 0.2)' : 'none',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>

        <span>{busyFormat ? `Exporting ${busyFormat.toUpperCase()}...` : label}</span>

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

        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 9999,
            minWidth: hasDateFilter ? 280 : 260,
            background: 'var(--surface, #ffffff)',
            borderRadius: 12,
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          {/* Optional Embedded Date Filter */}
          {hasDateFilter && (
            <div
              style={{
                padding: '8px 10px 10px',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-3, #64748b)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <span>Export Date Range</span>
                {isFiltered && onClearDates && (
                  <button
                    type="button"
                    onClick={onClearDates}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#0284c7',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-3, #64748b)', marginBottom: 2 }}>From</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => onFromDateChange && onFromDateChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: 11,
                      border: '1px solid var(--border, #cbd5e1)',
                      borderRadius: 6,
                      background: 'var(--surface-2, #f8fafc)',
                      color: 'var(--text, #1e293b)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-3, #64748b)', marginBottom: 2 }}>To</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => onToDateChange && onToDateChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: 11,
                      border: '1px solid var(--border, #cbd5e1)',
                      borderRadius: 6,
                      background: 'var(--surface-2, #f8fafc)',
                      color: 'var(--text, #1e293b)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              padding: '4px 10px 2px',
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-3, #64748b)',
            }}
          >
            Select Export Format
          </div>

          {visibleFormats.map((fmt) => {
            const isItemBusy = busyFormat === fmt.key
            return (
              <button
                key={fmt.key}
                type="button"
                disabled={Boolean(busyFormat)}
                onClick={() => handleSelect(fmt.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: busyFormat ? 'wait' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-2, #f1f5f9)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: fmt.badgeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isItemBusy ? (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        border: `2px solid ${fmt.badgeColor}`,
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                      }}
                    />
                  ) : (
                    fmt.icon
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #1e293b)' }}>
                      {fmt.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: fmt.badgeBg,
                        color: fmt.badgeColor,
                      }}
                    >
                      {fmt.ext}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3, #64748b)', marginTop: 2 }}>
                    {fmt.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
