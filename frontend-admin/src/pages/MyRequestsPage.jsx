import { useEffect, useState, useCallback } from 'react'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { Button, Modal, Field, Input, Select, Textarea, Spinner } from '../components/ui'

function Chip({ label, type = 'default' }) {
  const styles = {
    default:  { background: '#f1f5f9', color: '#475569' },
    success:  { background: '#dcfce7', color: '#166534' },
    warning:  { background: '#fef9c3', color: '#854d0e' },
    danger:   { background: '#fee2e2', color: '#991b1b' },
    info:     { background: '#dbeafe', color: '#1e40af' },
  }
  const s = styles[type] || styles.default
  return <span style={{ ...s, display: 'inline-flex', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
}

function timeAgo(v) {
  if (!v) return '—'
  const diffMs = Math.max(0, Date.now() - new Date(v))
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_requested: '', purpose: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, itemRes] = await Promise.all([inventoryAPI.getRequests(), inventoryAPI.getItems()])
      setRequests(reqRes.data.results ?? reqRes.data)
      const all = itemRes.data.results ?? itemRes.data
      setItems(all.filter(i => i.available_quantity > 0))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => { setForm({ item: '', quantity_requested: '', purpose: '' }); setError(''); setModal(true) }
  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  const selectedItem = items.find(i => i.id === Number(form.item))

  const handleSubmit = async () => {
    if (!form.item || !form.quantity_requested || !form.purpose) { setError('All fields are required.'); return }
    if (selectedItem && Number(form.quantity_requested) > selectedItem.available_quantity) {
      setError(`Only ${selectedItem.available_quantity} ${selectedItem.unit} available.`); return
    }
    setSaving(true); setError('')
    try {
      await inventoryAPI.createRequest({ item: Number(form.item), quantity_requested: Number(form.quantity_requested), purpose: form.purpose })
      setModal(false); setSuccess('Request submitted successfully!'); load()
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Something went wrong.')
    } finally { setSaving(false) }
  }

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'issued', label: 'Issued' },
    { key: 'rejected', label: 'Rejected' },
  ]
  const filtered = activeTab === 'all' ? requests : requests.filter(r => r.status === activeTab)
  const counts = { pending: requests.filter(r => r.status === 'pending').length, issued: requests.filter(r => r.status === 'issued').length }

  const statusType = { pending: 'warning', approved: 'info', issued: 'success', rejected: 'danger' }

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)', borderRadius: 16, padding: '20px 28px', margin: '16px 0 0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>📋</span>
                  <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>My Requests</h1>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>
                  {counts.pending} pending · {counts.issued} issued · {requests.length} total
                </p>
              </div>
              <button onClick={openModal}
                style={{ background: '#c2622a', border: 'none', color: 'white', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + New Request
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 0 0' }}>
            {tabs.map(tab => {
              const count = tab.key === 'all' ? requests.length : requests.filter(r => r.status === tab.key).length
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
                    borderBottom: activeTab === tab.key ? '2px solid #4d7c5a' : '2px solid transparent',
                    color: activeTab === tab.key ? '#2d5a46' : '#64748b', transition: 'all 0.15s' }}>
                  {tab.label} {count > 0 && <span style={{ background: activeTab === tab.key ? '#4d7c5a' : '#e2e8f0', color: activeTab === tab.key ? 'white' : '#64748b', fontSize: 10, padding: '1px 6px', borderRadius: 99, marginLeft: 4 }}>{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>

          {success && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '12px 16px', color: '#065f46', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
              ✅ {success}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '56px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '0 0 6px' }}>No requests here</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
                {activeTab === 'all' ? "You haven't made any requests yet." : `No ${activeTab} requests.`}
              </p>
              <button onClick={openModal}
                style={{ background: '#4d7c5a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + New Request
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(req => (
                <div key={req.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{req.item_name}</span>
                        {req.is_urgent && <Chip label="🔴 Urgent" type="danger" />}
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>REQ-{req.id}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: '#4d7c5a', fontWeight: 700 }}>{req.quantity_requested} {req.item_unit}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>📅 {timeAgo(req.requested_at || req.created_at)}</span>
                        {req.reviewed_by_name && <span style={{ fontSize: 12, color: '#94a3b8' }}>👤 Reviewed by {req.reviewed_by_name}</span>}
                      </div>
                    </div>
                    <Chip label={req.status?.charAt(0).toUpperCase() + req.status?.slice(1)} type={statusType[req.status] || 'default'} />
                  </div>

                  {req.purpose && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #4d7c5a' }}>
                      <p style={{ fontSize: 12, color: '#475569', margin: 0 }}><span style={{ fontWeight: 600 }}>Purpose: </span>{req.purpose}</p>
                    </div>
                  )}

                  {req.status === 'rejected' && req.rejection_reason && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#fef2f2', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
                      <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}><span style={{ fontWeight: 600 }}>Rejection reason: </span>{req.rejection_reason}</p>
                    </div>
                  )}

                  {req.status === 'issued' && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#ecfdf5', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                      <p style={{ fontSize: 12, color: '#065f46', margin: 0 }}>✅ Item has been issued. Please finalize usage when done.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Request Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="📋 New Inventory Request"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Submitting…' : 'Submit Request'}</Button></>}>
        <div className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Field label="Item *">
            <Select name="item" value={form.item} onChange={onChange}>
              <option value="">Select an item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.available_quantity} {i.unit} available)</option>)}
            </Select>
          </Field>
          {selectedItem && (
            <div className="text-xs text-slate-500 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              📦 Available: <strong>{selectedItem.available_quantity} {selectedItem.unit}</strong> · Threshold: {selectedItem.threshold_quantity}
            </div>
          )}
          <Field label={`Quantity * ${selectedItem ? `(max ${selectedItem.available_quantity} ${selectedItem.unit})` : ''}`}>
            <Input name="quantity_requested" type="number" min="1" max={selectedItem?.available_quantity} value={form.quantity_requested} onChange={onChange} placeholder="Enter quantity needed" />
          </Field>
          <Field label="Purpose / Used For *">
            <Textarea name="purpose" value={form.purpose} onChange={onChange} rows={3} placeholder="Describe what you'll use this for, where, and when…" />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
