import { useEffect, useMemo, useState } from 'react'

import { inventoryAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, Spinner } from '../../components/ui'

function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.items)) return data.items
  return []
}

export default function IssuesTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState([])
  const [actionModal, setActionModal] = useState(null)
  const [form, setForm] = useState({
    returned_quantity: 1,
    condition_on_return: '',
    actual_quantity_used: 1,
    notes: '',
  })

  const canManager = ['admin', 'manager', 'inventory_manager'].includes(userRole)
  const canSupervisor = ['supervisor', 'caretaker'].includes(userRole)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await inventoryAPI.getIssues()
      setIssues(asList(data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load issued items.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pendingIssues = useMemo(
    () =>
      issues.filter(
        (i) => (i.item_type === 'asset' && !i.returned_at) || (i.item_type === 'consumable' && !i.usage_finalized)
      ),
    [issues]
  )

  const submitAction = async () => {
    if (!actionModal) return
    try {
      if (actionModal.type === 'asset') {
        await inventoryAPI.returnAsset(actionModal.id, {
          returned_quantity: Number(form.returned_quantity || 0),
          condition_on_return: form.condition_on_return,
          notes: form.notes,
        })
      } else {
        await inventoryAPI.finalizeConsumable(actionModal.id, {
          actual_quantity_used: Number(form.actual_quantity_used || 0),
          notes: form.notes,
        })
      }
      setActionModal(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Action failed.')
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Pending Actions</div>
        {pendingIssues.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No pending actions.</div>
        ) : (
          pendingIssues.slice(0, 10).map((i) => (
            <div
              key={i.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {i.item_name} ({i.item_type})
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Issued: {i.issued_quantity} {i.item_unit} · To {i.requested_by_name || 'User'}
                </div>
              </div>
              {i.item_type === 'asset' && canManager ? (
                <Btn size="sm" variant="orange" onClick={() => setActionModal({ id: i.id, type: 'asset', item: i })}>
                  Return Asset
                </Btn>
              ) : i.item_type === 'consumable' && (canSupervisor || canManager) ? (
                <Btn size="sm" variant="success" onClick={() => setActionModal({ id: i.id, type: 'consumable', item: i })}>
                  Finalize
                </Btn>
              ) : (
                <Badge value="pending" />
              )}
            </div>
          ))
        )}
      </Card>

      <Card noPad>
        <DataTable
          loading={loading}
          headers={['Item', 'Type', 'Requested By', 'Issued Qty', 'Issued At', 'Status', 'Actions']}
          rows={issues.map((i) => {
            const status =
              i.item_type === 'asset' ? (i.returned_at ? 'completed' : 'ongoing') : i.usage_finalized ? 'completed' : 'ongoing'
            return [
              i.item_name,
              i.item_type,
              i.requested_by_name || '—',
              `${i.issued_quantity} ${i.item_unit || ''}`,
              new Date(i.issued_at).toLocaleString('en-IN'),
              <Badge key={`status-${i.id}`} value={status} />,
              i.item_type === 'asset' && canManager && !i.returned_at ? (
                <Btn key={`a-${i.id}`} size="sm" variant="orange" onClick={() => setActionModal({ id: i.id, type: 'asset', item: i })}>
                  Return
                </Btn>
              ) : i.item_type === 'consumable' && (canSupervisor || canManager) && !i.usage_finalized ? (
                <Btn key={`c-${i.id}`} size="sm" variant="success" onClick={() => setActionModal({ id: i.id, type: 'consumable', item: i })}>
                  Finalize
                </Btn>
              ) : (
                '—'
              ),
            ]
          })}
        />
      </Card>

      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={actionModal?.type === 'asset' ? 'Return Asset' : 'Finalize Consumable'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setActionModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={submitAction}>Submit</Btn>
          </>
        }
      >
        {actionModal?.type === 'asset' ? (
          <>
            <Field label="Returned Quantity">
              <Input
                type="number"
                min="1"
                value={form.returned_quantity}
                onChange={(e) => setForm((p) => ({ ...p, returned_quantity: e.target.value }))}
              />
            </Field>
            <Field label="Condition on Return">
              <Input
                value={form.condition_on_return}
                onChange={(e) => setForm((p) => ({ ...p, condition_on_return: e.target.value }))}
              />
            </Field>
          </>
        ) : (
          <Field label="Actual Quantity Used">
            <Input
              type="number"
              min="0"
              value={form.actual_quantity_used}
              onChange={(e) => setForm((p) => ({ ...p, actual_quantity_used: e.target.value }))}
            />
          </Field>
        )}
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  )
}
