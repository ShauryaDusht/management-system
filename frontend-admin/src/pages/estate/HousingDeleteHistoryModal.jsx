import React, { useState, useMemo } from 'react'
import { Trash2, Calendar, Filter, Clock, AlertTriangle, X, CheckCircle2, Info } from 'lucide-react'
import { Modal, Btn } from '../../components/ui'
import { toDateInputValue, formatDisplayDate } from './HousingStatusTab'

export default function HousingDeleteHistoryModal({
  isOpen,
  onClose,
  records = [],
  onConfirmDelete,
}) {
  const [deleteMode, setDeleteMode] = useState('all') // 'all', 'date_range', 'month_range', 'year_range'
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth, setToMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [yearsBack, setYearsBack] = useState('1')
  const [yearOption, setYearOption] = useState('specific') // 'specific' | 'older_than'
  const [submitting, setSubmitting] = useState(false)

  // Compute available years from records
  const availableYears = useMemo(() => {
    const yearsSet = new Set()
    const currentYear = new Date().getFullYear()
    yearsSet.add(currentYear.toString())
    yearsSet.add((currentYear - 1).toString())
    yearsSet.add((currentYear - 2).toString())

    records.forEach((r) => {
      const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
      const iso = toDateInputValue(rawDate)
      if (iso && iso.length >= 4) {
        yearsSet.add(iso.slice(0, 4))
      }
    })

    return Array.from(yearsSet).sort().reverse()
  }, [records])

  // Filter matching records live
  const matchingRecords = useMemo(() => {
    if (!records || records.length === 0) return []

    if (deleteMode === 'all') {
      return records
    }

    if (deleteMode === 'date_range') {
      if (!fromDate && !toDate) return records
      return records.filter((r) => {
        const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
        const iso = toDateInputValue(rawDate)
        if (!iso) return false
        if (fromDate && iso < fromDate) return false
        if (toDate && iso > toDate) return false
        return true
      })
    }

    if (deleteMode === 'month_range') {
      if (!fromMonth && !toMonth) return records
      return records.filter((r) => {
        const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
        const iso = toDateInputValue(rawDate)
        if (!iso) return false
        const recMonth = iso.slice(0, 7)
        if (fromMonth && recMonth < fromMonth) return false
        if (toMonth && recMonth > toMonth) return false
        return true
      })
    }

    if (deleteMode === 'year_range') {
      if (yearOption === 'specific') {
        if (!selectedYear) return records
        return records.filter((r) => {
          const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
          const iso = toDateInputValue(rawDate)
          if (!iso) return false
          return iso.startsWith(selectedYear)
        })
      } else {
        // Older than N years
        const yb = parseInt(yearsBack, 10) || 1
        const now = new Date()
        const cutoff = new Date(now.getFullYear() - yb, now.getMonth(), now.getDate())
        const cutoffIso = cutoff.toISOString().slice(0, 10)
        return records.filter((r) => {
          const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
          const iso = toDateInputValue(rawDate)
          if (!iso) return false
          return iso <= cutoffIso
        })
      }
    }

    return records
  }, [records, deleteMode, fromDate, toDate, fromMonth, toMonth, selectedYear, yearOption, yearsBack])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (matchingRecords.length === 0) {
      alert('No records match your selected criteria.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        delete_type: deleteMode,
        ids: matchingRecords.map((r) => r.id),
        from_date: deleteMode === 'date_range' ? fromDate : deleteMode === 'month_range' ? fromMonth : null,
        to_date: deleteMode === 'date_range' ? toDate : deleteMode === 'month_range' ? toMonth : null,
        year: deleteMode === 'year_range' && yearOption === 'specific' ? selectedYear : null,
        years_back: deleteMode === 'year_range' && yearOption === 'older_than' ? yearsBack : null,
      }
      await onConfirmDelete(payload)
      onClose()
    } catch (err) {
      console.error('Failed to delete history:', err)
      alert(err?.response?.data?.error || 'Failed to delete history records. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Delete Allotted History" width={720}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Info Banner with 24h recovery */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1.5px solid var(--border)',
            fontSize: 12.5,
            color: 'var(--text)',
            lineHeight: 1.5,
          }}
        >
          <Clock size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>
              24-Hour Recovery Window Protection
            </div>
            <div style={{ color: 'var(--text-2)', marginTop: 2, fontSize: 12 }}>
              Deleted records are immediately removed from your active screen. They remain safely in Trash for 24 hours, during which they can be restored with a single click. After 24 hours, they are permanently purged from the database.
            </div>
          </div>
        </div>

        {/* Filter Mode Selector */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            Select Deletion Scope
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { id: 'all', label: 'All History', icon: Trash2 },
              { id: 'date_range', label: 'Date Range', icon: Calendar },
              { id: 'month_range', label: 'By Month', icon: Calendar },
              { id: 'year_range', label: 'By Year', icon: Filter },
            ].map((tab) => {
              const Icon = tab.icon
              const isSelected = deleteMode === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDeleteMode(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 7,
                    border: isSelected ? '1.5px solid #ef4444' : '1px solid var(--border)',
                    background: isSelected ? '#fef2f2' : 'var(--surface)',
                    color: isSelected ? '#b91c1c' : 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Mode-specific Controls */}
        <div
          style={{
            padding: 14,
            borderRadius: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {deleteMode === 'all' && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              All <strong>{records.length}</strong> completed allotted history records in the current view will be deleted and moved to the 24-hour recovery trash.
            </div>
          )}

          {deleteMode === 'date_range' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                Delete records between specific dates:
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>From Date</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>To Date</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {deleteMode === 'month_range' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                Delete records for a specific month or month range:
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>From Month</span>
                  <input
                    type="month"
                    value={fromMonth}
                    onChange={(e) => setFromMonth(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>To Month</span>
                  <input
                    type="month"
                    value={toMonth}
                    onChange={(e) => setToMonth(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {deleteMode === 'year_range' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="yearOpt"
                    checked={yearOption === 'specific'}
                    onChange={() => setYearOption('specific')}
                  />
                  <span>Specific Year</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="yearOpt"
                    checked={yearOption === 'older_than'}
                    onChange={() => setYearOption('older_than')}
                  />
                  <span>Older Than (Multi-Year)</span>
                </label>
              </div>

              {yearOption === 'specific' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Select Year:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Delete records older than:</span>
                  <select
                    value={yearsBack}
                    onChange={(e) => setYearsBack(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="1">1 Year</option>
                    <option value="2">2 Years</option>
                    <option value="3">3 Years</option>
                    <option value="5">5 Years</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Matching Records Counter & Preview */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              Matching Records for Deletion
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: matchingRecords.length > 0 ? '#fee2e2' : 'var(--surface-2)',
                color: matchingRecords.length > 0 ? '#b91c1c' : 'var(--text-3)',
                border: `1px solid ${matchingRecords.length > 0 ? '#fca5a5' : 'var(--border)'}`,
              }}
            >
              {matchingRecords.length} {matchingRecords.length === 1 ? 'record' : 'records'} match
            </span>
          </div>

          <div
            style={{
              maxHeight: 160,
              overflowY: 'auto',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            {matchingRecords.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                No completed records match the selected filter.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-3)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 10px', width: 35 }}>#</th>
                    <th style={{ padding: '6px 10px', width: 140 }}>House</th>
                    <th style={{ padding: '6px 10px' }}>Allottee Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', width: 110 }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingRecords.map((r, i) => {
                    const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
                    const dStr = formatDisplayDate(rawDate)
                    return (
                      <tr key={r.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text-3)' }}>{i + 1}</td>
                        <td style={{ padding: '5px 10px', fontWeight: 600 }}>
                          {r.houseType} {r.houseNo}
                        </td>
                        <td style={{ padding: '5px 10px', color: 'var(--text)' }}>
                          {r.allotteeName || '—'}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-2)' }}>
                          {dStr}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <Btn variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Btn>
          <button
            type="submit"
            disabled={submitting || matchingRecords.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 6,
              background: matchingRecords.length > 0 ? '#dc2626' : '#94a3b8',
              border: 'none',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: matchingRecords.length > 0 ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <Trash2 size={15} />
            <span>
              {submitting ? 'Moving to Trash...' : `Move ${matchingRecords.length} Records to Trash`}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
