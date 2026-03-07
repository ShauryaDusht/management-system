import { useEffect, useState, useCallback } from 'react'
import { inventoryAPI } from '../api/inventory'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import {
  PageHeader, Button, StatusBadge, Badge, Modal,
  Field, Input, Textarea, Alert, Spinner, Table, Select
} from '../components/ui'

export default function IssuesPage() {
  const { user } = useAuth()
  const isManager = user?.role === 'admin' || user?.role === 'inventory_manager'
  const isSupervisor = user?.role === 'supervisor'

  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')   // 'asset' | 'consumable' | ''
  const [filterDone, setFilterDone] = useState('')   // 'pending' | 'done' | ''

  // Return modal (manager, assets only)
  const [returnModal, setReturnModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [returnForm, setReturnForm] = useState({ returned_quantity: '', condition_on_return: '', notes: '' })
  const [returnError, setReturnError] = useState('')

  // Finalize modal (supervisor, consumables only)
  const [finalizeModal, setFinalizeModal] = useState(false)
  const [finalizeForm, setFinalizeForm] = useState({ actual_quantity_used: '', notes: '' })
  const [finalizeError, setFinalizeError] = useState('')

  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await inventoryAPI.getIssues()
      let data = res.data.results ?? res.data

      if (filterType) data = data.filter((i) => i.item_type === filterType)
      if (filterDone === 'pending') {
        data = data.filter((i) =>
          (i.item_type === 'asset' && !i.returned_at) ||
          (i.item_type === 'consumable' && !i.usage_finalized)
        )
      } else if (filterDone === 'done') {
        data = data.filter((i) =>
          (i.item_type === 'asset' && i.returned_at) ||
          (i.item_type === 'consumable' && i.usage_finalized)
        )
      }

      setIssues(data)
    } finally {
      setLoading(false)
    }
  }, [filterType, filterDone])

  useEffect(() => { load() }, [load])

  const openReturn = (issue) => {
    setSelected(issue)
    setReturnForm({ returned_quantity: issue.issued_quantity, condition_on_return: '', notes: '' })
    setReturnError('')
    setReturnModal(true)
  }

  const openFinalize = (issue) => {
    setSelected(issue)
    setFinalizeForm({ actual_quantity_used: issue.issued_quantity, notes: '' })
    setFinalizeError('')
    setFinalizeModal(true)
  }

  const handleReturn = async () => {
    setSaving(true)
    setReturnError('')
    try {
      await inventoryAPI.returnAsset(selected.id, {
        returned_quantity: Number(returnForm.returned_quantity),
        condition_on_return: returnForm.condition_on_return,
        notes: returnForm.notes,
      })
      setReturnModal(false)
      load()
    } catch (err) {
      setReturnError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    setSaving(true)
    setFinalizeError('')
    try {
      await inventoryAPI.finalizeConsumable(selected.id, {
        actual_quantity_used: Number(finalizeForm.actual_quantity_used),
        notes: finalizeForm.notes,
      })
      setFinalizeModal(false)
      load()
    } catch (err) {
      setFinalizeError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null

  const getActionStatus = (issue) => {
    if (issue.item_type === 'asset') {
      return issue.returned_at
        ? <Badge color="green">Returned</Badge>
        : <Badge color="yellow">Pending Return</Badge>
    }
    return issue.usage_finalized
      ? <Badge color="green">Finalized</Badge>
      : <Badge color="yellow">Pending Finalization</Badge>
  }

  const columns = [
    { key: 'id', label: '#', render: (r) => <span className="text-slate-400 text-xs">#{r.id}</span> },
    {
      key: 'item_name', label: 'Item',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.item_name}</p>
          <StatusBadge value={r.item_type} />
        </div>
      )
    },
    { key: 'requested_by_name', label: 'Supervisor' },
    { key: 'issued_quantity', label: 'Issued Qty', align: 'right', render: (r) => `${r.issued_quantity} ${r.item_unit}` },
    { key: 'issued_at', label: 'Issued At', render: (r) => <span className="text-xs text-slate-500">{fmt(r.issued_at)}</span> },
    {
      key: 'return_status', label: 'Status', align: 'center',
      render: (r) => getActionStatus(r)
    },
    {
      key: 'detail', label: 'Detail',
      render: (r) => {
        if (r.item_type === 'asset' && r.returned_at) {
          return <span className="text-xs text-slate-500">Returned {fmt(r.returned_at)} · {r.returned_quantity} {r.item_unit}</span>
        }
        if (r.item_type === 'consumable' && r.usage_finalized) {
          return <span className="text-xs text-slate-500">Used {r.actual_quantity_used} {r.item_unit} of {r.issued_quantity}</span>
        }
        if (r.item_type === 'asset' && r.expected_return_date) {
          return <span className="text-xs text-slate-400">Expected: {r.expected_return_date}</span>
        }
        return '—'
      }
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {isManager && r.item_type === 'asset' && !r.returned_at && (
            <Button size="sm" variant="outline" onClick={() => openReturn(r)}>Record Return</Button>
          )}
          {isSupervisor && r.item_type === 'consumable' && !r.usage_finalized && (
            <Button size="sm" variant="outline" onClick={() => openFinalize(r)}>Finalize Usage</Button>
          )}
        </div>
      )
    },
  ]

  const pending = issues.filter((i) =>
    (i.item_type === 'asset' && !i.returned_at) ||
    (i.item_type === 'consumable' && !i.usage_finalized)
  ).length

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader
          title="Issued Items"
          subtitle={pending > 0 ? `${pending} items pending action` : 'All issues tracked'}
        />

        <div className="flex gap-3 mb-5">
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-44">
            <option value="">All Types</option>
            <option value="asset">Assets</option>
            <option value="consumable">Consumables</option>
          </Select>
          <Select value={filterDone} onChange={(e) => setFilterDone(e.target.value)} className="w-48">
            <option value="">All Statuses</option>
            <option value="pending">Pending Action</option>
            <option value="done">Completed</option>
          </Select>
        </div>

        {loading
          ? <div className="flex justify-center py-20"><Spinner /></div>
          : <Table columns={columns} data={issues} emptyMessage="No issued items found." />
        }
      </div>

      {/* Return Asset Modal */}
      <Modal
        open={returnModal}
        onClose={() => setReturnModal(false)}
        title="Record Asset Return"
        footer={
          <>
            <Button variant="outline" onClick={() => setReturnModal(false)}>Cancel</Button>
            <Button onClick={handleReturn} disabled={saving}>{saving ? 'Saving...' : 'Record Return'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={returnError} />
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-1">
            <p><span className="font-medium">Item:</span> {selected?.item_name}</p>
            <p><span className="font-medium">Issued to:</span> {selected?.requested_by_name}</p>
            <p><span className="font-medium">Issued qty:</span> {selected?.issued_quantity} {selected?.item_unit}</p>
          </div>
          <Field label={`Returned Quantity (max ${selected?.issued_quantity})`}>
            <Input
              type="number" min="1" max={selected?.issued_quantity}
              value={returnForm.returned_quantity}
              onChange={(e) => setReturnForm((p) => ({ ...p, returned_quantity: e.target.value }))}
            />
          </Field>
          <Field label="Condition on Return">
            <Input
              value={returnForm.condition_on_return}
              onChange={(e) => setReturnForm((p) => ({ ...p, condition_on_return: e.target.value }))}
              placeholder="e.g. Good condition, Minor wear, Damaged"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={returnForm.notes}
              onChange={(e) => setReturnForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      {/* Finalize Consumable Modal */}
      <Modal
        open={finalizeModal}
        onClose={() => setFinalizeModal(false)}
        title="Finalize Consumable Usage"
        footer={
          <>
            <Button variant="outline" onClick={() => setFinalizeModal(false)}>Cancel</Button>
            <Button onClick={handleFinalize} disabled={saving}>{saving ? 'Saving...' : 'Confirm'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={finalizeError} />
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-1">
            <p><span className="font-medium">Item:</span> {selected?.item_name}</p>
            <p><span className="font-medium">Issued qty:</span> {selected?.issued_quantity} {selected?.item_unit}</p>
          </div>
          <p className="text-xs text-slate-500">
            If you used less than issued, the remaining quantity will be returned to stock automatically.
          </p>
          <Field label={`Actual Quantity Used (max ${selected?.issued_quantity})`}>
            <Input
              type="number" min="0" max={selected?.issued_quantity}
              value={finalizeForm.actual_quantity_used}
              onChange={(e) => setFinalizeForm((p) => ({ ...p, actual_quantity_used: e.target.value }))}
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={finalizeForm.notes}
              onChange={(e) => setFinalizeForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Any notes about usage..."
            />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
