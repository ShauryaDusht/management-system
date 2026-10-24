import React, { useMemo } from 'react'
import { Card, StatCard, Badge, Btn, DataTable } from '../../components/ui'

export default function SubstationOverviewTab({
  sheets = [],
  docs = [],
  selectedDate,
  selectedSlot,
  isAdmin = false,
  isSupervisor = false,
  onDateChange,
  onSlotChange,
  onSelectPanelForEntry,
  onOpenFlash,
  onOpenLayout,
}) {
  const SLOTS = ['R1', 'R2', 'R3']

  // Map docs for quick lookup by sheet for selected date and slot
  const readingsMap = useMemo(() => {
    const map = {}
    docs.forEach((d) => {
      if (d.date === selectedDate && d.slot === selectedSlot) {
        map[d.sheet] = d
      }
    })
    return map
  }, [docs, selectedDate, selectedSlot])

  // Split sheets into HT and LT
  const htSheets = useMemo(() => sheets.filter((s) => s.section === 'HT'), [sheets])
  const ltSheets = useMemo(() => sheets.filter((s) => s.section !== 'HT'), [sheets])

  // Count completions
  const totalPanels = sheets.length || 11
  const completedCount = useMemo(() => {
    return sheets.filter((s) => {
      const isHourly = s.mode === 'hourly' || s.id === 'newht' || s.id === 'oldht'
      const r = isHourly
        ? docs.find((d) => d.sheet === s.id && d.date === selectedDate)
        : readingsMap[s.id]
      return r && (r.filled > 0 || Object.keys(r.rows || {}).length > 0)
    }).length
  }, [sheets, readingsMap, docs, selectedDate])

  const completionPct = totalPanels > 0 ? Math.round((completedCount / totalPanels) * 100) : 0

  // Recent logs
  const recentRows = useMemo(() => {
    const sorted = [...docs].sort((a, b) => {
      const dComp = (b.date || '').localeCompare(a.date || '')
      if (dComp !== 0) return dComp
      return (b.time || '').localeCompare(a.time || '')
    }).slice(0, 10)

    return sorted.map((d) => {
      const sheetObj = sheets.find((s) => s.id === d.sheet)
      const sheetName = sheetObj ? sheetObj.name : d.substation || d.sheet
      const section = sheetObj ? sheetObj.section : d.section || 'LT'
      const isHourly = d.slot === 'day' || sheetObj?.mode === 'hourly' || d.sheet === 'newht' || d.sheet === 'oldht'
      return [
        d.date || selectedDate,
        isHourly ? (
          <span style={{ fontWeight: 700, color: '#7c3aed' }}>Hourly (24h)</span>
        ) : (
          <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.slot || 'R1'}</span>
        ),
        <div>
          <span style={{ fontWeight: 600 }}>{sheetName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>
            {sheetObj?.full_title || sheetObj?.full || section + ' Panel'}
          </span>
        </div>,
        <Badge value={section === 'HT' ? 'urgent' : 'present'} style={{ textTransform: 'uppercase' }}>
          {section}
        </Badge>,
        d.operator || 'Staff',
        d.time || '--:--',
        <Badge value="done">
          {d.filled || Object.keys(d.rows || {}).length} Logged
        </Badge>,
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => onSelectPanelForEntry(d.sheet, d.date, d.slot)}
        >
          {isAdmin ? 'View Analytics' : isSupervisor ? 'Audit Panel' : 'View / Edit'}
        </Btn>,
      ]
    })
  }, [docs, sheets, selectedDate, onSelectPanelForEntry, isAdmin, isSupervisor])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <StatCard
          icon="substation"
          label="Monitored Panels"
          value={totalPanels}
          sub={`${htSheets.length} HT (11kV) • ${ltSheets.length} LT (415V)`}
          color="var(--green-800)"
        />
        <StatCard
          icon="done"
          label={`Shift ${selectedSlot} Completion`}
          value={`${completedCount} / ${totalPanels}`}
          sub={`${completionPct}% Logged for ${selectedDate}`}
          color={completionPct >= 100 ? '#16a34a' : '#ea580c'}
        />
        <StatCard
          icon="insights"
          label="Campus Load Demand"
          value="1,420 kW"
          sub="Normal operating envelope"
          color="#0284c7"
          onClick={onOpenFlash}
          style={{ cursor: 'pointer' }}
        />
        <StatCard
          icon="horticulture"
          label="Solar Generation"
          value="385 kW"
          sub="27% of total campus demand"
          color="#16a34a"
          onClick={onOpenFlash}
          style={{ cursor: 'pointer' }}
        />
        <StatCard
          icon="tasks"
          label="Average Power Factor"
          value="0.98"
          sub="Target > 0.95 maintained"
          color="#7c3aed"
        />
      </div>

      {/* Date & Shift Control Bar */}
      <Card style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              Log Date:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1.5px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 600,
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>
              Shift Slot:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSlotChange(s)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    border: '1.5px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: selectedSlot === s ? 'var(--green-800)' : 'var(--surface)',
                    color: selectedSlot === s ? '#fff' : 'var(--text)',
                  }}
                >
                  Shift {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* High Tension (HT) Panels Grid */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ef4444',
                display: 'inline-block',
              }}
            />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              High Tension (HT) Substations — 11 kV
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ({htSheets.length} panels)
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {htSheets.map((p) => {
            const isHourly = p.mode === 'hourly' || p.id === 'newht' || p.id === 'oldht'
            const reading = isHourly
              ? docs.find((d) => d.sheet === p.id && d.date === selectedDate)
              : readingsMap[p.id]
            const isDone = reading && (reading.filled > 0 || Object.keys(reading.rows || {}).length > 0)
            return (
              <Card
                key={p.id}
                style={{
                  borderLeft: `4px solid ${isDone ? '#16a34a' : isHourly ? '#7c3aed' : '#f59e0b'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                      {p.name}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {isHourly && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(124, 58, 237, 0.12)',
                            color: '#7c3aed',
                            border: '1px solid rgba(124, 58, 237, 0.25)',
                          }}
                        >
                          Hourly (24h)
                        </span>
                      )}
                      <Badge value={isDone ? 'completed' : 'pending'}>
                        {isDone ? 'Done' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    {p.full_title || p.full || 'HT Panel'}
                  </p>
                  {isDone && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 6, fontWeight: 600 }}>
                      Logged by {reading.operator || 'Operator'} ({reading.time || 'Logged'})
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <Btn
                    size="sm"
                    variant={isAdmin || isSupervisor ? 'secondary' : isDone ? 'secondary' : 'primary'}
                    onClick={() => onSelectPanelForEntry(p.id, selectedDate, isHourly ? 'day' : selectedSlot)}
                  >
                    {isAdmin ? 'View Analytics' : isSupervisor ? 'Audit Panel' : isDone ? 'View / Edit' : 'Log Panel'}
                  </Btn>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Low Tension (LT) Panels Grid */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#0284c7',
                display: 'inline-block',
              }}
            />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Low Tension (LT) Substations — 415 V
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ({ltSheets.length} panels)
            </span>
          </div>

          {isAdmin && (
            <Btn
              size="sm"
              variant="primary"
              onClick={() => (onOpenLayout ? onOpenLayout('sport_lt') : onSelectPanelForEntry('sport_lt'))}
            >
              + Add Substation / Incomer
            </Btn>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {ltSheets.map((p) => {
            const reading = readingsMap[p.id]
            const isDone = reading && (reading.filled > 0 || Object.keys(reading.rows || {}).length > 0)
            return (
              <Card
                key={p.id}
                style={{
                  borderLeft: `4px solid ${isDone ? '#16a34a' : '#0284c7'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                      {p.name}
                    </span>
                    <Badge value={isDone ? 'completed' : 'pending'}>
                      {isDone ? 'Done' : 'Pending'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    {p.full_title || p.full || 'LT Panel'}
                  </p>
                  {isDone && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 6, fontWeight: 600 }}>
                      Logged by {reading.operator || 'Operator'} ({reading.time || 'Logged'})
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  {isAdmin && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      style={{ border: '1px solid var(--border)', color: 'var(--green-900)' }}
                      onClick={() => (onOpenLayout ? onOpenLayout(p.id) : onSelectPanelForEntry(p.id))}
                    >
                      + Incomer
                    </Btn>
                  )}
                  <Btn
                    size="sm"
                    variant={isAdmin || isSupervisor ? 'secondary' : isDone ? 'secondary' : 'primary'}
                    onClick={() => onSelectPanelForEntry(p.id, selectedDate, selectedSlot)}
                  >
                    {isAdmin ? 'View Analytics' : isSupervisor ? 'Audit Panel' : isDone ? 'View / Edit' : 'Log Panel'}
                  </Btn>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Recent Activity Table */}
      <Card style={{ padding: 0 }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Recent Substation Log Entries
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Last 10 recorded electrical readings across campus substations
            </p>
          </div>
        </div>

        <DataTable
          headers={['Date', 'Shift', 'Substation Panel', 'Section', 'Operator', 'Time', 'Status', 'Action']}
          rows={recentRows}
          emptyMsg="No substation readings recorded yet."
        />
      </Card>
    </div>
  )
}
