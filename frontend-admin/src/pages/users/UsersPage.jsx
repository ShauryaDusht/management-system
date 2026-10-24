import { useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { usersAPI } from '../../api/users'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  ExportDropdown,
  Field,
  Input,
  Modal,
  SelectField,
  Spinner,
} from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import ConfirmModal from '../../shared/components/ConfirmModal'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import { exportReport } from '../../shared/exportHelper'
import { todayISO } from '../../shared/utils'
import { useAuth } from '../../context/AuthContext'

const ROLES = [
  'admin',
  'estate_office',
  'civil_team',
  'electrical_team',
  'hk_inventory_manager',
  'hostel_office',
  'horticulture_manager',
  'supervisor',
  'caretaker',
]
const HK_ROLES = ['supervisor', 'caretaker']
const ROLE_FILTERS = [
  { key: 'admin', label: 'Admin' },
  { key: 'estate_office', label: 'Estate Office' },
  { key: 'civil_team', label: 'Civil Team' },
  { key: 'electrical_team', label: 'Electrical Team' },
  { key: 'hk_inventory_manager', label: 'HK / Inventory Manager' },
  { key: 'hostel_office', label: 'Hostel Office' },
  { key: 'horticulture_manager', label: 'Horticulture Manager' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'caretaker', label: 'Caretaker' },
]
const ROLE_LABELS = {
  admin: 'Admin',
  estate_office: 'Estate Office',
  civil_team: 'Civil Team',
  electrical_team: 'Electrical Team',
  hk_inventory_manager: 'HK / Inventory Manager',
  hostel_office: 'Hostel Office',
  horticulture_manager: 'Horticulture Manager',
  supervisor: 'Supervisor',
  caretaker: 'Caretaker',
}
const DEPRECATED_MANAGER_USERNAMES = new Set(['inventory.manager', 'housekeeping.manager', 'hostel.manager'])
const EMPTY = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  pay_code: '',
  role: 'supervisor',
  area_ids: [],
  password: '',
}
const FIRST_NAME_SUFFIXES = ['chandra', 'kumar', 'sinh', 'bhai']

const buildUsername = (first, last) => {
  const firstParts = String(first || '').trim().toLowerCase().match(/[a-z0-9]+/g) || []
  let cleanFirst = firstParts[0] || ''
  for (const suffix of FIRST_NAME_SUFFIXES) {
    if (cleanFirst.endsWith(suffix) && cleanFirst.length > suffix.length + 1) {
      cleanFirst = cleanFirst.slice(0, -suffix.length)
      break
    }
  }
  const parts = String(last || '').trim().toLowerCase().match(/[a-z0-9]+/g) || []
  const cleanLast = parts[parts.length - 1] || ''
  return cleanFirst && cleanLast ? `${cleanFirst}.${cleanLast}` : ''
}

function safeFilePart(value, fallback = 'all') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

function userDisplayName(user) {
  return user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : user.username
}

