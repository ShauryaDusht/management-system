import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Input, Spinner, StatCard } from '../../components/ui'
import { BarGroupChart } from '../../components/ui/Charts'
import { todayISO } from '../../shared/utils'

export default function AttendanceTab() {
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [areas, setAreas] = useState([])
  const [areaClassFilter, setAreaClassFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const load = async (selectedDate) => {
    setLoading(true)
    setError('')
    try {
      const [{ data: attendanceData }, { data: areaData }] = await Promise.all([
        hkAPI.getAttendanceSummary(selectedDate),
        hkAPI.getAreas(),
      ])
      const attendanceRows = Array.isArray(attendanceData) ? attendanceData : attendanceData?.results || []
      const areaRows = Array.isArray(areaData) ? areaData : areaData?.results || []
      setRows(attendanceRows)
      setAreas(areaRows)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load attendance summary.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(date)
  }, [date])

  const areaTypeById = useMemo(() => {
    const map = new Map()
    areas.forEach((a) => map.set(a.id, a.area_type))
    return map
  }, [areas])

  const visibleRows = useMemo(() => {
    const filtered = areaClassFilter === 'all'
      ? rows
      : rows.filter((r) => areaGroup(r.area_name, areaTypeById.get(r.area_id)) === areaClassFilter)

    return [...filtered].sort((a, b) => {
      const ta = areaTypeById.get(a.area_id)
      const tb = areaTypeById.get(b.area_id)
      const ga = areaGroup(a.area_name, ta)
      const gb = areaGroup(b.area_name, tb)
      const order = { hostels: 0, academic: 1, others: 2 }
      if (order[ga] !== order[gb]) return order[ga] - order[gb]
      if (ga === 'academic') {
        const an = extractBlockNo(a.area_name)
        const bn = extractBlockNo(b.area_name)
        if (an !== bn) return an - bn
      }
      return String(a.area_name || '').localeCompare(String(b.area_name || ''))
    })
  }, [areaClassFilter, areaTypeById, rows])

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, r) => ({
          present: acc.present + (r.present || 0),
          absent: acc.absent + (r.absent || 0),
          total: acc.total + (r.total_workers || 0),
        }),
        { present: 0, absent: 0, total: 0 },
      ),
    [visibleRows],
  )

  return (
    <div>
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <StatCard label="Total Workers" value={totals.total} icon="WK" color="#1d4ed8" />
        <StatCard label="Present" value={totals.present} icon="PR" color="#16a34a" />
        <StatCard label="Absent" value={totals.absent} icon="AB" color="#dc2626" />
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 40 }}>Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
        <Card noPad>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontWeight: 700 }}>Worker Attendance by Area</div>
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
            </div>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <Spinner />
            </div>
          ) : (
            <DataTable
              headers={['Area', 'Total', 'Present', 'Absent', 'Attendance %']}
              rows={visibleRows.map((r) => {
                const pct = r.total_workers ? Math.round((r.present / r.total_workers) * 100) : 0
                return [r.area_name, r.total_workers, r.present, r.absent, `${pct}%`]
              })}
              emptyMsg="No attendance entries found for selected segment/date."
            />
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Attendance Trend (Area-wise)</div>
          <BarGroupChart
            data={visibleRows.map((r) => ({
              name: r.area_name.length > 10 ? `${r.area_name.slice(0, 10)}...` : r.area_name,
              present: r.present || 0,
              absent: r.absent || 0,
            }))}
            bars={[
              { key: 'present', label: 'Present' },
              { key: 'absent', label: 'Absent' },
            ]}
            height={260}
          />
        </Card>
      </div>
    </div>
  )
}
