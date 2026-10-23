import React, { useState, useEffect } from 'react'
import { Btn, Card, Modal, Spinner } from '../../components/ui'
import { inr, calcNote, formatDMY, monthLabel, monthRange, todayISO, prevMonthOf, getExpiryStatus } from './utils'
import { exportExcel } from '../../shared/utils'

export default function ShopsTab({
  records = [],
  onPatch,
  onPatchAll,
  onCreate,
  onOpenEditor,
  cycleMonth,
  settings = {},
  onUpdateSettings,
  isReadOnly = false,
}) {
  const [query, setQuery] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [bulkMonth, setBulkMonth] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newShop, setNewShop] = useState({ name: '', address: '', fixed: false, rate: '9.55', water: '320', expiryDate: '' })
  const [adding, setAdding] = useState(false)

  const alertDays = Number(settings?.expiryAlertDays) || 30

  // Calculate shops with expired or nearing expiry status
  const expiryAlerts = records.reduce(
    (acc, r) => {
      const st = getExpiryStatus(r.expiryDate || r.expiry_date, alertDays)
      if (st.status === 'expired') acc.expired.push({ ...r, _status: st })
      else if (st.status === 'expiring') acc.expiring.push({ ...r, _status: st })
      return acc
    },
    { expired: [], expiring: [] }
  )

  // Keep bulk controls populated with current values from the records so they are not blank
  useEffect(() => {
    if (records && records.length > 0) {
      const firstDate = records.find((r) => r.date)?.date || ''
      const firstMonth = records.find((r) => r.month)?.month || ''
      if (firstDate) setBulkDate(firstDate)
      if (firstMonth) setBulkMonth(firstMonth)
    } else if (cycleMonth) {
      setBulkDate(todayISO())
      setBulkMonth(prevMonthOf(cycleMonth))
    }
  }, [cycleMonth, records])

  const q = query.trim().toLowerCase()
  const filtered = records.filter((r) => !q || r.name.toLowerCase().includes(q))
  const filledCount = records.filter((r) => !r.isCancelled && !r.is_cancelled && (r.fixed || String(r.units || '').trim() !== '')).length

  const handleApplyDate = (d) => {
    setBulkDate(d)
    if (d) onPatchAll({ date: d })
  }

  const handleApplyMonth = (m) => {
    setBulkMonth(m)
    if (m) onPatchAll({ month: m })
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!newShop.name.trim()) return
    setAdding(true)
    try {
      await onCreate(newShop)
      setIsAddOpen(false)
      setNewShop({ name: '', address: '', fixed: false, rate: '9.55', water: '320', expiryDate: '' })
    } catch (err) {
      alert('Could not add shop.')
    } finally {
      setAdding(false)
    }
  }

  const handleExportExcel = async () => {
    if (!records || records.length === 0) {
      alert('No shop records available to export.')
      return
    }

    const filename = `shops_billing_${cycleMonth || todayISO()}.xlsx`
    const headers = [
      'Shop Name',
      'Note No.',
      'Date',
      'Billing Month',
      'Unit Consumed',
      'Recovery Amount (INR)',
      'Signature',
    ]

    const rows = records.map((r) => {
      const calc = calcNote(r)
      const bMonth = (r.monthTo || r.month_to)
        ? monthRange(r.month, r.monthTo || r.month_to)
        : (monthLabel(r.month) || r.month || '')
      const unitsVal = (r.isCancelled || r.is_cancelled) ? 'Cancelled' : r.fixed ? 'Fixed' : (r.units !== undefined && r.units !== null && r.units !== '' ? r.units : '0')
      const recAmt = calc.total

      return [
        r.name || '',
        r.noteNo || r.note_no || '',
        formatDMY(r.date) || r.date || '',
        bMonth,
        unitsVal,
        recAmt,
        '', // Blank column for Signature
      ]
    })

    // Calculate totals
    const totalUnits = records.reduce((sum, r) => sum + (r.fixed ? 0 : Number(r.units || 0)), 0)
    const totalAmount = records.reduce((sum, r) => sum + calcNote(r).total, 0)

    rows.push([
      'TOTAL',
      '',
      '',
      '',
      totalUnits,
      totalAmount,
      '',
    ])

    await exportExcel(filename, headers, rows, 'Shops Billing')
  }

  return (
    <div>
      {/* Shops Unified Card (Toolbar + Expiry Alerts + Table) */}
      <Card noPad style={{ overflowX: 'auto' }}>
        {/* Top Controls Toolbar */}
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {/* Left: Search & Universal Bulk Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
            <input
              type="search"
              placeholder="Search shops..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: 140,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 12.5,
                background: 'var(--surface)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Date:</span>
              <input
                type="date"
                disabled={isReadOnly}
                value={bulkDate}
                onChange={(e) => handleApplyDate(e.target.value)}
                title="Date applied to all demand notes"
                style={{
                  padding: '5px 7px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  fontSize: 12,
                  background: 'var(--surface)',
                  fontFamily: 'inherit',
                  opacity: isReadOnly ? 0.75 : 1,
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Month:</span>
              <input
                type="month"
                disabled={isReadOnly}
                value={bulkMonth}
                onChange={(e) => handleApplyMonth(e.target.value)}
                title="Billing Month"
                style={{
                  padding: '5px 7px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  fontSize: 12,
                  background: 'var(--surface)',
                  fontFamily: 'inherit',
                  opacity: isReadOnly ? 0.75 : 1,
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title="Universal alert threshold (days before bill payment due date)">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Alert:</span>
              <input
                type="number"
                min="1"
                max="365"
                disabled={isReadOnly}
                value={alertDays}
                onChange={(e) => {
                  const val = Number(e.target.value) || 30
                  if (onUpdateSettings) onUpdateSettings({ ...settings, expiryAlertDays: val })
                }}
                style={{
                  width: 50,
                  padding: '5px 5px',
                  textAlign: 'center',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--surface)',
                  fontFamily: 'inherit',
                  opacity: isReadOnly ? 0.75 : 1,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>days</span>
            </div>
          </div>

          {/* Right: Progress & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', marginRight: 2 }}>
              <div style={{ width: 70, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--green-700)',
                    width: `${records.length ? (filledCount / records.length) * 100 : 0}%`,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <span><strong>{filledCount}</strong>/{records.length} billed</span>
            </div>

            <Btn
              size="sm"
              variant="secondary"
              onClick={handleExportExcel}
              title="Export all shops billing data to Excel (.xlsx) with Signature column"
              style={{ whiteSpace: 'nowrap', padding: '5px 10px', fontSize: 12 }}
            >
              Export Excel
            </Btn>

            {!isReadOnly && (
              <Btn size="sm" variant="primary" onClick={() => setIsAddOpen(true)} style={{ whiteSpace: 'nowrap', padding: '5px 12px', fontSize: 12 }}>
                + Add Shop
              </Btn>
            )}
          </div>
        </div>

        {/* Expiry Alert Summary Banner if any shops are expired or expiring soon */}
        {(expiryAlerts.expired.length > 0 || expiryAlerts.expiring.length > 0) && (
          <div
            style={{
              padding: '10px 18px',
              background: expiryAlerts.expired.length > 0 ? '#fef2f2' : '#fffbeb',
              borderBottom: `1px solid ${expiryAlerts.expired.length > 0 ? '#fca5a5' : '#fde68a'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              fontSize: 12.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: expiryAlerts.expired.length > 0 ? '#b91c1c' : '#92400e' }}>
                Bill Expiry / Payment Due Alerts ({alertDays}d window):
              </span>
              {expiryAlerts.expired.length > 0 && (
                <span style={{ color: '#dc2626', fontWeight: 600 }}>
                  {expiryAlerts.expired.length} expired ({expiryAlerts.expired.map((s) => s.name).join(', ')})
                </span>
              )}
              {expiryAlerts.expiring.length > 0 && (
                <span style={{ color: '#b45309', fontWeight: 600 }}>
                  {expiryAlerts.expired.length > 0 ? '• ' : ''}
                  {expiryAlerts.expiring.length} expiring soon ({expiryAlerts.expiring.map((s) => `${s.name} (${s._status.label})`).join(', ')})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Shops Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '10px 14px', width: 65, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Sl No.</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', minWidth: 200 }}>Name of Shop</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 160 }}>Note No.</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 100 }}>Date</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 200 }}>Billing Month</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'center', width: 130 }}>Unit Consumed</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'right', width: 130 }}>Recovery Amt</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'center', width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const isCancelled = Boolean(r.isCancelled || r.is_cancelled)
              const c = calcNote(r)
              const empty = !isCancelled && !r.fixed && (!r.units || r.units.trim() === '')
              return (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: isCancelled ? '#fee2e225' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    opacity: isCancelled ? 0.8 : 1,
                  }}
                  className="ui-data-row"
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div
                      onClick={() => onOpenEditor(r.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: isCancelled ? 'var(--text-2)' : 'var(--green-900)' }}>
                        <span>{r.name}</span>
                        {isCancelled && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fca5a5',
                            }}
                          >
                            CANCELLED
                          </span>
                        )}
                      </div>

                      {/* Expiry alert badge */}
                      {(() => {
                        const exp = getExpiryStatus(r.expiryDate || r.expiry_date, alertDays)
                        if (exp.status === 'expired') {
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '1.5px 7px',
                                borderRadius: 5,
                                color: exp.color,
                                background: exp.bg,
                                border: `1px solid ${exp.border}`,
                                marginLeft: 16,
                              }}
                              title={exp.fullText}
                            >
                              {exp.badgeText}
                            </span>
                          )
                        }
                        if (exp.status === 'expiring') {
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '1.5px 7px',
                                borderRadius: 5,
                                color: exp.color,
                                background: exp.bg,
                                border: `1px solid ${exp.border}`,
                                marginLeft: 16,
                              }}
                              title={exp.fullText}
                            >
                              {exp.badgeText} ({exp.formattedDate})
                            </span>
                          )
                        }
                        if (exp.status === 'active') {
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                                fontSize: 10,
                                fontWeight: 500,
                                padding: '1px 6px',
                                borderRadius: 4,
                                color: '#15803d',
                                background: '#dcfce7',
                                marginLeft: 16,
                              }}
                              title={exp.fullText}
                            >
                              {exp.badgeText}
                            </span>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {isCancelled ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 4, border: '1px solid #fca5a5' }}>
                        CANCELLED
                      </span>
                    ) : (
                      r.noteNo
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {formatDMY(r.date)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {monthRange(r.month, r.monthTo, ' ', ' to ')}
                  </td>
                  <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                    {isCancelled ? (
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        — (Closed)
                      </span>
                    ) : r.fixed ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: '#b45309',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          letterSpacing: '0.02em',
                        }}
                        title="Fixed charge (no unit consumption)"
                      >
                        Fixed Charge
                      </span>
                    ) : isReadOnly ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.units ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {r.units ? `${r.units} units` : '—'}
                      </span>
                    ) : (
                      <input
                        type="number"
                        placeholder="Units"
                        value={r.units || ''}
                        onChange={(e) => onPatch(r.id, { units: e.target.value })}
                        style={{
                          width: 95,
                          padding: '5px 8px',
                          textAlign: 'center',
                          borderRadius: 6,
                          border: '1.5px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--text)',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: isCancelled ? 'var(--text-3)' : empty ? 'var(--text-3)' : 'var(--green-900)' }}>
                    {isCancelled ? <span style={{ color: 'var(--text-3)' }}>₹ 0.00</span> : empty ? <span style={{ color: 'var(--text-3)' }}>—</span> : `₹ ${inr(c.total)}`}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenEditor(r.id)}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      {isReadOnly ? 'View' : 'Open'}
                    </Btn>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>
                  No shops found matching "{query}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Add Shop Modal */}
      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Shop" width={500}>
        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Shop Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Campus General Store"
              value={newShop.name}
              onChange={(e) => setNewShop({ ...newShop, name: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="new-fixed-chk"
              checked={newShop.fixed}
              onChange={(e) => setNewShop({ ...newShop, fixed: e.target.checked })}
            />
            <label htmlFor="new-fixed-chk" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Fixed charges only (no meter readings)
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Rate per Unit (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                value={newShop.rate}
                onChange={(e) => setNewShop({ ...newShop, rate: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Water/Fixed Charges (Rs.)
              </label>
              <input
                type="number"
                value={newShop.water}
                onChange={(e) => setNewShop({ ...newShop, water: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Bill Expiry / Payment Due Date (Optional)
            </label>
            <input
              type="date"
              value={newShop.expiryDate}
              onChange={(e) => setNewShop({ ...newShop, expiryDate: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Btn type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" disabled={adding}>
              {adding ? 'Adding...' : 'Add Shop'}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
