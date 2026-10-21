import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui'
import { todayISO } from '../../shared/utils'
import { parseFlexibleDate } from './utils'
import estateApi from '../../api/estate'

export default function HousingAllotModal({
  isOpen,
  onClose,
  preselectedUnit = null,
  vacantUnits = [],
  allUnits = [],
  onSuccess,
}) {
  const [selectedHouseKey, setSelectedHouseKey] = useState('')
  const [occupantName, setOccupantName] = useState('')
  const [emplCode, setEmplCode] = useState('')
  const [designation, setDesignation] = useState('')
  const [email, setEmail] = useState('')
  const [priority, setPriority] = useState('')
  const [dateOfOccupation, setDateOfOccupation] = useState(todayISO())
  const [alIssueDate, setAlIssueDate] = useState('')
  const [expiryType, setExpiryType] = useState('poe')
  const [expiryDate, setExpiryDate] = useState('')
  const [hasAlreadyLeft, setHasAlreadyLeft] = useState(false)
  const [dateOfVacation, setDateOfVacation] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (preselectedUnit) {
        setSelectedHouseKey(`${preselectedUnit.houseType} ${preselectedUnit.houseNo}`)
      } else if (vacantUnits.length > 0) {
        setSelectedHouseKey(`${vacantUnits[0].houseType} ${vacantUnits[0].houseNo}`)
      } else if (allUnits.length > 0) {
        setSelectedHouseKey(`${allUnits[0].houseType} ${allUnits[0].houseNo}`)
      } else {
        setSelectedHouseKey('A 01/101')
      }
      setOccupantName('')
      setEmplCode('')
      setDesignation('')
      setEmail('')
      setPriority('')
      setDateOfOccupation(todayISO())
      setAlIssueDate('')
      setExpiryType('poe')
      setExpiryDate('')
      setHasAlreadyLeft(false)
      setDateOfVacation('')
    }
  }, [isOpen, preselectedUnit, vacantUnits, allUnits])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!occupantName.trim()) {
      alert("Please enter the Occupant's Name.")
      return
    }

    const parts = selectedHouseKey.split(' ')
    const houseType = parts[0] || 'A'
    const houseNo = parts.slice(1).join(' ') || ''

    if (!houseNo) {
      alert('Please select a house.')
      return
    }

    let finalExpiry = 'PoE/Relocation, whichever is earlier'
    if (expiryType === 'contract') {
      if (expiryDate) {
        const d = parseFlexibleDate(expiryDate)
        if (d) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const day = d.getDate()
          const mon = months[d.getMonth()]
          const yr = String(d.getFullYear()).slice(-2)
          finalExpiry = `On Contract till ${day}-${mon}-${yr}`
        } else {
          finalExpiry = `On Contract till ${expiryDate}`
        }
      } else {
        finalExpiry = 'On Contract'
      }
    }

    setSaving(true)
    try {
      const res = await estateApi.createHousing({
        houseType,
        houseNo,
        occupantName: occupantName.trim(),
        emplCode: emplCode.trim(),
        designation: designation.trim(),
        email: email.trim(),
        dateOfOccupation,
        alIssueDate: alIssueDate || '',
        dateOfExpiry: finalExpiry,
        priority: priority.trim(),
        keyHandedOverDate: '',
        hasAlreadyLeft,
        dateOfVacation: hasAlreadyLeft ? (dateOfVacation || todayISO()) : '',
      })

      if (res.data?.message) {
        alert(res.data.message)
      } else {
        alert(`Success! Handover pipeline initiated for ${houseType} ${houseNo} to ${occupantName.trim()}. Please hand over keys in Housing Status when ready.`)
      }

      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to allot house:', err)
      const msg = err.response?.data?.error || 'Failed to allot house.'
      alert(`Error: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // Available houses for dropdown
  const housesToDisplay = hasAlreadyLeft ? allUnits : (vacantUnits.length > 0 ? vacantUnits : allUnits)

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={hasAlreadyLeft ? 'Add Historical Stay Record' : 'Allot House (Initiate Handover Pipeline)'}
      width={560}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!hasAlreadyLeft && (
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--text-2)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--green-900)' }}>Campus Workflow Note:</strong> Allotment record will be initiated in the <strong>Housing Status Pipeline</strong>. Key handover to Civil can be done with 1-click in the Housing Status tab whenever the keys are physically handed over.
          </div>
        )}

        {/* House Selection */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
            House *
          </label>
          <select
            value={selectedHouseKey}
            onChange={(e) => setSelectedHouseKey(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            {housesToDisplay.map((u) => {
              const key = `${u.houseType} ${u.houseNo}`
              const statusLabel = u.status === 'vacant' ? 'Vacant' : u.status === 'under_clearance' ? 'Under Clearance' : 'Occupied'
              return (
                <option key={u.id} value={key}>
                  {u.houseType} {u.houseNo} — {statusLabel}
                </option>
              )
            })}
          </select>
        </div>

        {/* Occupant / Allottee Name */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
            Allottee / Occupant Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Dr. Pratik"
            value={occupantName}
            onChange={(e) => setOccupantName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Clearance Priority (Queue Rank) */}
        {!hasAlreadyLeft && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
              Clearance Priority (Queue Rank)
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="">Standard Queue (No Special Priority)</option>
              <option value="1">Priority 1 (Urgent - Top of Queue)</option>
              <option value="2">Priority 2 (High Priority)</option>
              <option value="3">Priority 3 (Normal Priority)</option>
            </select>
          </div>
        )}

        {/* Empl. Code & Designation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
              Empl. Code
            </label>
            <input
              type="text"
              placeholder="e.g. 0136 / C0101"
              value={emplCode}
              onChange={(e) => setEmplCode(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
              Designation
            </label>
            <input
              type="text"
              placeholder="e.g. Assistant Professor"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
            Email
          </label>
          <input
            type="email"
            placeholder="name@iitgn.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 13,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* AL Issue Date / Request Date (Manual) */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>
            Allotment Letter Issued / Request Date <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>(Manual)</span>
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
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Historical Stay Checkbox */}
        <div style={{ marginTop: 2 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hasAlreadyLeft}
              onChange={(e) => setHasAlreadyLeft(e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer' }}
            />
            <span>
              <strong>Historical stay record</strong> (Person has already vacated in the past). Leave unchecked for live allotment.
            </span>
          </label>
        </div>

        {hasAlreadyLeft && (
          <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Date of Vacation (When did this person leave?) *
            </label>
            <input
              type="date"
              required={hasAlreadyLeft}
              value={dateOfVacation}
              onChange={(e) => setDateOfVacation(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 6,
                border: '1.5px solid var(--border)',
                fontSize: 12.5,
                background: 'var(--surface)',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '7px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--green-900)',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(26,60,52,0.2)',
            }}
          >
            {saving ? 'Processing...' : hasAlreadyLeft ? 'Save Historical Stay' : 'Initiate Handover & Pipeline'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
