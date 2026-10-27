import React, { useState, useEffect } from 'react'
import { Btn, Card, Modal, Spinner } from '../../components/ui'
import ElectricityTemplate from './ElectricityTemplate'
import { buildElectricityNote, inr0, pdfFileName } from './utils'
import PaymentRecordModal from './PaymentRecordModal'

export default function ElectricityEditorModal({
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

  // Reset delete confirmation whenever current contractor changes or modal closes
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

  const note = buildElectricityNote(rec, settings)

  const handleFieldChange = (key, val) => {
    if (isReadOnly) return
    onPatch(rec.id, { [key]: val })
  }

  const handleMeterChange = (index, field, val) => {
    if (isReadOnly) return
    const next = [...(rec.meters || [])]
    next[index] = { ...next[index], [field]: val }
    onPatch(rec.id, { meters: next })
  }

  const handleAddMeter = () => {
    if (isReadOnly) return
    const next = [...(rec.meters || []), { label: '', current: '', previous: '', rate: 9.55 }]
    onPatch(rec.id, { meters: next })
  }

  const handleRemoveMeter = (index) => {
    if (isReadOnly || (rec.meters || []).length <= 1) return
    const next = (rec.meters || []).filter((_, i) => i !== index)
    onPatch(rec.id, { meters: next })
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
          filename: `${pdfFileName(rec.noteNo, settings.headline, note.toLine || rec.name)}.pdf`,
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

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 13,
    background: isReadOnly ? 'var(--surface-2)' : '#fff',
    cursor: isReadOnly ? 'not-allowed' : 'text',
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
            {pdfBusy ? 'Generating PDF...' : '⬇ Download PDF'}
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
                Delete Contractor
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
                Contractor Name
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={rec.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                To Line (Under "To," in note)
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                placeholder={rec.name}
                value={rec.toLine || ''}
                onChange={(e) => handleFieldChange('toLine', e.target.value)}
                style={inputStyle}
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
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Period Type: Month or Date Range */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                Billing Period Type
              </label>
              <div style={{ display: 'flex', gap: 14 }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: isReadOnly ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="radio"
                    name="periodType"
                    value="month"
                    disabled={isReadOnly}
                    checked={rec.periodType !== 'range'}
                    onChange={() => handleFieldChange('periodType', 'month')}
                  />
                  Month
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: isReadOnly ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="radio"
                    name="periodType"
                    value="range"
                    disabled={isReadOnly}
                    checked={rec.periodType === 'range'}
                    onChange={() => handleFieldChange('periodType', 'range')}
                  />
                  Date Range
                </label>
              </div>
            </div>

            {rec.periodType === 'range' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    From Date
                  </label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={rec.from || rec.from_date || ''}
                    onChange={(e) => handleFieldChange('from', e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    To Date
                  </label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={rec.to || rec.to_date || ''}
                    onChange={(e) => handleFieldChange('to', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            ) : (
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
                    style={inputStyle}
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
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                Intro Text (Above table)
              </label>
              <textarea
                rows={2}
                disabled={isReadOnly}
                value={rec.intro}
                onChange={(e) => handleFieldChange('intro', e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: isReadOnly ? 'not-allowed' : 'text',
                }}
              />
            </div>

            {/* Meters List */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Meters ({(rec.meters || []).length})</span>
                {!isReadOnly && (
                  <Btn variant="ghost" onClick={handleAddMeter} style={{ fontSize: 11, padding: '4px 8px' }}>
                    + Add Meter
                  </Btn>
                )}
              </div>

              {(rec.meters || []).map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: 10,
                    marginBottom: 10,
                    borderRadius: 8,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      placeholder="Meter label (e.g. Student Lounge)"
                      value={m.label || ''}
                      onChange={(e) => handleMeterChange(i, 'label', e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        fontSize: 12,
                        fontWeight: 600,
                        background: isReadOnly ? 'transparent' : '#fff',
                        cursor: isReadOnly ? 'not-allowed' : 'text',
                      }}
                    />
                    {!isReadOnly && (rec.meters || []).length > 1 && (
                      <button
                        onClick={() => handleRemoveMeter(i)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, marginLeft: 8 }}
                        title="Remove meter"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Current</span>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        placeholder="Current"
                        value={m.current || ''}
                        onChange={(e) => handleMeterChange(i, 'current', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: isReadOnly ? '1px solid var(--border)' : '1px solid #f59e0b',
                          background: isReadOnly ? 'var(--surface-2)' : '#fef3c7',
                          fontSize: 12,
                          cursor: isReadOnly ? 'not-allowed' : 'text',
                        }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Previous</span>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        placeholder="Previous"
                        value={m.previous || ''}
                        onChange={(e) => handleMeterChange(i, 'previous', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: isReadOnly ? '1px solid var(--border)' : '1px solid #f59e0b',
                          background: isReadOnly ? 'var(--surface-2)' : '#fef3c7',
                          fontSize: 12,
                          cursor: isReadOnly ? 'not-allowed' : 'text',
                        }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Rate</span>
                      <input
                        type="number"
                        step="0.01"
                        disabled={isReadOnly}
                        placeholder="Rate"
                        value={m.rate || 9.55}
                        onChange={(e) => handleMeterChange(i, 'rate', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          background: isReadOnly ? 'var(--surface-2)' : '#fff',
                          cursor: isReadOnly ? 'not-allowed' : 'text',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Calculated:</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-900)' }}>
                ₹ {inr0(note.total)}
              </div>
            </div>

            {/* Payment Record Card */}
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
                <span>Paid: <strong>Rs. {inr0(rec.totalPaid || 0)}</strong></span>
                <span>Due: <strong style={{ color: Number(rec.balanceDue) > 0 ? '#dc2626' : '#15803d' }}>Rs. {inr0(rec.balanceDue != null ? rec.balanceDue : note.total)}</strong></span>
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
          </div>
        </Card>

        {/* Right: Live Preview */}
        <div style={{ overflowX: 'auto', background: '#f1f5f9', padding: 16, borderRadius: 12, border: '1px solid var(--border)', maxHeight: '82vh', overflowY: 'auto' }}>
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', marginBottom: -100 }}>
            <ElectricityTemplate note={note} />
          </div>
        </div>
      </div>

      {/* Payment Record Modal */}
      {isPaymentOpen && (
        <PaymentRecordModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          record={rec}
          title="Contractor Payment Record"
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
