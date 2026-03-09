import { useEffect, useMemo, useState } from 'react'
import { inventoryAPI } from '../../api/inventory'
import { asList } from '../../shared/utils'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  Tabs,
  Textarea,
} from '../../components/ui'

// ── Priority badge colours ────────────────────────────────────────────────────
function PriorityBadge({ value }) {
  const MAP = {
    low:    { bg: '#dcfce7', color: '#166534', text: 'Low' },
    medium: { bg: '#fef9c3', color: '#854d0e', text: 'Medium' },
    high:   { bg: '#fff7ed', color: '#9a3412', text: 'High' },
    urgent: { bg: '#fee2e2', color: '#991b1b', text: '⚡ Urgent' },
  }
  const m = MAP[value] || { bg: '#f3f4f6', color: '#4b5563', text: value }
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 9px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      background: m.bg,
      color: m.color,
      whiteSpace: 'nowrap',
    }}>
      {m.text}
    </span>
  )
}

const STATUS_BADGE_EXTRA = {
  completed: { bg: '#ede9fe', color: '#5b21b6', text: 'Completed' },
}

export default function PurchaseRequestsTab({ userRole }) {
  const isAdmin = userRole === 'admin'

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [requests, setRequests] = useState([])
  const [filter, setFilter]     = useState('all')
  const [actingId, setActingId] = useState(null)

  // Approve modal
  const [approveTarget, setApproveTarget] = useState(null)
  const [approveNotes, setApproveNotes]   = useState('')

  // Reject modal
  const [rejectTarget, setRejectTarget]   = useState(null)
  const [rejectReason, setRejectReason]   = useState('')
  const [rejectNotes, setRejectNotes]     = useState('')

  // Complete modal
  const [completeTarget, setCompleteTarget] = useState(null)
  const [completeNotes, setCompleteNotes]   = useState('')

  // Detail modal
  const [detailTarget, setDetailTarget] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await inventoryAPI.getPurchaseRequests()
      setRequests(asList(res.data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load purchase requests.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((r) => r.status === filter)
  }, [requests, filter])

  const pending   = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const approved  = useMemo(() => requests.filter((r) => r.status === 'approved'), [requests])

  const doReview = async (id, action, extra = {}) => {
    setActingId(id)
    setError('')
    try {
      await inventoryAPI.reviewPurchaseRequest(id, { action, ...extra })
      await load()
      setApproveTarget(null)
      setRejectTarget(null)
      setCompleteTarget(null)
      setApproveNotes('')
      setRejectReason('')
      setRejectNotes('')
      setCompleteNotes('')
    } catch (e) {
      setError(e.response?.data?.detail || `Action "${action}" failed.`)
    } finally {
      setActingId(null)
    }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div>
      <Alert message={error} />

      {/* ── Pending queue ── */}
      {isAdmin && pending.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Pending Purchase Requests</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {pending.length} request{pending.length !== 1 ? 's' : ''} awaiting your review
              </div>
            </div>
            <span style={{ background: '#fff7ed', color: '#c2410c', borderRadius: 99, fontSize: 12, fontWeight: 700, padding: '4px 12px' }}>
              {pending.length} pending
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
            {pending.map((pr) => (
              <div key={pr.id}
                style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: '4px solid #c2410c' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.item_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      by {pr.requested_by_name}
                    </div>
                  </div>
                  <PriorityBadge value={pr.priority} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Quantity</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green-800)' }}>
                      {pr.quantity_required}{pr.unit ? ` ${pr.unit}` : ''}
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Priority</div>
                    <div style={{ marginTop: 2 }}><PriorityBadge value={pr.priority} /></div>
                  </div>
                </div>

                {pr.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, lineHeight: 1.5,
                    background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px' }}>
                    {pr.description}
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
                  Requested {fmtDate(pr.requested_at)}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" variant="success"
                    onClick={() => { setApproveTarget(pr); setApproveNotes('') }}
                    disabled={actingId === pr.id}>
                    Approve
                  </Btn>
                  <Btn size="sm" variant="danger"
                    onClick={() => { setRejectTarget(pr); setRejectReason(''); setRejectNotes('') }}
                    disabled={actingId === pr.id}>
                    Reject
                  </Btn>
                  <Btn size="sm" variant="ghost"
                    onClick={() => setDetailTarget(pr)}>
                    Details
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Approved — ready to complete ── */}
      {isAdmin && approved.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Approved — Awaiting Purchase Completion</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
            {approved.map((pr) => (
              <div key={pr.id}
                style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: '4px solid #16a34a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pr.item_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>by {pr.requested_by_name}</div>
                  </div>
                  <Badge value="approved" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                  {pr.quantity_required}{pr.unit ? ` ${pr.unit}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" style={{ background: '#7c3aed', color: '#fff' }}
                    onClick={() => { setCompleteTarget(pr); setCompleteNotes('') }}
                    disabled={actingId === pr.id}>
                    Mark Completed
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setDetailTarget(pr)}>Details</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Full table with filter ── */}
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>All Purchase Requests</div>
          <Tabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { key: 'all',       label: 'All' },
              { key: 'pending',   label: 'Pending' },
              { key: 'approved',  label: 'Approved' },
              { key: 'rejected',  label: 'Rejected' },
              { key: 'completed', label: 'Completed' },
            ]}
          />
        </div>

        <DataTable
          loading={loading}
          headers={['Item', 'Qty', 'Priority', 'Requested By', 'Requested At', 'Status', 'Actions']}
          rows={filtered.map((pr) => [
            // Item
            <div key={`item-${pr.id}`}>
              <div style={{ fontWeight: 600 }}>{pr.item_name}</div>
              {pr.description && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2,
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pr.description}
                </div>
              )}
            </div>,
            // Qty
            `${pr.quantity_required}${pr.unit ? ` ${pr.unit}` : ''}`,
            // Priority
            <PriorityBadge key={`pri-${pr.id}`} value={pr.priority} />,
            // Requester
            pr.requested_by_name || '—',
            // Date
            fmtDate(pr.requested_at),
            // Status
            <Badge key={`st-${pr.id}`} value={pr.status} />,
            // Actions
            <div key={`act-${pr.id}`} style={{ display: 'flex', gap: 5 }}>
              {isAdmin && pr.status === 'pending' && (
                <>
                  <Btn size="sm" variant="success"
                    onClick={() => { setApproveTarget(pr); setApproveNotes('') }}
                    disabled={actingId === pr.id}>
                    Approve
                  </Btn>
                  <Btn size="sm" variant="danger"
                    onClick={() => { setRejectTarget(pr); setRejectReason(''); setRejectNotes('') }}
                    disabled={actingId === pr.id}>
                    Reject
                  </Btn>
                </>
              )}
              {isAdmin && pr.status === 'approved' && (
                <Btn size="sm" style={{ background: '#7c3aed', color: '#fff' }}
                  onClick={() => { setCompleteTarget(pr); setCompleteNotes('') }}
                  disabled={actingId === pr.id}>
                  Complete
                </Btn>
              )}
              <Btn size="sm" variant="ghost" onClick={() => setDetailTarget(pr)}>View</Btn>
            </div>,
          ])}
          emptyMsg="No purchase requests found."
        />
      </Card>

      {/* ── Approve modal ── */}
      <Modal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title={`Approve Purchase Request — ${approveTarget?.item_name || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setApproveTarget(null)}>Cancel</Btn>
            <Btn variant="success"
              onClick={() => doReview(approveTarget.id, 'approve', { admin_notes: approveNotes })}
              disabled={actingId === approveTarget?.id}>
              {actingId === approveTarget?.id ? 'Approving...' : 'Confirm Approve'}
            </Btn>
          </>
        }
      >
        {approveTarget && (
          <div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{approveTarget.item_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Quantity: {approveTarget.quantity_required}{approveTarget.unit ? ` ${approveTarget.unit}` : ''}
              </div>
              {approveTarget.description && (
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
                  {approveTarget.description}
                </div>
              )}
            </div>
            <Field label="Admin Notes (optional)">
              <Input
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Any notes for the inventory manager..."
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ── Reject modal ── */}
      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); setRejectNotes('') }}
        title={`Reject Purchase Request — ${rejectTarget?.item_name || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason('') }}>Cancel</Btn>
            <Btn variant="danger"
              onClick={() => doReview(rejectTarget.id, 'reject', {
                rejection_reason: rejectReason,
                admin_notes: rejectNotes,
              })}
              disabled={!rejectReason.trim() || actingId === rejectTarget?.id}>
              {actingId === rejectTarget?.id ? 'Rejecting...' : 'Confirm Reject'}
            </Btn>
          </>
        }
      >
        <Field label="Rejection Reason" required>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this request being rejected?"
          />
        </Field>
        <Field label="Admin Notes (optional)">
          <Input
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Additional notes for the manager..."
          />
        </Field>
      </Modal>

      {/* ── Complete modal ── */}
      <Modal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        title={`Mark as Completed — ${completeTarget?.item_name || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setCompleteTarget(null)}>Cancel</Btn>
            <Btn style={{ background: '#7c3aed', color: '#fff' }}
              onClick={() => doReview(completeTarget.id, 'complete', { admin_notes: completeNotes })}
              disabled={actingId === completeTarget?.id}>
              {actingId === completeTarget?.id ? 'Updating...' : 'Mark Completed'}
            </Btn>
          </>
        }
      >
        {completeTarget && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>
              Confirm that <strong>{completeTarget.item_name}</strong> ({completeTarget.quantity_required}
              {completeTarget.unit ? ` ${completeTarget.unit}` : ''}) has been purchased and received.
            </div>
            <Field label="Completion Notes (optional)">
              <Input
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="e.g. Invoice #1234, received from vendor..."
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ── Detail modal ── */}
      <Modal
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={`Purchase Request #${detailTarget?.id || ''}`}
        footer={<Btn variant="ghost" onClick={() => setDetailTarget(null)}>Close</Btn>}
      >
        {detailTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Item Name', detailTarget.item_name],
              ['Quantity', `${detailTarget.quantity_required}${detailTarget.unit ? ` ${detailTarget.unit}` : ''}`],
              ['Priority', <PriorityBadge key="pri" value={detailTarget.priority} />],
              ['Status', <Badge key="st" value={detailTarget.status} />],
              ['Requested By', detailTarget.requested_by_name],
              ['Requested At', fmtDate(detailTarget.requested_at)],
              detailTarget.reviewed_by_name && ['Reviewed By', detailTarget.reviewed_by_name],
              detailTarget.reviewed_at && ['Reviewed At', fmtDate(detailTarget.reviewed_at)],
              detailTarget.completed_at && ['Completed At', fmtDate(detailTarget.completed_at)],
              detailTarget.description && ['Description / Reason', detailTarget.description],
              detailTarget.rejection_reason && ['Rejection Reason', detailTarget.rejection_reason],
              detailTarget.admin_notes && ['Admin Notes', detailTarget.admin_notes],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13 }}>
                <div style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
                <div style={{ color: 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
