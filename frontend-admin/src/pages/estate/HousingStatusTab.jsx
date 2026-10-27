import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Badge, Btn, Card, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import estateApi from '../../api/estate'
import { todayISO } from '../../shared/utils'
import { Trash2, EyeOff, Eye, Clock, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import HousingDeleteHistoryModal from './HousingDeleteHistoryModal'
import HousingTrashModal from './HousingTrashModal'

export function toDateInputValue(str) {
  if (!str) return ''
  const trimmed = String(str).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // Match e.g. 21-Sep-2026 or 22-Jul-26 or 6-Jul-2026 or 27-Jul-26
  const monMatch = trimmed.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})/)
  if (monMatch) {
    const day = monMatch[1].padStart(2, '0')
    const monStr = monMatch[2].toLowerCase()
    let year = monMatch[3]
    if (year.length === 2) year = '20' + year
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const monIdx = months.findIndex((m) => monStr.startsWith(m))
    if (monIdx !== -1) {
      const month = String(monIdx + 1).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  // Match DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY or DD-MM-YY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (dmyMatch) {
    let part1 = dmyMatch[1].padStart(2, '0')
    let part2 = dmyMatch[2].padStart(2, '0')
    let year = dmyMatch[3]
    if (year.length === 2) year = '20' + year
    let day = part1
    let month = part2
    if (parseInt(part1, 10) <= 12 && parseInt(part2, 10) > 12) {
      month = part1
      day = part2
    }
    return `${year}-${month}-${day}`
  }

  const parsed = Date.parse(trimmed)
  if (!isNaN(parsed)) {
    const d = new Date(parsed)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return ''
}

export function formatDisplayDate(str) {
  if (!str) return '—'
  const trimmed = String(str).trim()
  if (['completed', 'pending', 'in progress', 'null', 'undefined', '—', '-'].includes(trimmed.toLowerCase())) {
    return '—'
  }
  const iso = toDateInputValue(str)
  if (iso) {
    const [yyyy, mm, dd] = iso.split('-')
    return `${dd}/${mm}/${yyyy}`
  }
  return trimmed.replace(/\s+at\s+\d{1,2}:\d{2}\s*hrs/i, '').trim() || '—'
}

export function checkCivilDone(r) {
  if (!r) return false
  const s = (r.civilStatus || '').toLowerCase().trim()
  if (s === 'in progress' || s === 'pending' || s === 'on process') return false
  return s === 'completed' || s === 'complted' || Boolean(r.civilCompletedDate) || Boolean(r.civilKeyHandedOverDate) || Boolean(r.civilIsLocked)
}

export function checkElecDone(r) {
  if (!r) return false
  const s = (r.electricalStatus || '').toLowerCase().trim()
  if (s === 'in progress' || s === 'pending' || s === 'on process') return false
  return s === 'completed' || s === 'complted' || Boolean(r.electricalCompletedDate) || Boolean(r.electricalKeyHandedOverDate) || Boolean(r.electricalIsLocked)
}

export function checkHKDone(r) {
  if (!r) return false
  const s = (r.hkStatus || '').toLowerCase().trim()
  if (s === 'in progress' || s === 'pending' || s === 'on process') return false
  return s === 'completed' || s === 'complted' || Boolean(r.hkCompletedDate) || Boolean(r.hkKeyHandedOverDate) || Boolean(r.hkIsLocked)
}

/**
 * StatusBadge component styled with project theme variables
 */
export function StatusBadge({ status }) {
  if (!status) return <span style={{ color: 'var(--text-3)' }}>—</span>
  const s = String(status).trim().toLowerCase()
  if (s === 'completed' || s === 'complted') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          background: 'var(--green-100)',
          color: 'var(--green-800)',
          fontWeight: 700,
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--completed)' }} />
        Completed
      </span>
    )
  }
  if (s === 'in progress' || s === 'in_progress' || s === 'on process') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          background: '#eff6ff',
          color: '#1d4ed8',
          fontWeight: 700,
          fontSize: 11,
          border: '1px solid #bfdbfe',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ongoing)' }} />
        In Progress
      </span>
    )
  }
  if (s === 'pending') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          background: 'var(--orange-100)',
          color: 'var(--orange-600)',
          fontWeight: 700,
          fontSize: 11,
          border: '1px solid #fed7aa',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--pending)' }} />
        Pending
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 10,
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        fontWeight: 600,
        fontSize: 11,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

/**
 * Interactive Calendar Date Picker component matching project theme
 */
export function CalendarDatePicker({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}) {
  const dateRef = useRef(null)
  const isoVal = toDateInputValue(value)

  const openPicker = () => {
    if (!disabled && dateRef.current) {
      if (typeof dateRef.current.showPicker === 'function') {
        try {
          dateRef.current.showPicker()
        } catch (_) { }
      } else {
        dateRef.current.focus()
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2)',
          marginBottom: 6,
          display: 'block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={label}
      >
        {label} {required && <span style={{ color: 'var(--urgent)' }}>*</span>}
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderRadius: 8,
          border: '1.5px solid var(--border)',
          background: disabled ? 'var(--surface-2)' : 'var(--surface)',
          overflow: 'hidden',
          height: 38,
          boxSizing: 'border-box',
          transition: 'all 0.15s ease',
        }}
      >
        <input
          ref={dateRef}
          type="date"
          value={isoVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          onClick={openPicker}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            padding: '0 10px',
            border: 'none',
            outline: 'none',
            fontSize: 13,
            background: 'transparent',
            color: disabled ? 'var(--text-3)' : 'var(--text)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            colorScheme: 'light',
          }}
        />
      </div>
    </div>
  )
}

/**
 * Helper to extract any DD-Mon-YY, DD-Mon-YYYY, YYYY-MM-DD or DD-MM-YYYY from arbitrary text
 */
export function extractDateFromText(str) {
  if (!str) return ''
  const trimmed = String(str).trim()

  // Match e.g. 03-July-26 or 3-Jul-26 or 16-Jan-27 or 16-Jun-2027
  const monMatch = trimmed.match(/(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})/)
  if (monMatch) {
    const day = monMatch[1].padStart(2, '0')
    const monStr = monMatch[2].toLowerCase()
    let year = monMatch[3]
    if (year.length === 2) year = '20' + year
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const monIdx = months.findIndex((m) => monStr.startsWith(m))
    if (monIdx !== -1) {
      const month = String(monIdx + 1).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  // Match ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0')
    let month = dmyMatch[2].padStart(2, '0')
    let year = dmyMatch[3]
    if (year.length === 2) year = '20' + year
    if (parseInt(day, 10) <= 12 && parseInt(month, 10) > 12) {
      const temp = day
      day = month
      month = temp
    }
    return `${year}-${month}-${day}`
  }

  return toDateInputValue(trimmed)
}

/**
 * Format ISO date string into standard IITGN display date (e.g. 03-Jul-26)
 */
export function formatTenureDate(isoDate) {
  if (!isoDate) return ''
  const trimmed = String(isoDate).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yyyy, mm, dd] = trimmed.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monIdx = parseInt(mm, 10) - 1
    const mon = months[monIdx] || 'Jan'
    const shortYr = yyyy.slice(-2)
    return `${dd}-${mon}-${shortYr}`
  }
  return trimmed
}

/**
 * ExpiryTenurePicker: Dropdown (PoE, Contract, Lien, Fixed, Custom) + Calendar date picker
 */
