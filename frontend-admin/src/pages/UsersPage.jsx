import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api/auth'
import Layout from '../layout/Layout'
import {
  PageHeader, Button, StatusBadge, Badge, Modal,
  Field, Input, Select, Alert, Spinner, Table
} from '../components/ui'

const EMPTY_FORM = {
  username: '', email: '', first_name: '', last_name: '',
  role: 'supervisor', phone: '', password: '',
}

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'add' | 'edit' | 'toggle'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authAPI.getUsers()
      setUsers(res.data.results ?? res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setError('')
    setModal('add')
  }

  const openEdit = (u) => {
    setSelected(u)
    setForm({
      username: u.username, email: u.email,
      first_name: u.first_name, last_name: u.last_name,
      role: u.role, phone: u.phone, password: '',
    })
    setError('')
    setModal('edit')
  }

  const openToggle = (u) => {
    setSelected(u)
    setModal('toggle')
  }

  const closeModal = () => { setModal(null); setSelected(null); setError('') }

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = { ...form }
      if (modal === 'edit' && !payload.password) delete payload.password
      if (modal === 'add') {
        await authAPI.createUser(payload)
      } else {
        await authAPI.updateUser(selected.id, payload)
      }
      closeModal()
      load()
    } catch (err) {
      const data = err.response?.data
      setError(data ? Object.values(data).flat().join(' ') : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    setSaving(true)
    try {
      await authAPI.updateUser(selected.id, { is_active: !selected.is_active })
      closeModal()
      load()
    } finally {
      setSaving(false)
    }
  }

  const counts = {
    admin: users.filter((u) => u.role === 'admin').length,
    manager: users.filter((u) => u.role === 'manager').length,
    supervisor: users.filter((u) => u.role === 'supervisor').length,
  }

  const columns = [
    {
      key: 'name', label: 'Name',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
            {r.first_name?.[0]?.toUpperCase() || r.username[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{r.first_name} {r.last_name}</p>
            <p className="text-xs text-slate-400">@{r.username}</p>
          </div>
        </div>
      )
    },
    { key: 'email', label: 'Email', render: (r) => <span className="text-sm text-slate-600">{r.email || '—'}</span> },
    { key: 'phone', label: 'Phone', render: (r) => <span className="text-sm text-slate-600">{r.phone || '—'}</span> },
    { key: 'role', label: 'Role', render: (r) => <StatusBadge value={r.role} /> },
    {
      key: 'is_active', label: 'Status', align: 'center',
      render: (r) => r.is_active
        ? <Badge color="green">Active</Badge>
        : <Badge color="red">Inactive</Badge>
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => navigate('/users/' + r.id + '/activity')}>Activity</Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openToggle(r)}
            className={r.is_active ? 'text-red-500' : 'text-emerald-600'}
          >
            {r.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    },
  ]

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <PageHeader
          title="Users"
          subtitle={`${counts.supervisor} supervisors · ${counts.manager} managers · ${counts.admin} admins`}
          action={<Button onClick={openAdd}>+ Add User</Button>}
        />

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <Table columns={columns} data={users} emptyMessage="No users found." />
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modal === 'add' || modal === 'edit'}
        onClose={closeModal}
        title={modal === 'add' ? 'Add New User' : 'Edit User'}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save User'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={error} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name">
              <Input name="first_name" value={form.first_name} onChange={handleChange} />
            </Field>
            <Field label="Last Name">
              <Input name="last_name" value={form.last_name} onChange={handleChange} />
            </Field>
          </div>
          <Field label="Username *">
            <Input name="username" value={form.username} onChange={handleChange} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" value={form.email} onChange={handleChange} />
          </Field>
          <Field label="Phone">
            <Input name="phone" value={form.phone} onChange={handleChange} placeholder="10-digit mobile" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role *">
              <Select name="role" value={form.role} onChange={handleChange}>
                <option value="supervisor">Supervisor</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label={modal === 'edit' ? 'New Password (optional)' : 'Password *'}>
              <Input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Min 8 characters" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Activate / Deactivate Modal */}
      <Modal
        open={modal === 'toggle'}
        onClose={closeModal}
        title={selected?.is_active ? 'Deactivate User' : 'Activate User'}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              variant={selected?.is_active ? 'danger' : 'success'}
              onClick={handleToggle}
              disabled={saving}
            >
              {saving ? '...' : selected?.is_active ? 'Yes, Deactivate' : 'Yes, Activate'}
            </Button>
          </>
        }
      >
        <p className="text-slate-600 text-sm">
          Are you sure you want to {selected?.is_active ? 'deactivate' : 'activate'} <strong>{selected?.first_name} {selected?.last_name}</strong>?
          {selected?.is_active && ' They will not be able to log in.'}
        </p>
      </Modal>
    </Layout>
  )
}
