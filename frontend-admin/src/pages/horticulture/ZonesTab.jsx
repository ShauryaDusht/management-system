import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, SelectField, Spinner } from '../../components/ui'
import { TrendArea } from '../../components/ui/Charts'

const FALLBACK_ZONES = [
  { name: 'North Lawn', pending: 3, ongoing: 2, completed: 7, supervisor: 'Pending Assignment' },
  { name: 'Central Green', pending: 2, ongoing: 4, completed: 6, supervisor: 'Pending Assignment' },
  { name: 'Academic Belt', pending: 5, ongoing: 1, completed: 4, supervisor: 'Pending Assignment' },
  { name: 'Hostel Greens', pending: 4, ongoing: 2, completed: 5, supervisor: 'Pending Assignment' },
]

export default function ZonesTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zones, setZones] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getSummary()
        if (!mounted) return
        const apiZones = Array.isArray(data?.zones) ? data.zones : []
        setZones(apiZones.length ? apiZones : FALLBACK_ZONES)
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load horticulture summary.')
        setZones(FALLBACK_ZONES)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return zones
    return zones.filter((z) => (z.name || '').toLowerCase().includes(filter.toLowerCase()))
  }, [zones, filter])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, z) => ({
          pending: acc.pending + Number(z.pending || 0),
          ongoing: acc.ongoing + Number(z.ongoing || 0),
          completed: acc.completed + Number(z.completed || 0),
        }),
        { pending: 0, ongoing: 0, completed: 0 }
      ),
    [filtered]
  )

  const trendData = useMemo(
    () => [
      { name: 'Mon', completed: Math.max(2, totals.completed - 3), ongoing: Math.max(1, totals.ongoing - 1), pending: totals.pending + 2 },
      { name: 'Tue', completed: Math.max(2, totals.completed - 2), ongoing: totals.ongoing, pending: totals.pending + 1 },
      { name: 'Wed', completed: Math.max(2, totals.completed - 1), ongoing: totals.ongoing + 1, pending: totals.pending },
      { name: 'Thu', completed: totals.completed, ongoing: totals.ongoing, pending: Math.max(0, totals.pending - 1) },
      { name: 'Fri', completed: totals.completed + 1, ongoing: Math.max(0, totals.ongoing - 1), pending: Math.max(0, totals.pending - 2) },
    ],
    [totals]
  )

  return (
    <div>
      <Alert type="warn" message="Horticulture module is under development. Displayed values are scaffolded for UI validation." />
      <Alert message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
        <Card noPad>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700 }}>Zone Task Status</div>
            <SelectField value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }}>
              <option value="all">All Zones</option>
              {zones.map((z) => (
                <option key={z.name} value={z.name}>
                  {z.name}
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
              headers={['Zone', 'Pending', 'Ongoing', 'Completed', 'Supervisor']}
              rows={filtered.map((z) => [z.name, z.pending || 0, z.ongoing || 0, z.completed || 0, z.supervisor || 'Pending Assignment'])}
            />
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Report Trends</div>
          <TrendArea
            data={trendData}
            lines={[
              { key: 'completed', label: 'Completed' },
              { key: 'ongoing', label: 'Ongoing' },
              { key: 'pending', label: 'Pending' },
            ]}
            height={240}
          />
        </Card>
      </div>

      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>Completed: <strong>{totals.completed}</strong></div>
          <div style={{ fontSize: 13 }}>Ongoing: <strong>{totals.ongoing}</strong></div>
          <div style={{ fontSize: 13 }}>Pending: <strong>{totals.pending}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary">Share Daily Tasks</Btn>
            <Btn variant="orange">Export Report</Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
