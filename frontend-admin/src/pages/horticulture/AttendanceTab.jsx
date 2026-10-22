import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, ExportDropdown, Input, Spinner, StatCard } from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'
import { asList, getErrorMessage, todayISO, triggerDownload } from '../../shared/utils'

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`
  return str
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
  const visibleRows = useMemo(
    () => (zoneFilter === 'all' ? rows : rows.filter((row) => row.zone_name === zoneFilter)),
    [rows, zoneFilter]
  )
  const visibleStaffRows = useMemo(
    () => (
      zoneFilter === 'all'
        ? staffRows
        : staffRows.filter((row) => asList(row.zone_names).includes(zoneFilter))
    ),
    [staffRows, zoneFilter]
  )
  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, row) => ({
          total: acc.total + Number(row.total_workers || 0),
          present: acc.present + Number(row.present || 0),
          absent: acc.absent + Number(row.absent || 0),
        }),
        { total: 0, present: 0, absent: 0 }
      ),
    [visibleRows]
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

  const recordMap = useMemo(() => {
    const map = new Map()
    records.forEach((record) => map.set(`${record.worker}-${record.half}`, record))
    return map
  }, [records])

  const statusText = (record) => {
    if (!record?.status) return 'Not marked'
    return String(record.status).replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  const downloadAttendanceCsv = () => {
    const summaryRows = [
      ['Report Title', 'Horticulture Worker Attendance Report'],
      ['Date', date],
      ['Zone Filter', zoneFilter === 'all' ? 'All zones' : zoneFilter],
      [],
      ['Staff Attendance by Zone'],
      ['Staff Name', 'Pay Code', 'Role', 'Zones', 'Status', 'Submitted At', 'Workers', 'Present', 'Absent', 'Half Day'],
      ...visibleStaffRows.map((row) => [
        row.supervisor_name || '',
        row.pay_code || '',
        row.role || 'supervisor',
        asList(row.zone_names).join(', '),
        row.submitted ? 'Present' : 'Absent',
        row.submitted_at || '',
        row.total_workers || 0,
        row.present_count || 0,
        row.absent_count || 0,
        row.half_day_count || 0,
      ]),
      [],
      ['Area Attendance Summary'],
      ['Area', 'Zone', 'Total', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %'],
      ...visibleRows.map((row) => {
        const pct = row.total_workers ? Math.round((Number(row.present || 0) / Number(row.total_workers || 1)) * 100) : 0
        return [
          row.area_name,
          row.zone_name || '',
          row.total_workers,
          row.present,
          row.absent,
          row.late || 0,
          row.leave || 0,
          `${pct}%`,
        ]
      }),
      [],
      ['Worker Attendance Marked by Supervisors'],
      ['Worker', 'Areas', 'Pay Code', 'First Half', 'Second Half'],
      ...workers.map((worker) => {
        const first = recordMap.get(`${worker.id}-first`)
        const second = recordMap.get(`${worker.id}-second`)
        return [
          worker.name,
          asList(worker.area_names).join(', ') || '',
          worker.pay_code || '',
          statusText(first),
          statusText(second),
        ]
      }),
    ]
    const csv = summaryRows.map((row) => row.map((cell) => csvValue(cell)).join(',')).join('\n')
    triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `horticulture_attendance_${date}.csv`)
  }

  const getAttendanceExportData = async (format) => {
    if (format === 'csv') {
      downloadAttendanceCsv()
      return null
    }
    const headers = ['Area', 'Zone', 'Total Workers', 'Present', 'Absent', 'Attendance %']
    const rows = visibleRows.map((row) => {
      const pct = row.total_workers ? Math.round((Number(row.present || 0) / Number(row.total_workers || 1)) * 100) : 0
      return [
        row.area_name || '-',
        row.zone_name || '-',
        row.total_workers || 0,
        row.present || 0,
        row.absent || 0,
        `${pct}%`,
      ]
    })
    return {
      title: `Horticulture Attendance Report (${date})`,
      filename: `horticulture_attendance_${date}`,
      headers,
      rows: rows.length ? rows : [['No area attendance records', '-', '-', '-', '-', '-']],
    }
  }

  return (
    <div>
      <Alert message={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Workers" value={loading ? '...' : totals.total} icon="WK" color="#1d4ed8" />
        <StatCard label="Present" value={loading ? '...' : totals.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={loading ? '...' : totals.absent} icon="AB" color="#dc2626" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Date</div>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ExportDropdown
            size="sm"
            getData={getAttendanceExportData}
            disabled={loading || (!visibleRows.length && !workers.length)}
            buttonText="Download Report"
            align="right"
          />
        </Card>
      </div>

      <Card noPad style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Staff Attendance by Zone</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {staffTotals.present} present | {staffTotals.absent} absent | {staffTotals.total} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn size="sm" variant={zoneFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setZoneFilter('all')}>All</Btn>
            {zoneNames.map((zone) => (
              <Btn key={zone} size="sm" variant={zoneFilter === zone ? 'primary' : 'secondary'} onClick={() => setZoneFilter(zone)}>{zone}</Btn>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Staff Name', 'Pay Code', 'Zone', 'Role', 'Status', 'Worker Attendance']}
            rows={visibleStaffRows.map((row) => [
              row.supervisor_name || '-',
              row.pay_code || '-',
              asList(row.zone_names).join(', ') || '-',
              row.role || 'supervisor',
              row.submitted ? 'Present' : 'Absent',
              `${row.present_count || 0} present / ${row.absent_count || 0} absent / ${row.half_day_count || 0} half day`,
            ])}
            emptyMsg="No horticulture staff attendance found for selected date."
          />
        )}
      </Card>

      <div className="ui-two-pane-grid">
        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>Worker Attendance by Area</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn size="sm" variant={zoneFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setZoneFilter('all')}>All</Btn>
              {zoneNames.map((zone) => (
                <Btn key={zone} size="sm" variant={zoneFilter === zone ? 'primary' : 'secondary'} onClick={() => setZoneFilter(zone)}>{zone}</Btn>
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
                  row.zone_name || '-',
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

      <Card noPad style={{ marginTop: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Worker Attendance Marked by Supervisors
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : (
          <DataTable
            headers={['Worker', 'Areas', 'Pay Code', 'First Half', 'Second Half']}
            rows={workers.map((worker) => {
              const first = recordMap.get(`${worker.id}-first`)
              const second = recordMap.get(`${worker.id}-second`)
              const areaNames = asList(worker.area_names).join(', ') || '-'
              return [
                worker.name,
                areaNames,
                worker.pay_code || '-',
                statusText(first),
                statusText(second),
              ]
            })}
            emptyMsg="No horticulture workers found."
          />
        )}
      </Card>
    </div>
  )
}
