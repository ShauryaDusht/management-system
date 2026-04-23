import { useEffect, useMemo, useState } from 'react'

import { Spinner } from '../../components/ui'
import { asList } from '../../shared/utils'
import { formatDate } from './helpers'

function groupTasksByArea(rows) {
  const grouped = []
  const areaMap = new Map()

  asList(rows).forEach((row, index) => {
    const areaKey = row.area_id ?? row.area_name ?? `area-${index}`
    if (!areaMap.has(areaKey)) {
      const areaGroup = {
        key: areaKey,
        areaName: row.area_name || 'Unknown Area',
        tasks: [],
      }
      areaMap.set(areaKey, areaGroup)
      grouped.push(areaGroup)
    }

    areaMap.get(areaKey).tasks.push(row)
  })

  return grouped
}

const detailGridTemplate = 'minmax(120px, 0.9fr) minmax(220px, 1.4fr) minmax(110px, 0.7fr) minmax(130px, 0.8fr)'

function DetailHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: detailGridTemplate,
        gap: 12,
        padding: '0 14px 10px 28px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
      }}
    >
      <div>Zone</div>
      <div>Task</div>
      <div>Days Overdue</div>
      <div>Last Done</div>
    </div>
  )
}

function DetailRow({ task, index }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: detailGridTemplate,
        gap: 12,
        padding: '12px 14px 12px 28px',
        borderTop: '1px solid var(--border)',
        background: index % 2 ? 'rgba(45, 74, 62, 0.03)' : '#fcfbf8',
        alignItems: 'center',
      }}
    >
      <div style={{ color: 'var(--text-2)', fontWeight: 600 }}>{task.zone_name || '-'}</div>
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{task.task_type_name || '-'}</div>
      <div style={{ color: '#991b1b', fontWeight: 800 }}>{task.days_overdue ?? '-'}</div>
      <div style={{ color: 'var(--text-2)' }}>{formatDate(task.last_done_date, 'Never')}</div>
    </div>
  )
}

function AreaGroup({ area, expanded, onToggle }) {
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          padding: '14px 16px',
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          color: 'var(--text)',
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
          <span style={{ fontWeight: 800, fontSize: 14 }}>{area.areaName}</span>
        </span>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            background: area.tasks.length > 0 ? '#fee2e2' : 'var(--surface)',
            color: area.tasks.length > 0 ? '#991b1b' : 'var(--text-3)',
            fontSize: 11,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {area.tasks.length} overdue {area.tasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </button>

      {expanded ? (
        <div
          style={{
            padding: '0 0 12px',
            background: '#fcfbf8',
          }}
        >
          <DetailHeader />
          <div style={{ marginLeft: 18, borderLeft: '2px solid rgba(45, 74, 62, 0.12)' }}>
            {area.tasks.map((task, index) => (
              <DetailRow
                key={`${area.key}-${task.zone_id}-${task.task_type_id}-${task.last_done_date || 'never'}-${index}`}
                task={task}
                index={index}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function OverdueTasksTable({ rows, loading, emptyMsg = 'No data found.' }) {
  const [activeAreaKey, setActiveAreaKey] = useState(null)
  const groupedRows = useMemo(() => groupTasksByArea(rows), [rows])

  useEffect(() => {
    if (activeAreaKey == null) return
    const hasActiveArea = groupedRows.some((area) => area.key === activeAreaKey)
    if (!hasActiveArea) {
      setActiveAreaKey(null)
    }
  }, [activeAreaKey, groupedRows])

  const toggleArea = (areaKey) => {
    setActiveAreaKey((current) => (current === areaKey ? null : areaKey))
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  if (groupedRows.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
        {emptyMsg}
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto' }}>
      {groupedRows.map((area) => (
        <AreaGroup
          key={area.key}
          area={area}
          expanded={activeAreaKey === area.key}
          onToggle={() => toggleArea(area.key)}
        />
      ))}
    </div>
  )
}
