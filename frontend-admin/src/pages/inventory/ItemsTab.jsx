import { useMemo, useState } from 'react'

import { asList, todayISO } from '../../shared/utils'
import { exportReport } from '../../shared/exportHelper'
import { inventoryAPI } from '../../api/inventory'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  ExportDropdown,
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

const UNIT_OPTIONS = [
  { value: 'pieces', label: 'Pieces' },
  { value: 'Each', label: 'Each' },
  { value: 'litres', label: 'Litres' },
  { value: 'Ltr', label: 'Ltr' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'Kg', label: 'Kg' },
  { value: 'metres', label: 'Metres' },
  { value: 'packets', label: 'Packets' },
  { value: 'Packet', label: 'Packet' },
  { value: 'bottles', label: 'Bottles' },
  { value: 'boxes', label: 'Boxes' },
  { value: 'Pair', label: 'Pair' },
  { value: 'Roll', label: 'Roll' },
]

export default function ItemsTab({ userRole, initialCategory = null }) {
  const { run: runAction, saving, error: actionError, clearError } = useAsyncAction()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || 'all')
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEvents, setHistoryEvents] = useState([])
  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [formErrors, setFormErrors] = useState({})
  const [deleting, setDeleting] = useState(false)

  const canAdmin = ['admin', 'inventory_manager', 'hk_inventory_manager', 'horticulture_manager'].includes(userRole)
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

  const getInitialNewItem = () => {
    let catId = ''
    const targetCat = categoryFilter !== 'all' ? categoryFilter : initialCategory
    if (targetCat) {
      const match = categories.find(
        (c) => String(c.name || '').trim().toLowerCase() === String(targetCat).trim().toLowerCase()
      )
      if (match) catId = String(match.id)
    }
    return { ...EMPTY_ITEM, category: catId }
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
      const hitCat =
        categoryFilter === 'all' ||
        String(it.category_name || '').trim().toLowerCase() === String(categoryFilter).trim().toLowerCase() ||
        String(it.category || '') === String(categoryFilter) ||
        String(it.category_id || '') === String(categoryFilter)
      return hit && hitType && hitCat
    })
  }, [items, search, typeFilter, categoryFilter])

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

  const csvRows = useMemo(
    () =>
      filtered.map((it) => {
        const status = itemStatus(it)
        return {
          'Item Code': it.item_code || '',
          Name: it.name || '',
          Category: it.category_name || '',
          Type: String(it.item_type || '').toUpperCase(),
          Unit: it.unit || '',
          'Total Quantity': it.total_quantity ?? 0,
          'Available Quantity': it.available_quantity ?? 0,
          'Threshold Quantity': it.threshold_quantity ?? 0,
          'Unit Price INR': Number(it.unit_cost || 0).toFixed(2),
          'Total Value INR': Number(it.total_value || 0).toFixed(2),
          Status: status.replace(/_/g, ' ').toUpperCase(),
        }
      }),
    [filtered]
  )

  const handleExportItems = async (format) => {
    const filterName = typeFilter === 'all' ? 'All Items' : typeFilter === 'consumable' ? 'Consumables' : 'Assets'
    const inStock = filtered.filter((i) => itemStatus(i) === 'in_stock').length
    const totalVal = filtered.reduce((acc, it) => acc + Number(it.total_value || 0), 0)
    const exportData = {
      filename: `inventory_items_${typeFilter}_${todayISO()}`,
      module: 'Inventory Management',
      title: 'Inventory Stock Directory',
      subtitle: `Filter: ${filterName} • Generated: ${todayISO()}`,
      metadata: [
        { label: 'Filter', value: filterName },
        { label: 'Date', value: todayISO() },
        { label: 'Total Items Listed', value: filtered.length },
      ],
      stats: [
        { label: 'Total Items', value: filtered.length },
        { label: 'In Stock', value: inStock },
        { label: 'Low Stock', value: stockCounts.lowStock },
        { label: 'Out of Stock', value: stockCounts.outOfStock },
        { label: 'Total Value (INR)', value: `₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
      ],
      headers: ['Item Code', 'Item Name', 'Category', 'Type', 'Unit', 'Available', 'Threshold', 'Unit Cost (INR)', 'Total Value (INR)', 'Status'],
      rows: filtered.map((it) => [
        it.item_code || '-',
        it.name || '-',
        it.category_name || '-',
        String(it.item_type || '-').toUpperCase(),
        it.unit || '-',
        it.available_quantity ?? 0,
        it.threshold_quantity ?? 0,
        Number(it.unit_cost || 0).toFixed(2),
        Number(it.total_value || 0).toFixed(2),
        itemStatus(it).replace(/_/g, ' ').toUpperCase(),
      ]),
    }
    await exportReport(format, exportData)
  }

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
            <StatCard label="Total Items" value={categoryFilter === 'all' ? (summary?.total_items ?? items.length) : filtered.length} icon="📦" />
            <StatCard label="Low Stock" value={categoryFilter === 'all' ? (summary?.low_stock_count ?? stockCounts.lowStock) : stockCounts.lowStock} icon="⚠️" color="var(--orange-600)" />
            <StatCard label="Out of Stock" value={categoryFilter === 'all' ? (summary?.out_of_stock_count ?? stockCounts.outOfStock) : stockCounts.outOfStock} icon="🟥" color="#dc2626" />
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
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <option value="all">All Categories ({items.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ExportDropdown
              label="Download Items"
              onExport={handleExportItems}
              disabled={loading || filtered.length === 0}
            />
            {canAdmin && (
              <Btn
                onClick={() => {
                  clearError()
                  setFormErrors({})
                  setNewItem(getInitialNewItem())
                  setEditItem(null)
                  setAddModal(true)
                }}
              >
                + Add Item
              </Btn>
            )}
          </div>
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
        <Alert message={actionError} />
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
              {UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
