import { useCallback, useEffect, useState } from 'react'

import { authAPI } from '../../api/auth'
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
import AdminLayout from '../../layout/AdminLayout'

const ROLES = ['admin', 'manager', 'inventory_manager', 'supervisor', 'caretaker']
const EMPTY = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role: 'supervisor',
  password: '',
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal, setModal] = useState(null) // null | { mode: 'create' | 'edit', user? }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await authAPI.getUsers()
      setUsers(Array.isArray(data) ? data : data.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load users. Make sure you are logged in as Admin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY)
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (u) => {
    const { password: _ignored, ...safeFields } = u
    setForm({ ...safeFields, password: '' })
    setFormError('')
    setModal({ mode: 'edit', user: u })
  }

  const save = async () => {
    if (!form.username || !form.role) {
      setFormError('Username and Role are required.')
      return
    }
    if (modal.mode === 'create' && !form.password) {
      setFormError('Password required for new users.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (modal.mode === 'create') {
        await authAPI.createUser(form)
      } else {
        const payload = {
          username: form.username,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          role: form.role,
        }
        if (form.password) {
          payload.password = form.password
        }
        await authAPI.updateUser(modal.user.id, payload)
      }
      setModal(null)
      await load()
    } catch (e) {
      const d = e.response?.data
      setFormError(d ? JSON.stringify(d) : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await authAPI.deleteUser(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch {
      setError('Delete failed.')
    }
  }

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    const matchSearch =
      !search ||
      [u.username, u.first_name, u.last_name, u.email].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase())
      )
    return matchRole && matchSearch
  })

  const roleCounts = ROLES.reduce(
    (acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }),
    {}
  )

  return (
    <AdminLayout
      title="Manage Users"
      subtitle={`${users.length} total users across all roles`}
      actions={<Btn onClick={openCreate}>+ Add User</Btn>}
    >
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {ROLES.map((r) => (
          <Card
            key={r}
            onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              borderColor: roleFilter === r ? 'var(--green-700)' : 'var(--border)',
              background: roleFilter === r ? '#f0fdf4' : 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>
              {roleCounts[r]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, textTransform: 'capitalize' }}>
              {r.replace('_', ' ')}
            </div>
          </Card>
        ))}
      </div>

      <Card noPad>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Input
            placeholder="Search name, username, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <SelectField value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 160 }}>
            <option value="all">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </SelectField>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)' }}>{filtered.length} users</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Name', 'Username', 'Email', 'Phone', 'Role', 'Status', 'Actions']}
            rows={filtered.map((u) => [
              <div key={`name-${u.id}`}>
                <div style={{ fontWeight: 600 }}>
                  {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username}
                </div>
              </div>,
              <code key={`username-${u.id}`} style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 5 }}>
                {u.username}
              </code>,
              u.email || '—',
              u.phone || '—',
              <Badge key={`role-${u.id}`} value={u.role} />,
              <span
                key={`active-${u.id}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: u.is_active ? '#16a34a' : '#dc2626',
                }}
              >
                {u.is_active ? '● Active' : '○ Inactive'}
              </span>,
              <div key={`actions-${u.id}`} style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="ghost" onClick={() => openEdit(u)}>
                  Edit
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(u)}>
                  Delete
                </Btn>
              </div>,
            ])}
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add New User' : `Edit — ${modal?.user?.username}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={save} disabled={saving}>
              {saving ? 'Saving…' : modal?.mode === 'create' ? 'Create User' : 'Save Changes'}
            </Btn>
          </>
        }
      >
        <Alert message={formError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First Name">
            <Input value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
          </Field>
          <Field label="Last Name">
            <Input value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
          </Field>
        </div>
        <Field label="Username" required>
          <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        </Field>
        <Field label="Role" required>
          <SelectField value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label={modal?.mode === 'create' ? 'Password *' : 'New Password (leave blank to keep)'}>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            placeholder={modal?.mode === 'edit' ? 'Leave blank to keep existing' : ''}
          />
        </Field>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Btn>
            <Btn variant="danger" onClick={doDelete}>
              Delete
            </Btn>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
          Delete user <strong>{deleteTarget?.username}</strong>? This cannot be undone.
        </p>
      </Modal>
    </AdminLayout>
  )
}
