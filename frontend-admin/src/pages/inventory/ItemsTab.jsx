import { useMemo, useState } from 'react'

import { asList } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
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
  Spinner,
  StatCard,
} from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'
import ConfirmModal from '../../shared/components/ConfirmModal'



function itemStatus(item) {
  if (Number(item.available_quantity || 0) <= 0) return 'out_of_stock'
  if (Number(item.available_quantity || 0) <= Number(item.threshold_quantity || 0)) return 'low_stock'
  return 'in_stock'
}

const EMPTY_ITEM = {
  item_code: '',
  name: '',
  category: '',
  item_type: 'consumable',
  unit: 'pieces',
  total_quantity: 0,
  available_quantity: 0,
  threshold_quantity: 1,
  unit_cost: 0,
  description: '',
}

export default function ItemsTab({ userRole }) {
  const { run: runAction, saving, error: actionError, clearError } = useAsyncAction()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEvents, setHistoryEvents] = useState([])
  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [formErrors, setFormErrors] = useState({})
  const [deleting, setDeleting] = useState(false)

  const canAdmin = userRole === 'admin' || userRole === 'hk_inventory_manager'
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const [itemsRes, categoriesRes, summaryRes] = await Promise.all([
      inventoryAPI.getItems(),
      inventoryAPI.getCategories(),
      inventoryAPI.getDashboard(),
    ])
    setItems(asList(itemsRes.data))
    setCategories(asList(categoriesRes.data))
    setSummary(summaryRes.data || null)
    return null
  }, [])

  const error = actionError || loadError

  const resolveCategoryId = (item) => {
    const directId = item?.category_id ?? item?.category
    if (typeof directId === 'number' || (typeof directId === 'string' && /^\d+$/.test(directId))) {
      return String(directId)
    }
    if (directId && typeof directId === 'object' && directId.id) {
      return String(directId.id)
    }

    const categoryName = typeof item?.category === 'string' ? item.category : item?.category_name
    if (categoryName) {
      const match = categories.find((c) => String(c.name || '').trim() === String(categoryName).trim())
      return match?.id ? String(match.id) : ''
    }
    return ''
  }

  const openEdit = (item) => {
    if (!item) return
    clearError()
    setFormErrors({})
    setEditItem(item)
    setNewItem({
      item_code: item.item_code || '',
      name: item.name || '',
      category: resolveCategoryId(item),
      item_type: item.item_type || 'consumable',
      unit: item.unit || 'pieces',
      total_quantity: item.total_quantity ?? 0,
      available_quantity: item.available_quantity ?? 0,
      threshold_quantity: item.threshold_quantity ?? 1,
      unit_cost: item.unit_cost ?? 0,
      description: item.description || '',
    })
    setAddModal(true)
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const q = search.toLowerCase()
      const hit =
        !q ||
        [it.name, it.category_name, it.item_type].some((v) =>
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

  const openHistory = async (item) => {
    setHistoryModal(item)
    setHistoryLoading(true)
    setHistoryEvents([])
    try {
      await runAction(async () => {
        const { data } = await inventoryAPI.getItemHistory(item.id)
        setHistoryEvents(data?.events || [])
      }, 'Could not load item history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const doCreateItem = async () => {
    const trimmedName = String(newItem.name || '').trim()
    const categoryId = Number(newItem.category)
    const totalQuantity = Number(newItem.total_quantity || 0)
    const availableQuantity = Number(newItem.available_quantity || 0)
    const thresholdQuantity = Number(newItem.threshold_quantity || 0)
    const unitCost = newItem.unit_cost === '' ? null : Number(newItem.unit_cost || 0)
    const errors = {}
    if (!trimmedName) errors.name = 'Name is required.'
    if (!Number.isInteger(categoryId) || categoryId <= 0) errors.category = 'Category is required.'
    if (availableQuantity > totalQuantity) {
      errors.available_quantity = 'Available quantity cannot exceed total quantity.'
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    await runAction(async () => {
      const payload = {
        ...newItem,
        item_code: String(newItem.item_code || '').trim() || null,
        name: trimmedName,
        category: categoryId,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        threshold_quantity: thresholdQuantity,
        unit_cost: unitCost,
      }
      if (editItem) {
        await inventoryAPI.updateItem(editItem.id, payload)
      } else {
        await inventoryAPI.createItem(payload)
      }
      setAddModal(false)
      setEditItem(null)
      setNewItem(EMPTY_ITEM)
      setFormErrors({})
      await reload()
    }, editItem ? 'Failed to update item.' : 'Failed to create item.')
  }

  const doDeleteItem = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await runAction(async () => {
        await inventoryAPI.deleteItem(deleteTarget.id)
        setDeleteTarget(null)
        await reload()
      }, 'Failed to delete item.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Alert message={error} />

      {/* Top section: stat cards + chart + stock alerts side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        {/* Left: stat cards + chart */}
        <div style={{ minWidth: 0 }}>
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

          <Card>
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
        </div>

        {/* Right: stock alerts — fixed to chart area height, scrollable */}
        <div>
          <Card style={{ padding: 0 }}>
            <div style={{ fontWeight: 700, padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
              Stock Alerts
              {lowStockItems.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>
                  ({lowStockItems.length})
                </span>
              )}
            </div>
            <div
              style={{
                overflowY: 'auto',
                maxHeight: 258,
                padding: '10px 14px 10px',
              }}
            >
              {lowStockItems.length === 0 ? (
                <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No stock alerts.</div>
              ) : (
                lowStockItems.map((it) => (
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
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom section: full-width item table */}
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
            placeholder="Search item, category..."
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
            <Btn
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                clearError()
                setFormErrors({})
                setNewItem(EMPTY_ITEM)
                setEditItem(null)
                setAddModal(true)
              }}
            >
              + Add Item
            </Btn>
          )}
        </div>

        <DataTable
          headers={['Item Code', 'Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Price', 'Total Value (₹)', 'Status', 'Actions']}
          loading={loading}
          rows={filtered.map((it) => [
            it.item_code || '—',
            <div key={`name-${it.id}`}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
            </div>,
            it.category_name || '—',
            (it.item_type || '').toUpperCase(),
            `${it.available_quantity} ${it.unit}`,
            `${it.threshold_quantity} ${it.unit}`,
            it.unit_cost !== null && it.unit_cost !== undefined ? `₹${parseFloat(it.unit_cost).toFixed(2)}` : '—',
            `₹${parseFloat(it.total_value || 0).toFixed(2)}`,
            <Badge key={`st-${it.id}`} value={itemStatus(it)} />,
            <div key={`act-${it.id}`} style={{ display: 'flex', gap: 6 }}>
              {canAdmin && (
                <Btn size="sm" variant="secondary" onClick={() => openEdit(it)}>
                  Edit
                </Btn>
              )}
              <Btn size="sm" variant="ghost" onClick={() => openHistory(it)}>
                History
              </Btn>
            </div>,
          ])}
        />
      </Card>

      <Modal
        open={addModal}
        onClose={() => {
          setAddModal(false)
          setFormErrors({})
          setEditItem(null)
        }}
        title={editItem ? `Edit Item - ${editItem.name || ''}` : 'Add Inventory Item'}
        width={620}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              {editItem ? (
                <Btn
                  variant="danger"
                  onClick={() => {
                    setAddModal(false)
                    setFormErrors({})
                    setDeleteTarget(editItem)
                    setEditItem(null)
                  }}
                >
                  Delete Item
                </Btn>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn
                variant="ghost"
                onClick={() => {
                  setAddModal(false)
                  setFormErrors({})
                  setEditItem(null)
                }}
              >
                Cancel
              </Btn>
              <Btn onClick={doCreateItem} disabled={saving}>
              {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Create'}
              </Btn>
            </div>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Item Code">
            <Input
              value={newItem.item_code}
              onChange={(e) => setNewItem((p) => ({ ...p, item_code: e.target.value }))}
              placeholder="e.g. 3.01"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={newItem.name}
              onChange={(e) => {
                const value = e.target.value
                setNewItem((p) => ({ ...p, name: value }))
                if (formErrors.name && value.trim()) {
                  setFormErrors((p) => ({ ...p, name: '' }))
                }
              }}
            />
            {formErrors.name && (
              <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{formErrors.name}</div>
            )}
          </Field>
          <Field label="Category" required>
            <SelectField
              value={newItem.category}
              onChange={(e) => {
                const value = e.target.value
                setNewItem((p) => ({ ...p, category: value }))
                if (formErrors.category && value) {
                  setFormErrors((p) => ({ ...p, category: '' }))
                }
              }}
            >
              <option value="">Choose category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            {formErrors.category && (
              <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{formErrors.category}</div>
            )}
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
            <SelectField
              value={newItem.unit}
              onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
            >
              <option value="pieces">Pieces</option>
              <option value="litres">Litres</option>
              <option value="kg">Kilograms</option>
              <option value="metres">Metres</option>
              <option value="packets">Packets</option>
              <option value="bottles">Bottles</option>
              <option value="boxes">Boxes</option>
            </SelectField>
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
              onChange={(e) => {
                setNewItem((p) => ({ ...p, available_quantity: e.target.value }))
                if (formErrors.available_quantity) {
                  setFormErrors((p) => ({ ...p, available_quantity: '' }))
                }
              }}
            />
            {formErrors.available_quantity && (
              <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{formErrors.available_quantity}</div>
            )}
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

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Item"
        message={`Delete item ${deleteTarget?.name || ''}? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        onConfirm={doDeleteItem}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={deleting}
        cancelDisabled={deleting}
      />
    </div>
  )
}
