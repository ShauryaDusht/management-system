import React, { useState, useEffect } from 'react'
import { Btn, Card, Modal, Spinner } from '../../components/ui'
import { inr0, calcMeters, formatDMY, billingLabel, todayISO, prevMonthOf } from './utils'
import { exportExcel } from '../../shared/utils'

export default function ElectricityTab({
  records = [],
  onPatch,
  onPatchAll,
  onCreate,
  onOpenEditor,
  cycleMonth,
  isReadOnly = false,
}) {
  const [query, setQuery] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [bulkMonth, setBulkMonth] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newContractor, setNewContractor] = useState({ name: '', toLine: '', address: '', intro: '', meterLabel: '', rate: '9.55' })
  const [adding, setAdding] = useState(false)

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
  const completeCount = records.filter((r) => {
    const calc = calcMeters(r.meters)
    return calc.complete
  }).length

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
    if (!newContractor.name.trim()) return
    setAdding(true)
    try {
      await onCreate({
        name: newContractor.name,
        toLine: newContractor.toLine,
        address: newContractor.address,
        intro: newContractor.intro,
        meters: [{ label: newContractor.meterLabel, current: '', previous: '', rate: Number(newContractor.rate) || 9.55 }],
      })
      setIsAddOpen(false)
      setNewContractor({ name: '', toLine: '', address: '', intro: '', meterLabel: '', rate: '9.55' })
    } catch (err) {
      alert('Could not add contractor.')
    } finally {
      setAdding(false)
    }
  }

  const handleExportExcel = async () => {
    if (!records || records.length === 0) {
      alert('No contractor records available to export.')
      return
    }

    const filename = `contractors_billing_${cycleMonth || todayISO()}.xlsx`
    const headers = [
      'Sl. #',
      'Date',
      'Contractor',
      'Billing Month',
      'Current Reading',
      'Previous Reading',
      'Unit Consumed',
      'Amount',
      'Signature',
    ]

    let sumUnits = 0
    let sumAmount = 0
    const rows = []

    records.forEach((r, i) => {
      const calc = calcMeters(r.meters)
      const noteNum = r.noteNo ? r.noteNo.replace(/^IWD\/\d{2}-\d{2}\//, '') : String(r.sl || i + 1)
      const dateStr = formatDMY(r.date) || r.date || ''
      const periodStr = billingLabel(r) || ''
      const meters = r.meters || []

      if (meters.length <= 1) {
        const m = meters[0] || {}
        const mRow = calc.rows[0] || {}
        const unitsVal = mRow.filled ? mRow.units : ''
        const amountVal = mRow.filled ? mRow.amount : ''

        if (typeof unitsVal === 'number') sumUnits += unitsVal
        if (typeof amountVal === 'number') sumAmount += amountVal

        const contractorLabel = m.label ? `${r.name}\n(${m.label})` : r.name

        rows.push([
          noteNum,
          dateStr,
          contractorLabel,
          periodStr,
          m.current || '',
          m.previous || '',
          unitsVal,
          amountVal,
          '',
        ])
      } else {
        // Multi-meter contractor (e.g. Haier Smart Solution)
        meters.forEach((m, mIdx) => {
          const mRow = calc.rows[mIdx] || {}
          const unitsVal = mRow.filled ? mRow.units : ''
          const amountVal = mRow.filled ? mRow.amount : ''

          if (typeof unitsVal === 'number') sumUnits += unitsVal
          if (typeof amountVal === 'number') sumAmount += amountVal

          const contractorLabel = mIdx === 0
            ? `${r.name}\n(${m.label || 'Meter 1'})`
            : `(${m.label || `Meter ${mIdx + 1}`})`

          rows.push([
            mIdx === 0 ? noteNum : '',
            mIdx === 0 ? dateStr : '',
            contractorLabel,
            mIdx === 0 ? periodStr : '',
            m.current || '',
            m.previous || '',
            unitsVal,
            amountVal,
            '',
          ])
        })
      }
    })

    rows.push(['TOTAL', '', '', '', '', '', sumUnits, sumAmount, ''])

    await exportExcel(filename, headers, rows, 'Power Contractors')
  }

  return (
    <div>
      {/* Contractors Unified Card (Toolbar + Table) */}
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
              placeholder="Search contractors..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: 150,
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
          </div>

          {/* Right: Progress & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', marginRight: 2 }}>
              <div style={{ width: 70, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--green-700)',
                    width: `${records.length ? (completeCount / records.length) * 100 : 0}%`,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <span><strong>{completeCount}</strong>/{records.length} ready</span>
            </div>

            <Btn
              size="sm"
              variant="secondary"
              onClick={handleExportExcel}
              title="Export all contractors billing data to Excel (.xlsx) with Signature column"
              style={{ whiteSpace: 'nowrap', padding: '5px 10px', fontSize: 12 }}
            >
              Export Excel
            </Btn>

            {!isReadOnly && (
              <Btn size="sm" variant="primary" onClick={() => setIsAddOpen(true)} style={{ whiteSpace: 'nowrap', padding: '5px 12px', fontSize: 12 }}>
                + Add Contractor
              </Btn>
            )}
          </div>
        </div>

        {/* Contractors Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '10px 14px', width: 55, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)' }}>Sl No.</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', minWidth: 200 }}>Contractor</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 160 }}>Note No.</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 100 }}>Date</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', width: 200 }}>Billing Period</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'center', width: 105 }}>Current</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'center', width: 105 }}>Previous</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'right', width: 95 }}>Units</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'right', width: 115 }}>Amount</th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', textAlign: 'center', width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const calc = calcMeters(r.meters)
              const single = (r.meters || []).length === 1
              const m = (r.meters || [])[0] || {}

              const handleSetMeter = (k, v) => {
                const nextMeters = [...(r.meters || [])]
                nextMeters[0] = { ...m, [k]: v }
                onPatch(r.id, { meters: nextMeters })
              }

              return (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  }}
                  className="ui-data-row"
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div
                      onClick={() => onOpenEditor(r.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontWeight: 600,
                        color: 'var(--green-900)',
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div>{r.name}</div>
                        {(r.meters || []).map((x, k) => x.label && (
                          <div key={k} style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}>
                            ({x.label})
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>
                    {isReadOnly ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                        {r.noteNo || '—'}
                      </span>
                    ) : (
                      <input
                        type="text"
                        placeholder="e.g. IWD/26-27/228"
                        value={r.noteNo || ''}
                        onChange={(e) => onPatch(r.id, { noteNo: e.target.value })}
                        style={{
                          width: 140,
                          padding: '5px 8px',
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
                  <td style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>
                    {isReadOnly ? (
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{formatDMY(r.date)}</span>
                    ) : (
                      <input
                        type="date"
                        value={r.date || ''}
                        onChange={(e) => onPatch(r.id, { date: e.target.value })}
                        style={{
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: '1.5px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 12,
                          fontFamily: 'inherit',
                          color: 'var(--text)',
                        }}
                      />
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {billingLabel(r)}
                  </td>
                  {single ? (
                    <>
                      <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                        {isReadOnly ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: m.current ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {m.current || '—'}
                          </span>
                        ) : (
                          <input
                            type="number"
                            placeholder="Current"
                            value={m.current || ''}
                            onChange={(e) => handleSetMeter('current', e.target.value)}
                            style={{
                              width: 85,
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
                      <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                        {isReadOnly ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: m.previous ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {m.previous || '—'}
                          </span>
                        ) : (
                          <input
                            type="number"
                            placeholder="Prev"
                            value={m.previous || ''}
                            onChange={(e) => handleSetMeter('previous', e.target.value)}
                            style={{
                              width: 85,
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
                    </>
                  ) : (
                    <td colSpan={2} style={{ padding: '6px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
                        {(r.meters || []).length} meters ({isReadOnly ? 'view details' : 'open to fill'})
                      </span>
                    </td>
                  )}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {calc.hasInvalid ? (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>Invalid</span>
                    ) : calc.rows.some((x) => x.filled) ? (
                      calc.rows.reduce((sum, x) => sum + (x.units || 0), 0)
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: calc.complete ? 'var(--green-900)' : 'var(--text-3)' }}>
                    {calc.complete ? `₹ ${inr0(calc.total)}` : '—'}
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
                <td colSpan={10} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>
                  No contractors found matching "{query}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Add Contractor Modal */}
      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Contractor" width={520}>
        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Contractor Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. M/s. Global Infrastructure Ltd"
              value={newContractor.name}
              onChange={(e) => setNewContractor({ ...newContractor, name: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              To Line (Optional, defaults to Name)
            </label>
            <input
              type="text"
              placeholder="e.g. CPWD (M/s. Global Infrastructure Ltd)"
              value={newContractor.toLine}
              onChange={(e) => setNewContractor({ ...newContractor, toLine: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Initial Meter Label
              </label>
              <input
                type="text"
                placeholder="e.g. Substation 1"
                value={newContractor.meterLabel}
                onChange={(e) => setNewContractor({ ...newContractor, meterLabel: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Rate per Unit (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                value={newContractor.rate}
                onChange={(e) => setNewContractor({ ...newContractor, rate: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Btn type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" disabled={adding}>
              {adding ? 'Adding...' : 'Add Contractor'}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
