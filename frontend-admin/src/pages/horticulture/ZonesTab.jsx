import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Card, DataTable, SelectField, Spinner } from '../../components/ui'
import { asList, getErrorMessage } from '../../shared/utils'
import { getZoneTone, taskChipStyle } from './helpers'

function TaskChip({ task }) {
  const tone = taskChipStyle(task?.urgency)
  const label = task?.days_since_done == null ? 'Never' : `${task.days_since_done}d`

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 76,
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
      }}
      title={
        task?.last_done_date
          ? `Last done ${task.last_done_date} | Threshold ${task.threshold} days`
          : `Not logged yet | Threshold ${task?.threshold ?? '-'} days`
      }
    >
      {label}
    </span>
  )
}

export default function ZonesTab() {
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [zones, setZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setSummaryLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getSummary()
        if (!mounted) return
        const zoneList = asList(data?.zones)
        setZones(zoneList)
        setSelectedZoneId((current) => current || String(zoneList[0]?.id || ''))
      } catch (err) {
        if (!mounted) return
        setError(getErrorMessage(err, 'Failed to load horticulture zones.'))
      } finally {
        if (mounted) setSummaryLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedZoneId) {
      setDetail(null)
      return
    }

    let mounted = true
    ;(async () => {
      setDetailLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getZoneDetail(selectedZoneId)
        if (!mounted) return
        setDetail(data)
      } catch (err) {
        if (!mounted) return
        setError(getErrorMessage(err, 'Failed to load zone detail.'))
      } finally {
        if (mounted) setDetailLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [selectedZoneId])

  const selectedZone = useMemo(
    () => zones.find((zone) => String(zone.id) === String(selectedZoneId)) || detail,
    [detail, selectedZoneId, zones]
  )

  const zoneTone = getZoneTone(selectedZone?.color || detail?.zone_color)
  const taskTypes = asList(detail?.task_types)
  const areas = asList(detail?.areas)

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Zone Detail</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              Season-aware task thresholds update automatically from the backend.
            </div>
          </div>
          <div style={{ minWidth: 240 }}>
            <SelectField
              value={selectedZoneId}
              onChange={(event) => setSelectedZoneId(event.target.value)}
              disabled={summaryLoading || zones.length === 0}
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      </Card>

      {summaryLoading ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : zones.length === 0 ? (
        <Card>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No horticulture zones available.</div>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: zoneTone.accent,
                    }}
                  />
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail?.zone_name || selectedZone?.name || '-'}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  Supervisor: <strong>{detail?.supervisor_name || 'Unassigned'}</strong>
                </div>
              </div>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: zoneTone.soft,
                  color: zoneTone.text,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Season: {detail?.season ? detail.season.replace(/^./, (char) => char.toUpperCase()) : '-'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>Legend:</span>
              <span style={{ ...taskChipStyle('ok'), borderRadius: 999, padding: '4px 8px', fontSize: 11, border: '1px solid #a7f3d0' }}>On Track</span>
              <span style={{ ...taskChipStyle('due_soon'), borderRadius: 999, padding: '4px 8px', fontSize: 11, border: '1px solid #fde68a' }}>Due Soon</span>
              <span style={{ ...taskChipStyle('overdue'), borderRadius: 999, padding: '4px 8px', fontSize: 11, border: '1px solid #fecaca' }}>Overdue</span>
            </div>
          </Card>

          <Card noPad>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontWeight: 700,
              }}
            >
              Area Task Status Grid
            </div>
            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                <Spinner />
              </div>
            ) : (
              <DataTable
                headers={[
                  'Area',
                  ...taskTypes.map((taskType) => `${taskType.name} (${taskType.threshold}d)`),
                ]}
                rows={areas.map((area) => {
                  const taskMap = new Map(asList(area.tasks).map((task) => [task.task_type_id, task]))
                  return [
                    <div key={`area-${area.id}`}>
                      <div style={{ fontWeight: 700 }}>{area.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{area.area_sqm} sqm</div>
                    </div>,
                    ...taskTypes.map((taskType) => (
                      <TaskChip key={`${area.id}-${taskType.id}`} task={taskMap.get(taskType.id)} />
                    )),
                  ]
                })}
                emptyMsg="No areas found for the selected zone."
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
