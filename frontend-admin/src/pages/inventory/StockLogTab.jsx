import { useState } from 'react'

import { asList } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField } from '../../components/ui'

function formatCurrency(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function StockLogTab({ userRole }) {
  const [entries, setEntries] = useState([])
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_added: 1, notes: '' })
  const canAdmin = userRole === 'admin'

  const { run: runAction, saving, error: actionError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const [entryRes, itemRes] = await Promise.all([
      inventoryAPI.getStockEntries(),
      inventoryAPI.getItems(),
    ])
    setEntries(asList(entryRes.data))
    setItems(asList(itemRes.data))
    return null
  }, [], 'Failed to load stock log.')

  const error = actionError || loadError

  const addStock = async () => {
    await runAction(async () => {
      await inventoryAPI.createStockEntry({
        item: Number(form.item),
        quantity_added: Number(form.quantity_added),
        notes: form.notes,
      })
      setModal(false)
      setForm({ item: '', quantity_added: 1, notes: '' })
      await reload()
    }, 'Failed to add stock.')
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
          headers={['Code', 'Item', 'Quantity Added', 'Unit', 'Unit Price', 'Added Value', 'Added By', 'Date', 'Notes']}
          rows={entries.map((e) => [
            e.item_code || '—',
            e.item_name || e.item || '—',
            e.quantity_added,
            e.item_unit || '—',
            formatCurrency(e.item_unit_price),
            formatCurrency(e.added_stock_amount),
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
                {(i.item_code ? `${i.item_code} - ` : '') + i.name} ({formatCurrency(i.unit_price ?? i.unit_cost)})
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
