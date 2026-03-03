import { useEffect, useState } from 'react'

import { inventoryAPI } from '../../api/inventory'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField } from '../../components/ui'

function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.items)) return data.items
  return []
}

export default function StockLogTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState([])
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_added: 1, notes: '' })
  const canAdmin = userRole === 'admin'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [entryRes, itemRes] = await Promise.all([
        inventoryAPI.getStockEntries(),
        inventoryAPI.getItems(),
      ])
      setEntries(asList(entryRes.data))
      setItems(asList(itemRes.data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load stock log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const addStock = async () => {
    setSaving(true)
    try {
      await inventoryAPI.createStockEntry({
        item: Number(form.item),
        quantity_added: Number(form.quantity_added),
        notes: form.notes,
      })
      setModal(false)
      setForm({ item: '', quantity_added: 1, notes: '' })
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add stock.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 700 }}>Replenishment Log</div>
          {canAdmin && <Btn onClick={() => setModal(true)}>+ Add Stock</Btn>}
        </div>
        <DataTable
          loading={loading}
          headers={['Item', 'Quantity Added', 'Unit', 'Added By', 'Date', 'Notes']}
          rows={entries.map((e) => [
            e.item_name || e.item || '—',
            e.quantity_added,
            e.item_unit || '—',
            e.added_by_name || '—',
            new Date(e.added_at).toLocaleString('en-IN'),
            e.notes || '—',
          ])}
        />
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add Stock Entry"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Btn>
            <Btn onClick={addStock} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </>
        }
      >
        <Field label="Item">
          <SelectField value={form.item} onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))}>
            <option value="">Select item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Quantity Added">
          <Input
            type="number"
            value={form.quantity_added}
            onChange={(e) => setForm((p) => ({ ...p, quantity_added: e.target.value }))}
          />
        </Field>
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  )
}
