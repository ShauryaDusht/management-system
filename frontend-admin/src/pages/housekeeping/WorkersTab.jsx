import { useEffect, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Card, DataTable, SelectField, Spinner } from '../../components/ui'

export default function WorkersTab() {
  const [areas, setAreas] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedArea, setSelectedArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadWorkers = async (areaId) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getWorkers(areaId || undefined)
      setWorkers(Array.isArray(data) ? data : data?.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load workers.')
    } finally {
      setLoading(false)
    }
  }

  // Single initialisation effect: for query optimization, see comments in the function body.
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await hkAPI.getAreas()
        const list = Array.isArray(data) ? data : data?.results || []
        setAreas(list)
        const firstId = list.length ? String(list[0].id) : ''
        setSelectedArea(firstId)
        // Fetch workers for the first area directly — don't rely on the
        // selectedArea state update to trigger a second useEffect.
        const { data: wData } = await hkAPI.getWorkers(firstId || undefined)
        setWorkers(Array.isArray(wData) ? wData : wData?.results || [])
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to load HK areas.')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle manual area changes from the dropdown.
  const handleAreaChange = (e) => {
    const newArea = e.target.value
    setSelectedArea(newArea)
    loadWorkers(newArea)
  }

  return (
    <div>
      <Alert message={error} />
      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Workers</div>
          <SelectField
            value={selectedArea}
            onChange={handleAreaChange}
            style={{ width: 220 }}
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
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
            headers={['Name', 'Phone', 'Punching No.', 'Type', 'Area', 'Supervisor', 'Reliever']}
            rows={workers.map((w) => [
              w.name,
              w.phone || '-',
              w.punching_no || '-',
              <span key={`t-${w.id}`} style={{ textTransform: 'capitalize' }}>
                {w.worker_type}
              </span>,
              w.area_name || '-',
              w.supervisor_name || '-',
              w.is_reliever ? (
                <span
                  key={`r-${w.id}`}
                  style={{
                    display: 'inline-block',
                    background: '#fff7ed',
                    color: '#c2410c',
                    padding: '3px 9px',
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Reliever
                </span>
              ) : (
                '-'
              ),
            ])}
            emptyMsg="No workers found for the selected area."
          />
        )}
      </Card>
    </div>
  )
}
