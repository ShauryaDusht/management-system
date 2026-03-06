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
import { BarGroupChart } from '../../components/ui/Charts'

function itemStatus(item) {
  if (Number(item.available_quantity || 0) <= 0) return 'out_of_stock'
  if (Number(item.available_quantity || 0) <= Number(item.threshold_quantity || 0)) return 'low_stock'
  return 'in_stock'
}

const EMPTY_ITEM = {
  name: '', category: '', item_type: 'consumable', unit: 'pcs',
  total_quantity: 0, available_quantity: 0, threshold_quantity: 1,
  unit_cost: 0, description: '', location: '',
}

function FilterStatCard({ label, value, icon, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? color + '15' : 'var(--surface)',
        border: `2px solid ${active ? color : 'var(--border)'}`,
        borderRadius: 14,
        padding: '14px 18px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        userSelect: 'none',
        boxShadow: active ? `0 0 0 3px ${color}22` : 'none',
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 11,
        background: color + '20', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: active ? color : 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: active ? color : 'var(--text-3)', marginTop: 2, fontWeight: active ? 700 : 400 }}>{label}</div>
      </div>
      {active && (
        <span style={{ fontSize: 10, color, fontWeight: 700, background: color + '18', borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>
          ✕ Clear
        </span>
      )}
    </div>
  )
}

