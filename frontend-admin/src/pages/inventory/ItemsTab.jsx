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

const PAGE_SIZE_OPTIONS = [10, 20, 50]

// ── Reusable pagination bar ───────────────────────────────────────────────────
function PaginationBar({ page, totalPages, total, pageSize, onPage, onPageSize, label = '' }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 8,
      padding: '10px 16px', borderTop: '1px solid var(--border)',
      fontSize: 12, color: 'var(--text-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1) }}
          style={{
            fontSize: 12, padding: '2px 6px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {label && <span style={{ marginLeft: 4, color: 'var(--text-3)' }}>· {label}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ marginRight: 8 }}>
          {from}–{to} of <strong>{total}</strong>
        </span>
        <PagBtn onClick={() => onPage(1)}        disabled={page === 1}>«</PagBtn>
        <PagBtn onClick={() => onPage(page - 1)} disabled={page === 1}>‹</PagBtn>
        {getPagRange(page, totalPages).map((p, i) =>
          p === '…'
            ? <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--text-3)' }}>…</span>
            : <PagBtn key={p} onClick={() => onPage(p)} active={p === page}>{p}</PagBtn>
        )}
        <PagBtn onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</PagBtn>
        <PagBtn onClick={() => onPage(totalPages)} disabled={page === totalPages}>»</PagBtn>
      </div>
    </div>
  )
}

function PagBtn({ onClick, disabled, active, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
        background: active ? 'var(--green-800)' : 'var(--surface)',
        color: active ? '#fff' : disabled ? 'var(--text-3)' : 'var(--text)',
        fontSize: 12, fontWeight: active ? 700 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: '0 6px',
      }}
    >
      {children}
    </button>
  )
}

function getPagRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

