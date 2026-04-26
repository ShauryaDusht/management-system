import { useEffect, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import ConfirmModal from '../../shared/components/ConfirmModal'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import { getErrorMessage } from '../../shared/utils'

const EMPTY_FORM = {
  name: '',
  threshold_days_default: 7,
  threshold_days_summer: '',
  threshold_days_winter: '',
  threshold_days_rainy: '',
  is_active: true,
}

function cleanNumber(value) {
  if (value === '' || value == null) return null
  return Number(value)
}

export default function ScheduleTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.listTaskTypes()
      setRows(Array.isArray(data) ? data : data?.results || [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture schedule.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      threshold_days_default: row.threshold_days_default || 1,
      threshold_days_summer: row.threshold_days_summer || '',
      threshold_days_winter: row.threshold_days_winter || '',
      threshold_days_rainy: row.threshold_days_rainy || '',
      is_active: row.is_active !== false,
    })
    setFormError('')
    setModal({ mode: 'edit', row })
  }

  const buildPayload = () => {
    const name = String(form.name || '').trim()
    const defaultDays = Number(form.threshold_days_default)
    if (!name) return { error: 'Task name is required.' }
    if (!Number.isFinite(defaultDays) || defaultDays < 1) return { error: 'Default days must be 1 or more.' }
    return {
      payload: {
        name,
        threshold_days_default: defaultDays,
        threshold_days_summer: cleanNumber(form.threshold_days_summer),
        threshold_days_winter: cleanNumber(form.threshold_days_winter),
        threshold_days_rainy: cleanNumber(form.threshold_days_rainy),
        is_active: Boolean(form.is_active),
      },
    }
  }

  const save = async () => {
    const built = buildPayload()
    if (built.error) {
      setFormError(built.error)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (modal.mode === 'create') {
        await horticultureAPI.createTaskType(built.payload)
      } else {
        await horticultureAPI.updateTaskType(modal.row.id, built.payload)
      }
      setModal(null)
      await load()
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save schedule.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    setFormError('')
    try {
      await horticultureAPI.deleteTaskType(deleteTarget.id)
      setDeleteTarget(null)
      setModal(null)
      await load()
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to delete task. It may already have logs.'))
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
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Schedule / PD Tasks</div>
          <Btn size="sm" onClick={openCreate}>+ Add Task</Btn>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Task', 'Default Days', 'Summer', 'Winter', 'Rainy', 'Status', 'Actions']}
            rows={rows.map((row) => [
              row.name,
              row.threshold_days_default,
              row.threshold_days_summer || '-',
              row.threshold_days_winter || '-',
              row.threshold_days_rainy || '-',
              row.is_active ? 'Active' : 'Inactive',
              <div key={`actions-${row.id}`} style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="ghost" onClick={() => openEdit(row)}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Delete</Btn>
              </div>,
            ])}
            emptyMsg="No horticulture tasks found."
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add Schedule Task' : 'Edit Schedule Task'}
        width={620}
        footer={(
          <>
            {modal?.mode === 'edit' && (
              <Btn variant="danger" onClick={() => setDeleteTarget(modal.row)} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Btn>
          </>
        )}
      >
        <Alert message={formError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Task Name" required>
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </Field>
          <Field label="Default Days" required>
            <Input type="number" min="1" value={form.threshold_days_default} onChange={(event) => setForm((prev) => ({ ...prev, threshold_days_default: event.target.value }))} />
          </Field>
          <Field label="Summer Days">
            <Input type="number" min="1" value={form.threshold_days_summer} onChange={(event) => setForm((prev) => ({ ...prev, threshold_days_summer: event.target.value }))} />
          </Field>
          <Field label="Winter Days">
            <Input type="number" min="1" value={form.threshold_days_winter} onChange={(event) => setForm((prev) => ({ ...prev, threshold_days_winter: event.target.value }))} />
          </Field>
          <Field label="Rainy Days">
            <Input type="number" min="1" value={form.threshold_days_rainy} onChange={(event) => setForm((prev) => ({ ...prev, threshold_days_rainy: event.target.value }))} />
          </Field>
          <Field label="Status">
            <SelectField value={form.is_active ? 'active' : 'inactive'} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Task"
        message={`Delete ${deleteTarget?.name || 'this task'}? Existing logs can prevent deletion.`}
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={saving}
        cancelDisabled={saving}
      />
    </div>
  )
}
