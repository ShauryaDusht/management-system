import { useEffect, useState } from 'react'
import { asList } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SelectField,
  Spinner,
} from '../../components/ui'

const EMPTY_TASK = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'medium',
  deadline: '',
}

const PRIORITY_COLORS = {
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#dc2626',
}

const PRIORITY_BG = {
  low: '#f0fdf4',
  medium: '#eff6ff',
  high: '#fffbeb',
  urgent: '#fef2f2',
}

const ROLE_LABEL = {
  inventory_manager: 'Inventory Manager',
  supervisor: 'Supervisor',
}

export default function AssignTaskTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [assignees, setAssignees] = useState([])   // both managers + supervisors
  const [error, setError] = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [newTask, setNewTask] = useState(EMPTY_TASK)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const canAdmin = userRole === 'admin' || userRole === 'manager'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tasksRes, assigneesRes] = await Promise.all([
        inventoryAPI.getTasks(),
        inventoryAPI.getInventoryManagers(),   // now returns managers + supervisors
      ])
      setTasks(asList(tasksRes.data))
      setAssignees(Array.isArray(assigneesRes.data) ? assigneesRes.data : [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Split assignees into groups for the dropdown
  const managers = assignees.filter((u) => u.role === 'inventory_manager')
  const supervisors = assignees.filter((u) => u.role === 'supervisor')
  const hasAssignees = assignees.length > 0

  const doCreate = async () => {
    if (!newTask.title.trim()) { setError('Task title is required.'); return }
    if (!newTask.assigned_to) { setError('Please select a person to assign this task to.'); return }
    setSaving(true)
    setError('')
    try {
      await inventoryAPI.createTask({
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        assigned_to: Number(newTask.assigned_to),
        priority: newTask.priority,
        deadline: newTask.deadline || null,
      })
      setCreateModal(false)
      setNewTask(EMPTY_TASK)
      await load()
    } catch (e) {
      const detail = e.response?.data
      if (typeof detail === 'object') {
        const msgs = Object.entries(detail)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ')
        setError(msgs)
      } else {
        setError(detail || 'Failed to create task.')
      }
    } finally {
      setSaving(false)
    }
  }

  const doUpdateStatus = async (task, status) => {
    try {
      await inventoryAPI.updateTask(task.id, { status })
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update task status.')
    }
  }

  const doDelete = async (task) => {
    try {
      await inventoryAPI.deleteTask(task.id)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to delete task.')
    }
  }

  const statusNextAction = {
    pending:     { label: 'Mark In Progress', next: 'in_progress' },
    in_progress: { label: 'Mark Completed',   next: 'completed' },
    completed:   null,
    cancelled:   null,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div>
      <Alert message={error} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Assign Task</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Create and track tasks for inventory managers and supervisors
          </div>
        </div>
        {canAdmin && (
          <Btn onClick={() => { setError(''); setCreateModal(true) }}>
            + Create Task
          </Btn>
        )}
      </div>

      {/* Summary counts */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',       value: tasks.length,                                              color: '#64748b' },
          { label: 'Pending',     value: tasks.filter((t) => t.status === 'pending').length,        color: '#3b82f6' },
          { label: 'In Progress', value: tasks.filter((t) => t.status === 'in_progress').length,    color: '#f59e0b' },
          { label: 'Completed',   value: tasks.filter((t) => t.status === 'completed').length,      color: '#22c55e' },
          { label: 'Cancelled',   value: tasks.filter((t) => t.status === 'cancelled').length,      color: '#94a3b8' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              textAlign: 'center',
              minWidth: 80,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tasks table */}
      <Card noPad>
        <DataTable
          headers={['Task', 'Assigned To', 'Role', 'Priority', 'Deadline', 'Status', 'Actions']}
          loading={false}
          emptyMsg={canAdmin ? 'No tasks yet. Click "+ Create Task" to assign one.' : 'No tasks found.'}
          rows={tasks.map((task) => {
            const nextAction = statusNextAction[task.status]
            return [
              // Task title + description
              <div key={`t-${task.id}`}>
                <div style={{ fontWeight: 600 }}>{task.title}</div>
                {task.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, maxWidth: 280 }}>
                    {task.description.length > 80 ? task.description.slice(0, 80) + '…' : task.description}
                  </div>
                )}
              </div>,

              // Assigned person name
              <div key={`m-${task.id}`} style={{ fontSize: 13, fontWeight: 500 }}>
                {task.assigned_to_name}
              </div>,

              // Role badge
              <span
                key={`r-${task.id}`}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: task.assigned_to_role === 'inventory_manager' ? '#eff6ff' : '#f0fdf4',
                  color: task.assigned_to_role === 'inventory_manager' ? '#1d4ed8' : '#15803d',
                  border: `1px solid ${task.assigned_to_role === 'inventory_manager' ? '#bfdbfe' : '#bbf7d0'}`,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                {task.assigned_to_role === 'inventory_manager' ? 'Inv. Manager' : 'Supervisor'}
              </span>,

              // Priority chip
              <span
                key={`p-${task.id}`}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: PRIORITY_BG[task.priority] || '#f8fafc',
                  color: PRIORITY_COLORS[task.priority] || '#64748b',
                  textTransform: 'capitalize',
                }}
              >
                {task.priority}
              </span>,

              // Deadline
              task.deadline
                ? new Date(task.deadline).toLocaleDateString('en-IN')
                : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>,

              // Status badge
              <Badge key={`s-${task.id}`} value={task.status} />,

              // Actions
              <div key={`a-${task.id}`} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {canAdmin && nextAction && (
                  <Btn size="sm" variant="ghost" onClick={() => doUpdateStatus(task, nextAction.next)}>
                    {nextAction.label}
                  </Btn>
                )}
                {canAdmin && task.status !== 'completed' && task.status !== 'cancelled' && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => doUpdateStatus(task, 'cancelled')}
                    style={{ color: '#dc2626' }}
                  >
                    Cancel
                  </Btn>
                )}
                {canAdmin && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteConfirm(task)}
                    style={{ color: '#dc2626' }}
                  >
                    Delete
                  </Btn>
                )}
              </div>,
            ]
          })}
        />
      </Card>

      {/* ── Create Task Modal ─────────────────────────────────────────── */}
      <Modal
        open={createModal}
        onClose={() => { setCreateModal(false); setError('') }}
        title="Create & Assign Task"
        width={580}
        footer={
          <>
            <Btn variant="ghost" onClick={() => { setCreateModal(false); setError('') }}>
              Cancel
            </Btn>
            <Btn onClick={doCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Task'}
            </Btn>
          </>
        }
      >
        <Alert message={error} />

        {/* Task title */}
        <Field label="Task Title" required>
          <Input
            placeholder="e.g. Conduct monthly stock audit"
            value={newTask.title}
            onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
          />
        </Field>

        {/* Assign To — grouped dropdown */}
        <Field label="Assign To" required>
          {!hasAssignees ? (
            <div
              style={{
                padding: '10px 12px',
                background: '#fef9c3',
                border: '1px solid #fde68a',
                borderRadius: 6,
                fontSize: 12,
                color: '#92400e',
              }}
            >
              No inventory managers or supervisors found. Please create user accounts with those roles first.
            </div>
          ) : (
            <>
              <select
                value={newTask.assigned_to}
                onChange={(e) => setNewTask((p) => ({ ...p, assigned_to: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 13,
                  background: 'var(--surface)',
                  color: newTask.assigned_to ? 'var(--text)' : 'var(--text-3)',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  paddingRight: 32,
                  cursor: 'pointer',
                }}
              >
                <option value="">— Select person to assign —</option>

                {managers.length > 0 && (
                  <optgroup label="📋 Inventory Managers">
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (@{m.username})
                      </option>
                    ))}
                  </optgroup>
                )}

                {supervisors.length > 0 && (
                  <optgroup label="👷 Supervisors">
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (@{s.username})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {/* Selected person preview */}
              {newTask.assigned_to && (() => {
                const selected = assignees.find((u) => String(u.id) === String(newTask.assigned_to))
                if (!selected) return null
                return (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: selected.role === 'inventory_manager' ? '#eff6ff' : '#f0fdf4',
                      border: `1px solid ${selected.role === 'inventory_manager' ? '#bfdbfe' : '#bbf7d0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {selected.role === 'inventory_manager' ? '📋' : '👷'}
                    </span>
                    <div>
                      <span style={{ fontWeight: 600 }}>{selected.name}</span>
                      <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>@{selected.username}</span>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 8,
                          background: selected.role === 'inventory_manager' ? '#dbeafe' : '#dcfce7',
                          color: selected.role === 'inventory_manager' ? '#1e40af' : '#166534',
                          textTransform: 'uppercase',
                        }}
                      >
                        {ROLE_LABEL[selected.role]}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </Field>

        {/* Priority + Deadline row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Priority">
            <SelectField
              value={newTask.priority}
              onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
            >
              <option value="low">🟢 Low</option>
              <option value="medium">🔵 Medium</option>
              <option value="high">🟡 High</option>
              <option value="urgent">🔴 Urgent</option>
            </SelectField>
          </Field>
          <Field label="Deadline (optional)">
            <Input
              type="date"
              value={newTask.deadline}
              onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))}
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="Description (optional)">
          <textarea
            placeholder="Describe what needs to be done…"
            value={newTask.description}
            onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
            rows={4}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'inherit',
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
        </Field>
      </Modal>

      {/* ── Delete Confirm Modal ─────────────────────────────────────── */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Task"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <Btn onClick={() => doDelete(deleteConfirm)} style={{ background: '#dc2626', color: '#fff' }}>
              Delete
            </Btn>
          </>
        }
      >
        <div style={{ fontSize: 14 }}>
          Are you sure you want to delete{' '}
          <strong>"{deleteConfirm?.title}"</strong>? This cannot be undone.
        </div>
      </Modal>
    </div>
  )
}
