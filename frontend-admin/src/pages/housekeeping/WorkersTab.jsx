import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, SelectField, Spinner } from '../../components/ui'

export default function WorkersTab() {
  const [areas, setAreas] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedArea, setSelectedArea] = useState('')
  const [areaClassFilter, setAreaClassFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const areaGroup = (areaName, areaType) => {
    const n = String(areaName || '').trim()
    if (/^Academic Block\s+([1-9]|1[0-3])$/i.test(n)) return 'academic'
    if (['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(n)) return 'academic'
    if (['hostel common area', 'common area'].includes(n.toLowerCase())) return 'hostels'
    if (areaType === 'hostel') return 'hostels'
    return 'others'
  }

  const extractBlockNo = (name) => {
    const m = String(name || '').match(/Academic Block\s+(\d+)/i)
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [{ data: areaData }, { data: workerData }] = await Promise.all([
          hkAPI.getAreas(),
          hkAPI.getWorkers(),
        ])
        const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
        const workerList = Array.isArray(workerData) ? workerData : workerData?.results || []
        setAreas(areaList)
        setWorkers(workerList)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to load workers.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const areaById = useMemo(() => {
    const map = new Map()
    areas.forEach((a) => map.set(a.id, a))
    return map
  }, [areas])

  const filteredAreaOptions = useMemo(() => {
    const list = areaClassFilter === 'all'
      ? areas
      : areas.filter((a) => areaGroup(a.name, a.area_type) === areaClassFilter)

    return [...list].sort((a, b) => {
      const ga = areaGroup(a.name, a.area_type)
      const gb = areaGroup(b.name, b.area_type)
      const order = { hostels: 0, academic: 1, others: 2 }
      if (order[ga] !== order[gb]) return order[ga] - order[gb]
      if (ga === 'academic') {
        const an = extractBlockNo(a.name)
        const bn = extractBlockNo(b.name)
        if (an !== bn) return an - bn
      }
      return a.name.localeCompare(b.name)
    })
  }, [areas, areaClassFilter])

  useEffect(() => {
    if (!selectedArea) return
    const areaObj = areaById.get(Number(selectedArea))
    if (areaObj && areaClassFilter !== 'all' && areaGroup(areaObj.name, areaObj.area_type) !== areaClassFilter) {
      setSelectedArea('')
    }
  }, [areaById, areaClassFilter, selectedArea])

  const visibleWorkers = useMemo(() => {
    let list = workers
    if (areaClassFilter !== 'all') {
      list = list.filter((w) => {
        const areaObj = areaById.get(w.area)
        return areaGroup(areaObj?.name, areaObj?.area_type) === areaClassFilter
      })
    }
    if (selectedArea) {
      list = list.filter((w) => String(w.area) === String(selectedArea))
    }
    return [...list].sort((a, b) => {
      const areaA = a.area_name || ''
      const areaB = b.area_name || ''
      const byArea = areaA.localeCompare(areaB)
      if (byArea !== 0) return byArea
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [areaById, areaClassFilter, selectedArea, workers])

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
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Workers</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn
              size="sm"
              variant={areaClassFilter === 'hostels' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('hostels')}
            >
              Hostels
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'academic' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('academic')}
            >
              Academic Blocks
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'others' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('others')}
            >
              Others
            </Btn>
            <Btn
              size="sm"
              variant={areaClassFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setAreaClassFilter('all')}
            >
              All
            </Btn>
            <SelectField
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              style={{ width: 220 }}
            >
              <option value="">All filtered areas</option>
              {filteredAreaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Area', 'Worker Name', 'Type', 'Shift', 'Supervisor', 'Phone', 'Punching No.', 'Reliever']}
            rows={visibleWorkers.map((w) => [
              w.area_name || '-',
              w.name,
              <span key={`t-${w.id}`} style={{ textTransform: 'capitalize' }}>
                {String(w.worker_type || '').replace(/_/g, ' ')}
              </span>,
              <span key={`sh-${w.id}`} style={{ textTransform: 'capitalize' }}>
                {w.shift || '-'}
              </span>,
              w.supervisor_name || '-',
              w.phone || '-',
              w.punching_no || '-',
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
            emptyMsg="No workers found for selected segment/filter."
          />
        )}
      </Card>
    </div>
  )
}
