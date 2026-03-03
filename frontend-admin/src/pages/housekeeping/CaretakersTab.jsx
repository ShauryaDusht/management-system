import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Card, DataTable, Spinner } from '../../components/ui'

function normalizeUsers(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

export default function CaretakersTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [users, setUsers] = useState([])

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
        const caretakers = normalizeUsers(caretakersData).map((u) => ({ ...u, role: 'caretaker' }))
        const supervisors = normalizeUsers(supervisorsData).map((u) => ({ ...u, role: 'supervisor' }))

        setAreas(areaList)
        setUsers([...caretakers, ...supervisors])
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load caretaker/supervisor list.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const areaMap = useMemo(() => {
    const mapping = {}
    areas.forEach((a) => {
      ;(a.caretakers || []).forEach((name) => {
        if (!mapping[name]) mapping[name] = []
        mapping[name].push(a.name)
      })
    })
    return mapping
  }, [areas])

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Supervisor / Caretaker List
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Role', 'Name', 'Username', 'Phone', 'Assigned Areas', 'Status']}
            rows={users.map((u) => {
              const fullName = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
              const areasForUser = areaMap[fullName] || []
              return [
                <Badge key={`r-${u.id}`} value={u.role} />,
                fullName,
                <code key={`u-${u.id}`} style={{ fontSize: 12 }}>{u.username}</code>,
                u.phone || '-',
                areasForUser.length ? areasForUser.join(', ') : '-',
                <span
                  key={`s-${u.id}`}
                  style={{
                    color: u.is_active ? '#16a34a' : '#dc2626',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>,
              ]
            })}
            emptyMsg="No caretaker/supervisor users found."
          />
        )}
      </Card>
    </div>
  )
}
