import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { usersAPI } from '../api/users'
import {
  Btn,
  Card,
  Modal,
  Input,
  Field,
  SelectField,
  Badge,
  Spinner,
  Alert,
} from './ui'
import ConfirmModal from '../shared/components/ConfirmModal'
import { useAuth } from '../context/AuthContext'

const DEFAULT_OPERATOR_PASSWORD = 'IITGN@2025'

const ROLE_LABELS = {
  electrical_operator: 'Substation Electrical Operator',
  wtp_operator: 'WTP / STP Plant Operator',
  hvac_operator: 'HVAC Plant Operator',
}

function formatPhone(phone) {
  if (!phone) return '—'
  const clean = String(phone).replace(/\D/g, '')
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`
  }
  return phone
}

function generateUsername(first, last) {
  const cleanFirst = String(first || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanLast = String(last || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (cleanFirst && cleanLast) {
    return `${cleanFirst}.${cleanLast}`
  }
  return cleanFirst || ''
}

export default function OperatorsManagerTab({
  department = 'electrical',
  operatorRole = 'electrical_operator',
  departmentName = 'Substation',
  accentColor = '#059669',
}) {
  const { user: currentUser } = useAuth()
  const isPlantEngineer = currentUser?.role === 'plant_engineer' || currentUser?.role === 'admin'

  const [operators, setOperators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'inactive'

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedOp, setSelectedOp] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    username: '',
    role: operatorRole,
    password: DEFAULT_OPERATOR_PASSWORD,
    is_active: true,
  })
  const [formError, setFormError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  // Auto-generate username when first or last name changes in add mode
  const handleNameChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      if (addModalOpen) {
        const auto = generateUsername(
          field === 'first_name' ? value : prev.first_name,
          field === 'last_name' ? value : prev.last_name
        )
        if (auto) updated.username = auto
      }
      return updated
    })
  }

  // Fetch operators for this department
  const fetchOperators = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // If plant engineer, fetch department role or both
      const params = isPlantEngineer && department === 'all' ? {} : { role: operatorRole }
      const res = await usersAPI.getAll(params)
      const list = Array.isArray(res.data) ? res.data : res.data?.results || []
      setOperators(list)
    } catch (err) {
      console.error('Failed to load operators:', err)
      setError(err?.response?.data?.detail || err.message || 'Failed to load operators')
    } finally {
      setLoading(false)
    }
  }, [operatorRole, department, isPlantEngineer])

  useEffect(() => {
    fetchOperators()
  }, [fetchOperators])

  // Clear success message after 4s
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [successMsg])

  // Filtered operators
  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      const q = searchTerm.toLowerCase().trim()
      const matchesSearch =
        !q ||
        (op.full_name || '').toLowerCase().includes(q) ||
        (op.username || '').toLowerCase().includes(q) ||
        (op.phone || '').includes(q)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && op.is_active) ||
        (statusFilter === 'inactive' && !op.is_active)

      return matchesSearch && matchesStatus
    })
  }, [operators, searchTerm, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const total = operators.length
    const active = operators.filter((o) => o.is_active).length
    const inactive = total - active
    return { total, active, inactive }
  }, [operators])

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      username: '',
      role: operatorRole,
      password: DEFAULT_OPERATOR_PASSWORD,
      is_active: true,
    })
    setFormError(null)
    setShowPassword(false)
    setAddModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (op) => {
    setSelectedOp(op)
    setFormData({
      first_name: op.first_name || '',
      last_name: op.last_name || '',
      phone: op.phone || '',
      username: op.username || '',
      role: op.role || operatorRole,
      password: '', // blank means keep current password
      is_active: op.is_active !== false,
    })
    setFormError(null)
    setShowPassword(false)
    setEditModalOpen(true)
  }

  // Open Delete Modal
  const handleOpenDelete = (op) => {
    setSelectedOp(op)
    setDeleteModalOpen(false)
    // Small timeout to avoid React modal transition glitch
    setTimeout(() => setDeleteModalOpen(true), 10)
  }

  // Quick Toggle Active Status
  const handleToggleActive = async (op) => {
    try {
      const nextStatus = !op.is_active
      await usersAPI.update(op.id, { is_active: nextStatus })
      setSuccessMsg(`Operator ${op.full_name || op.username} marked as ${nextStatus ? 'Active' : 'Inactive'}.`)
      fetchOperators()
    } catch (err) {
      console.error('Toggle status error:', err)
      setError(err?.response?.data?.detail || 'Failed to update operator status.')
    }
  }

  // Submit Add
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setFormError('Please enter both First Name and Last Name.')
      return
    }
    if (!formData.phone.trim()) {
      setFormError('Please enter a 10-digit Mobile Phone number.')
      return
    }
    const cleanPhone = formData.phone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      setFormError('Please enter a valid 10-digit mobile number.')
      return
    }
    if (!formData.password || formData.password.length < 8) {
      setFormError('Password must be at least 8 characters long.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        username: formData.username.trim() || generateUsername(formData.first_name, formData.last_name),
        phone: cleanPhone,
        role: formData.role,
        password: formData.password,
      }
      await usersAPI.create(payload)
      setSuccessMsg(`Operator ${formData.first_name} ${formData.last_name} added successfully!`)
      setAddModalOpen(false)
      fetchOperators()
    } catch (err) {
      console.error('Add operator error:', err)
      const data = err?.response?.data
      if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        setFormError(`${firstKey}: ${Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey]}`)
      } else {
        setFormError(data?.detail || err.message || 'Failed to add operator')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!selectedOp) return
    setFormError(null)

    const cleanPhone = (formData.phone || '').replace(/\D/g, '')
    if (cleanPhone && cleanPhone.length !== 10) {
      setFormError('Please enter a valid 10-digit mobile number.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone: cleanPhone,
        is_active: formData.is_active,
      }
      if (formData.password && formData.password.trim().length >= 8) {
        payload.password = formData.password.trim()
      }

      await usersAPI.update(selectedOp.id, payload)
      setSuccessMsg(`Operator ${selectedOp.full_name || selectedOp.username} updated successfully.`)
      setEditModalOpen(false)
      fetchOperators()
    } catch (err) {
      console.error('Update operator error:', err)
      const data = err?.response?.data
      if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        setFormError(`${firstKey}: ${Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey]}`)
      } else {
        setFormError(data?.detail || err.message || 'Failed to update operator')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Submit Delete
  const handleDeleteConfirm = async () => {
    if (!selectedOp) return
    setSubmitting(true)
    try {
      await usersAPI.delete(selectedOp.id)
      setSuccessMsg(`Operator ${selectedOp.full_name || selectedOp.username} removed successfully.`)
      setDeleteModalOpen(false)
      setSelectedOp(null)
      fetchOperators()
    } catch (err) {
      console.error('Delete operator error:', err)
      setError(err?.response?.data?.detail || 'Failed to remove operator.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Banner & Action Controls */}
      <Card style={{ padding: '20px 24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>👥</span>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                  {departmentName} Operators Management
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0 0' }}>
                  Supervise field operators, onboard new staff, update mobile numbers, or manage account access.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn
              variant="secondary"
              onClick={fetchOperators}
              disabled={loading}
              title="Refresh List"
              style={{ padding: '8px 14px' }}
            >
              🔄 Refresh
            </Btn>
            <Btn
              variant="primary"
              onClick={handleOpenAdd}
              style={{
                background: accentColor,
                padding: '10px 18px',
                fontWeight: 700,
                fontSize: 13,
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Add New Operator
            </Btn>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }}>
          <div style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Total Operators
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 2 }}>
                {stats.total}
              </div>
            </div>
            <div style={{ fontSize: 24, opacity: 0.8 }}>👥</div>
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                Active On Duty
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', marginTop: 2 }}>
                {stats.active}
              </div>
            </div>
            <div style={{ fontSize: 24 }}>✅</div>
          </div>

          <div style={{
            background: stats.inactive > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-2)',
            border: stats.inactive > 0 ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: stats.inactive > 0 ? '#dc2626' : 'var(--text-3)', textTransform: 'uppercase' }}>
                Inactive / Suspended
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: stats.inactive > 0 ? '#dc2626' : 'var(--text)', marginTop: 2 }}>
                {stats.inactive}
              </div>
            </div>
            <div style={{ fontSize: 24 }}>⏸️</div>
          </div>

          <div style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Default Password
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', marginTop: 4 }}>
                {DEFAULT_OPERATOR_PASSWORD}
              </div>
            </div>
            <div style={{ fontSize: 20, opacity: 0.7 }}>🔑</div>
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {successMsg && (
        <Alert variant="success" style={{ padding: '12px 16px', fontWeight: 600 }}>
          ✅ {successMsg}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" style={{ padding: '12px 16px', fontWeight: 600 }}>
          ⚠️ {error}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card style={{ padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 16, color: 'var(--text-3)' }}>🔍</span>
            <input
              type="text"
              placeholder="Search by operator name, phone number, or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                border: '1.5px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginRight: 4 }}>
              Status:
            </span>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid var(--border)',
                background: statusFilter === 'all' ? 'var(--text)' : 'var(--surface-2)',
                color: statusFilter === 'all' ? 'var(--surface)' : 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid rgba(16, 185, 129, 0.3)',
                background: statusFilter === 'active' ? '#059669' : 'var(--surface-2)',
                color: statusFilter === 'active' ? '#fff' : '#059669',
                cursor: 'pointer',
              }}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid var(--border)',
                background: statusFilter === 'inactive' ? '#dc2626' : 'var(--surface-2)',
                color: statusFilter === 'inactive' ? '#fff' : 'var(--text-3)',
                cursor: 'pointer',
              }}
            >
              Inactive ({stats.inactive})
            </button>
          </div>
        </div>
      </Card>

      {/* Operators Table */}
      <Card style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spinner size={28} />
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>
              Loading operators...
            </div>
          </div>
        ) : filteredOperators.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {searchTerm || statusFilter !== 'all' ? 'No matching operators found' : 'No operators registered yet'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 0 16px 0' }}>
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Click "+ Add New Operator" above to register field operators.'}
            </p>
            {searchTerm || statusFilter !== 'all' ? (
              <Btn variant="secondary" size="sm" onClick={() => { setSearchTerm(''); setStatusFilter('all') }}>
                Reset Filters
              </Btn>
            ) : (
              <Btn variant="primary" size="sm" onClick={handleOpenAdd} style={{ background: accentColor }}>
                ＋ Add First Operator
              </Btn>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Operator
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Mobile Number (Login ID)
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Portal Username
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Department Role
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOperators.map((op, idx) => {
                  const initials = ((op.first_name?.[0] || '') + (op.last_name?.[0] || '')).toUpperCase() || 'OP'
                  return (
                    <tr
                      key={op.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Name & Avatar */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: op.is_active ? `linear-gradient(135deg, ${accentColor}, #0284c7)` : '#94a3b8',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13,
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                          }}>
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                              {op.full_name || `${op.first_name} ${op.last_name}`}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                              ID: #{op.id} {op.pay_code ? `• Pay Code: ${op.pay_code}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '14px 18px' }}>
                        {op.phone ? (
                          <a
                            href={`tel:${op.phone}`}
                            style={{
                              color: 'var(--text)',
                              fontWeight: 700,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontFamily: 'monospace',
                              fontSize: 13,
                            }}
                          >
                            <span>📞</span> {formatPhone(op.phone)}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Not registered</span>
                        )}
                      </td>

                      {/* Username */}
                      <td style={{ padding: '14px 18px' }}>
                        <code style={{
                          background: 'var(--surface-2)',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          color: 'var(--text-2)',
                          border: '1px solid var(--border)',
                        }}>
                          {op.username}
                        </code>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '14px 18px' }}>
                        <Badge
                          variant={op.role === 'electrical_operator' ? 'orange' : op.role === 'wtp_operator' ? 'blue' : 'gray'}
                        >
                          {op.role === 'electrical_operator' ? '⚡ Substation Operator' : op.role === 'wtp_operator' ? '💧 WTP/STP Operator' : op.role}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 18px' }}>
                        {op.is_active ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                            Active
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                          }}>
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/* Edit Button */}
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenEdit(op)}
                            title="Edit operator details or reset password"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                          >
                            ✏️ Edit
                          </Btn>

                          {/* Quick Toggle Active / Deactivate */}
                          <Btn
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(op)}
                            title={op.is_active ? 'Deactivate operator account' : 'Reactivate operator account'}
                            style={{
                              padding: '5px 10px',
                              fontSize: 12,
                              color: op.is_active ? '#b45309' : '#15803d',
                              borderColor: op.is_active ? '#fde68a' : '#bbf7d0',
                              background: op.is_active ? '#fffbeb' : '#f0fdf4',
                            }}
                          >
                            {op.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                          </Btn>

                          {/* Remove Button */}
                          <Btn
                            size="sm"
                            variant="danger"
                            onClick={() => handleOpenDelete(op)}
                            title="Permanently remove operator"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                          >
                            🗑️ Remove
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ADD OPERATOR MODAL */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Field Operator"
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setAddModalOpen(false)} disabled={submitting}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={handleAddSubmit}
              disabled={submitting}
              style={{ background: accentColor }}
            >
              {submitting ? <Spinner size={16} /> : '＋ Add Operator'}
            </Btn>
          </>
        )}
      >
        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <Alert variant="danger" style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>
              ⚠️ {formError}
            </Alert>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First Name" required>
              <Input
                placeholder="e.g. Ramesh"
                value={formData.first_name}
                onChange={(e) => handleNameChange('first_name', e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Last Name / Surname" required>
              <Input
                placeholder="e.g. Patel"
                value={formData.last_name}
                onChange={(e) => handleNameChange('last_name', e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Mobile Phone Number (Used to log in)" required>
            <Input
              type="tel"
              placeholder="e.g. 9876543210 (10 digits)"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              required
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
              The operator can log in directly using this 10-digit number.
            </span>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Standardized Username">
              <Input
                placeholder="firstname.lastname"
                value={formData.username}
                onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
              />
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, display: 'block' }}>
                Auto-generated from first & last name.
              </span>
            </Field>

            <Field label="Department Role" required>
              <Input
                value={ROLE_LABELS[operatorRole] || operatorRole}
                readOnly
                style={{ background: 'var(--surface-2)', cursor: 'not-allowed' }}
              />
            </Field>
          </div>

          <Field label="Initial Password" required>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--text-3)',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
              Default: <code style={{ fontWeight: 700 }}>{DEFAULT_OPERATOR_PASSWORD}</code> (operator can change this later).
            </span>
          </Field>
        </form>
      </Modal>

      {/* EDIT OPERATOR MODAL */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Operator: ${selectedOp?.full_name || selectedOp?.username}`}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setEditModalOpen(false)} disabled={submitting}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={handleEditSubmit}
              disabled={submitting}
              style={{ background: accentColor }}
            >
              {submitting ? <Spinner size={16} /> : 'Save Changes'}
            </Btn>
          </>
        )}
      >
        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <Alert variant="danger" style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>
              ⚠️ {formError}
            </Alert>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First Name" required>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Mobile Phone Number (Login ID)" required>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="10-digit mobile number"
              required
            />
          </Field>

          <Field label="Account Status">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: accentColor }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {formData.is_active ? 'Active (Allowed to sign in and enter logs)' : 'Suspended / Inactive (Sign-in disabled)'}
              </span>
            </label>
          </Field>

          <Field label="Reset Password (Optional)">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Leave blank to keep existing password"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--text-3)',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
              Only fill this in if you want to reset the operator's password (min 8 chars).
            </span>
          </Field>
        </form>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Remove Operator Account"
        message={`Are you sure you want to permanently remove operator "${selectedOp?.full_name || selectedOp?.username}" (${formatPhone(selectedOp?.phone)})? This user will no longer be able to sign in.`}
        confirmLabel={submitting ? 'Removing...' : 'Yes, Remove Operator'}
        danger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false)
          setSelectedOp(null)
        }}
        confirmDisabled={submitting}
      />
    </div>
  )
}
