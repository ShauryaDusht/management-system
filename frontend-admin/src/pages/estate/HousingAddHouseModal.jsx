import React, { useState } from 'react'
import { Modal } from '../../components/ui'
import estateApi from '../../api/estate'

export default function HousingAddHouseModal({
  isOpen,
  onClose,
  onSuccess,
}) {
  const [houseType, setHouseType] = useState('A')
  const [houseNo, setHouseNo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!houseNo.trim()) {
      alert('Please enter a House Number.')
      return
    }

    setSubmitting(true)
    try {
      await estateApi.createHousingUnit({
        houseType: houseType.trim().toUpperCase(),
        houseNo: houseNo.trim(),
      })
      setHouseNo('')
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to add house:', err)
      const msg = err.response?.data?.error || 'Failed to add house.'
      alert(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Add House to list"
      width={460}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              House Type *
            </label>
            <input
              type="text"
              required
              value={houseType}
              onChange={(e) => setHouseType(e.target.value)}
              placeholder="e.g. A"
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
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              House No. *
            </label>
            <input
              type="text"
              required
              value={houseNo}
              onChange={(e) => setHouseNo(e.target.value)}
              placeholder="e.g. 01/101"
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
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
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
              borderRadius: 8,
              border: 'none',
              background: '#164e3f',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {submitting ? 'Adding...' : 'Add house'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
