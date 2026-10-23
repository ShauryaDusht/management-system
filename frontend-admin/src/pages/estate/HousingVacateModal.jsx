import React, { useState, useEffect } from 'react'
import { Btn, Modal } from '../../components/ui'
import { todayISO } from '../../shared/utils'
import estateApi from '../../api/estate'

export default function HousingVacateModal({
  isOpen,
  onClose,
  record,
  onSuccess,
}) {
  const [dateOfVacation, setDateOfVacation] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setDateOfVacation(todayISO())
    }
  }, [isOpen])

  if (!isOpen || !record) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!dateOfVacation) {
      alert('Please select a date of vacation.')
      return
    }

    setSubmitting(true)
    try {
      await estateApi.vacateHousing(record.id, {
        date_of_vacation: dateOfVacation,
        vacation_reason: 'Vacated quarter',
        createClearance: false,
      })
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to vacate quarter:', err)
      const msg = err.response?.data?.error || 'Failed to vacate house.'
      alert(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  const occupantName = record.occupantName || 'Occupant'
  const houseType = record.houseType || 'A'
  const houseNo = record.houseNo || ''

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Mark house as vacated"
      width={480}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
          <strong>{occupantName}</strong> leaves house <strong>{houseType} {houseNo}</strong>. The house becomes vacant and this stay stays in its history.
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 700,
              color: '#334155',
              marginBottom: 6,
            }}
          >
            Date of Vacation *
          </label>
          <input
            type="date"
            required
            value={dateOfVacation}
            onChange={(e) => setDateOfVacation(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
              fontSize: 13,
              background: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5, lineHeight: 1.4 }}>
            Use the day they actually leave. A date in the future keeps them listed as occupant until that day.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '7px 16px',
              borderRadius: 20,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '7px 18px',
              borderRadius: 20,
              border: 'none',
              background: '#164e3f',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {submitting ? 'Marking...' : 'Mark vacant'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
