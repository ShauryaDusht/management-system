import { Fragment, useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import { asList, getErrorMessage, triggerDownload } from '../../shared/utils'
import { formatDate, getZoneTone, taskChipStyle } from './helpers'

const FREQUENCY_FILTERS = [
  { key: 'daily', label: 'Daily', description: '1 day' },
  { key: 'weekly', label: 'Weekly', description: '2-7 days' },
  { key: 'biweekly', label: 'Biweekly', description: '8-15 days' },
  { key: 'monthly', label: 'Monthly', description: '16-30 days' },
  { key: 'more_than_month', label: 'More than month', description: '> 30 days' },
]

function matchesFrequencyFilter(threshold, filterKey) {
  const days = Number(threshold)

  if (!Number.isFinite(days)) return false
  if (filterKey === 'daily') return days === 1
  if (filterKey === 'weekly') return days > 1 && days <= 7
  if (filterKey === 'biweekly') return days > 7 && days <= 15
  if (filterKey === 'monthly') return days > 15 && days <= 30
  if (filterKey === 'more_than_month') return days > 30

  return false
}

function formatTaskAge(daysSinceDone) {
  if (daysSinceDone == null) return 'Not logged yet'
  if (daysSinceDone === 0) return 'Completed today'
  if (daysSinceDone === 1) return 'Completed 1 day ago'
  return `Completed ${daysSinceDone} days ago`
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`
  return str
}

function getTaskPresentation(task, fallbackThreshold) {
  const threshold = task?.threshold ?? fallbackThreshold ?? 0

  if (!task || task.days_since_done == null) {
    return {
      label: 'Never',
      detail: 'No completed log found',
      footer: `Expected every ${threshold} day${threshold === 1 ? '' : 's'}`,
      urgency: 'overdue',
    }
  }

  if (task.urgency === 'overdue') {
    return {
      label: 'Overdue',
      detail: formatTaskAge(task.days_since_done),
      footer: `Threshold ${threshold} day${threshold === 1 ? '' : 's'}`,
      urgency: 'overdue',
    }
  }

  if (task.urgency === 'due_soon') {
    return {
      label: 'Due soon',
      detail: formatTaskAge(task.days_since_done),
      footer: `Due at ${threshold} day${threshold === 1 ? '' : 's'}`,
      urgency: 'due_soon',
    }
  }

  return {
    label: 'Completed recently',
    detail: formatTaskAge(task.days_since_done),
    footer: task.last_done_date ? formatDate(task.last_done_date) : `Every ${threshold} days`,
    urgency: 'ok',
  }
}

function FrequencyFilterButton({ filter, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(filter.key)}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        padding: '9px 12px',
        borderRadius: 12,
        border: active ? '1px solid var(--green-700)' : '1px solid var(--border)',
        background: active ? 'rgba(61, 107, 85, 0.12)' : 'var(--surface)',
        color: active ? 'var(--green-800)' : 'var(--text-2)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(61, 107, 85, 0.08)' : 'none',
        minWidth: 108,
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800 }}>{filter.label}</span>
      {filter.description ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{filter.description}</span> : null}
    </button>
  )
}

function LegendBadge({ label, urgency }) {
  const tone = taskChipStyle(urgency)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
      }}
    >
      {label}
    </span>
  )
}

function TaskStatusCard({ task, taskType }) {
  const presentation = getTaskPresentation(task, taskType?.threshold)
  const tone = taskChipStyle(presentation.urgency)

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        alignContent: 'start',
        minHeight: 122,
        padding: '14px 12px',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'rgba(255, 255, 255, 0.8)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'fit-content',
          minWidth: 122,
          padding: '5px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          background: tone.background,
          color: tone.color,
          border: `1px solid ${tone.border}`,
        }}
      >
        {presentation.label}
      </span>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{presentation.detail}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45 }}>{presentation.footer}</div>
    </div>
  )
}

export default function ZonesTab() {
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [zones, setZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [detail, setDetail] = useState(null)
  const [frequencyFilter, setFrequencyFilter] = useState('daily')

  const [allAreas, setAllAreas] = useState([])
  const [areasLoading, setAreasLoading] = useState(true)
  const [areaModal, setAreaModal] = useState(null)
  const [areaForm, setAreaForm] = useState({ area_number: '', name: '', zone_id: '' })
  const [areaFormError, setAreaFormError] = useState('')
  const [areaSaving, setAreaSaving] = useState(false)

  const loadAreas = async () => {
    setAreasLoading(true)
    try {
      const { data } = await horticultureAPI.getAreas()
      setAllAreas(asList(data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture areas.'))
    } finally {
      setAreasLoading(false)
    }
  }

  const reloadZoneDetail = async () => {
    if (!selectedZoneId) return
    try {
      const { data } = await horticultureAPI.getZoneDetail(selectedZoneId)
      setDetail(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load zone detail.'))
    }
  }

  useEffect(() => {
    loadAreas()
  }, [])

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
        setSelectedZoneId((current) => {
          const hasCurrent = zoneList.some((zone) => String(zone.id) === String(current))
          return hasCurrent ? current : String(zoneList[0]?.id || '')
        })
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
  const visibleTaskTypes = useMemo(
    () => taskTypes.filter((taskType) => matchesFrequencyFilter(taskType.threshold, frequencyFilter)),
    [frequencyFilter, taskTypes]
  )
  const visibleTaskTypeIds = useMemo(
    () => new Set(visibleTaskTypes.map((taskType) => String(taskType.id))),
    [visibleTaskTypes]
  )
  const gridTemplateColumns = useMemo(
    () => `minmax(230px, 280px) repeat(${visibleTaskTypes.length}, minmax(170px, 1fr))`,
    [visibleTaskTypes.length]
  )
  const gridMinWidth = useMemo(
    () => 280 + visibleTaskTypes.length * 170,
    [visibleTaskTypes.length]
  )

  const downloadAreaTaskCsv = () => {
    if (!detail || !areas.length) return
    const headers = ['Zone', 'Area', 'Area Number', ...visibleTaskTypes.map((taskType) => taskType.name)]
    const rows = areas.map((area) => {
      const taskMap = new Map(asList(area.tasks).map((task) => [String(task.task_type_id), task]))
      return [
        detail.zone_name || selectedZone?.name || '',
        area.name || '',
        area.area_number || '',
        ...visibleTaskTypes.map((taskType) => {
          const task = taskMap.get(String(taskType.id))
          const presentation = getTaskPresentation(task, taskType.threshold)
          return `${presentation.label} - ${presentation.detail}`
        }),
      ]
    })
    const csv = [headers, ...rows].map((row) => row.map((cell) => csvValue(cell)).join(',')).join('\n')
    const zoneName = String(detail.zone_name || selectedZone?.name || 'zone')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    triggerDownload(
      new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
      `horticulture_area_task_report_${zoneName || 'zone'}_${frequencyFilter}.csv`
    )
  }

  const openAddArea = () => {
    setAreaForm({ area_number: '', name: '', zone_id: zones[0]?.id || '' })
    setAreaFormError('')
    setAreaModal({ mode: 'create' })
  }

  const saveArea = async () => {
    setAreaSaving(true)
    setAreaFormError('')
    try {
      await horticultureAPI.createArea({
        area_number: Number(areaForm.area_number),
        name: String(areaForm.name || '').trim(),
        zone_id: Number(areaForm.zone_id),
      })
      setAreaModal(null)
      await loadAreas()
      await reloadZoneDetail()
    } catch (err) {
      setAreaFormError(getErrorMessage(err, 'Failed to add area.'))
    } finally {
      setAreaSaving(false)
    }
  }

  const removeArea = async (area) => {
    if (!window.confirm(`Remove area "${area.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await horticultureAPI.deleteArea(area.id)
      await loadAreas()
      await reloadZoneDetail()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to remove area.'))
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card noPad style={{ marginBottom: 14 }}>
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
          <div>
            <div style={{ fontWeight: 700 }}>Areas</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Add or remove horticulture areas across all zones.
            </div>
          </div>
          <Btn size="sm" onClick={openAddArea} disabled={!zones.length}>+ Add Area</Btn>
        </div>

        {areasLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Area #', 'Name', 'Zone', 'Supervisor', 'Remove']}
            rows={allAreas.map((area) => [
              area.area_number,
              area.name,
              area.zone_name || '-',
              area.supervisor_name || '-',
              <Btn key={`remove-${area.id}`} size="sm" variant="ghost" onClick={() => removeArea(area)}>Remove</Btn>,
            ])}
            emptyMsg="No horticulture areas found."
          />
        )}
      </Card>

      <Modal
        open={!!areaModal}
        onClose={() => setAreaModal(null)}
        title="Add Area"
        width={480}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setAreaModal(null)} disabled={areaSaving}>Cancel</Btn>
            <Btn onClick={saveArea} disabled={areaSaving}>{areaSaving ? 'Saving...' : 'Add Area'}</Btn>
          </>
        )}
      >
        <Alert message={areaFormError} />
        <Field label="Area Number" required>
          <Input
            type="number"
            min={1}
            max={42}
            value={areaForm.area_number}
            onChange={(event) => setAreaForm((prev) => ({ ...prev, area_number: event.target.value }))}
          />
        </Field>
        <Field label="Area Name" required>
          <Input
            value={areaForm.name}
            onChange={(event) => setAreaForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </Field>
        <Field label="Zone" required>
          <SelectField
            value={areaForm.zone_id}
            onChange={(event) => setAreaForm((prev) => ({ ...prev, zone_id: event.target.value }))}
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </SelectField>
        </Field>
      </Modal>


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
              Review area task health by maintenance frequency and recent completion status.
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
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
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {areas.length} areas
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>Legend:</span>
              <LegendBadge label="Overdue / Never" urgency="overdue" />
              <LegendBadge label="Due Soon" urgency="due_soon" />
              <LegendBadge label="Completed Recently" urgency="ok" />
            </div>
          </Card>

          <Card noPad>
            <div
              style={{
                padding: '16px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'grid',
                gap: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>Area Task Status Grid</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                    Filtering by task frequency updates the visible task columns instantly.
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Showing {visibleTaskTypes.length} of {taskTypes.length} task types
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={downloadAreaTaskCsv}
                  disabled={detailLoading || !areas.length || !visibleTaskTypes.length}
                >
                  Download CSV
                </Btn>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FREQUENCY_FILTERS.map((filter) => (
                  <FrequencyFilterButton
                    key={filter.key}
                    filter={filter}
                    active={frequencyFilter === filter.key}
                    onClick={setFrequencyFilter}
                  />
                ))}
              </div>
            </div>

            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                <Spinner />
              </div>
            ) : visibleTaskTypes.length === 0 ? (
              <div style={{ padding: '36px 18px', color: 'var(--text-3)', textAlign: 'center' }}>
                No task types match the selected frequency filter.
              </div>
            ) : areas.length === 0 ? (
              <div style={{ padding: '36px 18px', color: 'var(--text-3)', textAlign: 'center' }}>
                No areas found for the selected zone.
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <div style={{ minWidth: gridMinWidth }}>
                  <div style={{ display: 'grid', gridTemplateColumns }}>
                    <div
                      style={{
                        position: 'sticky',
                        top: 0,
                        left: 0,
                        zIndex: 4,
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface)',
                      }}
                    >
                      <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 800 }}>
                        Area
                      </div>
                    </div>
                    {visibleTaskTypes.map((taskType) => (
                      <div
                        key={taskType.id}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 3,
                          padding: '14px 14px 12px',
                          borderBottom: '1px solid var(--border)',
                          borderRight: '1px solid var(--border)',
                          background: 'var(--surface)',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{taskType.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                          Every {taskType.threshold} day{taskType.threshold === 1 ? '' : 's'}
                        </div>
                      </div>
                    ))}

                    {areas.map((area, rowIndex) => {
                      const areaTasks = asList(area.tasks)
                      const taskMap = new Map(areaTasks.map((task) => [task.task_type_id, task]))
                      const hasVisibleTasks = areaTasks.some((task) => visibleTaskTypeIds.has(String(task.task_type_id)))
                      const rowBackground = rowIndex % 2 ? '#fcfbf8' : 'var(--surface)'

                      return (
                        <Fragment key={area.id}>
                          <div
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 2,
                              padding: '16px',
                              borderBottom: '1px solid var(--border)',
                              borderRight: '1px solid var(--border)',
                              background: rowBackground,
                            }}
                          >
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{area.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                Area {area.area_number}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {area.overdue_task_count > 0 ? (
                                  <LegendBadge label={`${area.overdue_task_count} overdue`} urgency="overdue" />
                                ) : null}
                                {area.due_soon_task_count > 0 ? (
                                  <LegendBadge label={`${area.due_soon_task_count} due soon`} urgency="due_soon" />
                                ) : null}
                                {area.overdue_task_count === 0 && area.due_soon_task_count === 0 ? (
                                  <LegendBadge label="Fully on track" urgency="ok" />
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {hasVisibleTasks ? (
                            visibleTaskTypes.map((taskType) => (
                              <div
                                key={`${area.id}-${taskType.id}`}
                                style={{
                                  padding: '14px',
                                  borderBottom: '1px solid var(--border)',
                                  borderRight: '1px solid var(--border)',
                                  background: rowBackground,
                                }}
                              >
                                <TaskStatusCard task={taskMap.get(taskType.id)} taskType={taskType} />
                              </div>
                            ))
                          ) : (
                            <div
                              style={{
                                gridColumn: `span ${visibleTaskTypes.length}`,
                                padding: '14px',
                                borderBottom: '1px solid var(--border)',
                                borderRight: '1px solid var(--border)',
                                background: rowBackground,
                              }}
                            >
                              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>
                                All tasks within this frequency are on schedule
                              </div>
                            </div>
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}