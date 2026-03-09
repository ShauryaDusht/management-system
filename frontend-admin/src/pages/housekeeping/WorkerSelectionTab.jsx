import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../context/AuthContext'
import { hkAPI } from '../../api/housekeeping'
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  Field,
  Input,
  SelectField,
  Spinner,
} from '../../components/ui'

const EMPTY_FORM = {
  target_area_group: '',
  worker_group: '',
  worker_area: '',
  target_area: '',
  note: '',
  selected_workers: [],
}

function areaGroup(areaName, areaType) {
  const n = String(areaName || '').trim()
  if (/^Academic Block\s+([1-9]|1[0-3])$/i.test(n)) return 'academic'
  if (['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(n)) return 'academic'
  if (['hostel common area', 'common area', 'hostels reliever'].includes(n.toLowerCase())) return 'hostels'
  if (areaType === 'hostel') return 'hostels'
  return 'others'
}

function extractBlockNo(name) {
  const m = String(name || '').match(/Academic Block\s+(\d+)/i)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN')
}

export default function WorkerSelectionTab() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [areas, setAreas] = useState([])
  const [workers, setWorkers] = useState([])
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [decisionLoadingId, setDecisionLoadingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [areaRes, workerRes, reqRes] = await Promise.all([
        hkAPI.getAreas(),
        hkAPI.getWorkers(),
        hkAPI.getWorkerSelectionRequests(statusFilter === 'all' ? undefined : statusFilter),
      ])
      setAreas(normalizeList(areaRes.data))
      setWorkers(normalizeList(workerRes.data))
      setRequests(normalizeList(reqRes.data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load worker selection data.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const sortedAreas = useMemo(() => {
    return [...areas].sort((a, b) => {
      const order = { hostels: 0, academic: 1, others: 2 }
      const ga = areaGroup(a.name, a.area_type)
      const gb = areaGroup(b.name, b.area_type)
      if (order[ga] !== order[gb]) return order[ga] - order[gb]
      if (ga === 'academic') {
        const an = extractBlockNo(a.name)
        const bn = extractBlockNo(b.name)
        if (an !== bn) return an - bn
      }
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [areas])

  const areaMap = useMemo(() => {
    const map = new Map()
    areas.forEach((a) => map.set(Number(a.id), a))
    return map
  }, [areas])

  const targetAreaOptions = useMemo(() => {
    if (!form.target_area_group || form.target_area_group === 'all') return sortedAreas
    return sortedAreas.filter((a) => areaGroup(a.name, a.area_type) === form.target_area_group)
  }, [form.target_area_group, sortedAreas])

  const workerAreaOptions = useMemo(() => {
    if (!form.worker_group || form.worker_group === 'all') return sortedAreas
    return sortedAreas.filter((a) => areaGroup(a.name, a.area_type) === form.worker_group)
  }, [form.worker_group, sortedAreas])

  const workerOptions = useMemo(() => {
    if (!form.worker_group) return []
    return workers
      .filter((w) => {
        const a = areaMap.get(Number(w.area))
        const g = areaGroup(a?.name || w.area_name, a?.area_type)
        if (form.worker_group !== 'all' && g !== form.worker_group) return false
        if (form.worker_area && Number(w.area) !== Number(form.worker_area)) return false
        return true
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }, [areaMap, form.worker_area, form.worker_group, workers])

  const selectedWorkerSet = useMemo(
    () => new Set((form.selected_workers || []).map((v) => Number(v))),
    [form.selected_workers]
  )

  const toggleWorker = (workerId) => {
    const wid = Number(workerId)
    setForm((p) => {
      const cur = new Set((p.selected_workers || []).map((v) => Number(v)))
      if (cur.has(wid)) cur.delete(wid)
      else cur.add(wid)
      return { ...p, selected_workers: Array.from(cur) }
    })
  }

  const selectAllVisibleWorkers = () => {
    setForm((p) => ({ ...p, selected_workers: workerOptions.map((w) => Number(w.id)) }))
  }

  const clearSelectedWorkers = () => {
    setForm((p) => ({ ...p, selected_workers: [] }))
  }

  const submitRequest = async () => {
    if (!form.target_area_group) {
      setError('Target area group is required.')
      return
    }
    if (!form.worker_group) {
      setError('Worker group is required.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const payload = {
        selection_type: 'specific',
        section_filter: form.worker_group,
        target_group: form.target_area_group,
        note: String(form.note || '').trim(),
      }
      if (form.target_area) payload.target_area_id = Number(form.target_area)
      if (form.worker_area) payload.source_area_id = Number(form.worker_area)
      if (Array.isArray(form.selected_workers) && form.selected_workers.length) {
        payload.worker_ids = form.selected_workers.map((id) => Number(id))
      }

      await hkAPI.createWorkerSelectionRequest(payload)
      setSuccess('Request created. Staff will select workers from mobile and submit for admin approval.')
      setForm(EMPTY_FORM)
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to submit worker selection request.')
    } finally {
      setSubmitting(false)
    }
  }

  const decideRequest = async (reqId, decision) => {
    setDecisionLoadingId(reqId)
    setError('')
    setSuccess('')
    try {
      const { data } = await hkAPI.decideWorkerSelectionRequest(reqId, { decision })
      const moved = data?.moved_count || 0
      setSuccess(
        decision === 'approved'
          ? `Request approved. ${moved} worker(s) moved to target area.`
          : 'Request rejected.'
      )
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update request decision.')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  const requestRows = useMemo(() => {
    return [...requests].sort((a, b) => {
      const ta = new Date(a.created_at).getTime() || 0
      const tb = new Date(b.created_at).getTime() || 0
      return tb - ta
    })
  }, [requests])

  const statusCounts = useMemo(() => {
    const acc = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
    requests.forEach((r) => {
      if (r.status in acc) acc[r.status] += 1
    })
    return acc
  }, [requests])

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />

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
          <div style={{ fontWeight: 700 }}>Worker Selection</div>
          {isAdmin ? (
            <Btn
              size="sm"
              variant={showForm ? 'secondary' : 'primary'}
              onClick={() => setShowForm((p) => !p)}
            >
              {showForm ? 'Close Form' : 'Worker Selection'}
            </Btn>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
              Admin-only form
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : (showForm && isAdmin) ? (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Target Area Group" required>
                <SelectField
                  value={form.target_area_group}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      target_area_group: e.target.value,
                      target_area: '',
                    }))
                  }
                >
                  <option value="">Select target group</option>
                  <option value="all">All</option>
                  <option value="hostels">Hostels</option>
                  <option value="academic">Academic Blocks</option>
                  <option value="others">Others</option>
                </SelectField>
              </Field>

              <Field label="Target Area (Optional)">
                <SelectField
                  value={form.target_area}
                  onChange={(e) => setForm((p) => ({ ...p, target_area: e.target.value }))}
                >
                  <option value="">All areas in selected group</option>
                  {targetAreaOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
              </Field>

              <Field label="Worker Group" required>
                <SelectField
                  value={form.worker_group}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      worker_group: e.target.value,
                      worker_area: '',
                      selected_workers: [],
                    }))
                  }
                >
                  <option value="">Select worker group</option>
                  <option value="all">All</option>
                  <option value="hostels">Hostels</option>
                  <option value="academic">Academic Blocks</option>
                  <option value="others">Others</option>
                </SelectField>
              </Field>

              <Field label="Worker Area (Optional)">
                <SelectField
                  value={form.worker_area}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      worker_area: e.target.value,
                      selected_workers: [],
                    }))
                  }
                >
                  <option value="">All areas</option>
                  {workerAreaOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Select Workers (optional) {workerOptions.length ? `- ${workerOptions.length} found` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="sm" variant="secondary" onClick={selectAllVisibleWorkers} disabled={!workerOptions.length}>
                    Select All
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={clearSelectedWorkers} disabled={!form.selected_workers.length}>
                    Clear
                  </Btn>
                </div>
              </div>
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  maxHeight: 230,
                  overflow: 'auto',
                  background: 'var(--surface)',
                }}
              >
                {!form.worker_group ? (
                  <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 12 }}>
                    Select worker group to load workers.
                  </div>
                ) : workerOptions.length === 0 ? (
                  <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 12 }}>
                    No workers found for selected filters.
                  </div>
                ) : (
                  workerOptions.map((w) => (
                    <label
                      key={w.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedWorkerSet.has(Number(w.id))}
                        onChange={() => toggleWorker(w.id)}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{w.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {w.area_name || '-'} | {w.worker_type || '-'}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <Field label="Note">
              <Input
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Instruction for staff selection (optional)"
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
              <Btn onClick={submitRequest} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-3)' }}>
            {isAdmin
              ? <>Click <strong>Worker Selection</strong> to create a request. Staff will select workers in mobile dashboard.</>
              : <>Worker selection request creation is available only for Admin.</>}
          </div>
        )}
      </Card>

      <Card noPad style={{ marginTop: 14 }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Worker Selection Requests</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant={statusFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('all')}>
              All ({statusCounts.all})
            </Btn>
            <Btn size="sm" variant={statusFilter === 'pending' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('pending')}>
              Pending ({statusCounts.pending})
            </Btn>
            <Btn size="sm" variant={statusFilter === 'approved' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('approved')}>
              Approved ({statusCounts.approved})
            </Btn>
            <Btn size="sm" variant={statusFilter === 'rejected' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('rejected')}>
              Rejected ({statusCounts.rejected})
            </Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Created', 'Requested By', 'From Area', 'To Area / Group', 'Workers', 'Status', 'Note', 'Actions']}
            rows={requestRows.map((r) => [
              formatDateTime(r.created_at),
              r.requested_by_name || '-',
              r.source_area_name || 'All areas',
              r.target_area_name || (r.target_group ? String(r.target_group).replace('_', ' ') : '-'),
              <div key={`workers-${r.id}`} style={{ fontSize: 12 }}>
                <div><strong>{r.worker_count || 0}</strong> workers</div>
                {Array.isArray(r.workers_preview) && r.workers_preview.length ? (
                  <div style={{ color: 'var(--text-3)' }}>{r.workers_preview.join(', ')}</div>
                ) : null}
              </div>,
              <Badge key={`status-${r.id}`} value={r.status} />,
              r.note || '-',
              r.status === 'pending' && isAdmin ? (
                Number(r.worker_count || 0) === 0 ? (
                  <span key={`wait-${r.id}`} style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>
                    Waiting for staff
                  </span>
                ) : (
                <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
                  <Btn
                    size="sm"
                    variant="success"
                    onClick={() => decideRequest(r.id, 'approved')}
                    disabled={decisionLoadingId === r.id}
                  >
                    Approve
                  </Btn>
                  <Btn
                    size="sm"
                    variant="danger"
                    onClick={() => decideRequest(r.id, 'rejected')}
                    disabled={decisionLoadingId === r.id}
                  >
                    Reject
                  </Btn>
                </div>
                )
              ) : '-',
            ])}
            emptyMsg="No worker selection requests found."
          />
        )}
      </Card>
    </div>
  )
}
