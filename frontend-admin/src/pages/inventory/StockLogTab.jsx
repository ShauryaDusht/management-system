import { useState } from 'react'

import { asList } from '../../shared/utils'
import { exportReport } from '../../shared/exportHelper'
import { inventoryAPI } from '../../api/inventory'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import { Alert, Btn, Card, DataTable, ExportDropdown, Field, Input, Modal, SelectField } from '../../components/ui'

export default function StockLogTab({ userRole, categoryScope, excludeCategoryScope }) {
  const [entries, setEntries] = useState([])
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ item: '', quantity_added: 1, notes: '' })
  const canAdmin = userRole === 'admin' || userRole === 'hk_inventory_manager' || userRole === 'horticulture_manager' || userRole === 'inventory_manager'

  const { run: runAction, saving, error: actionError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const params = {}
    if (categoryScope) params.category = categoryScope
    if (excludeCategoryScope) params.exclude_category = excludeCategoryScope

    const [entryRes, itemRes] = await Promise.all([
      inventoryAPI.getStockEntries(params),
      inventoryAPI.getItems(params),
    ])

    const rawEntries = asList(entryRes.data)
    const rawItems = asList(itemRes.data)

    // Build item ID -> category name map for client-side filtering safeguard
    const itemCatMap = new Map()
    rawItems.forEach((i) => {
      const catName = i.category_name || (typeof i.category === 'object' ? i.category?.name : '') || ''
      itemCatMap.set(i.id, catName)
    })

    let filteredEntries = rawEntries
    if (categoryScope) {
      filteredEntries = filteredEntries.filter((e) => {
        const cat = e.category_name || itemCatMap.get(e.item) || ''
        const notes = (e.notes || '').toLowerCase()
        if (categoryScope === 'Garden & Horticulture Equipment') {
          return cat.toLowerCase().includes('horticulture') || notes.includes('[horticulture') || itemCatMap.has(e.item)
        }
        return cat.toLowerCase() === categoryScope.toLowerCase()
      })
    } else if (excludeCategoryScope) {
      filteredEntries = filteredEntries.filter((e) => {
        const cat = e.category_name || itemCatMap.get(e.item) || ''
        const notes = (e.notes || '').toLowerCase()
        if (excludeCategoryScope === 'Garden & Horticulture Equipment') {
          return !cat.toLowerCase().includes('horticulture') && !notes.includes('[horticulture')
        }
        return cat.toLowerCase() !== excludeCategoryScope.toLowerCase()
      })
    }

    setEntries(filteredEntries)
    setItems(rawItems)
    return null
  }, [categoryScope, excludeCategoryScope], 'Failed to load stock log.')

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

  const handleExportReplenishment = async (format) => {
    const totalQty = entries.reduce((acc, e) => acc + Number(e.quantity_added || 0), 0)
    const isHort = Boolean(categoryScope)
    const exportData = {
      filename: `${isHort ? 'horticulture_' : ''}replenishment_log_${new Date().toISOString().slice(0, 10)}`,
      module: isHort ? 'Horticulture Replenishment' : 'Inventory Replenishment',
      title: isHort ? 'Horticulture Replenishment Log' : 'Inventory Replenishment Log',
      subtitle: `Total Entries: ${entries.length} • Total Quantity Added: ${totalQty}`,
      metadata: [
        { label: 'Generated On', value: new Date().toLocaleString('en-IN') },
        { label: 'Total Entries', value: entries.length },
        { label: 'Total Qty Added', value: totalQty },
      ],
      stats: [
        { label: 'Total Entries', value: entries.length },
        { label: 'Total Qty Added', value: totalQty },
      ],
      headers: ['Item Code', 'Item', 'Quantity Added', 'Unit', 'Added By', 'Date', 'Notes'],
      rows: entries.map((e) => [
        e.item_code || '—',
        e.item_name || e.item || '—',
        e.quantity_added ?? 0,
        e.item_unit || '—',
        e.added_by_name || '—',
        e.added_at ? new Date(e.added_at).toLocaleString('en-IN') : '—',
        e.notes || '—',
      ]),
    }
    await exportReport(format, exportData)
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
          <div style={{ fontWeight: 700 }}>
            {categoryScope ? 'Horticulture Replenishment Log' : 'Replenishment Log'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ExportDropdown
              label="Download Log"
              onExport={handleExportReplenishment}
              disabled={loading || entries.length === 0}
            />
            {canAdmin && <Btn onClick={() => setModal(true)}>+ Add Stock</Btn>}
          </div>
        </div>
        <DataTable
          loading={loading}
          headers={['Item Code', 'Item', 'Quantity Added', 'Unit', 'Added By', 'Date', 'Notes']}
          rows={entries.map((e) => [
            e.item_code || '—',
            e.item_name || e.item || '—',
            e.quantity_added,
            e.item_unit || '—',
            e.added_by_name || '—',
            e.added_at ? new Date(e.added_at).toLocaleString('en-IN') : '—',
            e.notes || '—',
          ])}
        />
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={categoryScope ? 'Add Horticulture Stock Entry' : 'Add Stock Entry'}
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
