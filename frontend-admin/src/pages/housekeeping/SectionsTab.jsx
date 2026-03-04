import { useEffect, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Card, DataTable, SelectField, Spinner } from '../../components/ui'

export default function SectionsTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    hkAPI
      .getAreas()
      .then(({ data }) => setAreas(Array.isArray(data) ? data : data?.results || []))
      .catch((e) => setError(e.response?.data?.detail || 'Failed to load HK areas.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = areas.filter((a) => typeFilter === 'all' || a.area_type === typeFilter)

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 700 }}>Sections / Areas</div>
          <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 180 }}>
            <option value="all">All Types</option>
            {[...new Set(areas.map((a) => a.area_type))].map((t) => (
              <option key={t} value={t}>
                {String(t || '').replace(/_/g, ' ')}
              </option>
            ))}
          </SelectField>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Area Name', 'Type', 'Worker Count', 'Caretaker/Supervisor']}
            rows={filtered.map((a) => [
              a.name,
              <span key={`t-${a.id}`} style={{ textTransform: 'capitalize', fontSize: 12 }}>
                {String(a.area_type || '').replace(/_/g, ' ')}
              </span>,
              a.worker_count || 0,
              (a.caretakers || []).join(', ') || '-',
            ])}
          />
        )}
      </Card>
    </div>
  )
}
