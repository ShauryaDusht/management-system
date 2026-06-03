import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { usersAPI } from '../../api/users'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, SelectField, Spinner } from '../../components/ui'
import { todayISO } from '../../shared/utils'

const HK_STAFF_ROLES = new Set(['supervisor', 'caretaker'])

function listFrom(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function displayName(user) {
  return user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '-'
}

export default function TemporaryAreaAssignmentsTab({ hostelOnly = false }) {
  const [staff, setStaff] = useState([])
  const [areas, setAreas] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    staff: '',
    source_staff: '',
    area: '',
    duration_days: 1,
    start_date: todayISO(),
    note: '',
  })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [usersRes, areasRes, assignmentsRes] = await Promise.all([
        usersAPI.getAll(),
        hkAPI.getAreas(),
        hkAPI.getTemporaryAreaAssignments('active'),
      ])
      setStaff(listFrom(usersRes.data).filter((u) => HK_STAFF_ROLES.has(u.role)))
      setAreas(listFrom(areasRes.data))
      setAssignments(listFrom(assignmentsRes.data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load temporary area assignments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectedSourceAreas = useMemo(() => {
    const source = staff.find((u) => String(u.id) === String(form.source_staff))
    const ids = new Set(Array.isArray(source?.assigned_area_ids) ? source.assigned_area_ids : [])
    return areas.filter((area) => ids.has(area.id))
  }, [areas, form.source_staff, staff])

  const createAssignment = async () => {
    if (!form.staff) {
      setError('Select target staff.')
      return
    }
    if (!form.source_staff && !form.area) {
      setError('Select a source staff member or direct area.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await hkAPI.createTemporaryAreaAssignment({
        staff: form.staff,
        source_staff: form.source_staff || undefined,
        area_ids: form.area ? [form.area] : [],
        duration_days: form.duration_days || 1,
        start_date: form.start_date || todayISO(),
        note: form.note,
      })
      setForm((prev) => ({ ...prev, source_staff: '', area: '', duration_days: 1, note: '' }))
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create temporary assignment.')
    } finally {
      setSaving(false)
    }
  }

  const revokeAssignment = async (id) => {
    setSaving(true)
    setError('')
    try {
      await hkAPI.revokeTemporaryAreaAssignment(id)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to revoke assignment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Temporary Area Assignment</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Field label="Target Staff" required>
            <SelectField value={form.staff} onChange={(e) => setForm((p) => ({ ...p, staff: e.target.value }))}>
              <option value="">Select staff</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{displayName(u)}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Copy Areas From">
            <SelectField value={form.source_staff} onChange={(e) => setForm((p) => ({ ...p, source_staff: e.target.value }))}>
              <option value="">No source staff</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{displayName(u)}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Direct Area">
            <SelectField value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}>
              <option value="">No direct area</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Start Date">
            <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
          </Field>
          <Field label="Days">
            <Input
              type="number"
              min="1"
              max="31"
              value={form.duration_days}
              onChange={(e) => setForm((p) => ({ ...p, duration_days: Number(e.target.value) || 1 }))}
            />
          </Field>
          <Field label="Note">
            <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
          </Field>
        </div>
        {selectedSourceAreas.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Source areas: {selectedSourceAreas.map((a) => a.name).join(', ')}
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn onClick={createAssignment} disabled={saving || loading}>
            {saving ? 'Saving...' : `Assign ${form.duration_days || 1} Day`}
          </Btn>
        </div>
      </Card>

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>{hostelOnly ? 'Active Hostel Temporary Assignments' : 'Active Temporary Assignments'}</div>
          <Btn size="sm" variant="secondary" onClick={load} disabled={loading || saving}>Refresh</Btn>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Staff', 'Area', 'Dates', 'Assigned By', 'Status', 'Actions']}
            rows={assignments.map((a) => [
              a.staff_name || '-',
              a.area_name || '-',
              `${a.start_date} to ${a.end_date}`,
              a.assigned_by_name || '-',
              <Badge key={`status-${a.id}`} value={a.is_active ? 'approved' : 'pending'} />,
              <Btn key={`revoke-${a.id}`} size="sm" variant="danger" onClick={() => revokeAssignment(a.id)} disabled={saving}>
                Revoke
              </Btn>,
            ])}
            emptyMsg="No active temporary area assignments."
          />
        )}
      </Card>
    </div>
  )
}
