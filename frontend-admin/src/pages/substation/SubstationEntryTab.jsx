import React, { useState, useEffect, useMemo } from 'react'
import { Card, Btn, Badge, Alert, Spinner } from '../../components/ui'

export default function SubstationEntryTab({
  sheets = [],
  docs = [],
  currentSheetId,
  selectedDate,
  selectedSlot,
  user,
  onSheetChange,
  onDateChange,
  onSlotChange,
  onSaveDoc,
}) {
  const SLOTS = ['R1', 'R2', 'R3']

  const activeSheet = useMemo(() => {
    return sheets.find((s) => s.id === currentSheetId) || sheets[0] || null
  }, [sheets, currentSheetId])

  const isHourly = activeSheet?.id === 'newht' || activeSheet?.id === 'oldht' || activeSheet?.mode === 'hourly'
  const effectiveSlot = isHourly ? 'day' : selectedSlot

  const docId = useMemo(() => {
    if (!activeSheet) return ''
    return `${activeSheet.id}__${selectedDate}__${effectiveSlot}`
  }, [activeSheet, selectedDate, effectiveSlot])

  // Look for existing reading in docs
  const existingDoc = useMemo(() => {
    return docs.find((d) => d._id === docId || (d.sheet === activeSheet?.id && d.date === selectedDate && d.slot === effectiveSlot))
  }, [docs, docId, activeSheet, selectedDate, effectiveSlot])

  const [operator, setOperator] = useState('')
  const [logTime, setLogTime] = useState('')
  const [rowValues, setRowValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  // Sync state whenever activeSheet, selectedDate, selectedSlot, or existingDoc changes
  useEffect(() => {
    if (existingDoc) {
      setOperator(existingDoc.operator || user?.name || '')
      setLogTime(existingDoc.time || new Date().toTimeString().slice(0, 5))
      setRowValues(existingDoc.rows || {})
    } else {
      setOperator(user?.name || 'Admin User')
      setLogTime(new Date().toTimeString().slice(0, 5))
      setRowValues({})
    }
    setSaveStatus(null)
  }, [existingDoc, activeSheet?.id, selectedDate, effectiveSlot, user?.name])

  // Extract flat rows from active sheet's tables
  const flatRows = useMemo(() => {
    if (!activeSheet) return []
    const rows = []
    const standardCols = ['vol', 'pf', 'kwh', 'a1', 'a2', 'a3']
    ;(activeSheet.tables || []).forEach((t) => {
      const tId = t.id || 't0'
      const tCols = (t.cols || []).map((c) => c.k).filter(Boolean)
      const colsToUse = tCols.length > 0 ? tCols : standardCols
      ;(t.rows || []).forEach((r) => {
        if (r.div) return
        rows.push({
          tableId: tId,
          rawId: r.id,
          id: `${tId}:${r.id}`,
          sn: r.sn || '',
          label: r.label || `Feeder ${r.id}`,
          anchor: Boolean(r.anchor),
          cols: colsToUse,
        })
      })
    })
    return rows
  }, [activeSheet])

  const handleCellChange = (rowId, colKey, val) => {
    setRowValues((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [colKey]: val,
      },
    }))
  }

  const handleSave = async (andNext = false) => {
    if (!activeSheet) return
    setSaving(true)
    setSaveStatus(null)
    try {
      let filledCount = 0
      let totalCells = 0
      flatRows.forEach((r) => {
        const rowVals = rowValues[r.id] || {}
        r.cols.forEach((c) => {
          totalCells++
          if (rowVals[c] != null && String(rowVals[c]).trim() !== '') {
            filledCount++
          }
        })
      })

      const newDoc = {
        _id: docId,
        sheet: activeSheet.id,
        panelType: activeSheet.section || 'LT',
        section: activeSheet.section || 'LT',
        substation: activeSheet.name,
        panelName: activeSheet.full_title || activeSheet.full || activeSheet.name,
        date: selectedDate,
        slot: effectiveSlot,
        time: logTime || new Date().toTimeString().slice(0, 5),
        operator: operator.trim() || user?.name || 'Staff',
        rows: rowValues,
        filled: filledCount,
        total: totalCells,
        updatedAt: new Date().toISOString(),
      }

      await onSaveDoc(newDoc)
      setSaveStatus({ type: 'success', message: `Saved ${activeSheet.name} (${isHourly ? 'Hourly Log' : `Shift ${selectedSlot}`}) successfully!` })

      if (andNext) {
        const currIdx = sheets.findIndex((s) => s.id === activeSheet.id)
        if (currIdx >= 0 && currIdx + 1 < sheets.length) {
          onSheetChange(sheets[currIdx + 1].id)
        }
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: `Failed to save: ${err.message || 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  if (!activeSheet) {
    return <Card style={{ padding: 40, textAlign: 'center' }}><Spinner /></Card>
  }

  const isHT = activeSheet.section === 'HT'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Selection Control Bar */}
      <Card style={{ padding: '16px 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Select Substation Panel
            </label>
            <select
              value={activeSheet.id}
              onChange={(e) => onSheetChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.section})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
              }}
            />
          </div>

          {!isHourly ? (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
                Shift Slot
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSlotChange(s)}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1.5px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedSlot === s ? 'var(--green-800)' : 'var(--surface)',
                      color: selectedSlot === s ? '#fff' : 'var(--text)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
                Logging Mode
              </label>
              <div
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: '1.5px solid rgba(124, 58, 237, 0.4)',
                  background: 'rgba(124, 58, 237, 0.1)',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 35,
                  boxSizing: 'border-box',
                }}
              >
                ⏱️ Hourly Log (24 Hours)
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Save Notification */}
      {saveStatus && (
        <Alert
          type={saveStatus.type}
          message={saveStatus.message}
        />
      )}

      {/* Main Panel Data Sheet Card */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Panel Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'var(--surface-2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                {activeSheet.name}
              </h2>
              <Badge value={isHT ? 'urgent' : 'present'}>
                {activeSheet.section} {isHT ? '(11 kV)' : '(415 V)'}
              </Badge>
              <Badge value={isHourly ? 'urgent' : 'done'}>
                {isHourly ? 'Hourly (24 Hours)' : `Shift ${selectedSlot}`}
              </Badge>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {activeSheet.full_title || activeSheet.full || 'Campus Substation'} • {flatRows.length} Feeders / Incomers
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginRight: 6 }}>
                OPERATOR:
              </span>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Operator Name"
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 140,
                }}
              />
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginRight: 6 }}>
                TIME:
              </span>
              <input
                type="time"
                value={logTime}
                onChange={(e) => setLogTime(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 110,
                }}
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto', padding: '6px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--surface)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', width: 50 }}>
                  S.N.
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 200 }}>
                  Feeder / Circuit Label
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 105 }}>
                  {isHT ? 'Vol (kV)' : 'Vol (V)'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 95 }}>
                  PF (0.8-1.0)
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 130 }}>
                  kWh (Meter)
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 85 }}>
                  A1 (Amps)
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 85 }}>
                  A2 (Amps)
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', minWidth: 85 }}>
                  A3 (Amps)
                </th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((r, i) => {
                const vals = rowValues[r.id] || {}
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: r.anchor ? '#f8fafc' : (i % 2 ? 'var(--surface-2)' : 'transparent'),
                    }}
                  >
                    <td style={{ padding: '9px 14px', color: 'var(--text-3)', fontWeight: 600 }}>
                      {r.sn || (i + 1)}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: r.anchor ? 800 : 600, color: 'var(--text)' }}>
                          {r.label}
                        </span>
                        {r.anchor && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: '#ede9fe',
                              color: '#6d28d9',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Incomer
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Vol */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={vals.vol ?? ''}
                        placeholder={isHT ? '11.00' : '230'}
                        onChange={(e) => handleCellChange(r.id, 'vol', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 85,
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>

                    {/* PF */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={vals.pf ?? ''}
                        placeholder="0.98"
                        onChange={(e) => handleCellChange(r.id, 'pf', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 75,
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>

                    {/* kWh */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="any"
                        value={vals.kwh ?? ''}
                        placeholder="e.g. 124500"
                        onChange={(e) => handleCellChange(r.id, 'kwh', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 120,
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>

                    {/* A1 */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.1"
                        value={vals.a1 ?? ''}
                        placeholder="A1"
                        onChange={(e) => handleCellChange(r.id, 'a1', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 70,
                          padding: '5px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>

                    {/* A2 */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.1"
                        value={vals.a2 ?? ''}
                        placeholder="A2"
                        onChange={(e) => handleCellChange(r.id, 'a2', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 70,
                          padding: '5px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>

                    {/* A3 */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.1"
                        value={vals.a3 ?? ''}
                        placeholder="A3"
                        onChange={(e) => handleCellChange(r.id, 'a3', e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 70,
                          padding: '5px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Action Footer */}
        <div
          style={{
            padding: '16px 22px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Auto-saves locally • Synced with central IITGN electrical records
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn
              variant="secondary"
              disabled={saving}
              onClick={() => handleSave(true)}
            >
              Save & Next Panel →
            </Btn>

            <Btn
              variant="primary"
              disabled={saving}
              onClick={() => handleSave(false)}
            >
              {saving ? 'Saving...' : isHourly ? 'Save Hourly Readings (24h)' : `Save Shift ${selectedSlot} Reading`}
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
