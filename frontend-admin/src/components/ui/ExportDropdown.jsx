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
  disabled = false,
  size = 'sm',
  variant = 'secondary',
  align = 'right',
  style,
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
      if (typeof onExport === 'function') {
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

  const isPrimary = variant === 'primary'

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
          border: isPrimary ? 'none' : '1px solid var(--border)',
          background: isPrimary ? 'var(--green-800)' : 'var(--surface-2)',
          color: isPrimary ? '#ffffff' : 'var(--text)',
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
            minWidth: 260,
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          <div
            style={{
              padding: '6px 10px 4px',
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-3)',
            }}
          >
            Select Export Format
          </div>

          {FORMATS.map((fmt) => {
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
                  e.currentTarget.style.background = 'var(--surface-2)'
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
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
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
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
