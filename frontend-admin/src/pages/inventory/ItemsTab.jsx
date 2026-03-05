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
  Spinner,
} from '../../components/ui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

function itemStatus(item) {
  if (Number(item.available_quantity || 0) <= 0) return 'out_of_stock'
  if (Number(item.available_quantity || 0) <= Number(item.threshold_quantity || 0)) return 'low_stock'
  return 'in_stock'
}

const EMPTY_ITEM = {
  name: '', category: '', item_type: 'consumable', unit: 'pieces',
  total_quantity: 0, available_quantity: 0, threshold_quantity: 1,
  unit_cost: 0, description: '', location: '',
}

function ClickableStatCard({ label, value, icon, color, sub, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? color : 'var(--surface)',
        borderRadius: 14,
        border: active ? `2px solid ${color}` : '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        transition: 'all 0.18s',
        boxShadow: active ? `0 4px 16px ${color}40` : '0 1px 3px rgba(0,0,0,0.05)',
        transform: active ? 'translateY(-1px)' : 'none',
        userSelect: 'none',
      }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: active ? 'rgba(255,255,255,0.2)' : color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: active ? '#fff' : 'var(--text)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: active ? 'rgba(255,255,255,0.8)' : 'var(--text-3)', marginTop: 2 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : color, marginTop: 2, fontWeight: 600 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ItemsTab({ userRole, onTabChange }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [adjustModal, setAdjustModal] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEvents, setHistoryEvents] = useState([])
  const [adjustData, setAdjustData] = useState({ action: 'increase', quantity: 1 })
  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)

  const canAdmin = userRole === 'admin'

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [itemsRes, catRes, sumRes] = await Promise.all([
        inventoryAPI.getItems(),
        inventoryAPI.getCategories(),
        inventoryAPI.getDashboard(),
      ])
      setItems(asList(itemsRes.data))
      setCategories(asList(catRes.data))
      setSummary(sumRes.data || null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load inventory.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Listen for tab-change events from stat card clicks
  useEffect(() => {
    const handler = (e) => { if (onTabChange) onTabChange(e.detail) }
    window.addEventListener('inventory-tab-change', handler)
    return () => window.removeEventListener('inventory-tab-change', handler)
  }, [onTabChange])

  const filtered = useMemo(() => items.filter((it) => {
    const q = search.toLowerCase()
    const hitQ = !q || [it.name, it.category_name, it.item_type, it.location]
      .some((v) => String(v || '').toLowerCase().includes(q))
    const hitType = typeFilter === 'all' || it.item_type === typeFilter
    const s = itemStatus(it)
    const hitStatus = statusFilter === 'all' || s === statusFilter
    return hitQ && hitType && hitStatus
  }), [items, search, typeFilter, statusFilter])

  // Category stacked bar chart
  const catChartData = useMemo(() => {
    if (summary?.category_breakdown?.length > 0) {
      return summary.category_breakdown.map((c) => ({
        name: c.category.length > 11 ? c.category.slice(0, 11) + '…' : c.category,
        'In Stock': c.in_stock, 'Low Stock': c.low_stock, 'Out of Stock': c.out_of_stock,
      }))
    }
    const m = {}
    items.forEach((it) => {
      const cat = it.category_name || 'Other'
      if (!m[cat]) m[cat] = { 'In Stock': 0, 'Low Stock': 0, 'Out of Stock': 0 }
      const s = itemStatus(it)
      if (s === 'in_stock') m[cat]['In Stock']++
      else if (s === 'low_stock') m[cat]['Low Stock']++
      else m[cat]['Out of Stock']++
    })
    return Object.entries(m).map(([name, v]) => ({
      name: name.length > 11 ? name.slice(0, 11) + '…' : name, ...v,
    }))
  }, [items, summary])

  const issuedData = useMemo(() => summary?.issued_vs_available || [], [summary])

  const totalItems = summary?.total_items ?? items.length
  const lowCount = summary?.low_stock_count ?? items.filter(i => itemStatus(i) === 'low_stock').length
  const outCount = summary?.out_of_stock_count ?? items.filter(i => itemStatus(i) === 'out_of_stock').length
  const pendingCount = summary?.pending_requests ?? 0

  const doAdjust = async () => {
    try {
      await inventoryAPI.adjustStock(adjustModal.id, adjustData.action, Number(adjustData.quantity || 0))
      setAdjustModal(null); await load()
    } catch (e) { setError(e.response?.data?.detail || 'Adjustment failed.') }
  }

  const openHistory = async (item) => {
    setHistoryModal(item); setHistoryLoading(true); setHistoryEvents([])
    try {
      const { data } = await inventoryAPI.getItemHistory(item.id)
      setHistoryEvents(data?.events || [])
    } catch (e) { setError('Could not load history.') }
    finally { setHistoryLoading(false) }
  }

  const doCreateItem = async () => {
    setSaving(true)
    try {
      await inventoryAPI.createItem({
        ...newItem,
        total_quantity: Number(newItem.total_quantity || 0),
        available_quantity: Number(newItem.available_quantity || 0),
        threshold_quantity: Number(newItem.threshold_quantity || 0),
        unit_cost: Number(newItem.unit_cost || 0),
      })
      setAddModal(false); setNewItem(EMPTY_ITEM); await load()
    } catch (e) { setError(e.response?.data?.detail || 'Failed to create item.') }
    finally { setSaving(false) }
  }

  const historyDotColor = { stock_added: '#16a34a', issued: '#c2622a', returned: '#3b82f6' }

  return (
    <div>
      <Alert message={error} />

      {/* Clickable Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, marginBottom: 18 }}>
        <ClickableStatCard
          label="Total Stocks" value={totalItems} icon="📦" color="var(--green-800)"
          active={statusFilter === 'all' && typeFilter === 'all' && !search}
          onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSearch('') }}
        />
        <ClickableStatCard
          label="Low Stock" value={lowCount} icon="⚠️" color="#d97706"
          sub={statusFilter === 'low_stock' ? 'Click to clear filter' : 'Click to filter'}
          active={statusFilter === 'low_stock'}
          onClick={() => setStatusFilter(statusFilter === 'low_stock' ? 'all' : 'low_stock')}
        />
        <ClickableStatCard
          label="Out of Stocks" value={outCount} icon="🚫" color="#dc2626"
          sub={statusFilter === 'out_of_stock' ? 'Click to clear filter' : 'Click to filter'}
          active={statusFilter === 'out_of_stock'}
          onClick={() => setStatusFilter(statusFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
        />
        <ClickableStatCard
          label="Pending Requests" value={pendingCount} icon="📋" color="#3b82f6"
          sub="View requests tab →"
          active={false}
          onClick={() => window.dispatchEvent(new CustomEvent('inventory-tab-change', { detail: 'requests' }))}
        />
      </div>

      {/* Active filter chip */}
      {statusFilter !== 'all' && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14,
          padding: '6px 12px', background: 'var(--surface-2)',
          borderRadius: 99, border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
            {statusFilter === 'low_stock' ? '⚠️ Showing Low Stock' : '🚫 Showing Out of Stock'}
          </span>
          <button onClick={() => setStatusFilter('all')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>
      )}

      {/* Analytics Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            📊 Stock Status by Category
          </div>
          {catChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={195}>
              <BarChart data={catChartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="In Stock" stackId="a" fill="#2d4a3e" />
                <Bar dataKey="Low Stock" stackId="a" fill="#d97706" />
                <Bar dataKey="Out of Stock" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 12 }}>No data</div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            🔄 Available vs Issued (Top Items)
          </div>
          {issuedData.length > 0 ? (
            <ResponsiveContainer width="100%" height={195}>
              <BarChart data={issuedData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={85} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="available" name="Available" fill="#2d4a3e" radius={[0, 4, 4, 0]} />
                <Bar dataKey="issued" name="Issued" fill="#c2622a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 12 }}>
              No issued items yet
            </div>
          )}
        </Card>
      </div>

      {/* Items Table */}
      <Card noPad>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 140 }}>
            <option value="all">All Types</option>
            <option value="consumable">Consumable</option>
            <option value="asset">Asset</option>
          </SelectField>
          <SelectField value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 150 }}>
            <option value="all">All Status</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </SelectField>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {filtered.length}/{items.length} items
            </span>
            {canAdmin && <Btn onClick={() => setAddModal(true)}>+ Add Item</Btn>}
          </div>
        </div>

        <DataTable
          headers={['Name', 'Category', 'Type', 'Available', 'Threshold', 'Status', 'Actions']}
          loading={loading}
          rows={filtered.map((it) => [
            <div key={`n-${it.id}`}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.location || '—'}</div>
            </div>,
            it.category_name || '—',
            <Badge key={`t-${it.id}`} value={it.item_type} />,
            <span key={`a-${it.id}`} style={{
              fontWeight: 700,
              color: itemStatus(it) === 'out_of_stock' ? '#dc2626' : itemStatus(it) === 'low_stock' ? '#d97706' : 'inherit'
            }}>
              {it.available_quantity} {it.unit}
            </span>,
            `${it.threshold_quantity} ${it.unit}`,
            <Badge key={`s-${it.id}`} value={itemStatus(it)} />,
            <div key={`act-${it.id}`} style={{ display: 'flex', gap: 6 }}>
              {canAdmin && <Btn size="sm" variant="ghost" onClick={() => setAdjustModal(it)}>Adjust</Btn>}
              <Btn size="sm" variant="ghost" onClick={() => openHistory(it)}>History</Btn>
            </div>,
          ])}
        />
      </Card>

      {/* Adjust Modal */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)}
        title={`Adjust Stock — ${adjustModal?.name || ''}`}
        footer={<><Btn variant="ghost" onClick={() => setAdjustModal(null)}>Cancel</Btn><Btn onClick={doAdjust}>Apply</Btn></>}
      >
        <Field label="Action">
          <SelectField value={adjustData.action} onChange={(e) => setAdjustData((p) => ({ ...p, action: e.target.value }))}>
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </SelectField>
        </Field>
        <Field label="Quantity">
          <Input type="number" min="1" value={adjustData.quantity}
            onChange={(e) => setAdjustData((p) => ({ ...p, quantity: e.target.value }))} />
        </Field>
      </Modal>

      {/* Add Item Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Inventory Item" width={620}
        footer={<><Btn variant="ghost" onClick={() => setAddModal(false)}>Cancel</Btn><Btn onClick={doCreateItem} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Btn></>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Name" required>
            <Input value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Category" required>
            <SelectField value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}>
              <option value="">Choose category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          </Field>
          <Field label="Type">
            <SelectField value={newItem.item_type} onChange={(e) => setNewItem((p) => ({ ...p, item_type: e.target.value }))}>
              <option value="consumable">Consumable</option>
              <option value="asset">Asset</option>
            </SelectField>
          </Field>
          <Field label="Unit">
            <SelectField value={newItem.unit} onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}>
              <option value="pieces">Pieces</option>
              <option value="litres">Litres</option>
              <option value="kg">Kilograms</option>
              <option value="metres">Metres</option>
              <option value="packets">Packets</option>
              <option value="bottles">Bottles</option>
              <option value="boxes">Boxes</option>
            </SelectField>
          </Field>
          <Field label="Total Qty"><Input type="number" value={newItem.total_quantity} onChange={(e) => setNewItem((p) => ({ ...p, total_quantity: e.target.value }))} /></Field>
          <Field label="Available Qty"><Input type="number" value={newItem.available_quantity} onChange={(e) => setNewItem((p) => ({ ...p, available_quantity: e.target.value }))} /></Field>
          <Field label="Threshold"><Input type="number" value={newItem.threshold_quantity} onChange={(e) => setNewItem((p) => ({ ...p, threshold_quantity: e.target.value }))} /></Field>
          <Field label="Unit Cost"><Input type="number" value={newItem.unit_cost} onChange={(e) => setNewItem((p) => ({ ...p, unit_cost: e.target.value }))} /></Field>
        </div>
        <Field label="Location"><Input value={newItem.location} onChange={(e) => setNewItem((p) => ({ ...p, location: e.target.value }))} /></Field>
        <Field label="Description"><Input value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} /></Field>
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)}
        title={`Item History — ${historyModal?.name || ''}`} width={700}
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : historyEvents.length === 0 ? (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 30 }}>No history records.</div>
        ) : (
          historyEvents.map((ev, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', display: 'flex', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: historyDotColor[ev.type] || '#6b7280' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{ev.type.replace(/_/g, ' ')}</strong>
                  <span style={{ color: 'var(--text-3)' }}>{new Date(ev.date).toLocaleString('en-IN')}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Qty: {ev.quantity} · By: {ev.person}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ev.detail}</div>
              </div>
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}
