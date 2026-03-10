import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'

export default function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rows, setRows] = useState([])
  const [areaClassFilter, setAreaClassFilter] = useState('all')

  const [assignArea, setAssignArea] = useState(null)
  const [assignSaving, setAssignSaving] = useState(false)
  const [promoteSaving, setPromoteSaving] = useState(false)
  const [pendingPromotion, setPendingPromotion] = useState(null)
  const loadInProgressRef = useRef(false)
  const [assignForm, setAssignForm] = useState({
    task_name: '',
    period_minutes: '60',
    task_mode: 'temporary',
    add_to_daily: false,
    requires_photo: true,
    note: '',
  })

  const areaGroup = (areaName, areaType) => {
    const n = String(areaName || '').trim()
    if (/^Academic Block\s+([1-9]|1[0-3])$/i.test(n)) return 'academic'
    if (['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(n)) return 'academic'
    if (['hostel common area', 'common area'].includes(n.toLowerCase())) return 'hostels'
    if (areaType === 'hostel') return 'hostels'
    return 'others'
  }

  const load = useCallback(async ({ silent = false } = {}) => {
    if (loadInProgressRef.current) return
    loadInProgressRef.current = true
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const { data: areaData } = await hkAPI.getAreas()
      const areaList = Array.isArray(areaData) ? areaData : areaData?.results || []
      const todayStr = new Date().toISOString().slice(0, 10)
      let records = []
      try {
        const { data } = await hkAPI.getDailyRecords({ date: todayStr })
        records = Array.isArray(data) ? data : data?.results || []
      } catch {
        records = []
      }

      const byArea = {}
      records.forEach(r => {
        const key = r.area || r.area_id
        if (!byArea[key]) byArea[key] = []
        byArea[key].push(r)
      })

      const mapped = areaList.map((area) => {
        const areaRecords = byArea[area.id] || byArea[String(area.id)] || []
        const completed = areaRecords.filter((r) => r.status === 'done').length
        const pending = areaRecords.filter((r) => r.status === 'pending').length
        const skipped = areaRecords.filter((r) => r.status === 'skipped').length
        return {
          area_id: area.id,
          area: area.name,
          area_type: area.area_type,
          pending,
          skipped,
          completed,
          total: areaRecords.length,
          supervisor_caretaker: (area.caretakers || []).join(', ') || '-',
        }
      })

      const groupOrder = (areaName, areaType) => {
        const g = areaGroup(areaName, areaType)
        if (g === 'hostels') return 0
        if (g === 'academic') return 1
        return 2
      }
      const extractBlockNo = (name) => {
        const m = String(name || '').match(/Academic Block\s+(\d+)/i)
        return m ? Number(m[1]) : Number.POSITIVE_INFINITY
      }

      const sorted = [...mapped].sort((a, b) => {
        const ga = groupOrder(a.area, a.area_type)
        const gb = groupOrder(b.area, b.area_type)
        if (ga !== gb) return ga - gb

        if (ga === 1) {
          const an = extractBlockNo(a.area)
          const bn = extractBlockNo(b.area)
          if (an !== bn) return an - bn
        }
        return a.area.localeCompare(b.area)
      })

      setRows(sorted)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load housekeeping overview.')
    } finally {
      if (!silent) setLoading(false)
      loadInProgressRef.current = false
    }
  }, [])

  const visibleRows = useMemo(
    () => (
      areaClassFilter === 'all'
        ? rows
        : rows.filter((r) => areaGroup(r.area, r.area_type) === areaClassFilter)
    ),
    [rows, areaClassFilter],
  )

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      load({ silent: true })
    }, 10000)
    return () => clearInterval(timer)
  }, [load])

  const openAssignModal = (row) => {
    setAssignArea(row)
    setAssignForm({
      task_name: '',
      period_minutes: '60',
      task_mode: 'temporary',
      add_to_daily: false,
      requires_photo: true,
      note: '',
    })
  }

  const submitAssignTask = async () => {
    if (!assignArea) return
    if (!assignForm.task_name.trim()) {
      setError('Task name is required.')
      return
    }

    setAssignSaving(true)
    setError('')
    setSuccess('')
    try {
      const { data } = await hkAPI.assignAreaTask({
        area_id: assignArea.area_id,
        task_name: assignForm.task_name.trim(),
        period_minutes: Number(assignForm.period_minutes || 60),
        task_mode: assignForm.task_mode,
        add_to_daily: !!assignForm.add_to_daily,
        requires_photo: !!assignForm.requires_photo,
        note: assignForm.note.trim(),
      })
      setAssignArea(null)
      const rec = data?.record || null
      if (data?.can_promote_to_daily && rec) {
        setPendingPromotion({
          record_id: rec.id,
          area: rec.area_name,
          task_name: rec.task_name,
        })
        setSuccess(`Permanent task created in Special for ${assignArea.area}.`)
      } else if (data?.added_to_daily) {
        setPendingPromotion(null)
        setSuccess(`Task assigned and added to daily schedule in ${assignArea.area}.`)
      } else {
        setPendingPromotion(null)
        setSuccess(`Task assigned in ${assignArea.area}.`)
      }
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to assign task.')
    } finally {
      setAssignSaving(false)
    }
  }

  const promoteToDaily = async () => {
    if (!pendingPromotion?.record_id) return
    setPromoteSaving(true)
    setError('')
    setSuccess('')
    try {
      await hkAPI.promoteTaskToDaily(pendingPromotion.record_id)
      setSuccess(`Task "${pendingPromotion.task_name}" promoted to daily schedule.`)
      setPendingPromotion(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to promote task to daily schedule.')
    } finally {
      setPromoteSaving(false)
    }
  }

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, r) => ({
          pending: acc.pending + r.pending,
          skipped: acc.skipped + r.skipped,
          completed: acc.completed + r.completed,
          total: acc.total + r.total,
        }),
        { pending: 0, skipped: 0, completed: 0, total: 0 },
      ),
    [visibleRows],
  )

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />
      {pendingPromotion ? (
        <Card style={{ marginBottom: 12, borderColor: '#fed7aa', background: '#fff7ed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#9a3412' }}>
              Permanent task ready for daily schedule:
              {' '}
              <strong>{pendingPromotion.task_name}</strong>
              {' '}
              ({pendingPromotion.area})
            </div>
            <Btn variant="orange" size="sm" onClick={promoteToDaily} disabled={promoteSaving}>
              {promoteSaving ? 'Adding...' : 'Add to Daily Schedule'}
            </Btn>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
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
              <div style={{ fontWeight: 700 }}>Today's Running Tasks</div>
              <div style={{ display: 'flex', gap: 6 }}>
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
              </div>
            </div>
            <DataTable
              headers={[
                'Area',
                'Assigned To',
                'Total Work',
                'Pending',
                'Skipped',
                'Completed',
                'Assign Task',
              ]}
              rows={visibleRows.map((r) => [
                r.area,
                <span key={`sup-${r.area_id}`} style={{ fontSize: 12 }}>
                  {r.supervisor_caretaker}
                </span>,
                <strong key={`t-${r.area_id}`}>{r.total}</strong>,
                <strong key={`p-${r.area_id}`}>{r.pending}</strong>,
                <strong key={`s-${r.area_id}`}>{r.skipped}</strong>,
                <strong key={`c-${r.area_id}`}>{r.completed}</strong>,
                <Btn key={`a-${r.area_id}`} size="sm" variant="orange" onClick={() => openAssignModal(r)}>
                  + Assign
                </Btn>,
              ])}
            />
          </Card>

          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Report Trends</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 220,
                color: 'var(--text-3)',
                fontSize: 12,
                gap: 8,
                border: '1px dashed var(--border)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 24 }}>Chart</span>
              <div style={{ textAlign: 'center' }}>Historical trend data not yet available</div>
              <div style={{ fontSize: 11, textAlign: 'center' }}>
                This chart will populate once daily records accumulate
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13 }}>
            Total <strong>{totals.total}</strong> Tasks
          </div>
          <div style={{ fontSize: 13 }}>
            Completed <strong>{totals.completed}</strong> Tasks
          </div>
          <div style={{ fontSize: 13 }}>
            Skipped <strong>{totals.skipped}</strong> Tasks
          </div>
          <div style={{ fontSize: 13 }}>
            Pending <strong>{totals.pending}</strong> Tasks
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary">Share Daily Tasks</Btn>
            <Btn variant="orange">Export Report</Btn>
          </div>
        </div>
      </Card>

      <Modal
        open={!!assignArea}
        onClose={() => setAssignArea(null)}
        title={`Assign Task - ${assignArea?.area || ''}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAssignArea(null)}>
              Cancel
            </Btn>
            <Btn variant="orange" onClick={submitAssignTask} disabled={assignSaving}>
              {assignSaving ? 'Assigning...' : 'Assign Task'}
            </Btn>
          </>
        }
      >
        <Field label="Task Name" required>
          <Input
            value={assignForm.task_name}
            onChange={(e) => setAssignForm((p) => ({ ...p, task_name: e.target.value }))}
            placeholder="e.g. Urgent corridor deep cleaning"
          />
        </Field>

        <Field label="Work Duration">
          <SelectField
            value={assignForm.period_minutes}
            onChange={(e) => setAssignForm((p) => ({ ...p, period_minutes: e.target.value }))}
          >
            <option value="30">30 min</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
            <option value="180">3 hours</option>
          </SelectField>
        </Field>

        <Field label="Task Type">
          <SelectField
            value={assignForm.task_mode}
            onChange={(e) =>
              setAssignForm((p) => ({
                ...p,
                task_mode: e.target.value,
                add_to_daily: e.target.value === 'temporary' ? false : p.add_to_daily,
              }))
            }
          >
            <option value="temporary">Temporary (Special only)</option>
            <option value="permanent">Permanent</option>
          </SelectField>
        </Field>

        {assignForm.task_mode === 'permanent' ? (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
              marginTop: 2,
              marginBottom: 10,
            }}
          >
            <input
              type="checkbox"
              checked={assignForm.add_to_daily}
              onChange={(e) => setAssignForm((p) => ({ ...p, add_to_daily: e.target.checked }))}
            />
            Add to Daily Schedule now
          </label>
        ) : null}

        <Field label="Notes (Optional)">
          <Input
            value={assignForm.note}
            onChange={(e) => setAssignForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="Any special instruction..."
          />
        </Field>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
            marginTop: 4,
          }}
        >
          <input
            type="checkbox"
            checked={assignForm.requires_photo}
            onChange={(e) => setAssignForm((p) => ({ ...p, requires_photo: e.target.checked }))}
          />
          Require after-photo on completion
        </label>
      </Modal>
    </div>
  )
}
