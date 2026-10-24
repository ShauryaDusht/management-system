import { useEffect, useMemo, useRef, useState } from 'react'
import { liftApi } from '../../api/lifts'
import { Alert, Btn, Card, Field, Input, Modal, SelectField, Spinner } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import { useAuth } from '../../context/AuthContext'
import { generateImageUrl } from '../../shared/imageUrls'

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
  applied: {
    label: 'Renewal Applied',
    bg: '#f5f3ff',
    color: '#6d28d9',
    border: '#c4b5fd',
    dot: '#8b5cf6',
    pillBg: '#ede9fe',
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split('.')
    return `${y.slice(0, 4)}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
    const [d, m, y] = s.split('-')
    return `${y.slice(0, 4)}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return ''
}

export default function LiftLicensePage() {
  const { isEngineer, isAdmin } = useAuth()
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
    equipment_no: '',
    prov: '',
    frm: '',
    till: '',
    is_applied: false,
    applied_date: '',
    application_no: '',
    applied_notes: '',
    eng: '',
    rem: '',
  })
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [exporting, setExporting] = useState(null)
  const exportDropdownRef = useRef(null)

  // ── Renewal Applied Feature State ─────────────────────────────────────────
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [applyLift, setApplyLift] = useState(null)
  const [savingApply, setSavingApply] = useState(false)
  const [applyError, setApplyError] = useState(null)
  const [applyFormValues, setApplyFormValues] = useState({
    applied_date: '',
    application_no: '',
    applied_notes: '',
  })

  // ── Approach 1: Lift Renewal Documents & Historical Archive State ────────
  const [docsModalOpen, setDocsModalOpen] = useState(false)
  const [docsLift, setDocsLift] = useState(null)
  const [docsList, setDocsList] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState(null)
  const [docsFeedback, setDocsFeedback] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docsTab, setDocsTab] = useState('list') // 'list' | 'upload'
  const [docUploadMode, setDocUploadMode] = useState('renewal') // 'renewal' | 'previous'
  const [docFormValues, setDocFormValues] = useState({
    title: '',
    license_no: '',
    valid_from: '',
    valid_till: '',
    is_current: true,
    update_lift_dates: true,
    notes: '',
  })
  const [selectedDocFile, setSelectedDocFile] = useState(null)
  const fileInputRef = useRef(null)

  const activeDocument = useMemo(() => {
    return docsList.find((d) => d.is_current) || null
  }, [docsList])

  const archivedDocuments = useMemo(() => {
    return docsList.filter((d) => !d.is_current)
  }, [docsList])

  const fetchDocs = async (liftId) => {
    try {
      setDocsLoading(true)
      setDocsError(null)
      const res = await liftApi.getDocuments(liftId)
      setDocsList(res.data || [])
    } catch (err) {
      setDocsError(err.response?.data?.error || 'Failed to load certificate documents.')
    } finally {
      setDocsLoading(false)
    }
  }

  const handleOpenDocuments = (lift) => {
    setDocsLift(lift)
    setDocsModalOpen(true)
    setDocsFeedback(null)
    setDocsError(null)
    setDocsTab('list')
    setDocUploadMode('renewal')
    setSelectedDocFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDocFormValues({
      title: '',
      license_no: lift.no || '',
      valid_from: lift.iso_frm || toIsoDate(lift.frm) || '',
      valid_till: lift.iso_till || toIsoDate(lift.till) || '',
      is_current: true,
      update_lift_dates: true,
      notes: '',
    })
    fetchDocs(lift.id)
  }

  const handleSwitchUploadMode = (mode) => {
    setDocUploadMode(mode)
    if (mode === 'renewal') {
      setDocFormValues((prev) => ({
        ...prev,
        title: prev.title || (docsLift?.till ? `Renewal Certificate (${docsLift.till})` : 'Renewal Certificate'),
        is_current: true,
        update_lift_dates: true,
      }))
    } else {
      setDocFormValues((prev) => ({
        ...prev,
        title: prev.title || 'Previous License Archive',
        is_current: false,
        update_lift_dates: false,
      }))
    }
  }

  const handleUploadDoc = async (e) => {
    e.preventDefault()
    if (!selectedDocFile) {
      setDocsError('Please select a PDF certificate file.')
      return
    }
    if (!selectedDocFile.name.toLowerCase().endsWith('.pdf') && selectedDocFile.type !== 'application/pdf') {
      setDocsError('Only PDF files (.pdf) are allowed for lift license certificates.')
      return
    }

    try {
      setUploadingDoc(true)
      setDocsError(null)
      const formData = new FormData()
      formData.append('pdf_file', selectedDocFile)
      formData.append('title', docFormValues.title || '')
      formData.append('license_no', docFormValues.license_no || docsLift?.no || '')
      if (docFormValues.valid_from) formData.append('valid_from', docFormValues.valid_from)
      if (docFormValues.valid_till) formData.append('valid_till', docFormValues.valid_till)
      formData.append('is_current', docFormValues.is_current ? 'true' : 'false')
      formData.append('update_lift_dates', docFormValues.update_lift_dates ? 'true' : 'false')
      formData.append('notes', docFormValues.notes || '')

      await liftApi.uploadDocument(docsLift.id, formData)

      setDocsFeedback(
        docFormValues.is_current
          ? '✓ New renewal certificate uploaded and activated successfully!'
          : '✓ Previous certificate archived successfully!'
      )
      setSelectedDocFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setDocFormValues({
        title: '',
        license_no: docsLift?.no || '',
        valid_from: '',
        valid_till: '',
        is_current: true,
        update_lift_dates: true,
        notes: '',
      })
      setDocsTab('list')

      // Refresh documents and lifts register
      await fetchDocs(docsLift.id)
      fetchData()
      setTimeout(() => setDocsFeedback(null), 5000)
    } catch (err) {
      setDocsError(err.response?.data?.error || err.message || 'Failed to upload certificate.')
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleSetDocAsCurrent = async (doc) => {
    try {
      setDocsLoading(true)
      setDocsError(null)
      await liftApi.updateDocument(doc.id, { is_current: true })
      setDocsFeedback(`✓ "${doc.title || doc.license_no || 'Document'}" marked as current active certificate!`)
      await fetchDocs(docsLift.id)
      fetchData()
      setTimeout(() => setDocsFeedback(null), 5000)
    } catch (err) {
      setDocsError(err.response?.data?.error || 'Failed to update certificate.')
    } finally {
      setDocsLoading(false)
    }
  }

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete certificate "${doc.title || doc.file_name}"?`)) {
      return
    }
    try {
      setDocsLoading(true)
      setDocsError(null)
      await liftApi.deleteDocument(doc.id)
      setDocsFeedback('✓ Certificate deleted.')
      await fetchDocs(docsLift.id)
      fetchData()
      setTimeout(() => setDocsFeedback(null), 4000)
    } catch (err) {
      setDocsError(err.response?.data?.error || 'Failed to delete certificate.')
    } finally {
      setDocsLoading(false)
    }
  }

  const handleDownloadDoc = async (doc) => {
    try {
      const fullUrl = generateImageUrl(doc.pdf_url)
      const token = localStorage.getItem('access_token')
      const res = await fetch(fullUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = doc.file_name || `${docsLift?.lift || 'lift'}_certificate.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      window.open(generateImageUrl(doc.pdf_url), '_blank')
    }
  }

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setExportDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleTriggerEmailAlert = async () => {
    try {
      setSendingAlert(true)
      const res = await liftApi.triggerAlert({ force: true, window: 90 })
      const targetMail = res?.data?.recipient || stats?.alert_email || 'je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in'
      if (res?.data?.sent) {
        setNoticeFeedback(`Alert email dispatched for 30, 60 & 90 days expiring lifts to ${targetMail}`)
      } else if (res?.data?.already_sent) {
        setNoticeFeedback(`Alert already sent today to ${targetMail}`)
      } else if (res?.data?.error) {
        setNoticeFeedback(`Notice generated (Preview saved). SMTP: ${res.data.error}`)
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

  // Open Renewal Application Modal
  const handleOpenApplyModal = (lift) => {
    setApplyLift(lift)
    setApplyError(null)
    setApplyFormValues({
      applied_date: lift.iso_applied_date || toIsoDate(lift.applied_date) || new Date().toISOString().slice(0, 10),
      application_no: lift.application_no || '',
      applied_notes: lift.applied_notes || '',
    })
    setApplyModalOpen(true)
  }

  // Save Renewal Application Status
  const handleSaveApply = async (e) => {
    e?.preventDefault()
    if (!applyLift) return
    if (!applyFormValues.applied_date) {
      setApplyError('Please enter the date when the renewal was applied.')
      return
    }
    try {
      setSavingApply(true)
      setApplyError(null)
      await liftApi.updateLift(applyLift.id, {
        is_applied: true,
        applied_date: applyFormValues.applied_date,
        application_no: applyFormValues.application_no?.trim() || '',
        applied_notes: applyFormValues.applied_notes?.trim() || '',
      })
      setApplyModalOpen(false)
      setNoticeFeedback(`✓ Renewal application recorded for ${applyLift.lift}!`)
      setTimeout(() => setNoticeFeedback(null), 5000)
      fetchData()
    } catch (err) {
      console.error('Failed to save renewal application:', err)
      setApplyError(err?.response?.data?.error || err?.message || 'Failed to record application.')
    } finally {
      setSavingApply(false)
    }
  }

  // Revert / Unmark Renewal Application
  const handleUnmarkApply = async () => {
    if (!applyLift) return
    try {
      setSavingApply(true)
      setApplyError(null)
      await liftApi.updateLift(applyLift.id, {
        is_applied: false,
        applied_date: null,
        application_no: '',
        applied_notes: '',
      })
      setApplyModalOpen(false)
      setNoticeFeedback(`✓ Renewal status reverted for ${applyLift.lift}.`)
      setTimeout(() => setNoticeFeedback(null), 5000)
      fetchData()
    } catch (err) {
      console.error('Failed to unmark applied:', err)
      setApplyError(err?.response?.data?.error || err?.message || 'Failed to revert application status.')
    } finally {
      setSavingApply(false)
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
        if (statusFilter === 'applied') {
          if (!item.is_applied) return false
        } else if (statusFilter && item.status !== statusFilter) {
          return false
        }
        if (locFilter && item.loc !== locFilter) return false
        if (provFilter && item.prov !== provFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const match =
            (item.lift || '').toLowerCase().includes(q) ||
            (item.no || '').toLowerCase().includes(q) ||
            (item.equipment_no || '').toLowerCase().includes(q) ||
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
    if (isEngineer) return
    setActiveLift(null)
    setFormValues({
      loc: '',
      lift: '',
      no: '',
      equipment_no: '',
      prov: '',
      frm: '',
      till: '',
      is_applied: false,
      applied_date: '',
      application_no: '',
      applied_notes: '',
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
      equipment_no: lift.equipment_no || '',
      prov: lift.prov || '',
      frm: lift.iso_frm || toIsoDate(lift.frm) || '',
      till: lift.iso_till || toIsoDate(lift.till) || '',
      is_applied: !!lift.is_applied,
      applied_date: lift.iso_applied_date || toIsoDate(lift.applied_date) || '',
      application_no: lift.application_no || '',
      applied_notes: lift.applied_notes || '',
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
      frm: formValues.frm || null,
      till: formValues.till || null,
      applied_date: formValues.is_applied ? (formValues.applied_date || null) : null,
      application_no: formValues.is_applied ? (formValues.application_no?.trim() || '') : '',
      applied_notes: formValues.is_applied ? (formValues.applied_notes?.trim() || '') : '',
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
    if (isEngineer || !activeLift) return
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
  const handleExportCsv = async () => {
    try {
      setExporting('csv')
      setExportDropdownOpen(false)
      await liftApi.exportCsv()
    } catch (err) {
      console.error(err)
      alert('Failed to export CSV: ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  // Export PDF
  const handleExportPdf = async () => {
    try {
      setExporting('pdf')
      setExportDropdownOpen(false)
      await liftApi.exportPdf()
    } catch (err) {
      console.error(err)
      alert('Failed to export PDF: ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  const counts = stats?.counts || {
    total: lifts.length,
    expired: 0,
    due: 0,
    soon: 0,
    ok: 0,
    missing: 0,
    applied: 0,
  }

  const alerts = stats?.alerts || []

  const displayedAlerts = useMemo(() => {
    if (!alerts) return []
    if (alertTierFilter === 'all') return alerts
    if (alertTierFilter === 'applied') return alerts.filter((a) => a.is_applied)
    if (alertTierFilter === 'not_applied') return alerts.filter((a) => !a.is_applied)
    return alerts.filter((a) => a.tier === alertTierFilter)
  }, [alerts, alertTierFilter])

  return (
    <AdminLayout
      title="Lift License Tracker"
      subtitle="Statutory elevator license records, safety inspections, OEM providers & validity management"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Export Dropdown */}
          <div ref={exportDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setExportDropdownOpen((prev) => !prev)}
              disabled={!!exporting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span>{exporting ? `Exporting ${exporting.toUpperCase()}...` : 'Export'}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{
                  transform: exportDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {exportDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 200,
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                  padding: '6px',
                  zIndex: 100,
                }}
              >
                {/* CSV Option */}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    color: '#1e293b',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    CSV
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Export CSV</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Spreadsheet / Excel format</div>
                  </div>
                </button>

                {/* PDF Option */}
                <button
                  type="button"
                  onClick={handleExportPdf}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    color: '#1e293b',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#fee2e2',
                      color: '#dc2626',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    PDF
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Export PDF</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Official compliance register</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {!isEngineer && (
            <Btn variant="primary" onClick={handleOpenCreate}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Lift
            </Btn>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <Alert type="error" message={error} />}

        {/* ── KPI Stat Tiles ────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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

          {/* Renewal Applied */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'applied' ? '' : 'applied')}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: (counts.applied || 0) > 0 ? '#f5f3ff' : 'var(--surface)',
              border: statusFilter === 'applied' ? '2px solid #7c3aed' : ((counts.applied || 0) > 0 ? '1px solid #ddd6fe' : '1px solid var(--border)'),
              boxShadow: statusFilter === 'applied' ? '0 4px 14px rgba(124,58,237,0.15)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Renewal Applied
              </span>
              {(counts.applied || 0) > 0 && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>
              {counts.applied || 0}
            </div>
            <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 2 }}>
              Submitted / In Process
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
                <div style={{ display: 'flex', background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: 2, gap: 2, flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: `All (${alerts.length})` },
                    { id: '30', label: `≤30d (${alerts.filter((a) => a.tier === '30' && !a.is_applied).length})` },
                    { id: '60', label: `60d (${alerts.filter((a) => a.tier === '60' && !a.is_applied).length})` },
                    { id: '90', label: `90d (${alerts.filter((a) => a.tier === '90' && !a.is_applied).length})` },
                    { id: 'expired', label: `Expired (${alerts.filter((a) => a.tier === 'expired' && !a.is_applied).length})` },
                    { id: 'applied', label: `⏳ Applied (${alerts.filter((a) => a.is_applied).length})` },
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

                {!isEngineer && (
                  <>
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
                  </>
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
                  const isApplied = !!item.is_applied
                  const isExp = item.tier === 'expired'
                  const is30 = item.tier === '30'
                  const is60 = item.tier === '60'
                  const is90 = item.tier === '90'

                  let badgeBg = isExp ? '#dc2626' : is30 ? '#b91c1c' : is60 ? '#d97706' : '#2563eb'
                  let badgeLabel = isExp ? 'EXPIRED' : is30 ? '🚨 ≤30d CRITICAL' : is60 ? '⚠️ 60d NOTICE' : 'ℹ️ 90d ADVANCE'
                  let cardBg = isExp ? '#fef2f2' : is30 ? '#fff5f5' : is60 ? '#fffbeb' : '#eff6ff'
                  let cardBorder = isExp ? '#fca5a5' : is30 ? '#fecaca' : is60 ? '#fde68a' : '#bfdbfe'

                  if (isApplied) {
                    badgeBg = '#7c3aed'
                    badgeLabel = '⏳ RENEWAL APPLIED'
                    cardBg = '#faf5ff'
                    cardBorder = '#ddd6fe'
                  }

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
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: isApplied ? '#6d28d9' : (isExp || is30 ? '#991b1b' : is60 ? '#92400e' : '#1e40af'),
                          }}
                        >
                          {isApplied
                            ? `Applied: ${item.applied_date || 'In Process'}`
                            : formatDaysLeft(item.days_remaining)}
                        </span>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                          {item.lift} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>• {item.loc}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                          License No: <b>{item.no}</b> {item.prov ? `• OEM: ${item.prov}` : ''}
                          {item.application_no && (
                            <span
                              style={{
                                marginLeft: 8,
                                padding: '1px 7px',
                                borderRadius: 4,
                                background: '#ede9fe',
                                color: '#6d28d9',
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              Ref: {item.application_no}
                            </span>
                          )}
                        </div>
                        {item.applied_notes && (
                          <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2, fontStyle: 'italic' }}>
                            Note: {item.applied_notes}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Valid Till</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isApplied ? '#6d28d9' : (isExp || is30 ? '#dc2626' : is60 ? '#b45309' : '#1d4ed8') }}>
                          {item.till || '—'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenApplyModal(item)}
                          style={{
                            background: isApplied ? '#f5f3ff' : '#ede9fe',
                            color: '#6d28d9',
                            border: '1px solid #c4b5fd',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}
                          title={isApplied ? 'Update renewal application details' : 'Record that renewal application was submitted'}
                        >
                          <span>{isApplied ? '📝 Applied ✎' : '📝 Mark as Applied'}</span>
                        </button>
                        <Btn size="sm" variant="secondary" onClick={() => handleOpenEdit(item)}>
                          Update
                        </Btn>
                      </div>
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
                <option value="applied">⏳ Renewal Applied ({counts.applied || 0})</option>
                <option value="due">Due Soon ({counts.due})</option>
                <option value="ok">Valid ({counts.ok})</option>
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
              {!isEngineer && (
                <div style={{ marginTop: 16 }}>
                  <Btn variant="primary" onClick={handleOpenCreate}>
                    + Add First Lift
                  </Btn>
                </div>
              )}
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
                      onClick={() => handleSort('equipment_no')}
                      style={{
                        padding: '12px 16px',
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Equipment No. {sortKey === 'equipment_no' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
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
                    {!isEngineer && (
                      <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        Engineer / In-charge
                      </th>
                    )}
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLifts.map((item) => {
                    const isApplied = !!item.is_applied
                    const cfg = isApplied ? STATUS_CONFIG.applied : (STATUS_CONFIG[item.status] || STATUS_CONFIG.missing)
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

                        {/* Equipment No with Copy */}
                        <td style={{ padding: '14px 16px' }}>
                          {item.equipment_no ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  fontFamily: 'var(--font-mono, monospace)',
                                  fontWeight: 700,
                                  fontSize: 12,
                                  border: '1px solid #bae6fd',
                                }}
                              >
                                {item.equipment_no}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyNo(item.equipment_no, `eq-${item.id}`)}
                                title="Copy Equipment Number"
                                style={{
                                  border: 'none',
                                  background: copiedId === `eq-${item.id}` ? 'var(--green-800)' : 'transparent',
                                  color: copiedId === `eq-${item.id}` ? '#fff' : 'var(--text-3)',
                                  borderRadius: 4,
                                  padding: '2px 5px',
                                  fontSize: 10,
                                  cursor: 'pointer',
                                }}
                              >
                                {copiedId === `eq-${item.id}` ? '✓' : '⧉'}
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                          )}
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
                          {item.current_document?.pdf_url && (
                            <div style={{ marginTop: 4 }}>
                              <button
                                type="button"
                                onClick={() => window.open(generateImageUrl(item.current_document.pdf_url), '_blank')}
                                title="Quick view active PDF certificate"
                                style={{
                                  border: '1px solid #bbf7d0',
                                  background: '#f0fdf4',
                                  color: '#15803d',
                                  borderRadius: 4,
                                  padding: '2px 6px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                <span>📄 PDF</span>
                                <span>↗</span>
                              </button>
                            </div>
                          )}
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
                          <div style={{ fontSize: 11, color: isApplied ? '#6d28d9' : 'var(--text-3)', fontWeight: isApplied ? 600 : 400, marginTop: 3 }}>
                            {isApplied
                              ? `Applied: ${item.formatted_applied_date || item.applied_date || 'In Process'}${item.application_no ? ` (#${item.application_no})` : ''}`
                              : formatDaysLeft(item.days_remaining)}
                          </div>
                        </td>

                        {/* Engineer */}
                        {!isEngineer && (
                          <td style={{ padding: '14px 16px', color: 'var(--text-2)', fontSize: 12 }}>
                            {item.eng || 'Mr. Naveen Rai'}
                          </td>
                        )}

                        {/* Actions */}
                        <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenDocuments(item)}
                              title="Renewal Certificates & Document History"
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span>📄</span>
                              <span>Certificates</span>
                              {item.documents_count > 0 && (
                                <span
                                  style={{
                                    background: '#2563eb',
                                    color: '#fff',
                                    borderRadius: 10,
                                    padding: '1px 6px',
                                    fontSize: 10,
                                    fontWeight: 800,
                                  }}
                                >
                                  {item.documents_count}
                                </span>
                              )}
                            </button>
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
                            {!isEngineer && (
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
                            )}
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

            <Field label="Equipment Number" hint="Manufacturer / Equipment ID">
              <Input
                value={formValues.equipment_no}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    equipment_no: e.target.value.replace(/[^a-zA-Z0-9\/\-_.]/g, ''),
                  })
                }
                placeholder="e.g. 42198675 or AG615"
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: isEngineer ? '1fr' : '1fr 1fr', gap: 12 }}>
            {!isEngineer && (
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
            )}

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
      {/* ── Certificates & Renewal History Modal (Approach 1) ─────── */}
      <Modal
        open={docsModalOpen}
        onClose={() => setDocsModalOpen(false)}
        title="Lift Renewal Certificates & Document Archive"
        width={780}
      >
        {docsLift && (
          <div>
            {/* Lift Summary Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
                color: '#fff',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 16,
                boxShadow: '0 4px 12px rgba(6,78,59,0.15)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
                    🛗 {docsLift.lift}
                  </div>
                  <div style={{ fontSize: 13, color: '#a7f3d0', marginTop: 2 }}>
                    📍 {docsLift.loc} {docsLift.rem ? `• ${docsLift.rem}` : ''}
                  </div>
                </div>
                {/* Status badge */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(() => {
                    const cfg = STATUS_CONFIG[docsLift.status] || STATUS_CONFIG.missing
                    return (
                      <span
                        style={{
                          background: cfg.bg,
                          color: cfg.color,
                          border: `1px solid ${cfg.border}`,
                          padding: '4px 12px',
                          borderRadius: 999,
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        ● {cfg.label} ({formatDaysLeft(docsLift.days_remaining)})
                      </span>
                    )
                  })()}
                </div>
              </div>

              {/* Badges bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 12 }}>
                <span style={{ background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 6 }}>
                  <b>License:</b> {docsLift.no}
                </span>
                {docsLift.equipment_no && (
                  <span style={{ background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 6 }}>
                    <b>Equipment No:</b> {docsLift.equipment_no}
                  </span>
                )}
                {docsLift.prov && (
                  <span style={{ background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 6 }}>
                    <b>OEM:</b> {docsLift.prov}
                  </span>
                )}
                <span style={{ background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 6 }}>
                  <b>Valid:</b> {docsLift.frm || '—'} to {docsLift.till || '—'}
                </span>
              </div>
            </div>

            {/* Alerts */}
            {docsFeedback && <Alert type="success" message={docsFeedback} />}
            {docsError && <Alert type="error" message={docsError} />}

            {/* Modal Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                borderBottom: '2px solid var(--border)',
                marginBottom: 16,
                paddingBottom: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setDocsTab('list')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px 8px 0 0',
                  border: 'none',
                  background: docsTab === 'list' ? 'var(--green-800)' : 'transparent',
                  color: docsTab === 'list' ? '#fff' : 'var(--text-2)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>📜 Certificates & History</span>
                <span
                  style={{
                    background: docsTab === 'list' ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                    color: docsTab === 'list' ? '#fff' : 'var(--text)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {docsList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDocsTab('upload')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px 8px 0 0',
                  border: 'none',
                  background: docsTab === 'upload' ? 'var(--green-800)' : 'transparent',
                  color: docsTab === 'upload' ? '#fff' : 'var(--text-2)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📤 + Upload Certificate</span>
              </button>
            </div>

            {/* Tab 1: Certificate Timeline & Archive */}
            {docsTab === 'list' && (
              <div>
                {docsLoading && docsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30 }}>
                    <Spinner />
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-3)' }}>Loading certificates...</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Active Certificate Section */}
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#15803d',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>✓</span> Current Active Certificate
                      </div>

                      {activeDocument ? (
                        <div
                          style={{
                            background: '#f0fdf4',
                            border: '1.5px solid #86efac',
                            borderRadius: 12,
                            padding: '16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            boxShadow: '0 2px 8px rgba(34,197,94,0.08)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                              <div
                                style={{
                                  fontSize: 28,
                                  background: '#dcfce7',
                                  width: 46,
                                  height: 46,
                                  borderRadius: 10,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid #bbf7d0',
                                }}
                              >
                                📄
                              </div>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: '#166534' }}>
                                  {activeDocument.title || activeDocument.license_no || 'Active License Certificate'}
                                </div>
                                <div style={{ fontSize: 12, color: '#15803d', marginTop: 2, fontWeight: 600 }}>
                                  License No: <b>{activeDocument.license_no || docsLift.no}</b> • {activeDocument.file_name}
                                </div>
                                <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
                                  Validity: <b>{activeDocument.formatted_valid_from || '—'}</b> to{' '}
                                  <b style={{ color: '#166534' }}>{activeDocument.formatted_valid_till || '—'}</b>
                                  {activeDocument.uploaded_by && ` • Uploaded by ${activeDocument.uploaded_by}`}
                                </div>
                                {activeDocument.notes && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#374151',
                                      background: '#ffffff',
                                      border: '1px solid #d1fae5',
                                      borderRadius: 6,
                                      padding: '4px 8px',
                                      marginTop: 6,
                                      fontStyle: 'italic',
                                    }}
                                  >
                                    "{activeDocument.notes}"
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions for active document */}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => window.open(generateImageUrl(activeDocument.pdf_url), '_blank')}
                                style={{
                                  background: '#15803d',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '7px 14px',
                                  borderRadius: 7,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <span>👁️</span> Preview PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadDoc(activeDocument)}
                                style={{
                                  background: '#fff',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  padding: '7px 12px',
                                  borderRadius: 7,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                }}
                              >
                                <span>⬇️</span> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: '#fefce8',
                            border: '1px dashed #facc15',
                            borderRadius: 12,
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#854d0e' }}>
                              ⚠️ No Active PDF Certificate Attached
                            </div>
                            <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
                              Upload the current renewal certificate so engineers and safety inspectors can verify compliance directly.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleSwitchUploadMode('renewal')
                              setDocsTab('upload')
                            }}
                            style={{
                              background: '#ca8a04',
                              color: '#fff',
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            + Upload Active PDF
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Previous Certificates Timeline / History Archive */}
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text-2)',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>📁</span> Previous Certificates & Expired History ({archivedDocuments.length})
                      </div>

                      {archivedDocuments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {archivedDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              style={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border)',
                                borderRadius: 10,
                                padding: '12px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 10,
                              }}
                            >
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <span style={{ fontSize: 22, opacity: 0.8 }}>📑</span>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                      {doc.title || doc.license_no || 'Archived Certificate'}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 800,
                                        background: '#e2e8f0',
                                        color: '#475569',
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      ARCHIVED
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                    License: <b>{doc.license_no || docsLift.no}</b> • Validity:{' '}
                                    <b>{doc.formatted_valid_from || '—'}</b> to <b>{doc.formatted_valid_till || '—'}</b>
                                    {doc.uploaded_by && ` • ${doc.uploaded_by}`}
                                  </div>
                                  {doc.notes && (
                                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3, fontStyle: 'italic' }}>
                                      "{doc.notes}"
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => window.open(generateImageUrl(doc.pdf_url), '_blank')}
                                  title="Preview PDF"
                                  style={{
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  👁️ View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDoc(doc)}
                                  title="Download PDF"
                                  style={{
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ⬇️ Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetDocAsCurrent(doc)}
                                  title="Make this the current active certificate"
                                  style={{
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  🔄 Make Active
                                </button>
                                {!isEngineer && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDoc(doc)}
                                    title="Delete certificate permanently"
                                    style={{
                                      background: '#fff1f2',
                                      color: '#b91c1c',
                                      border: '1px solid #fecaca',
                                      padding: '5px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            background: 'var(--surface-2)',
                            borderRadius: 10,
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--text-3)',
                            fontSize: 12,
                            border: '1px dashed var(--border)',
                          }}
                        >
                          No previous expired certificates archived yet. When new renewal PDFs are uploaded over time, previous versions will be preserved here in chronological order.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Upload Certificate (New Renewal or Older Expired) */}
            {docsTab === 'upload' && (
              <form onSubmit={handleUploadDoc} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Upload Mode Selector */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    background: 'var(--surface-2)',
                    padding: 6,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 12,
                      borderRadius: 8,
                      background: docUploadMode === 'renewal' ? 'var(--surface)' : 'transparent',
                      border: docUploadMode === 'renewal' ? '2px solid var(--green-800)' : '1px solid transparent',
                      cursor: 'pointer',
                      boxShadow: docUploadMode === 'renewal' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="docUploadMode"
                        checked={docUploadMode === 'renewal'}
                        onChange={() => handleSwitchUploadMode('renewal')}
                      />
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                        🔄 New Renewal Certificate
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 24 }}>
                      Sets this as the <b>Active Certificate</b> and updates the lift's expiry date and compliance window in the register.
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 12,
                      borderRadius: 8,
                      background: docUploadMode === 'previous' ? 'var(--surface)' : 'transparent',
                      border: docUploadMode === 'previous' ? '2px solid var(--green-800)' : '1px solid transparent',
                      cursor: 'pointer',
                      boxShadow: docUploadMode === 'previous' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="docUploadMode"
                        checked={docUploadMode === 'previous'}
                        onChange={() => handleSwitchUploadMode('previous')}
                      />
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                        📁 Older / Previous Expired PDF
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 24 }}>
                      Archives a past certificate for historical records without changing the lift's current expiration date.
                    </span>
                  </label>
                </div>

                {/* PDF File Input */}
                <Field label="Certificate PDF File *" hint="Upload official state inspection / license certificate in PDF format">
                  <div
                    style={{
                      border: '2px dashed var(--border)',
                      borderRadius: 10,
                      padding: '16px 20px',
                      background: 'var(--surface)',
                      textAlign: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setSelectedDocFile(file)
                        if (file && !docFormValues.title) {
                          const base = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ')
                          setDocFormValues((prev) => ({ ...prev, title: base }))
                        }
                      }}
                    />
                    <div style={{ fontSize: 30, marginBottom: 4 }}>📄</div>
                    {selectedDocFile ? (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-900)' }}>
                          ✓ {selectedDocFile.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {(selectedDocFile.size / 1024).toFixed(1)} KB • Click to change file
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          Click or drag to select a PDF certificate
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          Max 20MB • PDF only (.pdf)
                        </div>
                      </div>
                    )}
                  </div>
                </Field>

                {/* Document Metadata Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Document Title / Version *" hint="e.g. Renewal 2025-2026 or Inspection 2023">
                    <Input
                      value={docFormValues.title}
                      onChange={(e) => setDocFormValues({ ...docFormValues, title: e.target.value })}
                      placeholder={docUploadMode === 'renewal' ? 'Renewal Certificate 2025-2026' : 'Previous Certificate 2023-2024'}
                      required
                    />
                  </Field>

                  <Field label="License Number" hint="Defaults to lift license number">
                    <Input
                      value={docFormValues.license_no}
                      onChange={(e) => setDocFormValues({ ...docFormValues, license_no: e.target.value })}
                      placeholder={docsLift.no}
                    />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Valid From" hint="License commencement date">
                    <Input
                      type="date"
                      value={docFormValues.valid_from}
                      onChange={(e) => setDocFormValues({ ...docFormValues, valid_from: e.target.value })}
                    />
                  </Field>

                  <Field label="Valid Till *" hint="Expiration date of this certificate">
                    <Input
                      type="date"
                      value={docFormValues.valid_till}
                      min={docFormValues.valid_from || undefined}
                      onChange={(e) => setDocFormValues({ ...docFormValues, valid_till: e.target.value })}
                      required
                    />
                  </Field>
                </div>

                {/* Checkboxes */}
                <div
                  style={{
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={docFormValues.is_current}
                      onChange={(e) =>
                        setDocFormValues({
                          ...docFormValues,
                          is_current: e.target.checked,
                          update_lift_dates: e.target.checked ? docFormValues.update_lift_dates : false,
                        })
                      }
                    />
                    <span>Set as current active certificate for this lift</span>
                  </label>

                  {docFormValues.is_current && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', paddingLeft: 24 }}>
                      <input
                        type="checkbox"
                        checked={docFormValues.update_lift_dates}
                        onChange={(e) => setDocFormValues({ ...docFormValues, update_lift_dates: e.target.checked })}
                      />
                      <span>Synchronize Valid From / Till dates with main lift compliance register</span>
                    </label>
                  )}
                </div>

                <Field label="Notes / Remarks (Optional)" hint="Inspector name, inspection fee receipt, conditions etc.">
                  <Input
                    value={docFormValues.notes}
                    onChange={(e) => setDocFormValues({ ...docFormValues, notes: e.target.value })}
                    placeholder="e.g. Approved by Inspector of Lifts, Gandhinagar zone."
                  />
                </Field>

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                  <Btn variant="secondary" onClick={() => setDocsTab('list')}>
                    Back to History
                  </Btn>
                  <Btn variant="primary" type="submit" disabled={uploadingDoc || !selectedDocFile}>
                    {uploadingDoc ? 'Uploading PDF...' : 'Upload & Save Certificate'}
                  </Btn>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      {/* ── Record Renewal Application Modal ───────────────────────── */}
      <Modal
        open={applyModalOpen}
        onClose={() => setApplyModalOpen(false)}
        title={applyLift?.is_applied ? 'Update Renewal Application' : 'Record Renewal Application (In Process)'}
        width={520}
      >
        {applyLift && (
          <form onSubmit={handleSaveApply} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {applyError && <Alert type="error" message={applyError} />}

            {/* Target Lift Details Banner */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                  {applyLift.lift}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {applyLift.loc} • License No: <b>{applyLift.no}</b>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Current Till</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: applyLift.status === 'expired' ? '#dc2626' : '#d97706' }}>
                  {applyLift.till || '—'}
                </div>
              </div>
            </div>

            {/* Explanatory Info Card */}
            <div
              style={{
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                color: '#5b21b6',
                lineHeight: 1.5,
              }}
            >
              <b>⚡ Renewal In-Process Notice:</b> Marking this lift as applied communicates that the renewal form / fee has been submitted to the government licensing authority. The critical red alert will transition to an informative purple <b>Renewal Applied</b> status.
            </div>

            {/* Applied Date Field */}
            <Field label="Application Submission Date *" hint="Date renewal form or challan was submitted">
              <Input
                type="date"
                value={applyFormValues.applied_date}
                onChange={(e) => setApplyFormValues({ ...applyFormValues, applied_date: e.target.value })}
                required
              />
            </Field>

            {/* Application / Challan Ref No */}
            <Field label="Application / Challan Reference Number" hint="Government ref no, challan receipt, or file acknowledgement">
              <Input
                value={applyFormValues.application_no}
                onChange={(e) => setApplyFormValues({ ...applyFormValues, application_no: e.target.value })}
                placeholder="e.g. GJ/GN/LIFT-RNW/2026/0492"
              />
            </Field>

            {/* Remarks / Notes */}
            <Field label="Remarks / Application Notes (Optional)" hint="e.g. Submitted by Mr. Naveen Rai, fee paid, inspector inspection pending">
              <Input
                value={applyFormValues.applied_notes}
                onChange={(e) => setApplyFormValues({ ...applyFormValues, applied_notes: e.target.value })}
                placeholder="e.g. Form submitted to Electrical Inspectorate; physical inspection awaited."
              />
            </Field>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div>
                {applyLift.is_applied && (
                  <button
                    type="button"
                    onClick={handleUnmarkApply}
                    disabled={savingApply}
                    style={{
                      border: '1px solid #fecaca',
                      background: '#fff1f2',
                      color: '#b91c1c',
                      borderRadius: 6,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ↩ Revert to Not Applied
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn variant="secondary" onClick={() => setApplyModalOpen(false)}>
                  Cancel
                </Btn>
                <Btn variant="primary" type="submit" disabled={savingApply} style={{ background: '#7c3aed', borderColor: '#6d28d9' }}>
                  {savingApply ? 'Saving...' : '✓ Save Application Status'}
                </Btn>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </AdminLayout>
  )
}
