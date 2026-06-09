import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { useAuth } from '../../context/AuthContext'
import { getAreaGroup, getErrorMessage } from '../../shared/utils'
import ConfirmModal from '../../shared/components/ConfirmModal'
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
} from '../../components/ui'

const DAYS = [
  { key: 0, label: 'M', full: 'Mon' },
  { key: 1, label: 'T', full: 'Tue' },
  { key: 2, label: 'W', full: 'Wed' },
  { key: 3, label: 'T', full: 'Thu' },
  { key: 4, label: 'F', full: 'Fri' },
  { key: 5, label: 'S', full: 'Sat' },
  { key: 6, label: 'S', full: 'Sun' },
]

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'saturday_special', label: 'Saturday Special' },
  { value: 'sunday_extra', label: 'Sunday Extra' },
]

const EMPTY_FORM = {
  id: null,
  area: '',
  task_name: '',
  start_time: '08:00',
  end_time: '09:00',
  frequency: 'daily',
  days: [0, 1, 2, 3, 4, 5, 6],
  is_optional_weekend_task: false,
  is_active: true,
}

const AREA_CATEGORY_OPTIONS = [
  { value: 'hostels', label: 'Hostels', area_type: 'hostel' },
  { value: 'academic', label: 'Academic Areas', area_type: 'academic' },
  { value: 'others', label: 'Other Areas', area_type: 'other' },
]

const EMPTY_AREA_FORM = {
  name: '',
  category: 'hostels',
  description: '',
}

