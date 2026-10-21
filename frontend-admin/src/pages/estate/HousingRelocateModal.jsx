import React, { useState, useEffect, useMemo } from 'react'
import { Btn, Modal, Spinner } from '../../components/ui'
import { todayISO } from '../../shared/utils'
import estateApi from '../../api/estate'

export default function HousingRelocateModal({
  isOpen,
  onClose,
  record,
  vacantUnits = [],
  onSuccess,
}) {
  const [selectedType, setSelectedType] = useState('A')
  const [targetUnitId, setTargetUnitId] = useState('')
  const [dateOfRelocation, setDateOfRelocation] = useState(todayISO())
  const [alIssueDate, setAlIssueDate] = useState(todayISO())
  const [dateOfExpiry, setDateOfExpiry] = useState('PoE/Relocation, whichever is earlier')
  const [reason, setReason] = useState('Quarters Upgradation / Relocation')
  const [submitting, setSubmitting] = useState(false)

  // Reset form when opened
  useEffect(() => {
    if (isOpen && record) {
      setSelectedType(record.houseType || 'A')
      setDateOfRelocation(todayISO())
      setAlIssueDate(todayISO())
      setDateOfExpiry(record.dateOfExpiry || 'PoE/Relocation, whichever is earlier')
      setReason('Quarters Upgradation / Relocation')
      setTargetUnitId('')
    }
  }, [isOpen, record])

  // Filter vacant units by selected type
  const availableUnitsForType = useMemo(() => {
    return vacantUnits.filter((u) => (u.houseType || '').toUpperCase() === selectedType.toUpperCase())
  }, [vacantUnits, selectedType])

  // Set default target unit if available
  useEffect(() => {
    if (availableUnitsForType.length > 0 && !targetUnitId) {
      setTargetUnitId(availableUnitsForType[0].id)
    }
  }, [availableUnitsForType, targetUnitId])

  if (!isOpen || !record) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!targetUnitId) {
      alert('Please select a target vacant quarter to relocate into.')
      return
    }

    setSubmitting(true)
    try {
      await estateApi.relocateHousing(record.id, {
        target_unit_id: parseInt(targetUnitId, 10),
        date_of_relocation: dateOfRelocation,
        al_issue_date: alIssueDate,
        date_of_expiry: dateOfExpiry,
        reason: reason.trim() || 'Quarter Relocation',
      })
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to relocate quarter:', err)
      const msg = err.response?.data?.error || 'Failed to relocate quarter.'
      alert(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedTargetUnit = vacantUnits.find((u) => u.id === parseInt(targetUnitId, 10))

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Relocate Occupant (${record.occupantName})`}
      width={600}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Current Allotment Info */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {record.occupantName}{' '}
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
                ({record.designation})
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
              Current: <strong>Type {record.houseType} • House {record.houseNo}</strong> (Occupied since {record.dateOfOccupation || '—'})
            </div>
          </div>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Code: {record.emplCode || 'N/A'}
          </span>
        </div>

        {/* Relocation Process Note */}
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#1e40af',
            lineHeight: 1.4,
          }}
        >
          <strong>Room Change Rule:</strong> Relocating will mark current House{' '}
          <strong>{record.houseNo}</strong> as <strong>VACANT</strong>, allot the selected target quarter,
          and automatically log a <strong>Room Change</strong> in {record.occupantName}&apos;s audit trail.
        </div>

        {/* Target Quarter Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              Target House Type *
            </label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value)
                setTargetUnitId('')
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                outline: 'none',
                fontWeight: 600,
              }}
            >
              {['A', 'B', 'C', 'D', 'E', 'F'].map((t) => (
                <option key={t} value={t}>
                  Type {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              Select Vacant Quarter ({availableUnitsForType.length} available) *
            </label>
            <select
              required
              value={targetUnitId}
              onChange={(e) => setTargetUnitId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                outline: 'none',
                fontWeight: 600,
              }}
            >
              {availableUnitsForType.length === 0 ? (
                <option value="">No vacant units available in Type {selectedType}</option>
              ) : (
                availableUnitsForType.map((u) => (
                  <option key={u.id} value={u.id}>
                    House {u.houseNo} (Block {u.blockNo || '—'}, Floor {u.floor !== null ? u.floor : '—'})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Date of Relocation & AL Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              Date of Relocation *
            </label>
            <input
              type="date"
              required
              value={dateOfRelocation}
              onChange={(e) => setDateOfRelocation(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              New AL Issue Date
            </label>
            <input
              type="date"
              value={alIssueDate}
              onChange={(e) => setAlIssueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Date of Expiry */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-3)',
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Date of Expiry / Tenure Term
          </label>
          <input
            type="text"
            value={dateOfExpiry}
            onChange={(e) => setDateOfExpiry(e.target.value)}
            placeholder="PoE/Relocation, whichever is earlier"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>

        {/* Reason for Relocation */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-3)',
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Reason for Relocation *
          </label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Quarters Upgradation, Institute Allocation, Maintenance"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <Btn size="sm" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Btn>
          <Btn
            size="sm"
            variant="primary"
            type="submit"
            disabled={submitting || !targetUnitId}
          >
            {submitting ? 'Relocating...' : 'Confirm Relocation'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
