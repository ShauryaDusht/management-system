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

  const areaWorkerMap = useMemo(() => {
    const map = {}
    asList(workers).forEach((w) => {
      if (w.is_active === false) return
      asList(w.assigned_areas).forEach((a) => {
        if (!map[a.id]) map[a.id] = []
        map[a.id].push(w.name)
      })
    })
    return map
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

  const [areaSearch, setAreaSearch] = useState('')
  const [modalSupervisorFilter, setModalSupervisorFilter] = useState('all')
  const [multiAreaMode, setMultiAreaMode] = useState(false)

  const supervisorOptions = useMemo(() => {
    const list = new Set()
    areas.forEach((a) => {
      if (a.supervisor_name) list.add(a.supervisor_name)
    })
    return Array.from(list).sort()
  }, [areas])

  const openEdit = (worker) => {
    const workerAreaIds = asList(worker.assigned_areas).map((area) => Number(area.id))
    setForm({
      name: worker.name || '',
      phone: worker.phone || '',
      pay_code: worker.pay_code || '',
      area_ids: workerAreaIds,
      photo: null,
      is_active: worker.is_active !== false,
    })
    setFormError('')
    setAreaSearch('')
    setModalSupervisorFilter('all')
    setMultiAreaMode(workerAreaIds.length > 1)
    setModal({ worker })
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setAreaSearch('')
    setModalSupervisorFilter('all')
    setMultiAreaMode(false)
    setModal({ mode: 'create' })
  }

  const selectArea = (areaId) => {
    const id = Number(areaId)
    setForm((prev) => {
      if (multiAreaMode) {
        const current = new Set(asList(prev.area_ids).map(Number))
        if (current.has(id)) current.delete(id)
        else current.add(id)
        return { ...prev, area_ids: Array.from(current) }
      }
      const current = asList(prev.area_ids).map(Number)
      if (current.includes(id)) {
        return { ...prev, area_ids: [] }
      }
      return { ...prev, area_ids: [id] }
    })
  }

  const buildWorkerPayload = () => {
    if (form.photo) {
      const payload = new FormData()
      payload.append('name', String(form.name || '').trim())
      payload.append('phone', String(form.phone || '').trim())
      payload.append('pay_code', String(form.pay_code || '').trim())
      payload.append('is_active', form.is_active ? 'true' : 'false')
      asList(form.area_ids).forEach((id) => payload.append('area_ids', String(id)))
      payload.append('photo', form.photo)
      return payload
    }
    return {
      name: String(form.name || '').trim(),
      phone: String(form.phone || '').trim(),
      pay_code: String(form.pay_code || '').trim(),
      is_active: Boolean(form.is_active),
      area_ids: asList(form.area_ids).map(Number),
    }
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

  const filteredModalAreas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase()
    return areas.filter((a) => {
      if (modalSupervisorFilter !== 'all' && a.supervisor_name !== modalSupervisorFilter) return false
      if (!q) return true
      return (
        String(a.area_number || '').includes(q) ||
        (a.name || '').toLowerCase().includes(q) ||
        (a.zone_name || '').toLowerCase().includes(q) ||
        (a.supervisor_name || '').toLowerCase().includes(q)
      )
    })
  }, [areas, areaSearch, modalSupervisorFilter])

  const selectedAreaId = form.area_ids?.[0]
  const targetArea = areas.find((a) => Number(a.id) === Number(selectedAreaId))
  const otherWorkersInSelectedArea = selectedAreaId
    ? (areaWorkerMap[selectedAreaId] || []).filter((name) => name !== modal?.worker?.name)
    : []
  const currentWorkerAreaName = modal?.worker?.assigned_areas?.[0]?.name
  const isSwapping = Boolean(
    modal?.mode !== 'create' &&
    modal?.worker &&
    !multiAreaMode &&
    selectedAreaId &&
    otherWorkersInSelectedArea.length > 0 &&
    selectedAreaId !== modal?.worker?.assigned_areas?.[0]?.id
  )

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
            <Btn onClick={saveWorker} disabled={saving}>
              {saving ? 'Saving...' : isSwapping ? '🔄 Save & Swap Area' : modal?.mode === 'create' ? 'Add Worker' : 'Save Changes'}
            </Btn>
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
        <Field label={multiAreaMode ? "Assigned Areas (Multi-select)" : "Assigned Area"}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {modal?.worker ? (
                <>Current: <strong style={{ color: 'var(--text-1)' }}>{currentWorkerAreaName || 'None'}</strong></>
              ) : 'Select primary area for worker'}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={multiAreaMode}
                onChange={(e) => setMultiAreaMode(e.target.checked)}
              />
              Multi-area mode
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
            <SelectField
              value={modalSupervisorFilter}
              onChange={(e) => setModalSupervisorFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }}
            >
              <option value="all">Filter by Supervisor (All)</option>
              {supervisorOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </SelectField>
            <Input
              placeholder="🔍 Search area name, #no..."
              value={areaSearch}
              onChange={(e) => setAreaSearch(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 190, overflow: 'auto', padding: 6 }}>
            {!multiAreaMode && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 4px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="radio"
                  name="worker_assigned_area"
                  checked={!form.area_ids || form.area_ids.length === 0}
                  onChange={() => setForm((prev) => ({ ...prev, area_ids: [] }))}
                />
                <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>None (Unassigned)</span>
              </label>
            )}
            {filteredModalAreas.map((area) => {
              const otherAssigned = (areaWorkerMap[area.id] || []).filter((name) => name !== modal?.worker?.name)
              const isCurrentWorkerArea = modal?.worker?.assigned_areas?.some((a) => Number(a.id) === Number(area.id))
              const isChecked = asList(form.area_ids).map(Number).includes(Number(area.id))
              return (
                <label
                  key={area.id}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center', padding: '5px 4px', fontSize: 12, cursor: 'pointer',
                    background: isChecked ? 'rgba(34, 197, 94, 0.08)' : undefined,
                    borderRadius: 4,
                  }}
                >
                  <input
                    type={multiAreaMode ? "checkbox" : "radio"}
                    name="worker_assigned_area"
                    checked={isChecked}
                    onChange={() => selectArea(area.id)}
                  />
                  <span style={{ flex: 1, fontSize: 12 }}>
                    <strong>#{area.area_number}:</strong> {area.name}
                    <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 6 }}>
                      ({area.zone_name || '-'} • {area.supervisor_name ? `Supervisor: ${area.supervisor_name}` : 'No supervisor'})
                    </span>
                    {isCurrentWorkerArea && (
                      <span style={{ color: '#16a34a', fontSize: 11, marginLeft: 6, fontWeight: 700 }}>(Current)</span>
                    )}
                    {otherAssigned.length > 0 && !isCurrentWorkerArea && (
                      <span style={{ color: '#0284c7', fontSize: 11, marginLeft: 6, fontWeight: 600 }}>
                        (Assigned: {otherAssigned.join(', ')})
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>

          {isSwapping && (
            <div style={{
              marginTop: 8, padding: '9px 12px', borderRadius: 8,
              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
              fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>🔄</span>
              <div>
                <strong>Auto-Swap Preview:</strong> <u>{targetArea?.name}</u> is currently assigned to <strong>{otherWorkersInSelectedArea.join(', ')}</strong>.
                <div style={{ marginTop: 4, color: '#1e3a8a', lineHeight: 1.4 }}>
                  Saving will automatically swap areas between both workers:
                  <br />
                  • <strong>{form.name || modal?.worker?.name}</strong> ➔ <u>{targetArea?.name}</u>
                  <br />
                  • <strong>{otherWorkersInSelectedArea.join(', ')}</strong> ➔ <u>{currentWorkerAreaName || 'Unassigned'}</u>
                </div>
              </div>
            </div>
          )}

          {!isSwapping && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              💡 Selecting an area currently assigned to another worker will automatically swap their areas.
            </div>
          )}
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
