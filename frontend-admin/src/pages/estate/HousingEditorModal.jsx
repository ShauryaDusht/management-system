import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui'
import { todayISO } from '../../shared/utils'
import { parseFlexibleDate } from './utils'
import estateApi from '../../api/estate'

export default function HousingEditorModal({
  isOpen,
  onClose,
  record,
  allUnits = [],
  onSave,
  onDelete,
  onOpenHistory,
  onSuccess,
}) {
  const [form, setForm] = useState({
    houseType: 'A',
    houseNo: '',
    occupantName: '',
    emplCode: '',
    designation: '',
    email: '',
    dateOfOccupation: '',
    alIssueDate: '',
    expiryType: 'poe', // 'poe' or 'contract'
    expiryDate: '',
    remarks: '',
  })

  const [vacateDate, setVacateDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [vacating, setVacating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Format date to YYYY-MM-DD for date input
  const toInputDate = (str) => {
    if (!str) return ''
    const d = parseFlexibleDate(str)
    if (!d) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  useEffect(() => {
    if (record) {
      const expText = record.dateOfExpiry || ''
      const isContract = expText.toLowerCase().includes('contract') || expText.toLowerCase().includes('cotract')
      const expDate = toInputDate(expText)

      setForm({
        houseType: record.houseType || 'A',
        houseNo: record.houseNo || '',
        occupantName: record.occupantName || '',
        emplCode: record.emplCode || '',
        designation: record.designation || '',
        email: record.email || '',
        dateOfOccupation: toInputDate(record.dateOfOccupation),
        alIssueDate: toInputDate(record.alIssueDate),
        expiryType: isContract ? 'contract' : 'poe',
        expiryDate: expDate || '',
        remarks: record.remarks || '',
      })
      setVacateDate(todayISO())
      setConfirmDelete(false)
    }
  }, [record, isOpen])

  if (!isOpen || !record) return null

  const handleChange = (field, val) => {
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  // Handle House dropdown select
  const handleHouseChange = (e) => {
    const val = e.target.value
    const found = allUnits.find((u) => `${u.houseType} ${u.houseNo}` === val)
    if (found) {
      setForm((prev) => ({
        ...prev,
        houseType: found.houseType,
        houseNo: found.houseNo,
      }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.occupantName.trim()) {
      alert("Please provide the Occupant's Name.")
      return
    }

    let finalExpiry = 'PoE/Relocation, whichever is earlier'
    if (form.expiryType === 'contract') {
      if (form.expiryDate) {
        const d = parseFlexibleDate(form.expiryDate)
        if (d) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const day = d.getDate()
          const mon = months[d.getMonth()]
          const yr = String(d.getFullYear()).slice(-2)
          finalExpiry = `On Contract till ${day}-${mon}-${yr}`
        } else {
          finalExpiry = `On Contract till ${form.expiryDate}`
        }
      } else {
        finalExpiry = 'On Contract'
      }
    }

    setSaving(true)
    try {
      await onSave({
        ...form,
        dateOfExpiry: finalExpiry,
      })
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to save housing record:', err)
      alert('Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkVacated = async () => {
    if (!vacateDate) {
      alert('Please enter a vacation date.')
      return
    }
    setVacating(true)
    try {
      await estateApi.vacateHousing(record.id, {
        date_of_vacation: vacateDate,
        vacation_reason: 'Vacated house',
      })
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to vacate:', err)
      alert('Could not mark as vacated.')
    } finally {
      setVacating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (onDelete && record.id) {
      await onDelete(record.id)
      if (onSuccess) onSuccess()
      onClose()
    }
  }

  const currentHouseKey = `${form.houseType} ${form.houseNo}`

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Edit Housing Record"
      width={540}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top Link */}
        {form.occupantName && (
          <div>
            <button
              type="button"
              onClick={() => {
                if (onOpenHistory) {
                  onOpenHistory({ emplCode: form.emplCode, occupantName: form.occupantName, houseNo: form.houseNo })
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#0f172a',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              View {form.occupantName}&apos;s house history →
            </button>
          </div>
        )}

        {/* House * */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
            House *
          </label>
          <select
            value={currentHouseKey}
            onChange={handleHouseChange}
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
          >
            {allUnits.map((u) => {
              const key = `${u.houseType} ${u.houseNo}`
              const isCurr = key === currentHouseKey
              const isOcc = u.status === 'occupied'
              const label = `${u.houseType} ${u.houseNo} — ${isCurr ? 'occupied now' : isOcc ? 'occupied now' : 'vacant'}`
              return (
                <option key={u.id} value={key} disabled={!isCurr && isOcc}>
                  {label}
                </option>
              )
            })}
          </select>
        </div>

        {/* Occupant's Name * */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
            Occupant&apos;s Name *
          </label>
          <input
            type="text"
            required
            value={form.occupantName}
            onChange={(e) => handleChange('occupantName', e.target.value)}
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

        {/* Empl. Code & Designation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Empl. Code
            </label>
            <input
              type="text"
              value={form.emplCode}
              onChange={(e) => handleChange('emplCode', e.target.value)}
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
              Designation
            </label>
            <input
              type="text"
              value={form.designation}
              onChange={(e) => handleChange('designation', e.target.value)}
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

        {/* Email */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
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

        {/* Date of Occupation * & AL Issue On */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Date of Occupation *
            </label>
            <input
              type="date"
              required
              value={form.dateOfOccupation}
              onChange={(e) => handleChange('dateOfOccupation', e.target.value)}
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
              AL Issue On
            </label>
            <input
              type="date"
              value={form.alIssueDate}
              onChange={(e) => handleChange('alIssueDate', e.target.value)}
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

        {/* Date of Expiry */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
            Date of Expiry
          </label>
          <select
            value={form.expiryType}
            onChange={(e) => handleChange('expiryType', e.target.value)}
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
          >
            <option value="poe">PoE/Relocation, whichever is earlier</option>
            <option value="contract">On Contract till (date)</option>
          </select>
        </div>

        {/* Expiry Date (if On Contract till) */}
        {form.expiryType === 'contract' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Expiry Date *
            </label>
            <input
              type="date"
              required
              value={form.expiryDate}
              onChange={(e) => handleChange('expiryDate', e.target.value)}
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
        )}

        {/* Yellow Box: Vacate this house */}
        <div
          style={{
            background: '#fffdf0',
            border: '1.5px solid #fef08a',
            borderRadius: 10,
            padding: '14px 16px',
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9a3412', marginBottom: 4 }}>
            Vacate this house
          </div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.4, marginBottom: 10 }}>
            Use the day they actually leave. The house becomes vacant and this stay stays in its history. A date in the future keeps them listed until that day.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={vacateDate}
              onChange={(e) => setVacateDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #d97706',
                fontSize: 12.5,
                background: '#ffffff',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              disabled={vacating}
              onClick={handleMarkVacated}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#c2410c',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {vacating ? 'Vacating...' : 'Mark as vacated'}
            </button>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 10,
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <div>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: confirmDelete ? '#b91c1c' : '#334155',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {confirmDelete ? 'Confirm delete record?' : 'Delete (entered by mistake)'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
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
              disabled={saving}
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
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
