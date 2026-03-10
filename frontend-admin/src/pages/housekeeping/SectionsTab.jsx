import { useCallback, useEffect, useMemo, useState } from 'react'

import { authAPI } from '../../api/auth'
import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Modal, SelectField, Spinner } from '../../components/ui'

export default function SectionsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areas, setAreas] = useState([])
  const [users, setUsers] = useState([])
  const [areaClassFilter, setAreaClassFilter] = useState('all')

  const [assignModal, setAssignModal] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)

  const areaGroup = (areaName, areaType) => {
    const n = String(areaName || '').trim()
    if (/^Academic Block\s+([1-9]|1[0-3])$/i.test(n)) return 'academic'
    if (['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(n)) return 'academic'
    if (['hostel common area', 'common area'].includes(n.toLowerCase())) return 'hostels'
    if (areaType === 'hostel') return 'hostels'
    return 'others'
  }

  const extractBlockNo = (name) => {
    const m = String(name || '').match(/Academic Block\s+(\d+)/i)
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: areaData }, { data: caretakersData }, { data: supervisorsData }] =
        await Promise.all([hkAPI.getAreas(), hkAPI.getCaretakers(), hkAPI.getSupervisors()])

      const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
      const caretakers = Array.isArray(caretakersData) ? caretakersData : caretakersData?.results || []
      const supervisors = Array.isArray(supervisorsData) ? supervisorsData : supervisorsData?.results || []

      setAreas(areaList)
      setUsers([
        ...caretakers.map((u) => ({ ...u, role: 'caretaker' })),
        ...supervisors.map((u) => ({ ...u, role: 'supervisor' })),
      ])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load sections/staff data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const userById = useMemo(() => {
    const map = new Map()
    users.forEach((u) => map.set(u.id, u))
    return map
  }, [users])

  const allRows = useMemo(() => {
    const rows = []

    areas.forEach((a) => {
      const assignedIds = (a.caretaker_ids || []).filter((id) => userById.has(id))
      const assignedUsers = assignedIds.map((id) => userById.get(id))

      if (!assignedUsers.length) {
        rows.push({
          areaId: a.id,
          areaName: a.name,
          areaType: a.area_type,
          workerCount: a.worker_count || 0,
          userId: null,
          assignedTo: '-',
          role: '-',
          username: '-',
          phone: '-',
          isActive: false,
        })
        return
      }

      assignedUsers.forEach((u) => {
        const displayName =
          u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
        rows.push({
          areaId: a.id,
          areaName: a.name,
          areaType: a.area_type,
          workerCount: a.worker_count || 0,
          userId: u.id,
          assignedTo: displayName,
          role: u.role,
          username: u.username,
          phone: u.phone || '-',
          isActive: !!u.is_active,
        })
      })
    })

    return rows.sort((a, b) => {
      const ga = areaGroup(a.areaName, a.areaType)
      const gb = areaGroup(b.areaName, b.areaType)
      const order = { hostels: 0, academic: 1, others: 2 }
      if (order[ga] !== order[gb]) return order[ga] - order[gb]
      if (ga === 'academic') {
        const an = extractBlockNo(a.areaName)
        const bn = extractBlockNo(b.areaName)
        if (an !== bn) return an - bn
      }
      const byArea = a.areaName.localeCompare(b.areaName)
      if (byArea !== 0) return byArea
      return a.assignedTo.localeCompare(b.assignedTo)
    })
  }, [areas, userById])

  const filteredRows = useMemo(
    () =>
      areaClassFilter === 'all'
        ? allRows
        : allRows.filter((r) => areaGroup(r.areaName, r.areaType) === areaClassFilter),
    [allRows, areaClassFilter],
  )

  const assignmentOptions = useMemo(() => {
    return [...users]
      .sort((a, b) => {
        const roleOrder = { supervisor: 0, caretaker: 1 }
        const ro = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
        if (ro !== 0) return ro
        const na = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.username
        const nb = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.username
        return na.localeCompare(nb)
      })
      .map((u) => ({
        id: u.id,
        label: `${u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username} (${u.role})`,
      }))
  }, [users])

  const openAssignModal = (row) => {
    setAssignModal({
      areaId: row.areaId,
      areaName: row.areaName,
      currentUserId: row.userId,
      currentUserLabel: row.assignedTo,
    })
    setSelectedUserId(row.userId ? String(row.userId) : '')
    setError('')
    setSuccess('')
  }

  const submitAssignmentChange = async () => {
    if (!assignModal) return
    if (!selectedUserId) {
      setError('Please select supervisor/caretaker.')
      return
    }

    const newUser = users.find((u) => String(u.id) === String(selectedUserId))
    if (!newUser) {
      setError('Selected user is invalid.')
      return
    }

    if (assignModal.currentUserId && String(assignModal.currentUserId) === String(newUser.id)) {
      setAssignModal(null)
      setSuccess('No changes needed. Assignment already matches.')
      return
    }

    setAssignSaving(true)
    setError('')
    setSuccess('')
    try {
      const areaId = assignModal.areaId
      const updates = []

      if (assignModal.currentUserId) {
        const oldUser = users.find((u) => u.id === assignModal.currentUserId)
        if (oldUser) {
          const oldAreaIds = (oldUser.assigned_area_ids || []).filter((id) => id !== areaId)
          updates.push(authAPI.updateUser(oldUser.id, { area_ids: oldAreaIds }))
        }
      }

      const newAreaIds = Array.from(new Set([...(newUser.assigned_area_ids || []), areaId]))
      updates.push(authAPI.updateUser(newUser.id, { area_ids: newAreaIds }))

      await Promise.all(updates)
      setAssignModal(null)
      setSuccess(`Updated assignment for ${assignModal.areaName}.`)
      await loadData()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update assignment.')
    } finally {
      setAssignSaving(false)
    }
  }

  const toCsvValue = (value) => {
    const s = String(value ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const triggerCsvDownload = (csvContent, filename) => {
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  }

  const downloadAreaInchargeReport = () => {
    if (!filteredRows.length) {
      setError('No rows available to generate report for selected segment.')
      return
    }

    setDownloadingReport(true)
    setError('')
    setSuccess('')
    try {
      const headers = [
        'Area Name',
        'Caretaker / Supervisor',
        'Username',
        'Phone No',
        'Worker Count',
        'Status',
        'Change Supervisor/Caretaker',
      ]
      const rows = filteredRows.map((row) => [
        row.areaName,
        row.role === '-' ? '-' : `${row.assignedTo} (${row.role})`,
        row.username,
        row.phone,
        row.workerCount,
        row.role === '-' ? 'Unassigned' : row.isActive ? 'Active' : 'Inactive',
        row.userId ? 'Change' : 'Assign',
      ])
      const csvBody = [headers, ...rows]
        .map((r) => r.map((cell) => toCsvValue(cell)).join(','))
        .join('\n')

      const now = new Date()
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const filename = `area_incharge_report_${areaClassFilter}_${stamp}.csv`
      triggerCsvDownload(csvBody, filename)
      setSuccess('Area-wise incharge report generated.')
    } catch {
      setError('Failed to generate area-wise incharge report.')
    } finally {
      setDownloadingReport(false)
    }
  }

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Sections + Caretakers / Supervisors</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn
              size="sm"
              variant={areaClassFilter === 'hostels' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('hostels')}
            >
              Hostels
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'academic' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('academic')}
            >
              Academic Blocks
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'others' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('others')}
            >
              Others
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('all')}
            >
              All
            </Btn>
            <Btn
              size="sm"
              variant="secondary"
              onClick={downloadAreaInchargeReport}
              disabled={downloadingReport}
            >
              {downloadingReport ? 'Generating Report...' : 'Area Incharge Report CSV'}
            </Btn>
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={[
              'Area Name',
              'Caretaker / Supervisor',
              'Username',
              'Phone No',
              'Worker Count',
              'Status',
              'Change Supervisor/Caretaker',
            ]}
            rows={filteredRows.map((row) => [
              row.areaName,
              row.assignedTo === '-' ? '-' : (
                <span key={`assigned-${row.areaName}-${row.username}`}>
                  {row.assignedTo}
                  <span style={{ color: '#6b7280' }}>{` (${row.role})`}</span>
                </span>
              ),
              row.username === '-' ? '-' : (
                <code key={`u-${row.areaName}-${row.username}`} style={{ fontSize: 12 }}>
                  {row.username}
                </code>
              ),
              row.phone,
              row.workerCount,
              row.role === '-' ? (
                <span key={`status-none-${row.areaName}`} style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>
                  Unassigned
                </span>
              ) : (
                <span
                  key={`status-${row.areaName}-${row.username}`}
                  style={{
                    color: row.isActive ? '#16a34a' : '#dc2626',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              ),
              <Btn
                key={`change-${row.areaName}-${row.username || 'none'}`}
                size="sm"
                variant="secondary"
                onClick={() => openAssignModal(row)}
              >
                {row.userId ? 'Change' : 'Assign'}
              </Btn>,
            ])}
            emptyMsg="No area assignment data found for selected segment."
          />
        )}
      </Card>

      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title={`Change Assignment - ${assignModal?.areaName || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAssignModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={submitAssignmentChange} disabled={assignSaving}>
              {assignSaving ? 'Saving...' : 'Save'}
            </Btn>
          </>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
          Current: <strong>{assignModal?.currentUserLabel || '-'}</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Select new supervisor/caretaker</div>
        <SelectField value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Choose user</option>
          {assignmentOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </SelectField>
      </Modal>
    </div>
  )
}
