import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, ExportDropdown, Modal, Spinner } from '../../components/ui'
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

export default function SupervisorsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [reportUser, setReportUser] = useState(null)
  const [inventoryUser, setInventoryUser] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getSupervisors()
        if (!mounted) return
        setRows(asList(data?.supervisors))
      } catch (err) {
        if (!mounted) return
        setError(getErrorMessage(err, 'Failed to load horticulture supervisors.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

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
          <div style={{ fontWeight: 700 }}>Supervisor List</div>
          <ExportDropdown
            label="Download Staff"
            onExport={handleExportStaff}
            disabled={loading || !rows.length}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Role', 'Name', 'Pay Code', 'Email', 'Username', 'Phone', 'Assigned Areas', 'Status', 'Report']}
            rows={rows.map((row) => [
              <Badge key={`role-${row.id}`} value={row.role || 'supervisor'} />,
              toDisplayName(row),
              <span key={`pc-${row.id}`} style={{ fontSize: 13, fontWeight: 700, color: row.pay_code ? 'var(--green-800)' : 'var(--text-3)' }}>
                {row.pay_code || '-'}
              </span>,
              row.email || '-',
              <code key={`user-${row.id}`} style={{ fontSize: 12 }}>{row.username || '-'}</code>,
              row.phone || '-',
              asList(row.area_names).join(', ') || asList(row.zone_names).join(', ') || '-',
              <span key={`status-${row.id}`} style={{ color: row.is_active ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>
                {row.is_active ? 'Active' : 'Inactive'}
              </span>,
              <div key={`actions-${row.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="secondary" onClick={() => setReportUser(row)}>Horti Report</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setInventoryUser(row)}>Inventory Usage</Btn>
              </div>,
            ])}
            emptyMsg="No horticulture supervisors found."
          />
        )}
      </Card>

      <HorticultureReportModal open={!!reportUser} supervisor={reportUser} onClose={() => setReportUser(null)} />
      <InventoryUsageModal open={!!inventoryUser} supervisor={inventoryUser} onClose={() => setInventoryUser(null)} />
    </div>
  )
}