// ── Category section with its own pagination ─────────────────────────────────
function CategorySection({ categoryName, items, canAdmin, onAdjust, onHistory }) {
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(10)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const paginated  = items.slice((page - 1) * pageSize, page * pageSize)

  // Reset to page 1 when items change (filter applied)
  useEffect(() => setPage(1), [items.length])

  return (
    <Card noPad style={{ marginBottom: 14 }}>
      {/* Category header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🗂️</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{categoryName}</span>
          <span style={{
            background: 'var(--surface-2)', color: 'var(--text-3)',
            borderRadius: 99, fontSize: 11, fontWeight: 600,
            padding: '2px 8px',
          }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <DataTable
        headers={['Name', 'Type', 'Available', 'Threshold', 'Status', 'Actions']}
        rows={paginated.map((it) => [
          <div key={`name-${it.id}`}>
            <div style={{ fontWeight: 600 }}>{it.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.location || '—'}</div>
          </div>,
          (it.item_type || '').toUpperCase(),
          `${it.available_quantity} ${it.unit}`,
          `${it.threshold_quantity} ${it.unit}`,
          <Badge key={`st-${it.id}`} value={itemStatus(it)} />,
          <div key={`act-${it.id}`} style={{ display: 'flex', gap: 6 }}>
            {canAdmin && (
              <Btn size="sm" variant="ghost" onClick={() => onAdjust(it)}>Adjust</Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={() => onHistory(it)}>History</Btn>
          </div>,
        ])}
      />

      <PaginationBar
        page={page} totalPages={totalPages} total={items.length}
        pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}
      />
    </Card>
  )
}

export default function ItemsTab({ userRole }) {
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [items, setItems]             = useState([])
  const [categories, setCategories]   = useState([])
  const [summary, setSummary]         = useState(null)
  const [search, setSearch]           = useState('')
  const [typeFilter, setTypeFilter]   = useState('all')
  const [viewMode, setViewMode]       = useState('all')   // 'all' | 'by_category'
  const [adjustModal, setAdjustModal] = useState(null)
  const [addModal, setAddModal]       = useState(false)
  const [historyModal, setHistoryModal]     = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEvents, setHistoryEvents]   = useState([])
  const [adjustData, setAdjustData]         = useState({ action: 'increase', quantity: 1 })
  const [newItem, setNewItem]               = useState(EMPTY_ITEM)
  const [saving, setSaving]                 = useState(false)

  // Pagination state for "All Items" flat table
  const [allPage, setAllPage]         = useState(1)
  const [allPageSize, setAllPageSize] = useState(20)

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

  useEffect(() => { load() }, [])

  // Reset to page 1 on filter / search change
  useEffect(() => { setAllPage(1) }, [search, typeFilter])

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

  // "All Items" paginated slice
  const allTotalPages  = Math.max(1, Math.ceil(filtered.length / allPageSize))
  const allPageSlice   = filtered.slice((allPage - 1) * allPageSize, allPage * allPageSize)

  // Group filtered items by category for "By Category" view
  const byCategory = useMemo(() => {
    const map = {}
    filtered.forEach((it) => {
      const key = it.category_name || 'Uncategorized'
      if (!map[key]) map[key] = []
      map[key].push(it)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const lowStockItems = filtered.filter((i) => itemStatus(i) !== 'in_stock')

  const stockCounts = useMemo(() => ({
    lowStock:   filtered.filter((i) => itemStatus(i) === 'low_stock').length,
    outOfStock: filtered.filter((i) => itemStatus(i) === 'out_of_stock').length,
  }), [filtered])

  const byTypeChart = useMemo(() => {
    return ['consumable', 'asset'].map((type) => {
      const list = filtered.filter((it) => it.item_type === type)
      return {
        name: type,
        in_stock:     list.filter((i) => itemStatus(i) === 'in_stock').length,
        low_stock:    list.filter((i) => itemStatus(i) === 'low_stock').length,
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
        total_quantity:     Number(newItem.total_quantity || 0),
        available_quantity: Number(newItem.available_quantity || 0),
        threshold_quantity: Number(newItem.threshold_quantity || 0),
        unit_cost:          Number(newItem.unit_cost || 0),
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

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10, marginBottom: 14,
        }}>
          <StatCard label="Total Items"       value={summary?.total_items ?? items.length}           icon="📦" />
          <StatCard label="Low Stock"         value={summary?.low_stock_count ?? stockCounts.lowStock}   icon="⚠️"  color="var(--orange-600)" />
          <StatCard label="Out of Stock"      value={summary?.out_of_stock_count ?? stockCounts.outOfStock} icon="🟥"  color="#dc2626" />
          <StatCard label="Pending Requests"  value={summary?.pending_requests ?? 0}                  icon="📋"  color="#3b82f6" />
        </div>

        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock Overview by Type</div>
          <BarGroupChart
            data={byTypeChart}
            bars={[
              { key: 'in_stock',     label: 'In Stock' },
              { key: 'low_stock',    label: 'Low Stock' },
              { key: 'out_of_stock', label: 'Out of Stock' },
            ]}
            height={180}
          />
        </Card>

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10,
        }}>
          <Input
            placeholder="Search item, category, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <Btn size="sm" variant={typeFilter === 'all'        ? 'primary' : 'secondary'} onClick={() => setTypeFilter('all')}>All</Btn>
          <Btn size="sm" variant={typeFilter === 'consumable' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('consumable')}>Consumables</Btn>
          <Btn size="sm" variant={typeFilter === 'asset'      ? 'primary' : 'secondary'} onClick={() => setTypeFilter('asset')}>Assets</Btn>

          {/* View mode toggle */}
          <div style={{
            display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden',
            border: '1px solid var(--border)', marginLeft: 4,
          }}>
            {[['all', '≡ All Items'], ['by_category', '🗂 By Category']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: 'none', borderRight: mode === 'all' ? '1px solid var(--border)' : 'none',
                background: viewMode === mode ? 'var(--green-800)' : 'var(--surface)',
                color: viewMode === mode ? '#fff' : 'var(--text-2)',
              }}>{label}</button>
            ))}
          </div>

          {canAdmin && (
            <Btn style={{ marginLeft: 'auto' }} onClick={() => setAddModal(true)}>+ Add Item</Btn>
          )}
        </div>

        {/* ── All Items flat table ── */}
        {viewMode === 'all' && (
          <Card noPad>
            <DataTable
              headers={['Name', 'Category', 'Type', 'Available', 'Threshold', 'Status', 'Actions']}
              loading={loading}
              rows={allPageSlice.map((it) => [
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
                    <Btn size="sm" variant="ghost" onClick={() => setAdjustModal(it)}>Adjust</Btn>
                  )}
                  <Btn size="sm" variant="ghost" onClick={() => openHistory(it)}>History</Btn>
                </div>,
              ])}
            />
            <PaginationBar
              page={allPage} totalPages={allTotalPages}
              total={filtered.length} pageSize={allPageSize}
              onPage={setAllPage} onPageSize={setAllPageSize}
              label={`${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}
            />
          </Card>
        )}

        {/* ── By Category view — each category has its own paginated table ── */}
        {viewMode === 'by_category' && (
          loading ? (
            <Card><div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div></Card>
          ) : byCategory.length === 0 ? (
            <Card><div style={{ color: 'var(--text-3)', fontSize: 13 }}>No items match your filters.</div></Card>
          ) : (
            byCategory.map(([catName, catItems]) => (
              <CategorySection
                key={catName}
                categoryName={catName}
                items={catItems}
                canAdmin={canAdmin}
                onAdjust={setAdjustModal}
                onHistory={openHistory}
              />
            ))
          )
        )}
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

