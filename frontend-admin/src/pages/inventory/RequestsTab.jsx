import { useEffect, useMemo, useState } from 'react'

import { asList } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
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
  Tabs,
} from '../../components/ui'



export default function RequestsTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requests, setRequests] = useState([])
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [newModal, setNewModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_requested: 1, purpose: '', notes: '', is_urgent: false })
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const canCreate = ['supervisor', 'caretaker'].includes(userRole)
  const canReview = ['admin', 'manager', 'inventory_manager'].includes(userRole)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [reqRes, itemsRes] = await Promise.all([
        inventoryAPI.getRequests(),
        inventoryAPI.getItems(),
      ])
      setRequests(asList(reqRes.data))
      setItems(asList(itemsRes.data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load requests.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const filtered = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((r) => r.status === filter)
  }, [requests, filter])

  const reviewRequest = async (id, action, reason = '') => {
    try {
      await inventoryAPI.reviewRequest(id, { action, rejection_reason: reason })
      await load()
      setRejectTarget(null)
      setRejectReason('')
    } catch (e) {
      setError(e.response?.data?.detail || 'Review failed.')
    }
  }

  const createRequest = async () => {
    setSaving(true)
    try {
      await inventoryAPI.createRequest({
        item: Number(form.item),
        quantity_requested: Number(form.quantity_requested || 1),
        purpose: form.purpose,
        notes: form.notes,
        is_urgent: Boolean(form.is_urgent),
      })
      setNewModal(false)
      setForm({ item: '', quantity_requested: 1, purpose: '', notes: '', is_urgent: false })
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not create request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Pending Requests</div>
          {canCreate && <Btn onClick={() => setNewModal(true)}>+ New Request</Btn>}
        </div>
        {pending.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No pending requests.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {pending.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700 }}>{r.item_name || 'Item'}</div>
                  {r.is_urgent && <Badge value="urgent" />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  Qty: {r.quantity_requested} {r.item_unit || ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
                  {r.requester_name || r.requested_by_name || 'Requester'}
                  {r.requester_phone ? ` (${r.requester_phone})` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{r.purpose}</div>
                {canReview && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <Btn size="sm" variant="success" onClick={() => reviewRequest(r.id, 'approve')}>
                      Approve
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => setRejectTarget(r)}>
                      Reject
                    </Btn>
                  </div>
                )}
              </div>
            ))}
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
              { key: 'approved', label: 'Approved' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'issued', label: 'Issued' },
            ]}
          />
        </div>

        <DataTable
          loading={loading}
          headers={['Requester', 'Item', 'Qty', 'Purpose', 'Status', 'Requested At', 'Actions']}
          rows={filtered.map((r) => [
            r.requester_name || r.requested_by_name || '—',
            r.item_name || '—',
            `${r.quantity_requested} ${r.item_unit || ''}`,
            <span key={`purpose-${r.id}`} style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {r.purpose || '—'}
            </span>,
            <Badge key={`st-${r.id}`} value={r.status} />,
            new Date(r.requested_at || r.created_at).toLocaleString('en-IN'),
            canReview && r.status === 'pending' ? (
              <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="success" onClick={() => reviewRequest(r.id, 'approve')}>
                  Approve
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => setRejectTarget(r)}>
                  Reject
                </Btn>
              </div>
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
            <Btn onClick={createRequest} disabled={saving}>
              {saving ? 'Saving…' : 'Submit Request'}
            </Btn>
          </>
        }
      >
        <Field label="Item" required>
          <SelectField value={form.item} onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))}>
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
            value={form.quantity_requested}
            onChange={(e) => setForm((p) => ({ ...p, quantity_requested: e.target.value }))}
          />
        </Field>
        <Field label="Purpose" required>
          <Input value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))} />
        </Field>
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={form.is_urgent}
            onChange={(e) => setForm((p) => ({ ...p, is_urgent: e.target.checked }))}
          />
          Mark as urgent
        </label>
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
            <Btn variant="danger" onClick={() => reviewRequest(rejectTarget.id, 'reject', rejectReason)}>
              Reject
            </Btn>
          </>
        }
      >
        <Field label="Reason">
          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
