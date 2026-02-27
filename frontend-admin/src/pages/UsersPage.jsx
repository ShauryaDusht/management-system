import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api/auth'
import Layout from '../layout/Layout'
import { Button, Modal, Field, Input, Select, Spinner } from '../components/ui'

function Chip({ label, type = 'default' }) {
  const styles = {
    default: { background: '#f1f5f9', color: '#475569' },
    success: { background: '#dcfce7', color: '#166534' },
    danger:  { background: '#fee2e2', color: '#991b1b' },
    admin:   { background: '#dbeafe', color: '#1e40af' },
    manager: { background: '#ede9fe', color: '#5b21b6' },
    supervisor: { background: '#d1fae5', color: '#065f46' },
  }
  const s = styles[type] || styles.default
  return <span style={{ ...s, display: 'inline-flex', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
}

const ROLE_AVATAR_COLORS = { admin: '#1e40af', manager: '#5b21b6', supervisor: '#065f46', inventory_manager: '#1e6b7a' }
const EMPTY_FORM = { username: '', email: '', first_name: '', last_name: '', role: 'supervisor', phone: '', password: '' }

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
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
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u => {
    const name = `${u.first_name} ${u.last_name} ${u.username} ${u.email}`.toLowerCase()
    if (search && !name.includes(search.toLowerCase())) return false
    if (roleFilter && u.role !== roleFilter) return false
    return true
  })

  const openAdd = () => { setForm(EMPTY_FORM); setError(''); setModal('add') }
  const openEdit = u => { setSelected(u); setForm({ username: u.username, email: u.email, first_name: u.first_name, last_name: u.last_name, role: u.role, phone: u.phone, password: '' }); setError(''); setModal('edit') }
  const openToggle = u => { setSelected(u); setModal('toggle') }
  const closeModal = () => { setModal(null); setSelected(null); setError('') }
  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (modal === 'edit' && !payload.password) delete payload.password
      modal === 'add' ? await authAPI.createUser(payload) : await authAPI.updateUser(selected.id, payload)
      closeModal(); load()
    } catch (err) {
      const data = err.response?.data
      setError(data ? Object.values(data).flat().join(' ') : 'Something went wrong.')
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    setSaving(true)
    try {
      await authAPI.updateUser(selected.id, { is_active: !selected.is_active })
      closeModal(); load()
    } finally { setSaving(false) }
  }

  const counts = { admin: users.filter(u => u.role === 'admin').length, manager: users.filter(u => u.role === 'manager' || u.role === 'inventory_manager').length, supervisor: users.filter(u => u.role === 'supervisor').length }

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)', borderRadius: 16, padding: '20px 28px', margin: '16px 0 0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>👥</span>
                  <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>User Management</h1>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>{users.length} users · {counts.supervisor} supervisors · {counts.manager} managers · {counts.admin} admins</p>
              </div>
              <button onClick={openAdd} style={{ background: '#c2622a', border: 'none', color: 'white', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Add User
              </button>
            </div>
          </div>
          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { icon: '👑', label: 'Admins', value: counts.admin, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
              { icon: '🛠️', label: 'Managers', value: counts.manager, color: '#5b21b6', bg: '#faf5ff', border: '#ddd6fe' },
              { icon: '👷', label: 'Supervisors', value: counts.supervisor, color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
              { icon: '✅', label: 'Active Users', value: users.filter(u => u.is_active).length, color: '#b45309', bg: '#fffbeb', border: '#fed7aa' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name, username or email…"
              style={{ flex: 1, minWidth: 200, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none' }} />
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: 'white', outline: 'none', cursor: 'pointer' }}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="inventory_manager">Inventory Manager</option>
              <option value="supervisor">Supervisor</option>
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} users</span>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      {['User', 'Email', 'Phone', 'Role', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>No users found
                      </td></tr>
                    ) : filtered.map((u, idx) => {
                      const avatarColor = ROLE_AVATAR_COLORS[u.role] || '#4d7c5a'
                      const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
                      const initial = fullName[0].toUpperCase()
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? 'white' : '#fafafa' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                          onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initial}</div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{fullName}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b' }}>{u.email || '—'}</td>
                          <td style={{ padding: '12px 16px', color: '#64748b' }}>{u.phone || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <Chip label={u.role?.replace(/_/g, ' ')} type={u.role === 'admin' ? 'admin' : u.role === 'supervisor' ? 'supervisor' : 'manager'} />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Chip label={u.is_active ? '✅ Active' : '⛔ Inactive'} type={u.is_active ? 'success' : 'danger'} />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => navigate(`/users/${u.id}/activity`)}
                                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                Activity
                              </button>
                              <button onClick={() => openEdit(u)}
                                style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                Edit
                              </button>
                              <button onClick={() => openToggle(u)}
                                style={{ background: u.is_active ? '#fef2f2' : '#ecfdf5', color: u.is_active ? '#dc2626' : '#065f46', border: `1px solid ${u.is_active ? '#fecaca' : '#a7f3d0'}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={closeModal} title={modal === 'add' ? '👤 Add New User' : '✏️ Edit User'}
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save User'}</Button></>}>
        <div className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name"><Input name="first_name" value={form.first_name} onChange={onChange} /></Field>
            <Field label="Last Name"><Input name="last_name" value={form.last_name} onChange={onChange} /></Field>
          </div>
          <Field label="Username *"><Input name="username" value={form.username} onChange={onChange} /></Field>
          <Field label="Email"><Input name="email" type="email" value={form.email} onChange={onChange} /></Field>
          <Field label="Phone"><Input name="phone" value={form.phone} onChange={onChange} placeholder="10-digit mobile" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role *">
              <Select name="role" value={form.role} onChange={onChange}>
                <option value="supervisor">Supervisor</option>
                <option value="manager">Manager</option>
                <option value="inventory_manager">Inventory Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label={modal === 'edit' ? 'New Password (optional)' : 'Password *'}>
              <Input name="password" type="password" value={form.password} onChange={onChange} placeholder="Min 8 characters" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Toggle Modal */}
      <Modal open={modal === 'toggle'} onClose={closeModal} title={selected?.is_active ? '⛔ Deactivate User' : '✅ Activate User'}
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button variant={selected?.is_active ? 'danger' : 'success'} onClick={handleToggle} disabled={saving}>{saving ? '…' : selected?.is_active ? 'Yes, Deactivate' : 'Yes, Activate'}</Button></>}>
        <p className="text-slate-600 text-sm">
          Are you sure you want to {selected?.is_active ? 'deactivate' : 'activate'} <strong>{selected?.first_name} {selected?.last_name}</strong>?
          {selected?.is_active && ' They will not be able to log in.'}
        </p>
      </Modal>
    </Layout>
  )
}
