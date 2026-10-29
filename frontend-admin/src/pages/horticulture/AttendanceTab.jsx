import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import {
  Alert,
  Btn,
  Card,
  DataTable,
  ExportDropdown,
  Field,
  Input,
  SelectField,
  Spinner,
  StatCard,
} from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'
import { asList, getErrorMessage, todayISO } from '../../shared/utils'
import { exportHorticultureReport } from './exportHelper'

function AttendanceBadge({ status }) {
  const s = String(status || '').toLowerCase()
  let bg = '#f1f5f9'
  let color = '#475569'
  let label = status || 'Not Marked'

  if (s === 'present') {
    bg = '#dcfce7'
    color = '#15803d'
    label = 'Present'
  } else if (s === 'absent') {
    bg = '#fee2e2'
    color = '#b91c1c'
    label = 'Absent'
  } else if (s.includes('half') || s.includes('partial')) {
    bg = '#fef3c7'
    color = '#b45309'
    label = 'Half Day'
  } else if (s === 'late') {
    bg = '#ffedd5'
    color = '#c2410c'
    label = 'Late'
  } else if (s === 'leave') {
    bg = '#f3e8ff'
    color = '#7e22ce'
    label = 'Leave'
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: bg,
        color: color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export default function AttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [workers, setWorkers] = useState([])
  const [records, setRecords] = useState([])
  const [zoneFilter, setZoneFilter] = useState('all')
  const [supervisorFilter, setSupervisorFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [summaryRes, workerRes, recordRes, staffRes] = await Promise.all([
          horticultureAPI.getAttendanceSummary(date),
          horticultureAPI.getWorkers(),
          horticultureAPI.getAttendanceRecords(date),
          horticultureAPI.getAttendance(date),
        ])
        if (mounted) {
          setRows(asList(summaryRes.data))
          setWorkers(asList(workerRes.data?.workers))
          setRecords(asList(recordRes.data))
          setStaffRows(asList(staffRes.data?.supervisors))
        }
      } catch (err) {
        if (mounted) setError(getErrorMessage(err, 'Failed to load horticulture worker attendance.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [date])

  const zoneNames = useMemo(() => {
    const names = new Set()
    rows.forEach((row) => {
      if (row.zone_name) names.add(row.zone_name)
    })
    staffRows.forEach((row) => asList(row.zone_names).forEach((zone) => names.add(zone)))
    return Array.from(names).sort()
  }, [rows, staffRows])

  const supervisorNames = useMemo(() => {
    const set = new Set()
    staffRows.forEach((row) => {
      if (row.supervisor_name) set.add(row.supervisor_name)
    })
    workers.forEach((w) => {
      if (w.supervisor_name) {
        w.supervisor_name.split(',').forEach((name) => {
          const trimmed = name.trim()
          if (trimmed && trimmed !== 'Unassigned') set.add(trimmed)
        })
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [staffRows, workers])

  const recordMap = useMemo(() => {
    const map = new Map()
    records.forEach((record) => map.set(`${record.worker}-${record.half}`, record))
    return map
  }, [records])

  const statusText = (record) => {
    if (!record?.status) return 'Not marked'
    return String(record.status).replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Pre-process all workers with calculated attendance and supervisor details
  const workerAttendanceList = useMemo(() => {
    return workers.map((worker) => {
      const first = recordMap.get(`${worker.id}-first`)
      const second = recordMap.get(`${worker.id}-second`)

      const firstStatus = first?.status ? statusText(first) : 'Not marked'
      const secondStatus = second?.status ? statusText(second) : 'Not marked'

      let overallStatus = 'Not marked'
      const f = first?.status
      const s = second?.status

      if (f || s) {
        if (f === 'present' && s === 'present') overallStatus = 'Present'
        else if (f === 'absent' && s === 'absent') overallStatus = 'Absent'
        else if (f === 'leave' || s === 'leave') overallStatus = 'Leave'
        else if ((f === 'present' && s === 'absent') || (f === 'absent' && s === 'present')) overallStatus = 'Half Day'
        else if (f === 'late' || s === 'late') overallStatus = 'Late'
        else if (f === 'present' || s === 'present') overallStatus = 'Present (Half)'
        else if (f === 'absent' || s === 'absent') overallStatus = 'Absent (Half)'
      } else {
        // Fallback to supervisor submitted status if present
        for (const st of staffRows) {
          const sw = asList(st.workers).find((w) => w.worker_id === worker.id)
          if (sw && sw.status && sw.status !== 'pending') {
            if (sw.status === 'present') overallStatus = 'Present'
            else if (sw.status === 'absent') overallStatus = 'Absent'
            else if (sw.status === 'half_day') overallStatus = 'Half Day'
            else overallStatus = String(sw.status).toUpperCase()
            break
          }
        }
      }

      return {
        ...worker,
        supervisor_name: worker.supervisor_name || 'Unassigned',
        zone_display: asList(worker.zone_names).join(', ') || '—',
        area_display: asList(worker.area_names).join(', ') || '—',
        first_half_status: firstStatus,
        second_half_status: secondStatus,
        overall_status: overallStatus,
        is_present: overallStatus === 'Present' || overallStatus === 'Late' || overallStatus === 'Present (Half)',
        is_absent: overallStatus === 'Absent' || overallStatus === 'Not marked',
      }
    })
  }, [workers, recordMap, staffRows])

  // Filtered workers based on supervisor, zone, and search query
  const visibleWorkers = useMemo(() => {
    return workerAttendanceList
      .filter((w) => {
        if (zoneFilter !== 'all') {
          const zones = asList(w.zone_names)
          if (!zones.includes(zoneFilter)) return false
        }
        if (supervisorFilter !== 'all') {
          const sName = w.supervisor_name || ''
          if (!sName.toLowerCase().includes(supervisorFilter.toLowerCase())) return false
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchName = w.name?.toLowerCase().includes(q)
          const matchCode = String(w.pay_code || '').toLowerCase().includes(q)
          const matchArea = w.area_display.toLowerCase().includes(q)
          const matchSup = w.supervisor_name.toLowerCase().includes(q)
          if (!matchName && !matchCode && !matchArea && !matchSup) return false
        }
        return true
      })
      .sort((a, b) => {
        // Primary sort: Supervisor Name
        const supComp = a.supervisor_name.localeCompare(b.supervisor_name)
        if (supComp !== 0) return supComp
        // Secondary sort: Zone
        const zoneComp = a.zone_display.localeCompare(b.zone_display)
        if (zoneComp !== 0) return zoneComp
        // Tertiary sort: Area
        const areaComp = a.area_display.localeCompare(b.area_display)
        if (areaComp !== 0) return areaComp
        // Worker Name
        return a.name.localeCompare(b.name)
      })
  }, [workerAttendanceList, zoneFilter, supervisorFilter, searchQuery])

  const visibleRows = useMemo(
    () => (zoneFilter === 'all' ? rows : rows.filter((row) => row.zone_name === zoneFilter)),
    [rows, zoneFilter]
  )

  const visibleStaffRows = useMemo(
    () => {
      let list = staffRows
      if (zoneFilter !== 'all') {
        list = list.filter((row) => asList(row.zone_names).includes(zoneFilter))
      }
      if (supervisorFilter !== 'all') {
        list = list.filter((row) =>
          String(row.supervisor_name || '').toLowerCase().includes(supervisorFilter.toLowerCase())
        )
      }
      return list
    },
    [staffRows, zoneFilter, supervisorFilter]
  )

  const totals = useMemo(
    () => ({
      total: visibleWorkers.length,
      present: visibleWorkers.filter((w) => w.is_present).length,
      absent: visibleWorkers.filter((w) => w.is_absent).length,
    }),
    [visibleWorkers]
  )

  const staffTotals = useMemo(
    () =>
      visibleStaffRows.reduce(
        (acc, row) => ({
          total: acc.total + 1,
          present: acc.present + (row.submitted ? 1 : 0),
          absent: acc.absent + (row.submitted ? 0 : 1),
        }),
        { total: 0, present: 0, absent: 0 }
      ),
    [visibleStaffRows]
  )

  // Complete attendance export (Supervisor-Wise Worker list + Staff summary + Area summary)
  const handleExportAttendance = async (format) => {
    const filterSubtitle = [
      `Date: ${date}`,
      supervisorFilter !== 'all' ? `Supervisor: ${supervisorFilter}` : 'All Supervisors',
      zoneFilter !== 'all' ? `Zone: ${zoneFilter}` : 'All Zones',
    ].join('  |  ')

    const fileSupervisorSlug = supervisorFilter !== 'all' ? supervisorFilter.replace(/\s+/g, '_') + '_' : 'supervisor_wise_'

    const exportData = {
      filename: `horticulture_attendance_${fileSupervisorSlug}${date}`,
      module: 'Horticulture Operations',
      title: 'Horticulture Worker & Staff Attendance Report',
      subtitle: `Daily attendance logs for IITGN Horticulture operations on ${date} (${filterSubtitle})`,
      metadata: [
        { label: 'Date', value: date },
        { label: 'Supervisor Filter', value: supervisorFilter === 'all' ? 'All Supervisors' : supervisorFilter },
        { label: 'Zone Filter', value: zoneFilter === 'all' ? 'All Zones' : zoneFilter },
        { label: 'Total Workers', value: visibleWorkers.length },
      ],
      stats: [
        { label: 'Total Workers', value: visibleWorkers.length },
        { label: 'Present Workers', value: totals.present },
        { label: 'Absent Workers', value: totals.absent },
        { label: 'Supervisors in Scope', value: visibleStaffRows.length },
        { label: 'Staff Present', value: staffTotals.present },
      ],
      sections: [
        {
          title: `Worker Attendance (${supervisorFilter === 'all' ? 'Supervisor-Wise Complete List' : `Supervisor: ${supervisorFilter}`})`,
          headers: [
            'Date',
            'Supervisor Name',
            'Zone',
            'Area',
            'Worker Name',
            'Pay Code',
            'First Half (Morning)',
            'Second Half (Afternoon)',
            'Attendance Status',
          ],
          rows: visibleWorkers.map((w) => [
            date,
            w.supervisor_name,
            w.zone_display,
            w.area_display,
            w.name,
            w.pay_code || '—',
            w.first_half_status,
            w.second_half_status,
            w.overall_status,
          ]),
        },
        {
          title: 'Supervisor & Zone Attendance Summary',
          headers: [
            'Date',
            'Supervisor Name',
            'Pay Code',
            'Role',
            'Zones',
            'Status',
            'Submitted At',
            'Assigned Workers',
            'Present',
            'Absent',
            'Half Day',
          ],
          rows: visibleStaffRows.map((row) => [
            date,
            row.supervisor_name || '—',
            row.pay_code || '—',
            row.role || 'supervisor',
            asList(row.zone_names).join(', ') || '—',
            row.submitted ? 'Present' : 'Absent',
            row.submitted_at ? new Date(row.submitted_at).toLocaleTimeString('en-IN') : '—',
            row.total_workers || 0,
            row.present_count || 0,
            row.absent_count || 0,
            row.half_day_count || 0,
          ]),
        },
        {
          title: 'Area-wise Attendance Summary',
          headers: [
            'Date',
            'Area',
            'Zone',
            'Total Workers',
            'Present',
            'Absent',
            'Late',
            'Leave',
            'Attendance %',
          ],
          rows: visibleRows.map((row) => {
            const pct = row.total_workers
              ? Math.round((Number(row.present || 0) / Number(row.total_workers || 1)) * 100)
              : 0
            return [
              date,
              row.area_name,
              row.zone_name || '—',
              row.total_workers,
              row.present,
              row.absent,
              row.late || 0,
              row.leave || 0,
              `${pct}%`,
            ]
          }),
        },
      ],
    }

    await exportHorticultureReport(format, exportData)
  }

  // Dedicated single-table worker export
  const handleExportWorkersOnly = async (format) => {
    const exportData = {
      filename: `horticulture_workers_${supervisorFilter !== 'all' ? supervisorFilter.replace(/\s+/g, '_') + '_' : 'all_supervisors_'}${date}`,
      module: 'Horticulture Operations',
      title: `Horticulture Worker Attendance Sheet (${supervisorFilter === 'all' ? 'All Supervisors' : supervisorFilter})`,
      subtitle: `Date: ${date} | Total Workers: ${visibleWorkers.length}`,
      metadata: [
        { label: 'Date', value: date },
        { label: 'Supervisor', value: supervisorFilter === 'all' ? 'All Supervisors' : supervisorFilter },
        { label: 'Zone', value: zoneFilter === 'all' ? 'All Zones' : zoneFilter },
        { label: 'Total Workers', value: visibleWorkers.length },
      ],
      stats: [
        { label: 'Total Workers', value: visibleWorkers.length },
        { label: 'Present', value: totals.present },
        { label: 'Absent', value: totals.absent },
      ],
      headers: [
        'Date',
        'Supervisor Name',
        'Zone',
        'Area',
        'Worker Name',
        'Pay Code',
        'First Half (Morning)',
        'Second Half (Afternoon)',
        'Attendance Status',
      ],
      rows: visibleWorkers.map((w) => [
        date,
        w.supervisor_name,
        w.zone_display,
        w.area_display,
        w.name,
        w.pay_code || '—',
        w.first_half_status,
        w.second_half_status,
        w.overall_status,
      ]),
    }
    await exportHorticultureReport(format, exportData)
  }

  return (
    <div>
      <Alert message={error} />

      {/* Top Stat and Filter Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Workers" value={loading ? '...' : totals.total} icon="WK" color="#1d4ed8" />
        <StatCard label="Present" value={loading ? '...' : totals.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={loading ? '...' : totals.absent} icon="AB" color="#dc2626" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', minWidth: 35 }}>Date</div>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', position: 'relative', zIndex: 40 }}>
          <ExportDropdown
            label="Download Attendance"
            onExport={handleExportAttendance}
            disabled={loading || (!visibleRows.length && !workers.length)}
          />
        </Card>
      </div>

      {/* Supervisor and Zone Filter Bar */}
      <Card noPad style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ minWidth: 220 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>
                Filter by Supervisor
              </label>
              <SelectField
                value={supervisorFilter}
                onChange={(e) => setSupervisorFilter(e.target.value)}
                style={{ fontSize: 13, padding: '7px 10px' }}
              >
                <option value="all">All Supervisors ({supervisorNames.length})</option>
                {supervisorNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectField>
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>
                Filter by Zone
              </label>
              <SelectField
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                style={{ fontSize: 13, padding: '7px 10px' }}
              >
                <option value="all">All Zones ({zoneNames.length})</option>
                {zoneNames.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </SelectField>
            </div>

            <div style={{ minWidth: 220, flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>
                Search Worker / Area / Pay Code
              </label>
              <Input
                placeholder="Type name, code, or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: 13, padding: '7px 10px' }}
              />
            </div>
          </div>

          {(supervisorFilter !== 'all' || zoneFilter !== 'all' || searchQuery) && (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setSupervisorFilter('all')
                setZoneFilter('all')
                setSearchQuery('')
              }}
              style={{ alignSelf: 'flex-end', marginBottom: 2 }}
            >
              Clear Filters
            </Btn>
          )}
        </div>
      </Card>

      {/* Staff Attendance by Zone */}
      <Card noPad style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Staff Attendance by Zone</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {staffTotals.present} present | {staffTotals.absent} absent | {staffTotals.total} supervisors in view
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn size="sm" variant={zoneFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setZoneFilter('all')}>
              All
            </Btn>
            {zoneNames.map((zone) => (
              <Btn key={zone} size="sm" variant={zoneFilter === zone ? 'primary' : 'secondary'} onClick={() => setZoneFilter(zone)}>
                {zone}
              </Btn>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Staff Name', 'Pay Code', 'Zone', 'Role', 'Status', 'Worker Attendance', 'Action']}
            rows={visibleStaffRows.map((row) => [
              <div key={`staff-${row.supervisor_id}`} style={{ fontWeight: 600 }}>
                {row.supervisor_name || '—'}
              </div>,
              row.pay_code || '—',
              asList(row.zone_names).join(', ') || '—',
              row.role || 'supervisor',
              <AttendanceBadge key={`status-${row.supervisor_id}`} status={row.submitted ? 'Present' : 'Absent'} />,
              `${row.present_count || 0} present / ${row.absent_count || 0} absent / ${row.half_day_count || 0} half day`,
              <Btn
                key={`btn-${row.supervisor_id}`}
                size="sm"
                variant={supervisorFilter === row.supervisor_name ? 'primary' : 'secondary'}
                onClick={() => {
                  setSupervisorFilter(supervisorFilter === row.supervisor_name ? 'all' : row.supervisor_name)
                }}
              >
                {supervisorFilter === row.supervisor_name ? 'Showing Team' : 'View Workers'}
              </Btn>,
            ])}
            emptyMsg="No horticulture staff attendance found for selected filters."
          />
        )}
      </Card>

      {/* Two pane: Area-wise table & Trend */}
      <div className="ui-two-pane-grid">
        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>Worker Attendance by Area</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn size="sm" variant={zoneFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setZoneFilter('all')}>
                All
              </Btn>
              {zoneNames.map((zone) => (
                <Btn key={zone} size="sm" variant={zoneFilter === zone ? 'primary' : 'secondary'} onClick={() => setZoneFilter(zone)}>
                  {zone}
                </Btn>
              ))}
            </div>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
          ) : (
            <DataTable
              headers={['Area', 'Zone', 'Total', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %']}
              rows={visibleRows.map((row) => {
                const pct = row.total_workers ? Math.round((Number(row.present || 0) / Number(row.total_workers || 1)) * 100) : 0
                return [
                  row.area_name,
                  row.zone_name || '—',
                  row.total_workers,
                  row.present,
                  row.absent,
                  row.late || 0,
                  row.leave || 0,
                  `${pct}%`,
                ]
              })}
              emptyMsg="No worker attendance found for selected date."
            />
          )}
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Attendance Trend (Area-wise)</div>
          <BarGroupChart
            data={visibleRows.map((row) => ({
              name: row.area_name.length > 12 ? `${row.area_name.slice(0, 12)}...` : row.area_name,
              present: row.present || 0,
              absent: row.absent || 0,
            }))}
            bars={[
              { key: 'present', label: 'Present' },
              { key: 'absent', label: 'Absent' },
            ]}
            height={260}
          />
        </Card>
      </div>

      {/* Main Supervisor-Wise Worker Attendance Table */}
      <Card noPad style={{ marginTop: 14 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              Worker Attendance ({supervisorFilter === 'all' ? 'Supervisor-Wise Complete List' : `Supervisor: ${supervisorFilter}`})
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Showing {visibleWorkers.length} worker{visibleWorkers.length !== 1 ? 's' : ''} on {date}
              {supervisorFilter !== 'all' ? ` supervised by ${supervisorFilter}` : ''}
              {zoneFilter !== 'all' ? ` in ${zoneFilter}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ExportDropdown
              label="Download Worker List"
              onExport={handleExportWorkersOnly}
              disabled={loading || !visibleWorkers.length}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={[
              'Worker Name',
              'Pay Code',
              'Supervisor',
              'Zone',
              'Area',
              'First Half (8AM-1PM)',
              'Second Half (1PM-5PM)',
              'Overall Status',
            ]}
            rows={visibleWorkers.map((worker) => [
              <div key={`name-${worker.id}`} style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                {worker.name}
              </div>,
              <span key={`code-${worker.id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
                {worker.pay_code || '—'}
              </span>,
              <div key={`sup-${worker.id}`} style={{ fontWeight: 600, color: 'var(--green-800)' }}>
                {worker.supervisor_name}
              </div>,
              <span key={`zone-${worker.id}`} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {worker.zone_display}
              </span>,
              <span key={`area-${worker.id}`} style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220, display: 'inline-block' }}>
                {worker.area_display}
              </span>,
              <AttendanceBadge key={`first-${worker.id}`} status={worker.first_half_status} />,
              <AttendanceBadge key={`second-${worker.id}`} status={worker.second_half_status} />,
              <AttendanceBadge key={`overall-${worker.id}`} status={worker.overall_status} />,
            ])}
            emptyMsg="No horticulture workers match the selected supervisor, zone, or search query."
          />
        )}
      </Card>
    </div>
  )
}
