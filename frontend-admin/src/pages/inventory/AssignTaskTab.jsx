/**
 * AssignTaskTab — Admin assigns tasks to inventory managers.
 *
 * Since no dedicated task endpoint exists in the backend, tasks are stored
 * client-side in sessionStorage (scoped to the session) as a lightweight
 * solution. When a backend task endpoint is added, simply replace the
 * persistence layer while keeping the same UI.
 *
 * Each task record shape:
 *   { id, title, description, assignee_id, assignee_name, priority, deadline, status, created_at }
 */
import { useEffect, useState, useMemo } from 'react'
import { usersAPI } from '../../api/users'
import { asList } from '../../shared/utils'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField, Textarea } from '../../components/ui'

const STORAGE_KEY = 'inv_admin_tasks_v1'

function loadTasks() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTasks(tasks) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch {}
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES = ['pending', 'in_progress', 'done', 'cancelled']

const EMPTY_FORM = {
  title: '',
  description: '',
  assignee_id: '',
  priority: 'medium',
  deadline: '',
}

function priorityColor(p) {
  return { low: '#6b7280', medium: '#2563eb', high: '#d97706', urgent: '#dc2626' }[p] || '#6b7280'
}

function PriorityBadge({ value }) {
  const color = priorityColor(value)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11,
      fontWeight: 700, background: color + '18', color, textTransform: 'capitalize',
    }}>{value}</span>
  )
}

