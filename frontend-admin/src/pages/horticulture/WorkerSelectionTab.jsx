import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

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
  const { isReadOnly } = useAuth()
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
  const [swapModal, setSwapModal] = useState(null)

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

  const areaOptions = useMemo(
    () => areas.slice().sort((a, b) => Number(a.area_number || 0) - Number(b.area_number || 0)),
    [areas]
  )

  // Live swap check when filling form
  const swapAlert = useMemo(() => {
    if (form.area_mode !== 'single' || !form.area || !form.task_type) return null
    const selectedAreaId = Number(form.area)
    const selectedTaskId = Number(form.task_type)
    const session = form.session || 'any'

    const otherAssign = assignments.find((a) => (
      Number(a.area) !== selectedAreaId &&
      Number(a.task_type) === selectedTaskId &&
      (session === 'any' || a.session === 'any' || a.session === session)
    ))
    if (!otherAssign) return null

    const currentAssign = assignments.find((a) => (
      Number(a.area) === selectedAreaId &&
      (session === 'any' || a.session === 'any' || a.session === session)
    ))

    const otherArea = areas.find((a) => Number(a.id) === Number(otherAssign.area))
    const selectedArea = areas.find((a) => Number(a.id) === selectedAreaId)
    const task = tasks.find((t) => Number(t.id) === selectedTaskId)
    const currentTask = tasks.find((t) => Number(t.id) === Number(currentAssign?.task_type))

    return {
      otherAssign,
      currentAssign,
      otherAreaName: otherArea ? `Area ${otherArea.area_number} - ${otherArea.name}` : (otherAssign.area_name || 'Another area'),
      selectedAreaName: selectedArea ? `Area ${selectedArea.area_number} - ${selectedArea.name}` : 'Selected area',
      taskName: task?.name || 'Selected task',
      currentTaskName: currentTask?.name || currentAssign?.task_type_name || null,
    }
  }, [form.area_mode, form.area, form.task_type, form.session, assignments, areas, tasks])

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
    const taskType = Number(form.task_type)
    if (!taskType) {
      setError('Select a task.')
      return
    }
    if (!form.date) {
      setError('Select a date.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (form.area_mode === 'single') {
        if (!form.area) {
          setError('Select an area.')
          setSaving(false)
          return
        }
        const selectedAreaId = Number(form.area)
        const session = form.session || 'any'

        const otherAssign = assignments.find((a) => (
          Number(a.area) !== selectedAreaId &&
          Number(a.task_type) === taskType &&
          (session === 'any' || a.session === 'any' || a.session === session)
        ))

        const currentAssign = assignments.find((a) => (
          Number(a.area) === selectedAreaId &&
          (session === 'any' || a.session === 'any' || a.session === session)
        ))

        if (otherAssign) {
          if (currentAssign) {
            // SWAP: Both areas have tasks on this date and session -> Swap tasks!
            const res = await horticultureAPI.swapAreaTaskAssignments({
              assignment1_id: currentAssign.id,
              assignment2_id: otherAssign.id,
            })
            setSuccess(res.data?.detail || 'Tasks swapped successfully between both areas.')
          } else {
            // TRANSFER: Task was on other area, transfer to selected area
            await horticultureAPI.updateAreaTaskAssignment(otherAssign.id, {
              area: selectedAreaId,
              note: String(form.note || '').trim() || otherAssign.note,
              session: form.session,
              date: form.date,
            })
            const taskName = tasks.find((t) => Number(t.id) === taskType)?.name || 'Task'
            const areaName = areas.find((a) => Number(a.id) === selectedAreaId)?.name || 'selected area'
            setSuccess(`Task '${taskName}' transferred from ${otherAssign.area_name} to ${areaName}.`)
          }
        } else if (currentAssign) {
          // Selected area already has a task, update it
          await horticultureAPI.updateAreaTaskAssignment(currentAssign.id, {
            task_type: taskType,
            note: String(form.note || '').trim() || currentAssign.note,
            session: form.session,
            date: form.date,
            is_active: true,
          })
          const taskName = tasks.find((t) => Number(t.id) === taskType)?.name || 'Task'
          setSuccess(`Task for ${currentAssign.area_name} updated to ${taskName}.`)
        } else {
          // Fresh assignment
          await horticultureAPI.createAreaTaskAssignment({
            area: selectedAreaId,
            date: form.date,
            session: form.session,
            task_type: taskType,
            note: String(form.note || '').trim(),
            is_active: true,
          })
          setSuccess('Task assigned successfully.')
        }

        setForm((prev) => ({ ...EMPTY_FORM, date: prev.date }))
        await load(form.date)
        return
      }

      // Bulk assign all areas
      const built = buildPayloads()
      if (built.error) {
        setError(built.error)
        setSaving(false)
        return
      }
      await Promise.all(built.payloads.map((payload) => horticultureAPI.createAreaTaskAssignment(payload)))
      setSuccess(`Task assigned to ${built.payloads.length} area${built.payloads.length === 1 ? '' : 's'}.`)
      setForm((prev) => ({ ...EMPTY_FORM, date: prev.date }))
      await load(form.date)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to assign or swap task.'))
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
      const targetTaskId = Number(editModal.form.task_type)
      const targetAreaId = Number(editModal.form.area)
      const session = editModal.form.session || 'any'

      // Check if target task is currently assigned to another area on this date
      const otherAssign = assignments.find((a) => (
        a.id !== editModal.row.id &&
        Number(a.area) !== targetAreaId &&
        Number(a.task_type) === targetTaskId &&
        (session === 'any' || a.session === 'any' || a.session === session)
      ))

      if (otherAssign) {
        // Swap tasks between editModal row and otherAssign
        const res = await horticultureAPI.swapAreaTaskAssignments({
          assignment1_id: editModal.row.id,
          assignment2_id: otherAssign.id,
        })
        setSuccess(res.data?.detail || 'Tasks swapped successfully.')
      } else {
        await horticultureAPI.updateAreaTaskAssignment(editModal.row.id, editModal.form)
        setSuccess('Task assignment updated.')
      }

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

  const executeSwap = async () => {
    if (!swapModal?.sourceRow?.id || !swapModal?.targetAssignmentId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await horticultureAPI.swapAreaTaskAssignments({
        assignment1_id: swapModal.sourceRow.id,
        assignment2_id: swapModal.targetAssignmentId,
      })
      setSuccess(res.data?.detail || 'Tasks swapped successfully.')
      setSwapModal(null)
      await load(form.date)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to swap tasks.'))
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

            {/* Live Swap Alert Banner */}
            {swapAlert && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1.5px solid #f59e0b',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginTop: 12,
                  marginBottom: 8,
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 20 }}>🔄</span>
                <div>
                  <div>
                    <strong>Auto-Swap Notice:</strong> <u>{swapAlert.taskName}</u> is already assigned to{' '}
                    <strong>{swapAlert.otherAreaName}</strong> on this date.
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
                    {swapAlert.currentTaskName ? (
                      <>
                        Assigning will <strong>SWAP</strong> tasks between both areas:
                        <br />• <strong>{swapAlert.selectedAreaName}</strong> ➔ {swapAlert.taskName}
                        <br />• <strong>{swapAlert.otherAreaName}</strong> ➔ {swapAlert.currentTaskName}
                      </>
                    ) : (
                      <>
                        Assigning will <strong>transfer</strong> <u>{swapAlert.taskName}</u> from{' '}
                        {swapAlert.otherAreaName} to <strong>{swapAlert.selectedAreaName}</strong>.
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Field label="Note">
              <Input value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <Btn
                onClick={submit}
                disabled={saving || isReadOnly}
                title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: isReadOnly ? 0.6 : 1,
                  background: swapAlert?.currentTaskName ? '#d97706' : undefined,
                  color: swapAlert?.currentTaskName ? '#fff' : undefined,
                }}
              >
                {saving ? 'Processing...' : (swapAlert?.currentTaskName ? '🔄 Swap Tasks' : (swapAlert ? 'Transfer & Assign Task' : 'Assign Task'))}
              </Btn>
            </div>
          </div>
        )}
      </Card>

      <Card noPad style={{ marginTop: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Assigned Area Tasks
        </div>
        <DataTable
          headers={['Date', 'Area', 'Zone', 'Session', 'Task', 'Note', 'Status', 'Actions']}
          rows={assignments.map((row) => [
            row.date,
            row.area_name || '-',
            row.zone_name || '-',
            row.session || 'any',
            row.task_type_name || '-',
            row.note || '-',
            row.is_active ? 'Active' : 'Inactive',
            <div key={`actions-${row.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn
                size="sm"
                variant="outline"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && setSwapModal({ sourceRow: row, targetAssignmentId: '' })}
                title={isReadOnly ? "Read-only mode: requires edit permission from admin" : "Swap task with another area"}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                🔄 Swap
              </Btn>
              <Btn size="sm" variant="ghost" disabled={isReadOnly} title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""} onClick={() => !isReadOnly && openEdit(row)}>Edit</Btn>
              <Btn size="sm" variant="danger" disabled={isReadOnly} title={isReadOnly ? "Read-only mode: requires edit permission from admin" : ""} onClick={() => !isReadOnly && setDeleteTarget(row)}>Delete</Btn>
            </div>,
          ])}
          emptyMsg="No area tasks assigned for this date."
        />
      </Card>

      {/* Edit Modal */}
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

      {/* Quick Swap Tasks Modal */}
      <Modal
        open={!!swapModal}
        onClose={() => setSwapModal(null)}
        title="🔄 Swap Area Tasks"
        width={560}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setSwapModal(null)} disabled={saving}>
              Cancel
            </Btn>
            <Btn
              onClick={executeSwap}
              disabled={saving || !swapModal?.targetAssignmentId}
              style={{ background: '#d97706', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {saving ? 'Swapping...' : '🔄 Confirm Swap'}
            </Btn>
          </>
        )}
      >
        {swapModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, fontSize: 13, border: '1px solid var(--border)' }}>
              <div><strong>Selected Area:</strong> {swapModal.sourceRow.area_name}</div>
              <div style={{ marginTop: 4 }}>
                <strong>Current Task:</strong> <span style={{ color: '#059669', fontWeight: 700 }}>{swapModal.sourceRow.task_type_name}</span> ({swapModal.sourceRow.session || 'any'} session)
              </div>
            </div>

            <Field label="Swap Task With (Select Target Area)" required>
              <SelectField
                value={swapModal.targetAssignmentId}
                onChange={(event) => setSwapModal((prev) => ({ ...prev, targetAssignmentId: event.target.value }))}
              >
                <option value="">Select another assigned area on this date...</option>
                {assignments
                  .filter((a) => a.id !== swapModal.sourceRow.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.area_name} — (Task: {a.task_type_name}) [{a.session || 'any'}]
                    </option>
                  ))}
              </SelectField>
            </Field>

            {swapModal.targetAssignmentId && (() => {
              const target = assignments.find((a) => a.id === Number(swapModal.targetAssignmentId))
              if (!target) return null
              return (
                <div style={{ background: 'rgba(217, 119, 6, 0.1)', border: '1px solid #d97706', padding: 12, borderRadius: 8, fontSize: 12.5, color: '#92400e' }}>
                  <strong>🔄 Swap Result:</strong>
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    <li><strong>{swapModal.sourceRow.area_name}</strong> will receive: <span style={{ color: '#059669', fontWeight: 700 }}>{target.task_type_name}</span></li>
                    <li><strong>{target.area_name}</strong> will receive: <span style={{ color: '#059669', fontWeight: 700 }}>{swapModal.sourceRow.task_type_name}</span></li>
                  </ul>
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
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
