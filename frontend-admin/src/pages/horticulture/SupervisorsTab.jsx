import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, Modal, Spinner } from '../../components/ui'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'
import { asList, getErrorMessage, triggerDownload } from '../../shared/utils'
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${toDisplayName(supervisor)} - Horticulture Report`}
      width={760}
      footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}
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

  const downloadCsv = () => {
    if (!items.length) return
    const rows = [
      ['Report Title', 'Horticulture Supervisor Inventory Usage Report'],
      ['Supervisor', toDisplayName(supervisor)],
      ['Pay Code', supervisor?.pay_code || '-'],
      ['Period', `${String(month).padStart(2, '0')}/${year}`],
      [],
      ['Item', 'Issued', 'Used', 'Remaining'],
      ...items.map((item) => [
        item.item_name || '',
        `${item.issued_quantity || 0} ${item.unit || ''}`,
        `${item.total_used || 0} ${item.unit || ''}`,
        `${item.remaining || 0} ${item.unit || ''}`,
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => toCsvValue(cell)).join(',')).join('\n')
    triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv' }), `horticulture_inventory_usage_${toCsvSafe(supervisor?.username)}_${month}_${year}.csv`)
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
        <Btn variant="secondary" onClick={downloadCsv} disabled={loading || !items.length}>Download CSV</Btn>
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

  return (
    <div>
      <Alert message={error} />

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Supervisor List
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
