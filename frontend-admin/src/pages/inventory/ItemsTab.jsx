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
  StatCard,
} from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'



function itemStatus(item) {
  if (Number(item.available_quantity || 0) <= 0) return 'out_of_stock'
  if (Number(item.available_quantity || 0) <= Number(item.threshold_quantity || 0)) return 'low_stock'
  return 'in_stock'
}
const EMPTY_ITEM = {
  name: '',
  category: '',
  item_type: 'consumable',
  unit: 'pcs',
  total_quantity: 0,
  available_quantity: 0,
  threshold_quantity: 1,
  unit_cost: 0,
  description: '',
  location: '',
}

export default function ItemsTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
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
        inventoryAPI.getItems(),
        inventoryAPI.getCategories(),
        inventoryAPI.getDashboard(),
      ])
      setItems(asList(itemsRes.data))
      setCategories(asList(categoriesRes.data))
      setSummary(summaryRes.data || null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load inventory items.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const q = search.toLowerCase()
      const hit =
        !q ||
        [it.name, it.category_name, it.item_type, it.location].some((v) =>
          String(v || '').toLowerCase().includes(q)
        )
      const hitType = typeFilter === 'all' || it.item_type === typeFilter
      return hit && hitType
    })
  }, [items, search, typeFilter])

  const lowStockItems = filtered.filter((i) => itemStatus(i) !== 'in_stock')

  const stockCounts = useMemo(() => {
    const lowStock = filtered.filter((i) => itemStatus(i) === 'low_stock').length
    const outOfStock = filtered.filter((i) => itemStatus(i) === 'out_of_stock').length
    return { lowStock, outOfStock }
  }, [filtered])

  const byTypeChart = useMemo(() => {
    const types = ['consumable', 'asset']
    return types.map((type) => {
      const list = filtered.filter((it) => it.item_type === type)
      return {
        name: type,
        in_stock: list.filter((i) => itemStatus(i) === 'in_stock').length,
        low_stock: list.filter((i) => itemStatus(i) === 'low_stock').length,
        out_of_stock: list.filter((i) => itemStatus(i) === 'out_of_stock').length,
      }
    })
  }, [filtered])

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <Alert message={error} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <StatCard label="Total Items" value={summary?.total_items ?? items.length} icon="📦" />
          <StatCard label="Low Stock" value={summary?.low_stock_count ?? stockCounts.lowStock} icon="⚠️" color="var(--orange-600)" />
          <StatCard label="Out of Stock" value={summary?.out_of_stock_count ?? stockCounts.outOfStock} icon="🟥" color="#dc2626" />
          <StatCard label="Pending Requests" value={summary?.pending_requests ?? 0} icon="📋" color="#3b82f6" />
        </div>

        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock Overview by Type</div>
          <BarGroupChart
            data={byTypeChart}
            bars={[
              { key: 'in_stock', label: 'In Stock' },
              { key: 'low_stock', label: 'Low Stock' },
              { key: 'out_of_stock', label: 'Out of Stock' },
            ]}
            height={180}
          />
        </Card>

        <Card noPad>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Input
              placeholder="Search item, category, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <Btn
              size="sm"
              variant={typeFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setTypeFilter('all')}
            >
              All
            </Btn>
            <Btn
              size="sm"
              variant={typeFilter === 'consumable' ? 'primary' : 'secondary'}
              onClick={() => setTypeFilter('consumable')}
            >
              Consumables
            </Btn>
            <Btn
              size="sm"
              variant={typeFilter === 'asset' ? 'primary' : 'secondary'}
              onClick={() => setTypeFilter('asset')}
            >
              Assets
            </Btn>
            {canAdmin && (
              <Btn style={{ marginLeft: 'auto' }} onClick={() => setAddModal(true)}>
                + Add Item
              </Btn>
            )}
          </div>

          <DataTable
            headers={['Name', 'Category', 'Type', 'Available', 'Threshold', 'Status', 'Actions']}
            loading={loading}
            rows={filtered.map((it) => [
              <div key={`name-${it.id}`}>
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.location || '—'}</div>
              </div>,
              it.category_name || '—',
              (it.item_type || '').toUpperCase(),
              `${it.available_quantity} ${it.unit}`,
              `${it.threshold_quantity} ${it.unit}`,
              <Badge key={`st-${it.id}`} value={itemStatus(it)} />,
              <div key={`act-${it.id}`} style={{ display: 'flex', gap: 6 }}>
                {canAdmin && (
                  <Btn size="sm" variant="ghost" onClick={() => setAdjustModal(it)}>
                    Adjust
                  </Btn>
                )}
                <Btn size="sm" variant="ghost" onClick={() => openHistory(it)}>
                  History
                </Btn>
              </div>,
            ])}
          />
        </Card>
      </div>

      <div>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock Alerts</div>
          {lowStockItems.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No stock alerts.</div>
          ) : (
            lowStockItems.slice(0, 12).map((it) => (
              <div
                key={it.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {it.available_quantity} {it.unit} left / threshold {it.threshold_quantity}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Badge value={itemStatus(it)} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <Modal
        open={!!adjustModal}
        onClose={() => setAdjustModal(null)}
        title={`Adjust Stock — ${adjustModal?.name || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAdjustModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={doAdjust}>Apply</Btn>
          </>
        }
      >
        <Field label="Action">
          <SelectField
            value={adjustData.action}
            onChange={(e) => setAdjustData((p) => ({ ...p, action: e.target.value }))}
          >
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </SelectField>
        </Field>
        <Field label="Quantity">
          <Input
            type="number"
            min="1"
            value={adjustData.quantity}
            onChange={(e) => setAdjustData((p) => ({ ...p, quantity: e.target.value }))}
          />
        </Field>
      </Modal>

      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add Inventory Item"
        width={620}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAddModal(false)}>
              Cancel
            </Btn>
            <Btn onClick={doCreateItem} disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </Btn>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Name" required>
            <Input value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Category" required>
            <SelectField
              value={newItem.category}
              onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="">Choose category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Type">
            <SelectField
              value={newItem.item_type}
              onChange={(e) => setNewItem((p) => ({ ...p, item_type: e.target.value }))}
            >
              <option value="consumable">Consumable</option>
              <option value="asset">Asset</option>
            </SelectField>
          </Field>
          <Field label="Unit">
            <Input value={newItem.unit} onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))} />
          </Field>
          <Field label="Total Quantity">
            <Input
              type="number"
              value={newItem.total_quantity}
              onChange={(e) => setNewItem((p) => ({ ...p, total_quantity: e.target.value }))}
            />
          </Field>
          <Field label="Available Quantity">
            <Input
              type="number"
              value={newItem.available_quantity}
              onChange={(e) => setNewItem((p) => ({ ...p, available_quantity: e.target.value }))}
            />
          </Field>
          <Field label="Threshold">
            <Input
              type="number"
              value={newItem.threshold_quantity}
              onChange={(e) => setNewItem((p) => ({ ...p, threshold_quantity: e.target.value }))}
            />
          </Field>
          <Field label="Unit Cost">
            <Input
              type="number"
              value={newItem.unit_cost}
              onChange={(e) => setNewItem((p) => ({ ...p, unit_cost: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Location">
          <Input value={newItem.location} onChange={(e) => setNewItem((p) => ({ ...p, location: e.target.value }))} />
        </Field>
        <Field label="Description">
          <Input value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        title={`Item History — ${historyModal?.name || ''}`}
        width={720}
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : historyEvents.length === 0 ? (
          <div style={{ color: 'var(--text-3)' }}>No history records.</div>
        ) : (
          historyEvents.map((ev, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <strong>{ev.type}</strong>
                <span>{new Date(ev.date).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                Qty: {ev.quantity} · By: {ev.person}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{ev.detail}</div>
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}

