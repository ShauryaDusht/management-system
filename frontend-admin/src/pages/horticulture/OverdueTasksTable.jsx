import { useEffect, useState } from 'react'

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

function AreaRow({ area, expanded, onToggle, columnCount }) {
  return (
    <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
      <td colSpan={columnCount} style={{ padding: 0, background: 'var(--surface-2)' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{ fontSize: 12, color: 'var(--text-3)', width: 12, textAlign: 'center', flexShrink: 0 }}
            >
              {expanded ? '\u25BC' : '\u25B6'}
            </span>
            <span style={{ fontWeight: 700 }}>{area.areaName}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {area.tasks.length} overdue {area.tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </button>
      </td>
    </tr>
  )
}

function TaskRow({ task, rowIndex }) {
  return (
    <tr
      className="ui-data-row"
      style={{
        borderBottom: '1px solid var(--border)',
        background: rowIndex % 2 ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <td style={{ padding: '11px 14px 11px 40px', color: 'var(--text-3)' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 12,
            borderTop: '1px solid var(--border)',
            verticalAlign: 'middle',
          }}
        />
      </td>
      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{task.zone_name || '-'}</td>
      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{task.task_type_name || '-'}</td>
      <td style={{ padding: '11px 14px', color: '#991b1b', fontWeight: 700 }}>{task.days_overdue ?? '-'}</td>
      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{formatDate(task.last_done_date, 'Never')}</td>
    </tr>
  )
}

export default function OverdueTasksTable({ rows, loading, emptyMsg = 'No data found.' }) {
  const [activeAreaKey, setActiveAreaKey] = useState(null)
  const groupedRows = groupTasksByArea(rows)
  const headers = ['Area', 'Zone', 'Task', 'Days Overdue', 'Last Done']

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

  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-3)',
                  borderBottom: '2px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Spinner />
                </div>
              </td>
            </tr>
          ) : groupedRows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
                {emptyMsg}
              </td>
            </tr>
          ) : (
            groupedRows.flatMap((area) => {
              const expanded = activeAreaKey === area.key
              const childRows = expanded
                ? area.tasks.map((task, index) => (
                    <TaskRow
                      key={`${area.key}-${task.zone_id}-${task.task_type_id}-${task.last_done_date || 'never'}-${index}`}
                      task={task}
                      rowIndex={index}
                    />
                  ))
                : []

              return [
                <AreaRow
                  key={area.key}
                  area={area}
                  expanded={expanded}
                  onToggle={() => toggleArea(area.key)}
                  columnCount={headers.length}
                />,
                ...childRows,
              ]
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
