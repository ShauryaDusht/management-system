import React from 'react'
import { Card, Badge, Btn, DataTable } from '../../components/ui'

export default function SubstationPanelsTab({
  sheets = [],
  onSelectPanelForEntry,
}) {
  const rows = sheets.map((s, idx) => {
    let totalFeeders = 0
    let incomersCount = 0
    ;(s.tables || []).forEach((t) => {
      ;(t.rows || []).forEach((r) => {
        if (!r.div) totalFeeders++
        if (r.anchor) incomersCount++
      })
    })

    const isHT = s.section === 'HT'

    return [
      idx + 1,
      <div>
        <span style={{ fontWeight: 800, color: 'var(--text)' }}>{s.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>
          {s.full_title || s.full || s.name}
        </span>
      </div>,
      <Badge value={isHT ? 'urgent' : 'present'}>
        {s.section} {isHT ? '(11 kV)' : '(415 V)'}
      </Badge>,
      <span style={{ fontWeight: 600 }}>
        {totalFeeders} Circuits
      </span>,
      <span style={{ fontWeight: 600, color: '#6d28d9' }}>
        {incomersCount || 1} Incomer(s)
      </span>,
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {isHT ? '11.0 kV (10.0-12.0)' : '230/415 V (200-260)'}
      </span>,
      <Badge value="done">Active</Badge>,
      <Btn
        size="sm"
        variant="primary"
        onClick={() => onSelectPanelForEntry(s.id)}
      >
        Open Sheet
      </Btn>,
    ]
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
              Campus Electrical Distribution Panels
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              High Tension (HT) and Low Tension (LT) panel network across IIT Gandhinagar Palaj Campus
            </p>
          </div>
          <Badge value="present">{sheets.length} Configured Substations</Badge>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        <DataTable
          headers={['#', 'Substation Panel', 'Section / Voltage', 'Feeders', 'Incomers', 'Nominal Range', 'Status', 'Actions']}
          rows={rows}
          emptyMsg="No substation panels configured."
        />
      </Card>
    </div>
  )
}
