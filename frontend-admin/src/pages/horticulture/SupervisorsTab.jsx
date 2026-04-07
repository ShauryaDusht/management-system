import { useEffect, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Card, DataTable, Spinner } from '../../components/ui'
import { asList, getErrorMessage } from '../../shared/utils'
import { formatDateTime } from './helpers'

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
        const { data } = await horticultureAPI.getSupervisors()
        if (!mounted) return
        setRows(asList(data?.supervisors))
      } catch (err) {
        if (!mounted) return
        setError(getErrorMessage(err, 'Failed to load horticulture supervisors.'))
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
      <Alert message={error} />

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
          }}
        >
          Supervisors
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Name', 'Zone', 'Workers Count', 'Last Login', 'Tasks Logged This Week']}
            rows={rows.map((row) => [
              row.supervisor_name,
              asList(row.zone_names).join(', ') || '-',
              row.workers_count ?? 0,
              formatDateTime(row.last_login, 'Never'),
              row.tasks_logged_this_week ?? 0,
            ])}
            emptyMsg="No horticulture supervisors found."
          />
        )}
      </Card>
    </div>
  )
}
