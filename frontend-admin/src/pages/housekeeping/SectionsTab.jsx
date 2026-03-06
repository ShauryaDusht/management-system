import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Card, DataTable, SelectField, Spinner } from '../../components/ui'

export default function SectionsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [users, setUsers] = useState([])
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [{ data: areaData }, { data: caretakersData }, { data: supervisorsData }] =
          await Promise.all([hkAPI.getAreas(), hkAPI.getCaretakers(), hkAPI.getSupervisors()])

        if (!mounted) return
        const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
        const caretakers = Array.isArray(caretakersData)
          ? caretakersData
          : caretakersData?.results || []
        const supervisors = Array.isArray(supervisorsData)
          ? supervisorsData
          : supervisorsData?.results || []

        setAreas(areaList)
        setUsers([
          ...caretakers.map((u) => ({ ...u, role: 'caretaker' })),
          ...supervisors.map((u) => ({ ...u, role: 'supervisor' })),
        ])
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load sections/staff data.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const areaById = useMemo(() => {
    const map = new Map()
    areas.forEach((a) => map.set(a.id, a))
    return map
  }, [areas])

  const allRows = useMemo(() => {
    const rows = []

    users.forEach((u) => {
      const assignedAreaIds = (u.assigned_area_ids || []).filter((id) => areaById.has(id))
      const assignedAreas = assignedAreaIds.map((id) => areaById.get(id))
      const assignedAreaNames = assignedAreas.map((a) => a.name)

      if (!assignedAreas.length) {
        rows.push({
          role: u.role,
          name:
            u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
          username: u.username,
          phone: u.phone || '-',
          assignedAreas: '-',
          areaName: '-',
          areaType: '',
          workerCount: 0,
          isActive: !!u.is_active,
        })
        return
      }

      assignedAreas.forEach((a) => {
        rows.push({
          role: u.role,
          name:
            u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
          username: u.username,
          phone: u.phone || '-',
          assignedAreas: assignedAreaNames.join(', '),
          areaName: a.name,
          areaType: a.area_type,
          workerCount: a.worker_count || 0,
          isActive: !!u.is_active,
        })
      })
    })

    return rows.sort((a, b) => {
      const roleOrder = { supervisor: 0, caretaker: 1 }
      const ro = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
      if (ro !== 0) return ro
      return a.name.localeCompare(b.name)
    })
  }, [areaById, users])

  const filteredRows = useMemo(
    () => allRows.filter((row) => typeFilter === 'all' || row.areaType === typeFilter),
    [allRows, typeFilter]
  )

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 700 }}>Sections + Caretakers / Supervisors</div>
          <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 180 }}>
            <option value="all">All Types</option>
            {[...new Set(areas.map((a) => a.area_type))].map((t) => (
              <option key={t} value={t}>
                {String(t || '').replace(/_/g, ' ')}
              </option>
            ))}
          </SelectField>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={[
              'Role',
              'Name',
              'Username',
              'Phone',
              'Assigned Areas',
              'Area Name',
              'Worker Count',
              'Status',
            ]}
            rows={filteredRows.map((row) => [
              <Badge key={`role-${row.username}-${row.areaName}`} value={row.role} />,
              row.name,
              <code key={`u-${row.username}-${row.areaName}`} style={{ fontSize: 12 }}>
                {row.username}
              </code>,
              row.phone,
              row.assignedAreas,
              row.areaName,
              row.workerCount,
              <span
                key={`status-${row.username}-${row.areaName}`}
                style={{
                  color: row.isActive ? '#16a34a' : '#dc2626',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {row.isActive ? 'Active' : 'Inactive'}
              </span>,
            ])}
            emptyMsg="No staff mapping found for selected area type."
          />
        )}
      </Card>
    </div>
  )
}
