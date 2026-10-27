import React, { useState, useEffect } from 'react'
import { Btn, Card, Modal, Spinner } from '../../components/ui'
import DemandNoteTemplate from './DemandNoteTemplate'
import { buildNote, inr, pdfFileName, getExpiryStatus } from './utils'
import PaymentRecordModal from './PaymentRecordModal'

export default function ShopEditorModal({
  isOpen,
  onClose,
  records = [],
  currentIndex = 0,
  onNavigate,
  onPatch,
  onDelete,
  settings = {},
  isReadOnly = false,
}) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [countdown, setCountdown] = useState(0)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)

  const rec = records[currentIndex]

  // Reset delete confirmation whenever current shop changes or modal closes
  useEffect(() => {
    setConfirmDeleteId(null)
    setCountdown(0)
  }, [rec?.id, isOpen])

  // Countdown timer for auto-cancel
  useEffect(() => {
    if (!confirmDeleteId) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setConfirmDeleteId(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [confirmDeleteId])

  if (!isOpen || !rec) return null

  const note = buildNote(rec, settings)
  const expiryStatus = getExpiryStatus(rec.expiryDate || rec.expiry_date, settings.expiryAlertDays || 30)

  const handleFieldChange = (key, val) => {
    if (isReadOnly) return
    onPatch(rec.id, { [key]: val })
  }

  const handleExtraChange = (index, field, val) => {
    if (isReadOnly) return
    const next = [...(rec.extras || [])]
    next[index] = { ...next[index], [field]: val }
    onPatch(rec.id, { extras: next })
  }

  const handleAddExtra = () => {
    if (isReadOnly) return
    const next = [...(rec.extras || []), { label: 'Extra charges', amount: '' }]
    onPatch(rec.id, { extras: next })
  }

  const handleRemoveExtra = (index) => {
    if (isReadOnly) return
    const next = (rec.extras || []).filter((_, i) => i !== index)
    onPatch(rec.id, { extras: next })
  }

  const downloadPdf = async () => {
    if (pdfBusy) return
    const el = document.getElementById('demand-note-doc')
    if (!el) return
    setPdfBusy(true)
    const prevShadow = el.style.boxShadow
    try {
      el.style.boxShadow = 'none'
      const { default: html2pdf } = await import('html2pdf.js')
      await html2pdf()
        .set({
          margin: 0,
          filename: `${pdfFileName(rec.noteNo, settings.headline, note.name)}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, scrollX: 0 },
          jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(el)
        .save()
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('Could not generate PDF. Please try Print -> Save as PDF.')
    } finally {
      el.style.boxShadow = prevShadow
      setPdfBusy(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={rec.name}
      width={1240}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn
            variant="ghost"
            disabled={currentIndex <= 0}
            onClick={() => onNavigate(currentIndex - 1)}
          >
            ← Previous
          </Btn>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>
            {currentIndex + 1} of {records.length}
          </span>
          <Btn
            variant="ghost"
            disabled={currentIndex >= records.length - 1}
            onClick={() => onNavigate(currentIndex + 1)}
          >
            Next →
          </Btn>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn variant="primary" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? 'Generating PDF...' : 'Download PDF'}
          </Btn>
          {!isReadOnly && (
            confirmDeleteId === rec.id ? (
              <Btn
                variant="danger"
                onClick={() => {
                  setConfirmDeleteId(null)
                  onDelete(rec.id)
                }}
              >
                Confirm Delete ({countdown}s)
              </Btn>
            ) : (
              <Btn
                variant="danger"
                onClick={() => {
                  setConfirmDeleteId(rec.id)
                  setCountdown(4)
                }}
              >
                Delete Shop
              </Btn>
            )
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) minmax(500px, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left: Editor Form */}
        <Card style={{ padding: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isReadOnly && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                View-Only Mode (Admin) — Values cannot be modified
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                Shop Name
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={rec.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  Note No.
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={rec.noteNo}
                  onChange={(e) => handleFieldChange('noteNo', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  Date
                </label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={rec.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  Billing Month (From)
                </label>
                <input
                  type="month"
                  disabled={isReadOnly}
                  value={rec.month}
                  onChange={(e) => handleFieldChange('month', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  To (Optional)
                </label>
                <input
                  type="month"
                  disabled={isReadOnly}
                  value={rec.monthTo || ''}
                  onChange={(e) => handleFieldChange('monthTo', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                  Bill Expiry / Payment Due Date
                </label>
                {expiryStatus.status !== 'none' && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      color: expiryStatus.color,
                      background: expiryStatus.bg,
                      border: `1px solid ${expiryStatus.border}`,
                    }}
                  >
                    {expiryStatus.badgeText}
                  </span>
                )}
              </div>
              <input
                type="date"
                disabled={isReadOnly}
                value={rec.expiryDate || rec.expiry_date || ''}
                onChange={(e) => handleFieldChange('expiryDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: expiryStatus.status === 'expired' ? '1.5px solid #ef4444' : expiryStatus.status === 'expiring' ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                  fontSize: 13,
                  background: '#fff',
                  boxSizing: 'border-box',
                  opacity: isReadOnly ? 0.8 : 1,
                }}
              />
              <div style={{ fontSize: 11, marginTop: 5, color: 'var(--text-3)' }}>
                {expiryStatus.status === 'expired' ? (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>
                    Payment due date passed on {expiryStatus.formattedDate}! Follow up for payment.
                  </span>
                ) : expiryStatus.status === 'expiring' ? (
                  <span style={{ color: '#b45309', fontWeight: 600 }}>
                    Notice: Payment due in {expiryStatus.days} days ({expiryStatus.formattedDate}).
                  </span>
                ) : expiryStatus.status === 'active' ? (
                  <span style={{ color: '#16a34a', fontWeight: 500 }}>
                    Due on {expiryStatus.formattedDate} ({expiryStatus.days} days remaining).
                  </span>
                ) : (
                  <span>Set payment due / expiry date for this billing cycle note.</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="fixed-charges-chk"
                disabled={isReadOnly}
                checked={rec.fixed}
                onChange={(e) => handleFieldChange('fixed', e.target.checked)}
              />
              <label htmlFor="fixed-charges-chk" style={{ fontSize: 13, fontWeight: 600, cursor: isReadOnly ? 'default' : 'pointer' }}>
                Fixed charges only (No meter/units)
              </label>
            </div>

            {rec.fixed ? (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  {rec.name?.includes('(WC)') ? 'Water Charges (Rs.)' : 'Fixed Charges (Rs.)'}
                </label>
                <input
                  type="number"
                  disabled={isReadOnly}
                  value={rec.water}
                  onChange={(e) => handleFieldChange('water', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fef3c7', opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    Units Consumed
                  </label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={rec.units}
                    onChange={(e) => handleFieldChange('units', e.target.value)}
                    placeholder="Enter units"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fef3c7', opacity: isReadOnly ? 0.8 : 1 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    Rate per Unit (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={isReadOnly}
                    value={rec.rate}
                    onChange={(e) => handleFieldChange('rate', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                  />
                </div>
              </div>
            )}

            {!rec.fixed && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  Water Charges (Rs.)
                </label>
                <input
                  type="number"
                  disabled={isReadOnly}
                  value={rec.water}
                  onChange={(e) => handleFieldChange('water', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                Address Lines
              </label>
              <textarea
                rows={3}
                disabled={isReadOnly}
                value={rec.address}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, opacity: isReadOnly ? 0.8 : 1 }}
              />
            </div>

            {/* Extras section */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>Extra Charges</span>
                {!isReadOnly && (
                  <Btn variant="ghost" onClick={handleAddExtra} style={{ fontSize: 11, padding: '4px 8px' }}>
                    + Add Extra
                  </Btn>
                )}
              </div>
              {(rec.extras || []).map((ex, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="Description"
                    value={ex.label}
                    onChange={(e) => handleExtraChange(i, 'label', e.target.value)}
                    style={{ flex: 2, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, opacity: isReadOnly ? 0.8 : 1 }}
                  />
                  <input
                    type="number"
                    disabled={isReadOnly}
                    placeholder="Amount"
                    value={ex.amount}
                    onChange={(e) => handleExtraChange(i, 'amount', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, opacity: isReadOnly ? 0.8 : 1 }}
                  />
                  {!isReadOnly && (
                    <button
                      onClick={() => handleRemoveExtra(i)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Calculated:</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: rec.isCancelled ? '#94a3b8' : 'var(--green-900)' }}>
                {rec.isCancelled ? '₹ 0.00 (Cancelled)' : `₹ ${inr(note.total)}`}
              </div>
            </div>

            {/* Payment Record Card */}
            {!rec.isCancelled && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>
                    Payment Record
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      background: rec.paymentStatus === 'paid' ? '#dcfce7' : rec.paymentStatus === 'partially_paid' ? '#fef3c7' : '#f1f5f9',
                      color: rec.paymentStatus === 'paid' ? '#15803d' : rec.paymentStatus === 'partially_paid' ? '#b45309' : '#64748b',
                      border: `1px solid ${rec.paymentStatus === 'paid' ? '#86efac' : rec.paymentStatus === 'partially_paid' ? '#fde68a' : '#cbd5e1'}`,
                    }}
                  >
                    {rec.paymentStatus === 'paid' ? 'Fully Paid' : rec.paymentStatus === 'partially_paid' ? 'Partially Paid' : 'Unpaid'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
                  <span>Paid: <strong>Rs. {inr(rec.totalPaid || 0)}</strong></span>
                  <span>Due: <strong style={{ color: Number(rec.balanceDue) > 0 ? '#dc2626' : '#15803d' }}>Rs. {inr(rec.balanceDue != null ? rec.balanceDue : note.total)}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPaymentOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <span>Manage Payment & Installments</span>
                </button>
              </div>
            )}

            {/* Cancel / Restore demand note for this cycle */}
            {rec.isCancelled ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: '#fee2e2',
                  border: '1.5px solid #fca5a5',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>
                  Demand Note Cancelled for this Cycle
                </div>
                <div style={{ fontSize: 11.5, color: '#7f1d1d' }}>
                  This shop was closed or reading was unavailable. Note No. has been shifted to subsequent shops without gaps.
                </div>
                {!isReadOnly && (
                  <Btn
                    variant="secondary"
                    size="sm"
                    onClick={() => handleFieldChange('isCancelled', false)}
                    style={{ alignSelf: 'flex-start', color: '#15803d', borderColor: '#86efac', fontWeight: 700 }}
                  >
                    Restore Demand Note
                  </Btn>
                )}
              </div>
            ) : !isReadOnly ? (
              <div style={{ paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to cancel the demand note for "${rec.name}" for this billing cycle?\n\nIts Note No. (${rec.noteNo || 'current'}) will automatically be assigned to the next shop so there are no number gaps.`)) {
                      handleFieldChange('isCancelled', true)
                    }
                  }}
                  style={{
                    width: '100%',
                    color: '#dc2626',
                    background: '#fef2f2',
                    border: '1.5px dashed #fca5a5',
                    fontWeight: 600,
                    padding: '8px 12px',
                    fontSize: 12,
                  }}
                >
                  Cancel Demand Note (Shop Closed / No Reading)
                </Btn>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Right: Live Preview */}
        <div
          style={{
            overflowX: 'auto',
            background: '#f1f5f9',
            padding: '16px 16px 32px 16px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            maxHeight: '82vh',
            overflowY: 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 675,
              flexShrink: 0,
              transformOrigin: 'top left',
              transform: 'scale(0.85)',
              marginBottom: -100,
              margin: '0 auto',
            }}
          >
            <DemandNoteTemplate note={note} />
          </div>
        </div>
      </div>

      {/* Payment Record Modal */}
      {isPaymentOpen && (
        <PaymentRecordModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          record={rec}
          title="Shop Payment Record"
          name={rec?.name}
          noteNo={rec?.noteNo}
          totalAmount={note.total}
          onSavePayments={async (newPayments) => {
            await onPatch(rec.id, { payments: newPayments })
          }}
          isReadOnly={isReadOnly}
        />
      )}
    </Modal>
  )
}