function formatTime(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function daysForFrequency(freq) {
  if (freq === 'saturday_special') return [5]
  if (freq === 'sunday_extra') return [6]
  return [0, 1, 2, 3, 4, 5, 6]
}

function frequencyFromDays(days) {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return 'daily'
  if (sorted.length === 1 && sorted[0] === 5) return 'saturday_special'
  if (sorted.length === 1 && sorted[0] === 6) return 'sunday_extra'
  return null
}

function frequencyLabel(freq) {
  const match = FREQUENCY_OPTIONS.find((o) => o.value === freq)
  return match ? match.label : String(freq || '-')
}

function daysLabel(freq) {
  const days = daysForFrequency(freq)
  return days.map((d) => DAYS[d]?.full || '').join(', ')
}

export default function ScheduleTab({ readOnly = false, hostelOnly = false }) {
  const { user } = useAuth()
  const [areas, setAreas] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [areaSearch, setAreaSearch] = useState('')
  const [expandedAreaId, setExpandedAreaId] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [createForms, setCreateForms] = useState([EMPTY_FORM])
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [areaDeleteTarget, setAreaDeleteTarget] = useState(null)
  const [areaModal, setAreaModal] = useState(false)
  const [areaForm, setAreaForm] = useState(EMPTY_AREA_FORM)
  const [areaFormError, setAreaFormError] = useState('')
  const [areaSaving, setAreaSaving] = useState(false)
  const canDeleteAreas = user?.role === 'admin' && !readOnly && !hostelOnly

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [areasRes, templatesRes] = await Promise.all([
        hkAPI.getAreas(),
        hkAPI.listScheduleTemplates(),
      ])
      const areaList = Array.isArray(areasRes.data) ? areasRes.data : areasRes.data?.results || []
      const templateList = Array.isArray(templatesRes.data) ? templatesRes.data : templatesRes.data?.results || []
      setAreas(areaList)
      setTemplates(templateList)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load schedule templates.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const areaById = useMemo(() => {
    const map = new Map()
    areas.forEach((area) => map.set(area.id, area))
    return map
  }, [areas])

  const grouped = useMemo(() => {
    const bucket = new Map()

    areas.forEach((area) => {
      bucket.set(area.id, {
        areaId: area.id,
        areaName: area.name || 'Unknown Area',
        areaType: area.area_type || 'other',
        rows: [],
      })
    })

    templates.forEach((row) => {
      const areaId = row.area
      const area = areaById.get(areaId)
      const entry = bucket.get(areaId) || {
        areaId,
        areaName: area?.name || row.area_name || 'Unknown Area',
        areaType: area?.area_type || 'other',
        rows: [],
      }
      entry.rows.push(row)
      bucket.set(areaId, entry)
    })

    const groups = Array.from(bucket.values())
    groups.forEach((group) => {
      group.rows.sort((a, b) => {
        const aTime = formatTime(a.start_time)
        const bTime = formatTime(b.start_time)
        if (aTime !== bTime) return aTime.localeCompare(bTime)
        return String(a.task_name || '').localeCompare(String(b.task_name || ''))
      })
    })
    return groups.sort((a, b) => a.areaName.localeCompare(b.areaName))
  }, [areaById, areas, templates])

  const filteredGroups = useMemo(() => {
    const query = areaSearch.trim().toLowerCase()
    return grouped.filter((group) => {
      const groupClass = getAreaGroup(group.areaName, group.areaType)
      if (areaFilter !== 'all' && groupClass !== areaFilter) return false
      if (query && !group.areaName.toLowerCase().includes(query)) return false
      return true
    })
  }, [areaFilter, areaSearch, grouped])

  const openCreate = () => {
    const defaultArea = areas[0]?.id ? String(areas[0].id) : ''
    const frequency = 'daily'
    const seed = {
      ...EMPTY_FORM,
      area: defaultArea,
      frequency,
      days: daysForFrequency(frequency),
    }
    setCreateForms([seed])
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openAreaCreate = () => {
    const defaultCategory = areaFilter === 'all' ? 'hostels' : areaFilter
    setAreaForm({ ...EMPTY_AREA_FORM, category: defaultCategory })
    setAreaFormError('')
    setAreaModal(true)
  }

  const openEdit = (row) => {
    const frequency = row.frequency || 'daily'
    setForm({
      id: row.id,
      area: row.area ? String(row.area) : '',
      task_name: row.task_name || '',
      start_time: formatTime(row.start_time),
      end_time: formatTime(row.end_time),
      frequency,
      days: daysForFrequency(frequency),
      is_optional_weekend_task: row.is_optional_weekend_task === true,
      is_active: row.is_active !== false,
    })
    setFormError('')
    setModal({ mode: 'edit', row })
  }

  const handleFrequencyChange = (value) => {
    setForm((p) => ({ ...p, frequency: value, days: daysForFrequency(value) }))
    setFormError('')
  }

  const handleSpecialSelect = (value) => {
    setForm((p) => {
      const wantsSpecial = value === 'yes'
      if (wantsSpecial && p.frequency === 'daily') {
        const nextFreq = 'saturday_special'
        return { ...p, frequency: nextFreq, days: daysForFrequency(nextFreq) }
      }
      if (!wantsSpecial && p.frequency !== 'daily') {
        const nextFreq = 'daily'
        return { ...p, frequency: nextFreq, days: daysForFrequency(nextFreq) }
      }
      return p
    })
    setFormError('')
  }

  const toggleDay = (key) => {
    const nextDays = form.days.includes(key)
      ? form.days.filter((d) => d !== key)
      : [...form.days, key]
    const derived = frequencyFromDays(nextDays)
    if (!derived) {
      setFormError('Only Daily, Saturday-only, or Sunday-only schedules are supported.')
      return
    }
    setFormError('')
    setForm((p) => ({ ...p, days: nextDays, frequency: derived }))
  }

  const updateCreateForm = (index, updater) => {
    setCreateForms((prev) => prev.map((row, i) => (i === index ? updater(row) : row)))
  }

  const updateCreateField = (index, patch) => {
    updateCreateForm(index, (row) => ({ ...row, ...patch }))
  }

  const handleCreateFrequencyChange = (index, value) => {
    updateCreateField(index, { frequency: value, days: daysForFrequency(value) })
    setFormError('')
  }

  const handleCreateSpecialSelect = (index, value) => {
    updateCreateForm(index, (row) => {
      const wantsSpecial = value === 'yes'
      if (wantsSpecial && row.frequency === 'daily') {
        const nextFreq = 'saturday_special'
        return { ...row, frequency: nextFreq, days: daysForFrequency(nextFreq) }
      }
      if (!wantsSpecial && row.frequency !== 'daily') {
        const nextFreq = 'daily'
        return { ...row, frequency: nextFreq, days: daysForFrequency(nextFreq) }
      }
      return row
    })
    setFormError('')
  }

  const toggleCreateDay = (index, key) => {
    updateCreateForm(index, (row) => {
      const nextDays = row.days.includes(key)
        ? row.days.filter((d) => d !== key)
        : [...row.days, key]
      const derived = frequencyFromDays(nextDays)
      if (!derived) {
        setFormError('Only Daily, Saturday-only, or Sunday-only schedules are supported.')
        return row
      }
      return { ...row, days: nextDays, frequency: derived }
    })
  }

  const addCreateRow = () => {
    const last = createForms[createForms.length - 1] || EMPTY_FORM
    setCreateForms((prev) => [
      ...prev,
      {
        ...EMPTY_FORM,
        area: last.area,
        frequency: last.frequency || 'daily',
        days: daysForFrequency(last.frequency || 'daily'),
        start_time: last.start_time || '08:00',
        end_time: last.end_time || '09:00',
      },
    ])
  }

  const removeCreateRow = (index) => {
    if (createForms.length <= 1) return
    setCreateForms((prev) => prev.filter((_, i) => i !== index))
  }

  const saveTemplate = async () => {
    const buildPayload = (row, index) => {
      const taskName = String(row.task_name || '').trim()
      if (!row.area) return { error: `Template ${index + 1}: Area is required.` }
      if (!taskName) return { error: `Template ${index + 1}: Task name is required.` }
      if (!row.start_time || !row.end_time) {
        return { error: `Template ${index + 1}: Start and end time are required.` }
      }
      const derivedFrequency = frequencyFromDays(row.days) || row.frequency
      if (!derivedFrequency) {
        return { error: `Template ${index + 1}: Only Daily, Saturday-only, or Sunday-only schedules are supported.` }
      }
      return {
        payload: {
          area: Number(row.area),
          task_name: taskName,
          start_time: row.start_time,
          end_time: row.end_time,
          frequency: derivedFrequency,
          is_optional_weekend_task: Boolean(row.is_optional_weekend_task),
          is_active: Boolean(row.is_active),
        },
      }
    }

    if (modal?.mode === 'create') {
      const payloads = []
      for (let i = 0; i < createForms.length; i += 1) {
        const built = buildPayload(createForms[i], i)
        if (built.error) {
          setFormError(built.error)
          return
        }
        payloads.push(built.payload)
      }

      setSaving(true)
      setFormError('')
      try {
        for (const payload of payloads) {
          await hkAPI.createScheduleTemplate(payload)
        }
        setModal(null)
        await load()
      } catch (e) {
        setFormError(
          e.response?.data?.detail
            || JSON.stringify(e.response?.data || {})
            || 'Failed to save schedule templates.'
        )
      } finally {
        setSaving(false)
      }
      return
    }

    const built = buildPayload(form, 0)
    if (built.error) {
      setFormError(built.error)
      return
    }

    setSaving(true)
    setFormError('')
    try {
      if (form.id) {
        await hkAPI.updateScheduleTemplate(form.id, built.payload)
      }
      setModal(null)
      await load()
    } catch (e) {
      setFormError(
        e.response?.data?.detail
          || JSON.stringify(e.response?.data || {})
          || 'Failed to save schedule template.'
      )
    } finally {
      setSaving(false)
    }
  }

  const saveArea = async () => {
    const name = String(areaForm.name || '').trim()
    if (!name) {
      setAreaFormError('Area name is required.')
      return
    }
    const category = AREA_CATEGORY_OPTIONS.find((c) => c.value === areaForm.category) || AREA_CATEGORY_OPTIONS[0]
    const payload = {
      name,
      area_type: category.area_type,
      description: String(areaForm.description || '').trim(),
      is_active: true,
    }

    setAreaSaving(true)
    setAreaFormError('')
    try {
      await hkAPI.createArea(payload)
      setAreaModal(false)
      await load()
    } catch (e) {
      setAreaFormError(getErrorMessage(e, 'Failed to add area.'))
    } finally {
      setAreaSaving(false)
    }
  }

  const toggleActive = async (row) => {
    setSaving(true)
    setError('')
    try {
      const nextActive = row.is_active !== false ? false : true
      await hkAPI.updateScheduleTemplate(row.id, { is_active: nextActive })
      await load()
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to update schedule status.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    setFormError('')
    try {
      await hkAPI.deleteScheduleTemplate(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setFormError(getErrorMessage(e, 'Failed to delete schedule template.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmAreaDelete = async () => {
    if (!areaDeleteTarget) return
    setAreaSaving(true)
    setError('')
    try {
      await hkAPI.deleteArea(areaDeleteTarget.areaId)
      setAreaDeleteTarget(null)
      setExpandedAreaId((prev) => (prev === areaDeleteTarget.areaId ? null : prev))
      await load()
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to delete area.'))
      setAreaDeleteTarget(null)
    } finally {
      setAreaSaving(false)
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card noPad style={{ marginBottom: 12 }}>
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
          <div style={{ fontWeight: 700 }}>Schedule Templates</div>
          {!hostelOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="secondary" onClick={openAreaCreate}>+ Add Area</Btn>
              <Btn size="sm" onClick={openCreate}>+ Add Template</Btn>
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="Search area..."
            value={areaSearch}
            onChange={(e) => setAreaSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          {!readOnly && (
            <>
              <Btn size="sm" variant={areaFilter === 'hostels' ? 'primary' : 'secondary'} onClick={() => setAreaFilter('hostels')}>
                Hostels
              </Btn>
              <Btn size="sm" variant={areaFilter === 'academic' ? 'primary' : 'secondary'} onClick={() => setAreaFilter('academic')}>
                Academic Areas
              </Btn>
              <Btn size="sm" variant={areaFilter === 'others' ? 'primary' : 'secondary'} onClick={() => setAreaFilter('others')}>
                Other Areas
              </Btn>
              <Btn size="sm" variant={areaFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setAreaFilter('all')}>
                All
              </Btn>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>
            No schedule templates found.
          </div>
        </Card>
      ) : (
        filteredGroups.map((group) => (
          <Card key={group.areaId} noPad style={{ marginBottom: 12 }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
              }}
              onClick={() =>
                setExpandedAreaId((prev) => (prev === group.areaId ? null : group.areaId))
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    width: 18,
                    height: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 10,
                    color: 'var(--text-3)',
                  }}
                >
                  {expandedAreaId === group.areaId ? '−' : '+'}
                </span>
                <span>{group.areaName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {group.rows.length} template{group.rows.length === 1 ? '' : 's'}
                </span>
                {canDeleteAreas && (
                  <Btn
                    size="sm"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAreaDeleteTarget(group)
                    }}
                    disabled={areaSaving}
                  >
                    Delete Area
                  </Btn>
                )}
              </div>
            </div>
            {expandedAreaId === group.areaId && (
              <DataTable
                headers={[
                  'Task Name',
                  'Frequency',
                  'Days',
                  'Start Time',
                  'End Time',
                  'Special',
                  'Optional',
                  'Active',
                  ...(readOnly ? [] : ['Actions']),
                ]}
                rows={group.rows.map((row) => {
                  const isSpecial = row.frequency !== 'daily'
                  return [
                    row.task_name,
                    frequencyLabel(row.frequency),
                    daysLabel(row.frequency),
                    formatTime(row.start_time),
                    formatTime(row.end_time),
                    isSpecial ? 'Yes' : 'No',
                    row.is_optional_weekend_task ? 'Yes' : 'No',
                    readOnly ? (
                      <span key={`active-${row.id}`} style={{ fontSize: 12, fontWeight: 700, color: row.is_active !== false ? '#16a34a' : 'var(--text-3)' }}>
                        {row.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    ) : (
                      <Btn
                        key={`active-${row.id}`}
                        size="sm"
                        variant={row.is_active !== false ? 'success' : 'ghost'}
                        onClick={() => toggleActive(row)}
                        disabled={saving}
                      >
                        {row.is_active !== false ? 'Active' : 'Inactive'}
                      </Btn>
                    ),
                    ...(readOnly ? [] : [
                      <div key={`act-${row.id}`} style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(row)}>Edit</Btn>
                        <Btn size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Delete</Btn>
                      </div>,
                    ]),
                  ]
                })}
                emptyMsg="No schedule templates available for this area."
              />
            )}
          </Card>
        ))
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add Schedule Template' : 'Edit Schedule Template'}
        width={640}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={saveTemplate} disabled={saving}>
              {saving ? 'Saving...' : modal?.mode === 'create' ? 'Create' : 'Save'}
            </Btn>
          </>
        }
      >
        <Alert message={formError} />
        {modal?.mode === 'create' ? (
          <>
            {createForms.map((row, index) => (
              <div
                key={`create-${index}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Template {index + 1}</div>
                  {createForms.length > 1 && (
                    <Btn size="sm" variant="ghost" onClick={() => removeCreateRow(index)}>
                      Remove
                    </Btn>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Area" required>
                    <SelectField
                      value={row.area}
                      onChange={(e) => updateCreateField(index, { area: e.target.value })}
                    >
                      <option value="">Select area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>{area.name}</option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Task Name" required>
                    <Input
                      value={row.task_name}
                      onChange={(e) => updateCreateField(index, { task_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Start Time" required>
                    <Input
                      type="time"
                      value={row.start_time}
                      onChange={(e) => updateCreateField(index, { start_time: e.target.value })}
                    />
                  </Field>
                  <Field label="End Time" required>
                    <Input
                      type="time"
                      value={row.end_time}
                      onChange={(e) => updateCreateField(index, { end_time: e.target.value })}
                    />
                  </Field>
                  <Field label="Frequency">
                    <SelectField
                      value={row.frequency}
                      onChange={(e) => handleCreateFrequencyChange(index, e.target.value)}
                    >
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Special">
                    <SelectField
                      value={row.frequency === 'daily' ? 'no' : 'yes'}
                      onChange={(e) => handleCreateSpecialSelect(index, e.target.value)}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </SelectField>
                  </Field>
                  <Field label="Optional Weekend">
                    <SelectField
                      value={row.is_optional_weekend_task ? 'yes' : 'no'}
                      onChange={(e) => updateCreateField(index, { is_optional_weekend_task: e.target.value === 'yes' })}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </SelectField>
                  </Field>
                </div>
                <Field label="Days (auto-mapped to frequency)">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {DAYS.map((day) => (
                      <label key={day.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={row.days.includes(day.key)}
                          onChange={() => toggleCreateDay(index, day.key)}
                        />
                        {day.full}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Active">
                  <SelectField
                    value={row.is_active ? 'yes' : 'no'}
                    onChange={(e) => updateCreateField(index, { is_active: e.target.value === 'yes' })}
                  >
                    <option value="yes">Active</option>
                    <option value="no">Inactive</option>
                  </SelectField>
                </Field>
              </div>
            ))}
            <Btn size="sm" variant="secondary" onClick={addCreateRow}>
              + Add Another Template
            </Btn>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Area" required>
                <SelectField value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}>
                  <option value="">Select area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Task Name" required>
                <Input value={form.task_name} onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))} />
              </Field>
              <Field label="Start Time" required>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                />
              </Field>
              <Field label="End Time" required>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                />
              </Field>
              <Field label="Frequency">
                <SelectField value={form.frequency} onChange={(e) => handleFrequencyChange(e.target.value)}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Special">
                <SelectField
                  value={form.frequency === 'daily' ? 'no' : 'yes'}
                  onChange={(e) => handleSpecialSelect(e.target.value)}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </SelectField>
              </Field>
              <Field label="Optional Weekend">
                <SelectField
                  value={form.is_optional_weekend_task ? 'yes' : 'no'}
                  onChange={(e) => setForm((p) => ({ ...p, is_optional_weekend_task: e.target.value === 'yes' }))}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </SelectField>
              </Field>
            </div>

            <Field label="Days (auto-mapped to frequency)">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DAYS.map((day) => (
                  <label key={day.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.days.includes(day.key)}
                      onChange={() => toggleDay(day.key)}
                    />
                    {day.full}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Active">
              <SelectField
                value={form.is_active ? 'yes' : 'no'}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === 'yes' }))}
              >
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </SelectField>
            </Field>
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Schedule Template"
        message={`Delete template ${deleteTarget?.task_name || ''} from ${deleteTarget?.area_name || 'this area'}?`}
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={saving}
        cancelDisabled={saving}
      />

      <ConfirmModal
        open={!!areaDeleteTarget}
        title="Delete Area"
        message={
          `ADMIN WARNING: this will permanently delete "${areaDeleteTarget?.areaName || ''}". `
          + `Staff links and schedule templates for this area will also be removed. `
          + `Deletion is blocked if the area has workers, daily records, stock, reports, leave/incharge records, alerts, or other history. `
          + `This area currently shows ${areaDeleteTarget?.rows?.length || 0} schedule template${areaDeleteTarget?.rows?.length === 1 ? '' : 's'} in this tab.`
        }
        confirmLabel={areaSaving ? 'Deleting...' : 'Delete Area'}
        onConfirm={confirmAreaDelete}
        onCancel={() => setAreaDeleteTarget(null)}
        confirmDisabled={areaSaving}
        cancelDisabled={areaSaving}
      />

      <Modal
        open={areaModal}
        onClose={() => setAreaModal(false)}
        title="Add Area"
        width={520}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAreaModal(false)} disabled={areaSaving}>Cancel</Btn>
            <Btn onClick={saveArea} disabled={areaSaving}>{areaSaving ? 'Saving...' : 'Add Area'}</Btn>
          </>
        }
      >
        <Alert message={areaFormError} />
        <Field label="Area Name" required>
          <Input value={areaForm.name} onChange={(e) => setAreaForm((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Category" required>
          <SelectField
            value={areaForm.category}
            onChange={(e) => setAreaForm((p) => ({ ...p, category: e.target.value }))}
          >
            {AREA_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectField>
        </Field>
        <Field label="Description">
          <Input
            value={areaForm.description}
            onChange={(e) => setAreaForm((p) => ({ ...p, description: e.target.value }))}
          />
        </Field>
      </Modal>
    </div>
  )
}
