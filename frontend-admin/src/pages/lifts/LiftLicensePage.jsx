import { useEffect, useMemo, useState } from 'react'
import { liftApi } from '../../api/lifts'
import { Alert, Btn, Card, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'

const STATUS_CONFIG = {
  expired: {
    label: 'Expired',
    bg: '#fef2f2',
    color: '#b91c1c',
    border: '#fca5a5',
    dot: '#dc2626',
    pillBg: '#fee2e2',
  },
  due: {
    label: 'Due Soon',
    bg: '#fffbeb',
    color: '#b45309',
    border: '#fcd34d',
    dot: '#f59e0b',
    pillBg: '#fef3c7',
  },
  soon: {
    label: 'Next 90 Days',
    bg: '#eff6ff',
    color: '#1d4ed8',
    border: '#93c5fd',
    dot: '#3b82f6',
    pillBg: '#dbeafe',
  },
  ok: {
    label: 'Valid',
    bg: '#f0fdf4',
    color: '#15803d',
    border: '#86efac',
    dot: '#22c55e',
    pillBg: '#dcfce7',
  },
  missing: {
    label: 'Date Missing',
    bg: '#f8fafc',
    color: '#475569',
    border: '#cbd5e1',
    dot: '#94a3b8',
    pillBg: '#e2e8f0',
  },
}

function formatDaysLeft(days) {
  if (days === null || days === undefined) return 'No date set'
  if (days < 0) {
    const d = Math.abs(days)
    return `Expired ${d} day${d === 1 ? '' : 's'} ago`
  }
  if (days === 0) return 'Expires Today'
  return `${days} day${days === 1 ? '' : 's'} left`
}

function toIsoDate(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split('.')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return ''
}

export default function LiftLicensePage() {
  const [lifts, setLifts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [provFilter, setProvFilter] = useState('')
  const [win, setWin] = useState(90)
  const [alertTierFilter, setAlertTierFilter] = useState('all')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [noticeFeedback, setNoticeFeedback] = useState(null)
  const [sortKey, setSortKey] = useState('order')
  const [sortDir, setSortDir] = useState('asc')

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [activeLift, setActiveLift] = useState(null)
  const [formValues, setFormValues] = useState({
    loc: '',
    lift: '',
    no: '',
    prov: '',
    frm: '',
    till: '',
    eng: '',
    rem: '',
  })
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [alertsExpanded, setAlertsExpanded] = useState(true)

  const handleTriggerEmailAlert = async () => {
    try {
      setSendingAlert(true)
      const res = await liftApi.triggerAlert({ force: true, window: 90 })
      const targetMail = res?.data?.recipient || stats?.alert_email || 'je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in'
      if (res?.data?.sent) {
        setNoticeFeedback(`Alert email dispatched for 30, 60 & 90 days expiring lifts to ${targetMail}`)
      } else if (res?.data?.already_sent) {
        setNoticeFeedback(`Alert already sent today to ${targetMail}`)
      } else {
        setNoticeFeedback(res?.data?.message || 'Email alert processed.')
      }
      setTimeout(() => setNoticeFeedback(null), 6000)
    } catch (e) {
      console.error('Trigger alert failed:', e)
      setNoticeFeedback('Failed to send alert email. Check SMTP settings.')
      setTimeout(() => setNoticeFeedback(null), 6000)
    } finally {
      setSendingAlert(false)
    }
  }

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [listRes, statsRes] = await Promise.all([
        liftApi.getLifts({ win: 90 }),
        liftApi.getStats({ win: 90 }),
      ])
      setLifts(listRes.data || [])
      setStats(statsRes.data || null)
    } catch (err) {
      console.error(err)
      setError(err?.response?.data?.error || err.message || 'Failed to load lift licenses.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filtered & Sorted items
  const filteredLifts = useMemo(() => {
    return lifts
      .filter((item) => {
        if (statusFilter && item.status !== statusFilter) return false
        if (locFilter && item.loc !== locFilter) return false
        if (provFilter && item.prov !== provFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const match =
            (item.lift || '').toLowerCase().includes(q) ||
            (item.no || '').toLowerCase().includes(q) ||
            (item.loc || '').toLowerCase().includes(q) ||
            (item.prov || '').toLowerCase().includes(q) ||
            (item.rem || '').toLowerCase().includes(q) ||
            (item.eng || '').toLowerCase().includes(q)
          if (!match) return false
        }
        return true
      })
      .sort((a, b) => {
        let valA = a[sortKey]
        let valB = b[sortKey]

        if (sortKey === 'days_remaining') {
          valA = a.days_remaining === null ? 99999 : a.days_remaining
          valB = b.days_remaining === null ? 99999 : b.days_remaining
        } else if (typeof valA === 'string') {
          valA = valA.toLowerCase()
          valB = (valB || '').toLowerCase()
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1
        if (valA > valB) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [lifts, statusFilter, locFilter, provFilter, search, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Copy license number
  const handleCopyNo = (text, id) => {
    navigator.clipboard?.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  // Open Create
  const handleOpenCreate = () => {
    setActiveLift(null)
    setFormValues({
      loc: '',
      lift: '',
      no: '',
      prov: '',
      frm: '',
      till: '',
      eng: 'Mr. Naveen Rai',
      rem: '',
    })
    setFormError(null)
    setEditModalOpen(true)
  }

  // Open Edit
  const handleOpenEdit = (lift) => {
    setActiveLift(lift)
    setFormValues({
      loc: lift.loc || '',
      lift: lift.lift || '',
      no: lift.no || '',
      prov: lift.prov || '',
      frm: lift.iso_frm || toIsoDate(lift.frm) || '',
      till: lift.iso_till || toIsoDate(lift.till) || '',
      eng: lift.eng || 'Mr. Naveen Rai',
      rem: lift.rem || '',
    })
    setFormError(null)
    setEditModalOpen(true)
  }

  // Save Lift
  const handleSaveLift = async (e) => {
    e?.preventDefault()
    setFormError(null)

    if (!formValues.loc.trim()) {
      setFormError('Location is required')
      return
    }
    if (!formValues.lift.trim()) {
      setFormError('Lift identifier is required')
      return
    }
    if (!formValues.no.trim()) {
      setFormError('License number is required')
      return
    }
    if (formValues.frm && formValues.till && formValues.till < formValues.frm) {
      setFormError('Valid Till date must be after Valid From date.')
      return
    }

    const payload = {
      ...formValues,
      eng: formValues.eng?.trim() || 'Mr. Naveen Rai',
    }

    try {
      setSaving(true)
      if (activeLift) {
        await liftApi.updateLift(activeLift.id, payload)
      } else {
        await liftApi.createLift(payload)
      }
      setEditModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      const data = err?.response?.data
      if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        setFormError(`${firstKey}: ${Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey]}`)
      } else {
        setFormError(data?.error || err.message || 'Failed to save lift license.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Delete Lift
  const handleConfirmDelete = async () => {
    if (!activeLift) return
    try {
      setSaving(true)
      await liftApi.deleteLift(activeLift.id)
      setDeleteModalOpen(false)
      setActiveLift(null)
      fetchData()
    } catch (err) {
      console.error(err)
      alert(err?.response?.data?.error || err.message || 'Failed to delete lift.')
    } finally {
      setSaving(false)
    }
  }

  // Export CSV
  const handleExport = async () => {
    try {
      await liftApi.exportCsv()
    } catch (err) {
      console.error(err)
      alert('Failed to export CSV: ' + err.message)
    }
  }

  const counts = stats?.counts || {
    total: lifts.length,
    expired: 0,
    due: 0,
    soon: 0,
    ok: 0,
    missing: 0,
  }

  const alerts = stats?.alerts || []

  const displayedAlerts = useMemo(() => {
    if (!alerts) return []
    if (alertTierFilter === 'all') return alerts
    return alerts.filter((a) => a.tier === alertTierFilter)
  }, [alerts, alertTierFilter])

  return (
    <AdminLayout
      title="Lift License Tracker"
      subtitle="Statutory elevator license records, safety inspections, OEM providers & validity management"
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="secondary" onClick={handleExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export CSV
          </Btn>
          <Btn variant="primary" onClick={handleOpenCreate}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Lift
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <Alert type="error" message={error} />}

        {/* ── KPI Stat Tiles ────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
          }}
        >
          {/* Total */}
          <div
            onClick={() => setStatusFilter('')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: statusFilter === '' ? '2px solid var(--green-800)' : '1px solid var(--border)',
              boxShadow: statusFilter === '' ? '0 4px 14px rgba(45,74,62,0.12)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Lifts
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
              {counts.total}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Active Campus Elevators
            </div>
          </div>

          {/* Expired */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'expired' ? '' : 'expired')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: counts.expired > 0 ? '#fff1f2' : 'var(--surface)',
              border: statusFilter === 'expired' ? '2px solid #dc2626' : '1px solid #fecdd3',
              boxShadow: statusFilter === 'expired' ? '0 4px 14px rgba(220,38,38,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9f1239', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Expired
              </span>
              {counts.expired > 0 && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#be123c', marginTop: 4 }}>
              {counts.expired}
            </div>
            <div style={{ fontSize: 12, color: '#9f1239', marginTop: 2 }}>
              Needs immediate renewal
            </div>
          </div>

          {/* Due Soon */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'due' ? '' : 'due')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: counts.due > 0 ? '#fffbeb' : 'var(--surface)',
              border: statusFilter === 'due' ? '2px solid #d97706' : '1px solid #fde68a',
              boxShadow: statusFilter === 'due' ? '0 4px 14px rgba(217,119,6,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Due in ≤30 Days
              </span>
              {counts.due > 0 && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#b45309', marginTop: 4 }}>
              {counts.due}
            </div>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
              Critical Renewal Tier
            </div>
          </div>

          {/* Next 90 Days */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'soon' ? '' : 'soon')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: statusFilter === 'soon' ? '2px solid #2563eb' : '1px solid var(--border)',
              boxShadow: statusFilter === 'soon' ? '0 4px 14px rgba(37,99,235,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Next 90 Days
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
              {counts.soon}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Upcoming renewals
            </div>
          </div>

          {/* Valid */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'ok' ? '' : 'ok')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: statusFilter === 'ok' ? '2px solid #16a34a' : '1px solid var(--border)',
              boxShadow: statusFilter === 'ok' ? '0 4px 14px rgba(22,163,74,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Valid
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#15803d', marginTop: 4 }}>
              {counts.ok}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Statutory compliant
            </div>
          </div>

          {/* Date Missing */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'missing' ? '' : 'missing')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: statusFilter === 'missing' ? '2px solid #64748b' : '1px solid var(--border)',
              boxShadow: statusFilter === 'missing' ? '0 4px 14px rgba(100,116,139,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Date Missing
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#475569', marginTop: 4 }}>
              {counts.missing}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Awaiting certificate date
            </div>
          </div>
        </div>

        {/* ── Admin Notice Board (Urgent Alerts) ───────────────────── */}
        {alerts.length > 0 && (
          <Card
            style={{
              border: '1px solid #fecdd3',
              background: 'linear-gradient(180deg, #fff5f5 0%, #ffffff 100%)',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#ef4444',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#991b1b' }}>
                      Urgent Compliance Notices ({alerts.length})
                    </h3>
                    <span
                      style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        border: '1px solid #86efac',
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      ⚡ Auto-Alerts: 30d • 60d • 90d Active
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7f1d1d' }}>
                    Automated email schedule active • Direct alert notices dispatched at 30, 60 & 90 days before expiry.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* Filter Pills */}
                <div style={{ display: 'flex', background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: 2, gap: 2 }}>
                  {[
                    { id: 'all', label: `All (${alerts.length})` },
                    { id: '30', label: `≤30d (${alerts.filter((a) => a.tier === '30').length})` },
                    { id: '60', label: `60d (${alerts.filter((a) => a.tier === '60').length})` },
                    { id: '90', label: `90d (${alerts.filter((a) => a.tier === '90').length})` },
                    { id: 'expired', label: `Expired (${alerts.filter((a) => a.tier === 'expired').length})` },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setAlertTierFilter(btn.id)}
                      style={{
                        border: 'none',
                        background: alertTierFilter === btn.id ? '#991b1b' : 'transparent',
                        color: alertTierFilter === btn.id ? '#fff' : '#7f1d1d',
                        fontWeight: 700,
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Direct Send Alert Button */}
                <button
                  type="button"
                  onClick={handleTriggerEmailAlert}
                  disabled={sendingAlert}
                  style={{
                    background: '#991b1b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: sendingAlert ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(153,27,27,0.25)',
                    opacity: sendingAlert ? 0.7 : 1,
                  }}
                  title="Send immediate alert email for 30, 60 & 90 days expiring lifts"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  {sendingAlert ? 'Sending Email...' : 'Send Alert Email Now'}
                </button>

                {noticeFeedback && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#15803d',
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                      borderRadius: 6,
                      padding: '4px 8px',
                    }}
                  >
                    ✓ {noticeFeedback}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setAlertsExpanded(!alertsExpanded)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#991b1b',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  {alertsExpanded ? 'Collapse ▲' : 'Expand ▼'}
                </button>
              </div>
            </div>

            {alertsExpanded && (
              <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedAlerts.map((item) => {
                  const isExp = item.tier === 'expired'
                  const is30 = item.tier === '30'
                  const is60 = item.tier === '60'
                  const is90 = item.tier === '90'

                  const badgeBg = isExp ? '#dc2626' : is30 ? '#b91c1c' : is60 ? '#d97706' : '#2563eb'
                  const badgeLabel = isExp ? 'EXPIRED' : is30 ? '🚨 ≤30d CRITICAL' : is60 ? '⚠️ 60d NOTICE' : 'ℹ️ 90d ADVANCE'
                  const cardBg = isExp ? '#fef2f2' : is30 ? '#fff5f5' : is60 ? '#fffbeb' : '#eff6ff'
                  const cardBorder = isExp ? '#fca5a5' : is30 ? '#fecaca' : is60 ? '#fde68a' : '#bfdbfe'

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: cardBg,
                        border: `1px solid ${cardBorder}`,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 7px',
                            borderRadius: 4,
                            background: badgeBg,
                            color: '#fff',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badgeLabel}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isExp || is30 ? '#991b1b' : is60 ? '#92400e' : '#1e40af' }}>
                          {formatDaysLeft(item.days_remaining)}
                        </span>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                          {item.lift} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>• {item.loc}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                          License No: <b>{item.no}</b> {item.prov ? `• OEM: ${item.prov}` : ''}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Valid Till</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isExp || is30 ? '#dc2626' : is60 ? '#b45309' : '#1d4ed8' }}>
                          {item.till || '—'}
                        </div>
                      </div>

                      <Btn size="sm" variant="secondary" onClick={() => handleOpenEdit(item)}>
                        Update
                      </Btn>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* ── Filters & Search Bar ──────────────────────────────────── */}
        <Card style={{ padding: '14px 18px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-3)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search lift, location, license no, provider..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: 9,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdown Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {/* Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                }}
              >
                <option value="">All Statuses ({counts.total})</option>
                <option value="expired">Expired ({counts.expired})</option>
                <option value="due">Due Soon ({counts.due})</option>
                <option value="soon">Next 90 Days ({counts.soon})</option>
                <option value="ok">Valid ({counts.ok})</option>
                <option value="missing">Date Missing ({counts.missing})</option>
              </select>

              {/* Location */}
              <select
                value={locFilter}
                onChange={(e) => setLocFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13,
                  color: 'var(--text)',
                  maxWidth: 220,
                }}
              >
                <option value="">All Locations</option>
                {(stats?.locations || []).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>

              {/* Provider */}
              <select
                value={provFilter}
                onChange={(e) => setProvFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13,
                  color: 'var(--text)',
                  maxWidth: 220,
                }}
              >
                <option value="">All Providers</option>
                {(stats?.providers || []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {/* Clear filters */}
              {(search || statusFilter || locFilter || provFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('')
                    setLocFilter('')
                    setProvFilter('')
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    padding: '7px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>
              Showing {filteredLifts.length} of {lifts.length}
            </div>
          </div>
        </Card>

        {/* ── Main Data Table ───────────────────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Spinner />
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-3)' }}>Loading lift licenses...</div>
            </div>
          ) : filteredLifts.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛗</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>No lift records found</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                {search || statusFilter || locFilter || provFilter
                  ? 'Try adjusting your search criteria or active filters'
                  : 'Get started by adding your first lift license'}
              </div>
              <div style={{ marginTop: 16 }}>
                <Btn variant="primary" onClick={handleOpenCreate}>
                  + Add First Lift
                </Btn>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th
                      onClick={() => handleSort('lift')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Lift Name & Notes {sortKey === 'lift' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleSort('loc')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Location {sortKey === 'loc' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleSort('no')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      License No. {sortKey === 'no' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleSort('prov')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Provider / OEM {sortKey === 'prov' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      Validity Window
                    </th>
                    <th
                      onClick={() => handleSort('days_remaining')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Status {sortKey === 'days_remaining' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      Engineer / In-charge
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLifts.map((item) => {
                    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.missing
                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Lift Name */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 14 }}>
                            {item.lift}
                          </div>
                          {item.rem && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                              {item.rem}
                            </div>
                          )}
                        </td>

                        {/* Location */}
                        <td style={{ padding: '14px 16px', color: 'var(--text-2)' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {item.loc}
                          </span>
                        </td>

                        {/* License No with Copy */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontWeight: 700,
                                fontSize: 12,
                                color: 'var(--green-900)',
                              }}
                            >
                              {item.no}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyNo(item.no, item.id)}
                              title="Copy License Number"
                              style={{
                                border: 'none',
                                background: copiedId === item.id ? 'var(--green-800)' : 'transparent',
                                color: copiedId === item.id ? '#fff' : 'var(--text-3)',
                                borderRadius: 4,
                                padding: '2px 5px',
                                fontSize: 10,
                                cursor: 'pointer',
                              }}
                            >
                              {copiedId === item.id ? '✓' : '⧉'}
                            </button>
                          </div>
                        </td>

                        {/* Provider */}
                        <td style={{ padding: '14px 16px', color: 'var(--text-2)', fontSize: 12 }}>
                          {item.prov || '—'}
                        </td>

                        {/* Validity Dates */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 12, color: 'var(--text)' }}>
                            <span style={{ color: 'var(--text-3)' }}>From:</span> {item.frm || '—'}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                            <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>Till:</span>{' '}
                            <span style={{ color: item.status === 'expired' ? '#dc2626' : 'var(--text)' }}>
                              {item.till || '—'}
                            </span>
                          </div>
                        </td>

                        {/* Status Chip */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: cfg.bg,
                              border: `1px solid ${cfg.border}`,
                              color: cfg.color,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: cfg.dot,
                              }}
                            />
                            {cfg.label}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                            {formatDaysLeft(item.days_remaining)}
                          </div>
                        </td>

                        {/* Engineer */}
                        <td style={{ padding: '14px 16px', color: 'var(--text-2)', fontSize: 12 }}>
                          {item.eng || 'Mr. Naveen Rai'}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              title="Edit Lift"
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveLift(item)
                                setDeleteModalOpen(true)
                              }}
                              title="Delete Lift"
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid #fecaca',
                                background: '#fff1f2',
                                color: '#b91c1c',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Add / Edit Modal ────────────────────────────────────────── */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={activeLift ? 'Edit Lift License' : 'Add New Lift License'}
        width={560}
      >
        <form onSubmit={handleSaveLift} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && <Alert type="error" message={formError} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Location / Zone *" hint="Alphanumeric (letters, numbers & brackets)">
              <Input
                value={formValues.loc}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    loc: e.target.value.replace(/[^a-zA-Z0-9\s\-()\/&,.]/g, ''),
                  })
                }
                placeholder="e.g. Academic Block (10,11,12,13)"
                required
              />
            </Field>

            <Field label="Lift Identifier *" hint="Alphanumeric (letters, numbers & dashes)">
              <Input
                value={formValues.lift}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    lift: e.target.value.replace(/[^a-zA-Z0-9\s\-_()]/g, ''),
                  })
                }
                placeholder="e.g. Academic Block-10 A"
                required
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="License Number *" hint="Alphanumeric, slashes & dashes (no spaces)">
              <Input
                value={formValues.no}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    no: e.target.value.replace(/[^a-zA-Z0-9\/\-_.]/g, ''),
                  })
                }
                placeholder="e.g. G/CZ/06/1967/2023"
                required
              />
            </Field>

            <Field label="OEM / Provider" hint="Alphabets only (no numbers)">
              <Input
                value={formValues.prov}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    prov: e.target.value.replace(/[^a-zA-Z\s.&-]/g, ''),
                  })
                }
                placeholder="e.g. KONE Elevator India Pvt Ltd"
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Valid From *" hint="Pick date from calendar (no typing error)">
              <Input
                type="date"
                value={formValues.frm}
                onChange={(e) => setFormValues({ ...formValues, frm: e.target.value })}
                required
              />
            </Field>

            <Field label="Valid Till *" hint="Pick expiration date from calendar">
              <Input
                type="date"
                value={formValues.till}
                min={formValues.frm || undefined}
                onChange={(e) => setFormValues({ ...formValues, till: e.target.value })}
                required
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Engineer In-charge" hint="Default: Mr. Naveen Rai (alphabets only)">
              <Input
                value={formValues.eng || 'Mr. Naveen Rai'}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    eng: e.target.value.replace(/[^a-zA-Z\s.-]/g, ''),
                  })
                }
                placeholder="Mr. Naveen Rai"
              />
            </Field>

            <Field label="Remarks / Sub-location" hint="Alphanumeric (letters & numbers)">
              <Input
                value={formValues.rem}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    rem: e.target.value.replace(/[^a-zA-Z0-9\s\-()\/&,.]/g, ''),
                  })
                }
                placeholder="e.g. AB-10 A, Mess Passenger"
              />
            </Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <Btn variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : activeLift ? 'Update Lift' : 'Create Lift'}
            </Btn>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────── */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete Lift"
        width={420}
      >
        <div style={{ padding: '4px 0 12px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>
            Are you sure you want to delete lift <b>{activeLift?.lift}</b> (License No:{' '}
            <b>{activeLift?.no}</b>)?
          </p>
          <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8, margin: '8px 0 0' }}>
            This action cannot be undone and will remove it from the database and compliance reports.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Btn>
          <Btn variant="danger" onClick={handleConfirmDelete} disabled={saving}>
            {saving ? 'Deleting...' : 'Delete Permanently'}
          </Btn>
        </div>
      </Modal>
    </AdminLayout>
  )
}