export default function AssignTaskTab({ userRole }) {
  const [tasks, setTasks] = useState([])
  const [managers, setManagers] = useState([])
  const [loadingManagers, setLoadingManagers] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editStatusModal, setEditStatusModal] = useState(null)

  const canAssign = ['admin', 'manager'].includes(userRole)

  useEffect(() => {
    setTasks(loadTasks())
    // Fetch inventory managers from users API
    usersAPI.getAll()
      .then((res) => {
        const all = asList(res.data)
        setManagers(all.filter((u) => ['inventory_manager', 'manager', 'admin'].includes(u.role)))
      })
      .catch(() => setManagers([]))
      .finally(() => setLoadingManagers(false))
  }, [])

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return tasks
    return tasks.filter((t) => t.status === filterStatus)
  }, [tasks, filterStatus])

  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }), [tasks])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setError('')
    setModal(true)
  }

  const assignee = useMemo(() => {
    if (!form.assignee_id) return null
    return managers.find((m) => String(m.id) === String(form.assignee_id)) || null
  }, [form.assignee_id, managers])

  const createTask = () => {
    if (!form.title.trim()) { setError('Task title is required.'); return }
    if (!form.assignee_id) { setError('Please select an assignee.'); return }
    setError('')
    const newTask = {
      id: Date.now(),
      title: form.title.trim(),
      description: form.description.trim(),
      assignee_id: form.assignee_id,
      assignee_name: assignee
        ? (assignee.full_name || assignee.username || `User #${assignee.id}`)
        : `User #${form.assignee_id}`,
      priority: form.priority,
      deadline: form.deadline || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    const updated = [newTask, ...tasks]
    setTasks(updated)
    saveTasks(updated)
    setModal(false)
  }

  const updateTaskStatus = (id, newStatus) => {
    const updated = tasks.map((t) => t.id === id ? { ...t, status: newStatus } : t)
    setTasks(updated)
    saveTasks(updated)
    setEditStatusModal(null)
  }

  const deleteTask = (id) => {
    const updated = tasks.filter((t) => t.id !== id)
    setTasks(updated)
    saveTasks(updated)
  }

  return (
    <div>
      <Alert message={error} />

      {/* Header strip with stats + create button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All Tasks', count: counts.all, color: 'var(--green-800)' },
            { key: 'pending', label: 'Pending', count: counts.pending, color: '#d97706' },
            { key: 'in_progress', label: 'In Progress', count: counts.in_progress, color: '#3b82f6' },
            { key: 'done', label: 'Done', count: counts.done, color: '#16a34a' },
          ].map(({ key, label, count, color }) => (
            <div
              key={key}
              onClick={() => setFilterStatus(key)}
              style={{
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                background: filterStatus === key ? color + '18' : 'var(--surface)',
                border: `2px solid ${filterStatus === key ? color : 'var(--border)'}`,
                transition: 'all 0.15s', userSelect: 'none', minWidth: 90,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: filterStatus === key ? color : 'var(--text)' }}>{count}</div>
              <div style={{ fontSize: 11, color: filterStatus === key ? color : 'var(--text-3)', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
        {canAssign && (
          <Btn onClick={openCreate} style={{ alignSelf: 'flex-start' }}>
            + Assign Task
          </Btn>
        )}
      </div>

      {/* Task table */}
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Task Board
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No tasks {filterStatus !== 'all' ? `with status "${filterStatus}"` : 'yet'}</div>
            {canAssign && filterStatus === 'all' && (
              <Btn size="sm" onClick={openCreate} style={{ marginTop: 8 }}>Assign first task</Btn>
            )}
          </div>
        ) : (
          <DataTable
            headers={['Task', 'Assigned To', 'Priority', 'Deadline', 'Status', 'Created', 'Actions']}
            loading={false}
            rows={filtered.map((t) => [
              <div key={`t-${t.id}`}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </div>
                )}
              </div>,
              <div key={`a-${t.id}`}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{t.assignee_name}</div>
              </div>,
              <PriorityBadge key={`p-${t.id}`} value={t.priority} />,
              t.deadline
                ? <span key={`d-${t.id}`} style={{ fontSize: 12 }}>{new Date(t.deadline).toLocaleDateString('en-IN')}</span>
                : <span key={`d-${t.id}`} style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>,
              <Badge key={`s-${t.id}`} value={t.status} />,
              <span key={`c-${t.id}`} style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {new Date(t.created_at).toLocaleDateString('en-IN')}
              </span>,
              <div key={`ac-${t.id}`} style={{ display: 'flex', gap: 6 }}>
                {t.status !== 'done' && t.status !== 'cancelled' && (
                  <Btn size="sm" variant="ghost" onClick={() => setEditStatusModal(t)}>
                    Update
                  </Btn>
                )}
                <Btn size="sm" variant="danger" onClick={() => deleteTask(t.id)}>
                  Delete
                </Btn>
              </div>,
            ])}
          />
        )}
      </Card>

      {/* Create Task Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Assign Task to Inventory Manager"
        width={560}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={createTask}>Assign Task</Btn>
          </>
        }
      >
        <Alert message={error} />
        <Field label="Task Title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Conduct monthly stock audit"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Detailed task instructions..."
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)',
              borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
              outline: 'none', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Assign To" required>
            <SelectField
              value={form.assignee_id}
              onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}
            >
              <option value="">Select manager</option>
              {loadingManagers ? (
                <option disabled>Loading...</option>
              ) : managers.length === 0 ? (
                <option disabled>No managers found</option>
              ) : (
                managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.username} ({m.role})
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
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </SelectField>
          </Field>
        </div>
        <Field label="Deadline (optional)">
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
          />
        </Field>
      </Modal>

      {/* Update Status Modal */}
      <Modal
        open={!!editStatusModal}
        onClose={() => setEditStatusModal(null)}
        title={`Update Task Status — ${editStatusModal?.title || ''}`}
        footer={<Btn variant="ghost" onClick={() => setEditStatusModal(null)}>Close</Btn>}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Btn
              key={s}
              variant={editStatusModal?.status === s ? 'primary' : 'ghost'}
              onClick={() => updateTaskStatus(editStatusModal.id, s)}
              style={{ textTransform: 'capitalize' }}
            >
              {s.replace('_', ' ')}
            </Btn>
          ))}
        </div>
      </Modal>
    </div>
  )
}
