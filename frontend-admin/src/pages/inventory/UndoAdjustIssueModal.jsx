import { useEffect, useState } from 'react'
import { Alert, Badge, Btn, Card, Field, Input, Modal, Textarea } from '../../components/ui'
import { inventoryAPI } from '../../api/inventory'

export default function UndoAdjustIssueModal({
  open,
  issue,
  onClose,
  onSuccess,
}) {
  const [action, setAction] = useState('adjustment') // 'reject' | 'adjustment'
  const [newQuantity, setNewQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [adjustments, setAdjustments] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const originalQty = Number(issue?.original_quantity ?? issue?.issued_quantity ?? 0)
  const currentQty = Number(issue?.issued_quantity ?? 0)
  const consumedQty = Number(issue?.total_consumed ?? 0)
  const availableStock = Number(issue?.item_available_quantity ?? 0)
  const unit = issue?.item_unit || 'units'

  const issuedAtTime = issue?.issued_at ? new Date(issue.issued_at).getTime() : null
  const isPast24h = issuedAtTime ? (Date.now() - issuedAtTime) > 24 * 60 * 60 * 1000 : false
  const alreadyAdjusted = adjustments.length > 0 || Boolean(issue?.already_adjusted) || Boolean(issue?.undo_consumed)
  const isRejected = issue?.status === 'rejected'

  const canReverse = !isPast24h && !alreadyAdjusted && !isRejected && consumedQty === 0 && !issue?.returned_at && !issue?.usage_finalized && !issue?.is_reversed
  const canAdjust = !isPast24h && !alreadyAdjusted && !isRejected && !issue?.returned_at && !issue?.usage_finalized && !issue?.is_reversed

  const cannotReverseReason = isPast24h
    ? 'The 24-hour window to adjust or reject this issue has expired.'
    : isRejected
    ? 'This request has already reached the final rejected state.'
    : alreadyAdjusted
    ? 'Only one undo/adjust operation is permitted, and it has already been performed.'
    : consumedQty > 0
    ? `${consumedQty} ${unit} have already been reported as used or consumed. Downstream usage cannot be undone.`
    : issue?.returned_at
    ? 'This asset has already been returned.'
    : issue?.usage_finalized
    ? 'Consumable usage has already been finalized.'
    : issue?.is_reversed
    ? 'This issue has already been reversed or rejected.'
    : ''

  const cannotAdjustReason = isPast24h
    ? 'The 24-hour window to adjust or reject this issue has expired.'
    : isRejected
    ? 'This request has already reached the final rejected state.'
    : alreadyAdjusted
    ? 'Only one undo/adjust operation is permitted, and it has already been performed.'
    : issue?.returned_at
    ? 'This asset has already been returned.'
    : issue?.usage_finalized
    ? 'Consumable usage has already been finalized.'
    : issue?.is_reversed
    ? 'This issue has already been reversed or rejected.'
    : ''

  useEffect(() => {
    if (open && issue) {
      setError('')
      setReason('')
      setNewQuantity(String(currentQty))
      // Default to adjustment (as in the issue adjustment workflow)
      setAction('adjustment')

      // Fetch audit history
      if (issue.id) {
        setLoadingHistory(true)
        inventoryAPI
          .getIssueAdjustments(issue.id)
          .then((res) => {
            setAdjustments(Array.isArray(res.data) ? res.data : [])
          })
          .catch(() => {
            setAdjustments([])
          })
          .finally(() => {
            setLoadingHistory(false)
          })
      }
    }
  }, [open, issue])

  if (!open || !issue) return null

  const numNewQty = Number(newQuantity)
  const qtyDiff = currentQty - numNewQty
  const projectedStockReversal = availableStock + currentQty
  const projectedStockAdjust = availableStock + qtyDiff

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isPast24h) {
      setError('The 24-hour window to adjust or reject this issue has expired.')
      return
    }

    if (alreadyAdjusted) {
      setError('Only one undo/adjust operation is permitted, and it has already been performed.')
      return
    }

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setError('Please provide a reason for this operation.')
      return
    }

    if (action === 'reject' || action === 'reversal') {
      if (!canReverse) {
        setError(cannotReverseReason || 'Cannot reject this request.')
        return
      }
    } else {
      if (!canAdjust) {
        setError(cannotAdjustReason || 'Cannot adjust this issue.')
        return
      }
      if (Number.isNaN(numNewQty) || numNewQty <= 0) {
        setError('Adjusted quantity must be a positive number.')
        return
      }
      if (numNewQty < consumedQty) {
        setError(`Adjusted quantity cannot be less than the ${consumedQty} ${unit} already consumed.`)
        return
      }
      if (numNewQty === currentQty) {
        setError('Adjusted quantity is identical to current issued quantity.')
        return
      }
      if (qtyDiff < 0 && Math.abs(qtyDiff) > availableStock) {
        setError(
          `Insufficient warehouse stock. Additional ${Math.abs(qtyDiff)} ${unit} needed, but only ${availableStock} ${unit} available.`
        )
        return
      }
    }

    setLoading(true)
    try {
      const payload = {
        action: (action === 'reject' || action === 'reversal') ? 'reject' : 'adjustment',
        reason: trimmedReason,
        ...(action === 'adjustment' ? { new_quantity: numNewQty } : {}),
      }
      const response = await inventoryAPI.adjustIssue(issue.id, payload)
      if (onSuccess) {
        onSuccess(response.data)
      }
      onClose()
    } catch (err) {
      const respData = err.response?.data
      const msg =
        respData?.detail ||
        respData?.reason?.[0] ||
        respData?.new_quantity?.[0] ||
        err.message ||
        'Operation failed.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Undo Entire Issue / Adjust Issued Quantity"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Btn variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Btn>
          <Btn
            variant={(action === 'reject' || action === 'reversal') ? 'danger' : 'primary'}
            onClick={handleSubmit}
            disabled={loading || ((action === 'reject' || action === 'reversal') ? !canReverse : !canAdjust)}
          >
            {loading
              ? 'Processing...'
              : (action === 'reject' || action === 'reversal')
              ? 'Confirm Rejection'
              : 'Confirm & Apply'}
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <Alert message={error} />}

        {/* Item & Request Context Banner */}
        <Card style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Item</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{issue.item_name || 'Item'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{issue.item_code || ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Supervisor / Area</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{issue.requested_by_name || 'Requester'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{issue.area_name || 'All Areas'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Original Requested</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 2 }}>
                {originalQty} {unit}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Currently Issued</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--orange-600)', marginTop: 2 }}>
                {currentQty} {unit}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Consumed</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: consumedQty > 0 ? '#16a34a' : 'var(--text-3)', marginTop: 2 }}>
                {consumedQty} {unit}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Warehouse Stock</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 2 }}>
                {availableStock} {unit}
              </div>
            </div>
          </div>
        </Card>

        {/* Action Selection Tabs / Radio Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Card 1: Reject */}
          <div
            onClick={() => canReverse && setAction('reject')}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: `2px solid ${(action === 'reject' || action === 'reversal') ? 'var(--red-600, #dc2626)' : 'var(--border)'}`,
              background: (action === 'reject' || action === 'reversal') ? 'rgba(220, 38, 38, 0.05)' : 'var(--surface)',
              cursor: canReverse ? 'pointer' : 'not-allowed',
              opacity: canReverse ? 1 : 0.6,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input
                type="radio"
                name="undoAction"
                checked={action === 'reject' || action === 'reversal'}
                disabled={!canReverse}
                onChange={() => canReverse && setAction('reject')}
                style={{ cursor: canReverse ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontWeight: 700, fontSize: 14, color: (action === 'reject' || action === 'reversal') ? '#dc2626' : 'var(--text)' }}>
                Reject
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0 22px', lineHeight: 1.4 }}>
              Reject this request, restore all <strong>{currentQty} {unit}</strong> to warehouse stock, and mark the request as Rejected.
            </p>
            {!canReverse && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6, marginLeft: 22, fontWeight: 500 }}>
                ⚠️ {cannotReverseReason}
              </div>
            )}
          </div>

          {/* Card 2: Adjust Issued Quantity */}
          <div
            onClick={() => canAdjust && setAction('adjustment')}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: `2px solid ${action === 'adjustment' ? 'var(--green-700, #15803d)' : 'var(--border)'}`,
              background: action === 'adjustment' ? 'rgba(21, 128, 61, 0.05)' : 'var(--surface)',
              cursor: canAdjust ? 'pointer' : 'not-allowed',
              opacity: canAdjust ? 1 : 0.6,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input
                type="radio"
                name="undoAction"
                checked={action === 'adjustment'}
                disabled={!canAdjust}
                onChange={() => canAdjust && setAction('adjustment')}
                style={{ cursor: canAdjust ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontWeight: 700, fontSize: 14, color: action === 'adjustment' ? '#15803d' : 'var(--text)' }}>
                Adjust Issued Quantity
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0 22px', lineHeight: 1.4 }}>
              Keep the request <strong>Approved & Issued</strong>. Correct the issued quantity (can be increased or decreased according to stock).
            </p>
            {!canAdjust && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6, marginLeft: 22, fontWeight: 500 }}>
                ⚠️ {cannotAdjustReason}
              </div>
            )}
          </div>
        </div>

        {/* Action Detail & Quantity Input */}
        {(action === 'reject' || action === 'reversal') ? (
          <div
            style={{
              background: 'rgba(220, 38, 38, 0.04)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>
              Impact of Rejecting Request:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <li>
                <strong>+{currentQty} {unit}</strong> will be returned to warehouse stock (New stock: <strong>{projectedStockReversal} {unit}</strong>).
              </li>
              <li>
                Request will be marked as <strong>Rejected</strong>.
              </li>
              <li>
                Supervisor will be notified that the request was rejected.
              </li>
            </ul>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={`Adjusted Issued Quantity (${unit}) - can be greater or less than requested`}>
              <Input
                type="number"
                min={consumedQty > 0 ? consumedQty : 0.01}
                step="any"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                placeholder={`Current: ${currentQty} ${unit} (Min: ${consumedQty})`}
              />
            </Field>

            <div
              style={{
                background: 'rgba(21, 128, 61, 0.04)',
                border: '1px solid rgba(21, 128, 61, 0.2)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 4 }}>
                Stock Impact:
              </div>
              <div style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
                {qtyDiff > 0 ? (
                  <span>
                    Returning <strong>+{qtyDiff} {unit}</strong> to warehouse stock. Available stock will become{' '}
                    <strong>{projectedStockAdjust} {unit}</strong>.
                  </span>
                ) : qtyDiff < 0 ? (
                  <span>
                    Deducting <strong>{Math.abs(qtyDiff)} {unit}</strong> from warehouse stock. Available stock will become{' '}
                    <strong>{projectedStockAdjust} {unit}</strong>.
                  </span>
                ) : (
                  <span>No change to issued quantity.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reason Field */}
        <Field label="Reason / Justification (Required for Audit Trail)">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              action === 'reversal'
                ? 'E.g., Approved by mistake, item requested for incorrect block'
                : 'E.g., Supervisor requested 5 brooms but only 3 were physically handed over'
            }
          />
        </Field>

        {/* Audit History Timeline */}
        {adjustments.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
              Previous Audit History for this Issue
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {adjustments.map((adj) => (
                <div
                  key={adj.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--surface-2)',
                    fontSize: 12,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>
                      {adj.action_type === 'reversal' ? 'Approval Undone' : 'Quantity Adjusted'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {new Date(adj.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-2)', marginTop: 2 }}>
                    Prev: {adj.previous_quantity} → New: {adj.new_quantity} (Returned to stock: {adj.quantity_returned_to_stock})
                  </div>
                  {adj.reason && (
                    <div style={{ color: 'var(--text-3)', fontStyle: 'italic', marginTop: 2 }}>
                      Reason: "{adj.reason}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
