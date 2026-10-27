import React, { useState, useEffect } from 'react'
import { Btn, Card, Modal, Spinner } from '../../components/ui'
import { inr, formatDMY, todayISO } from './utils'

export default function PaymentRecordModal({
  isOpen,
  onClose,
  record,
  title = 'Payment Record',
  name = '',
  noteNo = '',
  totalAmount = 0,
  onSavePayments,
  isReadOnly = false,
}) {
  const [payments, setPayments] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // New payment form fields
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(todayISO())
  const [newMode, setNewMode] = useState('Online / NEFT')
  const [newReceiptNo, setNewReceiptNo] = useState('')
  const [newRemarks, setNewRemarks] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Sync payments from record whenever record changes or modal opens
  useEffect(() => {
    if (record) {
      setPayments(Array.isArray(record.payments) ? [...record.payments] : [])
      setError('')
      setShowAddForm(false)
      resetForm()
    }
  }, [record, isOpen])

  const totalBill = Number(totalAmount || record?.total_amount || 0)

  // Calculate sum of payments
  const totalPaid = payments.reduce((sum, p) => {
    const val = Number(String(p.amount || 0).replace(/,/g, ''))
    return sum + (Number.isNaN(val) ? 0 : val)
  }, 0)

  const balanceDue = Math.max(0, totalBill - totalPaid)
  const percentPaid = totalBill > 0 ? Math.min(100, Math.round((totalPaid / totalBill) * 100)) : (totalPaid > 0 ? 100 : 0)

  let statusKey = 'unpaid'
  let statusLabel = 'Unpaid'
  let statusColor = '#64748b'
  let statusBg = '#f1f5f9'
  let statusBorder = '#cbd5e1'

  if (totalPaid >= totalBill && totalBill > 0) {
    statusKey = 'paid'
    statusLabel = 'Fully Paid'
    statusColor = '#15803d'
    statusBg = '#dcfce7'
    statusBorder = '#86efac'
  } else if (totalPaid > 0) {
    statusKey = 'partial'
    statusLabel = 'Partially Paid'
    statusColor = '#b45309'
    statusBg = '#fef3c7'
    statusBorder = '#fde68a'
  }

  const resetForm = () => {
    setNewAmount('')
    setNewDate(todayISO())
    setNewMode('Online / NEFT')
    setNewReceiptNo('')
    setNewRemarks('')
  }

  const handleOpenAddForm = (fillRemaining = false) => {
    if (fillRemaining && balanceDue > 0) {
      setNewAmount(String(balanceDue))
    } else {
      setNewAmount('')
    }
    setNewDate(todayISO())
    setShowAddForm(true)
  }

  const handleAddPayment = async (e) => {
    if (e) e.preventDefault()
    if (isReadOnly) return

    const parsedAmt = Number(String(newAmount).trim().replace(/,/g, ''))
    if (!parsedAmt || parsedAmt <= 0) {
      setError('Please enter a valid positive payment amount.')
      return
    }

    const newEntry = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: parsedAmt.toFixed(2),
      date: newDate || todayISO(),
      mode: newMode || 'Online / NEFT',
      receipt_no: newReceiptNo.trim(),
      remarks: newRemarks.trim(),
    }

    const updatedList = [...payments, newEntry]
    setSaving(true)
    setError('')
    try {
      await onSavePayments(updatedList)
      setPayments(updatedList)
      resetForm()
      setShowAddForm(false)
    } catch (err) {
      console.error('Failed to save payment installment:', err)
      setError(err?.response?.data?.error || 'Could not save payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePayment = async (paymentId) => {
    if (isReadOnly) return
    if (!window.confirm('Are you sure you want to delete this payment installment entry?')) return

    const updatedList = payments.filter((p) => p.id !== paymentId)
    setSaving(true)
    setError('')
    try {
      await onSavePayments(updatedList)
      setPayments(updatedList)
    } catch (err) {
      console.error('Failed to delete payment installment:', err)
      setError(err?.response?.data?.error || 'Could not delete payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkFullPayment = async () => {
    if (isReadOnly) return
    if (balanceDue <= 0) return

    if (!window.confirm(`Mark full balance of Rs. ${inr(balanceDue)} as received today?`)) return

    const newEntry = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: balanceDue.toFixed(2),
      date: todayISO(),
      mode: 'Online / NEFT',
      receipt_no: '',
      remarks: 'Full settlement',
    }

    const updatedList = [...payments, newEntry]
    setSaving(true)
    setError('')
    try {
      await onSavePayments(updatedList)
      setPayments(updatedList)
    } catch (err) {
      console.error('Failed to mark full payment:', err)
      setError(err?.response?.data?.error || 'Could not record full payment.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} onClose={onClose} title={title} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header Details */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {name || record?.name || 'Demand Note'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Note No: <strong style={{ color: 'var(--text-2)' }}>{noteNo || record?.noteNo || '—'}</strong>
              {record?.cycle_month && (
                <span> &bull; Cycle: <strong style={{ color: 'var(--text-2)' }}>{record.cycle_month}</strong></span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: statusBg,
              color: statusColor,
              border: `1.5px solid ${statusBorder}`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: statusColor,
              }}
            />
            <span>{statusLabel}</span>
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
              Total Assessed
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              Rs. {inr(totalBill)}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: totalPaid > 0 ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${totalPaid > 0 ? '#bbf7d0' : '#e2e8f0'}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: totalPaid > 0 ? '#166534' : '#64748b' }}>
              Total Paid
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: totalPaid > 0 ? '#15803d' : '#334155', marginTop: 4 }}>
              Rs. {inr(totalPaid)}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: balanceDue > 0 ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${balanceDue > 0 ? '#fecaca' : '#bbf7d0'}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: balanceDue > 0 ? '#991b1b' : '#166534' }}>
              Balance Due
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: balanceDue > 0 ? '#dc2626' : '#15803d', marginTop: 4 }}>
              Rs. {inr(balanceDue)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
            <span>Collection Progress: {percentPaid}%</span>
            <span>{payments.length} installment{payments.length !== 1 ? 's' : ''}</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percentPaid}%`,
                height: '100%',
                background: statusKey === 'paid' ? '#22c55e' : statusKey === 'partial' ? '#f59e0b' : '#94a3b8',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* Installments Table */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)' }}>
              Installment History
            </span>

            {!isReadOnly && !showAddForm && (
              <div style={{ display: 'flex', gap: 6 }}>
                {balanceDue > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkFullPayment}
                    disabled={saving}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 9px',
                      borderRadius: 6,
                      border: '1px solid #86efac',
                      background: '#f0fdf4',
                      color: '#15803d',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Mark Fully Paid</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenAddForm(false)}
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 9px',
                    borderRadius: 6,
                    border: '1px solid var(--green-800)',
                    background: 'var(--green-800)',
                    color: '#ffffff',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <span>+ Add Installment</span>
                </button>
              </div>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: '#64748b' }}>
                <th style={{ padding: '8px 12px', width: 40, fontWeight: 700 }}>#</th>
                <th style={{ padding: '8px 12px', width: 95, fontWeight: 700 }}>Date</th>
                <th style={{ padding: '8px 12px', width: 110, fontWeight: 700, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 12px', width: 110, fontWeight: 700 }}>Mode</th>
                <th style={{ padding: '8px 12px', fontWeight: 700 }}>Receipt / Ref No.</th>
                <th style={{ padding: '8px 12px', fontWeight: 700 }}>Remarks</th>
                {!isReadOnly && <th style={{ padding: '8px 12px', width: 50, textAlign: 'center', fontWeight: 700 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p, idx) => (
                <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDMY(p.date) || p.date || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                    Rs. {inr(p.amount)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {p.mode || 'Online'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontFamily: 'monospace', fontSize: 11.5 }}>
                    {p.receipt_no || p.receiptNo || '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 11.5 }}>
                    {p.remarks || '—'}
                  </td>
                  {!isReadOnly && (
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p.id)}
                        disabled={saving}
                        title="Delete installment"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={isReadOnly ? 6 : 7} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                    No payments recorded yet. Click <strong>"+ Add Installment"</strong> to record partial or full payment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add Payment Form */}
        {showAddForm && !isReadOnly && (
          <form
            onSubmit={handleAddPayment}
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                Add New Installment Payment
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                    Payment Amount (Rs.) *
                  </label>
                  {balanceDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setNewAmount(String(balanceDue))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--green-800)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Fill Due (Rs. {inr(balanceDue)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 5000"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-2)' }}>
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12.5,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-2)' }}>
                  Payment Mode
                </label>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12.5,
                    background: '#ffffff',
                  }}
                >
                  <option value="Online / NEFT">Online / NEFT / RTGS</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                  <option value="Demand Draft (DD)">Demand Draft (DD)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-2)' }}>
                  Receipt / UTR / Reference No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR12345678 or Chq #5544"
                  value={newReceiptNo}
                  onChange={(e) => setNewReceiptNo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12.5,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-2)' }}>
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 1st installment paid via Canara Bank"
                value={newRemarks}
                onChange={(e) => setNewRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 12.5,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Btn size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </Btn>
              <Btn size="sm" variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : '✓ Save Payment'}
              </Btn>
            </div>
          </form>
        )}

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <Btn variant="secondary" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
