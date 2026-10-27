import React, { useState, useEffect } from 'react'
import { Btn, Modal } from '../../components/ui'

export default function SettingsModal({
  isOpen,
  onClose,
  settings = {},
  onSave,
}) {
  const [formData, setFormData] = useState({
    headline: 'Demand Note',
    noteNoPrefix: 'IWD/26-27/',
    autoFinancialYear: true,
    firstNoteNo: 230,
    firstContractorNoteNo: 228,
    expiryAlertDays: 30,
    paymentNote: '',
    signatory: { name: 'Sujeet Kumar, SE', title: 'Estate Officer' },
    bank: [],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings && isOpen) {
      setFormData({
        headline: settings.headline || 'Demand Note',
        noteNoPrefix: settings.noteNoPrefix || 'IWD/26-27/',
        autoFinancialYear: settings.autoFinancialYear !== false,
        firstNoteNo: settings.firstNoteNo || 230,
        firstContractorNoteNo: settings.firstContractorNoteNo || 228,
        expiryAlertDays: Number(settings.expiryAlertDays) || 30,
        paymentNote: settings.paymentNote || '',
        signatory: {
          name: settings.signatory?.name || 'Sujeet Kumar, SE',
          title: settings.signatory?.title || 'Estate Officer',
        },
        bank: Array.isArray(settings.bank) ? settings.bank.map((r) => [...r]) : [],
      })
    }
  }, [settings, isOpen])

  if (!isOpen) return null

  const handleBankChange = (index, fieldIdx, val) => {
    const next = formData.bank.map((r) => [...r])
    next[index][fieldIdx] = val
    setFormData({ ...formData, bank: next })
  }

  const handleAddBankRow = () => {
    setFormData({ ...formData, bank: [...formData.bank, ['New Label', 'New Value']] })
  }

  const handleRemoveBankRow = (index) => {
    setFormData({ ...formData, bank: formData.bank.filter((_, i) => i !== index) })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert('Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Estate Billing Settings (Shops & Contractors)"
      width={600}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Headline
            </label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Shop Note Start
            </label>
            <input
              type="number"
              value={formData.firstNoteNo}
              onChange={(e) => setFormData({ ...formData, firstNoteNo: Number(e.target.value) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Contractor Note Start
            </label>
            <input
              type="number"
              value={formData.firstContractorNoteNo}
              onChange={(e) => setFormData({ ...formData, firstContractorNoteNo: Number(e.target.value) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
            Note Number Prefix
          </label>
          <input
            type="text"
            value={formData.noteNoPrefix}
            onChange={(e) => setFormData({ ...formData, noteNoPrefix: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          />
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="auto-fy-chk"
              checked={formData.autoFinancialYear}
              onChange={(e) => setFormData({ ...formData, autoFinancialYear: e.target.checked })}
            />
            <label htmlFor="auto-fy-chk" style={{ fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
              Auto-update financial year from April (e.g. IWD/26-27/)
            </label>
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-1)' }}>
            Universal Shop Expiry Alert Window (Days)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              min={1}
              max={365}
              value={formData.expiryAlertDays}
              onChange={(e) => setFormData({ ...formData, expiryAlertDays: Number(e.target.value) })}
              style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              days before agreement expiry date to show alert on shops list
            </span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
            Payment Instruction Note
          </label>
          <textarea
            rows={3}
            value={formData.paymentNote}
            onChange={(e) => setFormData({ ...formData, paymentNote: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Signatory Name
            </label>
            <input
              type="text"
              value={formData.signatory.name}
              onChange={(e) => setFormData({ ...formData, signatory: { ...formData.signatory, name: e.target.value } })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Signatory Title
            </label>
            <input
              type="text"
              value={formData.signatory.title}
              onChange={(e) => setFormData({ ...formData, signatory: { ...formData.signatory, title: e.target.value } })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Bank Account Details</span>
            <Btn type="button" variant="ghost" onClick={handleAddBankRow} style={{ fontSize: 11, padding: '4px 8px' }}>
              + Add Row
            </Btn>
          </div>
          {formData.bank.map(([lbl, val], i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Label"
                value={lbl}
                onChange={(e) => handleBankChange(i, 0, e.target.value)}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
              />
              <input
                type="text"
                placeholder="Value"
                value={val}
                onChange={(e) => handleBankChange(i, 1, e.target.value)}
                style={{ flex: 2, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => handleRemoveBankRow(i)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <Btn type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
