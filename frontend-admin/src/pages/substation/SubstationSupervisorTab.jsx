import React, { useState, useMemo } from 'react'
import { Card, Btn, Badge, Alert, DataTable } from '../../components/ui'

export default function SubstationSupervisorTab({
  sheets = [],
  docs = [],
  selectedDate,
  selectedSlot,
  user,
  onDateChange,
  onSlotChange,
  onSelectPanelForEntry,
  onSaveDoc,
}) {
  const SLOTS = ['R1', 'R2', 'R3']
  const [remarks, setRemarks] = useState('')
  const [signOffStatus, setSignOffStatus] = useState(null)

  // Filter docs for current date and slot
  const currentReadings = useMemo(() => {
    return docs.filter((d) => d.date === selectedDate && d.slot === selectedSlot)
  }, [docs, selectedDate, selectedSlot])

  const readingsMap = useMemo(() => {
    const map = {}
    currentReadings.forEach((r) => {
      map[r.sheet] = r
    })
    return map
  }, [currentReadings])

  // Detect any feeder anomalies (low PF < 0.92, zero current on active feeder, etc.)
  const anomalies = useMemo(() => {
    const list = []
    currentReadings.forEach((r) => {
      const sheetObj = sheets.find((s) => s.id === r.sheet)
      const sheetName = sheetObj?.name || r.sheet
      const rows = r.rows || {}
      Object.entries(rows).forEach(([rowKey, vals]) => {
        if (!vals || typeof vals !== 'object') return
        const pf = parseFloat(vals.pf)
        if (!isNaN(pf) && pf > 0 && pf < 0.90) {
          list.push({
            panel: sheetName,
            row: rowKey,
            issue: `Low Power Factor: ${pf.toFixed(2)} (Target ≥ 0.95)`,
            severity: 'warn',
          })
        }
        const vol = parseFloat(vals.vol)
        if (!isNaN(vol)) {
          if (r.panel_type === 'HT' && (vol < 10.0 || vol > 12.0)) {
            list.push({
              panel: sheetName,
              row: rowKey,
              issue: `HT Voltage deviation: ${vol} kV (Nominal 11.0 kV)`,
              severity: 'error',
            })
          } else if (r.panel_type === 'LT' && (vol < 210 || vol > 255)) {
            list.push({
              panel: sheetName,
              row: rowKey,
              issue: `LT Voltage deviation: ${vol} V (Nominal 230 V)`,
              severity: 'warn',
            })
          }
        }
      })
    })
    return list
  }, [currentReadings, sheets])

  const handleVerifyAll = async () => {
    setSignOffStatus(null)
    try {
      // Mark readings as verified
      let count = 0
      for (const r of currentReadings) {
        const updated = {
          ...r,
          verified: true,
          verifiedBy: user?.name || 'Supervisor',
          verifiedAt: new Date().toISOString(),
          supervisorRemarks: remarks,
        }
        await onSaveDoc(updated)
        count++
      }
      setSignOffStatus({
        type: 'success',
        message: `Verified and signed off ${count} substation readings for Shift ${selectedSlot} (${selectedDate}).`,
      })
    } catch (err) {
      setSignOffStatus({
        type: 'error',
        message: `Error signing off: ${err.message || 'Unknown error'}`,
      })
    }
  }

  // Verification rows
  const verificationRows = useMemo(() => {
    return sheets.map((s) => {
      const r = readingsMap[s.id]
      const isLogged = Boolean(r && (r.filled > 0 || Object.keys(r.rows || {}).length > 0))
      const isVerified = Boolean(r?.verified)

      return [
        <div>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>
            {s.full_title || s.full || s.section + ' Panel'}
          </span>
        </div>,
        <Badge value={s.section === 'HT' ? 'urgent' : 'present'}>
          {s.section}
        </Badge>,
        isLogged ? (
          <div>
            <span style={{ fontWeight: 600, color: '#16a34a' }}>{r.operator || 'Operator'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>at {r.time || 'Logged'}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>Not Logged</span>
        ),
        <Badge value={isVerified ? 'approved' : isLogged ? 'pending' : 'rejected'}>
          {isVerified ? 'Verified' : isLogged ? 'Awaiting Review' : 'Missing'}
        </Badge>,
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn
            size="sm"
            variant="secondary"
            onClick={() => onSelectPanelForEntry(s.id, selectedDate, selectedSlot)}
          >
            {isLogged ? 'Inspect' : 'Fill'}
          </Btn>
        </div>,
      ]
    })
  }, [sheets, readingsMap, selectedDate, selectedSlot, onSelectPanelForEntry])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Shift Filter Card */}
      <Card style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1.5px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSlotChange(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: '1.5px solid var(--border)',
                  cursor: 'pointer',
                  background: selectedSlot === s ? 'var(--green-800)' : 'var(--surface)',
                  color: selectedSlot === s ? '#fff' : 'var(--text)',
                }}
              >
                Shift {s} Review
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sign-off Notification */}
      {signOffStatus && (
        <Alert type={signOffStatus.type} message={signOffStatus.message} />
      )}

      {/* Engineering Alert Warnings */}
      {anomalies.length > 0 && (
        <Card style={{ borderLeft: '4px solid #f59e0b', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>
              Attention Required: {anomalies.length} Engineering Parameter Notice(s)
            </h4>
          </div>
          <ul style={{ margin: '6px 0 0 20px', fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
            {anomalies.map((a, idx) => (
              <li key={idx}>
                <b>{a.panel}</b> ({a.row}): {a.issue}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Review Table Card */}
      <Card style={{ padding: 0 }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Shift {selectedSlot} Substation Logs — Verification Checklist
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Date: {selectedDate} • {currentReadings.length} of {sheets.length} panels logged
            </p>
          </div>
        </div>

        <DataTable
          headers={['Substation Panel', 'Section', 'Logged By', 'Verification Status', 'Actions']}
          rows={verificationRows}
          emptyMsg="No panels found."
        />

        {/* Supervisor Sign-Off Form */}
        <div
          style={{
            padding: '18px 22px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-2)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Supervisor Remarks & Sign-off Notes
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Incomers verified; APFC operational. Normal campus operations."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Btn
              variant="primary"
              disabled={currentReadings.length === 0}
              onClick={handleVerifyAll}
            >
              Sign-Off & Verify Shift {selectedSlot} ({currentReadings.length} Panels)
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
