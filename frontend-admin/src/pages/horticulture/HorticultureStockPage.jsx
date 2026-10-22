import { useEffect, useMemo, useState } from 'react'
import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI } from '../../api/inventory'
import { Badge, Btn, Card, Modal, Spinner, StatCard, Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'

const EMPTY_ITEM_FORM = {
  name: '',
  item_code: '',
  item_type: 'asset',
  unit: 'Each',
  total_quantity: 0,
  available_quantity: 0,
  threshold_quantity: 2,
  unit_cost: '',
  description: '',
}

const UNIT_OPTIONS = [
  'Each',
  'pieces',
  'Ltr',
  'Kg',
  'Roll',
  'Pair',
  'Packet',
  'Boxes',
  'metres',
  'bottles',
]

export default function HorticultureStockPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [activeTab, setActiveTab] = useState('items')

  // Data from backend
  const [data, setData] = useState({
    category_id: null,
    category_name: 'Garden & Horticulture Equipment',
    items_summary: { total_items: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 },
    area_stocks_summary: { total_count: 0, low_stock_count: 0 },
    items: [],
    stocks: [],
  })

  // Tab 1 filters (Items)
  const [itemSearch, setItemSearch] = useState('')
  const [itemTypeFilter, setItemTypeFilter] = useState('all')
  const [itemStatusFilter, setItemStatusFilter] = useState('all')

  // Tab 2 filters (Area Stocks)
  const [areaSearch, setAreaSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('all')
  const [selectedItemFilter, setSelectedItemFilter] = useState('all')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // Item Modal (Add/Edit)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await horticultureAPI.getAreaStocks()
      setData(res.data || {})
    } catch (err) {
      console.error(err)
      setError('Failed to load horticulture stock data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Auto-dismiss notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMsg])

  // Extract unique zones and areas for filters
  const zoneOptions = useMemo(() => {
    const map = new Map()
    data.stocks.forEach((s) => {
      if (s.zone_id && !map.has(s.zone_id)) {
        map.set(s.zone_id, { id: s.zone_id, name: s.zone_name, color: s.zone_color })
      }
    })
    return Array.from(map.values())
  }, [data.stocks])

  const areaOptions = useMemo(() => {
    const map = new Map()
    data.stocks.forEach((s) => {
      if (s.area_id && !map.has(s.area_id)) {
        if (zoneFilter === 'all' || String(s.zone_id) === String(zoneFilter)) {
          map.set(s.area_id, { id: s.area_id, name: s.area_name, number: s.area_number })
        }
      }
    })
    return Array.from(map.values()).sort((a, b) => a.number - b.number)
  }, [data.stocks, zoneFilter])

  // Filtered items
  const filteredItems = useMemo(() => {
    return (data.items || []).filter((item) => {
      const q = itemSearch.toLowerCase().trim()
      const matchesSearch =
        !q ||
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.item_code && item.item_code.toLowerCase().includes(q))

      const matchesType = itemTypeFilter === 'all' || item.item_type === itemTypeFilter
      const matchesStatus = itemStatusFilter === 'all' || item.status === itemStatusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [data.items, itemSearch, itemTypeFilter, itemStatusFilter])

  // Filtered area stocks
  const filteredStocks = useMemo(() => {
    return (data.stocks || []).filter((stock) => {
      const q = areaSearch.toLowerCase().trim()
      const matchesSearch =
        !q ||
        (stock.item_name && stock.item_name.toLowerCase().includes(q)) ||
        (stock.area_name && stock.area_name.toLowerCase().includes(q))

      const matchesZone = zoneFilter === 'all' || String(stock.zone_id) === String(zoneFilter)
      const matchesArea = selectedAreaFilter === 'all' || String(stock.area_id) === String(selectedAreaFilter)
      const matchesItem = selectedItemFilter === 'all' || String(stock.item_id) === String(selectedItemFilter)
      const matchesLow = !lowStockOnly || stock.is_low

      return matchesSearch && matchesZone && matchesArea && matchesItem && matchesLow
    })
  }, [data.stocks, areaSearch, zoneFilter, selectedAreaFilter, selectedItemFilter, lowStockOnly])

  // Handlers for Add/Edit
  const handleOpenAdd = () => {
    setEditingItem(null)
    setItemForm(EMPTY_ITEM_FORM)
    setFormErrors({})
    setModalOpen(true)
  }

  const handleOpenEdit = (item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name || '',
      item_code: item.item_code || '',
      item_type: item.item_type || 'asset',
      unit: item.unit || 'Each',
      total_quantity: item.total_quantity ?? 0,
      available_quantity: item.available_quantity ?? 0,
      threshold_quantity: item.threshold_quantity ?? 2,
      unit_cost: item.unit_cost !== null && item.unit_cost !== undefined ? item.unit_cost : '',
      description: item.description || '',
    })
    setFormErrors({})
    setModalOpen(true)
  }

  const handleSaveItem = async () => {
    const errors = {}
    const trimmedName = (itemForm.name || '').trim()
    if (!trimmedName) errors.name = 'Item name is required.'

    const totalQty = Number(itemForm.total_quantity || 0)
    const availQty = Number(itemForm.available_quantity || 0)
    const thresholdQty = Number(itemForm.threshold_quantity || 0)
    const unitCost = itemForm.unit_cost === '' ? null : Number(itemForm.unit_cost)

    if (availQty > totalQty) {
      errors.available_quantity = 'Available quantity cannot exceed total quantity.'
    }
    if (thresholdQty < 0) {
      errors.threshold_quantity = 'Threshold cannot be negative.'
    }

    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: trimmedName,
        item_code: (itemForm.item_code || '').trim() || null,
        category: data.category_id,
        item_type: itemForm.item_type,
        unit: itemForm.unit,
        total_quantity: totalQty,
        available_quantity: availQty,
        threshold_quantity: thresholdQty,
        unit_cost: unitCost,
        description: (itemForm.description || '').trim(),
      }

      if (editingItem) {
        await inventoryAPI.updateItem(editingItem.id, payload)
        setSuccessMsg(`"${trimmedName}" updated successfully. Area stocks synchronized.`)
      } else {
        await inventoryAPI.createItem(payload)
        setSuccessMsg(`"${trimmedName}" created and automatically added to all 42 horticulture area stocks!`)
      }

      setModalOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError(err?.response?.data?.detail || err?.response?.data?.name?.[0] || 'Failed to save item.')
    } finally {
      setSaving(false)
    }
  }

  // Handlers for Delete
  const handleDeleteItem = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      await inventoryAPI.deleteItem(deleteTarget.id)
      setSuccessMsg(`"${deleteTarget.name}" deleted and removed from all horticulture area stocks.`)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      console.error(err)
      setError(err?.response?.data?.detail || 'Failed to delete item.')
    } finally {
      setDeleting(false)
    }
  }

  const tabOptions = [
    { key: 'items', label: `Horticulture Items (${data.items_summary?.total_items || 0})`, icon: '🌿' },
    { key: 'areas', label: `Area Stock Distribution (${data.area_stocks_summary?.total_count || 0})`, icon: '📍' },
  ]

  return (
    <AdminLayout
      title="Horticulture Stock & Inventory"
      subtitle="Exclusive stock list for Garden & Horticulture Equipment, central inventory, and 42 campus area stock levels"
    >
      {/* Notifications */}
      {successMsg && (
        <div style={{
          padding: '12px 18px',
          background: '#ecfdf5',
          border: '1px solid #10b981',
          color: '#065f46',
          borderRadius: 10,
          marginBottom: 16,
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#065f46' }}>×</button>
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px 18px',
          background: '#fef2f2',
          border: '1px solid #ef4444',
          color: '#991b1b',
          borderRadius: 10,
          marginBottom: 16,
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#991b1b' }}>×</button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard
          label="Total Horticulture Items"
          value={data.items_summary?.total_items ?? '-'}
          color="var(--green-800)"
          sub="Garden & Equipment catalog"
        />
        <StatCard
          label="In Stock"
          value={data.items_summary?.in_stock ?? '-'}
          color="#16a34a"
          sub="Sufficient central stock"
        />
        <StatCard
          label="Low Stock Alerts"
          value={data.items_summary?.low_stock ?? '-'}
          color="var(--orange-600)"
          sub="Central stock at/below threshold"
        />
        <StatCard
          label="Out of Stock"
          value={data.items_summary?.out_of_stock ?? '-'}
          color="#dc2626"
          sub="Zero available quantity"
        />
        <StatCard
          label="Campus Area Stock Points"
          value={data.area_stocks_summary?.total_count ?? '-'}
          color="#3b82f6"
          sub="Across 42 horticulture areas"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Tabs tabs={tabOptions} active={activeTab} onChange={setActiveTab} />
        {activeTab === 'items' && (
          <Btn onClick={handleOpenAdd} variant="primary">
            + Add Horticulture Item
          </Btn>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={36} />
        </div>
      ) : activeTab === 'items' ? (
        /* TAB 1: ITEMS CATALOG */
        <Card noPad>
          {/* Filter Bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface-2)' }}>
            <input
              type="text"
              placeholder="Search equipment or items..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              style={{
                flex: '1 1 220px',
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            />
            <select
              value={itemTypeFilter}
              onChange={(e) => setItemTypeFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="all">All Types</option>
              <option value="asset">Assets / Tools</option>
              <option value="consumable">Consumables</option>
            </select>
            <select
              value={itemStatusFilter}
              onChange={(e) => setItemStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="all">All Statuses</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
            {(itemSearch || itemTypeFilter !== 'all' || itemStatusFilter !== 'all') && (
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  setItemSearch('')
                  setItemTypeFilter('all')
                  setItemStatusFilter('all')
                }}
              >
                Reset Filters
              </Btn>
            )}
          </div>

          {/* Items Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Code</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Item Name</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Avail. Stock</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Total Stock</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Unit</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Threshold</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                      No horticulture equipment matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 18px', fontFamily: 'monospace', color: 'var(--text-2)', fontSize: 12 }}>
                        {item.item_code || '-'}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text)' }}>
                        {item.name}
                        {item.description && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginTop: 2 }}>
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: item.item_type === 'asset' ? '#e0f2fe' : '#fef3c7',
                          color: item.item_type === 'asset' ? '#0369a1' : '#b45309',
                        }}>
                          {item.item_type === 'asset' ? 'Tool / Asset' : 'Consumable'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: item.available_quantity <= 0 ? '#dc2626' : 'var(--text)' }}>
                        {item.available_quantity}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-2)' }}>
                        {item.total_quantity}
                      </td>
                      <td style={{ padding: '12px 18px', color: 'var(--text-2)' }}>
                        {item.unit_display || item.unit}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-3)' }}>
                        {item.threshold_quantity}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                        <Badge value={item.status} />
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Btn size="sm" variant="ghost" onClick={() => handleOpenEdit(item)}>
                            Edit
                          </Btn>
                          <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(item)}>
                            Delete
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* TAB 2: AREA-WISE STOCK DISTRIBUTION */
        <Card noPad>
          {/* Area Filters */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface-2)' }}>
            <input
              type="text"
              placeholder="Search area or item name..."
              value={areaSearch}
              onChange={(e) => setAreaSearch(e.target.value)}
              style={{
                flex: '1 1 200px',
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            />
            <select
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value)
                setSelectedAreaFilter('all')
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="all">All Zones</option>
              {zoneOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <select
              value={selectedAreaFilter}
              onChange={(e) => setSelectedAreaFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                maxWidth: 220,
              }}
            >
              <option value="all">All Areas ({areaOptions.length})</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  #{a.number} {a.name}
                </option>
              ))}
            </select>
            <select
              value={selectedItemFilter}
              onChange={(e) => setSelectedItemFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                maxWidth: 220,
              }}
            >
              <option value="all">All Equipment ({data.items?.length || 0})</option>
              {(data.items || []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600, color: lowStockOnly ? '#c2410c' : 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Low Stock Only ⚠️
            </label>
          </div>

          {/* Area Stocks Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Area</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Zone</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Item Name</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Quantity in Area</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Unit</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Threshold</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'center' }}>Stock Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                      No area stock records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((stock) => (
                    <tr
                      key={stock.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: stock.is_low ? '#fffbeb' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 6 }}>#{stock.area_number}</span>
                        {stock.area_name}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                          background: `${stock.zone_color || '#16a34a'}20`,
                          color: stock.zone_color || '#16a34a',
                        }}>
                          {stock.zone_name || 'Zone'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 600 }}>
                        {stock.item_name}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: stock.is_low ? '#b45309' : 'var(--text)' }}>
                        {stock.quantity}
                      </td>
                      <td style={{ padding: '12px 18px', color: 'var(--text-2)' }}>
                        {stock.unit || '-'}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-3)' }}>
                        {stock.low_stock_threshold}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                        {stock.is_low ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#fee2e2',
                            color: '#991b1b',
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            ⚠️ Low Stock ({stock.quantity} left)
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#dcfce7',
                            color: '#166534',
                            fontSize: 11,
                            fontWeight: 600,
                          }}>
                            Sufficient
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: 11, color: 'var(--text-3)' }}>
                        {stock.last_updated ? new Date(stock.last_updated).toLocaleDateString('en-IN') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <Modal
          open={modalOpen}
          onClose={() => !saving && setModalOpen(false)}
          title={editingItem ? 'Edit Horticulture Item' : 'Add Garden & Horticulture Equipment'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Item Name *
              </label>
              <input
                type="text"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="e.g. Lawn Mower, Brush Cutter, Neem Oil"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: formErrors.name ? '1px solid #dc2626' : '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              {formErrors.name && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{formErrors.name}</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Item Code
                </label>
                <input
                  type="text"
                  value={itemForm.item_code}
                  onChange={(e) => setItemForm({ ...itemForm, item_code: e.target.value })}
                  placeholder="e.g. 4.25"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Item Type
                </label>
                <select
                  value={itemForm.item_type}
                  onChange={(e) => setItemForm({ ...itemForm, item_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                >
                  <option value="asset">Asset / Tool (returnable)</option>
                  <option value="consumable">Consumable (fuel, seeds, fertilizer)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Unit
                </label>
                <select
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Total Qty
                </label>
                <input
                  type="number"
                  min="0"
                  value={itemForm.total_quantity}
                  onChange={(e) => setItemForm({ ...itemForm, total_quantity: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Available Qty
                </label>
                <input
                  type="number"
                  min="0"
                  value={itemForm.available_quantity}
                  onChange={(e) => setItemForm({ ...itemForm, available_quantity: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: formErrors.available_quantity ? '1px solid #dc2626' : '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
                {formErrors.available_quantity && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{formErrors.available_quantity}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={itemForm.threshold_quantity}
                  onChange={(e) => setItemForm({ ...itemForm, threshold_quantity: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  Unit Cost (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.unit_cost}
                  onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                  placeholder="Optional"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Description
              </label>
              <textarea
                rows={2}
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Optional notes or specifications"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ fontSize: 12, color: 'var(--green-700)', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
              💡 <strong>Auto-Sync Active:</strong> Adding or updating this item automatically updates the stock records for all 42 campus horticulture areas.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Btn variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Btn>
              <Btn variant="primary" onClick={handleSaveItem} disabled={saving}>
                {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          title="Delete Horticulture Item"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
            </p>
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
              ⚠️ <strong>Warning:</strong> Deleting this item will also permanently remove its corresponding stock records across all 42 horticulture areas!
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Btn>
              <Btn variant="danger" onClick={handleDeleteItem} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
