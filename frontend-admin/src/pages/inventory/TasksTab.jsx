import { useEffect, useState } from 'react'

import { asList } from '../../shared/utils'
import { inventoryAPI } from '../../api/inventory'
import { usersAPI } from '../../api/users'
import {
  Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner, Textarea,
} from '../../components/ui'

const PRIORITY_COLOR = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#16a34a',
}

const STATUS_BADGE = {
  open: 'pending',
  in_progress: 'ongoing',
  done: 'completed',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'medium',
  deadline: '',
}

export default function TasksTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState([])
  const [managers, setManagers] = useState([])
  const [modal, setModal] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const canCreate = ['admin', 'manager'].includes(userRole)
  const canDelete = userRole === 'admin'

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [taskRes, userRes] = await Promise.all([
        inventoryAPI.getTasks(),
        canCreate ? usersAPI.getAll() : Promise.resolve({ data: [] }),
      ])
      setTasks(asList(taskRes.data))
      // Filter only inventory managers for assignment
      const allUsers = asList(userRes.data)
      setManagers(allUsers.filter((u) => u.role === 'inventory_manager'))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load tasks.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const createTask = async () => {
    if (!form.title.trim()) { setError('Task title is required.'); return }
    setSaving(true); setError('')
    try {
      await inventoryAPI.createTask({
        title: form.title.trim(),
        description: form.description.trim(),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        priority: form.priority,
        deadline: form.deadline || null,
      })
      setModal(false); setForm(EMPTY_FORM); await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create task.')
    } finally { setSaving(false) }
  }

  const updateStatus = async (task, status) => {
    try {
      await inventoryAPI.updateTask(task.id, { status })
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Update failed.')
    }
  }

  const deleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return
    try {
      await inventoryAPI.deleteTask(id)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed.')
    }
  }

  const openTasks = tasks.filter((t) => t.status === 'open')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  return (
    <div>
      <Alert message={error} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-900)' }}>Inventory Tasks</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Assign tasks to inventory managers
          </div>
        </div>
        {canCreate && (
          <Btn onClick={() => { setForm(EMPTY_FORM); setModal(true) }}>
            + Assign Task
          </Btn>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Open', count: openTasks.length, color: '#d97706' },
          { label: 'In Progress', count: inProgressTasks.length, color: '#3b82f6' },
          { label: 'Done', count: doneTasks.length, color: '#16a34a' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.count}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Task board */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={32} /></div>
      ) : tasks.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No tasks yet</div>
            <div style={{ fontSize: 13 }}>
              {canCreate ? 'Click "Assign Task" to create one.' : 'No tasks assigned to you.'}
            </div>
          </div>
        </Card>
      ) : (
        <Card noPad>
          <DataTable
            headers={['Task', 'Assigned To', 'Priority', 'Deadline', 'Status', 'Created By', 'Actions']}
            loading={false}
            rows={tasks.map((t) => {
              const isOverdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()
              return [
                <div key={`title-${t.id}`}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
                  {t.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description}
                    </div>
                  )}
                </div>,
                t.assigned_to_name ? (
                  <span key={`asgn-${t.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                    {t.assigned_to_name}
                  </span>
                ) : (
                  <span key={`asgn-${t.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>Unassigned</span>
                ),
                <span key={`pri-${t.id}`} style={{
                  display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                  fontSize: 11, fontWeight: 700,
                  background: PRIORITY_COLOR[t.priority] + '18',
                  color: PRIORITY_COLOR[t.priority],
                }}>
                  {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                </span>,
                t.deadline ? (
                  <span key={`dl-${t.id}`} style={{
                    fontSize: 12, fontWeight: isOverdue ? 700 : 400,
                    color: isOverdue ? '#dc2626' : 'var(--text-2)',
                  }}>
                    {isOverdue ? '⚠️ ' : ''}{new Date(t.deadline).toLocaleDateString('en-IN')}
                  </span>
                ) : <span key={`dl-${t.id}`} style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>,
                <Badge key={`st-${t.id}`} value={STATUS_BADGE[t.status] || t.status} />,
                <span key={`cb-${t.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {t.created_by_name || '—'}
                </span>,
                <div key={`act-${t.id}`} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {t.status !== 'done' && (
                    <Btn size="sm" variant="success"
                      onClick={() => updateStatus(t, t.status === 'open' ? 'in_progress' : 'done')}>
                      {t.status === 'open' ? '▶ Start' : '✓ Done'}
                    </Btn>
                  )}
                  {t.status === 'in_progress' && (
                    <Btn size="sm" variant="ghost" onClick={() => updateStatus(t, 'open')}>
                      Reset
                    </Btn>
                  )}
                  {canDelete && (
                    <Btn size="sm" variant="danger" onClick={() => deleteTask(t.id)}>
                      Delete
                    </Btn>
                  )}
                </div>,
              ]
            })}
          />
        </Card>
      )}

      {/* Create Task Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Assign Task to Inventory Manager"
        width={540}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={createTask} disabled={saving}>
              {saving ? 'Creating…' : 'Create Task'}
            </Btn>
          </>
        }
      >
        <Field label="Task Title" required>
          <Input
            placeholder="e.g. Audit cleaning supplies"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={3}
            placeholder="Detailed instructions or context..."
            style={{
              width: '100%', padding: '9px 12px',
              border: '1.5px solid var(--border)', borderRadius: 8,
              fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
              outline: 'none', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Assign To">
            <SelectField
              value={form.assigned_to}
              onChange={(e) => setForm((p) => ({ ...p, assigned_to: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {managers.length === 0 ? (
                <option disabled>No inventory managers found</option>
              ) : (
                managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name ? `${m.first_name} ${m.last_name}`.trim() : m.username}
                  </option>
                ))
              )}
            </SelectField>
          </Field>
          <Field label="Priority">
            <SelectField
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
            >
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </SelectField>
          </Field>
        </div>
        <Field label="Deadline (optional)">
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
            min={new Date().toISOString().split('T')[0]}
          />
        </Field>
        {managers.length === 0 && (
          <div style={{
            padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a',
            borderRadius: 8, fontSize: 12, color: '#92400e',
          }}>
            ⚠️ No inventory managers found. You can still create the task and assign it later, or create a user with the "Inventory Manager" role first.
          </div>
        )}
      </Modal>
    </div>
  )
}