function areaInchargeText(user) {
  if (Array.isArray(user.areas_incharge) && user.areas_incharge.length > 0) {
    return user.areas_incharge.join(', ')
  }
  return HK_ROLES.includes(user.role) ? 'Not assigned' : 'All areas'
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [areas, setAreas] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { run: runAction, saving, error: actionError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const [usersRes, areasRes] = await Promise.all([
      usersAPI.getAll(),
      hkAPI.getAreas().catch(() => ({ data: [] })),
    ])
    const loadedUsers = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.results || []
    setUsers(loadedUsers.filter((u) => !DEPRECATED_MANAGER_USERNAMES.has(u.username)))
    const areaList = Array.isArray(areasRes.data) ? areasRes.data : areasRes.data.results || []
    setAreas(areaList)
    return null
  }, [], 'Failed to load users. Make sure you are logged in as Admin.')

  const error = actionError || loadError
  const isLimitedUserManager = ['hk_inventory_manager'].includes(currentUser?.role)
  const editableRoles = isLimitedUserManager ? ROLES.filter((role) => role !== 'admin') : ROLES
  const canEditUser = (targetUser) => !isLimitedUserManager || targetUser.role !== 'admin'

  const openCreate = () => {
    setForm({ ...EMPTY, role: 'supervisor' })
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (u) => {
    if (!canEditUser(u)) {
      setFormError('Managers cannot edit admin users.')
      return
    }
    setForm({
      username: u.username || '',
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone: u.phone || '',
      pay_code: u.pay_code || '',
      role: u.role || 'supervisor',
      area_ids: Array.isArray(u.assigned_area_ids) ? u.assigned_area_ids : [],
      password: '',
    })
    setFormError('')
    setModal({ mode: 'edit', user: u })
  }

  const save = async () => {
    if (isLimitedUserManager && form.role === 'admin') {
      setFormError('Managers cannot create or promote admin users.')
      return
    }
    const standardizedUsername = buildUsername(form.first_name, form.last_name) || String(form.username || '').trim().toLowerCase()
    if (!standardizedUsername || !form.role) {
      setFormError('First name, last name, and role are required.')
      return
    }
    if (modal.mode === 'create' && !form.password) {
      setFormError('Password required for new users.')
      return
    }
    await runAction(async () => {
      setFormError('')
      try {
        const payload = {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          pay_code: form.pay_code || '',
          role: form.role,
          area_ids: HK_ROLES.includes(form.role) ? form.area_ids : [],
        }
        if (modal.mode === 'create' || standardizedUsername !== modal.user?.username) {
          payload.username = standardizedUsername
        }

        if (form.password) payload.password = form.password

        if (modal.mode === 'create') {
          await usersAPI.create(payload)
        } else {
          await usersAPI.update(modal.user.id, payload)
        }

        setModal(null)
        await reload()
      } catch (e) {
        const d = e.response?.data
        setFormError(d ? JSON.stringify(d) : 'Save failed.')
      }
    })
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    if (!canEditUser(deleteTarget)) {
      setFormError('Managers cannot delete admin users.')
      setDeleteTarget(null)
      return
    }
    await runAction(async () => {
      await usersAPI.delete(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    }, 'Delete failed.')
  }

  const toggleArea = (areaId) => {
    setForm((prev) => {
      const set = new Set(prev.area_ids || [])
      if (set.has(areaId)) set.delete(areaId)
      else set.add(areaId)
      return { ...prev, area_ids: Array.from(set) }
    })
  }

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === 'all' ? true : u.role === roleFilter
    const areaText = Array.isArray(u.areas_incharge) ? u.areas_incharge.join(' ') : ''
    const matchSearch =
      !search ||
      [u.username, u.first_name, u.last_name, u.email, areaText].some((v) =>
        String(v || '').toLowerCase().includes(search.toLowerCase())
      )
    return matchRole && matchSearch
  })

  const csvRows = useMemo(
    () =>
      filtered.map((user) => ({
        Name: userDisplayName(user),
        Username: user.username || '',
        'Pay Code': user.pay_code || '',
        Email: user.email || '',
        Phone: user.phone || '',
        Role: String(user.role || '').replace(/_/g, ' '),
        'Area Incharge': areaInchargeText(user),
        Status: user.is_active ? 'Active' : 'Inactive',
      })),
    [filtered]
  )

  const roleCounts = useMemo(() => {
    const counts = {
      admin: 0,
      estate_office: 0,
      hk_inventory_manager: 0,
      hostel_office: 0,
      horticulture_manager: 0,
      supervisor: 0,
      caretaker: 0,
    }
    users.forEach((u) => {
      if (Object.prototype.hasOwnProperty.call(counts, u.role)) {
        counts[u.role] += 1
      }
    })
    return {
      total: users.length,
      ...counts,
    }
  }, [users])

  const handleExportUsers = async (format) => {
    const scope = roleFilter === 'all' ? 'All Roles' : (ROLE_FILTERS.find((r) => r.key === roleFilter)?.label || roleFilter)
    const exportData = {
      filename: `manage_users_${safeFilePart(roleFilter)}_${todayISO()}`,
      module: 'User Administration',
      title: 'Staff & User Directory Report',
      subtitle: `Role Filter: ${scope} • Total Users: ${filtered.length}`,
      metadata: [
        { label: 'Role Filter', value: scope },
        { label: 'Export Date', value: todayISO() },
        { label: 'Total Users Listed', value: filtered.length },
      ],
      stats: [
        { label: 'Total Users', value: filtered.length },
        { label: 'Admins', value: roleCounts.admin || 0 },
        { label: 'Supervisors', value: roleCounts.supervisor || 0 },
        { label: 'Caretakers', value: roleCounts.caretaker || 0 },
      ],
      headers: ['Name', 'Username', 'Pay Code', 'Email', 'Phone', 'Role', 'Area Incharge', 'Status'],
      rows: filtered.map((u) => [
        userDisplayName(u),
        u.username || '-',
        u.pay_code || '-',
        u.email || '-',
        u.phone || '-',
        String(u.role || '-').replace(/_/g, ' ').toUpperCase(),
        areaInchargeText(u) || '-',
        u.is_active ? 'Active' : 'Inactive',
      ]),
    }
    await exportReport(format, exportData)
  }

  return (
    <AdminLayout
      title="Manage Users"
      subtitle={`${users.length} total users across all roles`}
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={openCreate}>+ Add User</Btn>
        </div>
      )}
    >
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(115px, 11vw, 160px), 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Card
          onClick={() => setRoleFilter('all')}
          style={{
            cursor: 'pointer',
            padding: '12px 14px',
            borderColor: roleFilter === 'all' ? 'var(--green-700)' : 'var(--border)',
            background: roleFilter === 'all' ? '#f0fdf4' : 'var(--surface)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>
            {roleCounts.total}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            Total
          </div>
        </Card>
        <Card
          onClick={() => setRoleFilter(roleFilter === 'admin' ? 'all' : 'admin')}
          style={{
            cursor: 'pointer',
            padding: '12px 14px',
            borderColor: roleFilter === 'admin' ? 'var(--green-700)' : 'var(--border)',
            background: roleFilter === 'admin' ? '#f0fdf4' : 'var(--surface)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>
            {roleCounts.admin}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            Admin
          </div>
        </Card>
        {ROLE_FILTERS.filter((r) => r.key !== 'admin').map((r) => (
          <Card
            key={r.key}
            onClick={() => setRoleFilter(roleFilter === r.key ? 'all' : r.key)}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              borderColor: roleFilter === r.key ? 'var(--green-700)' : 'var(--border)',
              background: roleFilter === r.key ? '#f0fdf4' : 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>
              {roleCounts[r.key]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {r.label}
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
            placeholder="Search name, username, email, area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <SelectField value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 160 }}>
            <option value="all">All Roles</option>
            {ROLE_FILTERS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </SelectField>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{filtered.length} users</span>
            <ExportDropdown
              label="Download Users"
              onExport={handleExportUsers}
              disabled={loading || filtered.length === 0}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Name', 'Username', 'Pay Code', 'Email', 'Phone', 'Role', 'Area Incharge', 'Status', 'Actions']}
            rows={filtered.map((u) => [
              <div key={`name-${u.id}`}>
                <div style={{ fontWeight: 600 }}>
                  {userDisplayName(u)}
                </div>
              </div>,
              <code key={`username-${u.id}`} style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 5 }}>
                {u.username}
              </code>,
              <span key={`pc-${u.id}`} style={{ fontSize: 13, fontWeight: 600, color: u.pay_code ? 'var(--green-800)' : 'var(--text-3)' }}>
                {u.pay_code || '-'}
              </span>,
              u.email || '-',
              u.phone || '-',
              <Badge key={`role-${u.id}`} value={u.role} />,
              <div key={`areas-${u.id}`} style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 280 }}>
                {areaInchargeText(u)}
              </div>,
              <span
                key={`active-${u.id}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: u.is_active ? '#16a34a' : '#dc2626',
                }}
              >
                {u.is_active ? 'Active' : 'Inactive'}
              </span>,
              <div key={`actions-${u.id}`} style={{ display: 'flex', gap: 6 }}>
                {canEditUser(u) ? (
                  <>
                    <Btn size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      Edit
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(u)}>
                      Delete
                    </Btn>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                    Protected
                  </span>
                )}
              </div>,
            ])}
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add New User' : `Edit - ${modal?.user?.username}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={save} disabled={saving}>
              {saving ? 'Saving...' : modal?.mode === 'create' ? 'Create User' : 'Save Changes'}
            </Btn>
          </>
        }
      >
        <Alert message={formError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First Name">
            <Input value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value, username: buildUsername(e.target.value, p.last_name) || p.username }))} />
          </Field>
          <Field label="Last Name">
            <Input value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value, username: buildUsername(p.first_name, e.target.value) || p.username }))} />
          </Field>
        </div>
        <Field label="Username" required>
          <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        </Field>
        <Field label="Pay Code">
          <Input value={form.pay_code} onChange={(e) => setForm((p) => ({ ...p, pay_code: e.target.value }))} placeholder="e.g. 237" />
        </Field>
        <Field label="Role" required>
          <SelectField
            value={form.role}
            onChange={(e) => {
              const nextRole = e.target.value
              setForm((p) => ({
                ...p,
                role: nextRole,
                area_ids: HK_ROLES.includes(nextRole) ? p.area_ids : [],
              }))
            }}
          >
            {editableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r.replace('_', ' ')}
              </option>
            ))}
          </SelectField>
        </Field>

        <Field label="Areas Incharge">
          {HK_ROLES.includes(form.role) ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                maxHeight: 170,
                overflowY: 'auto',
                background: 'var(--surface-2)',
              }}
            >
              {areas.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No areas available.</div>
              ) : (
                areas.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={(form.area_ids || []).includes(a.id)}
                      onChange={() => toggleArea(a.id)}
                    />
                    {a.name}
                  </label>
                ))
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Area assignment is used for Supervisor and Caretaker roles.
            </div>
          )}
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

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete User"
        message={`Delete user ${deleteTarget?.username || ''}? This cannot be undone.`}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminLayout>
  )
}
