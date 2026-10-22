import React, { useEffect, useRef, useState } from 'react'
import { Btn, Spinner } from './ui'
import { exportReport } from '../shared/exportUtils'

const FORMAT_CONFIG = {
  csv: {
    key: 'csv',
    label: 'CSV (.csv)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M8 13h2" />
        <path d="M8 17h8" />
        <path d="M14 13h2" />
      </svg>
    ),
    badgeColor: '#0284c7',
    badgeBg: '#e0f2fe',
  },
  excel: {
    key: 'excel',
    label: 'Excel (.xlsx)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M8 13l3 4" />
        <path d="M11 13l-3 4" />
        <line x1="15" y1="13" x2="15" y2="17" />
      </svg>
    ),
    badgeColor: '#16a34a',
    badgeBg: '#dcfce7',
  },
  pdf: {
    key: 'pdf',
    label: 'PDF (.pdf)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15h6" />
        <path d="M9 12h6" />
      </svg>
    ),
    badgeColor: '#dc2626',
    badgeBg: '#fee2e2',
  },
  print: {
    key: 'print',
    label: 'Print',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    ),
    badgeColor: '#4b5563',
    badgeBg: '#f3f4f6',
  },
}

export default function ExportDropdown({
  label = 'Download Report',
  buttonText,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  title = 'Management System Report',
  subtitle = '',
  filename = 'report',
  headers = [],
  rows = [],
  data = null,
  columns = null,
  getData = null,
  onExport = null,
  formats = ['csv', 'excel', 'pdf', 'print'],
  orientation,
  align = 'right',
  style = {},
  buttonStyle = {},
  metadata = {},
  onError = null,
  onSuccess = null,
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [exportingFormat, setExportingFormat] = useState(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  const activeFormats = formats
    .map((f) => (typeof f === 'string' ? f.toLowerCase() : f))
    .filter((f) => FORMAT_CONFIG[f])

  const displayLabel = buttonText || label

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setDropUp(spaceBelow < 185 && spaceAbove > spaceBelow)
    }
    setOpen((prev) => !prev)
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event) {
      if (!open) return

      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % activeFormats.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + activeFormats.length) % activeFormats.length)
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (focusedIndex >= 0 && focusedIndex < activeFormats.length) {
          event.preventDefault()
          handleSelectFormat(activeFormats[focusedIndex])
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, focusedIndex, activeFormats])

  const handleSelectFormat = async (fmtKey) => {
    setOpen(false)
    setExportingFormat(fmtKey)
    try {
      if (typeof onExport === 'function') {
        await onExport(fmtKey, {
          title,
          subtitle,
          filename,
          headers,
          rows,
          data,
          columns,
          orientation,
          metadata,
        })
      } else {
        let exportData = {
          format: fmtKey,
          title,
          subtitle,
          filename,
          headers,
          rows,
          data,
          columns,
          orientation,
          metadata,
        }

        if (typeof getData === 'function') {
          const dynamic = await getData(fmtKey)
          if (dynamic) {
            exportData = {
              ...exportData,
              ...(Array.isArray(dynamic) ? { rows: dynamic } : dynamic),
            }
          }
        }

        await exportReport(exportData)
      }
      if (typeof onSuccess === 'function') {
        onSuccess(fmtKey)
      }
    } catch (err) {
      console.error(`Export failed for format ${fmtKey}:`, err)
      const errorMsg = err?.message || 'Failed to export report.'
      if (typeof onError === 'function') {
        onError(errorMsg)
      } else {
        window.alert(errorMsg)
      }
    } finally {
      setExportingFormat(null)
    }
  }

  const isExporting = exportingFormat !== null
  const effectiveDisabled = disabled || isExporting

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle',
        zIndex: open ? 100 : undefined,
        ...style,
      }}
    >
      <Btn
        ref={buttonRef}
        variant={variant}
        size={size}
        disabled={effectiveDisabled}
        onClick={toggleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          ...buttonStyle,
        }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {isExporting ? (
          <>
            <Spinner size={size === 'sm' ? 12 : 14} />
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <span>{displayLabel}</span>
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
                transition: 'transform 0.15s ease',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        )}
      </Btn>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Export options"
          style={{
            position: 'absolute',
            ...(dropUp ? { bottom: 'calc(100% + 5px)' } : { top: 'calc(100% + 5px)' }),
            [align === 'left' ? 'left' : 'right']: 0,
            zIndex: 1000,
            minWidth: 170,
            background: 'var(--surface, #ffffff)',
            borderRadius: 10,
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.08)',
            padding: '5px',
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          <div
            style={{
              padding: '4px 8px 4px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-3, #94a3b8)',
              borderBottom: '1px solid var(--border, #f1f5f9)',
              marginBottom: 3,
            }}
          >
            Export Format
          </div>

          {activeFormats.map((fmtKey, idx) => {
            const config = FORMAT_CONFIG[fmtKey]
            const isFocused = focusedIndex === idx

            return (
              <button
                key={fmtKey}
                role="menuitem"
                type="button"
                onClick={() => handleSelectFormat(fmtKey)}
                onMouseEnter={() => setFocusedIndex(idx)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: isFocused ? 'var(--surface-2, #f1f5f9)' : 'transparent',
                  color: 'var(--text, #1e293b)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s ease',
                  outline: 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: config.badgeBg,
                    color: config.badgeColor,
                    flexShrink: 0,
                  }}
                >
                  {config.icon}
                </span>

                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    color: 'inherit',
                  }}
                >
                  {config.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
