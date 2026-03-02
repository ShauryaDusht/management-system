import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui'
import { inventoryAPI } from '../api/inventory'

const UNIT_OPTIONS = ['pieces', 'litres', 'kg', 'metres', 'packets', 'bottles', 'boxes']
const EMPTY_FORM = {
  name: '',
  category: '',
  item_type: 'consumable',
  unit: 'pieces',
  total_quantity: '',
  available_quantity: '',
  threshold_quantity: '',
  unit_cost: '',
  description: '',
  location: '',
}

function statusMeta(item) {
  const available = Number(item.available_quantity || 0)
  const threshold = Number(item.threshold_quantity || 0)
  if (available === 0) return { label: 'Out of Stock', classes: 'bg-red-100 text-red-700 border border-red-200' }
  if (available <= threshold) return { label: 'Low Stock', classes: 'bg-amber-100 text-amber-700 border border-amber-200' }
  return { label: 'In Stock', classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200' }
}

function normalizeList(payload) {
  return payload?.results ?? payload ?? []
}

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function ItemsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [categories, setCategories] = useState([])

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 350)
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const [adjustingId, setAdjustingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const loadCategories = useCallback(async () => {
    try {
      const response = await inventoryAPI.getCategories()
      setCategories(normalizeList(response.data))
    } catch {
      setCategories([])
    }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      if (typeFilter) params.item_type = typeFilter
      if (categoryFilter) params.category = categoryFilter

      const response = await inventoryAPI.getItems(params)
      const list = normalizeList(response.data)
      setItems(list)
      setTotalCount(response.data?.count ?? list.length)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inventory items.')
      setItems([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, debouncedSearch, typeFilter])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadItems() }, [loadItems])

  const openAddModal = () => {
    setSelectedItem(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalMode('add')
  }

  const openEditModal = (item) => {
    setSelectedItem(item)
    setForm({
      name: item.name ?? '',
      category: String(item.category ?? ''),
      item_type: item.item_type ?? 'consumable',
      unit: item.unit ?? 'pieces',
      total_quantity: String(item.total_quantity ?? ''),
      available_quantity: String(item.available_quantity ?? ''),
      threshold_quantity: String(item.threshold_quantity ?? ''),
      unit_cost: item.unit_cost ?? '',
      description: item.description ?? '',
      location: item.location ?? '',
    })
    setFormError('')
    setModalMode('edit')
  }

  const openDeleteModal = (item) => {
    setSelectedItem(item)
    setModalMode('delete')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedItem(null)
    setFormError('')
  }

  const onFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const saveItem = async () => {
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: form.name.trim(),
        category: Number(form.category),
        item_type: form.item_type,
        unit: form.unit,
        total_quantity: Number(form.total_quantity),
        available_quantity: Number(form.available_quantity),
        threshold_quantity: Number(form.threshold_quantity),
        unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        description: form.description,
        location: form.location,
      }
      if (modalMode === 'add') {
        await inventoryAPI.createItem(payload)
      } else if (selectedItem) {
        await inventoryAPI.updateItem(selectedItem.id, payload)
      }
      closeModal()
      await loadItems()
    } catch (err) {
      const data = err.response?.data
      setFormError(data ? JSON.stringify(data) : 'Unable to save item.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!selectedItem) return
    setSaving(true)
    try {
      await inventoryAPI.deleteItem(selectedItem.id)
      closeModal()
      await loadItems()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Unable to delete item.')
    } finally {
      setSaving(false)
    }
  }

  const onAdjustStock = async (item, action) => {
    if (!isAdmin) return
    setAdjustingId(`${item.id}:${action}`)
    setActionError('')
    try {
      const response = await inventoryAPI.adjustStock(item.id, action, 1)
      const updated = response.data
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)))
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Stock update failed.')
    } finally {
      setAdjustingId(null)
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Inventory Items</h1>
            <p className="text-sm text-slate-500 mt-0.5">{totalCount} items</p>
          </div>
          {isAdmin && <Button onClick={openAddModal}>+ Add Item</Button>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by item name"
            />
            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All Types</option>
              <option value="asset">Asset</option>
              <option value="consumable">Consumable</option>
            </Select>
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center"><Spinner /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700 text-sm">{error}</p>
            <div className="mt-4">
              <Button variant="outline" onClick={loadItems}>Retry</Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">No inventory items found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Item Name', 'Category', 'Type', 'Unit', 'Total', 'Available', 'Threshold', 'Status', 'Actions'].map((header) => (
                      <th
                        key={header}
                        className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${
                          ['Total', 'Available', 'Threshold'].includes(header) ? 'text-right' : 'text-left'
                        }`}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const meta = statusMeta(item)
                    const decreaseBusy = adjustingId === `${item.id}:decrease`
                    const increaseBusy = adjustingId === `${item.id}:increase`
                    return (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {item.name}
                          {item.unit_cost_missing && (
                            <span className="ml-2 text-xs text-amber-500" title="Unit cost not set — report totals will show ₹0">
                              ⚠ no cost
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.category_name}</td>
                        <td className="px-4 py-3 text-slate-700 capitalize">{item.item_type}</td>
                        <td className="px-4 py-3 text-slate-700">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{item.total_quantity}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isAdmin && (
                              <button
                                type="button"
                                className="w-7 h-7 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => onAdjustStock(item, 'decrease')}
                                disabled={decreaseBusy || increaseBusy || Number(item.available_quantity) <= 0}
                                title="Decrease stock by 1"
                              >
                                {decreaseBusy ? '…' : '-'}
                              </button>
                            )}
                            <span className="min-w-[2rem] text-right font-semibold text-slate-900">
                              {item.available_quantity}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                className="w-7 h-7 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => onAdjustStock(item, 'increase')}
                                disabled={decreaseBusy || increaseBusy}
                                title="Increase stock by 1"
                              >
                                {increaseBusy ? '…' : '+'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{item.threshold_quantity}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${meta.classes}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/items/${item.id}/history`)}>
                                History
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEditModal(item)}>
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => openDeleteModal(item)}
                              >
                                Delete
                              </Button>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalMode === 'add' || modalMode === 'edit'}
        onClose={closeModal}
        title={modalMode === 'add' ? 'Add Item' : 'Edit Item'}
        footer={(
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={saveItem} disabled={saving}>
              {saving ? 'Saving...' : modalMode === 'add' ? 'Create Item' : 'Save Changes'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <Field label="Name">
            <Input name="name" value={form.name} onChange={onFormChange} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Category">
              <Select name="category" value={form.category} onChange={onFormChange}>
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="item_type" value={form.item_type} onChange={onFormChange}>
                <option value="asset">Asset</option>
                <option value="consumable">Consumable</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Unit">
              <Select name="unit" value={form.unit} onChange={onFormChange}>
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit Cost">
              <Input name="unit_cost" type="number" min="0" step="0.01" value={form.unit_cost} onChange={onFormChange} />
            </Field>
          </div>
          <Field label="Location">
            <Input name="location" value={form.location} onChange={onFormChange} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Total Qty">
              <Input name="total_quantity" type="number" min="0" value={form.total_quantity} onChange={onFormChange} />
            </Field>
            <Field label="Available Qty">
              <Input name="available_quantity" type="number" min="0" value={form.available_quantity} onChange={onFormChange} />
            </Field>
            <Field label="Threshold">
              <Input name="threshold_quantity" type="number" min="0" value={form.threshold_quantity} onChange={onFormChange} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea name="description" rows={3} value={form.description} onChange={onFormChange} />
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={modalMode === 'delete'}
        onClose={closeModal}
        title="Delete Item"
        footer={(
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Yes, Delete'}
            </Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-slate-900">{selectedItem?.name}</span>?
          This cannot be undone.
        </p>
      </Modal>
    </Layout>
  )
}