export default function ItemsTab({ userRole, initialStatusFilter, onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all')
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
    setLoading(true)
    setError('')
    try {
      const [itemsRes, categoriesRes, summaryRes] = await Promise.all([
        inventoryAPI.getItems({ page_size: 200 }),
        inventoryAPI.getCategories(),
        inventoryAPI.getDashboard(),
      ])
      // asList handles both bare array AND DRF paginated {count, results:[]}
      setItems(asList(itemsRes.data))
      setCategories(asList(categoriesRes.data))
      setSummary(summaryRes.data || null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load inventory items.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter)
  }, [initialStatusFilter])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const q = search.toLowerCase()
      const hitSearch = !q || [it.name, it.category_name, it.item_type, it.location]
        .some((v) => String(v || '').toLowerCase().includes(q))
      const hitType = typeFilter === 'all' || it.item_type === typeFilter
      const hitStatus = statusFilter === 'all' || itemStatus(it) === statusFilter
      return hitSearch && hitType && hitStatus
    })
  }, [items, search, typeFilter, statusFilter])

  const totalCount = summary?.total_items ?? items.length
  const lowCount = summary?.low_stock_count ?? items.filter((i) => itemStatus(i) === 'low_stock').length
  const outCount = summary?.out_of_stock_count ?? items.filter((i) => itemStatus(i) === 'out_of_stock').length
  const pendingCount = summary?.pending_requests ?? 0

  const byTypeChart = useMemo(() => {
    const types = ['consumable', 'asset']
    return types.map((type) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      in_stock: items.filter((it) => it.item_type === type && itemStatus(it) === 'in_stock').length,
      low_stock: items.filter((it) => it.item_type === type && itemStatus(it) === 'low_stock').length,
      out_of_stock: items.filter((it) => it.item_type === type && itemStatus(it) === 'out_of_stock').length,
    }))
  }, [items])

  const doAdjust = async () => {
    if (!adjustModal) return
    try {
      await inventoryAPI.adjustStock(adjustModal.id, adjustData.action, Number(adjustData.quantity || 0))
      setAdjustModal(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Stock adjustment failed.')
    }
  }

  const openHistory = async (item) => {
    setHistoryModal(item)
    setHistoryLoading(true)
    setHistoryEvents([])
    try {
      const { data } = await inventoryAPI.getItemHistory(item.id)
      setHistoryEvents(data?.events || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not load item history.')
    } finally {
      setHistoryLoading(false)
    }
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
      setAddModal(false)
      setNewItem(EMPTY_ITEM)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create item.')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = (key) => setStatusFilter((prev) => (prev === key ? 'all' : key))

  return (
    <div>
      <Alert message={error} />

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 18 }}>
        <FilterStatCard label="Total Items" value={loading ? '—' : totalCount} icon="📦"
          color="var(--green-800)" active={statusFilter === 'all' && typeFilter === 'all'}
          onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSearch('') }} />
        <FilterStatCard label="Low Stock" value={loading ? '—' : lowCount} icon="⚠️"
          color="#d97706" active={statusFilter === 'low_stock'} onClick={() => toggleStatus('low_stock')} />
        <FilterStatCard label="Out of Stock" value={loading ? '—' : outCount} icon="🚫"
          color="#dc2626" active={statusFilter === 'out_of_stock'} onClick={() => toggleStatus('out_of_stock')} />
        <FilterStatCard label="Pending Requests" value={loading ? '—' : pendingCount} icon="📋"
          color="#3b82f6" active={false}
          onClick={() => onNavigate && onNavigate('requests')} />
      </div>

      {/* Chart */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Stock by Type</div>
        <BarGroupChart
          data={byTypeChart}
          bars={[
            { key: 'in_stock', label: 'In Stock' },
            { key: 'low_stock', label: 'Low Stock' },
            { key: 'out_of_stock', label: 'Out of Stock' },
          ]}
          height={150}
        />
      </Card>

      {/* Active filter pill */}
      {statusFilter !== 'all' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          padding: '7px 12px', background: '#fefce8', border: '1px solid #fde047',
          borderRadius: 8, fontSize: 13, color: '#713f12',
        }}>
          <span>Filtered: <strong>{statusFilter.replace(/_/g, ' ')}</strong></span>
          <button onClick={() => setStatusFilter('all')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#92400e', fontWeight: 700 }}>
            ✕ Clear
          </button>
        </div>
      )}

      {/* Table */}
      <Card noPad>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <Input placeholder="Search items..." value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 140 }}>
            <option value="all">All Types</option>
            <option value="consumable">Consumable</option>
            <option value="asset">Asset</option>
          </SelectField>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {filtered.length !== items.length && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {filtered.length} / {items.length} shown
              </span>
            )}
            {canAdmin && <Btn onClick={() => setAddModal(true)}>+ Add Item</Btn>}
          </div>
        </div>
        <DataTable
          headers={['Name', 'Category', 'Type', 'Available', 'Threshold', 'Status', 'Actions']}
          loading={loading}
          emptyMsg={statusFilter !== 'all' ? `No items match "${statusFilter.replace(/_/g,' ')}".` : 'No items found.'}
          rows={filtered.map((it) => [
            <div key={`n-${it.id}`}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.location || '—'}</div>
            </div>,
            it.category_name || '—',
            <span key={`t-${it.id}`} style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
              background: it.item_type === 'asset' ? '#ede9fe' : '#dbeafe',
              color: it.item_type === 'asset' ? '#5b21b6' : '#1d4ed8',
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>{it.item_type}</span>,
            `${it.available_quantity} ${it.unit}`,
            `${it.threshold_quantity} ${it.unit}`,
            <Badge key={`s-${it.id}`} value={itemStatus(it)} />,
            <div key={`a-${it.id}`} style={{ display: 'flex', gap: 6 }}>
              {canAdmin && <Btn size="sm" variant="ghost" onClick={() => setAdjustModal(it)}>Adjust</Btn>}
              <Btn size="sm" variant="ghost" onClick={() => openHistory(it)}>History</Btn>
            </div>,
          ])}
        />
      </Card>

      {/* Adjust Modal */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)}
        title={`Adjust Stock — ${adjustModal?.name || ''}`}
        footer={<><Btn variant="ghost" onClick={() => setAdjustModal(null)}>Cancel</Btn><Btn onClick={doAdjust}>Apply</Btn></>}>
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
        footer={<><Btn variant="ghost" onClick={() => setAddModal(false)}>Cancel</Btn><Btn onClick={doCreateItem} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Btn></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Name" required><Input value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} /></Field>
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
          <Field label="Unit"><Input value={newItem.unit} onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))} /></Field>
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
        title={`Item History — ${historyModal?.name || ''}`} width={700}>
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : historyEvents.length === 0 ? (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>No history records.</div>
        ) : (
          historyEvents.map((ev, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '9px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <strong style={{ textTransform: 'capitalize' }}>{ev.type?.replace(/_/g, ' ')}</strong>
                <span style={{ color: 'var(--text-3)' }}>{new Date(ev.date).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>Qty: {ev.quantity} · By: {ev.person}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{ev.detail}</div>
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}
