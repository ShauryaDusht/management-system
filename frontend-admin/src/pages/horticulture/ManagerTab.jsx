import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, Spinner } from '../../components/ui'
import { asList, getErrorMessage, triggerDownload } from '../../shared/utils'
import { formatDate, formatDateTime, getZoneTone, humanizeSeason } from './helpers'

const SEASON_OPTIONS = [
  { key: 'summer', label: 'Summer', accent: '#ea580c', soft: '#ffedd5', text: '#9a3412' },
  { key: 'winter', label: 'Winter', accent: '#2563eb', soft: '#dbeafe', text: '#1d4ed8' },
  { key: 'rainy', label: 'Rainy', accent: '#0f766e', soft: '#ccfbf1', text: '#115e59' },
]

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadWeeklyReport(rows, weekEnd) {
  const header = ['zone', 'area', 'task', 'last_done', 'days_overdue']
  const body = rows.map((row) => [
    row.zone_name || '',
    row.area_name || '',
    row.task_name || '',
    row.last_done_date || '',
    row.days_overdue ?? '',
  ])
  const csv = [header, ...body]
    .map((line) => line.map((cell) => csvEscape(cell)).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `horticulture_weekly_report_${weekEnd || 'current'}.csv`)
}

function SeasonButton({ option, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(option.key)}
      style={{
        minHeight: 96,
        borderRadius: 16,
        border: `1px solid ${active ? option.accent : 'var(--border)'}`,
        background: active ? option.soft : 'var(--surface)',
        color: active ? option.text : 'var(--text-2)',
        fontWeight: 800,
        fontSize: 18,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active ? `inset 0 0 0 1px ${option.accent}` : 'none',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {option.label}
    </button>
  )
}

function WeeklyZoneCard({ zone }) {
  const tone = getZoneTone(zone.zone_color)
  const taskTotals = asList(zone.task_totals)
  const criticalAreas = asList(zone.critical_areas)

  return (
    <Card
      style={{
        borderTop: `4px solid ${tone.accent}`,
        background: `linear-gradient(180deg, ${tone.soft}, var(--surface))`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: tone.text }}>{zone.zone_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Supervisor: <strong>{zone.supervisor_name || 'Unassigned'}</strong>
          </div>
        </div>
        <div
          style={{
            padding: '5px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            background: zone.critical_overdue_count > 0 ? '#fee2e2' : '#d1fae5',
            color: zone.critical_overdue_count > 0 ? '#991b1b' : '#065f46',
          }}
        >
          {zone.critical_overdue_count > 0 ? 'Critical Attention' : 'Stable'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.6)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Tasks Done This Week</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{zone.tasks_completed_total ?? 0}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.6)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Attendance Compliance</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{zone.attendance_compliance_pct ?? 0}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {zone.attendance_days_submitted ?? 0}/{zone.attendance_expected_days ?? 0} days
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.6)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Critical Overdue Count</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: zone.critical_overdue_count > 0 ? '#991b1b' : 'inherit' }}>
            {zone.critical_overdue_count ?? 0}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Task Breakdown</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {taskTotals.map((task) => (
            <div
              key={`${zone.zone_id}-${task.task_type_id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.72)',
              }}
            >
              <span style={{ fontSize: 13 }}>{task.task_type_name}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{task.completed_count ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Critical Areas</div>
        {criticalAreas.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No areas are beyond the critical overdue threshold.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {criticalAreas.map((area) => (
              <div
                key={`${zone.zone_id}-${area.area_id}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #fecaca',
                  background: '#fff7f7',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>{area.area_name}</div>
                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 4 }}>
                  {asList(area.critical_tasks)
                    .map((task) => `${task.task_type_name} (${task.days_overdue} overdue)`)
                    .join(' | ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export default function ManagerTab() {
  const [loading, setLoading] = useState(true)
  const [updatingSeason, setUpdatingSeason] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.getManagerWeeklySummary()
      setSummary(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load manager weekly summary.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const seasonSetting = summary?.season_setting
  const zones = useMemo(() => asList(summary?.zones), [summary?.zones])
  const reportRows = useMemo(() => asList(summary?.report_rows), [summary?.report_rows])

  const onSeasonChange = async (season) => {
    if (!season || season === seasonSetting?.season) return
    setUpdatingSeason(true)
    setError('')
    try {
      await horticultureAPI.updateSeason(season)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update season setting.'))
    } finally {
      setUpdatingSeason(false)
    }
  }

  const exportWeeklyReport = () => {
    downloadWeeklyReport(reportRows, summary?.week_end)
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Season Toggle</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              Last changed by <strong>{seasonSetting?.updated_by_name || 'System default'}</strong> on{' '}
              <strong>{formatDateTime(seasonSetting?.updated_at, 'Not changed yet')}</strong>
            </div>
          </div>
          <Btn variant="secondary" onClick={load} disabled={loading || updatingSeason}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Btn>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
          }}
        >
          {SEASON_OPTIONS.map((option) => (
            <SeasonButton
              key={option.key}
              option={option}
              active={seasonSetting?.season === option.key}
              disabled={loading || updatingSeason}
              onClick={onSeasonChange}
            />
          ))}
        </div>

        {seasonSetting?.season ? (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
            Current season: <strong>{humanizeSeason(seasonSetting.season)}</strong>
          </div>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Weekly Summary</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {summary?.week_start ? formatDate(summary.week_start) : '-'} to {summary?.week_end ? formatDate(summary.week_end) : '-'}
            </div>
          </div>
          <Btn onClick={exportWeeklyReport} disabled={loading || updatingSeason}>
            Generate Weekly Report
          </Btn>
        </div>
      </Card>

      {loading && !summary ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {zones.map((zone) => (
            <WeeklyZoneCard key={zone.zone_id} zone={zone} />
          ))}
        </div>
      )}
    </div>
  )
}
