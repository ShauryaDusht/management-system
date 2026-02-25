import { useEffect, useState, useCallback } from 'react'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import {
  PageHeader, Button, StatusBadge, Modal,
  Field, Input, Select, Textarea, Alert, Spinner, Table
} from '../components/ui'

export default function MyRequestsPage() {
  const [requests, setRequests] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_requested: '', purpose: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, itemRes] = await Promise.all([
        inventoryAPI.getRequests(),
        inventoryAPI.getItems(),
      ])
      setRequests(reqRes.data.results ?? reqRes.data)
      // Only show items with available stock
      const all = itemRes.data.results ?? itemRes.data
      setItems(all.filter((i) => i.available_quantity > 0))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => {
    setForm({ item: '', quantity_requested: '', purpose: '' })
    setError('')
    setSuccess('')
    setModal(true)
  }

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))
  }

  const selectedItem = items.find((i) => i.id === Number(form.item))

  const handleSubmit = async () => {
    if (!form.item || !form.quantity_requested || !form.purpose) {
      setError('All fields are required.')
      return
    }
    if (selectedItem && Number(form.quantity_requested) > selectedItem.available_quantity) {
      setError(`Only ${selectedItem.available_quantity} ${selectedItem.unit} available.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await inventoryAPI.createRequest({
        item: Number(form.item),
        quantity_requested: Number(form.quantity_requested),
        purpose: form.purpose,
      })
      setModal(false)
      setSuccess('Request submitted successfully!')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  const columns = [
    { key: 'id', label: '#', render: (r) => <span className="text-slate-400 text-xs">#{r.id}</span> },
    { key: 'item_name', label: 'Item', render: (r) => <span className="font-medium text-slate-900">{r.item_name}</span> },
    { key: 'quantity_requested', label: 'Qty', align: 'right', render: (r) => `${r.quantity_requested} ${r.item_unit}` },
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="text-slate-500 text-xs">{r.purpose}</span> },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'rejection_reason', label: 'Note',
      render: (r) => r.rejection_reason
        ? <span className="text-xs text-red-500">{r.rejection_reason}</span>
        : '—'
    },
    { key: 'requested_at', label: 'Requested', render: (r) => <span className="text-xs text-slate-500">{fmt(r.requested_at)}</span> },
  ]

  const pending = requests.filter((r) => r.status === 'pending').length
  const issued = requests.filter((r) => r.status === 'issued').length

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="My Requests"
          subtitle={`${pending} pending · ${issued} issued`}
          action={<Button onClick={openModal}>+ New Request</Button>}
        />

        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <Table
            columns={columns}
            data={requests}
            emptyMessage="You haven't made any requests yet. Click '+ New Request' to get started."
          />
        )}
      </div>

      {/* New Request Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Request an Item"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={error} />
          <Field label="Item *">
            <Select name="item" value={form.item} onChange={handleChange}>
              <option value="">Select an item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.available_quantity} {i.unit} available)
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Quantity * ${selectedItem ? `(max ${selectedItem.available_quantity} ${selectedItem.unit})` : ''}`}>
            <Input
              name="quantity_requested"
              type="number"
              min="1"
              max={selectedItem?.available_quantity}
              value={form.quantity_requested}
              onChange={handleChange}
              placeholder="Enter quantity"
            />
          </Field>
          <Field label="Purpose / Used For *">
            <Textarea
              name="purpose"
              value={form.purpose}
              onChange={handleChange}
              rows={3}
              placeholder="Describe what you'll use this for, where, and when..."
            />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
