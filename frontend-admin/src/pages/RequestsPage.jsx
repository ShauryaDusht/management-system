import { useEffect, useState, useCallback } from 'react'
import { inventoryAPI } from '../api/inventory'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import {
  PageHeader, Button, StatusBadge, Modal,
  Field, Input, Textarea, Alert, Spinner, Table, Select
} from '../components/ui'

export default function RequestsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager'

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')

  // Review modal (approve/reject)
  const [reviewModal, setReviewModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [reviewAction, setReviewAction] = useState('approve')
  const [rejectionReason, setRejectionReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewError, setReviewError] = useState('')

  // Issue modal
  const [issueModal, setIssueModal] = useState(false)
  const [issueQty, setIssueQty] = useState('')
  const [issueNote, setIssueNote] = useState('')
  const [issueError, setIssueError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await inventoryAPI.getRequests()
      let data = res.data.results ?? res.data
      if (filterStatus) data = data.filter((r) => r.status === filterStatus)
      setRequests(data)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const openReview = (req, action) => {
    setSelected(req)
    setReviewAction(action)
    setRejectionReason('')
    setReviewError('')
    setReviewModal(true)
  }

  const openIssue = (req) => {
    setSelected(req)
    setIssueQty(req.quantity_requested)
    setIssueNote('')
    setIssueError('')
    setIssueModal(true)
  }

  const handleReview = async () => {
    setSaving(true)
    setReviewError('')
    try {
      await inventoryAPI.reviewRequest(selected.id, {
        action: reviewAction,
        rejection_reason: rejectionReason,
      })
      setReviewModal(false)
      load()
    } catch (err) {
      const data = err.response?.data
      setReviewError(data?.detail || data?.rejection_reason || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleIssue = async () => {
    setSaving(true)
    setIssueError('')
    try {
      await inventoryAPI.issueRequest(selected.id, {
        issued_quantity: Number(issueQty),
        notes: issueNote,
      })
      setIssueModal(false)
      load()
    } catch (err) {
      setIssueError(err.response?.data?.detail || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  const columns = [
    { key: 'id', label: '#', render: (r) => <span className="text-slate-400 text-xs">#{r.id}</span> },
    { key: 'item_name', label: 'Item', render: (r) => <span className="font-medium text-slate-900">{r.item_name}</span> },
    { key: 'requested_by_name', label: 'Supervisor' },
    { key: 'quantity_requested', label: 'Qty', align: 'right', render: (r) => `${r.quantity_requested} ${r.item_unit}` },
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="text-slate-500 text-xs line-clamp-1 max-w-[180px]">{r.purpose}</span> },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'requested_at', label: 'Requested', render: (r) => <span className="text-xs text-slate-500">{fmt(r.requested_at)}</span> },
    ...(isManager || isAdmin ? [{
      key: 'actions', label: 'Actions', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.status === 'pending' && isManager && (
            <>
              <Button size="sm" variant="success" onClick={() => openReview(r, 'approve')}>Approve</Button>
              <Button size="sm" variant="danger" onClick={() => openReview(r, 'reject')}>Reject</Button>
            </>
          )}
          {r.status === 'approved' && isManager && (
            <Button size="sm" onClick={() => openIssue(r)}>Issue</Button>
          )}
        </div>
      )
    }] : []),
  ]

  const pending = requests.filter((r) => r.status === 'pending').length

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader
          title="Item Requests"
          subtitle={pending > 0 ? `${pending} pending review` : 'All requests'}
        />

        {/* Status filter */}
        <div className="mb-5">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-44">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="issued">Issued</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <Table columns={columns} data={requests} emptyMessage="No requests found." />
        )}
      </div>

      {/* Approve / Reject Modal */}
      <Modal
        open={reviewModal}
        onClose={() => setReviewModal(false)}
        title={reviewAction === 'approve' ? 'Approve Request' : 'Reject Request'}
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewModal(false)}>Cancel</Button>
            <Button
              variant={reviewAction === 'approve' ? 'success' : 'danger'}
              onClick={handleReview}
              disabled={saving}
            >
              {saving ? 'Submitting...' : reviewAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={reviewError} />
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-1">
            <p><span className="font-medium">Item:</span> {selected?.item_name}</p>
            <p><span className="font-medium">Quantity:</span> {selected?.quantity_requested} {selected?.item_unit}</p>
            <p><span className="font-medium">Supervisor:</span> {selected?.requested_by_name}</p>
            <p><span className="font-medium">Purpose:</span> {selected?.purpose}</p>
          </div>
          {reviewAction === 'reject' && (
            <Field label="Reason for rejection *">
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Explain why this request is rejected..."
              />
            </Field>
          )}
        </div>
      </Modal>

      {/* Issue Modal */}
      <Modal
        open={issueModal}
        onClose={() => setIssueModal(false)}
        title="Issue Item"
        footer={
          <>
            <Button variant="outline" onClick={() => setIssueModal(false)}>Cancel</Button>
            <Button onClick={handleIssue} disabled={saving}>
              {saving ? 'Issuing...' : 'Confirm Issue'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={issueError} />
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-1">
            <p><span className="font-medium">Item:</span> {selected?.item_name}</p>
            <p><span className="font-medium">Supervisor:</span> {selected?.requested_by_name}</p>
          </div>
          <Field label="Quantity to Issue *">
            <Input
              type="number"
              min="1"
              max={selected?.quantity_requested}
              value={issueQty}
              onChange={(e) => setIssueQty(e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              rows={2}
              placeholder="Any notes about this issue..."
            />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
