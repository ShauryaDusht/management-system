import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../context/AuthContext'
import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, ExportDropdown, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'
import { asList, getErrorMessage, triggerDownload } from '../../shared/utils'
import { exportHorticultureReport } from './exportHelper'
import { formatDateTime } from './helpers'

function toDisplayName(user) {
  return user?.full_name || user?.supervisor_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '-'
}

function toCsvSafe(value, fallback = 'supervisor') {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || fallback
}

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`
  return str
}

function HorticultureReportModal({ open, supervisor, onClose }) {
  const handleExport = async (format) => {
    if (!supervisor) return
    const exportData = {
      filename: `horticulture_staff_${toCsvSafe(supervisor.username || supervisor.id)}`,
      title: `${toDisplayName(supervisor)} - Horticulture Staff Report`,
      subtitle: 'Staff responsibilities, assigned zones, and team overview',
      metadata: [
        { label: 'Username', value: supervisor.username || '-' },
        { label: 'Pay Code', value: supervisor.pay_code || '-' },
        { label: 'Phone', value: supervisor.phone || '-' },
        { label: 'Last Login', value: formatDateTime(supervisor.last_login, 'Never') },
      ],
      stats: [
        { label: 'Workers', value: supervisor?.workers_count ?? 0 },
        { label: 'Tasks This Week', value: supervisor?.tasks_logged_this_week ?? 0 },
      ],
      headers: ['Assigned Zones', 'Assigned Areas'],
      rows: [[
        asList(supervisor?.zone_names).join(', ') || '-',
        asList(supervisor?.area_names).join(', ') || '-',
      ]],
    }
    await exportHorticultureReport(format, exportData)
  }

  const getSupervisorReportExportData = (format) => {
    if (!supervisor) throw new Error('Supervisor data not available.')
    if (format === 'csv') {
      downloadCsv()
      return null
    }
    return {
      title: `${toDisplayName(supervisor)} - Horticulture Supervisor Report`,
      filename: `horticulture_staff_${toCsvSafe(supervisor.username || supervisor.id)}`,
      headers: ['Metric', 'Value'],
      rows: [
        ['Name', toDisplayName(supervisor)],
        ['Username', supervisor.username || '-'],
        ['Pay Code', supervisor.pay_code || '-'],
        ['Phone', supervisor.phone || '-'],
        ['Workers', String(supervisor.workers_count ?? 0)],
        ['Tasks This Week', String(supervisor.tasks_logged_this_week ?? 0)],
        ['Last Login', formatDateTime(supervisor.last_login, 'Never')],
        ['Zones', asList(supervisor.zone_names).join(', ') || '-'],
        ['Assigned Areas', asList(supervisor.area_names).join(', ') || '-'],
      ],
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${toDisplayName(supervisor)} - Horticulture Report`}
      width={760}
      footer={(
        <>
          <ExportDropdown label="Download Report" onExport={handleExport} disabled={!supervisor} />
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Workers</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{supervisor?.workers_count ?? 0}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tasks This Week</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{supervisor?.tasks_logged_this_week ?? 0}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Last Login</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{formatDateTime(supervisor?.last_login, 'Never')}</div>
        </Card>
      </div>

      <Card noPad>
        <DataTable
          headers={['Zones', 'Assigned Areas']}
          rows={[[
            asList(supervisor?.zone_names).join(', ') || '-',
            asList(supervisor?.area_names).join(', ') || '-',
          ]]}
          emptyMsg="No horticulture report data."
        />
      </Card>
    </Modal>
  )
}

