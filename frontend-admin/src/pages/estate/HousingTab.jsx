import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { exportCsv, exportExcel, todayISO } from '../../shared/utils'
import { calcHousingExpiry, calcStayedDuration } from './utils'
import estateApi from '../../api/estate'
import HousingVacateModal from './HousingVacateModal'
import HousingEditorModal from './HousingEditorModal'
import HousingAllotModal from './HousingAllotModal'
import HousingAddHouseModal from './HousingAddHouseModal'
import HousingHistoryModal from './HousingHistoryModal'

export default function HousingTab({
  records = [],
  initialUnits = [],
  initialStays = [],
  onCreate,
  onPatch,
  onDelete,
  isReadOnly = false,
  onReload,
  onSwitchTab,
}) {
  const [activeSubTab, setActiveSubTab] = useState('register') // 'register' or 'log'
  const [units, setUnits] = useState(initialUnits && initialUnits.length > 0 ? initialUnits : [])
  const [allStays, setAllStays] = useState(initialStays && initialStays.length > 0 ? initialStays : [])
  const [loading, setLoading] = useState(initialUnits && initialUnits.length > 0 ? false : true)

  // Filters
  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedHouseFilter, setSelectedHouseFilter] = useState('all') // 'all', 'occupied', 'vacant', 'under_clearance', 'under_maintenance', 'expired', 'expiring_soon'
  const [isExpiryAlertsExpanded, setIsExpiryAlertsExpanded] = useState(false)
  const [expiryAlertFilter, setExpiryAlertFilter] = useState('all') // 'all', 'expired', 'expiring_soon'
  const [expiryAlertSearch, setExpiryAlertSearch] = useState('')

  // Modals
  const [isVacateOpen, setIsVacateOpen] = useState(false)
  const [vacateRecord, setVacateRecord] = useState(null)

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorRecord, setEditorRecord] = useState(null)

  const [isAllotOpen, setIsAllotOpen] = useState(false)
  const [allotTargetUnit, setAllotTargetUnit] = useState(null)

  const [isAddHouseOpen, setIsAddHouseOpen] = useState(false)

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState({ houseType: 'A', houseNo: '', unitId: null })

  // Download Dropdown State & Portal Positioning
  const [isDownloadOpen, setIsDownloadOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
  const downloadBtnRef = useRef(null)
  const downloadMenuRef = useRef(null)

  const handleToggleDownload = (e) => {
    e.stopPropagation()
    if (!isDownloadOpen && downloadBtnRef.current) {
      const rect = downloadBtnRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 5,
        right: Math.max(10, window.innerWidth - rect.right),
      })
    }
    setIsDownloadOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!isDownloadOpen) return
    const handleClickOutside = (e) => {
      if (
        downloadBtnRef.current &&
        !downloadBtnRef.current.contains(e.target) &&
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(e.target)
      ) {
        setIsDownloadOpen(false)
      }
    }
    const handleScrollOrResize = () => {
      setIsDownloadOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [isDownloadOpen])

  // Load all master units & all stay records
  const loadData = async (showLoading = false) => {
    if (showLoading || units.length === 0) {
      setLoading(true)
    }
    try {
      const [unitsRes, staysRes] = await Promise.all([
        estateApi.getHousingUnits(),
        estateApi.getHousing({ include_vacated: true }),
      ])
      setUnits(unitsRes.data || [])
      setAllStays(staysRes.data || [])
    } catch (err) {
      console.error('Failed to load housing data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialUnits && initialUnits.length > 0 && units.length === 0) {
      setUnits(initialUnits)
      setLoading(false)
    }
  }, [initialUnits])

  useEffect(() => {
    if (initialStays && initialStays.length > 0 && allStays.length === 0) {
      setAllStays(initialStays)
    }
  }, [initialStays])

  useEffect(() => {
    if (units.length === 0) {
      loadData(true)
    } else {
      loadData(false)
    }
  }, [])

  // Derived counts
  const occupiedUnits = useMemo(() => units.filter((u) => u.status === 'occupied'), [units])
  const clearanceUnits = useMemo(() => units.filter((u) => u.status === 'under_clearance'), [units])
  const vacantUnits = useMemo(() => units.filter((u) => u.status === 'vacant'), [units])
  const totalHousesCount = units.length
  const occupiedCount = occupiedUnits.length
  const clearanceCount = clearanceUnits.length
  const vacantCount = vacantUnits.length

  // Expiry alerts (30-day window)
  const expiryAlerts = useMemo(() => {
    const alerts = []
    occupiedUnits.forEach((u) => {
      const occ = u.currentOccupant
      if (!occ) return
      const expStatus = calcHousingExpiry(occ.dateOfExpiry, 30)
      if (expStatus && (expStatus.isExpired || expStatus.isExpiringSoon)) {
        alerts.push({
          unit: u,
          occupant: occ,
          label: `${u.houseNo} ${occ.occupantName}`,
          isExpired: Boolean(expStatus.isExpired),
          isExpiringSoon: Boolean(expStatus.isExpiringSoon),
          overdueDays: expStatus.overdueDays || 0,
          daysLeft: expStatus.daysLeft !== undefined ? expStatus.daysLeft : null,
          badgeText: expStatus.badgeText || (expStatus.isExpired ? 'Expired' : 'Expiring Soon'),
          dateOfExpiry: occ.dateOfExpiry || '—',
        })
      }
    })
    // Sort: expired first (highest overdue days first), then expiring soon (fewest days left first)
    alerts.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1
      if (!a.isExpired && b.isExpired) return 1
      if (a.isExpired && b.isExpired) return b.overdueDays - a.overdueDays
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999)
    })
    return alerts
  }, [occupiedUnits])

  const expiredCount = useMemo(() => expiryAlerts.filter((a) => a.isExpired).length, [expiryAlerts])
  const expiringSoonCount = useMemo(() => expiryAlerts.filter((a) => a.isExpiringSoon).length, [expiryAlerts])

  const displayedExpiryAlerts = useMemo(() => {
    return expiryAlerts.filter((a) => {
      if (expiryAlertFilter === 'expired' && !a.isExpired) return false
      if (expiryAlertFilter === 'expiring_soon' && !a.isExpiringSoon) return false
      if (expiryAlertSearch.trim()) {
        const q = expiryAlertSearch.trim().toLowerCase()
        const matchHouse = (a.unit.houseNo || '').toLowerCase().includes(q)
        const matchType = (a.unit.houseType || '').toLowerCase().includes(q)
        const matchName = (a.occupant.occupantName || '').toLowerCase().includes(q)
        const matchCode = (a.occupant.emplCode || '').toLowerCase().includes(q)
        const matchDesig = (a.occupant.designation || '').toLowerCase().includes(q)
        const matchExpiry = (a.dateOfExpiry || '').toLowerCase().includes(q)
        if (!matchHouse && !matchType && !matchName && !matchCode && !matchDesig && !matchExpiry) {
          return false
        }
      }
      return true
    })
  }, [expiryAlerts, expiryAlertFilter, expiryAlertSearch])

  // Filtered House Register
  const filteredRegister = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units.filter((u) => {
      // Type filter
      if (selectedType !== 'all') {
        if ((u.houseType || '').toUpperCase() !== selectedType.toUpperCase()) return false
      }

      // Status filter
      if (selectedHouseFilter === 'occupied' && u.status !== 'occupied') return false
      if (selectedHouseFilter === 'vacant' && u.status !== 'vacant') return false
      if (selectedHouseFilter === 'under_clearance' && u.status !== 'under_clearance') return false
      if (selectedHouseFilter === 'under_maintenance' && u.status !== 'under_maintenance') return false
      if (selectedHouseFilter === 'expired') {
        if (u.status !== 'occupied' || !u.currentOccupant) return false
        const exp = calcHousingExpiry(u.currentOccupant.dateOfExpiry, 30)
        if (!exp || !exp.isExpired) return false
      }
      if (selectedHouseFilter === 'expiring_soon') {
        if (u.status !== 'occupied' || !u.currentOccupant) return false
        const exp = calcHousingExpiry(u.currentOccupant.dateOfExpiry, 30)
        if (!exp || !exp.isExpiringSoon) return false
      }

      // Query search
      if (q) {
        const matchHouse = (u.houseNo || '').toLowerCase().includes(q)
        const matchType = (u.houseType || '').toLowerCase().includes(q)
        const matchOcc = (u.currentOccupant?.occupantName || '').toLowerCase().includes(q)
        const matchCode = (u.currentOccupant?.emplCode || '').toLowerCase().includes(q)
        const matchDesig = (u.currentOccupant?.designation || '').toLowerCase().includes(q)
        const matchEmail = (u.currentOccupant?.email || '').toLowerCase().includes(q)
        const matchLast = (u.lastOccupant?.occupantName || '').toLowerCase().includes(q)
        const matchClearance = (u.activeClearance?.allotteeName || '').toLowerCase().includes(q)

        if (!matchHouse && !matchType && !matchOcc && !matchCode && !matchDesig && !matchEmail && !matchLast && !matchClearance) {
          return false
        }
      }

      return true
    })
  }, [units, query, selectedType, selectedHouseFilter])

  // Filtered Occupancy Log
  const filteredOccupancyLog = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allStays.filter((stay) => {
      if (selectedType !== 'all') {
        if ((stay.houseType || '').toUpperCase() !== selectedType.toUpperCase()) return false
      }

      if (q) {
        const matchHouse = (stay.houseNo || '').toLowerCase().includes(q)
        const matchType = (stay.houseType || '').toLowerCase().includes(q)
        const matchName = (stay.occupantName || '').toLowerCase().includes(q)
        const matchCode = (stay.emplCode || '').toLowerCase().includes(q)
        const matchDesig = (stay.designation || '').toLowerCase().includes(q)
        const matchEmail = (stay.email || '').toLowerCase().includes(q)

        if (!matchHouse && !matchType && !matchName && !matchCode && !matchDesig && !matchEmail) {
          return false
        }
      }

      return true
    })
  }, [allStays, query, selectedType])

  // Filtered Vacant Units
  const filteredVacantUnits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vacantUnits.filter((u) => {
      if (selectedType !== 'all') {
        if ((u.houseType || '').toUpperCase() !== selectedType.toUpperCase()) return false
      }
      if (q) {
        const matchHouse = (u.houseNo || '').toLowerCase().includes(q)
        const matchType = (u.houseType || '').toLowerCase().includes(q)
        const matchBlock = (u.blockNo || '').toLowerCase().includes(q)
        const matchLast = (u.lastOccupant?.occupantName || '').toLowerCase().includes(q)
        if (!matchHouse && !matchType && !matchBlock && !matchLast) {
          return false
        }
      }
      return true
    })
  }, [vacantUnits, query, selectedType])

  const [pdfBusy, setPdfBusy] = useState(false)

  const handleDownloadVacantPdf = async () => {
    if (pdfBusy) return
    const el = document.getElementById('vacant-housing-pdf-template')
    if (!el) {
      alert('Template not ready for PDF export.')
      return
    }
    setPdfBusy(true)
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      await html2pdf()
        .set({
          margin: [15, 15, 15, 15],
          filename: `IITGN_Vacant_Housing_${selectedType === 'all' ? 'All_Types' : `Type_${selectedType}`}_${todayISO()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .save()
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try Print -> Save as PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  // Actions
  const handleOpenVacate = (allotment) => {
    setVacateRecord(allotment)
    setIsVacateOpen(true)
  }

  const handleOpenEdit = (allotment) => {
    setEditorRecord(allotment)
    setIsEditorOpen(true)
  }

  const handleOpenAllot = (unit = null) => {
    setAllotTargetUnit(unit)
    setIsAllotOpen(true)
  }

  const handleOpenHistory = (target) => {
    setHistoryTarget(target)
    setIsHistoryOpen(true)
  }

  const handleSuccessReload = () => {
    loadData()
    if (onReload) onReload()
  }

  // Universal Export Excel (.xlsx)
  const handleExportExcel = () => {
    if (activeSubTab === 'vacant') {
      const filename = `campus_vacant_houses_${todayISO()}.xlsx`
      const headers = ['SL#', 'HOUSE TYPE', 'HOUSE NO.', 'BLOCK / BUILDING']
      const rows = filteredVacantUnits.map((u, idx) => [
        idx + 1,
        u.houseType,
        u.houseNo,
        u.blockNo || '—',
      ])
      exportExcel(filename, headers, rows)
      return
    }
    if (activeSubTab === 'register') {
      const filename = `campus_house_register_${todayISO()}.xlsx`
      const headers = [
        'SL#',
        'HOUSE TYPE',
        'HOUSE NO.',
        "OCCUPANT'S NAME",
        'EMPL. CODE',
        'DESIGNATION',
        'EMAIL',
        'DATE OF OCCUPATION',
        'AL ISSUE ON',
        'DATE OF EXPIRY',
        'SIGNATURE',
      ]
      const rows = filteredRegister.map((u, idx) => {
        const isOcc = u.status === 'occupied'
        const occ = u.currentOccupant
        return [
          idx + 1,
          u.houseType,
          u.houseNo,
          isOcc ? (occ?.occupantName || '') : '',
          isOcc ? (occ?.emplCode || '') : '',
          isOcc ? (occ?.designation || '') : '',
          isOcc ? (occ?.email || '') : '',
          isOcc ? (occ?.dateOfOccupation || '') : '',
          isOcc ? (occ?.alIssueDate || '') : '',
          isOcc ? (occ?.dateOfExpiry || '') : '',
          '', // Signature blank line
        ]
      })
      exportExcel(filename, headers, rows)
    } else {
      const filename = `campus_occupancy_log_${todayISO()}.xlsx`
      const headers = [
        'HOUSE',
        "OCCUPANT'S NAME",
        'EMPL. CODE',
        'DESIGNATION',
        'DATE OF OCCUPATION',
        'DATE OF VACATION',
        'STAYED',
      ]
      const rows = filteredOccupancyLog.map((s) => [
        `${s.houseType} ${s.houseNo}`,
        s.occupantName || '',
        s.emplCode || '',
        s.designation || '',
        s.dateOfOccupation || '',
        s.isCurrent ? 'Present' : (s.dateOfVacation || ''),
        calcStayedDuration(s.dateOfOccupation, s.isCurrent ? null : s.dateOfVacation),
      ])
      exportExcel(filename, headers, rows)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0, maxWidth: '100%' }}>
      {/* Top Toolbar (Exact Single Line Match to Screenshot) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          gap: 8,
          background: '#ffffff',
          padding: '6px 10px',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 40,
        }}
      >
        {/* Left Pills & Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* House Register & Occupancy Log Pills */}
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('register')}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeSubTab === 'register' ? '#164e3f' : '#f1f5f9',
                color: activeSubTab === 'register' ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              House Register
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('log')}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeSubTab === 'log' ? '#164e3f' : '#f1f5f9',
                color: activeSubTab === 'log' ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Occupancy Log
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('vacant')}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeSubTab === 'vacant' ? '#164e3f' : '#f1f5f9',
                color: activeSubTab === 'vacant' ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Vacant Houses ({vacantCount})
            </button>
          </div>

          {/* Search Input (Compact) */}
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: 120,
              padding: '4px 8px',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
              fontSize: 11.5,
              background: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {/* House Types Dropdown */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '4px 6px',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
              fontSize: 11.5,
              background: '#ffffff',
              color: '#0f172a',
              fontFamily: 'inherit',
              outline: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <option value="all">All house types</option>
            {['A', 'B', 'C', 'D', 'E', 'F'].map((t) => (
              <option key={t} value={t}>
                Type {t}
              </option>
            ))}
          </select>

          {/* Register Status Dropdown (only on register) */}
          {activeSubTab === 'register' && (
            <select
              value={selectedHouseFilter}
              onChange={(e) => setSelectedHouseFilter(e.target.value)}
              style={{
                padding: '4px 6px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: 11.5,
                background: '#ffffff',
                color: '#0f172a',
                fontFamily: 'inherit',
                outline: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <option value="all">All houses ({totalHousesCount})</option>
              <option value="occupied">Occupied only ({occupiedCount})</option>
              <option value="vacant">Vacant only ({vacantCount})</option>
              {clearanceCount > 0 && (
                <option value="under_clearance">Under Clearance ({clearanceCount})</option>
              )}
              <option value="under_maintenance">Under Maintenance</option>
              {expiredCount > 0 && (
                <option value="expired">Expired Tenures ({expiredCount})</option>
              )}
              {expiringSoonCount > 0 && (
                <option value="expiring_soon">Expiring Soon 30d ({expiringSoonCount})</option>
              )}
            </select>
          )}
        </div>

        {/* Right Counters & Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>
            {loading && units.length === 0 ? (
              <span style={{ color: '#94a3b8' }}>Loading housing...</span>
            ) : (
              <>
                <strong>{occupiedCount}</strong> occupied · {clearanceCount > 0 && <span><strong style={{ color: '#1d4ed8' }}>{clearanceCount}</strong> in clearance · </span>}<strong>{vacantCount}</strong> vacant · <strong>{totalHousesCount}</strong> houses
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {/* Unified Download Dropdown with Portal */}
            <div>
              <button
                ref={downloadBtnRef}
                type="button"
                onClick={handleToggleDownload}
                disabled={pdfBusy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: isDownloadOpen ? '#f8fafc' : '#ffffff',
                  color: '#0f172a',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: pdfBusy ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{pdfBusy ? 'Generating PDF...' : 'Download'}</span>
                <span style={{ fontSize: 9, color: '#64748b' }}>▼</span>
              </button>

              {/* Portal-rendered Dropdown Menu */}
              {isDownloadOpen && createPortal(
                <div
                  ref={downloadMenuRef}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: dropdownPos.top,
                    right: dropdownPos.right,
                    minWidth: 205,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.12)',
                    padding: '4px',
                    zIndex: 999999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {/* PDF option ONLY when activeSubTab === 'vacant' */}
                  {activeSubTab === 'vacant' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIsDownloadOpen(false)
                        handleDownloadVacantPdf()
                      }}
                      disabled={pdfBusy}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        color: '#0f172a',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: pdfBusy ? 'not-allowed' : 'pointer',
                        borderRadius: 6,
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>Download as PDF (.pdf)</span>
                    </button>
                  )}

                  {/* Excel option always available */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsDownloadOpen(false)
                      handleExportExcel()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRadius: 6,
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>Download as Excel (.xlsx)</span>
                  </button>
                </div>,
                document.body
              )}
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setIsAddHouseOpen(true)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                + Add House
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Housing Expiry Alerts Collapsible Bar & Drawer */}
      {!loading && expiryAlerts.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Top Collapsible Header Bar */}
          <div
            onClick={() => setIsExpiryAlertsExpanded((prev) => !prev)}
            style={{
              background: isExpiryAlertsExpanded ? '#fff7ed' : '#fffaf5',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: isExpiryAlertsExpanded ? '1px solid #fed7aa' : 'none',
            }}
          >
            {/* Left: Icon, Title & Pill Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                !
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>
                  Tenure Expiry Alerts
                </span>
                <span style={{ fontSize: 11.5, color: '#78716c' }}>
                  (30-day window)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {expiredCount > 0 && (
                  <span
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                    {expiredCount} Expired
                  </span>
                )}
                {expiringSoonCount > 0 && (
                  <span
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      color: '#92400e',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
                    {expiringSoonCount} Expiring Soon
                  </span>
                )}
              </div>
            </div>

            {/* Right: Toggle Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600 }}>
                {isExpiryAlertsExpanded ? 'Hide Alerts' : `View Details (${expiryAlerts.length})`}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: '#b45309',
                  transition: 'transform 0.2s ease',
                  transform: isExpiryAlertsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ▼
              </span>
            </div>
          </div>

          {/* Expanded Drawer: Sub-filters, Search & Structured Table */}
          {isExpiryAlertsExpanded && (
            <div style={{ padding: '12px 16px', background: '#ffffff' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                {/* Filter Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpiryAlertFilter('all')
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: expiryAlertFilter === 'all' ? '1px solid #ea580c' : '1px solid #e2e8f0',
                      background: expiryAlertFilter === 'all' ? '#ea580c' : '#f8fafc',
                      color: expiryAlertFilter === 'all' ? '#ffffff' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    All ({expiryAlerts.length})
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpiryAlertFilter('expired')
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: expiryAlertFilter === 'expired' ? '1px solid #dc2626' : '1px solid #fee2e2',
                      background: expiryAlertFilter === 'expired' ? '#dc2626' : '#fef2f2',
                      color: expiryAlertFilter === 'expired' ? '#ffffff' : '#991b1b',
                      cursor: 'pointer',
                    }}
                  >
                    Expired ({expiredCount})
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpiryAlertFilter('expiring_soon')
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: expiryAlertFilter === 'expiring_soon' ? '1px solid #d97706' : '1px solid #fef3c7',
                      background: expiryAlertFilter === 'expiring_soon' ? '#d97706' : '#fffbeb',
                      color: expiryAlertFilter === 'expiring_soon' ? '#ffffff' : '#92400e',
                      cursor: 'pointer',
                    }}
                  >
                    Expiring Soon ({expiringSoonCount})
                  </button>
                </div>

                {/* Inner Quick Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Search alert by house, occupant, code..."
                    value={expiryAlertSearch}
                    onChange={(e) => setExpiryAlertSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 11.5,
                      width: 240,
                      outline: 'none',
                    }}
                  />
                  {expiryAlertSearch && (
                    <button
                      type="button"
                      onClick={() => setExpiryAlertSearch('')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: 0,
                      }}
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Structured Alerts Table with Scroll Container */}
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid #f1f5f9',
                  borderRadius: 6,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 10px', width: 40 }}>#</th>
                      <th style={{ padding: '6px 10px', width: 90 }}>House</th>
                      <th style={{ padding: '6px 10px' }}>Occupant</th>
                      <th style={{ padding: '6px 10px', width: 90 }}>Empl. Code</th>
                      <th style={{ padding: '6px 10px' }}>Tenure / Expiry Clause</th>
                      <th style={{ padding: '6px 10px', width: 140 }}>Alert Status</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', width: 100 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedExpiryAlerts.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                          No alerts matching this filter.
                        </td>
                      </tr>
                    ) : (
                      displayedExpiryAlerts.map((alert, idx) => {
                        const isExp = alert.isExpired
                        return (
                          <tr
                            key={alert.unit.id}
                            style={{
                              borderBottom: '1px solid #f8fafc',
                              background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                            }}
                          >
                            <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>
                              <span style={{ color: '#475569', fontWeight: 600, marginRight: 4 }}>
                                Type {alert.unit.houseType}
                              </span>
                              {alert.unit.houseNo}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{alert.occupant.occupantName}</div>
                              <div style={{ fontSize: 10.5, color: '#64748b' }}>{alert.occupant.designation || '—'}</div>
                            </td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#334155' }}>
                              {alert.occupant.emplCode || '—'}
                            </td>
                            <td style={{ padding: '6px 10px', color: '#475569' }}>
                              {alert.dateOfExpiry}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  background: isExp ? '#fef2f2' : '#fffbeb',
                                  color: isExp ? '#991b1b' : '#92400e',
                                  border: isExp ? '1px solid #fecaca' : '1px solid #fde68a',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {alert.badgeText || (isExp ? 'Expired' : 'Expiring Soon')}
                              </span>
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (activeSubTab !== 'register') {
                                    setActiveSubTab('register')
                                  }
                                  setSelectedType('all')
                                  setSelectedHouseFilter('all')
                                  setQuery(alert.unit.houseNo)
                                  setTimeout(() => {
                                    const row = document.getElementById(`house-row-${alert.unit.id}`)
                                    if (row) {
                                      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      row.dataset.highlighted = 'true'
                                      row.style.background = '#fef3c7'
                                      setTimeout(() => {
                                        delete row.dataset.highlighted
                                        row.style.background = 'transparent'
                                      }, 3000)
                                    }
                                  }, 200)
                                }}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#1e293b',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Filter and highlight this house in register"
                              >
                                Locate
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: House Register Table (Exact Match to Screenshots 1, 2, 5) */}
      {activeSubTab === 'register' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: 1200,
              borderCollapse: 'collapse',
              fontSize: 12.5,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '10px 12px', width: 44 }}>SL#</th>
                <th style={{ padding: '10px 10px', width: 80 }}>HOUSE TYPE</th>
                <th style={{ padding: '10px 12px', width: 90 }}>HOUSE NO.</th>
                <th style={{ padding: '10px 12px', width: 90 }}>STATUS</th>
                <th style={{ padding: '10px 14px' }}>OCCUPANT&apos;S NAME</th>
                <th style={{ padding: '10px 12px', width: 95 }}>EMPL. CODE</th>
                <th style={{ padding: '10px 14px' }}>DESIGNATION</th>
                <th style={{ padding: '10px 14px' }}>EMAIL</th>
                <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>DATE OF OCCUPATION</th>
                <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>AL ISSUE ON</th>
                <th style={{ padding: '10px 14px' }}>DATE OF EXPIRY</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 170 }}>ACTION</th>
                <th style={{ padding: '10px 14px', width: 100, textAlign: 'center' }}>SIGNATURE</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '50px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '3px solid #e2e8f0',
                          borderTopColor: '#164e3f',
                          animation: 'spin 0.7s linear infinite',
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                        Loading staff housing records...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredRegister.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
                    No houses found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRegister.map((u, idx) => {
                  const isOcc = u.status === 'occupied'
                  const occ = u.currentOccupant
                  const lastOcc = u.lastOccupant
                  const historyCount = u.allotmentCount || 0
                  const expiryInfo = isOcc && occ ? calcHousingExpiry(occ.dateOfExpiry, 30) : null

                  return (
                    <tr
                      key={u.id}
                      id={`house-row-${u.id}`}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.25s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.dataset.highlighted) {
                          e.currentTarget.style.background = '#f8fafc'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.dataset.highlighted) {
                          e.currentTarget.style.background = 'transparent'
                        }
                      }}
                    >
                      {/* SL# */}
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{idx + 1}</td>

                      {/* HOUSE TYPE */}
                      <td style={{ padding: '10px 10px', color: '#334155' }}>{u.houseType}</td>

                      {/* HOUSE NO. */}
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                        {u.houseNo}
                      </td>

                      {/* STATUS */}
                      <td style={{ padding: '10px 12px' }}>
                        {isOcc ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#dcfce7',
                              color: '#15803d',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Occupied
                          </span>
                        ) : u.status === 'under_clearance' ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 12,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: 11,
                                fontWeight: 700,
                                border: '1px solid #bfdbfe',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Under Clearance
                            </span>
                            {u.activeClearance?.priority && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  color: u.activeClearance.priority === '1' ? '#991b1b' : u.activeClearance.priority === '2' ? '#9a3412' : '#854d0e',
                                  background: u.activeClearance.priority === '1' ? '#fee2e2' : u.activeClearance.priority === '2' ? '#ffedd5' : '#fef9c3',
                                  padding: '1.5px 6px',
                                  borderRadius: 8,
                                  border: `1px solid ${u.activeClearance.priority === '1' ? '#fca5a5' : u.activeClearance.priority === '2' ? '#fdba74' : '#fde047'}`,
                                }}
                              >
                                P{u.activeClearance.priority} · {u.activeClearance.priority === '1' ? 'Top' : u.activeClearance.priority === '2' ? 'High' : 'Normal'} Priority
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 12,
                                background: '#fef3c7',
                                color: '#b45309',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              Vacant
                            </span>
                            {lastOcc?.dateOfVacation && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                since {lastOcc.dateOfVacation}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* OCCUPANT'S NAME */}
                      <td style={{ padding: '10px 14px' }}>
                        {isOcc && occ ? (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit({ ...occ, houseType: u.houseType, houseNo: u.houseNo })}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0f172a',
                              fontWeight: 700,
                              fontSize: 12.5,
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline dotted',
                              textAlign: 'left',
                            }}
                          >
                            {occ.occupantName}
                          </button>
                        ) : u.status === 'under_clearance' ? (
                          <div>
                            <span style={{ fontWeight: 700, color: '#1e40af' }}>
                              {u.activeClearance?.allotteeName || 'Earmarked Allottee'}
                            </span>
                            <div style={{ fontSize: 10.5, color: '#64748b', fontStyle: 'italic', marginTop: 1 }}>
                              Clearance in Progress
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>

                      {/* EMPL. CODE */}
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {isOcc ? (occ?.emplCode || '—') : ''}
                      </td>

                      {/* DESIGNATION */}
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {isOcc ? (occ?.designation || '—') : ''}
                      </td>

                      {/* EMAIL */}
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {isOcc ? (occ?.email || '—') : ''}
                      </td>

                      {/* DATE OF OCCUPATION */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                        {isOcc ? (occ?.dateOfOccupation || '—') : ''}
                      </td>

                      {/* AL ISSUE ON */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#475569' }}>
                        {isOcc ? (occ?.alIssueDate || '—') : ''}
                      </td>

                      {/* DATE OF EXPIRY */}
                      <td style={{ padding: '10px 14px' }}>
                        {isOcc && occ ? (
                          <div>
                            <div style={{ color: '#334155' }}>{occ.dateOfExpiry || '—'}</div>
                            {expiryInfo?.isExpired && (
                              <div
                                style={{
                                  display: 'inline-block',
                                  marginTop: 3,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                {expiryInfo.badgeText}
                              </div>
                            )}
                            {expiryInfo?.isExpiringSoon && (
                              <div
                                style={{
                                  display: 'inline-block',
                                  marginTop: 3,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: '#fffbeb',
                                  color: '#d97706',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                {expiryInfo.badgeText}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </td>

                      {/* ACTION BUTTONS (Exact Match to Screenshot) */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {isOcc && occ ? (
                            <>
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenVacate({
                                      id: occ.id,
                                      occupantName: occ.occupantName,
                                      houseType: u.houseType,
                                      houseNo: u.houseNo,
                                    })
                                  }
                                  style={{
                                    padding: '3px 12px',
                                    borderRadius: 14,
                                    border: 'none',
                                    background: '#9a3412',
                                    color: '#ffffff',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Vacate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenHistory({ houseType: u.houseType, houseNo: u.houseNo, unitId: u.id })}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 14,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#0f172a',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                History {historyCount > 0 ? `(${historyCount})` : ''}
                              </button>
                            </>
                          ) : u.status === 'under_clearance' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onSwitchTab ? onSwitchTab('housing_status') : null}
                                title="View clearance workflow in Housing Status pipeline"
                                style={{
                                  padding: '3px 12px',
                                  borderRadius: 14,
                                  border: '1px solid #bfdbfe',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Track Pipeline
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenHistory({ houseType: u.houseType, houseNo: u.houseNo, unitId: u.id })}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 14,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#0f172a',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                History {historyCount > 0 ? `(${historyCount})` : ''}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenHistory({ houseType: u.houseType, houseNo: u.houseNo, unitId: u.id })}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 14,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#0f172a',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                History {historyCount > 0 ? `(${historyCount})` : ''}
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* SIGNATURE (Dashed Placeholder) */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#cbd5e1', letterSpacing: 2 }}>
                        -----------
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 2: Occupancy Log Table (Exact Match to Last Screenshot) */}
      {activeSubTab === 'log' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: 980,
              borderCollapse: 'collapse',
              fontSize: 12.5,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '10px 14px', width: 100 }}>HOUSE</th>
                <th style={{ padding: '10px 14px' }}>OCCUPANT&apos;S NAME</th>
                <th style={{ padding: '10px 12px', width: 100 }}>EMPL. CODE</th>
                <th style={{ padding: '10px 14px' }}>DESIGNATION</th>
                <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>DATE OF OCCUPATION</th>
                <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>DATE OF VACATION</th>
                <th style={{ padding: '10px 12px', width: 90 }}>STAYED</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', width: 80 }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '50px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '3px solid #e2e8f0',
                          borderTopColor: '#164e3f',
                          animation: 'spin 0.7s linear infinite',
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                        Loading occupancy history log...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredOccupancyLog.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
                    No stays found in the occupancy log.
                  </td>
                </tr>
              ) : (
                filteredOccupancyLog.map((stay) => {
                  const isCurrent = stay.isCurrent
                  const stayedDuration = calcStayedDuration(
                    stay.dateOfOccupation,
                    isCurrent ? null : stay.dateOfVacation
                  )

                  return (
                    <tr
                      key={stay.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* HOUSE */}
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                        {stay.houseType} {stay.houseNo}
                      </td>

                      {/* OCCUPANT'S NAME */}
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                        {stay.occupantName}
                      </td>

                      {/* EMPL. CODE */}
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {stay.emplCode || '—'}
                      </td>

                      {/* DESIGNATION */}
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {stay.designation || '—'}
                      </td>

                      {/* DATE OF OCCUPATION */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                        {stay.dateOfOccupation || '—'}
                      </td>

                      {/* DATE OF VACATION */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {isCurrent ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#dcfce7',
                              color: '#15803d',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Present
                          </span>
                        ) : (
                          <span style={{ color: '#334155' }}>{stay.dateOfVacation || '—'}</span>
                        )}
                      </td>

                      {/* STAYED */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155' }}>
                        {stayedDuration || '—'}
                      </td>

                      {/* ACTION */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(stay)}
                          style={{
                            padding: '3px 12px',
                            borderRadius: 14,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 3: Vacant Houses Table */}
      {activeSubTab === 'vacant' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: 900,
              borderCollapse: 'collapse',
              fontSize: 12.5,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: '#f8fafc',
                }}
              >
                <th style={{ padding: '10px 12px', width: 50 }}>SL#</th>
                <th style={{ padding: '10px 12px', width: 100 }}>HOUSE TYPE</th>
                <th style={{ padding: '10px 12px', width: 110 }}>HOUSE NO.</th>
                <th style={{ padding: '10px 14px' }}>BLOCK / BUILDING</th>
                <th style={{ padding: '10px 14px' }}>STATUS</th>
                <th style={{ padding: '10px 14px' }}>LAST OCCUPANT</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 160 }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '3px solid #e2e8f0',
                          borderTopColor: '#164e3f',
                          animation: 'spin 0.7s linear infinite',
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                        Loading vacant houses...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredVacantUnits.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '60px 16px', color: '#64748b' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      No vacant houses found matching filters
                    </div>
                    <div style={{ fontSize: 12 }}>
                      Try selecting &quot;All house types&quot; or clearing your search.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVacantUnits.map((u, idx) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#94a3b8' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#f1f5f9',
                          fontWeight: 700,
                          fontSize: 11.5,
                          color: '#1e293b',
                        }}
                      >
                        Type {u.houseType}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--green-900)' }}>
                      {u.houseNo}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 500 }}>
                      {u.blockNo ? `Block ${u.blockNo}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: '#dcfce7',
                          color: '#166534',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Vacant (Available)
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>
                      {u.lastOccupant ? (
                        <>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{u.lastOccupant.occupantName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Vacated: {u.lastOccupant.dateOfVacation || '—'}</div>
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Never occupied</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleOpenHistory({ houseType: u.houseType, houseNo: u.houseNo, unitId: u.id })}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 14,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden PDF Printable Template */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div
          id="vacant-housing-pdf-template"
          style={{
            width: '750px',
            fontFamily: 'Helvetica, Arial, sans-serif',
            color: '#1e293b',
            background: '#ffffff',
            padding: '24px 28px',
            lineHeight: 1.4,
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f766e', paddingBottom: 12, marginBottom: 16, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, margin: 0, color: '#0f766e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Indian Institute of Technology Gandhinagar
            </h2>
            <div style={{ fontSize: 13, color: '#334155', fontWeight: 600, marginTop: 4 }}>
              Estate Office — Available Vacant Staff Housing List
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#64748b' }}>
              <span>Generated on: <strong>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
              <span>Filter: <strong>{selectedType === 'all' ? 'All House Types' : `Type ${selectedType}`}</strong></span>
              <span>Total Available: <strong>{filteredVacantUnits.length} Vacant Units</strong></span>
            </div>
          </div>

          {/* Description for candidate */}
          <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 14, fontSize: 11, color: '#475569' }}>
            <strong>Note for Prospective Allottees:</strong> Below is the verified list of currently available vacant staff housing units. Please review the available units and submit your prioritized preference to the Estate Office.
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#1e293b', fontWeight: 700 }}>
                <th style={{ padding: '6px 8px', width: 40 }}>SL#</th>
                <th style={{ padding: '6px 10px' }}>HOUSE TYPE</th>
                <th style={{ padding: '6px 12px' }}>HOUSE NO.</th>
                <th style={{ padding: '6px 12px' }}>BLOCK / BUILDING</th>
              </tr>
            </thead>
            <tbody>
              {filteredVacantUnits.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '5px 8px', color: '#64748b' }}>{i + 1}</td>
                  <td style={{ padding: '5px 10px', fontWeight: 700 }}>Type {u.houseType}</td>
                  <td style={{ padding: '5px 12px', fontWeight: 700, color: '#0f766e' }}>{u.houseNo}</td>
                  <td style={{ padding: '5px 12px' }}>{u.blockNo ? `Block ${u.blockNo}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
            <span>IIT Gandhinagar Estate Office Management System</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </div>

      {/* MODAL 1: Mark house as vacated Modal */}
      <HousingVacateModal
        isOpen={isVacateOpen}
        onClose={() => {
          setIsVacateOpen(false)
          setVacateRecord(null)
        }}
        record={vacateRecord}
        onSuccess={handleSuccessReload}
      />

      {/* MODAL 2: Edit Housing Record Modal */}
      <HousingEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false)
          setEditorRecord(null)
        }}
        record={editorRecord}
        allUnits={units}
        onSave={async (formData) => {
          if (editorRecord && editorRecord.id) {
            await onPatch(editorRecord.id, formData)
          }
        }}
        onDelete={onDelete}
        onOpenHistory={(target) => {
          setIsEditorOpen(false)
          handleOpenHistory(target)
        }}
        onSuccess={handleSuccessReload}
        isReadOnly={isReadOnly}
      />

      {/* MODAL 3: Allot House Modal */}
      <HousingAllotModal
        isOpen={isAllotOpen}
        onClose={() => {
          setIsAllotOpen(false)
          setAllotTargetUnit(null)
        }}
        preselectedUnit={allotTargetUnit}
        vacantUnits={vacantUnits}
        allUnits={units}
        onSuccess={handleSuccessReload}
      />

      {/* MODAL 4: Add House to list Modal */}
      <HousingAddHouseModal
        isOpen={isAddHouseOpen}
        onClose={() => setIsAddHouseOpen(false)}
        onSuccess={handleSuccessReload}
      />

      {/* MODAL 5: House history Modal */}
      <HousingHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => {
          setIsHistoryOpen(false)
          setHistoryTarget({ houseType: 'A', houseNo: '', unitId: null })
        }}
        houseType={historyTarget.houseType}
        houseNo={historyTarget.houseNo}
        unitId={historyTarget.unitId}
        onOpenRecord={(stay) => {
          setIsHistoryOpen(false)
          handleOpenEdit(stay)
        }}
        onAddEarlierRecord={(target) => {
          setIsHistoryOpen(false)
          handleOpenAllot(target)
        }}
        isReadOnly={isReadOnly}
      />
    </div>
  )
}
