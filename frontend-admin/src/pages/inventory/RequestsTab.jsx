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
import UndoAdjustIssueModal from './UndoAdjustIssueModal'

export default function RequestsTab({ userRole, isSupervisor: isSupervisorProp, isCaretaker: isCaretakerProp, categoryScope = null, excludeCategoryScope = null }) {
  const { isSupervisor: authSupervisor, isCaretaker: authCaretaker, isReadOnly } = useAuth()
  const isSupervisor = isSupervisorProp !== undefined ? isSupervisorProp : authSupervisor
  const isCaretaker = isCaretakerProp !== undefined ? isCaretakerProp : authCaretaker
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
  const [undoModalIssue, setUndoModalIssue] = useState(null)

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
  const canReview = userRole === 'admin' || userRole === 'hk_inventory_manager' || userRole === 'horticulture_manager' || userRole === 'inventory_manager' || userRole === 'technical_assistant'
  const canCreatePurchase = userRole === 'admin' || userRole === 'hk_inventory_manager' || userRole === 'horticulture_manager' || userRole === 'inventory_manager' || userRole === 'technical_assistant'

  const { run: runAction, error: actionError, clearError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const params = {}
    if (categoryScope) params.category = categoryScope
    if (excludeCategoryScope) params.exclude_category = excludeCategoryScope
    const [reqRes, itemsRes, catRes] = await Promise.all([
      inventoryAPI.getRequests(params),
      inventoryAPI.getItems(),
      inventoryAPI.getCategories(),
    ])
    setRequests(asList(reqRes.data))
    setItems(asList(itemsRes.data))
    setCategories(asList(catRes.data))
    return null
  }, [categoryScope, excludeCategoryScope], 'Failed to load requests.')

  const error = actionError || loadError

  const requestableItems = useMemo(() => {
    let list = items
    if (categoryScope) {
      list = list.filter((it) => String(it.category_name || '').trim().toLowerCase() === String(categoryScope).trim().toLowerCase())
    }
    if (excludeCategoryScope) {
      list = list.filter((it) => String(it.category_name || '').trim().toLowerCase() !== String(excludeCategoryScope).trim().toLowerCase())
    }
    return list
  }, [items, categoryScope, excludeCategoryScope])

  const scopedRequests = useMemo(() => {
    let list = requests
    if (categoryScope) {
      list = list.filter((r) => {
        const itemObj = items.find((it) => Number(it.id) === Number(r.item?.id || r.item))
        const cat = r.category_name || r.item_category || itemObj?.category_name || ''
        return String(cat).trim().toLowerCase() === String(categoryScope).trim().toLowerCase()
          || String(cat).toLowerCase().includes('horticulture')
          || String(r.purpose || '').toLowerCase().includes('[horticulture')
      })
    }
    if (excludeCategoryScope) {
      list = list.filter((r) => {
        const itemObj = items.find((it) => Number(it.id) === Number(r.item?.id || r.item))
        const cat = r.category_name || r.item_category || itemObj?.category_name || ''
        const isExcluded = String(cat).trim().toLowerCase() === String(excludeCategoryScope).trim().toLowerCase()
          || String(cat).toLowerCase().includes('horticulture')
          || String(r.purpose || '').toLowerCase().includes('[horticulture')
        return !isExcluded
      })
    }
    return list
  }, [requests, items, categoryScope, excludeCategoryScope])

  const selectedItems = useMemo(
    () =>
      form.items.map((line) => {
        const id = Number(line.item)
        return id ? items.find((it) => Number(it.id) === id) || null : null
      }),
    [form.items, items]
  )

  const pending = useMemo(
    () => scopedRequests.filter((r) => r.status === 'pending' && !r.issue_is_reversed),
    [scopedRequests]
  )
  const approved = useMemo(
    () => scopedRequests.filter((r) => r.status === 'approved'),
    [scopedRequests]
  )

  const filtered = useMemo(() => {
    if (filter === 'all') return scopedRequests
    return scopedRequests.filter((r) => r.status === filter)
  }, [scopedRequests, filter])

  const openPurchaseModal = () => {
    let catId = ''
    if (categoryScope) {
      const match = categories.find((c) => String(c.name || '').trim().toLowerCase() === String(categoryScope).trim().toLowerCase())
      if (match) catId = String(match.id)
    }
    setPurchaseForm((p) => ({ ...p, category: catId || p.category }))
    setPurchaseModal(true)
  }

  const reviewRequest = async (id, _action, reason = '') => {
    setActingId(id)
    clearError()
    setSuccess('')
    try {
      const result = await runAction(async () => {
        await inventoryAPI.rejectRequest(id, reason)
        return true
      }, 'Review failed.')
      if (!result) return
      await reload()
      refreshBadges()
      setRejectTarget(null)
      setRejectReason('')
    } finally {
      setActingId(null)
    }
  }

  const isWithin24Hours = (timestamp) => {
    if (!timestamp) return false
    const time = new Date(timestamp).getTime()
    if (Number.isNaN(time)) return false
    const diffHours = (Date.now() - time) / (1000 * 60 * 60)
    return diffHours >= 0 && diffHours <= 24
  }

  const undoRejectRequest = async (req) => {
    if (!req) return
    setActingId(req.id)
    clearError()
    setSuccess('')
    try {
      const result = await runAction(async () => {
        await inventoryAPI.undoRejectRequest(req.id)
        return true
      }, 'Undo rejection failed.')
      if (!result) return
      await reload()
      refreshBadges()
      setSuccess(`Rejection undone for ${req.item_name || 'item'}. Request restored to pending.`)
    } finally {
      setActingId(null)
    }
  }

  const issueRequest = async (req) => {
    if (!req) return
    setActingId(req.id)
    clearError()
    setSuccess('')
    try {
      const result = await runAction(async () => {
        const payload = {
          issued_quantity: Number(req.quantity_requested || 1),
          notes: '',
        }
        await inventoryAPI.issueRequest(req.id, payload)
        return true
      }, 'Issue failed.')
      if (!result) return
      await reload()
      refreshBadges()
      setSuccess(`Issued ${req.item_name || 'item'} successfully.`)
    } finally {
      setActingId(null)
    }
  }


  const openUndoModalForRequest = async (req) => {
    if (!req) return
    clearError()
    try {
      if (req.issue_id) {
        const res = await inventoryAPI.getIssues({ id: req.issue_id })
        const issueObj = asList(res.data)[0]
        if (issueObj) {
          setUndoModalIssue(issueObj)
          return
        }
      }
      const res = await inventoryAPI.getIssues({ request_id: req.id })
      const issueObj = asList(res.data)[0]
      if (issueObj) {
        setUndoModalIssue(issueObj)
      } else {
        setUndoModalIssue({
          id: req.issue_id,
          request_id: req.id,
          item_name: req.item_name,
          item_code: req.item_code,
          requested_by_name: req.requester_name || req.requested_by_name,
          issued_quantity: req.quantity_requested,
          original_quantity: req.quantity_requested,
          total_consumed: 0,
          item_unit: req.item_unit,
          item_available_quantity: req.item_available ?? req.units_remaining ?? 0,
        })
      }
    } catch {
      // Fallback object
      setUndoModalIssue({
        id: req.issue_id,
        request_id: req.id,
        item_name: req.item_name,
        item_code: req.item_code,
        requested_by_name: req.requester_name || req.requested_by_name,
        issued_quantity: req.quantity_requested,
        original_quantity: req.quantity_requested,
        total_consumed: 0,
        item_unit: req.item_unit,
        item_available_quantity: req.item_available ?? req.units_remaining ?? 0,
      })
    }
  }

  const createRequest = async () => {
    setSavingNew(true)
    clearError()
    setSuccess('')
    try {
      await runAction(async () => {
        const blockedLine = form.items.find((line) => {
          const it = items.find((item) => Number(item.id) === Number(line.item))
          return it?.is_blocked_for_requester
        })
        if (blockedLine) {
          const it = items.find((item) => Number(item.id) === Number(blockedLine.item))
          throw new Error(
            it?.blocked_reason || "Previous item's usage report must be completed before requesting it again."
          )
        }

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
              <Btn variant="orange" disabled={isReadOnly} title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""} onClick={() => !isReadOnly && openPurchaseModal()}>
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
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <Btn
                        size="sm"
                        variant="success"
                        onClick={() => !isReadOnly && issueRequest(r)}
                        disabled={actingId === r.id || isReadOnly}
                        title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""}
                      >
                        {actingId === r.id ? 'Issuing...' : 'Issue Item'}
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        onClick={() => !isReadOnly && setRejectTarget(r)}
                        disabled={actingId === r.id || isReadOnly}
                        title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""}
                      >
                        Reject
                      </Btn>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
                  onClick={() => issueRequest(r)}
                  disabled={actingId === r.id}
                >
                  {actingId === r.id ? 'Issuing...' : 'Issue'}
                </Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={() => setRejectTarget(r)}
                  disabled={actingId === r.id}
                >
                  Reject
                </Btn>
              </div>
            ) : canReview && r.status === 'issued' ? (
              isWithin24Hours(r.issued_at || r.reviewed_at) && !r.is_reversed && !r.already_adjusted ? (
                <Btn
                  key={`act-undo-${r.id}`}
                  size="sm"
                  variant="ghost"
                  style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                  onClick={() => openUndoModalForRequest(r)}
                  disabled={actingId === r.id}
                >
                  Undo / Adjust
                </Btn>
              ) : (
                <span key={`act-final-${r.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Completed
                </span>
              )
            ) : canReview && r.status === 'rejected' ? (
              isWithin24Hours(r.reviewed_at || r.updated_at) && r.can_undo_reject !== false ? (
                <div key={`act-rej-${r.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Btn
                    size="sm"
                    variant="ghost"
                    style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                    onClick={() => undoRejectRequest(r)}
                    disabled={actingId === r.id}
                  >
                    Undo
                  </Btn>
                  {r.rejection_reason && (
                    <span style={{ fontSize: 11, color: '#991b1b' }} title={r.rejection_reason}>
                      Reason set
                    </span>
                  )}
                </div>
              ) : (
                <span key={`act-final-${r.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Closed
                </span>
              )
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
            <Btn
              onClick={createRequest}
              disabled={
                savingNew ||
                form.items.some((line) => {
                  const it = items.find((item) => Number(item.id) === Number(line.item))
                  return it?.is_blocked_for_requester
                })
              }
            >
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
                      {requestableItems.map((it) => (
                        <option
                          key={it.id}
                          value={it.id}
                          disabled={it.is_blocked_for_requester}
                        >
                          {it.name} ({it.available_quantity != null ? `${it.available_quantity} ${it.unit}` : it.unit})
                          {it.is_blocked_for_requester ? ' [Blocked: Pending Usage Report]' : ''}
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
                  <div
                    style={{
                      fontSize: 12,
                      color: selected.is_blocked_for_requester ? 'var(--danger, #dc2626)' : 'var(--text-2)',
                      marginTop: 6,
                      fontWeight: selected.is_blocked_for_requester ? 600 : 'normal',
                    }}
                  >
                    {selected.is_blocked_for_requester ? (
                      <>Blocked: {selected.blocked_reason || "Previous item's usage report must be completed before requesting it again."}</>
                    ) : (
                      <>Available: {selected.available_quantity} {selected.unit} | Type: {selected.item_type}</>
                    )}
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

      <UndoAdjustIssueModal
        open={Boolean(undoModalIssue)}
        issue={undoModalIssue}
        onClose={() => setUndoModalIssue(null)}
        onSuccess={async () => {
          await reload()
          refreshBadges()
          setSuccess('Operation completed successfully. Request state updated.')
        }}
      />
    </div>
  )
}
