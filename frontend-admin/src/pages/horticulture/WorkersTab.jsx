import { useEffect, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Badge, Card, DataTable, Spinner } from '../../components/ui'

export default function WorkersTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await horticultureAPI.getSummary()
        if (!mounted) return
        const list = Array.isArray(data?.tasks) ? data.tasks : []
        setTasks(list)
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.detail || 'Failed to load assigned inventory/tasks.')
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
      <Alert type="warn" message="Assigned inventory for horticulture is scaffolded until module APIs are finalized." />
      <Alert message={error} />
      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          Assigned Inventory
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Task/Item', 'Zone', 'Assigned To', 'Status']}
            rows={tasks.map((t, idx) => [
              t.item_name || t.task_name || `Task ${idx + 1}`,
              t.zone_name || t.zone || '-',
              t.assigned_to || '-',
              <Badge key={`s-${idx}`} value={t.status || 'pending'} />,
            ])}
            emptyMsg="No assigned inventory/tasks available yet."
          />
        )}
      </Card>
    </div>
  )
}
