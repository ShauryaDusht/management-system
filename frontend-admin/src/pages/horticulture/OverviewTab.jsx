import { useEffect, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, Spinner, StatCard } from '../../components/ui'
import { asList, getErrorMessage } from '../../shared/utils'
import { formatDate, getZoneTone, priorityZoneCards } from './helpers'

function ZoneStatusCard({ zone }) {
  const tone = getZoneTone(zone.zone_color)
  return (
    <Card
      style={{
        borderTop: `4px solid ${tone.accent}`,
        background: `linear-gradient(180deg, ${tone.soft}, var(--surface))`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{zone.zone_name}</div>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: tone.accent,
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Supervisor</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: tone.text }}>{zone.supervisor_name || 'Unassigned'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>On Track</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{zone.tasks_on_track_pct}%</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Attendance</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: zone.attendance_submitted_today ? '#166534' : '#991b1b' }}>
            {zone.attendance_submitted_today ? 'Submitted' : 'Not Submitted'}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
        {zone.present_count} present | {zone.absent_count} absent | {zone.half_day_count} half day
      </div>
    </Card>
  )
}

export default function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.getSummary()
      setSummary(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture overview.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const zoneCards = priorityZoneCards(summary?.zone_status)
  const overdueRows = asList(summary?.overdue_tasks)

  return (
    <div>
      <Alert message={error} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <StatCard label="Total Areas" value={loading ? '...' : summary?.total_areas ?? 0} icon="AR" color="#1d4ed8" />
        <StatCard label="Total Workers" value={loading ? '...' : summary?.total_workers ?? 0} icon="WK" color="#16a34a" />
        <StatCard label="Tasks Due Today" value={loading ? '...' : summary?.tasks_due_today ?? 0} icon="TD" color="#d97706" />
        <StatCard label="Tasks Overdue" value={loading ? '...' : summary?.tasks_overdue ?? 0} icon="OD" color="#dc2626" />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Overview</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              Current season: <strong>{summary?.current_season ? summary.current_season.replace(/^./, (char) => char.toUpperCase()) : '-'}</strong>
            </div>
          </div>
          <Btn variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Btn>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Zone Status</div>
        {loading && !summary ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {zoneCards.map((zone) => (
              <ZoneStatusCard key={zone.zone_id} zone={zone} />
            ))}
          </div>
        )}
      </Card>

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Overdue Tasks</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sorted worst first</div>
        </div>
        <DataTable
          loading={loading}
          headers={['Area', 'Zone', 'Task', 'Days Overdue', 'Last Done']}
          rows={overdueRows.map((row) => [
            row.area_name,
            row.zone_name,
            row.task_type_name,
            <span key={`${row.area_id}-${row.task_type_id}`} style={{ fontWeight: 700, color: '#991b1b' }}>
              {row.days_overdue}
            </span>,
            formatDate(row.last_done_date, 'Never'),
          ])}
          emptyMsg="No overdue horticulture tasks."
        />
      </Card>
    </div>
  )
}
