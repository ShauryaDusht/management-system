import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { usersAPI } from '../../api/users'
import { exportCsv, getAreaGroup, todayISO } from '../../shared/utils'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import {
  Alert,
  Btn,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SelectField,
  Spinner,
  ExportDropdown,
} from '../../components/ui'
import WorkerReportModal from './WorkerReportModal'
import ConfirmModal from '../../shared/components/ConfirmModal'

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  phone: '',
  pay_code: '',
  area: '',
  supervisor: '',
  worker_type: 'general',
  shift: 'day',
  is_reliever: false,
  is_active: true,
}

const WORKER_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'room', label: 'Room' },
  { value: 'floor', label: 'Floor' },
  { value: 'washroom', label: 'Washroom' },
  { value: 'road', label: 'Road' },
  { value: 'swm', label: 'SWM' },
  { value: 'horticulture', label: 'Horticulture' },
]

const SHIFT_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
]

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { first_name: '', last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

function fullName(u) {
  const n = `${u.first_name || ''} ${u.last_name || ''}`.trim()
  return n || u.username || '-'
}

function safeFilePart(value, fallback = 'all') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

export default function WorkersTab({ readOnly = false, hostelOnly = false }) {
  const [areas, setAreas] = useState([])
  const [workers, setWorkers] = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [selectedArea, setSelectedArea] = useState('')
  const [areaClassFilter, setAreaClassFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [modal, setModal] = useState(null) // null | { mode: 'create' | 'edit', worker? }
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [reportWorker, setReportWorker] = useState(null)

  const extractBlockNo = (name) => {
    const m = String(name || '').match(/Academic Block\s+(\d+)/i)
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY
  }

  const { run: runAction, saving } = useAsyncAction()
  const { loading, error, reload } = useAsyncLoad(async () => {
    const [areaRes, workerRes, supRes, ctRes] = await Promise.all([
      hkAPI.getAreas(),
      hkAPI.getWorkers(),
      usersAPI.getByRole('supervisor').catch(() => ({ data: [] })),
      usersAPI.getByRole('caretaker').catch(() => ({ data: [] })),
    ])

    const areaList = Array.isArray(areaRes.data) ? areaRes.data : areaRes.data?.results || []
    const workerList = Array.isArray(workerRes.data) ? workerRes.data : workerRes.data?.results || []
    const supList = Array.isArray(supRes.data) ? supRes.data : supRes.data?.results || []
    const ctList = Array.isArray(ctRes.data) ? ctRes.data : ctRes.data?.results || []

    const byId = new Map()
    ;[...supList, ...ctList].forEach((u) => {
      if (!byId.has(u.id)) byId.set(u.id, u)
    })

    setAreas(areaList)
    setWorkers(workerList)
    setSupervisors(Array.from(byId.values()))
    return null
  }, [], 'Failed to load workers.')

  const areaById = useMemo(() => {
    const map = new Map()
    areas.forEach((a) => map.set(a.id, a))
    return map
  }, [areas])

  const filteredAreaOptions = useMemo(() => {
    const list = areaClassFilter === 'all'
      ? areas
      : areas.filter((a) => getAreaGroup(a.name, a.area_type) === areaClassFilter)

    return [...list].sort((a, b) => {
      const ga = getAreaGroup(a.name, a.area_type)
      const gb = getAreaGroup(b.name, b.area_type)
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
    if (areaObj && areaClassFilter !== 'all' && getAreaGroup(areaObj.name, areaObj.area_type) !== areaClassFilter) {
      setSelectedArea('')
    }
  }, [areaById, areaClassFilter, selectedArea])

  const visibleWorkers = useMemo(() => {
    let list = workers
    if (areaClassFilter !== 'all') {
      list = list.filter((w) => {
        const areaObj = areaById.get(w.area)
        return getAreaGroup(areaObj?.name, areaObj?.area_type) === areaClassFilter
      })
    }
    if (selectedArea) {
      list = list.filter((w) => String(w.area) === String(selectedArea))
    }
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter((w) =>
        [w.name, w.pay_code, w.area_name, w.supervisor_name].some((value) =>
          String(value || '').toLowerCase().includes(query)
        )
      )
    }
    return [...list].sort((a, b) => {
      const areaA = a.area_name || ''
      const areaB = b.area_name || ''
      const byArea = areaA.localeCompare(areaB)
      if (byArea !== 0) return byArea
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [areaById, areaClassFilter, search, selectedArea, workers])

  const csvRows = useMemo(
    () =>
      visibleWorkers.map((worker) => ({
        Area: worker.area_name || '',
        'Worker Name': worker.name || '',
        Type: String(worker.worker_type || '').replace(/_/g, ' '),
        Shift: worker.shift || '',
        Supervisor: worker.supervisor_name || '',
        Phone: worker.phone || '',
        'Pay Code': worker.pay_code || '',
        Reliever: worker.is_reliever ? 'Yes' : 'No',
        Status: worker.is_active === false ? 'Inactive' : 'Active',
      })),
    [visibleWorkers]
  )

  const downloadCsv = () => {
    const selectedAreaName = selectedArea ? areaById.get(Number(selectedArea))?.name : ''
    const scope = selectedAreaName || `${areaClassFilter === 'all' ? 'all_areas' : areaClassFilter}_areas`
    exportCsv(csvRows, `housekeeping_workers_${safeFilePart(scope)}_${todayISO()}.csv`)
  }

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      area: selectedArea || '',
    })
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (worker) => {
    const split = splitName(worker.name)
    setForm({
      first_name: split.first_name,
      last_name: split.last_name,
      phone: worker.phone || '',
      pay_code: worker.pay_code || '',
      area: worker.area ? String(worker.area) : '',
      supervisor: worker.supervisor ? String(worker.supervisor) : '',
      worker_type: worker.worker_type || 'general',
      shift: worker.shift || 'day',
      is_reliever: Boolean(worker.is_reliever),
      is_active: worker.is_active !== false,
    })
    setFormError('')
    setModal({ mode: 'edit', worker })
  }

  const buildPayload = () => {
    const first = String(form.first_name || '').trim()
    const last = String(form.last_name || '').trim()
    const name = `${first} ${last}`.trim()
    if (!name) return { error: 'First name is required.' }
    if (!form.area) return { error: 'Area is required.' }

    const isReliever = Boolean(form.is_reliever)
    return {
      payload: {
        name,
        phone: String(form.phone || '').trim(),
        pay_code: String(form.pay_code || '').trim(),
        area: Number(form.area),
        supervisor: form.supervisor ? Number(form.supervisor) : null,
        worker_type: isReliever ? 'reliever' : form.worker_type,
        shift: form.shift || 'day',
        is_reliever: isReliever,
        is_active: Boolean(form.is_active),
      },
    }
  }

  const onSave = async () => {
    const { payload, error: payloadError } = buildPayload()
    if (payloadError) {
      setFormError(payloadError)
      return
    }

    await runAction(async () => {
      setFormError('')
      try {
        if (modal.mode === 'create') {
          await hkAPI.createWorker(payload)
        } else {
          await hkAPI.updateWorker(modal.worker.id, payload)
        }
        setModal(null)
        await reload()
      } catch (e) {
        setFormError(
          e.response?.data?.detail || JSON.stringify(e.response?.data || {}) || 'Failed to save worker.'
        )
      }
    })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await runAction(async () => {
      setFormError('')
      try {
        await hkAPI.deleteWorker(deleteTarget.id)
        setDeleteTarget(null)
        setModal(null)
        await reload()
      } catch (e) {
        setFormError(e.response?.data?.detail || 'Failed to delete worker.')
      }
    })
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
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Workers</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Input
              placeholder="Search name, pay code, area, supervisor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
            />
            {!hostelOnly && (
              <>
                <Btn size="sm" variant={areaClassFilter === 'hostels' ? 'primary' : 'secondary'} onClick={() => setAreaClassFilter('hostels')}>Hostels</Btn>
                <Btn size="sm" variant={areaClassFilter === 'academic' ? 'primary' : 'secondary'} onClick={() => setAreaClassFilter('academic')}>Academic Blocks</Btn>
                <Btn size="sm" variant={areaClassFilter === 'others' ? 'primary' : 'secondary'} onClick={() => setAreaClassFilter('others')}>Others</Btn>
                <Btn size="sm" variant={areaClassFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setAreaClassFilter('all')}>All</Btn>
              </>
            )}
            <SelectField value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} style={{ width: 220 }}>
              <option value="">{hostelOnly ? 'All hostel areas' : 'All filtered areas'}</option>
              {filteredAreaOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </SelectField>
            <ExportDropdown
              size="sm"
              filename={`housekeeping_workers_${safeFilePart(selectedArea ? areaById.get(Number(selectedArea))?.name : `${areaClassFilter === 'all' ? 'all_areas' : areaClassFilter}_areas`)}_${todayISO()}`}
              title="Housekeeping Workers Directory"
              subtitle={`Filter: ${selectedArea ? areaById.get(Number(selectedArea))?.name : areaClassFilter} | Total: ${csvRows.length}`}
              headers={['Area', 'Worker Name', 'Type', 'Shift', 'Supervisor', 'Phone', 'Pay Code', 'Reliever', 'Status']}
              rows={csvRows.map((w) => [
                w['Area'],
                w['Worker Name'],
                w['Type'],
                w['Shift'],
                w['Supervisor'],
                w['Phone'],
                w['Pay Code'],
                w['Reliever'],
                w['Status'],
              ])}
              disabled={loading || csvRows.length === 0}
            />
            {!readOnly && <Btn size="sm" onClick={openCreate}>+ Add Worker</Btn>}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={[
              'Area',
              'Worker Name',
              'Type',
              'Shift',
              'Supervisor',
              'Phone',
              'Pay Code',
              'Reliever',
              ...(readOnly ? [] : ['Edit']),
              'Report',
            ]}
            rows={visibleWorkers.map((w) => [
              w.area_name || '-',
              w.name,
              <span key={`t-${w.id}`} style={{ textTransform: 'capitalize' }}>{String(w.worker_type || '').replace(/_/g, ' ')}</span>,
              <span key={`sh-${w.id}`} style={{ textTransform: 'capitalize' }}>{w.shift || '-'}</span>,
              w.supervisor_name || '-',
              w.phone || '-',
              w.pay_code || '-',
              w.is_reliever ? <span key={`r-${w.id}`} style={{ display: 'inline-block', background: '#fff7ed', color: '#c2410c', padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Reliever</span> : '-',
              ...(readOnly ? [] : [
                <Btn key={`a-${w.id}`} size="sm" variant="ghost" onClick={() => openEdit(w)}>Edit</Btn>,
              ]),
              <Btn key={`report-${w.id}`} size="sm" variant="secondary" onClick={() => setReportWorker(w)}>Report</Btn>,
            ])}
            emptyMsg="No workers found for selected segment/filter."
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add Worker' : `Edit Worker - ${modal?.worker?.name || ''}`}
        width={700}
        footer={
          <>
            {modal?.mode === 'edit' && (
              <Btn variant="danger" onClick={() => setDeleteTarget(modal.worker)} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete Worker
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={onSave} disabled={saving}>{saving ? 'Saving...' : modal?.mode === 'create' ? 'Add Worker' : 'Save Changes'}</Btn>
          </>
        }
      >
        <Alert message={formError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First Name" required><Input value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} /></Field>
          <Field label="Last Name"><Input value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></Field>
          <Field label="Pay Code"><Input value={form.pay_code} onChange={(e) => setForm((p) => ({ ...p, pay_code: e.target.value }))} /></Field>
          <Field label="Area / Section" required>
            <SelectField value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}>
              <option value="">Select area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Supervisor / Caretaker">
            <SelectField value={form.supervisor} onChange={(e) => setForm((p) => ({ ...p, supervisor: e.target.value }))}>
              <option value="">Not assigned</option>
              {supervisors.map((u) => (
                <option key={u.id} value={u.id}>{fullName(u)} ({u.username})</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Shift">
            <SelectField value={form.shift} onChange={(e) => setForm((p) => ({ ...p, shift: e.target.value }))}>
              {SHIFT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Permanent / Reliever">
            <SelectField
              value={form.is_reliever ? 'reliever' : 'permanent'}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  is_reliever: e.target.value === 'reliever',
                  worker_type: e.target.value === 'reliever' ? 'reliever' : (p.worker_type === 'reliever' ? 'general' : p.worker_type),
                }))
              }
            >
              <option value="permanent">Permanent</option>
              <option value="reliever">Reliever</option>
            </SelectField>
          </Field>
          <Field label="Worker Type">
            <SelectField
              value={form.worker_type}
              onChange={(e) => setForm((p) => ({ ...p, worker_type: e.target.value }))}
              disabled={form.is_reliever}
              style={form.is_reliever ? { background: '#f3f4f6' } : {}}
            >
              {WORKER_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </SelectField>
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Worker"
        message={`Delete worker ${deleteTarget?.name || ''}? This will remove the worker from the live database.`}
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={saving}
        cancelDisabled={saving}
      />

      <WorkerReportModal
        open={!!reportWorker}
        worker={reportWorker}
        onClose={() => setReportWorker(null)}
      />
    </div>
  )
}
