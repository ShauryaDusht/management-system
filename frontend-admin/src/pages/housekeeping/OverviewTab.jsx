import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Btn, Card, DataTable, Spinner } from '../../components/ui'

function weekdayName(date) {
  return date.toLocaleDateString('en-IN', { weekday: 'short' })
}

export default function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [rows, setRows] = useState([])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: areaData } = await hkAPI.getAreas()
      const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
      setAreas(areaList)
      const today = new Date().toISOString().slice(0, 10)
      const recResults = await Promise.all(
        areaList.map(async (a) => {
          try {
            const { data } = await hkAPI.getDailyRecords(a.id, today)
            return { area: a, records: Array.isArray(data) ? data : data?.results || [] }
          } catch {
            return { area: a, records: [] }
          }
        })
      )
      const mapped = recResults.map(({ area, records }) => {
        const completed = records.filter((r) => r.status === 'done').length
        const pending = records.filter((r) => r.status === 'pending').length
        const skipped = records.filter((r) => r.status === 'skipped').length
        return {
          area_id: area.id,
          area: area.name,
          pending,
          skipped,
          completed,
          supervisor: (area.caretakers || []).join(', ') || '—',
        }
      })
      setRows(mapped)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load housekeeping overview.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        pending: acc.pending + r.pending,
        skipped: acc.skipped + r.skipped,
        completed: acc.completed + r.completed,
      }),
      { pending: 0, skipped: 0, completed: 0 }
    )
  }, [rows])

  return (
    <div>
      <Alert message={error} />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
          <Card noPad>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Today's Running Tasks
            </div>
            <DataTable
              // column renamed from 'Ongoing' to 'Skipped'
              headers={['Hostel/Block', 'Pending', 'Skipped', 'Completed', 'Supervisor']}
              rows={rows.map((r) => [
                r.area,
                <span key={`p-${r.area_id}`}><Badge value="pending" style={{ marginRight: 6 }} />{r.pending}</span>,
                <span key={`s-${r.area_id}`}><Badge value="skipped" style={{ marginRight: 6 }} />{r.skipped}</span>,
                <span key={`c-${r.area_id}`}><Badge value="completed" style={{ marginRight: 6 }} />{r.completed}</span>,
                <span key={`sup-${r.area_id}`} style={{ fontSize: 12 }}>
                  {r.supervisor}
                </span>,
              ])}
            />
          </Card>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Report Trends</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 220,
                color: 'var(--text-3)',
                fontSize: 12,
                gap: 8,
                border: '1px dashed var(--border)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 24 }}>📊</span>
              <div style={{ textAlign: 'center' }}>Historical trend data not yet available</div>
              <div style={{ fontSize: 11, textAlign: 'center' }}>
                This chart will populate once daily records accumulate
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13 }}>
            Completed <strong>{totals.completed}</strong> Tasks
          </div>
          <div style={{ fontSize: 13 }}>
            Skipped <strong>{totals.skipped}</strong> Tasks
          </div>
          <div style={{ fontSize: 13 }}>
            Pending <strong>{totals.pending}</strong> Tasks
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary">Share Daily Tasks</Btn>
            <Btn variant="orange">Export Report</Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
