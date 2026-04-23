import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, Input, Spinner, StatCard } from '../../components/ui'
import { asList, getErrorMessage } from '../../shared/utils'
import { formatDate, getZoneTone, priorityZoneCards, taskChipStyle } from './helpers'

const AREA_FILTERS = [
  { key: 'red', label: 'Zone Red' },
  { key: 'blue', label: 'Zone Blue' },
  { key: 'black', label: 'Zone Black' },
]

const taskGridTemplate = 'minmax(180px, 1.2fr) minmax(180px, 1fr) minmax(150px, 0.9fr) minmax(130px, 0.8fr)'

function normalizeZoneColor(value) {
  return String(value || '').trim().toLowerCase()
}

function formatTaskAge(daysSinceDone) {
  if (daysSinceDone == null) return 'Not logged yet'
  if (daysSinceDone === 0) return 'Completed today'
  if (daysSinceDone === 1) return 'Completed 1 day ago'
  return `Completed ${daysSinceDone} days ago`
}

function getTaskSummary(task) {
  const threshold = Number(task?.threshold || 0)

  if (!task || task.days_since_done == null) {
    return {
      label: 'Never',
      urgency: 'overdue',
      detail: 'No completed log found',
      cadence: `Every ${threshold} day${threshold === 1 ? '' : 's'}`,
      lastDone: 'Never',
    }
  }

  if (task.urgency === 'overdue') {
    const daysOverdue = Math.max(1, task.days_since_done - threshold)
    return {
      label: 'Overdue',
      urgency: 'overdue',
      detail: `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
      cadence: `Every ${threshold} day${threshold === 1 ? '' : 's'}`,
      lastDone: formatDate(task.last_done_date, 'Never'),
    }
  }

  if (task.urgency === 'due_soon') {
    return {
      label: 'Due soon',
      urgency: 'due_soon',
      detail: formatTaskAge(task.days_since_done),
      cadence: `Every ${threshold} day${threshold === 1 ? '' : 's'}`,
      lastDone: formatDate(task.last_done_date, 'Never'),
    }
  }

  return {
    label: 'Completed recently',
    urgency: 'ok',
    detail: formatTaskAge(task.days_since_done),
    cadence: `Every ${threshold} day${threshold === 1 ? '' : 's'}`,
    lastDone: formatDate(task.last_done_date, 'Never'),
  }
}

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

function StatusBadge({ label, urgency }) {
  const tone = taskChipStyle(urgency)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
      }}
    >
      {label}
    </span>
  )
}

function MetaBadge({ label, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: 'var(--surface)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      {label}
    </span>
  )
}

function TaskDetailHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: taskGridTemplate,
        gap: 12,
        padding: '0 14px 10px 28px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
      }}
    >
      <div>Task</div>
      <div>Status</div>
      <div>Frequency</div>
      <div>Last Done</div>
    </div>
  )
}

function TaskDetailRow({ task, index }) {
  const summary = getTaskSummary(task)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: taskGridTemplate,
        gap: 12,
        padding: '12px 14px 12px 28px',
        borderTop: '1px solid var(--border)',
        background: index % 2 ? 'rgba(45, 74, 62, 0.03)' : '#fcfbf8',
        alignItems: 'center',
      }}
    >
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{task.task_type_name || '-'}</div>
      <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
        <StatusBadge label={summary.label} urgency={summary.urgency} />
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{summary.detail}</div>
      </div>
      <div style={{ color: 'var(--text-2)', fontWeight: 600 }}>{summary.cadence}</div>
      <div style={{ color: 'var(--text-2)' }}>{summary.lastDone}</div>
    </div>
  )
}

function AreaOverviewGroup({ area, expanded, onToggle }) {
  const tone = getZoneTone(area.zone_color)
  const tasks = asList(area.tasks)

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: expanded ? 'var(--surface-2)' : 'var(--surface)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'grid',
          gap: 12,
          padding: '14px 16px',
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                width: 18,
                flexShrink: 0,
                textAlign: 'center',
                color: 'var(--text-3)',
                fontSize: 11,
              }}
            >
              {expanded ? 'v' : '>'}
            </span>

            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{area.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                Area {area.area_number} | {area.area_sqm} sqm
              </span>
            </span>
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <MetaBadge
              label={area.zone_name}
              style={{
                background: tone.soft,
                color: tone.text,
                border: `1px solid ${tone.soft}`,
              }}
            />
            <MetaBadge label={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} />
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 28 }}>
          {area.overdue_task_count > 0 ? (
            <StatusBadge label={`${area.overdue_task_count} overdue`} urgency="overdue" />
          ) : null}
          {area.due_soon_task_count > 0 ? (
            <StatusBadge label={`${area.due_soon_task_count} due soon`} urgency="due_soon" />
          ) : null}
          {area.overdue_task_count === 0 && area.due_soon_task_count === 0 ? (
            <StatusBadge label="Fully on track" urgency="ok" />
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div
          style={{
            padding: '0 0 12px',
            background: '#fcfbf8',
          }}
        >
          {tasks.length === 0 ? (
            <div style={{ padding: '0 28px 8px', fontSize: 12, color: 'var(--text-3)' }}>
              No tasks configured for this area.
            </div>
          ) : (
            <>
              <TaskDetailHeader />
              <div style={{ marginLeft: 18, borderLeft: '2px solid rgba(45, 74, 62, 0.12)' }}>
                {tasks.map((task, index) => (
                  <TaskDetailRow
                    key={`${area.zone_id}-${area.id}-${task.task_type_id}-${index}`}
                    task={task}
                    index={index}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ZoneFilterButton({ filter, active, onClick }) {
  const tone = getZoneTone(filter.key)

  return (
    <button
      type="button"
      onClick={() => onClick(filter.key)}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        borderRadius: 999,
        border: active ? `1px solid ${tone.accent}` : '1px solid var(--border)',
        background: active ? tone.soft : 'var(--surface)',
        color: active ? tone.text : 'var(--text-2)',
        fontSize: 12,
        fontWeight: 800,
        transition: 'all 0.15s ease',
      }}
    >
      {filter.label}
    </button>
  )
}

export default function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [areas, setAreas] = useState([])
  const [zoneFilter, setZoneFilter] = useState('')
  const [search, setSearch] = useState('')
  const [activeAreaKey, setActiveAreaKey] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.getSummary()
      setSummary(data)

      const zoneDetails = await Promise.all(
        asList(data?.zones).map((zone) => horticultureAPI.getZoneDetail(zone.id))
      )

      setAreas(
        zoneDetails.flatMap(({ data: detail }) =>
          asList(detail?.areas).map((area) => ({
            ...area,
            zone_id: detail?.zone_id,
            zone_name: detail?.zone_name,
            zone_color: detail?.zone_color,
          }))
        )
      )
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
  const filteredAreas = useMemo(() => {
    const query = search.trim().toLowerCase()

    return areas.filter((area) => {
      if (zoneFilter && normalizeZoneColor(area.zone_color) !== zoneFilter) {
        return false
      }

      if (!query) {
        return true
      }

      const searchableText = `${area.name || ''} ${area.area_number || ''} ${area.zone_name || ''}`.toLowerCase()
      return searchableText.includes(query)
    })
  }, [areas, search, zoneFilter])

  useEffect(() => {
    if (activeAreaKey == null) return
    const hasActiveArea = filteredAreas.some((area) => `${area.zone_id}-${area.id}` === activeAreaKey)
    if (!hasActiveArea) {
      setActiveAreaKey(null)
    }
  }, [activeAreaKey, filteredAreas])

  const toggleArea = (areaKey) => {
    setActiveAreaKey((current) => (current === areaKey ? null : areaKey))
  }

  const onZoneFilterChange = (nextFilter) => {
    setZoneFilter((current) => (current === nextFilter ? '' : nextFilter))
  }

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
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Area Overview</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                All areas are listed here. Expand a row to review every task in that area.
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Showing {filteredAreas.length} of {areas.length} areas
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {AREA_FILTERS.map((filter) => (
              <ZoneFilterButton
                key={filter.key}
                filter={filter}
                active={zoneFilter === filter.key}
                onClick={onZoneFilterChange}
              />
            ))}
            <div style={{ minWidth: 240, flex: '1 1 280px', marginLeft: 'auto' }}>
              <Input
                placeholder="Search area..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>

        {loading && !summary ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : filteredAreas.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
            No areas match the selected filters.
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            {filteredAreas.map((area) => {
              const areaKey = `${area.zone_id}-${area.id}`
              return (
                <AreaOverviewGroup
                  key={areaKey}
                  area={area}
                  expanded={activeAreaKey === areaKey}
                  onToggle={() => toggleArea(areaKey)}
                />
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
