import { useEffect, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Card, DataTable, Spinner } from '../../components/ui'

export default function SupervisorsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getSummary()
        if (!mounted) return
        const zones = Array.isArray(data?.zones) ? data.zones : []
        const map = {}
        zones.forEach((z) => {
          const name = z.supervisor || 'Unassigned'
          if (!map[name]) map[name] = { name, zones: 0, workers: 0 }
          map[name].zones += 1
          map[name].workers += Number(z.worker_count || 0)
        })
        setRows(Object.values(map))
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load supervisor list.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div>
      <Alert type="warn" message="Supervisor records for horticulture are not seeded yet." />
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Supervisor List
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Supervisor', 'Assigned Zones', 'Workers']}
            rows={rows.map((r) => [r.name, r.zones, r.workers])}
            emptyMsg="No supervisors mapped to horticulture zones yet."
          />
        )}
      </Card>
    </div>
  )
}
