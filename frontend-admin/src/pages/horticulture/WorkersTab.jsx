import { useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, ExportDropdown, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import { asList, getErrorMessage, triggerDownload } from '../../shared/utils'
import { exportHorticultureReport } from './exportHelper'
import WorkerReportModal from './WorkerReportModal'

const EMPTY_FORM = {
  name: '',
  phone: '',
  pay_code: '',
  area_ids: [],
  photo: null,
  is_active: true,
}

function areaNames(worker) {
  return asList(worker.area_names).join(', ') || '-'
}

function zoneNames(worker) {
  return asList(worker.zone_names).join(', ') || '-'
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`
  return str
}

export default function WorkersTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [workers, setWorkers] = useState([])
  const [areas, setAreas] = useState([])
  const [zoneFilter, setZoneFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [reportWorker, setReportWorker] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await horticultureAPI.getWorkers()
      const areaRes = await horticultureAPI.getAreas()
      setWorkers(asList(data?.workers))
      setAreas(asList(areaRes.data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture workers.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const zones = useMemo(() => {
    const names = new Set()
    workers.forEach((worker) => asList(worker.zone_names).forEach((name) => names.add(name)))
    return Array.from(names).sort()
  }, [workers])

  const visibleWorkers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return workers.filter((worker) => {
      if (zoneFilter !== 'all' && !asList(worker.zone_names).includes(zoneFilter)) return false
      if (!query) return true
      return [
        worker.name,
        worker.phone,
        worker.pay_code,
        worker.supervisor_name,
        areaNames(worker),
        zoneNames(worker),
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })
  }, [search, workers, zoneFilter])

  const openEdit = (worker) => {
    setForm({
      name: worker.name || '',
      phone: worker.phone || '',
      pay_code: worker.pay_code || '',
      area_ids: asList(worker.assigned_areas).map((area) => Number(area.id)),
      photo: null,
      is_active: worker.is_active !== false,
    })
    setFormError('')
    setModal({ worker })
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setModal({ mode: 'create' })
  }

  const toggleArea = (areaId) => {
    const id = Number(areaId)
    setForm((prev) => {
      const current = new Set(asList(prev.area_ids).map(Number))
      if (current.has(id)) current.delete(id)
      else current.add(id)
      return { ...prev, area_ids: Array.from(current) }
    })
  }

  const buildWorkerPayload = () => {
    const payload = new FormData()
    payload.append('name', String(form.name || '').trim())
    payload.append('phone', String(form.phone || '').trim())
    payload.append('pay_code', String(form.pay_code || '').trim())
    payload.append('is_active', form.is_active ? 'true' : 'false')
    asList(form.area_ids).forEach((id) => payload.append('area_ids', String(id)))
    if (form.photo) payload.append('photo', form.photo)
    return payload
  }

  const saveWorker = async () => {
    setSaving(true)
    setFormError('')
    try {
      const payload = buildWorkerPayload()
      if (modal?.mode === 'create') await horticultureAPI.createWorker(payload)
      else await horticultureAPI.updateWorker(modal.worker.id, payload)
      setModal(null)
      await load()
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save worker.'))
    } finally {
      setSaving(false)
    }
  }

  const handleExportWorkers = async (format) => {
    const exportData = {
      filename: 'horticulture_workers',
      title: 'Horticulture Workers Directory',
      subtitle: 'Assigned areas, supervisors, contact information, and active status',
      metadata: [
        { label: 'Zone Filter', value: zoneFilter === 'all' ? 'All zones' : zoneFilter },
        ...(search.trim() ? [{ label: 'Search Query', value: search.trim() }] : []),
      ],
      stats: [
        { label: 'Total Listed', value: visibleWorkers.length },
        { label: 'Active', value: visibleWorkers.filter((w) => w.is_active).length },
        { label: 'Inactive', value: visibleWorkers.filter((w) => !w.is_active).length },
      ],
      headers: ['Worker Name', 'Areas', 'Zones', 'Supervisor', 'Phone', 'Pay Code', 'Status'],
      rows: visibleWorkers.map((worker) => [
        worker.name || '',
        areaNames(worker),
        zoneNames(worker),
        worker.supervisor_name || '',
        worker.phone || '',
        worker.pay_code || '',
        worker.is_active ? 'Active' : 'Inactive',
      ]),
    }
    await exportHorticultureReport(format, exportData)
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
              placeholder="Search name, phone, pay code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 260 }}
            />
            <SelectField value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} style={{ width: 190 }}>
              <option value="all">All zones</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </SelectField>
            <ExportDropdown
              label="Download Workers"
              onExport={handleExportWorkers}
              disabled={loading || !visibleWorkers.length}
            />
            <Btn size="sm" onClick={openCreate}>+ Add Worker</Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Worker Name', 'Areas', 'Zone', 'Supervisor', 'Phone', 'Pay Code', 'Status', 'Edit', 'Report']}
            rows={visibleWorkers.map((worker) => [
              worker.name,
              areaNames(worker),
              zoneNames(worker),
              worker.supervisor_name || '-',
              worker.phone || '-',
              worker.pay_code || '-',
              worker.is_active ? 'Active' : 'Inactive',
              <Btn key={`edit-${worker.id}`} size="sm" variant="ghost" onClick={() => openEdit(worker)}>Edit</Btn>,
              <Btn key={`report-${worker.id}`} size="sm" variant="secondary" onClick={() => setReportWorker(worker)}>Report</Btn>,
            ])}
            emptyMsg="No horticulture workers found for selected filters."
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add Worker' : `Edit Worker - ${modal?.worker?.name || ''}`}
        width={620}
        footer={(
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={saveWorker} disabled={saving}>{saving ? 'Saving...' : modal?.mode === 'create' ? 'Add Worker' : 'Save Changes'}</Btn>
          </>
        )}
      >
        <Alert message={formError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Worker Name" required>
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
          </Field>
          <Field label="Pay Code">
            <Input value={form.pay_code} onChange={(event) => setForm((prev) => ({ ...prev, pay_code: event.target.value }))} />
          </Field>
          <Field label="Status">
            <SelectField value={form.is_active ? 'active' : 'inactive'} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </Field>
          <Field label="Photo">
            <Input type="file" accept="image/*" onChange={(event) => setForm((prev) => ({ ...prev, photo: event.target.files?.[0] || null }))} />
          </Field>
        </div>
        <Field label="Assigned Areas">
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 220, overflow: 'auto', padding: 8 }}>
            {areas.map((area) => (
              <label key={area.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 4px', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={asList(form.area_ids).map(Number).includes(Number(area.id))}
                  onChange={() => toggleArea(area.id)}
                />
                <span>{area.name} ({area.zone_name || '-'})</span>
              </label>
            ))}
          </div>
        </Field>
      </Modal>

      <WorkerReportModal
        open={!!reportWorker}
        worker={reportWorker}
        onClose={() => setReportWorker(null)}
      />
    </div>
  )
}
