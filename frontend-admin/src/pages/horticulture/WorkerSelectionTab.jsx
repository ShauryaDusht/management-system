import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import ConfirmModal from '../../shared/components/ConfirmModal'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import { asList, getErrorMessage, todayISO } from '../../shared/utils'

const EMPTY_FORM = {
  area_mode: 'single',
  area: '',
  date: todayISO(),
  session: 'any',
  task_type: '',
  note: '',
}

export default function WorkerSelectionTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areas, setAreas] = useState([])
  const [tasks, setTasks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editModal, setEditModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = async (date = form.date) => {
    setLoading(true)
    setError('')
    try {
      const [areaRes, taskRes, assignmentRes] = await Promise.all([
        horticultureAPI.getAreas(),
        horticultureAPI.listTaskTypes(),
        horticultureAPI.listAreaTaskAssignments({ date }),
      ])
      setAreas(asList(areaRes.data))
      setTasks(asList(taskRes.data).filter((task) => task.is_active !== false))
      setAssignments(asList(assignmentRes.data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load task assignment data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const areaOptions = useMemo(() => areas.slice().sort((a, b) => Number(a.area_number || 0) - Number(b.area_number || 0)), [areas])

  const buildPayloads = () => {
    const taskType = Number(form.task_type)
    if (!taskType) return { error: 'Select a task.' }
    if (!form.date) return { error: 'Select a date.' }
    const selectedAreas = form.area_mode === 'all'
      ? areaOptions
      : areaOptions.filter((area) => Number(area.id) === Number(form.area))
    if (!selectedAreas.length) return { error: 'Select an area or choose all areas.' }
    return {
      payloads: selectedAreas.map((area) => ({
        area: area.id,
        date: form.date,
        session: form.session,
        task_type: taskType,
        note: String(form.note || '').trim(),
        is_active: true,
      })),
    }
  }

  const submit = async () => {
    const built = buildPayloads()
    if (built.error) {
      setError(built.error)
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await Promise.all(built.payloads.map((payload) => horticultureAPI.createAreaTaskAssignment(payload)))
      setSuccess(`Task assigned to ${built.payloads.length} area${built.payloads.length === 1 ? '' : 's'}.`)
      setForm((prev) => ({ ...EMPTY_FORM, date: prev.date }))
      await load(form.date)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to assign task.'))
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (row) => {
    setEditModal({
      row,
      form: {
        area: row.area,
        date: row.date,
        session: row.session || 'any',
        task_type: row.task_type,
        note: row.note || '',
        is_active: row.is_active !== false,
      },
      error: '',
    })
  }

  const saveEdit = async () => {
    if (!editModal) return
    setSaving(true)
    setEditModal((prev) => ({ ...prev, error: '' }))
    try {
      await horticultureAPI.updateAreaTaskAssignment(editModal.row.id, editModal.form)
      setEditModal(null)
      await load(form.date)
    } catch (err) {
      setEditModal((prev) => ({ ...prev, error: getErrorMessage(err, 'Failed to update task assignment.') }))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await horticultureAPI.deleteAreaTaskAssignment(deleteTarget.id)
      setDeleteTarget(null)
      await load(form.date)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete task assignment.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Alert message={error} />
      <Alert type="success" message={success} />

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Task Assign
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="Date" required>
                <Input type="date" value={form.date} onChange={(event) => {
                  const date = event.target.value
                  setForm((prev) => ({ ...prev, date }))
                  load(date)
                }} />
              </Field>
              <Field label="Session">
                <SelectField value={form.session} onChange={(event) => setForm((prev) => ({ ...prev, session: event.target.value }))}>
                  <option value="any">Any Time</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                </SelectField>
              </Field>
              <Field label="Assign To">
                <SelectField value={form.area_mode} onChange={(event) => setForm((prev) => ({ ...prev, area_mode: event.target.value, area: '' }))}>
                  <option value="single">Particular Area</option>
                  <option value="all">All Areas</option>
                </SelectField>
              </Field>
              {form.area_mode === 'single' && (
                <Field label="Area" required>
                  <SelectField value={form.area} onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}>
                    <option value="">Select area</option>
                    {areaOptions.map((area) => <option key={area.id} value={area.id}>Area {area.area_number} - {area.name}</option>)}
                  </SelectField>
                </Field>
              )}
              <Field label="Task" required>
                <SelectField value={form.task_type} onChange={(event) => setForm((prev) => ({ ...prev, task_type: event.target.value }))}>
                  <option value="">Select task</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                </SelectField>
              </Field>
            </div>
            <Field label="Note">
              <Input value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn onClick={submit} disabled={saving}>{saving ? 'Assigning...' : 'Assign Task'}</Btn>
            </div>
          </div>
        )}
      </Card>

      <Card noPad style={{ marginTop: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Assigned Area Tasks
        </div>
        <DataTable
          headers={['Date', 'Area', 'Zone', 'Session', 'Task', 'Note', 'Status', 'Edit']}
          rows={assignments.map((row) => [
            row.date,
            row.area_name || '-',
            row.zone_name || '-',
            row.session || 'any',
            row.task_type_name || '-',
            row.note || '-',
            row.is_active ? 'Active' : 'Inactive',
            <div key={`actions-${row.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn size="sm" variant="ghost" onClick={() => openEdit(row)}>Edit</Btn>
              <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Delete</Btn>
            </div>,
          ])}
          emptyMsg="No area tasks assigned for this date."
        />
      </Card>

      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title="Edit Task Assignment"
        width={620}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setEditModal(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Btn>
          </>
        )}
      >
        <Alert message={editModal?.error} />
        {editModal && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date">
              <Input type="date" value={editModal.form.date} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, date: event.target.value } }))} />
            </Field>
            <Field label="Session">
              <SelectField value={editModal.form.session} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, session: event.target.value } }))}>
                <option value="any">Any Time</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
              </SelectField>
            </Field>
            <Field label="Area">
              <SelectField value={editModal.form.area} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, area: event.target.value } }))}>
                {areaOptions.map((area) => <option key={area.id} value={area.id}>Area {area.area_number} - {area.name}</option>)}
              </SelectField>
            </Field>
            <Field label="Task">
              <SelectField value={editModal.form.task_type} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, task_type: event.target.value } }))}>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
              </SelectField>
            </Field>
            <Field label="Status">
              <SelectField value={editModal.form.is_active ? 'active' : 'inactive'} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, is_active: event.target.value === 'active' } }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </SelectField>
            </Field>
            <Field label="Note">
              <Input value={editModal.form.note} onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, note: event.target.value } }))} />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Task Assignment"
        message={`Delete ${deleteTarget?.task_type_name || 'this task'} for ${deleteTarget?.area_name || 'this area'}?`}
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={saving}
        cancelDisabled={saving}
      />
    </div>
  )
}
