import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui'
import { inventoryAPI } from '../api/inventory'

// ── Helpers ───────────────────────────────────────────────────

function normalizeList(payload) { return payload?.results ?? payload ?? [] }

function timeAgo(value) {
  if (!value) return '—'
  const diffMs = Math.max(0, Date.now() - new Date(value))
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CATEGORY_COLORS = ['#4d7c5a', '#c2622a', '#1e6b7a', '#8b5e3c', '#5b6e8c', '#7a4d6b', '#b45309', '#065f46']
const UNITS = ['pieces', 'litres', 'kg', 'metres', 'packets', 'bottles', 'boxes']
const EMPTY_FORM = { name: '', category: '', item_type: 'consumable', unit: 'pieces', total_quantity: '', available_quantity: '', threshold_quantity: '10', unit_cost: '', description: '', location: '' }

// ── Dark Mode Context (local) ─────────────────────────────────

function useDark() {
  const [dark, setDark] = useState(() => localStorage.getItem('inv_dark') === '1')
  const toggle = () => setDark(d => { const n = !d; localStorage.setItem('inv_dark', n ? '1' : '0'); return n })
  return [dark, toggle]
}

// ── Theme tokens (light / dark) ───────────────────────────────

function T(dark) {
  return dark ? {
    bg: '#0f172a', surface: '#1e293b', border: '#334155',
    text: '#f1f5f9', muted: '#94a3b8', subtle: '#64748b',
    hover: '#263548', accent: '#4d7c5a', accentText: '#86efac',
    input: '#1e293b', inputBorder: '#334155', inputText: '#f1f5f9',
  } : {
    bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0',
    text: '#1e293b', muted: '#94a3b8', subtle: '#64748b',
    hover: '#f0fdf4', accent: '#4d7c5a', accentText: '#2d5a46',
    input: '#ffffff', inputBorder: '#e2e8f0', inputText: '#1e293b',
  }
}

// ── Mini Donut Chart ──────────────────────────────────────────

function DonutChart({ segments, size = 130, strokeWidth = 26, label, sublabel, dark }) {
  const t = T(dark)
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const cx = size / 2, cy = size / 2
  const total = segments.reduce((s, sg) => s + (sg.value || 0), 0)
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.border} strokeWidth={strokeWidth} />
      ) : segments.map((seg, i) => {
        const pct = seg.value / total
        const dash = pct * circ
        const off = -offset * circ
        offset += seg.value
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={off} />
      })}
      <text x={cx} y={cy - 6} textAnchor="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px`, fontSize: 18, fontWeight: 800, fill: t.text }}>
        {label}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px`, fontSize: 8, fill: t.muted }}>
        {sublabel}
      </text>
    </svg>
  )
}

// ── Stock Bar ─────────────────────────────────────────────────

function StockBar({ available, total, threshold }) {
  const pct = total > 0 ? (available / total) * 100 : 0
  const color = available === 0 ? '#ef4444' : available <= threshold ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ width: '100%', background: '#e2e8f0', borderRadius: 4, height: 5, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  )
}

// ── Status Chip ───────────────────────────────────────────────

function Chip({ label, type = 'default', dark }) {
  const styles = {
    default:  { bg: '#f1f5f9', color: '#475569' },
    success:  { bg: '#dcfce7', color: '#166534' },
    warning:  { bg: '#fef9c3', color: '#854d0e' },
    danger:   { bg: '#fee2e2', color: '#991b1b' },
    info:     { bg: '#dbeafe', color: '#1e40af' },
    asset:    { bg: '#ede9fe', color: '#5b21b6' },
    pending:  { bg: '#fef9c3', color: '#854d0e' },
    approved: { bg: '#dbeafe', color: '#1e40af' },
    issued:   { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
    dark_default: { bg: '#334155', color: '#94a3b8' },
    dark_success: { bg: '#14532d', color: '#86efac' },
    dark_warning: { bg: '#451a03', color: '#fcd34d' },
    dark_danger:  { bg: '#450a0a', color: '#fca5a5' },
    dark_info:    { bg: '#1e3a5f', color: '#93c5fd' },
    dark_asset:   { bg: '#2e1065', color: '#c4b5fd' },
    dark_pending: { bg: '#451a03', color: '#fcd34d' },
    dark_approved:{ bg: '#1e3a5f', color: '#93c5fd' },
    dark_issued:  { bg: '#14532d', color: '#86efac' },
    dark_rejected:{ bg: '#450a0a', color: '#fca5a5' },
  }
  const key = dark ? `dark_${type}` : type
  const s = styles[key] || styles[dark ? 'dark_default' : 'default']
  return (
    <span style={{ background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function statusChip(item, dark) {
  if (item.available_quantity === 0) return <Chip label="Out of Stock" type="danger" dark={dark} />
  if (item.available_quantity <= item.threshold_quantity) return <Chip label="Low Stock" type="warning" dark={dark} />
  return <Chip label="In Stock" type="success" dark={dark} />
}

function reqChip(status, dark) {
  const map = { pending: 'pending', approved: 'approved', issued: 'issued', rejected: 'rejected' }
  const labels = { pending: 'Pending', approved: 'Approved', issued: 'Issued', rejected: 'Rejected' }
  return <Chip label={labels[status] || status} type={map[status] || 'default'} dark={dark} />
}

// ── Add/Edit Item Modal ───────────────────────────────────────

function ItemModal({ open, onClose, categories, onSaved, editItem, dark }) {
  const t = T(dark)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setForm({
        name: editItem.name || '',
        category: editItem.category || '',
        item_type: editItem.item_type || 'consumable',
        unit: editItem.unit || 'pieces',
        total_quantity: String(editItem.total_quantity || ''),
        available_quantity: String(editItem.available_quantity || ''),
        threshold_quantity: String(editItem.threshold_quantity || '10'),
        unit_cost: editItem.unit_cost != null ? String(editItem.unit_cost) : '',
        description: editItem.description || '',
        location: editItem.location || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
  }, [open, editItem])

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const save = async () => {
    if (!form.name.trim() || !form.category) { setError('Name and category are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name: form.name.trim(),
        category: Number(form.category),
        item_type: form.item_type,
        unit: form.unit,
        total_quantity: Number(form.total_quantity) || 0,
        available_quantity: Number(form.available_quantity) || 0,
        threshold_quantity: Number(form.threshold_quantity) || 10,
        unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        description: form.description,
        location: form.location,
      }
      if (editItem) {
        await inventoryAPI.updateItem(editItem.id, payload)
      } else {
        await inventoryAPI.createItem(payload)
      }
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'Unable to save item.')
    } finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: '8px 12px', border: `1px solid ${t.inputBorder}`, borderRadius: 10, fontSize: 13, background: t.input, color: t.inputText, outline: 'none' }
  const selectStyle = { ...inputStyle }

  return (
    <Modal open={open} onClose={onClose} title={editItem ? '✏️ Edit Item' : '➕ Add New Inventory Item'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editItem ? 'Update Item' : 'Create Item'}</Button></>}
    >
      <div className="space-y-4">
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
        <Field label="Item Name"><Input name="name" value={form.name} onChange={onChange} placeholder="e.g. Floor Cleaner" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <Select name="category" value={form.category} onChange={onChange}>
              <option value="">Select…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select name="item_type" value={form.item_type} onChange={onChange}>
              <option value="consumable">Consumable</option>
              <option value="asset">Asset</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit">
            <Select name="unit" value={form.unit} onChange={onChange}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Unit Cost (₹)"><Input name="unit_cost" type="number" min="0" step="0.01" value={form.unit_cost} onChange={onChange} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Total Qty"><Input name="total_quantity" type="number" min="0" value={form.total_quantity} onChange={onChange} /></Field>
          <Field label="Available Qty"><Input name="available_quantity" type="number" min="0" value={form.available_quantity} onChange={onChange} /></Field>
          <Field label="Alert Threshold"><Input name="threshold_quantity" type="number" min="0" value={form.threshold_quantity} onChange={onChange} /></Field>
        </div>
        <Field label="Storage Location"><Input name="location" value={form.location} onChange={onChange} placeholder="e.g. Main Warehouse, Room B" /></Field>
        <Field label="Description"><Textarea name="description" rows={2} value={form.description} onChange={onChange} /></Field>
      </div>
    </Modal>
  )
}

// ── Category Manager Modal ────────────────────────────────────

function CategoryModal({ open, onClose, categories, onSaved }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setName(''); setDesc(''); setError('') } }, [open])

  const save = async () => {
    if (!name.trim()) { setError('Category name is required.'); return }
    setSaving(true); setError('')
    try {
      await inventoryAPI.createCategory({ name: name.trim(), description: desc.trim() })
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'Unable to create category.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="📁 Add Category"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button></>}
    >
      <div className="space-y-4">
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Existing categories ({categories.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map((c, i) => (
              <span key={c.id} style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {c.name} ({c.item_count || 0})
              </span>
            ))}
          </div>
        </div>
        <Field label="New Category Name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cleaning Supplies" /></Field>
        <Field label="Description (optional)"><Textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description of this category" /></Field>
      </div>
    </Modal>
  )
}

// ── Add Stock Modal ───────────────────────────────────────────

function AddStockModal({ open, onClose, item, onDone }) {
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setQty(''); setNotes(''); setError('') } }, [open])

  const save = async () => {
    if (!qty || Number(qty) <= 0) { setError('Enter a valid quantity.'); return }
    setSaving(true); setError('')
    try {
      await inventoryAPI.createStockEntry({ item: item.id, quantity_added: Number(qty), notes })
      onDone(); onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add stock.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="📦 Add Stock"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Stock'}</Button></>}
    >
      {item && (
        <div className="space-y-4">
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Current stock: <strong>{item.available_quantity} {item.unit}</strong> · Threshold: {item.threshold_quantity}
            </div>
          </div>
          <Field label="Quantity to Add"><Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 50" /></Field>
          <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Received from supplier, March 1" /></Field>
        </div>
      )}
    </Modal>
  )
}

// ── Issue Modal ───────────────────────────────────────────────

function IssueModal({ open, onClose, request, onDone }) {
  const [qty, setQty] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && request) { setQty(String(request.quantity_requested || '')); setDate(''); setNotes(''); setError('') }
  }, [open, request])

  const issue = async () => {
    setSaving(true); setError('')
    try {
      await inventoryAPI.issueRequest(request.id, { issued_quantity: Number(qty), expected_return_date: date || undefined, notes })
      onDone(); onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to issue item.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="📤 Issue Inventory Item"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="success" onClick={issue} disabled={saving}>{saving ? 'Issuing…' : 'Confirm Issue'}</Button></>}
    >
      {request && (
        <div className="space-y-4">
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}><span style={{ color: '#64748b' }}>Item:</span> <strong>{request.item_name}</strong></p>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}><span style={{ color: '#64748b' }}>Requested by:</span> {request.requester_name}</p>
            <p style={{ fontSize: 13, margin: 0 }}><span style={{ color: '#64748b' }}>Purpose:</span> {request.reason || request.purpose}</p>
          </div>
          <Field label="Quantity to Issue"><Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></Field>
          {request.item_type === 'asset' && (
            <Field label="Expected Return Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          )}
          <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  )
}

// ── Review Modal ──────────────────────────────────────────────

function ReviewModal({ open, onClose, request, action, onDone }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])

  const submit = async () => {
    setSaving(true); setError('')
    try {
      await inventoryAPI.reviewRequest(request.id, { action, rejection_reason: reason })
      onDone(); onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Action failed.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={action === 'approve' ? '✅ Approve Request' : '❌ Reject Request'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={action === 'approve' ? 'success' : 'danger'} onClick={submit} disabled={saving}>
          {saving ? 'Processing…' : action === 'approve' ? 'Approve' : 'Reject'}
        </Button></>}
    >
      {request && (
        <div className="space-y-4">
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
            <p style={{ margin: '0 0 4px' }}><span style={{ color: '#64748b' }}>Item:</span> <strong>{request.item_name}</strong></p>
            <p style={{ margin: '0 0 4px' }}><span style={{ color: '#64748b' }}>Qty:</span> {request.quantity_requested} {request.item_unit}</p>
            <p style={{ margin: '0 0 4px' }}><span style={{ color: '#64748b' }}>From:</span> {request.requester_name}</p>
            <p style={{ margin: 0 }}><span style={{ color: '#64748b' }}>Purpose:</span> {request.reason || request.purpose}</p>
          </div>
          {action === 'reject' && (
            <Field label="Rejection Reason (optional)">
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why…" />
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── DELETE CONFIRM MODAL ──────────────────────────────────────

function DeleteModal({ open, onClose, item, onDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setSaving(true); setError('')
    try {
      await inventoryAPI.deleteItem(item.id)
      onDone(); onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Cannot delete item (may have linked records).')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="🗑️ Delete Item"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={confirm} disabled={saving}>{saving ? 'Deleting…' : 'Delete Item'}</Button></>}
    >
      {item && (
        <div className="space-y-3">
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <p style={{ color: '#475569', fontSize: 14 }}>
            Are you sure you want to delete <strong>{item.name}</strong>? This cannot be undone if the item has no linked requests or issues.
          </p>
        </div>
      )}
    </Modal>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────

export default function InventoryAdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [dark, toggleDark] = useDark()
  const t = T(dark)

  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager' || user?.role === 'inventory_manager'
  const canManage = isAdmin || isManager

  // Data
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [requests, setRequests] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)

  // UI
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('') // '' | 'low' | 'out'
  const [activeTab, setActiveTab] = useState('inventory')
  const [notice, setNotice] = useState('')

  // Modals
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [addStockItem, setAddStockItem] = useState(null)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [issueRequest, setIssueRequest] = useState(null)
  const [reviewModal, setReviewModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [itemsR, catsR, reqsR, issuesR] = await Promise.allSettled([
        inventoryAPI.getItems(),
        inventoryAPI.getCategories(),
        inventoryAPI.getRequests(),
        inventoryAPI.getIssues(),
      ])
      if (itemsR.status === 'fulfilled') setItems(normalizeList(itemsR.value.data))
      if (catsR.status === 'fulfilled') setCategories(normalizeList(catsR.value.data))
      if (reqsR.status === 'fulfilled') setRequests(normalizeList(reqsR.value.data))
      if (issuesR.status === 'fulfilled') setIssues(normalizeList(issuesR.value.data))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-dismiss notice
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(t)
  }, [notice])

  // Derived
  const pendingRequests = requests.filter(r => r.status === 'pending')
  const approvedRequests = requests.filter(r => r.status === 'approved')
  const lowStockItems = items.filter(i => i.available_quantity > 0 && i.available_quantity <= i.threshold_quantity)
  const outOfStockItems = items.filter(i => i.available_quantity === 0)
  const totalStock = items.reduce((s, i) => s + i.total_quantity, 0)
  const totalValue = items.reduce((s, i) => s + ((i.unit_cost || 0) * i.available_quantity), 0)

  const filteredItems = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && item.item_type !== typeFilter) return false
    if (catFilter && String(item.category) !== String(catFilter)) return false
    if (stockFilter === 'low' && !(item.available_quantity > 0 && item.available_quantity <= item.threshold_quantity)) return false
    if (stockFilter === 'out' && item.available_quantity !== 0) return false
    return true
  })

  const catBreakdown = categories.map((cat, idx) => ({
    name: cat.name,
    value: items.filter(i => i.category === cat.id).reduce((s, i) => s + i.available_quantity, 0),
    count: items.filter(i => i.category === cat.id).length,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  })).filter(c => c.count > 0)

  // ── Style helpers ──────────────────────────────────────────
  const surface = { background: t.surface, border: `1px solid ${t.border}` }
  const inputStyle = {
    padding: '8px 14px', border: `1px solid ${t.inputBorder}`, borderRadius: 10,
    fontSize: 13, background: t.input, color: t.inputText, outline: 'none',
  }

  if (loading) {
    return <Layout><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner /></div></Layout>
  }

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: t.bg, minHeight: '100vh', transition: 'background 0.2s' }}>

        {/* ── Toast notice ──────────────────────────────── */}
        {notice && (
          <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, background: '#1e293b', color: '#f1f5f9', borderRadius: 12, padding: '12px 20px', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            ✅ {notice}
          </div>
        )}

        {/* ── Header ────────────────────────────────────── */}
        <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '0 28px', transition: 'background 0.2s' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)',
            borderRadius: 16, padding: '20px 28px', margin: '16px 0 0', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 100, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>📦</span>
                  <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}>Inventory Management Portal</h1>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>
                  {items.length} items · ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total value
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Dark mode toggle */}
                <button onClick={toggleDark}
                  style={{ background: dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {dark ? '☀️ Light' : '🌙 Dark'}
                </button>
                {isAdmin && (
                  <button onClick={() => setAddCategoryOpen(true)}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    📁 Add Category
                  </button>
                )}
                <button onClick={() => navigate('/reports')}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📊 Reports
                </button>
                {isAdmin && (
                  <button onClick={() => setAddItemOpen(true)}
                    style={{ background: '#c2622a', border: 'none', color: 'white', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    + Add Item
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', gap: 0, paddingTop: 8, overflowX: 'auto' }}>
            {[
              { key: 'inventory', icon: '📋', label: 'Inventory' },
              { key: 'requests', icon: '🔔', label: `Requests${pendingRequests.length ? ` (${pendingRequests.length})` : ''}` },
              { key: 'transactions', icon: '🔄', label: 'Transactions' },
              { key: 'categories', icon: '📁', label: 'Categories' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', background: 'none', whiteSpace: 'nowrap',
                  borderBottom: activeTab === tab.key ? `2.5px solid #4d7c5a` : '2.5px solid transparent',
                  color: activeTab === tab.key ? (dark ? '#86efac' : '#2d5a46') : t.subtle,
                  transition: 'all 0.15s',
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Stats row ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { icon: '🗂️', label: 'Total Items', value: items.length, onClick: () => { setStockFilter(''); setActiveTab('inventory') } },
              { icon: '⚠️', label: 'Low Stock', value: lowStockItems.length, warn: true, onClick: () => { setStockFilter('low'); setActiveTab('inventory') } },
              { icon: '❌', label: 'Out of Stock', value: outOfStockItems.length, danger: true, onClick: () => { setStockFilter('out'); setActiveTab('inventory') } },
              { icon: '🔔', label: 'Pending', value: pendingRequests.length, warn: pendingRequests.length > 0, onClick: () => setActiveTab('requests') },
              { icon: '💰', label: 'Total Value', value: `₹${(totalValue / 1000).toFixed(0)}K` },
            ].map((s, i) => (
              <div key={i} onClick={s.onClick}
                style={{
                  background: s.danger ? (dark ? '#450a0a' : '#fef2f2') : s.warn ? (dark ? '#451a03' : '#fffbeb') : t.surface,
                  border: `1px solid ${s.danger ? (dark ? '#7f1d1d' : '#fecaca') : s.warn ? (dark ? '#78350f' : '#fed7aa') : t.border}`,
                  borderRadius: 14, padding: '16px 18px', position: 'relative',
                  cursor: s.onClick ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => s.onClick && (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => s.onClick && (e.currentTarget.style.transform = 'none')}
              >
                {(s.warn || s.danger) && s.value > 0 && (
                  <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: s.danger ? '#ef4444' : '#f59e0b' }} />
                )}
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 11, color: t.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.danger ? '#ef4444' : s.warn && (s.value > 0) ? '#f59e0b' : t.text }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ── Main grid ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

            {/* LEFT: tab content */}
            <div>

              {/* ══ INVENTORY TAB ══════════════════════════════ */}
              {activeTab === 'inventory' && (
                <>
                  {/* Filters bar */}
                  <div style={{ ...surface, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="🔍 Search items…"
                      style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={inputStyle}>
                      <option value="">All Types</option>
                      <option value="asset">Assets</option>
                      <option value="consumable">Consumables</option>
                    </select>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={inputStyle}>
                      <option value="">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} style={inputStyle}>
                      <option value="">All Stock</option>
                      <option value="low">⚠️ Low Stock</option>
                      <option value="out">❌ Out of Stock</option>
                    </select>
                    {(search || typeFilter || catFilter || stockFilter) && (
                      <button onClick={() => { setSearch(''); setTypeFilter(''); setCatFilter(''); setStockFilter('') }}
                        style={{ background: 'transparent', color: t.muted, border: 'none', fontSize: 12, cursor: 'pointer', padding: '0 4px' }}>
                        ✕ Clear
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: t.muted, marginLeft: 'auto' }}>{filteredItems.length} items</span>
                  </div>

                  {/* Table */}
                  <div style={{ ...surface, borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h2 style={{ fontSize: 14, fontWeight: 700, color: t.text, margin: 0 }}>📦 Inventory</h2>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {lowStockItems.length > 0 && <Chip label={`⚠️ ${lowStockItems.length} low`} type="warning" dark={dark} />}
                        {outOfStockItems.length > 0 && <Chip label={`❌ ${outOfStockItems.length} out`} type="danger" dark={dark} />}
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: dark ? '#1a2942' : '#f8fafc', borderBottom: `1px solid ${t.border}` }}>
                            {['Item', 'Category', 'Stock', 'Threshold', 'Value', 'Status', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: t.muted }}>
                              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                              No items found{(search || typeFilter || catFilter || stockFilter) ? ' — try clearing filters' : ''}
                            </td></tr>
                          ) : filteredItems.map((item, idx) => {
                            const itemValue = (item.unit_cost || 0) * item.available_quantity
                            return (
                              <tr key={item.id}
                                style={{ borderBottom: `1px solid ${t.border}`, background: idx % 2 === 0 ? t.surface : (dark ? '#1a2535' : '#fafafa'), transition: 'background 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = t.hover}
                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? t.surface : (dark ? '#1a2535' : '#fafafa')}
                              >
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ fontWeight: 600, color: t.text }}>{item.name}</div>
                                  <div style={{ fontSize: 11, color: t.muted, marginTop: 1 }}>
                                    {item.item_type === 'asset' ? '🔧' : '🧴'} {item.unit}
                                    {item.location && <span style={{ marginLeft: 6 }}>· 📍 {item.location}</span>}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <Chip label={item.category_name || 'Uncategorized'} type={item.item_type === 'asset' ? 'asset' : 'info'} dark={dark} />
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ fontWeight: 700, color: item.available_quantity === 0 ? '#ef4444' : item.available_quantity <= item.threshold_quantity ? '#f59e0b' : t.text, marginBottom: 4 }}>
                                    {item.available_quantity.toLocaleString()} {item.unit}
                                  </div>
                                  <StockBar available={item.available_quantity} total={item.total_quantity} threshold={item.threshold_quantity} />
                                </td>
                                <td style={{ padding: '12px 14px', color: t.muted, fontSize: 12 }}>{item.threshold_quantity}</td>
                                <td style={{ padding: '12px 14px', color: itemValue > 0 ? (dark ? '#86efac' : '#065f46') : t.muted, fontWeight: itemValue > 0 ? 700 : 400, fontSize: 12 }}>
                                  {itemValue > 0 ? `₹${itemValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>{statusChip(item, dark)}</td>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {canManage && (
                                      <button onClick={() => setAddStockItem(item)}
                                        style={{ background: dark ? '#14532d' : '#4d7c5a', color: dark ? '#86efac' : 'white', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        + Stock
                                      </button>
                                    )}
                                    <button onClick={() => navigate(`/items/${item.id}/history`)}
                                      style={{ background: dark ? '#1e293b' : '#f1f5f9', color: t.subtle, border: `1px solid ${t.border}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                                      History
                                    </button>
                                    {isAdmin && (
                                      <>
                                        <button onClick={() => setEditItem(item)}
                                          style={{ background: dark ? '#1e3a5f' : '#eff6ff', color: dark ? '#93c5fd' : '#1e40af', border: `1px solid ${dark ? '#1d4ed8' : '#bfdbfe'}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                                          ✏️
                                        </button>
                                        <button onClick={() => setDeleteItem(item)}
                                          style={{ background: 'transparent', color: '#ef4444', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                                          🗑️
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ══ REQUESTS TAB ════════════════════════════════ */}
              {activeTab === 'requests' && (
                <div style={{ ...surface, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: t.text, margin: 0 }}>
                      🔔 Supervisor Requests
                      {pendingRequests.length > 0 && <span style={{ marginLeft: 8, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>{pendingRequests.length} pending</span>}
                    </h2>
                    {approvedRequests.length > 0 && <Chip label={`${approvedRequests.length} ready to issue`} type="success" dark={dark} />}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: dark ? '#1a2942' : '#f8fafc', borderBottom: `1px solid ${t.border}` }}>
                          {['ID', 'Supervisor', 'Item', 'Qty', 'Purpose', 'Status', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {requests.length === 0 ? (
                          <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: t.muted }}>No requests found</td></tr>
                        ) : requests.slice(0, 30).map((req, idx) => (
                          <tr key={req.id}
                            style={{ borderBottom: `1px solid ${t.border}`, background: idx % 2 === 0 ? t.surface : (dark ? '#1a2535' : '#fafafa') }}
                            onMouseEnter={e => e.currentTarget.style.background = t.hover}
                            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? t.surface : (dark ? '#1a2535' : '#fafafa')}
                          >
                            <td style={{ padding: '11px 14px', color: t.muted, fontSize: 12 }}>#{req.id}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#4d7c5a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                  {(req.requester_name || 'U')[0].toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{req.requester_name || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '11px 14px', fontWeight: 600, color: t.text }}>{req.item_name}</td>
                            <td style={{ padding: '11px 14px', fontWeight: 700, color: dark ? '#86efac' : '#4d7c5a' }}>{req.quantity_requested} {req.item_unit}</td>
                            <td style={{ padding: '11px 14px', color: t.subtle, maxWidth: 150 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {req.is_urgent && <span style={{ marginRight: 4 }}>🔴</span>}
                                {req.reason || req.purpose || '—'}
                              </div>
                            </td>
                            <td style={{ padding: '11px 14px' }}>{reqChip(req.status, dark)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              {req.status === 'pending' && canManage && (
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <button onClick={() => setReviewModal({ request: req, action: 'approve' })}
                                    style={{ background: dark ? '#14532d' : '#4d7c5a', color: dark ? '#86efac' : 'white', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    ✓ Approve
                                  </button>
                                  <button onClick={() => setReviewModal({ request: req, action: 'reject' })}
                                    style={{ background: 'transparent', color: '#dc2626', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    ✕ Reject
                                  </button>
                                </div>
                              )}
                              {req.status === 'approved' && canManage && (
                                <button onClick={() => setIssueRequest(req)}
                                  style={{ background: dark ? '#1e3a5f' : '#1e6b7a', color: dark ? '#93c5fd' : 'white', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                  Issue →
                                </button>
                              )}
                              {(req.status === 'issued' || req.status === 'rejected') && (
                                <span style={{ fontSize: 12, color: t.muted }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ══ TRANSACTIONS TAB ═════════════════════════════ */}
              {activeTab === 'transactions' && (
                <div style={{ ...surface, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: t.text, margin: 0 }}>🔄 Transactions</h2>
                    <button onClick={() => navigate('/stock-entries')}
                      style={{ fontSize: 12, color: dark ? '#86efac' : '#4d7c5a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      View Stock Log →
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: dark ? '#1a2942' : '#f8fafc', borderBottom: `1px solid ${t.border}` }}>
                          {['Issue #', 'Item', 'Issued To', 'Qty', 'Date', 'Status'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {issues.length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: t.muted }}>No transactions yet</td></tr>
                        ) : issues.map((issue, idx) => (
                          <tr key={issue.id}
                            style={{ borderBottom: `1px solid ${t.border}`, background: idx % 2 === 0 ? t.surface : (dark ? '#1a2535' : '#fafafa') }}
                          >
                            <td style={{ padding: '11px 14px', color: t.muted, fontSize: 12 }}>#TXN-{issue.id}</td>
                            <td style={{ padding: '11px 14px', fontWeight: 600, color: t.text }}>{issue.item_name || '—'}</td>
                            <td style={{ padding: '11px 14px', color: t.subtle }}>{issue.requested_by_name || '—'}</td>
                            <td style={{ padding: '11px 14px', fontWeight: 700, color: '#ef4444' }}>-{issue.issued_quantity} {issue.item_unit}</td>
                            <td style={{ padding: '11px 14px', color: t.muted, fontSize: 12 }}>{fmtDate(issue.issued_at)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              {issue.returned_at ? <Chip label="Returned" type="success" dark={dark} /> :
                               issue.usage_finalized ? <Chip label="Finalized" type="info" dark={dark} /> :
                               <Chip label="Active" type="warning" dark={dark} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ══ CATEGORIES TAB ════════════════════════════════ */}
              {activeTab === 'categories' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {categories.map((cat, idx) => {
                      const catItems = items.filter(i => i.category === cat.id)
                      const catLow = catItems.filter(i => i.available_quantity > 0 && i.available_quantity <= i.threshold_quantity).length
                      const catOut = catItems.filter(i => i.available_quantity === 0).length
                      const catValue = catItems.reduce((s, i) => s + (i.unit_cost || 0) * i.available_quantity, 0)
                      return (
                        <div key={cat.id} style={{ ...surface, borderRadius: 14, padding: '18px', borderLeft: `4px solid ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                            <div>
                              <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{cat.name}</div>
                              <div style={{ fontSize: 11, color: t.muted }}>{catItems.length} items</div>
                            </div>
                          </div>
                          {cat.description && <p style={{ fontSize: 12, color: t.subtle, margin: '0 0 10px' }}>{cat.description}</p>}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {catLow > 0 && <Chip label={`⚠️ ${catLow} low`} type="warning" dark={dark} />}
                            {catOut > 0 && <Chip label={`❌ ${catOut} out`} type="danger" dark={dark} />}
                            {catValue > 0 && <span style={{ fontSize: 12, color: t.muted }}>₹{catValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                          </div>
                          <button
                            onClick={() => { setCatFilter(String(cat.id)); setActiveTab('inventory') }}
                            style={{ marginTop: 12, background: 'transparent', color: dark ? '#86efac' : '#4d7c5a', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                            View {catItems.length} items →
                          </button>
                        </div>
                      )
                    })}
                    {isAdmin && (
                      <button onClick={() => setAddCategoryOpen(true)}
                        style={{ ...surface, borderRadius: 14, padding: '18px', border: `2px dashed ${t.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 120, background: 'transparent' }}>
                        <div style={{ fontSize: 28, color: t.muted }}>+</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.muted }}>Add Category</div>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Donut chart */}
              <div style={{ ...surface, borderRadius: 14, padding: '16px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text, margin: '0 0 12px' }}>Stock by Category</h3>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <DonutChart
                    segments={catBreakdown.length > 0 ? catBreakdown : [{ value: 1, color: t.border }]}
                    size={130} strokeWidth={26}
                    label={items.reduce((s, i) => s + i.available_quantity, 0).toLocaleString()}
                    sublabel="units"
                    dark={dark}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catBreakdown.map((cat, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                        <span style={{ fontSize: 11, color: t.subtle }}>{cat.name}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{cat.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alerts */}
              <div style={{ ...surface, borderRadius: 14, padding: '16px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text, margin: '0 0 10px' }}>🚨 Alerts</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { icon: '🔴', label: 'Low Stock Items', count: lowStockItems.length, action: () => { setStockFilter('low'); setActiveTab('inventory') } },
                    { icon: '⚫', label: 'Out of Stock', count: outOfStockItems.length, action: () => { setStockFilter('out'); setActiveTab('inventory') } },
                    { icon: '🟡', label: 'Pending Requests', count: pendingRequests.length, action: () => setActiveTab('requests') },
                    { icon: '🟢', label: 'Ready to Issue', count: approvedRequests.length, action: () => setActiveTab('requests') },
                  ].map((a, i) => (
                    <div key={i} onClick={a.action}
                      style={{ background: dark ? '#1a2535' : '#f8fafc', border: `1px solid ${t.border}`, borderRadius: 10, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = t.hover}
                      onMouseLeave={e => e.currentTarget.style.background = dark ? '#1a2535' : '#f8fafc'}
                    >
                      <span style={{ fontSize: 12, color: t.subtle }}>{a.icon} {a.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: a.count > 0 ? '#ef4444' : (dark ? '#86efac' : '#4d7c5a') }}>{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ ...surface, borderRadius: 14, padding: '16px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text, margin: '0 0 10px' }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {isAdmin && (
                    <button onClick={() => setAddItemOpen(true)}
                      style={{ background: dark ? '#14532d' : '#4d7c5a', color: dark ? '#86efac' : 'white', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      ➕ Add New Item
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setAddCategoryOpen(true)}
                      style={{ background: dark ? '#1a2535' : '#f8fafc', color: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      📁 Add Category
                    </button>
                  )}
                  <button onClick={() => setActiveTab('requests')}
                    style={{ background: pendingRequests.length > 0 ? (dark ? '#451a03' : '#fffbeb') : (dark ? '#1a2535' : '#f8fafc'), color: pendingRequests.length > 0 ? '#b45309' : t.subtle, border: `1px solid ${pendingRequests.length > 0 ? (dark ? '#78350f' : '#fde68a') : t.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    🔔 Requests ({pendingRequests.length})
                  </button>
                  <button onClick={() => navigate('/reports')}
                    style={{ background: dark ? '#1a2535' : '#f8fafc', color: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    📊 Reports
                  </button>
                  <button onClick={() => navigate('/stock-entries')}
                    style={{ background: dark ? '#1a2535' : '#f8fafc', color: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    📋 Stock Log
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      <ItemModal
        open={addItemOpen || !!editItem}
        onClose={() => { setAddItemOpen(false); setEditItem(null) }}
        categories={categories}
        editItem={editItem}
        onSaved={() => { load(); setNotice(editItem ? 'Item updated successfully.' : 'Item added successfully.') }}
        dark={dark}
      />
      <CategoryModal
        open={addCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
        categories={categories}
        onSaved={() => { load(); setNotice('Category created.') }}
      />
      <AddStockModal
        open={!!addStockItem}
        onClose={() => setAddStockItem(null)}
        item={addStockItem}
        onDone={() => { load(); setNotice('Stock updated successfully.') }}
      />
      <IssueModal
        open={!!issueRequest}
        onClose={() => setIssueRequest(null)}
        request={issueRequest}
        onDone={() => { load(); setNotice('Item issued successfully.') }}
      />
      <ReviewModal
        open={!!reviewModal}
        onClose={() => setReviewModal(null)}
        request={reviewModal?.request}
        action={reviewModal?.action}
        onDone={() => { load(); setNotice(reviewModal?.action === 'approve' ? 'Request approved.' : 'Request rejected.') }}
      />
      <DeleteModal
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        item={deleteItem}
        onDone={() => { load(); setNotice('Item deleted.') }}
      />
    </Layout>
  )
}