function InventoryUsageModal({ open, supervisor, onClose }) {
  const initialDate = useMemo(() => new Date(), [])
  const currentMonth = initialDate.getMonth() + 1
  const currentYear = initialDate.getFullYear()
  const { month, year, setMonth, setYear } = useMonthYear()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    if (!open || !supervisor?.id) return
    setMonth(currentMonth)
    setYear(currentYear)
    setLoading(false)
    setError('')
    setItems([])
    setHasLoaded(false)
  }, [open, supervisor?.id, currentMonth, currentYear])

  const load = async () => {
    if (!supervisor?.id) return
    setLoading(true)
    setError('')
    try {
      const { data } = await inventoryAPI.getUserUsageLogs(supervisor.id, month, year)
      setItems(asList(data?.items))
      setHasLoaded(true)
    } catch (err) {
      setItems([])
      setHasLoaded(true)
      setError(getErrorMessage(err, 'Failed to load inventory usage.'))
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format) => {
    if (!items.length) return
    const exportData = {
      filename: `horticulture_inventory_usage_${toCsvSafe(supervisor?.username)}_${month}_${year}`,
      title: `${toDisplayName(supervisor)} - Inventory Usage Report`,
      subtitle: `Material and equipment consumption for period ${String(month).padStart(2, '0')}/${year}`,
      metadata: [
        { label: 'Supervisor', value: toDisplayName(supervisor) },
        { label: 'Pay Code', value: supervisor?.pay_code || '-' },
        { label: 'Period', value: `${String(month).padStart(2, '0')}/${year}` },
      ],
      stats: [
        { label: 'Total Items', value: items.length },
        { label: 'With Usage', value: items.filter((i) => Number(i.total_used || 0) > 0).length },
      ],
      headers: ['Item', 'Issued', 'Used', 'Remaining'],
      rows: items.map((item) => [
        item.item_name || '',
        `${item.issued_quantity || 0} ${item.unit || ''}`.trim(),
        `${item.total_used || 0} ${item.unit || ''}`.trim(),
        `${item.remaining || 0} ${item.unit || ''}`.trim(),
      ]),
    }
    await exportHorticultureReport(format, exportData)
  }

  const getUsageExportData = (format) => {
    if (!items.length) throw new Error('No usage data available.')
    if (format === 'csv') {
      downloadCsv()
      return null
    }
    return {
      title: `${toDisplayName(supervisor)} - Horticulture Inventory Usage (${String(month).padStart(2, '0')}/${year})`,
      filename: `horticulture_inventory_usage_${toCsvSafe(supervisor?.username)}_${month}_${year}`,
      headers: ['Item', 'Issued', 'Used', 'Remaining'],
      rows: items.map((item) => [
        item.item_name || '-',
        `${item.issued_quantity || 0} ${item.unit || ''}`,
        `${item.total_used || 0} ${item.unit || ''}`,
        `${item.remaining || 0} ${item.unit || ''}`,
      ]),
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${toDisplayName(supervisor)} - Inventory Usage`}
      width={920}
      footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}
    >
      <Alert message={error} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <MonthYearPicker month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          <Btn onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Load Usage'}</Btn>
        </div>
        <ExportDropdown
          label="Download Usage"
          onExport={handleExport}
          disabled={loading || !items.length}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>
      ) : !hasLoaded ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 24 }}>
          Select month and year, then click Load Usage.
        </div>
      ) : (
        <Card noPad>
          <DataTable
            headers={['Item', 'Issued', 'Used', 'Remaining']}
            rows={items.map((item) => [
              item.item_name || '-',
              `${item.issued_quantity || 0} ${item.unit || ''}`,
              `${item.total_used || 0} ${item.unit || ''}`,
              `${item.remaining || 0} ${item.unit || ''}`,
            ])}
            emptyMsg="No inventory usage found for this supervisor."
          />
        </Card>
      )}
    </Modal>
  )
}

function AddAreaModal({ open, supervisor, zones, allAreas, onClose, onSuccess }) {
  const [areaNumber, setAreaNumber] = useState('')
  const [name, setName] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nextAreaNumber = useMemo(() => {
    const numbers = (allAreas || [])
      .map((a) => Number(a.area_number))
      .filter((n) => Number.isFinite(n) && n > 0)
    return numbers.length ? Math.max(...numbers) + 1 : 1
  }, [allAreas])

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    setName('')
    setAreaNumber(String(nextAreaNumber))

    if (supervisor && zones?.length) {
      const match = zones.find(
        (z) =>
          Number(z.supervisor_id) === Number(supervisor.id) ||
          asList(supervisor.zone_names).includes(z.zone_name || z.name)
      )
      setZoneId(String(match?.zone_id || match?.id || zones[0]?.zone_id || zones[0]?.id || ''))
    } else if (zones?.length) {
      setZoneId(String(zones[0]?.zone_id || zones[0]?.id || ''))
    }
  }, [open, supervisor, zones, nextAreaNumber])

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!areaNumber || Number(areaNumber) < 1) {
      setError('Please provide a valid area number.')
      return
    }
    if (!name.trim()) {
      setError('Please provide an area name.')
      return
    }
    if (!zoneId) {
      setError('Please select a zone / supervisor.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await horticultureAPI.createArea({
        area_number: Number(areaNumber),
        name: name.trim(),
        zone_id: Number(zoneId),
      })
      onSuccess?.()
      onClose?.()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add area.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supervisor ? `Add Area - ${toDisplayName(supervisor)}` : 'Add Area'}
      width={500}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add Area'}
          </Btn>
        </>
      }
    >
      <Alert message={error} />
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Supervisor / Zone" required>
          <SelectField
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            disabled={saving}
          >
            {zones.map((zone) => {
              const zid = String(zone.zone_id || zone.id)
              const zname = zone.zone_name || zone.name
              const label = zone.supervisor_name
                ? `${zone.supervisor_name} (${zname})`
                : zname
              return (
                <option key={zid} value={zid}>
                  {label}
                </option>
              )
            })}
          </SelectField>
        </Field>

        <Field label="Area Number" required>
          <Input
            type="number"
            min={1}
            value={areaNumber}
            onChange={(e) => setAreaNumber(e.target.value)}
            placeholder="e.g. 43"
            disabled={saving}
          />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            Next available area number: <strong>{nextAreaNumber}</strong>
          </div>
        </Field>

        <Field label="Area Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nursery near fire building, Guest House Lawn"
            disabled={saving}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  )
}

function DeleteAreaModal({ open, supervisor, zones, allAreas, onClose, onSuccess }) {
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setSearch('')
    setDeletingId(null)
    if (supervisor?.id) {
      setSelectedSupervisorId(String(supervisor.id))
    } else {
      setSelectedSupervisorId('all')
    }
  }, [open, supervisor])

  const filteredAreas = useMemo(() => {
    return (allAreas || []).filter((area) => {
      if (selectedSupervisorId !== 'all') {
        const zone = zones.find((z) => Number(z.zone_id || z.id) === Number(area.zone_id))
        const matchesSupId = zone && Number(zone.supervisor_id) === Number(selectedSupervisorId)
        const matchesAreaList = supervisor && asList(supervisor.area_names).includes(area.name)
        if (!matchesSupId && !matchesAreaList) return false
      }

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = String(area.name || '').toLowerCase().includes(q)
        const matchesNum = String(area.area_number || '').includes(q)
        const matchesZone = String(area.zone_name || '').toLowerCase().includes(q)
        const matchesSup = String(area.supervisor_name || '').toLowerCase().includes(q)
        if (!matchesName && !matchesNum && !matchesZone && !matchesSup) return false
      }

      return true
    })
  }, [allAreas, selectedSupervisorId, search, zones, supervisor])

  const handleDelete = async (area) => {
    const msg = `Are you sure you want to delete Area #${area.area_number}: "${area.name}"?\nThis cannot be undone.`
    if (!window.confirm(msg)) return

    setDeletingId(area.id)
    setError('')
    try {
      await horticultureAPI.deleteArea(area.id)
      onSuccess?.()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete area.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        supervisor
          ? `Delete Area - ${toDisplayName(supervisor)}`
          : 'Delete Horticulture Area'
      }
      width={780}
      footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}
    >
      <Alert message={error} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px' }}>
          <SelectField
            value={selectedSupervisorId}
            onChange={(e) => setSelectedSupervisorId(e.target.value)}
          >
            <option value="all">All Supervisors ({allAreas?.length || 0} Areas)</option>
            {zones.map((zone) => {
              const zid = String(zone.zone_id || zone.id)
              const zname = zone.zone_name || zone.name
              const val = String(zone.supervisor_id || zid)
              const label = zone.supervisor_name
                ? `${zone.supervisor_name} (${zname})`
                : zname
              return (
                <option key={zid} value={val}>
                  {label}
                </option>
              )
            })}
          </SelectField>
        </div>

        <div style={{ flex: '2 1 240px' }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by area name or number..."
          />
        </div>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        {filteredAreas.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No areas found matching the filter.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '9px 12px', width: 75 }}>Area #</th>
                <th style={{ padding: '9px 12px' }}>Area Name</th>
                <th style={{ padding: '9px 12px', width: 120 }}>Zone</th>
                <th style={{ padding: '9px 12px', width: 160 }}>Supervisor</th>
                <th style={{ padding: '9px 12px', width: 90, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAreas.map((area) => (
                <tr
                  key={area.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--green-800)' }}>
                    #{area.area_number}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                    {area.name}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12 }}>
                    {area.zone_name || '-'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12 }}>
                    {area.supervisor_name || '-'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <Btn
                      size="sm"
                      variant="danger"
                      disabled={deletingId === area.id}
                      onClick={() => handleDelete(area)}
                    >
                      {deletingId === area.id ? 'Deleting...' : 'Delete'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Showing {filteredAreas.length} area{filteredAreas.length === 1 ? '' : 's'}</span>
        <span>Deleting an area removes it from assignments and supervisor view</span>
      </div>
    </Modal>
  )
}

export default function SupervisorsTab() {
  const { isReadOnly } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [zones, setZones] = useState([])
  const [allAreas, setAllAreas] = useState([])
  const [reportUser, setReportUser] = useState(null)
  const [inventoryUser, setInventoryUser] = useState(null)

  // Area management modals
  const [addAreaModalOpen, setAddAreaModalOpen] = useState(false)
  const [deleteAreaModalOpen, setDeleteAreaModalOpen] = useState(false)
  const [targetSupervisor, setTargetSupervisor] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [supervisorsRes, summaryRes, areasRes] = await Promise.all([
        horticultureAPI.getSupervisors(),
        horticultureAPI.getSummary(),
        horticultureAPI.getAreas(),
      ])
      const rawZones = asList(
        summaryRes.data?.zone_status?.length ? summaryRes.data.zone_status : summaryRes.data?.zones
      )
      const mappedZones = rawZones.map((z) => ({
        id: z.zone_id || z.id,
        zone_id: z.zone_id || z.id,
        name: z.zone_name || z.name,
        zone_name: z.zone_name || z.name,
        supervisor_id: z.supervisor_id,
        supervisor_name: z.supervisor_name,
      }))
      setRows(asList(supervisorsRes.data?.supervisors))
      setZones(mappedZones)
      setAllAreas(asList(areasRes.data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture supervisors.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenAddArea = (supervisor = null) => {
    setTargetSupervisor(supervisor)
    setAddAreaModalOpen(true)
  }

  const handleOpenDeleteArea = (supervisor = null) => {
    setTargetSupervisor(supervisor)
    setDeleteAreaModalOpen(true)
  }

  const handleExportStaff = async (format) => {
    const exportData = {
      filename: 'horticulture_staff',
      title: 'Horticulture Staff & Supervisors Directory',
      subtitle: 'Supervisor assignments, contact details, and weekly activity',
      metadata: [
        { label: 'Total Supervisors', value: rows.length },
        { label: 'Active Supervisors', value: rows.filter((r) => r.is_active).length },
      ],
      stats: [
        { label: 'Total Staff', value: rows.length },
        { label: 'Active Staff', value: rows.filter((r) => r.is_active).length },
        { label: 'Total Workers', value: rows.reduce((acc, r) => acc + (r.workers_count || 0), 0) },
        { label: 'Tasks This Week', value: rows.reduce((acc, r) => acc + (r.tasks_logged_this_week || 0), 0) },
      ],
      headers: ['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas', 'Zones', 'Workers', 'Tasks This Week', 'Status'],
      rows: rows.map((row) => [
        row.role || 'supervisor',
        toDisplayName(row),
        row.pay_code || '',
        row.email || '',
        row.username || '',
        row.phone || '',
        asList(row.area_names).join(', '),
        asList(row.zone_names).join(', '),
        row.workers_count ?? 0,
        row.tasks_logged_this_week ?? 0,
        row.is_active ? 'Active' : 'Inactive',
      ]),
    }
    await exportHorticultureReport(format, exportData)
  }

  return (
    <div>
      <Alert message={error} />

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Supervisor List</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ({rows.length} supervisors • {allAreas.length} total areas)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn
              size="sm"
              variant="primary"
              onClick={() => handleOpenAddArea(null)}
              disabled={loading || !zones.length}
            >
              + Add Area
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => handleOpenDeleteArea(null)}
              disabled={loading || !allAreas.length}
            >
              Delete Area
            </Btn>
            <ExportDropdown
              label="Download Staff"
              onExport={handleExportStaff}
              disabled={loading || !rows.length}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas', 'Status', 'Actions']}
            rows={rows.map((row) => [
              <Badge key={`role-${row.id}`} value={row.role || 'supervisor'} />,
              toDisplayName(row),
              <span key={`pc-${row.id}`} style={{ fontSize: 13, fontWeight: 700, color: row.pay_code ? 'var(--green-800)' : 'var(--text-3)' }}>
                {row.pay_code || '-'}
              </span>,
              row.email || '-',
              <code key={`user-${row.id}`} style={{ fontSize: 12 }}>{row.username || '-'}</code>,
              row.phone || '-',
              <div key={`areas-${row.id}`} style={{ maxWidth: 380 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 6,
                      background: 'rgba(61, 107, 85, 0.1)',
                      color: 'var(--green-800)',
                      border: '1px solid rgba(61, 107, 85, 0.2)',
                    }}
                  >
                    {asList(row.area_names).length} areas
                  </span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-2)' }}>
                  {asList(row.area_names).join(', ') || asList(row.zone_names).join(', ') || '-'}
                </div>
              </div>,
              <span key={`status-${row.id}`} style={{ color: row.is_active ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>
                {row.is_active ? 'Active' : 'Inactive'}
              </span>,
              <div key={`actions-${row.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Btn size="sm" variant="secondary" onClick={() => setReportUser(row)}>Horti Report</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setInventoryUser(row)}>Inventory Usage</Btn>
                <Btn
                  size="sm"
                  variant="secondary"
                  disabled={isReadOnly}
                  style={{ color: 'var(--green-800)', borderColor: 'rgba(61, 107, 85, 0.4)' }}
                  onClick={() => !isReadOnly && handleOpenAddArea(row)}
                  title={isReadOnly ? "Read-only mode: requires edit permission from admin" : `Add Area for ${toDisplayName(row)}`}
                >
                  + Add Area
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={isReadOnly}
                  style={{ color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                  onClick={() => !isReadOnly && handleOpenDeleteArea(row)}
                  title={isReadOnly ? "Read-only mode: requires edit permission from admin" : `Delete Area from ${toDisplayName(row)}`}
                >
                  Delete Area
                </Btn>
              </div>,
            ])}
            emptyMsg="No horticulture supervisors found."
          />
        )}
      </Card>

      <AddAreaModal
        open={addAreaModalOpen}
        supervisor={targetSupervisor}
        zones={zones}
        allAreas={allAreas}
        onClose={() => setAddAreaModalOpen(false)}
        onSuccess={loadData}
      />

      <DeleteAreaModal
        open={deleteAreaModalOpen}
        supervisor={targetSupervisor}
        zones={zones}
        allAreas={allAreas}
        onClose={() => setDeleteAreaModalOpen(false)}
        onSuccess={loadData}
      />

      <HorticultureReportModal open={!!reportUser} supervisor={reportUser} onClose={() => setReportUser(null)} />
      <InventoryUsageModal open={!!inventoryUser} supervisor={inventoryUser} onClose={() => setInventoryUser(null)} />
    </div>
  )
}