export function ExpiryTenurePicker({ value = '', onChange, disabled = false }) {
  const parseVal = (v) => {
    const s = String(v || '').trim()
    if (!s) return { type: 'poe', date: '', custom: '' }
    const lower = s.toLowerCase()
    if (lower.includes('poe') || lower.includes('relocation')) {
      return { type: 'poe', date: '', custom: '' }
    }
    if (lower.includes('contract') || lower.includes('cotract')) {
      const d = extractDateFromText(s)
      return { type: 'contract', date: d, custom: '' }
    }
    if (lower.includes('lien')) {
      const d = extractDateFromText(s)
      return { type: 'lien', date: d, custom: '' }
    }
    const d = extractDateFromText(s)
    if (d && !lower.match(/[a-z]{4,}/)) {
      return { type: 'fixed', date: d, custom: '' }
    }
    return { type: 'custom', date: '', custom: s }
  }

  const [state, setState] = useState(() => parseVal(value))

  useEffect(() => {
    setState(parseVal(value))
  }, [value])

  const handleTypeChange = (newType) => {
    if (newType === 'poe') {
      setState({ type: 'poe', date: '', custom: '' })
      onChange('PoE/Relocation, whichever is earlier')
    } else if (newType === 'contract') {
      const d = state.date || ''
      setState((prev) => ({ ...prev, type: 'contract' }))
      onChange(d ? `On Contract till ${formatTenureDate(d)}` : 'On Contract')
    } else if (newType === 'lien') {
      const d = state.date || ''
      setState((prev) => ({ ...prev, type: 'lien' }))
      onChange(d ? `On Lien till ${formatTenureDate(d)}` : 'On Lien')
    } else if (newType === 'fixed') {
      const d = state.date || ''
      setState((prev) => ({ ...prev, type: 'fixed' }))
      onChange(d ? formatTenureDate(d) : '')
    } else {
      const c = state.custom || value || ''
      setState((prev) => ({ ...prev, type: 'custom' }))
      onChange(c)
    }
  }

  const handleDateChange = (newDate) => {
    setState((prev) => {
      const updated = { ...prev, date: newDate }
      let nextStr = ''
      if (updated.type === 'contract') {
        nextStr = newDate ? `On Contract till ${formatTenureDate(newDate)}` : 'On Contract'
      } else if (updated.type === 'lien') {
        nextStr = newDate ? `On Lien till ${formatTenureDate(newDate)}` : 'On Lien'
      } else if (updated.type === 'fixed') {
        nextStr = newDate ? formatTenureDate(newDate) : ''
      }
      onChange(nextStr)
      return updated
    })
  }

  const handleCustomChange = (text) => {
    setState((prev) => ({ ...prev, custom: text }))
    onChange(text)
  }

  const isDateType = state.type === 'contract' || state.type === 'lien' || state.type === 'fixed'

  return (
    <div
      style={{
        background: 'var(--surface-2)',
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
            Date of Expiry / Tenure Type
          </label>
          <select
            value={state.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={disabled}
            style={{
              width: '100%',
              height: 38,
              padding: '0 10px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              outline: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="poe">PoE/Relocation, whichever is earlier</option>
            <option value="contract">On Contract till (date)</option>
            <option value="lien">On Lien till (date)</option>
            <option value="fixed">Fixed Tenure Date</option>
            <option value="custom">Custom / Other text</option>
          </select>
        </div>

        <div>
          {state.type === 'poe' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                Tenure Status
              </label>
              <div
                style={{
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 8,
                  background: 'var(--green-100)',
                  border: '1px solid #bbf7d0',
                  color: 'var(--green-900)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                }}
              >
                <span>Standard Faculty Tenure (PoE/Relocation)</span>
              </div>
            </div>
          ) : isDateType ? (
            <CalendarDatePicker
              label={
                state.type === 'contract'
                  ? 'Contract Expiry Date *'
                  : state.type === 'lien'
                    ? 'Lien Expiry Date *'
                    : 'Tenure Expiry Date *'
              }
              value={state.date}
              onChange={handleDateChange}
              disabled={disabled}
              required
            />
          ) : (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                Custom Tenure / Expiry Terms
              </label>
              <input
                type="text"
                value={state.custom}
                onChange={(e) => handleCustomChange(e.target.value)}
                disabled={disabled}
                placeholder="e.g. Visiting Professor till Dec 2026"
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  fontSize: 13,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Live Value Preview Pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', padding: '2px 4px' }}>
        <span>
          Recorded Expiry:{' '}
          <strong style={{ color: 'var(--green-900)', fontWeight: 700 }}>
            {value || 'PoE/Relocation, whichever is earlier'}
          </strong>
        </span>
        {isDateType && !state.date && (
          <span style={{ color: '#b45309', fontWeight: 600 }}>
            Select the exact expiry date from calendar
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * SearchableHouseSelect matching project theme
 */
export function SearchableHouseSelect({
  houseType,
  value,
  onChange,
  vacantUnits = [],
  placeholder = 'Select or type house no...',
  required = true,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const rawType = (houseType || 'A').replace('Type', '').trim().toUpperCase()

  const matchingUnits = useMemo(() => {
    return vacantUnits.filter((u) => {
      const uType = (u.houseType || '').replace('Type', '').trim().toUpperCase()
      return uType === rawType
    })
  }, [vacantUnits, rawType])

  const filteredOptions = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (!q) return matchingUnits
    return matchingUnits.filter((u) => {
      const hNo = (u.houseNo || '').toLowerCase()
      return hNo.includes(q)
    })
  }, [matchingUnits, value])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 38,
          borderRadius: 8,
          border: '1.5px solid var(--border)',
          background: disabled ? 'var(--surface-2)' : 'var(--surface)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'all 0.15s ease',
          cursor: disabled ? 'not-allowed' : 'default',
        }}
      >
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            if (disabled) return
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true)
          }}
          placeholder={matchingUnits.length > 0 ? placeholder : `No vacant ${houseType} units`}
          required={required}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            padding: '0 11px',
            border: 'none',
            outline: 'none',
            fontSize: 13,
            background: 'transparent',
            color: disabled ? 'var(--text-3)' : 'var(--text)',
            cursor: disabled ? 'not-allowed' : 'inherit',
            fontFamily: 'inherit',
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              onChange('')
              setIsOpen(true)
            }}
            title="Clear house selection"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '0 6px',
              height: '100%',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        )}
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '0 10px',
              height: '100%',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isOpen ? '▲' : '▼'}
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--surface)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            zIndex: 1050,
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((u) => {
              const isSelected = u.houseNo === value
              return (
                <div
                  key={u.id}
                  onClick={() => {
                    onChange(u.houseNo)
                    setIsOpen(false)
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'var(--green-100)' : 'transparent',
                    color: isSelected ? 'var(--green-900)' : 'var(--text)',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{u.houseNo}</span>
                </div>
              )
            })
          ) : (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
              {matchingUnits.length === 0
                ? `No vacant units found for ${houseType}`
                : `No matching house for "${value}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CLEARED_HISTORY_KEY = 'housing_status_cleared_history'

const getSavedClearedHistory = () => {
  try {
    const raw = localStorage.getItem(CLEARED_HISTORY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

export default function HousingStatusTab({ onReloadHousing, isReadOnly: propReadOnly }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.is_superuser
  const isEstateOffice = user?.role === 'estate_office'
  const isReadOnly = propReadOnly !== undefined ? propReadOnly : (isAdmin ? true : false)
  const isMaster = isAdmin || isEstateOffice
  const isCivil = user?.role === 'civil_team'
  const isElectrical = user?.role === 'electrical_team'
  const isHK = user?.role === 'hk_inventory_manager' || user?.role === 'supervisor' || user?.role === 'caretaker'

  const [clearances, setClearances] = useState([])
  const [vacantUnits, setVacantUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [clearedHistory, setClearedHistory] = useState(getSavedClearedHistory)

  const saveClearedHistory = (next) => {
    setClearedHistory(next)
    try {
      localStorage.setItem(CLEARED_HISTORY_KEY, JSON.stringify(next))
    } catch (e) {
      console.error('Failed to save cleared history:', e)
    }
  }

  // Department view isolation
  const activeView = isCivil ? 'civil' : isElectrical ? 'electrical' : isHK ? 'hk' : 'master'

  const defaultDeptFilter = isCivil
    ? 'civil_pending'
    : isElectrical
      ? 'electrical_pending'
      : isHK
        ? 'hk_pending'
        : 'all'
  const [deptFilter, setDeptFilter] = useState(defaultDeptFilter)

  // Department-specific Automated Email Alerts status
  const [alertsState, setAlertsState] = useState({
    enabled: true,
    civil: true,
    electrical: true,
    hk: true,
    estate: true,
    userDept: 'all',
    isMaster: false,
  })
  const [togglingAlerts, setTogglingAlerts] = useState(false)
  const [showAlertsMenu, setShowAlertsMenu] = useState(false)
  const alertsMenuRef = useRef(null)

  // History Deletion & 24-Hour Recovery Trash State
  const [isDeleteHistoryOpen, setIsDeleteHistoryOpen] = useState(false)
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  const [deleteToast, setDeleteToast] = useState(null)

  const refreshTrashCount = () => {
    estateApi.getClearanceTrash()
      .then((res) => {
        setTrashCount(res?.data?.total_in_trash || 0)
      })
      .catch((err) => console.error('Failed to load clearance trash count:', err))
  }

  useEffect(() => {
    refreshTrashCount()
  }, [])

  const handleConfirmDeleteHistory = async (payload) => {
    const res = await estateApi.deleteClearanceHistory(payload)
    const deletedIds = res?.data?.deleted_ids || payload.ids || []
    const count = res?.data?.deleted_count || deletedIds.length
    setClearances((prev) => prev.filter((c) => !deletedIds.includes(c.id)))
    refreshTrashCount()
    setDeleteToast({ count, ids: deletedIds })
    setTimeout(() => {
      setDeleteToast(null)
    }, 12000)
  }

  const handleUndoRecentDelete = async () => {
    if (!deleteToast || !deleteToast.ids || deleteToast.ids.length === 0) return
    try {
      await estateApi.restoreClearanceTrash({ ids: deleteToast.ids })
      setDeleteToast(null)
      loadData()
      refreshTrashCount()
    } catch (err) {
      console.error('Failed to undo delete:', err)
      alert(err?.response?.data?.error || 'Failed to restore records.')
    }
  }

  useEffect(() => {
    estateApi.getClearanceAlertsStatus()
      .then((res) => {
        if (res.data) {
          setAlertsState({
            enabled: Boolean(res.data.enabled),
            civil: res.data.civil !== false,
            electrical: res.data.electrical !== false,
            hk: res.data.hk !== false,
            estate: res.data.estate !== false,
            userDept: res.data.userDept || 'all',
            isMaster: Boolean(res.data.isMaster),
          })
        }
      })
      .catch((err) => console.error('Failed to load clearance alerts status:', err))
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (alertsMenuRef.current && !alertsMenuRef.current.contains(event.target)) {
        setShowAlertsMenu(false)
      }
    }
    if (showAlertsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAlertsMenu])

  const handleToggleDeptAlert = async (targetDept) => {
    setTogglingAlerts(true)
    try {
      let dept = targetDept
      if (!dept) {
        if (isCivil) dept = 'civil'
        else if (isElectrical) dept = 'electrical'
        else if (isHK) dept = 'hk'
        else if (isEstateOffice) dept = 'estate'
        else dept = 'all'
      }

      let currentVal = true
      if (dept === 'civil') currentVal = alertsState.civil
      else if (dept === 'electrical') currentVal = alertsState.electrical
      else if (dept === 'hk') currentVal = alertsState.hk
      else if (dept === 'estate') currentVal = alertsState.estate
      else currentVal = alertsState.enabled

      const res = await estateApi.toggleClearanceAlerts({
        department: dept,
        enabled: !currentVal,
      })

      if (res.data) {
        setAlertsState((prev) => ({
          ...prev,
          enabled: Boolean(res.data.enabled),
          civil: res.data.civil !== false,
          electrical: res.data.electrical !== false,
          hk: res.data.hk !== false,
          estate: res.data.estate !== false,
        }))
      }
    } catch (err) {
      console.error('Failed to toggle clearance alerts:', err)
      alert(err.response?.data?.error || 'Could not toggle email alerts.')
    } finally {
      setTogglingAlerts(false)
    }
  }

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [activeRecord, setActiveRecord] = useState(null)
  const [priorityModalRecord, setPriorityModalRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDeptClearances, setShowDeptClearances] = useState(false)

  // Form for Add/Edit
  const [form, setForm] = useState({
    houseType: 'Type A',
    houseNo: '',
    allotteeName: '',
    emplCode: '',
    designation: '',
    email: '',
    dateOfExpiry: 'PoE/Relocation, whichever is earlier',
    timeStamp: todayISO(),
    keyHandedOverDate: '',
    priority: '',

    civilKeyReceivedDate: '',
    civilStatus: 'Pending',
    civilCompletedDate: '',
    civilRemarks: '',

    electricalKeyReceivedDate: '',
    electricalStatus: 'Pending',
    electricalCompletedDate: '',
    electricalRemarks: '',

    hkHandoverDate: '',
    hkStatus: 'Pending',
    hkCompletedDate: '',
    hkRemarks: '',

    estateDate1: '',
    estateDate2: '',
    estateDate3: '',
    estateDate4: '',
    estateRemarks: '',

    remarks: '',
    status: 'in_progress',
  })

  const isCurrentDeptLocked = activeRecord ? (
    (isCivil && checkCivilDone(activeRecord)) ||
    (isElectrical && checkElecDone(activeRecord)) ||
    (isHK && checkHKDone(activeRecord))
  ) : false
  const isLockedForUser = isEditOpen && (isReadOnly || (isCurrentDeptLocked && !isAdmin))
  const isFormDisabled = isLockedForUser

  // Load clearances and vacant units
  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [clearancesRes, unitsRes] = await Promise.all([
        estateApi.getClearances(),
        estateApi.getHousingUnits({ light: 'true' }),
      ])
      setClearances(clearancesRes.data || [])
      const allU = unitsRes.data || []
      setVacantUnits(allU.filter((u) => u.status === 'vacant'))
    } catch (err) {
      console.error('Failed to load housing status data:', err)
      setError('Failed to load housing status records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Department pipeline counts
  const counts = useMemo(() => {
    let active = 0
    let civilPending = 0
    let elecPending = 0
    let hkPending = 0
    let readyEstate = 0
    let completed = 0

    let civilCompleted = 0
    let civilCompletedVisible = 0
    let elecCompleted = 0
    let elecCompletedVisible = 0
    let hkCompleted = 0
    let hkCompletedVisible = 0
    let completedVisible = 0

    const clearedCivil = clearedHistory['civil'] || []
    const clearedElec = clearedHistory['electrical'] || []
    const clearedHK = clearedHistory['hk'] || []
    const clearedMaster = clearedHistory['master'] || []

    clearances.forEach((c) => {
      const isAllotted = Boolean(c.isAllotted)
      const isCivilDone = checkCivilDone(c)
      const isElecDone = checkElecDone(c)
      const isHKDone = checkHKDone(c)

      if (c.keyHandedOverDate) {
        if (!isCivilDone) civilPending++
        else {
          civilCompleted++
          if (!clearedCivil.includes(c.id)) civilCompletedVisible++
        }
      }

      if (isCivilDone) {
        if (!isElecDone) elecPending++
        else {
          elecCompleted++
          if (!clearedElec.includes(c.id)) elecCompletedVisible++
        }
      }

      if (isElecDone) {
        if (!isHKDone) hkPending++
        else {
          hkCompleted++
          if (!clearedHK.includes(c.id)) hkCompletedVisible++
        }
      }

      if (isAllotted) {
        completed++
        if (!clearedMaster.includes(c.id)) completedVisible++
      } else {
        active++
        const isCivilPending = (c.civilStatus || '').toLowerCase() === 'pending'
        const isElecPending = (c.electricalStatus || '').toLowerCase() === 'pending'
        const isHKPending = (c.hkStatus || '').toLowerCase() === 'pending'

        const isDeptsDone = isCivilDone && isElecDone && isHKDone
        const isClearanceDone = isDeptsDone ||
          (c.status === 'completed' && !isCivilPending && !isElecPending && !isHKPending)

        if (isClearanceDone) readyEstate++
      }
    })

    return {
      total: clearances.length,
      active,
      civilPending,
      civilCompleted,
      civilCompletedVisible,
      hiddenCivil: civilCompleted - civilCompletedVisible,
      totalCivil: civilPending + civilCompletedVisible,
      elecPending,
      elecCompleted,
      elecCompletedVisible,
      hiddenElec: elecCompleted - elecCompletedVisible,
      totalElec: elecPending + elecCompletedVisible,
      hkPending,
      hkCompleted,
      hkCompletedVisible,
      hiddenHK: hkCompleted - hkCompletedVisible,
      totalHK: hkPending + hkCompletedVisible,
      readyEstate,
      completed,
      completedVisible,
      hiddenMaster: completed - completedVisible,
    }
  }, [clearances, clearedHistory])

  // Filtered & Priority-Sorted rows (Priority 1 at top, then 2, 3...)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = clearances.filter((c) => {
      const isAllotted = Boolean(c.isAllotted)
      const isCivilDone = checkCivilDone(c)
      const isElecDone = checkElecDone(c)
      const isHKDone = checkHKDone(c)

      const isCivilPending = (c.civilStatus || '').toLowerCase() === 'pending'
      const isElecPending = (c.electricalStatus || '').toLowerCase() === 'pending'
      const isHKPending = (c.hkStatus || '').toLowerCase() === 'pending'

      const isDeptsDone = isCivilDone && isElecDone && isHKDone
      const isClearanceDone = isDeptsDone ||
        (c.status === 'completed' && !isCivilPending && !isElecPending && !isHKPending)

      // Department-specific view isolation
      if (activeView === 'civil') {
        if (!c.keyHandedOverDate) return false
        if (deptFilter === 'civil_pending' && isCivilDone) return false
        if (deptFilter === 'civil_completed') {
          if (!isCivilDone) return false
          if ((clearedHistory['civil'] || []).includes(c.id)) return false
        }
      } else if (activeView === 'electrical') {
        if (!isCivilDone) return false
        if (deptFilter === 'electrical_pending' && isElecDone) return false
        if (deptFilter === 'electrical_completed') {
          if (!isElecDone) return false
          if ((clearedHistory['electrical'] || []).includes(c.id)) return false
        }
      } else if (activeView === 'hk') {
        if (!isElecDone) return false
        if (deptFilter === 'hk_pending' && isHKDone) return false
        if (deptFilter === 'hk_completed') {
          if (!isHKDone) return false
          if ((clearedHistory['hk'] || []).includes(c.id)) return false
        }
      } else {
        // Master / Admin View
        if (deptFilter === 'completed') {
          if (!isAllotted) return false
          if ((clearedHistory['master'] || []).includes(c.id)) return false
        } else {
          if (isAllotted) return false
          if (deptFilter === 'civil_pending' && isCivilDone) return false
          if (deptFilter === 'electrical_pending' && isElecDone) return false
          if (deptFilter === 'hk_pending' && isHKDone) return false
          if (deptFilter === 'ready_estate' && !isClearanceDone) return false
        }
      }

      if (selectedType !== 'all') {
        const rawT = selectedType.replace('Type', '').trim().toUpperCase()
        const cType = (c.houseType || '').replace('Type', '').trim().toUpperCase()
        if (cType !== rawT) return false
      }
      if (q) {
        const matchName = (c.allotteeName || '').toLowerCase().includes(q)
        const matchHouse = (c.houseNo || '').toLowerCase().includes(q)
        const matchRem = (c.remarks || '').toLowerCase().includes(q) ||
          (c.civilRemarks || '').toLowerCase().includes(q) ||
          (c.electricalRemarks || '').toLowerCase().includes(q) ||
          (c.hkRemarks || '').toLowerCase().includes(q) ||
          (c.estateRemarks || '').toLowerCase().includes(q)
        if (!matchName && !matchHouse && !matchRem) return false
      }
      return true
    })

    return result.slice().sort((a, b) => {
      const pA = String(a.priority || '').trim()
      const pB = String(b.priority || '').trim()

      const hasA = Boolean(pA)
      const hasB = Boolean(pB)

      // Rows with priority always appear before rows without priority
      if (hasA && !hasB) return -1
      if (!hasA && hasB) return 1
      if (hasA && hasB) {
        const numA = Number(pA)
        const numB = Number(pB)
        const isNumA = !isNaN(numA) && pA !== ''
        const isNumB = !isNaN(numB) && pB !== ''

        if (isNumA && isNumB) {
          if (numA !== numB) return numA - numB
        } else if (isNumA && !isNumB) {
          return -1
        } else if (!isNumA && isNumB) {
          return 1
        } else {
          const strCmp = pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' })
          if (strCmp !== 0) return strCmp
        }
      }

      // Secondary sort: preserve order by srNo or id
      return (a.srNo || 0) - (b.srNo || 0) || (a.id || 0) - (b.id || 0)
    })
  }, [clearances, query, selectedType, deptFilter, activeView, clearedHistory])

  // Quick filter chips styled with project brand colors
  const filterChips = useMemo(() => {
    if (activeView === 'civil') {
      return [
        { key: 'civil_pending', label: 'Pending Civil Work', count: counts.civilPending },
        { key: 'civil_completed', label: 'Completed Civil Work', count: counts.civilCompletedVisible },
        { key: 'all', label: 'All Civil Flats', count: counts.totalCivil },
      ]
    }
    if (activeView === 'electrical') {
      return [
        { key: 'electrical_pending', label: 'Pending Electrical Work', count: counts.elecPending },
        { key: 'electrical_completed', label: 'Completed Electrical Work', count: counts.elecCompletedVisible },
        { key: 'all', label: 'All Electrical Flats', count: counts.totalElec },
      ]
    }
    if (activeView === 'hk') {
      return [
        { key: 'hk_pending', label: 'Pending Cleaning (HK)', count: counts.hkPending },
        { key: 'hk_completed', label: 'Completed Cleaning', count: counts.hkCompletedVisible },
        { key: 'all', label: 'All Housekeeping Flats', count: counts.totalHK },
      ]
    }
    return [
      { key: 'all', label: 'All Active Pipelines', count: counts.active },
      { key: 'civil_pending', label: 'Pending Civil', count: counts.civilPending },
      { key: 'electrical_pending', label: 'Pending Electrical', count: counts.elecPending },
      { key: 'hk_pending', label: 'Pending Cleaning (HK)', count: counts.hkPending },
      { key: 'ready_estate', label: 'Ready for Allotment', count: counts.readyEstate },
      { key: 'completed', label: 'Allotted History', count: counts.completedVisible },
    ]
  }, [activeView, counts])

  // Clear / Restore History Handlers (UI Only)
  const currentCompletedKey =
    deptFilter === 'civil_completed'
      ? 'civil'
      : deptFilter === 'electrical_completed'
        ? 'electrical'
        : deptFilter === 'hk_completed'
          ? 'hk'
          : deptFilter === 'completed'
            ? 'master'
            : null

  const hiddenCountForCurrent =
    currentCompletedKey === 'civil'
      ? counts.hiddenCivil
      : currentCompletedKey === 'electrical'
        ? counts.hiddenElec
        : currentCompletedKey === 'hk'
          ? counts.hiddenHK
          : currentCompletedKey === 'master'
            ? counts.hiddenMaster
            : 0

  const handleClearHistory = () => {
    if (isReadOnly || !currentCompletedKey) return
    const currentCompletedList = clearances.filter((c) => {
      if (currentCompletedKey === 'civil') return checkCivilDone(c)
      if (currentCompletedKey === 'electrical') return checkCivilDone(c) && checkElecDone(c)
      if (currentCompletedKey === 'hk') return checkElecDone(c) && checkHKDone(c)
      if (currentCompletedKey === 'master') return Boolean(c.isAllotted)
      return false
    })

    if (currentCompletedList.length === 0) {
      alert('No completed records to clear.')
      return
    }

    const confirmMsg =
      'Are you sure you want to clear completed history from your screen?\n\nNOTE: All records will remain safely saved in the database, only hidden from this view.'
    if (!window.confirm(confirmMsg)) return

    const existingCleared = clearedHistory[currentCompletedKey] || []
    const newIds = currentCompletedList.map((c) => c.id)
    const merged = Array.from(new Set([...existingCleared, ...newIds]))

    const next = {
      ...clearedHistory,
      [currentCompletedKey]: merged,
    }
    saveClearedHistory(next)
  }

  const handleRestoreHistory = () => {
    if (isReadOnly || !currentCompletedKey) return
    const next = {
      ...clearedHistory,
      [currentCompletedKey]: [],
    }
    saveClearedHistory(next)
  }

  // Open Add Modal
  const handleOpenAdd = () => {
    if (isReadOnly) return
    setForm({
      houseType: 'Type A',
      houseNo: '',
      allotteeName: '',
      emplCode: '',
      designation: '',
      email: '',
      dateOfExpiry: 'PoE/Relocation, whichever is earlier',
      timeStamp: todayISO(),
      keyHandedOverDate: '',
      priority: '',

      civilKeyReceivedDate: '',
      civilStatus: 'Pending',
      civilCompletedDate: '',
      civilRemarks: '',

      electricalKeyReceivedDate: '',
      electricalStatus: 'Pending',
      electricalCompletedDate: '',
      electricalRemarks: '',

      hkHandoverDate: '',
      hkStatus: 'Pending',
      hkCompletedDate: '',
      hkRemarks: '',

      estateDate1: '',
      estateDate2: '',
      estateDate3: '',
      estateDate4: '',
      estateRemarks: '',

      remarks: '',
      status: 'in_progress',
    })
    setShowDeptClearances(false)
    setIsAddOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (rec) => {
    setActiveRecord(rec)
    setForm({
      houseType: rec.houseType || 'Type A',
      houseNo: rec.houseNo || '',
      allotteeName: rec.allotteeName || '',
      emplCode: rec.emplCode || '',
      designation: rec.designation || '',
      email: rec.email || '',
      dateOfExpiry: rec.dateOfExpiry || 'PoE/Relocation, whichever is earlier',
      timeStamp: toDateInputValue(rec.timeStamp) || rec.timeStamp || todayISO(),
      keyHandedOverDate: toDateInputValue(rec.keyHandedOverDate) || '',
      priority: rec.priority || '',

      civilKeyReceivedDate: toDateInputValue(rec.civilKeyReceivedDate) || rec.civilKeyReceivedDate || '',
      civilStatus: rec.civilStatus || '',
      civilCompletedDate: toDateInputValue(rec.civilCompletedDate || rec.civilKeyHandedOverDate) || '',
      civilRemarks: rec.civilRemarks || '',

      electricalKeyReceivedDate: toDateInputValue(rec.electricalKeyReceivedDate) || rec.electricalKeyReceivedDate || '',
      electricalStatus: rec.electricalStatus || '',
      electricalCompletedDate: toDateInputValue(rec.electricalCompletedDate || rec.electricalKeyHandedOverDate) || '',
      electricalRemarks: rec.electricalRemarks || '',

      hkHandoverDate: toDateInputValue(rec.hkHandoverDate || rec.hkKeyReceivedDate) || '',
      hkStatus: rec.hkStatus || '',
      hkCompletedDate: toDateInputValue(rec.hkCompletedDate || rec.hkKeyHandedOverDate) || '',
      hkRemarks: rec.hkRemarks || '',

      estateDate1: toDateInputValue(rec.estateDate1 || rec.allotmentLetterIssuedDate) || '',
      estateDate2: toDateInputValue(rec.estateDate2 || rec.userAcceptedDate) || '',
      estateDate3: toDateInputValue(rec.estateDate3 || rec.keyHandedOverToAllotteeDate) || '',
      estateDate4: toDateInputValue(rec.estateDate4 || rec.possessionDeadlineDate) || '',
      estateRemarks: rec.estateRemarks || '',

      remarks: rec.remarks || '',
      status: rec.status || 'in_progress',
    })
    setShowDeptClearances(isAdmin && !isReadOnly ? true : false)
    setIsEditOpen(true)
  }

  // Submit Add
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        civil_key_received_date: form.civilKeyReceivedDate,
        civil_completed_date: form.civilCompletedDate,
        civil_remarks: form.civilRemarks,
        electrical_key_received_date: form.electricalKeyReceivedDate,
        electrical_completed_date: form.electricalCompletedDate,
        electrical_remarks: form.electricalRemarks,
        hk_handover_date: form.hkHandoverDate,
        hk_completed_date: form.hkCompletedDate,
        hk_remarks: form.hkRemarks,
        estate_date_1: form.estateDate1,
        estate_date_2: form.estateDate2,
        estate_date_3: form.estateDate3,
        estate_date_4: form.estateDate4,
        estate_remarks: form.estateRemarks,
        remarks: form.estateRemarks || form.remarks,
      }
      await estateApi.createClearance(payload)
      setIsAddOpen(false)
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      console.error('Failed to create clearance record:', err)
      alert(err.response?.data?.error || 'Failed to create record')
    } finally {
      setSaving(false)
    }
  }

  // Helper to determine live stage custody of key
  const getPipelineStage = (r) => {
    if (r.isAllotted) {
      return { step: 5, label: 'Allotted', color: 'var(--green-900)', bg: 'var(--green-100)', border: 'var(--border)' }
    }
    const isCivilDone = checkCivilDone(r)
    const isElecDone = checkElecDone(r)
    const isHKDone = checkHKDone(r)

    if (isCivilDone && isElecDone && isHKDone) {
      return { step: 4, label: 'Ready for Allotment', color: '#86198f', bg: '#fdf4ff', border: '#f0abfc' }
    }
    if (!r.keyHandedOverDate) {
      return { step: 0, label: 'Handover Pending', color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' }
    }
    if (!isCivilDone) {
      if (!r.civilKeyReceivedDate) {
        return { step: 1, label: 'Key Handed Over (Civil to Accept)', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }
      }
      return { step: 1, label: 'Civil Work', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }
    }
    if (!isElecDone) {
      if (!r.electricalKeyReceivedDate) {
        return { step: 2, label: 'Civil Done (Elec to Accept)', color: '#b45309', bg: '#fefce8', border: '#fde047' }
      }
      return { step: 2, label: 'Electrical Work', color: '#b45309', bg: '#fefce8', border: '#fde047' }
    }
    if (!isHKDone) {
      if (!(r.hkHandoverDate || r.hkKeyReceivedDate)) {
        return { step: 3, label: 'Elec Done (HK to Accept)', color: 'var(--completed)', bg: 'var(--green-100)', border: 'var(--border)' }
      }
      return { step: 3, label: 'Cleaning (HK)', color: 'var(--completed)', bg: 'var(--green-100)', border: 'var(--border)' }
    }
    return { step: 4, label: 'Ready for Allotment', color: '#86198f', bg: '#fdf4ff', border: '#f0abfc' }
  }

  // Estate Office Hands Over Key to Civil
  const handleEstateHandover = async (rec) => {
    if (isReadOnly) return
    if (!window.confirm(`Hand over key for ${rec.houseNo} to Civil Team today?`)) return
    try {
      await estateApi.patchClearance(rec.id, { action: 'estate_handover' })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to handover key to Civil')
    }
  }

  // Civil Actions
  const handleAcceptKeyCivil = async (rec) => {
    if (isReadOnly) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        civilKeyReceivedDate: today,
        civilStatus: rec.civilStatus === 'Completed' ? 'Completed' : 'In Progress',
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept key')
    }
  }

  const handleCompleteAndHandoverCivil = async (rec) => {
    if (isReadOnly) return
    if (!window.confirm(`Mark Civil work COMPLETED for ${rec.houseNo} and handover key to Electrical?\nYour edit access will be locked once handed over.`)) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        civilStatus: 'Completed',
        civilCompletedDate: today,
        civilKeyReceivedDate: rec.civilKeyReceivedDate || today,
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to complete Civil work')
    }
  }

  // Electrical Actions
  const handleAcceptKeyElec = async (rec) => {
    if (isReadOnly) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        electricalKeyReceivedDate: today,
        electricalStatus: rec.electricalStatus === 'Completed' ? 'Completed' : 'In Progress',
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept key')
    }
  }

  const handleCompleteAndHandoverElec = async (rec) => {
    if (isReadOnly) return
    if (!window.confirm(`Mark Electrical work COMPLETED for ${rec.houseNo} and handover key to Housekeeping?\nYour edit access will be locked once handed over.`)) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        electricalStatus: 'Completed',
        electricalCompletedDate: today,
        electricalKeyReceivedDate: rec.electricalKeyReceivedDate || today,
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to complete Electrical work')
    }
  }

  // Housekeeping Actions
  const handleAcceptKeyHK = async (rec) => {
    if (isReadOnly) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        hkHandoverDate: today,
        hkStatus: rec.hkStatus === 'Completed' ? 'Completed' : 'In Progress',
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept key')
    }
  }

  const handleCompleteAndHandoverHK = async (rec) => {
    if (isReadOnly) return
    if (!window.confirm(`Mark Cleaning COMPLETED for ${rec.houseNo} and handover key to Estate Office?\nThe unit will become Ready for Allotment, and edit access will be locked.`)) return
    try {
      const today = todayISO()
      await estateApi.patchClearance(rec.id, {
        hkStatus: 'Completed',
        hkCompletedDate: today,
        hkHandoverDate: rec.hkHandoverDate || rec.hkKeyReceivedDate || today,
      })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to complete Cleaning')
    }
  }

  // Priority Management
  const handleUpdatePriority = async (targetRecord, newPriorityValue) => {
    if (isReadOnly) return
    try {
      await estateApi.patchClearance(targetRecord.id, { priority: newPriorityValue })
      setPriorityModalRecord(null)
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update clearance priority')
    }
  }

  const handlePriorityShift = async (targetRecord, direction) => {
    if (isReadOnly) return
    try {
      await estateApi.patchClearance(targetRecord.id, { action: direction === 'up' ? 'priority_up' : 'priority_down' })
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reorder priority')
    }
  }

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!activeRecord) return
    if (isFormDisabled || isReadOnly) {
      alert('This clearance record is currently view-only.')
      return
    }
    setSaving(true)
    try {
      const today = todayISO()
      const sanitizedForm = { ...form }
      if (sanitizedForm.civilStatus === 'Completed' || sanitizedForm.civilCompletedDate) {
        sanitizedForm.civilCompletedDate = sanitizedForm.civilCompletedDate || today
        sanitizedForm.civilKeyReceivedDate = sanitizedForm.civilKeyReceivedDate || sanitizedForm.civilCompletedDate || today
      }
      if (sanitizedForm.electricalStatus === 'Completed' || sanitizedForm.electricalCompletedDate) {
        sanitizedForm.electricalCompletedDate = sanitizedForm.electricalCompletedDate || today
        sanitizedForm.electricalKeyReceivedDate = sanitizedForm.electricalKeyReceivedDate || sanitizedForm.electricalCompletedDate || today
      }
      if (sanitizedForm.hkStatus === 'Completed' || sanitizedForm.hkCompletedDate) {
        sanitizedForm.hkCompletedDate = sanitizedForm.hkCompletedDate || today
        sanitizedForm.hkHandoverDate = sanitizedForm.hkHandoverDate || sanitizedForm.hkCompletedDate || today
      }

      let patchPayload = { ...sanitizedForm }
      if (!isMaster) {
        if (isCivil) {
          patchPayload = {
            civilKeyReceivedDate: sanitizedForm.civilKeyReceivedDate,
            civilStatus: sanitizedForm.civilStatus,
            civilCompletedDate: sanitizedForm.civilCompletedDate,
            civilRemarks: sanitizedForm.civilRemarks,
          }
        } else if (isElectrical) {
          patchPayload = {
            electricalKeyReceivedDate: sanitizedForm.electricalKeyReceivedDate,
            electricalStatus: sanitizedForm.electricalStatus,
            electricalCompletedDate: sanitizedForm.electricalCompletedDate,
            electricalRemarks: sanitizedForm.electricalRemarks,
          }
        } else if (isHK) {
          patchPayload = {
            hkHandoverDate: sanitizedForm.hkHandoverDate,
            hkKeyReceivedDate: sanitizedForm.hkHandoverDate,
            hkStatus: sanitizedForm.hkStatus,
            hkCompletedDate: sanitizedForm.hkCompletedDate,
            hkRemarks: sanitizedForm.hkRemarks,
          }
        }
      } else {
        if (isEstateOffice && !isAdmin) {
          patchPayload = {
            houseType: sanitizedForm.houseType,
            houseNo: sanitizedForm.houseNo,
            allotteeName: sanitizedForm.allotteeName,
            emplCode: sanitizedForm.emplCode,
            designation: sanitizedForm.designation,
            email: sanitizedForm.email,
            dateOfExpiry: sanitizedForm.dateOfExpiry,
            timeStamp: sanitizedForm.timeStamp,
            keyHandedOverDate: sanitizedForm.keyHandedOverDate,
            priority: sanitizedForm.priority,
            estateDate1: sanitizedForm.estateDate1,
            estateDate2: sanitizedForm.estateDate2,
            estateDate3: sanitizedForm.estateDate3,
            estateDate4: sanitizedForm.estateDate4,
            estateRemarks: sanitizedForm.estateRemarks,
          }
        } else {
          patchPayload = {
            ...sanitizedForm,
            civil_key_received_date: sanitizedForm.civilKeyReceivedDate,
            civil_completed_date: sanitizedForm.civilCompletedDate,
            civil_remarks: sanitizedForm.civilRemarks,
            electrical_key_received_date: sanitizedForm.electricalKeyReceivedDate,
            electrical_completed_date: sanitizedForm.electricalCompletedDate,
            electrical_remarks: sanitizedForm.electricalRemarks,
            hk_handover_date: sanitizedForm.hkHandoverDate,
            hk_completed_date: sanitizedForm.hkCompletedDate,
            hk_remarks: sanitizedForm.hkRemarks,
            estate_date_1: sanitizedForm.estateDate1,
            estate_date_2: sanitizedForm.estateDate2,
            estate_date_3: sanitizedForm.estateDate3,
            estate_date_4: sanitizedForm.estateDate4,
            estate_remarks: sanitizedForm.estateRemarks,
          }
        }
      }
      await estateApi.patchClearance(activeRecord.id, patchPayload)
      setIsEditOpen(false)
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      console.error('Failed to update clearance record:', err)
      alert(err.response?.data?.error || 'Failed to update record')
    } finally {
      setSaving(false)
    }
  }

  // Delete Record
  const handleDelete = async (id) => {
    if (isReadOnly || isFormDisabled) return
    if (!window.confirm('Are you sure you want to delete this housing status entry?')) return
    try {
      await estateApi.deleteClearance(id)
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      console.error('Failed to delete clearance record:', err)
      alert('Failed to delete')
    }
  }

  // Finalize Allotment into House Register
  const handleFinalizeAllotment = async (rec) => {
    if (isReadOnly) return
    let allotteeName = (rec.allotteeName || '').trim()
    if (!allotteeName) {
      const promptName = window.prompt(`Enter Allottee Name to finalize allotment for ${rec.houseType} ${rec.houseNo}:`)
      if (!promptName || !promptName.trim()) return
      allotteeName = promptName.trim()
    }

    const isCivDone = checkCivilDone(rec)
    const isElDone = checkElecDone(rec)
    const isHkDone = checkHKDone(rec)
    if (!isCivDone || !isElDone || !isHkDone) {
      alert('Cannot finalize allotment yet. Civil, Electrical, and Housekeeping clearances must all be completed first.')
      return
    }
    const confirmMsg = `Finalize and allot ${rec.houseType} ${rec.houseNo} to ${allotteeName} in official House Register?`
    if (!window.confirm(confirmMsg)) return

    try {
      await estateApi.patchClearance(rec.id, {
        action: 'finalize_allotment',
        isAllotted: true,
        allotteeName,
        emplCode: rec.emplCode || '',
        designation: rec.designation || '',
        email: rec.email || '',
        dateOfExpiry: rec.dateOfExpiry || '',
        status: 'completed',
        estateDate4: rec.estateDate4 || rec.possessionDeadlineDate || rec.estateDate3 || todayISO(),
      })
      alert(`Success! ${rec.houseNo} is now officially OCCUPIED by ${allotteeName}.`)
      loadData()
      if (onReloadHousing) onReloadHousing()
    } catch (err) {
      console.error('Failed to finalize allotment:', err)
      alert(err.response?.data?.error || 'Failed to finalize allotment.')
    }
  }

  // Unified Department Row Renderer (eliminates duplicate code across Civil, Electrical, HK)
  const renderDepartmentRow = (r, idx) => {
    let prevDept = 'Estate'
    let handoverDate = r.keyHandedOverDate
    let keyReceivedDate = r.civilKeyReceivedDate
    let deptStatus = r.civilStatus
    let completedDate = r.civilCompletedDate || r.civilKeyHandedOverDate
    let remarks = r.civilRemarks
    let isDone = checkCivilDone(r)
    let canAct = isCivil && !isReadOnly
    let onAccept = () => handleAcceptKeyCivil(r)
    let onComplete = () => handleCompleteAndHandoverCivil(r)

    if (activeView === 'electrical') {
      prevDept = 'Civil'
      handoverDate = r.civilCompletedDate || r.civilKeyHandedOverDate
      keyReceivedDate = r.electricalKeyReceivedDate
      deptStatus = r.electricalStatus
      completedDate = r.electricalCompletedDate || r.electricalKeyHandedOverDate
      remarks = r.electricalRemarks
      isDone = checkElecDone(r)
      canAct = isElectrical && !isReadOnly
      onAccept = () => handleAcceptKeyElec(r)
      onComplete = () => handleCompleteAndHandoverElec(r)
    } else if (activeView === 'hk') {
      prevDept = 'Electrical'
      handoverDate = r.electricalCompletedDate || r.electricalKeyHandedOverDate
      keyReceivedDate = r.hkHandoverDate || r.hkKeyReceivedDate
      deptStatus = r.hkStatus
      completedDate = r.hkCompletedDate || r.hkKeyHandedOverDate
      remarks = r.hkRemarks
      isDone = checkHKDone(r)
      canAct = isHK && !isReadOnly
      onAccept = () => handleAcceptKeyHK(r)
      onComplete = () => handleCompleteAndHandoverHK(r)
    }

    return (
      <tr
        key={r.id || idx}
        style={{
          borderBottom: '1px solid var(--border)',
          background: isDone ? 'var(--green-100)' : idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
          color: 'var(--text)',
          verticalAlign: 'middle',
        }}
      >
        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)' }}>
          {idx + 1}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontWeight: 700,
              fontSize: 11,
              color: 'var(--text)',
              display: 'inline-block',
            }}
          >
            {r.houseType}
          </span>
        </td>
        <td style={{ padding: '10px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 800, color: 'var(--green-900)', fontSize: 13 }}>
            {r.houseNo}
          </div>
          {r.priority ? (
            <div style={{ marginTop: 3 }}>
              <span
                onClick={(e) => {
                  if (!isMaster || isReadOnly) return
                  e.stopPropagation()
                  setPriorityModalRecord(r)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: r.priority === '1' ? '#fee2e2' : r.priority === '2' ? '#ffedd5' : '#fef9c3',
                  color: r.priority === '1' ? '#991b1b' : r.priority === '2' ? '#9a3412' : '#854d0e',
                  border: `1px solid ${r.priority === '1' ? '#fca5a5' : r.priority === '2' ? '#fdba74' : '#fde047'}`,
                  letterSpacing: 0.2,
                  cursor: (isMaster && !isReadOnly) ? 'pointer' : 'default',
                }}
                title={(isMaster && !isReadOnly) ? 'Click to manage clearance priority' : undefined}
              >
                P{r.priority} · {r.priority === '1' ? 'Top' : r.priority === '2' ? 'High' : 'Normal'} Priority
              </span>
            </div>
          ) : (isMaster && !isReadOnly) ? (
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPriorityModalRecord(r)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-3)',
                  fontSize: 10,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                + Set Priority
              </button>
            </div>
          ) : null}
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: r.allotteeName ? 'var(--text)' : 'var(--text-3)' }}>
          {r.allotteeName || '— (Pending)'}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 12 }}>
          {formatDisplayDate(handoverDate)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 12 }}>
          {!handoverDate ? (
            <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>
              Awaiting Handover
            </span>
          ) : isDone ? (
            formatDisplayDate(keyReceivedDate) || (
              <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>—</span>
            )
          ) : !keyReceivedDate ? (
            canAct ? (
              <button
                type="button"
                onClick={onAccept}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--ongoing)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Accept Key
              </button>
            ) : (
              <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>
                Pending Acceptance
              </span>
            )
          ) : (
            formatDisplayDate(keyReceivedDate)
          )}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <StatusBadge status={deptStatus} />
            {isDone && !isAdmin && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--completed)',
                  background: 'var(--green-100)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                }}
              >
                Locked
              </span>
            )}
          </div>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 12 }}>
          {!keyReceivedDate && !isDone ? (
            <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>—</span>
          ) : !isDone ? (
            canAct ? (
              <button
                type="button"
                onClick={onComplete}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--completed)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeView === 'hk' ? 'Complete Cleaning' : 'Complete & Handover'}
              </button>
            ) : (
              <span style={{ color: 'var(--text-2)', fontSize: 11.5, fontWeight: 600 }}>
                Work in Progress
              </span>
            )
          ) : (
            formatDisplayDate(completedDate) || (
              <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>—</span>
            )
          )}
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-2)', minWidth: 180 }}>
          {remarks ? (
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>
              {remarks}
            </div>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>—</span>
          )}
        </td>
        <td style={{ padding: '10px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <button
            type="button"
            onClick={() => handleOpenEdit(r)}
            title={isReadOnly ? 'View Clearance Details' : (isDone && !isAdmin ? 'View Details (Locked)' : 'Edit Remarks and Work')}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isReadOnly || (isDone && !isAdmin) ? 'View' : 'Edit'}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', minWidth: 0, maxWidth: '100%' }}>
      {/* 1. Primary Pipeline Stage Navigation Chips + Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            padding: '2px 0',
            flex: 1,
            minWidth: 0,
          }}
        >
          {filterChips.map((chip) => {
            const isActive = deptFilter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setDeptFilter(chip.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: isActive ? '1.5px solid var(--green-900)' : '1.5px solid var(--border)',
                  background: isActive ? 'var(--green-900)' : 'var(--surface)',
                  color: isActive ? '#ffffff' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                  boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{chip.label}</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 800,
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                    color: isActive ? '#ffffff' : 'var(--text-2)',
                  }}
                >
                  {chip.count}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

          {isReadOnly && isAdmin && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--surface-2)',
                border: '1.5px solid var(--border)',
                color: 'var(--text-3)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              View-Only Mode
            </span>
          )}

          {/* Department-specific Email Alerts Toggle */}
          {!isMaster ? (
            (() => {
              const isDeptActive = isCivil
                ? alertsState.civil
                : isElectrical
                  ? alertsState.electrical
                  : isHK
                    ? alertsState.hk
                    : alertsState.enabled
              const deptName = isCivil
                ? 'Civil'
                : isElectrical
                  ? 'Electrical'
                  : isHK
                    ? 'Housekeeping'
                    : 'Email'
              return (
                <button
                  type="button"
                  onClick={() => handleToggleDeptAlert()}
                  disabled={togglingAlerts}
                  title={
                    isDeptActive
                      ? `${deptName} handover email alerts are ACTIVE. Click to turn OFF for ${deptName}.`
                      : `${deptName} handover email alerts are PAUSED. Click to turn ON for ${deptName}.`
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${isDeptActive ? '#86efac' : '#cbd5e1'}`,
                    background: isDeptActive ? '#f0fdf4' : '#f8fafc',
                    color: isDeptActive ? '#15803d' : '#64748b',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: togglingAlerts ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    boxShadow: isDeptActive ? '0 1px 3px rgba(34,197,94,0.15)' : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: isDeptActive ? '#22c55e' : '#94a3b8',
                      boxShadow: isDeptActive ? '0 0 6px #22c55e' : 'none',
                    }}
                  />
                  <span>{deptName} Alerts: {isDeptActive ? 'ON' : 'OFF'}</span>
                </button>
              )
            })()
          ) : (
            <div style={{ position: 'relative' }} ref={alertsMenuRef}>
              <button
                type="button"
                onClick={() => setShowAlertsMenu((v) => !v)}
                disabled={togglingAlerts}
                title="Manage email alert toggles for each department"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${alertsState.enabled ? '#86efac' : '#cbd5e1'}`,
                  background: alertsState.enabled ? '#f0fdf4' : '#f8fafc',
                  color: alertsState.enabled ? '#15803d' : '#64748b',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: alertsState.enabled ? '0 1px 3px rgba(34,197,94,0.15)' : 'none',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: alertsState.enabled ? '#22c55e' : '#94a3b8',
                    boxShadow: alertsState.enabled ? '0 0 6px #22c55e' : 'none',
                  }}
                />
                <span>Email Alerts: {alertsState.enabled ? 'Active' : 'Paused'}</span>
                <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
              </button>

              {showAlertsMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                    padding: '12px 14px',
                    width: 250,
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                    Department Alert Control
                  </div>

                  {/* Civil Team Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Civil Team</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Key received alert</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDeptAlert('civil')}
                      disabled={togglingAlerts}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${alertsState.civil ? '#86efac' : '#cbd5e1'}`,
                        background: alertsState.civil ? '#f0fdf4' : '#f8fafc',
                        color: alertsState.civil ? '#15803d' : '#64748b',
                      }}
                    >
                      {alertsState.civil ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Electrical Team Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Electrical Team</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Handover alert</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDeptAlert('electrical')}
                      disabled={togglingAlerts}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${alertsState.electrical ? '#86efac' : '#cbd5e1'}`,
                        background: alertsState.electrical ? '#f0fdf4' : '#f8fafc',
                        color: alertsState.electrical ? '#15803d' : '#64748b',
                      }}
                    >
                      {alertsState.electrical ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Housekeeping Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Housekeeping</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Cleaning handover</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDeptAlert('hk')}
                      disabled={togglingAlerts}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${alertsState.hk ? '#86efac' : '#cbd5e1'}`,
                        background: alertsState.hk ? '#f0fdf4' : '#f8fafc',
                        color: alertsState.hk ? '#15803d' : '#64748b',
                      }}
                    >
                      {alertsState.hk ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Estate Office Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Estate Office</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Final readiness</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDeptAlert('estate')}
                      disabled={togglingAlerts}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${alertsState.estate ? '#86efac' : '#cbd5e1'}`,
                        background: alertsState.estate ? '#f0fdf4' : '#f8fafc',
                        color: alertsState.estate ? '#15803d' : '#64748b',
                      }}
                    >
                      {alertsState.estate ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Global Master Switch */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>All Emails (Master)</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDeptAlert('all')}
                      disabled={togglingAlerts}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${alertsState.enabled ? '#86efac' : '#cbd5e1'}`,
                        background: alertsState.enabled ? '#f0fdf4' : '#f8fafc',
                        color: alertsState.enabled ? '#15803d' : '#64748b',
                      }}
                    >
                      {alertsState.enabled ? 'Master ON' : 'Master OFF'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isMaster && !isReadOnly && (
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--green-900)',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(26,60,52,0.2)',
              }}
            >
              + New Pipeline Entry
            </button>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          padding: '8px 14px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          width: '100%',
          boxSizing: 'border-box',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search Input */}
          <input
            type="search"
            placeholder="Search allottee, house no, remarks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: 260,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 12.5,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {/* House Types Dropdown */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 12.5,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              outline: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <option value="all">All house types</option>
            {['Type A', 'Type B', 'Type C', 'Type D', 'Type E', 'Type F'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {(query || selectedType !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSelectedType('all')
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-3)',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>
            Showing <strong>{filtered.length}</strong> {filtered.length === 1 ? 'record' : 'records'}
          </div>

          {/* History Controls: Clear History (UI Only) + Delete History (DB with 24hr Recovery) + Trash */}
          {Boolean(currentCompletedKey) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Button 1: Clear History (UI Only) */}
              {filtered.length > 0 && !isReadOnly && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="Hide completed history from this screen. All records remain safely stored in database."
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 11px',
                    borderRadius: 7,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface)'
                    e.currentTarget.style.borderColor = 'var(--text-3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface-2)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <EyeOff size={13} />
                  <span>Clear History</span>
                </button>
              )}

              {/* Restore Screen History (UI Only) */}
              {hiddenCountForCurrent > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreHistory}
                  title="Unhide previously cleared records back to this screen"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 11px',
                    borderRadius: 7,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Eye size={13} />
                  <span>Restore Screen ({hiddenCountForCurrent} hidden)</span>
                </button>
              )}

              {/* Button 2: Delete History (Database + 24hr Recovery) - Only for Master / Completed View */}
              {!isReadOnly && isMaster && (
                <button
                  type="button"
                  onClick={() => setIsDeleteHistoryOpen(true)}
                  title="Delete completed allotted history by date range, month, year, or all, with 24-hour recovery window."
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 12px',
                    borderRadius: 7,
                    border: '1.5px solid #fca5a5',
                    background: '#fef2f2',
                    color: '#991b1b',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fee2e2'
                    e.currentTarget.style.borderColor = '#f87171'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fef2f2'
                    e.currentTarget.style.borderColor = '#fca5a5'
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete History</span>
                </button>
              )}

              {/* Trash (24-Hour Recovery) Button */}
              {trashCount > 0 && isMaster && (
                <button
                  type="button"
                  onClick={() => setIsTrashOpen(true)}
                  title="View and restore records currently in 24-hour recovery trash"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: '1.5px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Clock size={12} />
                  <span>Trash ({trashCount})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Undo Toast Banner */}
      {deleteToast && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderRadius: 8,
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            color: '#15803d',
            fontSize: 12.5,
            fontWeight: 600,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>
              {deleteToast.count} {deleteToast.count === 1 ? 'record' : 'records'} moved to Trash. You have 24 hours to recover before permanent database deletion.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleUndoRecentDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 5,
                border: '1px solid #16a34a',
                background: '#ffffff',
                color: '#15803d',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={() => setDeleteToast(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#15803d',
                cursor: 'pointer',
                padding: 2,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {error && (
        <Card style={{ borderColor: '#fecaca', background: '#fff1f2', color: '#991b1b', fontSize: 13, padding: '10px 14px' }}>
          {error}
        </Card>
      )}

      {/* Main Table Container matching project theme */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%' }}>
          <table
            style={{
              width: '100%',
              minWidth: activeView === 'master' ? 2280 : '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            {/* Department Table Headers (10 Columns, 100% width) */}
            {activeView !== 'master' && (
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', color: 'var(--text)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 45 }}>#</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 95 }}>House Type</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: 130 }}>House No</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', width: 180 }}>Name of allottee</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 140 }}>
                    {activeView === 'civil' ? 'Estate Handover' : activeView === 'electrical' ? 'Civil Handover' : 'Electrical Handover'}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 130 }}>Key Received On</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 120 }}>
                    {activeView === 'hk' ? 'Cleaning Status' : `${activeView === 'civil' ? 'Civil' : 'Electrical'} Status`}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 150 }}>
                    {activeView === 'hk' ? 'Cleaning Completed On' : 'Completed & Handed Over'}
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: 180 }}>Remarks</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: 170 }}>Action</th>
                </tr>
              </thead>
            )}

            {/* Master View Headers (22 Columns, Full Master Sheet) */}
            {activeView === 'master' && (
              <thead>
                {/* Grouping header row */}
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontWeight: 800, fontSize: 11.5 }}>
                  <th colSpan={7} style={{ padding: '8px 10px', textAlign: 'center', borderRight: '1.5px solid var(--border)' }}>
                    ALLOTMENT DETAILS
                  </th>
                  <th colSpan={3} style={{ padding: '8px 10px', textAlign: 'center', borderRight: '1.5px solid var(--border)', background: '#eff6ff', color: '#1e40af' }}>
                    CIVIL TEAM
                  </th>
                  <th colSpan={3} style={{ padding: '8px 10px', textAlign: 'center', borderRight: '1.5px solid var(--border)', background: '#fefce8', color: '#854d0e' }}>
                    ELECTRICAL TEAM
                  </th>
                  <th colSpan={3} style={{ padding: '8px 10px', textAlign: 'center', borderRight: '1.5px solid var(--border)', background: '#f0fdf4', color: '#166534' }}>
                    HOUSEKEEPING TEAM
                  </th>
                  <th colSpan={4} style={{ padding: '8px 10px', textAlign: 'center', borderRight: '1.5px solid var(--border)', background: '#fdf4ff', color: '#86198f' }}>
                    ESTATE OFFICE
                  </th>
                  <th colSpan={2} style={{ padding: '8px 10px', textAlign: 'center' }}>
                    STATUS & ACTIONS
                  </th>
                </tr>

                {/* Sub-headers matching Google Sheet */}
                <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--border)', color: 'var(--text-2)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 45 }}>#</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 90 }}>House Type</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: 135 }}>House No to be allotted/ allotted</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', width: 160 }}>Name of allottee</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 100 }}>Time Stamp</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 140 }}>Key handed over to Civil team on date</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 85, borderRight: '1.5px solid var(--border)' }}>Priority</th>

                  {/* Civil team (3 columns) */}
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 110, background: '#fafbfc' }}>Key recieved on</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 110, background: '#fafbfc' }}>Status</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 120, borderRight: '1.5px solid var(--border)', background: '#fafbfc' }}>Key handed over on</th>

                  {/* Electrical team (3 columns) */}
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 110, background: '#fffef5' }}>Key recieved on</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 110, background: '#fffef5' }}>Status</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 120, borderRight: '1.5px solid var(--border)', background: '#fffef5' }}>Key handed over on</th>

                  {/* Housekeeping team (3 columns) */}
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 130, background: '#f6fdf8' }}>Key recieved on</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 110, background: '#f6fdf8' }}>Status</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 130, borderRight: '1.5px solid var(--border)', background: '#f6fdf8' }}>Key handed over on</th>

                  {/* Estate office (4 columns) */}
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 115, background: '#fdf8ff' }}>Allotment letter issued on</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 105, background: '#fdf4ff' }}>user accepted on</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', width: 120, background: '#fdf4ff' }}>Key handed over to allottee</th>
                  <th
                    style={{
                      padding: '8px 8px',
                      textAlign: 'center',
                      width: 140,
                      borderRight: '1.5px solid var(--border)',
                      background: '#fee2e2',
                      color: '#991b1b',
                      fontWeight: 700,
                    }}
                  >
                    Last date of taking possession
                  </th>

                  {/* Remarks & Action */}
                  <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 220 }}>Remarks</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: 130 }}>Action</th>
                </tr>
              </thead>
            )}

            <tbody>
              {loading && clearances.length === 0 ? (
                <tr>
                  <td colSpan={activeView === 'master' ? 22 : 10} style={{ padding: 40, textAlign: 'center' }}>
                    <Spinner />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={activeView === 'master' ? 22 : 10} style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
                    {hiddenCountForCurrent > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
                          Completed history has been cleared from your screen ({hiddenCountForCurrent} {hiddenCountForCurrent === 1 ? 'record' : 'records'} hidden).
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                          All records remain permanently safe in the database.
                        </div>
                        <button
                          type="button"
                          onClick={handleRestoreHistory}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '5px 14px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            color: 'var(--text)',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginTop: 4,
                          }}
                        >
                          Restore History
                        </button>
                      </div>
                    ) : (
                      'No housing status entries found matching filters.'
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const isCivilDone = checkCivilDone(r)
                  const isElecDone = checkElecDone(r)
                  const isHKDone = checkHKDone(r)

                  // Render isolated department table row (Civil, Electrical, HK)
                  if (activeView !== 'master') {
                    return renderDepartmentRow(r, idx)
                  }

                  // Render Master Row (22 Columns)
                  return (
                    <tr
                      key={r.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: r.isAllotted ? 'var(--green-100)' : idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                        color: 'var(--text)',
                        verticalAlign: 'middle',
                      }}
                    >
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            fontWeight: 700,
                            fontSize: 11,
                            color: 'var(--text)',
                            display: 'inline-block',
                          }}
                        >
                          {r.houseType}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: 'var(--green-900)', fontSize: 12.5 }}>
                          {r.houseNo}
                        </div>
                        {(() => {
                          const stage = getPipelineStage(r)
                          return (
                            <div style={{ marginTop: 2 }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 10,
                                  background: stage.bg,
                                  color: stage.color,
                                  border: `1px solid ${stage.border}`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {stage.label}
                              </span>
                            </div>
                          )
                        })()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: r.allotteeName ? 'var(--text)' : 'var(--text-3)' }}>
                        {r.allotteeName || '— (Pending)'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11.5 }}>
                        {formatDisplayDate(r.timeStamp)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 11.5 }}>
                        {!r.keyHandedOverDate ? (
                          (isMaster && !isReadOnly) ? (
                            <button
                              type="button"
                              onClick={() => handleEstateHandover(r)}
                              title="Hand over key to Civil team"
                              style={{
                                padding: '4px 10px',
                                borderRadius: 5,
                                border: 'none',
                                background: 'var(--pending)',
                                color: '#ffffff',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Handover Key
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11.5 }}>
                              Awaiting Handover
                            </span>
                          )
                        ) : (
                          formatDisplayDate(r.keyHandedOverDate)
                        )}
                      </td>
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          borderRight: '1.5px solid var(--border)',
                          cursor: (isMaster && !isReadOnly) ? 'pointer' : 'default',
                        }}
                        title={(isMaster && !isReadOnly) ? 'Click to manage clearance priority' : undefined}
                        onClick={(e) => {
                          if (!isMaster || isReadOnly) return
                          e.stopPropagation()
                          setPriorityModalRecord(r)
                        }}
                      >
                        {r.priority ? (
                          <span
                            style={{
                              background: r.priority === '1' ? '#fee2e2' : r.priority === '2' ? '#ffedd5' : '#fef9c3',
                              color: r.priority === '1' ? '#991b1b' : r.priority === '2' ? '#9a3412' : '#854d0e',
                              padding: '2.5px 8px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 800,
                              border: `1px solid ${r.priority === '1' ? '#fca5a5' : r.priority === '2' ? '#fdba74' : '#fde047'}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span>P{r.priority}</span>
                            <span style={{ fontSize: 9.5, opacity: 0.85 }}>
                              {r.priority === '1' ? 'Top' : r.priority === '2' ? 'High' : 'Normal'}
                            </span>
                          </span>
                        ) : (isMaster && !isReadOnly) ? (
                          <span
                            style={{
                              color: 'var(--text-3)',
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 4,
                              border: '1px dashed var(--border)',
                              display: 'inline-block',
                            }}
                          >
                            + Set
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>—</span>
                        )}
                      </td>

                      {/* Civil team (3 columns) */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#fafbfc' }}>
                        {formatDisplayDate(r.civilKeyReceivedDate)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', background: '#fafbfc' }}>
                        <StatusBadge status={r.civilStatus} />
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1.5px solid var(--border)', color: 'var(--text-3)', fontSize: 11, background: '#fafbfc' }}>
                        {formatDisplayDate(r.civilCompletedDate || r.civilKeyHandedOverDate)}
                      </td>

                      {/* Electrical team (3 columns) */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#fffef5' }}>
                        {formatDisplayDate(r.electricalKeyReceivedDate)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', background: '#fffef5' }}>
                        <StatusBadge status={r.electricalStatus} />
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1.5px solid var(--border)', color: 'var(--text-3)', fontSize: 11, background: '#fffef5' }}>
                        {formatDisplayDate(r.electricalCompletedDate || r.electricalKeyHandedOverDate)}
                      </td>

                      {/* Housekeeping team (3 columns) */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#f6fdf8' }}>
                        {formatDisplayDate(r.hkHandoverDate || r.hkKeyReceivedDate)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', background: '#f6fdf8' }}>
                        <StatusBadge status={r.hkStatus} />
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1.5px solid var(--border)', color: 'var(--text-3)', fontSize: 11, background: '#f6fdf8' }}>
                        {formatDisplayDate(r.hkCompletedDate || r.hkKeyHandedOverDate)}
                      </td>

                      {/* Estate Office (4 columns) */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#fdf8ff' }}>
                        {formatDisplayDate(r.estateDate1 || r.allotmentLetterIssuedDate)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#fdf8ff' }}>
                        {formatDisplayDate(r.estateDate2 || r.userAcceptedDate)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: 11, background: '#fdf8ff' }}>
                        {formatDisplayDate(r.estateDate3 || r.keyHandedOverToAllotteeDate)}
                      </td>
                      <td
                        style={{
                          padding: '8px 8px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          borderRight: '1.5px solid var(--border)',
                          color: '#991b1b',
                          fontSize: 11.5,
                          fontWeight: 700,
                          background: '#fee2e2',
                        }}
                      >
                        {formatDisplayDate(r.estateDate4 || r.possessionDeadlineDate)}
                      </td>

                      {/* Remarks */}
                      <td style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-2)', minWidth: 220 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {r.estateRemarks && (
                            <div><span style={{ fontWeight: 700, color: '#86198f' }}>Estate:</span> {r.estateRemarks}</div>
                          )}
                          {r.civilRemarks && (
                            <div><span style={{ fontWeight: 700, color: '#1e40af' }}>Civil:</span> {r.civilRemarks}</div>
                          )}
                          {r.electricalRemarks && (
                            <div><span style={{ fontWeight: 700, color: '#854d0e' }}>Elec:</span> {r.electricalRemarks}</div>
                          )}
                          {r.hkRemarks && (
                            <div><span style={{ fontWeight: 700, color: '#166534' }}>HK:</span> {r.hkRemarks}</div>
                          )}
                          {r.remarks && !r.estateRemarks && !r.civilRemarks && !r.electricalRemarks && !r.hkRemarks && (
                            <div>{r.remarks}</div>
                          )}
                          {!r.estateRemarks && !r.civilRemarks && !r.electricalRemarks && !r.hkRemarks && !r.remarks && (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          {r.isAllotted ? (
                            <span
                              title="Officially allotted in House Register"
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'var(--green-100)',
                                color: 'var(--green-900)',
                                fontSize: 11,
                                fontWeight: 700,
                                border: '1px solid var(--border)',
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Allotted
                            </span>
                          ) : isCivilDone && isElecDone && isHKDone ? (
                            (isMaster && !isReadOnly) ? (
                              <button
                                type="button"
                                onClick={() => handleFinalizeAllotment(r)}
                                title={r.allotteeName ? `Officially allot ${r.houseNo} to ${r.allotteeName}` : 'Click to enter allottee name and allot'}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'var(--green-900)',
                                  color: '#ffffff',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Allot House
                              </button>
                            ) : (
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  background: '#fdf4ff',
                                  color: '#86198f',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  border: '1px solid #f0abfc',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Ready for Allotment
                              </span>
                            )
                          ) : (
                            <span
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'var(--surface-2)',
                                color: 'var(--text-2)',
                                fontSize: 11,
                                fontWeight: 700,
                                border: '1px solid var(--border)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {!isCivilDone ? 'Civil Phase' : !isElecDone ? 'Elec Phase' : 'HK Phase'}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(r)}
                            title={isReadOnly ? 'View Allotment Pipeline Entry' : 'Edit Allotment Pipeline Entry'}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isReadOnly ? 'View' : 'Edit'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {(isAddOpen || isEditOpen) && (
        <Modal
          open={isAddOpen || isEditOpen}
          onClose={() => {
            setIsAddOpen(false)
            setIsEditOpen(false)
          }}
          title={
            isAddOpen
              ? 'Add Housing Allotment Pipeline Entry'
              : isReadOnly
                ? `Housing Pipeline Details (View Only) — ${form.houseType} ${form.houseNo}`
                : isCivil
                  ? `Civil Clearance ${isLockedForUser ? '(Locked / View Only)' : ''} — ${form.houseType} ${form.houseNo}`
                  : isElectrical
                    ? `Electrical Clearance ${isLockedForUser ? '(Locked / View Only)' : ''} — ${form.houseType} ${form.houseNo}`
                    : isHK
                      ? `Housekeeping Clearance ${isLockedForUser ? '(Locked / View Only)' : ''} — ${form.houseType} ${form.houseNo}`
                      : isAdmin
                        ? `Master Edit (All Departments Override) — ${form.houseType} ${form.houseNo}`
                        : `Estate Office Allotment — ${form.houseType} ${form.houseNo}`
          }
          width={isMaster ? 760 : 620}
        >
          <form onSubmit={isAddOpen ? handleAddSubmit : handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isLockedForUser && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>
                  {isReadOnly && isAdmin
                    ? 'View-Only Mode is active for Administrator. To modify pipeline records, click "Edit" in the top bar.'
                    : isReadOnly
                      ? 'You have view-only access to this housing clearance record.'
                      : 'Clearance for your department is completed and locked. Form fields are in view-only mode. Contact Admin if corrections are required.'}
                </span>
              </div>
            )}

            {/* Non-Master (Civil / Electrical / HK) Layout */}
            {!isMaster ? (
              <>
                {/* Unit & Allottee Summary Card */}
                <div
                  style={{
                    background: 'var(--surface)',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Quarter / House
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green-900)', marginTop: 2 }}>
                      {form.houseType} — {form.houseNo || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Allottee Name
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                      {form.allotteeName || '—'} {form.emplCode ? `(${form.emplCode})` : ''}
                    </div>
                    {form.designation && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>
                        {form.designation}
                      </div>
                    )}
                  </div>
                  {form.priority && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Priority
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 11.5,
                          fontWeight: 800,
                          padding: '2px 9px',
                          borderRadius: 8,
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fca5a5',
                          marginTop: 2,
                        }}
                      >
                        P{form.priority} Priority
                      </span>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Request Date
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                      {form.timeStamp || '—'}
                    </div>
                  </div>
                </div>

                {/* Unified Department Clearance Card */}
                {(() => {
                  const cfg = isCivil ? {
                    name: 'Civil Team Clearance',
                    color: '#1e40af',
                    bg: '#eff6ff',
                    border: '#bfdbfe',
                    keyReceived: form.civilKeyReceivedDate,
                    onKeyChange: (v) => setForm({ ...form, civilKeyReceivedDate: v }),
                    status: form.civilStatus,
                    onStatusChange: (v) => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        civilStatus: v,
                        civilCompletedDate: v === 'Completed' ? (prev.civilCompletedDate || today) : prev.civilCompletedDate,
                        civilKeyReceivedDate: v === 'Completed' ? (prev.civilKeyReceivedDate || today) : prev.civilKeyReceivedDate,
                      }))
                    },
                    completed: form.civilCompletedDate,
                    onCompletedChange: (v) => setForm({ ...form, civilCompletedDate: v }),
                    onMarkCompleted: () => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        civilStatus: 'Completed',
                        civilCompletedDate: today,
                        civilKeyReceivedDate: prev.civilKeyReceivedDate || today,
                      }))
                    },
                    remarks: form.civilRemarks,
                    onRemarksChange: (v) => setForm({ ...form, civilRemarks: v }),
                  } : isElectrical ? {
                    name: 'Electrical Team Clearance',
                    color: '#854d0e',
                    bg: '#fefce8',
                    border: '#fef08a',
                    keyReceived: form.electricalKeyReceivedDate,
                    onKeyChange: (v) => setForm({ ...form, electricalKeyReceivedDate: v }),
                    status: form.electricalStatus,
                    onStatusChange: (v) => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        electricalStatus: v,
                        electricalCompletedDate: v === 'Completed' ? (prev.electricalCompletedDate || today) : prev.electricalCompletedDate,
                        electricalKeyReceivedDate: v === 'Completed' ? (prev.electricalKeyReceivedDate || today) : prev.electricalKeyReceivedDate,
                      }))
                    },
                    completed: form.electricalCompletedDate,
                    onCompletedChange: (v) => setForm({ ...form, electricalCompletedDate: v }),
                    onMarkCompleted: () => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        electricalStatus: 'Completed',
                        electricalCompletedDate: today,
                        electricalKeyReceivedDate: prev.electricalKeyReceivedDate || today,
                      }))
                    },
                    remarks: form.electricalRemarks,
                    onRemarksChange: (v) => setForm({ ...form, electricalRemarks: v }),
                  } : {
                    name: 'Housekeeping Team Clearance',
                    color: '#166534',
                    bg: '#f0fdf4',
                    border: '#bbf7d0',
                    keyReceived: form.hkHandoverDate,
                    onKeyChange: (v) => setForm({ ...form, hkHandoverDate: v }),
                    status: form.hkStatus,
                    onStatusChange: (v) => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        hkStatus: v,
                        hkCompletedDate: v === 'Completed' ? (prev.hkCompletedDate || today) : prev.hkCompletedDate,
                        hkHandoverDate: v === 'Completed' ? (prev.hkHandoverDate || today) : prev.hkHandoverDate,
                      }))
                    },
                    completed: form.hkCompletedDate,
                    onCompletedChange: (v) => setForm({ ...form, hkCompletedDate: v }),
                    onMarkCompleted: () => {
                      const today = todayISO()
                      setForm((prev) => ({
                        ...prev,
                        hkStatus: 'Completed',
                        hkCompletedDate: today,
                        hkHandoverDate: prev.hkHandoverDate || today,
                      }))
                    },
                    remarks: form.hkRemarks,
                    onRemarksChange: (v) => setForm({ ...form, hkRemarks: v }),
                  }

                  return (
                    <div
                      style={{
                        background: 'var(--surface)',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: `1px solid ${cfg.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>
                          {cfg.name}
                        </span>
                        {!isFormDisabled && (
                          <button
                            type="button"
                            onClick={cfg.onMarkCompleted}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--green-900)',
                              color: '#ffffff',
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Mark Completed Today
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <CalendarDatePicker
                          label="Key Received On"
                          value={cfg.keyReceived}
                          onChange={cfg.onKeyChange}
                          disabled={isFormDisabled}
                        />

                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                            Status
                          </label>
                          <select
                            value={cfg.status}
                            onChange={(e) => cfg.onStatusChange(e.target.value)}
                            disabled={isFormDisabled}
                            style={{
                              width: '100%',
                              height: 38,
                              padding: '0 10px',
                              borderRadius: 8,
                              border: '1.5px solid var(--border)',
                              fontSize: 13,
                              background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                              color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                              cursor: isFormDisabled ? 'not-allowed' : 'default',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          >
                            <option value="">Select status...</option>
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </div>

                        <CalendarDatePicker
                          label="Key Handed Over On"
                          value={cfg.completed}
                          onChange={cfg.onCompletedChange}
                          disabled={isFormDisabled}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                          Clearance Remarks & Notes
                        </label>
                        <input
                          type="text"
                          value={cfg.remarks}
                          onChange={(e) => cfg.onRemarksChange(e.target.value)}
                          disabled={isFormDisabled}
                          placeholder="Enter clearance notes or observations..."
                          style={{
                            width: '100%',
                            height: 38,
                            padding: '0 11px',
                            borderRadius: 8,
                            border: '1.5px solid var(--border)',
                            fontSize: 13,
                            background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                            color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                            cursor: isFormDisabled ? 'not-allowed' : 'text',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  )
                })()}
              </>
            ) : (
              /* Master (Estate Office / Admin) Layout */
              <>
                {/* 1. Allotment Details (Estate Office Access) */}
                <div style={{ background: 'var(--surface)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Allotment Details</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-800)', background: 'var(--green-100)', padding: '2px 8px', borderRadius: 4 }}>
                      Estate Office Access
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        House Type *
                      </label>
                      <select
                        value={form.houseType}
                        onChange={(e) => {
                          const newType = e.target.value
                          setForm({
                            ...form,
                            houseType: newType,
                            houseNo: '',
                          })
                        }}
                        disabled={isFormDisabled}
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 10px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          boxSizing: 'border-box',
                          cursor: isFormDisabled ? 'not-allowed' : 'pointer',
                          outline: 'none',
                        }}
                        required
                      >
                        {['Type A', 'Type B', 'Type C', 'Type D', 'Type E', 'Type F'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        House No. *
                      </label>
                      <SearchableHouseSelect
                        houseType={form.houseType}
                        value={form.houseNo}
                        onChange={(val) => setForm({ ...form, houseNo: val })}
                        vacantUnits={vacantUnits}
                        placeholder="Search or select house..."
                        disabled={isFormDisabled}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        Allottee Name
                      </label>
                      <input
                        type="text"
                        value={form.allotteeName}
                        onChange={(e) => setForm({ ...form, allotteeName: e.target.value })}
                        disabled={isFormDisabled}
                        placeholder="e.g. Dr. Pratik"
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          cursor: isFormDisabled ? 'not-allowed' : 'inherit',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        Employee Code
                      </label>
                      <input
                        type="text"
                        value={form.emplCode}
                        onChange={(e) => setForm({ ...form, emplCode: e.target.value })}
                        disabled={isFormDisabled}
                        placeholder="e.g. 1042 / CPWD"
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          cursor: isFormDisabled ? 'not-allowed' : 'inherit',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        Designation
                      </label>
                      <input
                        type="text"
                        value={form.designation}
                        onChange={(e) => setForm({ ...form, designation: e.target.value })}
                        disabled={isFormDisabled}
                        placeholder="e.g. Assistant Professor"
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          cursor: isFormDisabled ? 'not-allowed' : 'inherit',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        disabled={isFormDisabled}
                        placeholder="e.g. name@iitgn.ac.in"
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          cursor: isFormDisabled ? 'not-allowed' : 'inherit',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* Date of Expiry / Tenure Picker */}
                  <ExpiryTenurePicker
                    value={form.dateOfExpiry}
                    onChange={(val) => setForm({ ...form, dateOfExpiry: val })}
                    disabled={isFormDisabled}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <CalendarDatePicker
                      label="Request Date"
                      value={form.timeStamp}
                      onChange={(val) => setForm({ ...form, timeStamp: val })}
                      disabled={isFormDisabled}
                    />

                    <CalendarDatePicker
                      label="Key Handed to Civil"
                      value={form.keyHandedOverDate}
                      onChange={(val) => setForm({ ...form, keyHandedOverDate: val })}
                      disabled={isFormDisabled}
                    />

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                        Clearance Priority (Queue Rank)
                      </label>
                      <select
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        disabled={isFormDisabled}
                        style={{
                          width: '100%',
                          height: 38,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1.5px solid var(--border)',
                          fontSize: 13,
                          fontWeight: 600,
                          background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                          color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                          boxSizing: 'border-box',
                          outline: 'none',
                          cursor: isFormDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="">Standard Queue (No Special Priority)</option>
                        <option value="1">Priority 1 (Urgent - Top of Queue)</option>
                        <option value="2">Priority 2 (High Priority)</option>
                        <option value="3">Priority 3 (Normal Priority)</option>
                        <option value="4">Priority 4</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Estate Office Milestones */}
                <div
                  style={{
                    background: 'var(--surface)',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    Estate Office Milestones
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <CalendarDatePicker
                      label="Allotment Letter Issued"
                      value={form.estateDate1}
                      onChange={(val) => setForm({ ...form, estateDate1: val })}
                      disabled={isFormDisabled}
                    />

                    <CalendarDatePicker
                      label="User Accepted"
                      value={form.estateDate2}
                      onChange={(val) => setForm({ ...form, estateDate2: val })}
                      disabled={isFormDisabled}
                    />

                    <CalendarDatePicker
                      label="Key Handed to Allottee"
                      value={form.estateDate3}
                      onChange={(val) => setForm({ ...form, estateDate3: val })}
                      disabled={isFormDisabled}
                    />

                    <CalendarDatePicker
                      label="Possession Deadline"
                      value={form.estateDate4}
                      onChange={(val) => setForm({ ...form, estateDate4: val })}
                      disabled={isFormDisabled}
                    />
                  </div>
                </div>

                {/* 3. Estate Remarks & Notes */}
                <div
                  style={{
                    background: 'var(--surface)',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                    Estate Remarks & Notes
                  </label>
                  <input
                    type="text"
                    value={form.estateRemarks}
                    onChange={(e) => setForm({ ...form, estateRemarks: e.target.value })}
                    disabled={isFormDisabled}
                    placeholder="e.g. Allotment approved with effect from date / Instructions for departments..."
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 11px',
                      borderRadius: 8,
                      border: '1.5px solid var(--border)',
                      fontSize: 13,
                      background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                      color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                      cursor: isFormDisabled ? 'not-allowed' : 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* 4. Department Clearances Status & Remarks for Estate Office and Admin */}
                {isMaster && (
                  <div
                    style={{
                      background: 'var(--surface-2)',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Department Clearances (Status & Remarks)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {/* Civil */}
                      <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>Civil Team</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <StatusBadge status={form.civilStatus} />
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDisplayDate(form.civilCompletedDate) || '—'}</span>
                        </div>
                        {form.civilRemarks ? (
                          <div style={{ fontSize: 11.5, color: '#1e40af', marginTop: 6, background: '#eff6ff', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-word' }}>
                            <span style={{ fontWeight: 700 }}>Note:</span> {form.civilRemarks}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 6 }}>
                            No remarks
                          </div>
                        )}
                      </div>

                      {/* Electrical */}
                      <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: 6, border: '1px solid #fef08a' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#854d0e' }}>Electrical Team</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <StatusBadge status={form.electricalStatus} />
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDisplayDate(form.electricalCompletedDate) || '—'}</span>
                        </div>
                        {form.electricalRemarks ? (
                          <div style={{ fontSize: 11.5, color: '#854d0e', marginTop: 6, background: '#fefce8', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-word' }}>
                            <span style={{ fontWeight: 700 }}>Note:</span> {form.electricalRemarks}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 6 }}>
                            No remarks
                          </div>
                        )}
                      </div>

                      {/* Housekeeping */}
                      <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>Housekeeping</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <StatusBadge status={form.hkStatus} />
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDisplayDate(form.hkCompletedDate) || '—'}</span>
                        </div>
                        {form.hkRemarks ? (
                          <div style={{ fontSize: 11.5, color: '#166534', marginTop: 6, background: '#f0fdf4', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-word' }}>
                            <span style={{ fontWeight: 700 }}>Note:</span> {form.hkRemarks}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 6 }}>
                            No remarks
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Department Clearances Admin Override (Admin Only) */}
                {isAdmin && (
                  <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setShowDeptClearances((prev) => !prev)}
                      style={{
                        width: '100%',
                        padding: '11px 16px',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Department Clearances (Civil, Electrical, Housekeeping)</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>— Admin Override</span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-900)' }}>
                        {showDeptClearances ? '▲ Hide' : '▼ Expand'}
                      </span>
                    </button>

                    {showDeptClearances && (
                      <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        {/* Civil Section */}
                        <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1e40af' }}>
                              Civil Team
                            </span>
                            {!isFormDisabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    civilStatus: 'Completed',
                                    civilCompletedDate: today,
                                    civilKeyReceivedDate: prev.civilKeyReceivedDate || today,
                                  }))
                                }}
                                style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Mark Completed Today
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            <CalendarDatePicker
                              label="Key Received On"
                              value={form.civilKeyReceivedDate}
                              onChange={(val) => setForm({ ...form, civilKeyReceivedDate: val })}
                              disabled={isFormDisabled}
                            />
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Status</label>
                              <select
                                value={form.civilStatus}
                                onChange={(e) => {
                                  const val = e.target.value
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    civilStatus: val,
                                    civilCompletedDate: val === 'Completed' ? (prev.civilCompletedDate || today) : (val === 'Pending' ? '' : prev.civilCompletedDate),
                                    civilKeyReceivedDate: val === 'Completed' ? (prev.civilKeyReceivedDate || today) : prev.civilKeyReceivedDate,
                                  }))
                                }}
                                disabled={isFormDisabled}
                                style={{
                                  width: '100%',
                                  height: 38,
                                  padding: '0 10px',
                                  borderRadius: 8,
                                  border: '1.5px solid var(--border)',
                                  fontSize: 13,
                                  background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                  color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                  cursor: isFormDisabled ? 'not-allowed' : 'default',
                                  boxSizing: 'border-box',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select status...</option>
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </div>
                            <CalendarDatePicker
                              label="Key Handed Over On"
                              value={form.civilCompletedDate}
                              onChange={(val) => setForm({ ...form, civilCompletedDate: val })}
                              disabled={isFormDisabled}
                            />
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <label style={{ fontSize: 11.5, fontWeight: 600, color: '#1e40af', display: 'block', marginBottom: 4 }}>
                              Civil Remarks (Admin View/Edit)
                            </label>
                            <input
                              type="text"
                              value={form.civilRemarks}
                              onChange={(e) => setForm({ ...form, civilRemarks: e.target.value })}
                              disabled={isFormDisabled}
                              placeholder="Civil team clearance notes..."
                              style={{
                                width: '100%',
                                height: 34,
                                padding: '0 10px',
                                borderRadius: 6,
                                border: '1px solid #bfdbfe',
                                fontSize: 12,
                                background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                cursor: isFormDisabled ? 'not-allowed' : 'text',
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>

                        {/* Electrical Section */}
                        <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid #fef08a', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#854d0e' }}>
                              Electrical Team
                            </span>
                            {!isFormDisabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    electricalStatus: 'Completed',
                                    electricalCompletedDate: today,
                                    electricalKeyReceivedDate: prev.electricalKeyReceivedDate || today,
                                  }))
                                }}
                                style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#d97706', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Mark Completed Today
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            <CalendarDatePicker
                              label="Key Received On"
                              value={form.electricalKeyReceivedDate}
                              onChange={(val) => setForm({ ...form, electricalKeyReceivedDate: val })}
                              disabled={isFormDisabled}
                            />
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Status</label>
                              <select
                                value={form.electricalStatus}
                                onChange={(e) => {
                                  const val = e.target.value
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    electricalStatus: val,
                                    electricalCompletedDate: val === 'Completed' ? (prev.electricalCompletedDate || today) : (val === 'Pending' ? '' : prev.electricalCompletedDate),
                                    electricalKeyReceivedDate: val === 'Completed' ? (prev.electricalKeyReceivedDate || today) : prev.electricalKeyReceivedDate,
                                  }))
                                }}
                                disabled={isFormDisabled}
                                style={{
                                  width: '100%',
                                  height: 38,
                                  padding: '0 10px',
                                  borderRadius: 8,
                                  border: '1.5px solid var(--border)',
                                  fontSize: 13,
                                  background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                  color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                  cursor: isFormDisabled ? 'not-allowed' : 'default',
                                  boxSizing: 'border-box',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select status...</option>
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </div>
                            <CalendarDatePicker
                              label="Key Handed Over On"
                              value={form.electricalCompletedDate}
                              onChange={(val) => setForm({ ...form, electricalCompletedDate: val })}
                              disabled={isFormDisabled}
                            />
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <label style={{ fontSize: 11.5, fontWeight: 600, color: '#854d0e', display: 'block', marginBottom: 4 }}>
                              Electrical Remarks (Admin View/Edit)
                            </label>
                            <input
                              type="text"
                              value={form.electricalRemarks}
                              onChange={(e) => setForm({ ...form, electricalRemarks: e.target.value })}
                              disabled={isFormDisabled}
                              placeholder="Electrical team clearance notes..."
                              style={{
                                width: '100%',
                                height: 34,
                                padding: '0 10px',
                                borderRadius: 6,
                                border: '1px solid #fef08a',
                                fontSize: 12,
                                background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                cursor: isFormDisabled ? 'not-allowed' : 'text',
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>

                        {/* Housekeeping Section */}
                        <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
                              Housekeeping Team
                            </span>
                            {!isFormDisabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    hkStatus: 'Completed',
                                    hkCompletedDate: today,
                                    hkHandoverDate: prev.hkHandoverDate || today,
                                  }))
                                }}
                                style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Mark Completed Today
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            <CalendarDatePicker
                              label="Key Received On"
                              value={form.hkHandoverDate}
                              onChange={(val) => setForm({ ...form, hkHandoverDate: val })}
                              disabled={isFormDisabled}
                            />
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Status</label>
                              <select
                                value={form.hkStatus}
                                onChange={(e) => {
                                  const val = e.target.value
                                  const today = todayISO()
                                  setForm((prev) => ({
                                    ...prev,
                                    hkStatus: val,
                                    hkCompletedDate: val === 'Completed' ? (prev.hkCompletedDate || today) : (val === 'Pending' ? '' : prev.hkCompletedDate),
                                    hkHandoverDate: val === 'Completed' ? (prev.hkHandoverDate || today) : prev.hkHandoverDate,
                                  }))
                                }}
                                disabled={isFormDisabled}
                                style={{
                                  width: '100%',
                                  height: 38,
                                  padding: '0 10px',
                                  borderRadius: 8,
                                  border: '1.5px solid var(--border)',
                                  fontSize: 13,
                                  background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                  color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                  cursor: isFormDisabled ? 'not-allowed' : 'default',
                                  boxSizing: 'border-box',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select status...</option>
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </div>
                            <CalendarDatePicker
                              label="Key Handed Over On"
                              value={form.hkCompletedDate}
                              onChange={(val) => setForm({ ...form, hkCompletedDate: val })}
                              disabled={isFormDisabled}
                            />
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <label style={{ fontSize: 11.5, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>
                              Housekeeping Remarks (Admin View/Edit)
                            </label>
                            <input
                              type="text"
                              value={form.hkRemarks}
                              onChange={(e) => setForm({ ...form, hkRemarks: e.target.value })}
                              disabled={isFormDisabled}
                              placeholder="Housekeeping team clearance notes..."
                              style={{
                                width: '100%',
                                height: 34,
                                padding: '0 10px',
                                borderRadius: 6,
                                border: '1px solid #bbf7d0',
                                fontSize: 12,
                                background: isFormDisabled ? 'var(--surface-2)' : 'var(--surface)',
                                color: isFormDisabled ? 'var(--text-3)' : 'var(--text)',
                                cursor: isFormDisabled ? 'not-allowed' : 'text',
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              {isEditOpen && isMaster && !isFormDisabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(activeRecord.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #fecaca',
                    background: '#fff1f2',
                    color: '#b91c1c',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Delete Entry
                </button>
              )}

              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <Btn
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setIsAddOpen(false)
                    setIsEditOpen(false)
                  }}
                >
                  {isFormDisabled ? 'Close' : 'Cancel'}
                </Btn>

                {isEditOpen && isMaster && !activeRecord?.isAllotted && !isFormDisabled && (
                  <button
                    type="button"
                    disabled={saving || !form.allotteeName}
                    onClick={async (e) => {
                      e.preventDefault()
                      if (!form.allotteeName) {
                        alert('Please enter Allottee Name before allotting.')
                        return
                      }
                      const confirmMsg = `Finalize and allot ${form.houseType} ${form.houseNo} to ${form.allotteeName} in official House Register?`
                      if (!window.confirm(confirmMsg)) return

                      setSaving(true)
                      try {
                        await estateApi.patchClearance(activeRecord.id, {
                          ...form,
                          action: 'finalize_allotment',
                          isAllotted: true,
                          status: 'completed',
                        })
                        alert(`Success! ${form.houseNo} is now officially OCCUPIED by ${form.allotteeName}.`)
                        setIsEditOpen(false)
                        loadData()
                        if (onReloadHousing) onReloadHousing()
                      } catch (err) {
                        console.error('Failed to finalize allotment:', err)
                        alert(err.response?.data?.error || 'Failed to finalize allotment.')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: form.allotteeName ? 'var(--green-900)' : 'var(--text-3)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: form.allotteeName ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Save & Allot House
                  </button>
                )}

                {!isFormDisabled && (
                  <Btn variant="primary" size="sm" type="submit" disabled={saving}>
                    {saving
                      ? 'Saving...'
                      : isAddOpen
                        ? 'Add Entry'
                        : isCivil
                          ? 'Save Civil Work'
                          : isElectrical
                            ? 'Save Electrical Work'
                            : isHK
                              ? 'Save HK Work'
                              : 'Save Changes'}
                  </Btn>
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Priority Management Modal */}
      {priorityModalRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setPriorityModalRecord(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: 490,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  Clearance Priority Queue
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  House: <strong>{priorityModalRecord.houseType} {priorityModalRecord.houseNo}</strong>
                  {priorityModalRecord.allotteeName ? ` · ${priorityModalRecord.allotteeName}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriorityModalRecord(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: 'var(--text-3)',
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {/* Current Active Priority Queue List */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Active Priority Queue
                </div>
                {(() => {
                  const activePrioritized = clearances
                    .filter((c) => !c.isAllotted && c.priority && String(c.priority).trim() !== '')
                    .sort((a, b) => Number(a.priority) - Number(b.priority))

                  if (activePrioritized.length === 0) {
                    return (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                        No houses currently have special priority in the active pipeline.
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {activePrioritized.map((item) => {
                        const isCurrent = item.id === priorityModalRecord.id
                        return (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: isCurrent ? 'var(--green-100)' : 'var(--surface-2)',
                              border: `1.5px solid ${isCurrent ? 'var(--green-900)' : 'var(--border)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  background: item.priority === '1' ? '#fee2e2' : item.priority === '2' ? '#ffedd5' : '#fef9c3',
                                  color: item.priority === '1' ? '#991b1b' : item.priority === '2' ? '#9a3412' : '#854d0e',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '1.5px 7px',
                                  borderRadius: 6,
                                  border: `1px solid ${item.priority === '1' ? '#fca5a5' : item.priority === '2' ? '#fdba74' : '#fde047'}`,
                                }}
                              >
                                P{item.priority}
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: isCurrent ? 800 : 600, color: 'var(--text)' }}>
                                {item.houseType} {item.houseNo}
                              </span>
                              {item.allotteeName && (
                                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                                  ({item.allotteeName})
                                </span>
                              )}
                              {isCurrent && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-900)', background: '#fff', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                  Selected
                                </span>
                              )}
                            </div>
                            {isCurrent && !isReadOnly && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => handlePriorityShift(item, 'up')}
                                  title="Move Up in Queue"
                                  disabled={item.priority === '1'}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    cursor: item.priority === '1' ? 'not-allowed' : 'pointer',
                                    opacity: item.priority === '1' ? 0.4 : 1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  ▲ Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePriorityShift(item, 'down')}
                                  title="Move Down in Queue"
                                  disabled={Number(item.priority) >= activePrioritized.length}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    cursor: Number(item.priority) >= activePrioritized.length ? 'not-allowed' : 'pointer',
                                    opacity: Number(item.priority) >= activePrioritized.length ? 0.4 : 1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  ▼ Down
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Priority Selection Buttons */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Assign Priority Level
              </div>
              {isReadOnly ? (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    marginBottom: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Priority modification is disabled in View-Only mode.</span>
                  {isAdmin && (
                    <span style={{ fontSize: 11, color: 'var(--green-900)', fontWeight: 600 }}>
                      Click the Edit pencil icon in top bar to modify
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => handleUpdatePriority(priorityModalRecord, '1')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #fca5a5',
                      background: priorityModalRecord.priority === '1' ? '#fee2e2' : 'var(--surface)',
                      color: '#991b1b',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>P1 · Urgent / Top</div>
                    <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>Moves to #1, shifts others down</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdatePriority(priorityModalRecord, '2')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #fdba74',
                      background: priorityModalRecord.priority === '2' ? '#ffedd5' : 'var(--surface)',
                      color: '#9a3412',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>P2 · High Priority</div>
                    <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>Moves to #2 in queue</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdatePriority(priorityModalRecord, '3')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #fde047',
                      background: priorityModalRecord.priority === '3' ? '#fef9c3' : 'var(--surface)',
                      color: '#854d0e',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>P3 · Normal Priority</div>
                    <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>Moves to #3 in queue</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdatePriority(priorityModalRecord, '')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid var(--border)',
                      background: !priorityModalRecord.priority ? 'var(--surface-2)' : 'var(--surface)',
                      color: 'var(--text-2)',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>Standard FIFO</div>
                    <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>Remove from priority queue</div>
                  </button>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6 }}>
                Active priority queue is processed sequentially by Civil, Electrical, and Housekeeping teams. When you assign or change priority, the sequence automatically re-orders (1, 2, 3...) with zero gaps or duplicate numbers.
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setPriorityModalRecord(null)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Allotted History Modal (Date / Month / Year / All) */}
      {isDeleteHistoryOpen && (
        <HousingDeleteHistoryModal
          isOpen={isDeleteHistoryOpen}
          onClose={() => setIsDeleteHistoryOpen(false)}
          records={clearances.filter((c) => Boolean(c.isAllotted || c.status === 'completed'))}
          onConfirmDelete={handleConfirmDeleteHistory}
        />
      )}

      {/* 24-Hour Recovery Trash Modal */}
      {isTrashOpen && (
        <HousingTrashModal
          isOpen={isTrashOpen}
          onClose={() => setIsTrashOpen(false)}
          onRecordsRestored={() => {
            loadData()
            refreshTrashCount()
          }}
        />
      )}
    </div>
  )
}
