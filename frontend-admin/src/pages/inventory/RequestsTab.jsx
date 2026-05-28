import { useMemo, useState } from 'react'

import { asList, todayISO } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SelectField,
  Textarea,
  Tabs,
} from '../../components/ui'

export default function RequestsTab({ userRole }) {
  const { isSupervisor, isCaretaker } = useAuth()
  const { refresh: refreshBadges } = useNotifications()
  const [success, setSuccess] = useState('')
  const [requests, setRequests] = useState([])
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState('all')
  const today = todayISO()

  const [newModal, setNewModal] = useState(false)
  const [savingNew, setSavingNew] = useState(false)
  const [form, setForm] = useState({
    items: [{ item: '', quantity_requested: 1 }],
    purpose: '',
    notes: '',
    is_urgent: false,
  })

  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const [issueTarget, setIssueTarget] = useState(null)
  const [issuing, setIssuing] = useState(false)
  const [issueForm, setIssueForm] = useState({
    issued_quantity: 1,
    expected_return_date: '',
    notes: '',
  })

  const [actingId, setActingId] = useState(null)
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [purchaseForm, setPurchaseForm] = useState({
    item_name: '',
    category: '',
    item_type: 'consumable',
    quantity_requested: 1,
    unit: 'pieces',
    estimated_unit_cost: '',
    needed_by: '',
    urgency: 'normal',
    reason: '',
  })

  const canCreate = isSupervisor || isCaretaker
  const canReview = userRole === 'admin'
  const canCreatePurchase = userRole === 'inventory_manager'

  const { run: runAction, error: actionError, clearError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const [reqRes, itemsRes, catRes] = await Promise.all([
      inventoryAPI.getRequests(),
      inventoryAPI.getItems(),
      inventoryAPI.getCategories(),
    ])
    setRequests(asList(reqRes.data))
    setItems(asList(itemsRes.data))
    setCategories(asList(catRes.data))
    return null
  }, [], 'Failed to load requests.')

  const error = actionError || loadError

  const selectedItems = useMemo(
    () =>
      form.items.map((line) => {
        const id = Number(line.item)
        return id ? items.find((it) => Number(it.id) === id) || null : null
      }),
    [form.items, items]
  )

  const pending = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests]
  )
  const approved = useMemo(
    () => requests.filter((r) => r.status === 'approved'),
    [requests]
  )

  const filtered = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((r) => r.status === filter)
  }, [requests, filter])

  const reviewRequest = async (id, action, reason = '') => {
    setActingId(id)
    clearError()
    setSuccess('')
    try {
      const result = await runAction(async () => {
        if (action === 'approve') {
          await inventoryAPI.approveRequest(id)
        } else if (action === 'reject') {
          await inventoryAPI.rejectRequest(id, reason)
        }
        return true
      }, action === 'approve'
        ? 'Cannot approve: Requested quantity is not available in stock.'
        : 'Review failed.')
      if (!result) return
      await reload()
      refreshBadges()
      setRejectTarget(null)
      setRejectReason('')
    } finally {
      setActingId(null)
    }
  }

  const toggleUrgent = async (request) => {
    if (!request) return
    setActingId(request.id)
    clearError()
    try {
      await runAction(async () => {
        await inventoryAPI.markUrgent(request.id, !request.is_urgent)
        await reload()
      }, 'Failed to update urgency.')
    } finally {
      setActingId(null)
    }
  }

  const openIssueModal = (req) => {
    setIssueTarget(req)
    setIssueForm({
      issued_quantity: Number(req.quantity_requested || 1),
      expected_return_date: '',
      notes: '',
    })
  }

  const issueRequest = async () => {
    if (!issueTarget) return
    setIssuing(true)
    clearError()
    setSuccess('')
    try {
      await runAction(async () => {
        const payload = {
          issued_quantity: Number(issueForm.issued_quantity || 0),
          notes: issueForm.notes || '',
        }
        if (issueTarget.item_type === 'asset' && issueForm.expected_return_date) {
          if (issueForm.expected_return_date < today) {
            throw new Error('Expected return date cannot be in the past.')
          }
          payload.expected_return_date = issueForm.expected_return_date
        }
        await inventoryAPI.issueRequest(issueTarget.id, payload)
        setIssueTarget(null)
        await reload()
      }, 'Issue failed.')
    } finally {
      setIssuing(false)
    }
  }

  const createRequest = async () => {
    setSavingNew(true)
    clearError()
    setSuccess('')
    try {
      await runAction(async () => {
        const requestItems = form.items
          .filter((line) => line.item)
          .map((line) => ({
            item: Number(line.item),
            quantity_requested: Number(line.quantity_requested || 1),
          }))
        await inventoryAPI.createRequestBatch({
          items: requestItems,
          purpose: form.purpose,
          notes: form.notes,
          is_urgent: Boolean(form.is_urgent),
        })
        setNewModal(false)
        setForm({
          items: [{ item: '', quantity_requested: 1 }],
          purpose: '',
          notes: '',
          is_urgent: false,
        })
        await reload()
      }, 'Could not create request.')
    } finally {
      setSavingNew(false)
    }
  }

  const createPurchaseRequest = async () => {
    setSavingPurchase(true)
    clearError()
    setSuccess('')
    try {
      await runAction(async () => {
        await inventoryAPI.createPurchaseRequest({
          item_name: purchaseForm.item_name,
          category: purchaseForm.category ? Number(purchaseForm.category) : null,
          item_type: purchaseForm.item_type || 'consumable',
          quantity_requested: Number(purchaseForm.quantity_requested || 1),
          unit: purchaseForm.unit || 'pieces',
          estimated_unit_cost: purchaseForm.estimated_unit_cost ? Number(purchaseForm.estimated_unit_cost) : null,
          needed_by: purchaseForm.needed_by || null,
          urgency: purchaseForm.urgency || 'normal',
          reason: purchaseForm.reason,
        })
        setPurchaseModal(false)
        setPurchaseForm({
          item_name: '',
          category: '',
          item_type: 'consumable',
          quantity_requested: 1,
          unit: 'pieces',
          estimated_unit_cost: '',
          needed_by: '',
          urgency: 'normal',
          reason: '',
        })
        setSuccess('Purchase request submitted to admin.')
        refreshBadges()
      }, 'Could not submit purchase request.')
    } finally {
      setSavingPurchase(false)
    }
  }

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />

      <Card style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>Pending Requests</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canCreatePurchase && (
              <Btn variant="orange" onClick={() => setPurchaseModal(true)}>
                + Purchase Request
              </Btn>
            )}
            {canCreate && <Btn onClick={() => setNewModal(true)}>+ New Request</Btn>}
          </div>
        </div>

        {pending.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No pending requests.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
              gap: 10,
              marginBottom: approved.length ? 14 : 0,
            }}
          >
            {pending.map((r) => {
              const low = Number(r.item_available || 0) < Number(r.quantity_requested || 0)
              return (
                <div
                  key={r.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{r.item_name || 'Item'}</div>
                    {r.is_urgent && <Badge value="urgent" />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    Qty Requested: {r.quantity_requested} {r.item_unit || ''}
                  </div>
                  <div style={{ fontSize: 12, color: low ? '#c2410c' : 'var(--text-2)', marginTop: 2 }}>
                    Available Now: {r.item_available ?? 0} {r.item_unit || ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
                    {r.requester_name || r.requested_by_name || 'Requester'}
                    {r.requester_phone ? ` (${r.requester_phone})` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                    {r.purpose}
                  </div>
                  {canReview && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <Btn
                        size="sm"
                        variant="success"
                        onClick={() => reviewRequest(r.id, 'approve')}
                        disabled={actingId === r.id}
                      >
                        {actingId === r.id ? 'Working...' : 'Approve'}
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        onClick={() => setRejectTarget(r)}
                        disabled={actingId === r.id}
                      >
                        Reject
                      </Btn>
                      <Btn
                        size="sm"
                        variant={r.is_urgent ? 'secondary' : 'orange'}
                        onClick={() => toggleUrgent(r)}
                        disabled={actingId === r.id}
                      >
                        {r.is_urgent ? 'Unmark Urgent' : 'Mark Urgent'}
                      </Btn>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {canReview && approved.length > 0 && (
          <>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Approved - Ready to Issue</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
                gap: 10,
              }}
            >
              {approved.map((r) => (
                <div
                  key={`approved-${r.id}`}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{r.item_name || 'Item'}</div>
                    <Badge value="approved" />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    Qty Requested: {r.quantity_requested} {r.item_unit || ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    Available Now: {r.item_available ?? r.units_remaining ?? 0} {r.item_unit || ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
                    {r.requester_name || r.requested_by_name || 'Requester'}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Btn
                      size="sm"
                      variant="orange"
                      onClick={() => openIssueModal(r)}
                    >
                      Issue Item
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Tabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'approved', label: 'Approved' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'issued', label: 'Issued' },
            ]}
          />
        </div>

        <DataTable
          loading={loading}
          headers={[
            'Requester',
            'Item Code',
            'Item',
            'Qty',
            'Available',
            'Purpose',
            'Status',
            'Requested At',
            'Actions',
          ]}
          rows={filtered.map((r) => [
            r.requester_name || r.requested_by_name || '—',
            r.item_code || '—',
            r.item_name || '—',
            `${r.quantity_requested} ${r.item_unit || ''}`,
            `${r.item_available ?? r.units_remaining ?? 0} ${r.item_unit || ''}`,
            <span key={`purpose-${r.id}`} style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {r.purpose || '—'}
            </span>,
            <Badge key={`st-${r.id}`} value={r.status} />,
            new Date(r.requested_at || r.created_at).toLocaleString('en-IN'),
            canReview && r.status === 'pending' ? (
              <div key={`act-p-${r.id}`} style={{ display: 'flex', gap: 6 }}>
                <Btn
                  size="sm"
                  variant="success"
                  onClick={() => reviewRequest(r.id, 'approve')}
                  disabled={actingId === r.id}
                >
                  Approve
                </Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={() => setRejectTarget(r)}
                  disabled={actingId === r.id}
                >
                  Reject
                </Btn>
                <Btn
                  size="sm"
                  variant={r.is_urgent ? 'secondary' : 'orange'}
                  onClick={() => toggleUrgent(r)}
                  disabled={actingId === r.id}
                >
                  {r.is_urgent ? 'Unmark' : 'Urgent'}
                </Btn>
              </div>
            ) : canReview && r.status === 'approved' ? (
              <Btn key={`act-i-${r.id}`} size="sm" variant="orange" onClick={() => openIssueModal(r)}>
                Issue
              </Btn>
            ) : r.status === 'rejected' && r.rejection_reason ? (
              <span key={`act-r-${r.id}`} style={{ fontSize: 12, color: '#991b1b' }} title={r.rejection_reason}>
                Reason set
              </span>
            ) : (
              '—'
            ),
          ])}
        />
      </Card>

      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Create New Request"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setNewModal(false)}>
              Cancel
            </Btn>
            <Btn onClick={createRequest} disabled={savingNew}>
              {savingNew ? 'Saving...' : 'Submit Request'}
            </Btn>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {form.items.map((line, index) => {
            const selected = selectedItems[index]
            return (
              <div
                key={`request-line-${index}`}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Item {index + 1}</div>
                  {form.items.length > 1 && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          items: p.items.filter((_, lineIndex) => lineIndex !== index),
                        }))
                      }
                    >
                      Remove
                    </Btn>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 10 }}>
                  <Field label="Item" required>
                    <SelectField
                      value={line.item}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          items: p.items.map((current, lineIndex) =>
                            lineIndex === index ? { ...current, item: e.target.value } : current
                          ),
                        }))
                      }
                    >
                      <option value="">Select item</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.available_quantity} {it.unit})
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Quantity" required>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity_requested}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          items: p.items.map((current, lineIndex) =>
                            lineIndex === index
                              ? { ...current, quantity_requested: e.target.value }
                              : current
                          ),
                        }))
                      }
                    />
                  </Field>
                </div>
                {selected && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
                    Available: {selected.available_quantity} {selected.unit} | Type: {selected.item_type}
                  </div>
                )}
              </div>
            )
          })}
          <Btn
            variant="secondary"
            onClick={() =>
              setForm((p) => ({
                ...p,
                items: [...p.items, { item: '', quantity_requested: 1 }],
              }))
            }
          >
            + Add Item
          </Btn>
        </div>
        <Field label="Purpose" required>
          <Input
            value={form.purpose}
            onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
          />
        </Field>
        <Field label="Notes">
          <Input
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={form.is_urgent}
            onChange={(e) =>
              setForm((p) => ({ ...p, is_urgent: e.target.checked }))
            }
          />
          Mark as urgent
        </label>
      </Modal>

      <Modal
        open={purchaseModal}
        onClose={() => setPurchaseModal(false)}
        title="Create Purchase Request"
        width={620}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setPurchaseModal(false)}>
              Cancel
            </Btn>
            <Btn onClick={createPurchaseRequest} disabled={savingPurchase}>
              {savingPurchase ? 'Submitting...' : 'Submit Request'}
            </Btn>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Item / Material Name" required>
            <Input
              value={purchaseForm.item_name}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, item_name: e.target.value }))}
            />
          </Field>
          <Field label="Category">
            <SelectField
              value={purchaseForm.category}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Type">
            <SelectField
              value={purchaseForm.item_type}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, item_type: e.target.value }))}
            >
              <option value="consumable">Consumable</option>
              <option value="asset">Asset</option>
            </SelectField>
          </Field>
          <Field label="Quantity" required>
            <Input
              type="number"
              min="1"
              value={purchaseForm.quantity_requested}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, quantity_requested: e.target.value }))}
            />
          </Field>
          <Field label="Unit">
            <Input
              value={purchaseForm.unit}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, unit: e.target.value }))}
            />
          </Field>
          <Field label="Estimated Unit Cost (INR)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={purchaseForm.estimated_unit_cost}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, estimated_unit_cost: e.target.value }))}
            />
          </Field>
          <Field label="Needed By">
            <Input
              type="date"
              value={purchaseForm.needed_by}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, needed_by: e.target.value }))}
            />
          </Field>
          <Field label="Urgency">
            <SelectField
              value={purchaseForm.urgency}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, urgency: e.target.value }))}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </SelectField>
          </Field>
        </div>
        <Field label="Reason / Justification" required>
          <Textarea
            rows={4}
            value={purchaseForm.reason}
            onChange={(e) => setPurchaseForm((p) => ({ ...p, reason: e.target.value }))}
          />
        </Field>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null)
          setRejectReason('')
        }}
        title={`Reject Request #${rejectTarget?.id || ''}`}
        footer={
          <>
            <Btn
              variant="ghost"
              onClick={() => {
                setRejectTarget(null)
                setRejectReason('')
              }}
            >
              Cancel
            </Btn>
            <Btn
              variant="danger"
              onClick={() => reviewRequest(rejectTarget.id, 'reject', rejectReason)}
              disabled={!rejectReason.trim() || actingId === rejectTarget?.id}
            >
              Reject
            </Btn>
          </>
        }
      >
        <Field label="Reason" required>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
          />
        </Field>
      </Modal>

      <Modal
        open={!!issueTarget}
        onClose={() => setIssueTarget(null)}
        title={`Issue Item - ${issueTarget?.item_name || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setIssueTarget(null)}>
              Cancel
            </Btn>
            <Btn onClick={issueRequest} disabled={issuing}>
              {issuing ? 'Issuing...' : 'Confirm Issue'}
            </Btn>
          </>
        }
      >
        {issueTarget && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              Requested: {issueTarget.quantity_requested} {issueTarget.item_unit || ''} | Available:{' '}
              {issueTarget.item_available ?? issueTarget.units_remaining ?? 0}{' '}
              {issueTarget.item_unit || ''}
            </div>
            <Field label="Issued Quantity" required>
              <Input
                type="number"
                min="1"
                max={issueTarget.item_available ?? undefined}
                value={issueForm.issued_quantity}
                onChange={(e) =>
                  setIssueForm((p) => ({ ...p, issued_quantity: e.target.value }))
                }
              />
            </Field>
            {issueTarget.item_type === 'asset' && (
              <Field label="Expected Return Date">
                <Input
                  type="date"
                  min={today}
                  value={issueForm.expected_return_date}
                  onChange={(e) =>
                    setIssueForm((p) => ({ ...p, expected_return_date: e.target.value }))
                  }
                />
              </Field>
            )}
            <Field label="Notes">
              <Input
                value={issueForm.notes}
                onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  )
}
