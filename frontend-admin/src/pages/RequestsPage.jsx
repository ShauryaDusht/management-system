import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui'

import { inventoryAPI } from '../api/inventory'

const REQUESTER_ROLES = ['caretaker', 'supervisor']
const MANAGER_ROLES = ['admin', 'inventory_manager']
const PAGE_SIZE = 10

const EMPTY_FORM = {
  item: '',
  quantity_requested: '',
  reason: '',
  notes: '',
}

function normalizeList(payload) {
  return payload?.results ?? payload ?? []
}

function timeAgo(value) {
  if (!value) return '—'
  const created = new Date(value)
  const now = new Date()
  const diffMs = Math.max(0, now - created)
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export default function RequestsPage() {
  const { user } = useAuth()
  const role = user?.role || ''
  const isManagerView = MANAGER_ROLES.includes(role)
  const isRequesterView = REQUESTER_ROLES.includes(role) || !isManagerView

  const [requests, setRequests] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [tab, setTab] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [rejectReasons, setRejectReasons] = useState({})
  const [busyId, setBusyId] = useState(null)

  const [newModalOpen, setNewModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [rejectConfirmId, setRejectConfirmId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [requestsRes, itemsRes] = await Promise.all([
        inventoryAPI.getRequests(),
        inventoryAPI.getItems(),
      ])
      setRequests(normalizeList(requestsRes.data))
      setItems(normalizeList(itemsRes.data))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load requests.')
      setRequests([])
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setCurrentPage(1) }, [tab])

  const openNewRequestModal = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setNewModalOpen(true)
  }

  const onFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const selectedItem = items.find((item) => String(item.id) === String(form.item))

  const submitNewRequest = async () => {
    if (!form.item || !form.quantity_requested || !form.reason.trim()) {
      setFormError('Item, quantity, and reason are required.')
      return
    }
    const requestedQty = Number(form.quantity_requested)
    if (requestedQty <= 0) {
      setFormError('Quantity must be greater than 0.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await inventoryAPI.createRequest({
        item: Number(form.item),
        quantity_requested: requestedQty,
        reason: form.reason.trim(),
        notes: form.notes.trim(),
      })
      setNotice('Request submitted successfully.')
      setNewModalOpen(false)
      await loadData()
    } catch (err) {
      const data = err.response?.data
      setFormError(data ? JSON.stringify(data) : 'Unable to submit request.')
    } finally {
      setSaving(false)
    }
  }

  const onApprove = async (id) => {
    setBusyId(`approve:${id}`)
    setNotice('')
    try {
      await inventoryAPI.approveRequest(id)
      setNotice('Request approved successfully.')
      await loadData()
    } catch (err) {
      setNotice(err.response?.data?.error || 'Approve action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const onRejectConfirm = async () => {
    const id = rejectConfirmId
    if (!id) return
    setBusyId(`reject:${id}`)
    setNotice('')
    setRejectConfirmId(null)
    try {
      await inventoryAPI.rejectRequest(id, rejectReasons[id] || '')
      setRejectReasons((prev) => ({ ...prev, [id]: '' }))
      setNotice('Request rejected.')
      await loadData()
    } catch (err) {
      setNotice(err.response?.data?.error || 'Reject action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleUrgent = async (itemRequest) => {
    const next = !itemRequest.is_urgent
    setBusyId(`urgent:${itemRequest.id}`)
    try {
      await inventoryAPI.markUrgent(itemRequest.id, next)
      setRequests((prev) => prev.map((req) =>
        req.id === itemRequest.id ? { ...req, is_urgent: next } : req
      ))
    } finally {
      setBusyId(null)
    }
  }

  const pendingRequests = useMemo(
    () => requests.filter((req) => req.status === 'pending'),
    [requests],
  )

  const filteredRequests = useMemo(() => {
    if (tab === 'all') return requests
    return requests.filter((req) => req.status === tab)
  }, [requests, tab])

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE))
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRequests.slice(start, start + PAGE_SIZE)
  }, [filteredRequests, currentPage])

  if (loading) {
    return <Layout><div className="flex justify-center py-24"><Spinner /></div></Layout>
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Requests</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isManagerView ? 'Review and process inventory requests' : 'Track your request status'}
            </p>
          </div>
          {isRequesterView && (
            <Button onClick={openNewRequestModal}>+ New Request</Button>
          )}
        </div>

        {error && <Alert message={error} />}
        {notice && <Alert type="info" message={notice} />}

        {isRequesterView && (
          <div className="space-y-4 mt-4">
            {requests.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No requests found.
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{req.item_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {req.quantity_requested} {req.item_unit} • {new Date(req.created_at || req.requested_at).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <StatusBadge value={req.status} />
                  </div>
                  <p className="text-sm text-slate-700 mt-3">{req.reason || req.purpose}</p>
                  {req.notes && <p className="text-xs text-slate-500 mt-2">Notes: {req.notes}</p>}
                  {req.status === 'rejected' && req.rejection_reason && (
                    <p className="text-xs text-red-600 mt-2">Rejection reason: {req.rejection_reason}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {isManagerView && (
          <>
            <div className="mt-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Pending Requests</h2>
              {pendingRequests.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  No pending requests.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((req) => {
                    const lowStock = req.item_available <= req.item_threshold
                    const approving = busyId === `approve:${req.id}`
                    const rejecting = busyId === `reject:${req.id}`
                    const busy = approving || rejecting
                    return (
                      <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{req.requester_name}</p>
                            <p className="text-xs text-slate-500">{req.requester_phone || 'No phone'} • {timeAgo(req.created_at || req.requested_at)}</p>
                          </div>
                          <StatusBadge value={req.status} />
                        </div>

                        <div className="mt-3">
                          <p className="text-sm font-medium text-slate-900">{req.item_name}</p>
                          <p className="text-xs text-slate-500">{req.item_description || 'No description available'}</p>
                          <p className="text-sm text-slate-700 mt-1">
                            Requested: <span className="font-semibold">{req.quantity_requested} {req.item_unit}</span>
                          </p>
                          <p className={`text-xs mt-1 ${lowStock ? 'text-amber-600' : 'text-slate-500'}`}>
                            Stock: {req.item_available} {req.item_unit}{lowStock ? ' • Low Stock' : ''}
                          </p>
                          <p className="text-sm text-slate-700 mt-2">{req.reason || req.purpose}</p>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <input
                            id={`urgent-${req.id}`}
                            type="checkbox"
                            checked={Boolean(req.is_urgent)}
                            onChange={() => onToggleUrgent(req)}
                            disabled={busyId === `urgent:${req.id}`}
                            className="rounded border-slate-300"
                          />
                          <label htmlFor={`urgent-${req.id}`} className="text-sm text-slate-600">Mark as Urgent</label>
                        </div>

                        <div className="mt-3 flex flex-col md:flex-row gap-2">
                          <Input
                            placeholder="Rejection reason (optional)"
                            value={rejectReasons[req.id] || ''}
                            onChange={(event) => setRejectReasons((prev) => ({ ...prev, [req.id]: event.target.value }))}
                          />
                          <Button
                            variant="outline"
                            className="md:w-28"
                            disabled={busy}
                            onClick={() => setRejectConfirmId(req.id)}
                          >
                            {rejecting ? '…' : 'REJECT'}
                          </Button>
                          <Button
                            variant="success"
                            className="md:w-32"
                            disabled={busy}
                            onClick={() => onApprove(req.id)}
                          >
                            {approving ? '…' : 'APPROVE'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'approved', label: 'Approved' },
                  { key: 'rejected', label: 'Rejected' },
                ].map((tabOption) => (
                  <button
                    key={tabOption.key}
                    type="button"
                    onClick={() => setTab(tabOption.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      tab === tabOption.key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {tabOption.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Requester', 'Item', 'Qty', 'Status', 'Date', 'Reviewed By'].map((header) => (
                          <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No requests found.</td>
                        </tr>
                      ) : (
                        paginatedRequests.map((req) => (
                          <tr key={req.id} className="border-b border-slate-50">
                            <td className="px-4 py-3 text-slate-700">{req.requester_name}</td>
                            <td className="px-4 py-3 text-slate-700">{req.item_name}</td>
                            <td className="px-4 py-3 text-slate-700">{req.quantity_requested} {req.item_unit}</td>
                            <td className="px-4 py-3"><StatusBadge value={req.status} /></td>
                            <td className="px-4 py-3 text-slate-500">{new Date(req.created_at || req.requested_at).toLocaleDateString('en-IN')}</td>
                            <td className="px-4 py-3 text-slate-500">{req.reviewed_by_name || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {filteredRequests.length > PAGE_SIZE && (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </Button>
                  <span className="text-sm text-slate-500">Page {currentPage} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Request Modal */}
      <Modal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        title="New Request"
        footer={(
          <>
            <Button variant="outline" onClick={() => setNewModalOpen(false)}>Cancel</Button>
            <Button onClick={submitNewRequest} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {formError && <Alert message={formError} />}
          <Field label="Item">
            <Select name="item" value={form.item} onChange={onFormChange}>
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.available_quantity} {item.unit} available)
                </option>
              ))}
            </Select>
          </Field>
          {selectedItem && (
            <p className="text-xs text-slate-500">
              Available: <span className="font-semibold">{selectedItem.available_quantity} {selectedItem.unit}</span>
            </p>
          )}
          <Field label="Quantity Needed">
            <Input type="number" name="quantity_requested" min="1" value={form.quantity_requested} onChange={onFormChange} />
          </Field>
          <Field label="Reason for Request">
            <Textarea name="reason" rows={3} required value={form.reason} onChange={onFormChange} />
          </Field>
          <Field label="Additional Notes">
            <Textarea name="notes" rows={2} value={form.notes} onChange={onFormChange} />
          </Field>
        </div>
      </Modal>

      {/* Reject confirmation modal */}
      <Modal
        open={!!rejectConfirmId}
        onClose={() => setRejectConfirmId(null)}
        title="Confirm Rejection"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRejectConfirmId(null)}>Cancel</Button>
            <Button variant="danger" onClick={onRejectConfirm}>
              Yes, Reject
            </Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to reject this request?
          {rejectReasons[rejectConfirmId] && (
            <span className="block mt-2 text-slate-500">
              Reason: <span className="italic">{rejectReasons[rejectConfirmId]}</span>
            </span>
          )}
        </p>
      </Modal>
    </Layout>
  )
}
