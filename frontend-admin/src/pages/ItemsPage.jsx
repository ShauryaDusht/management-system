import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { inventoryAPI } from '../api/inventory'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import {
  PageHeader, Button, Badge, StatusBadge, Modal,
  Field, Input, Select, Textarea, Alert, Spinner, Table
} from '../components/ui'

const UNITS = ['pieces', 'litres', 'kg', 'metres', 'packets', 'bottles', 'boxes']
const EMPTY_FORM = {
  name: '', category: '', item_type: 'consumable', unit: 'pieces',
  total_quantity: '', threshold_quantity: '', unit_cost: '',
  description: '', location: '',
}

export default function ItemsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  // Modal state
  const [modal, setModal] = useState(null) // null | 'add' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterType) params.type = filterType
      if (filterCategory) params.category = filterCategory
      const [itemsRes, catRes] = await Promise.all([
        inventoryAPI.getItems(params),
        inventoryAPI.getCategories(),
      ])
      setItems(itemsRes.data.results ?? itemsRes.data)
      setCategories(catRes.data.results ?? catRes.data)
    } finally {
      setLoading(false)
    }
  }, [search, filterType, filterCategory])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setError('')
    setModal('add')
  }

  const openEdit = (item) => {
    setSelected(item)
    setForm({
      name: item.name,
      category: item.category,
      item_type: item.item_type,
      unit: item.unit,
      total_quantity: item.total_quantity,
      threshold_quantity: item.threshold_quantity,
      unit_cost: item.unit_cost ?? '',
      description: item.description,
      location: item.location,
    })
    setError('')
    setModal('edit')
  }

  const openDelete = (item) => {
    setSelected(item)
    setModal('delete')
  }

  const closeModal = () => {
    setModal(null)
    setSelected(null)
    setError('')
  }

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        total_quantity: Number(form.total_quantity),
        threshold_quantity: Number(form.threshold_quantity),
        unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
        category: Number(form.category),
      }
      if (modal === 'add') {
        await inventoryAPI.createItem(payload)
      } else {
        await inventoryAPI.updateItem(selected.id, payload)
      }
      closeModal()
      load()
    } catch (err) {
      const data = err.response?.data
      setError(data ? JSON.stringify(data) : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await inventoryAPI.deleteItem(selected.id)
      closeModal()
      load()
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Item Name', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { key: 'category_name', label: 'Category' },
    { key: 'item_type', label: 'Type', render: (r) => <StatusBadge value={r.item_type} /> },
    { key: 'unit', label: 'Unit' },
    {
      key: 'available_quantity', label: 'Available', align: 'right',
      render: (r) => (
        <span className={r.is_below_threshold ? 'text-red-600 font-semibold' : 'text-slate-700'}>
          {r.available_quantity}
        </span>
      )
    },
    { key: 'threshold_quantity', label: 'Threshold', align: 'right' },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge value={r.status} /> },
    ...(isAdmin ? [{
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/items/${r.id}/history`)}>History</Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => openDelete(r)} className="text-red-500 hover:text-red-700">Delete</Button>
        </div>
      )
    }] : []),
  ]

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader
          title="Inventory Items"
          subtitle={`${items.length} items total`}
          action={isAdmin && <Button onClick={openAdd}>+ Add Item</Button>}
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-40">
            <option value="">All Types</option>
            <option value="asset">Asset</option>
            <option value="consumable">Consumable</option>
          </Select>
          <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-48">
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <Table columns={columns} data={items} emptyMessage="No items found. Add your first item." />
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modal === 'add' || modal === 'edit'}
        onClose={closeModal}
        title={modal === 'add' ? 'Add New Item' : 'Edit Item'}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Item'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={error} />
          <Field label="Item Name *">
            <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Floor Cleaner" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category *">
              <Select name="category" value={form.category} onChange={handleChange}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type *">
              <Select name="item_type" value={form.item_type} onChange={handleChange}>
                <option value="consumable">Consumable</option>
                <option value="asset">Asset</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Unit *">
              <Select name="unit" value={form.unit} onChange={handleChange}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Total Qty *">
              <Input name="total_quantity" type="number" min="0" value={form.total_quantity} onChange={handleChange} />
            </Field>
            <Field label="Threshold *">
              <Input name="threshold_quantity" type="number" min="0" value={form.threshold_quantity} onChange={handleChange} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Unit Cost (₹)">
              <Input name="unit_cost" type="number" min="0" step="0.01" value={form.unit_cost} onChange={handleChange} />
            </Field>
            <Field label="Location (Assets)">
              <Input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Store Room A" />
            </Field>
          </div>
          <Field label="Description">
            <Textarea name="description" value={form.description} onChange={handleChange} rows={2} />
          </Field>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={modal === 'delete'}
        onClose={closeModal}
        title="Delete Item"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Yes, Delete'}
            </Button>
          </>
        }
      >
        <p className="text-slate-600 text-sm">
          Are you sure you want to delete <strong>{selected?.name}</strong>? This cannot be undone.
        </p>
      </Modal>
    </Layout>
  )
}
