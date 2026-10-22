import React, { useState, useMemo } from 'react'
import { Card, Btn, Badge, DataTable } from '../../components/ui'
import SubstationApi from '../../modules/substation/substationApi'
import ExportDropdown from '../../components/ui/ExportDropdown'

export default function SubstationReportsTab({
  sheets = [],
  docs = [],
  onSelectPanelForEntry,
}) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [panelFilter, setPanelFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter docs based on criteria
  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      if (startDate && d.date < startDate) return false
      if (endDate && d.date > endDate) return false
      if (panelFilter && d.sheet !== panelFilter) return false
      if (shiftFilter && d.slot !== shiftFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const sheetObj = sheets.find((s) => s.id === d.sheet)
        const name = (sheetObj?.name || d.sheet || '').toLowerCase()
        const op = (d.operator || '').toLowerCase()
        if (!name.includes(q) && !op.includes(q)) return false
      }
      return true
    })
  }, [docs, startDate, endDate, panelFilter, shiftFilter, searchQuery, sheets])

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Shift',
      'Substation Panel',
      'Section',
      'Operator',
      'Log Time',
      'Cells Filled',
      'Total Cells',
    ]

    const csvRows = [headers]

    filteredDocs.forEach((d) => {
      const sheetObj = sheets.find((s) => s.id === d.sheet)
      csvRows.push([
        d.date || '',
        d.slot || '',
        sheetObj?.name || d.sheet || '',
        sheetObj?.section || d.section || '',
        d.operator || '',
        d.time || '',
        d.filled || Object.keys(d.rows || {}).length || 0,
        d.total || 0,
      ])
    })

    SubstationApi.exportCsv(`iitgn_substation_logs_${startDate}_to_${endDate}.csv`, csvRows)
  }

  const handleExportPdf = () => {
    if (filteredDocs.length === 0) return

    const headers = [
      'Date',
      'Shift',
      'Substation Panel',
      'Section',
      'Operator',
      'Time',
      'Filled',
      'Total',
    ]

    const csvRows = [headers]

    filteredDocs.forEach((d) => {
      const sheetObj = sheets.find((s) => s.id === d.sheet)
      csvRows.push([
        d.date || '',
        d.slot || '',
        sheetObj?.name || d.sheet || '',
        sheetObj?.section || d.section || '',
        d.operator || '',
        d.time || '',
        d.filled || Object.keys(d.rows || {}).length || 0,
        d.total || 0,
      ])
    })

    SubstationApi.exportPdf(
      `iitgn_substation_logs_${startDate}_to_${endDate}.pdf`,
      csvRows,
      `IITGN Substation Log Audit (${startDate} to ${endDate})`
    )
  }

  // Rows for DataTable
  const tableRows = useMemo(() => {
    return filteredDocs.slice(0, 100).map((d) => {
      const sheetObj = sheets.find((s) => s.id === d.sheet)
      const sheetName = sheetObj ? sheetObj.name : d.substation || d.sheet
      const section = sheetObj ? sheetObj.section : d.section || 'LT'

      return [
        d.date,
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.slot || 'R1'}</span>,
        <div>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{sheetName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>
            {sheetObj?.full_title || sheetObj?.full || section + ' Panel'}
          </span>
        </div>,
        <Badge value={section === 'HT' ? 'urgent' : 'present'}>
          {section}
        </Badge>,
        d.operator || 'Staff',
        d.time || '--:--',
        <span style={{ fontWeight: 600 }}>
          {d.filled || Object.keys(d.rows || {}).length} cells
        </span>,
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => onSelectPanelForEntry(d.sheet, d.date, d.slot)}
        >
          View Log
        </Btn>,
      ]
    })
  }, [filteredDocs, sheets, onSelectPanelForEntry])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Filters Card */}
      <Card style={{ padding: '16px 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Panel
            </label>
            <select
              value={panelFilter}
              onChange={(e) => setPanelFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <option value="">All Substations</option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.section})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Shift
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <option value="">All Shifts</option>
              <option value="R1">Shift R1</option>
              <option value="R2">Shift R2</option>
              <option value="R3">Shift R3</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Operator or Substation..."
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 13,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Showing <b>{Math.min(filteredDocs.length, 100)}</b> of <b>{filteredDocs.length}</b> matched records
          </span>

          <div>
            <ExportDropdown
              variant="substation-primary"
              label={`Export (${filteredDocs.length})`}
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
              disabled={filteredDocs.length === 0}
            />
          </div>
        </div>
      </Card>

      {/* Results Table Card */}
      <Card style={{ padding: 0 }}>
        <DataTable
          headers={['Date', 'Shift', 'Substation Panel', 'Section', 'Operator', 'Time', 'Filled', 'Actions']}
          rows={tableRows}
          emptyMsg="No historical logs match your filters."
        />
      </Card>
    </div>
  )
}
