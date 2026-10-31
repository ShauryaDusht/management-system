import React, { useState, useEffect, useMemo, useCallback } from 'react'
import SubstationApi from './substationApi'
import ExportDropdown from '../../components/ui/ExportDropdown'

// Helper for Indian Currency / Number formatting (e.g., 1,50,48,480.00)
function fmtNum(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return '0.00'
  const num = Number(val)
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtCurrency(val, decimals = 2) {
  return `₹ ${fmtNum(val, decimals)}`
}

export default function TorrentBillReport({ user, authUser, isSupervisor = true, isAdmin = false }) {
  // Super Admin Check: Contract Demand changes on utility load increase are strictly Super Admin only
  const isSuperAdmin = useMemo(() => {
    return Boolean(
      authUser?.is_superuser ||
      authUser?.is_admin ||
      authUser?.role === 'admin' ||
      user?.role === 'admin'
    )
  }, [authUser, user])

  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Super Admin Dedicated Contract Demand Update Modal State
  const [demandModalOpen, setDemandModalOpen] = useState(false)
  const [demandForm, setDemandForm] = useState({
    month: '',
    contractDemandKw: 3200,
    remarks: '',
    applyFuture: true,
  })
  const [demandSaving, setDemandSaving] = useState(false)
  const [demandError, setDemandError] = useState(null)
  const [demandSuccessMsg, setDemandSuccessMsg] = useState(null)

  // Current active billing month selected in the report view
  const [selectedMonth, setSelectedMonth] = useState('2026-09')

  // Modal State for Add / Edit Bill
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Form Fields State
  const initialFormState = {
    month: new Date().toISOString().slice(0, 7),
    billDate: '',
    readingDate: '',
    dueDate: '',
    distributionDate: '',
    billNo: '',
    customerId: '100164311',
    tariff: 'HTMD1',
    panNo: 'AAAT17352M',
    contractDemandKw: 3200.0,
    billingDemandKw: 0,
    multiplier: 2500.0,

    // Meter readings
    kwPresent: 0,
    kwPast: 0,
    kwhPresent: 0,
    kwhPast: 0,
    touKwhPresent: 0,
    touKwhPast: 0,
    kvahPresent: 0,
    kvahPast: 0,
    slrtPresent: 0,
    slrtPast: 0,

    // Financial components
    totalBillAmount: 0,
    netEnergyCharges: 0,
    fppasCharges: 0,
    demandCharges: 0,
    electricityDuty: 0,
    otherCharges: 0,

    // Security & past payment
    securityDepositHeld: 15106279.0,
    additionalSecurityRequired: 3172600.0,
    previousPaymentAmount: 0,
    previousPaymentDate: '',

    // Substation internal audit
    internalLoggedKwh: 0,
    status: 'Verified',
    remarks: '',
  }

  const [formData, setFormData] = useState(initialFormState)

  // Load all bills from backend
  const loadBills = useCallback(async () => {
    try {
      setLoading(true)
      const data = await SubstationApi.getTorrentBills()
      const list = Array.isArray(data) ? data : []
      setBills(list)
      if (list.length > 0) {
        // If current selected month is not in list, select the latest month
        if (!list.some((b) => b.month === selectedMonth)) {
          setSelectedMonth(list[0].month)
        }
      }
      setError(null)
    } catch (err) {
      console.warn('Failed to load Torrent bills:', err)
      setError('Failed to load Torrent Power billing records from substation server.')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    loadBills()
  }, [])

  // Currently displayed bill object
  const currentBill = useMemo(() => {
    if (!bills || bills.length === 0) return null
    return bills.find((b) => b.month === selectedMonth) || bills[0]
  }, [bills, selectedMonth])

  // Open modal to add a brand new bill
  const handleOpenAddModal = () => {
    // Default to next month if available, or current month
    const existingMonths = bills.map((b) => b.month).sort()
    let nextMonth = new Date().toISOString().slice(0, 7)
    if (existingMonths.length > 0) {
      const lastMonth = existingMonths[existingMonths.length - 1]
      const [y, m] = lastMonth.split('-').map(Number)
      const d = new Date(y, m, 1) // next month
      nextMonth = d.toISOString().slice(0, 7)
    }

    // Prefill past readings with the latest bill's present readings
    const latest = bills[0]
    setFormData({
      ...initialFormState,
      month: nextMonth,
      contractDemandKw: latest?.contractDemandKw || 3200.0,
      billingDemandKw: 0,
      kwPast: 0,
      kwhPast: latest?.kwhPresent || 0,
      touKwhPast: latest?.touKwhPresent || 0,
      kvahPast: latest?.kvahPresent || 0,
      slrtPast: latest?.slrtPresent || 0,
      status: 'Pending',
    })
    setEditMode(false)
    setIsModalOpen(true)
  }

  // Open modal to edit selected bill
  const handleOpenEditModal = (b = currentBill) => {
    if (!b) return
    setFormData({
      month: b.month || '',
      billDate: b.billDate || '',
      readingDate: b.readingDate || '',
      dueDate: b.dueDate || '',
      distributionDate: b.distributionDate || '',
      billNo: b.billNo || '',
      customerId: b.customerId || '100164311',
      tariff: b.tariff || 'HTMD1',
      panNo: b.panNo || 'AAAT17352M',
      contractDemandKw: b.contractDemandKw || 3200.0,
      billingDemandKw: b.billingDemandKw || 0,
      multiplier: b.multiplier || 2500.0,

      kwPresent: b.kwPresent || 0,
      kwPast: b.kwPast || 0,
      kwhPresent: b.kwhPresent || 0,
      kwhPast: b.kwhPast || 0,
      touKwhPresent: b.touKwhPresent || 0,
      touKwhPast: b.touKwhPast || 0,
      kvahPresent: b.kvahPresent || 0,
      kvahPast: b.kvahPast || 0,
      slrtPresent: b.slrtPresent || 0,
      slrtPast: b.slrtPast || 0,

      totalBillAmount: b.totalBillAmount || 0,
      netEnergyCharges: b.netEnergyCharges || 0,
      fppasCharges: b.fppasCharges || 0,
      demandCharges: b.demandCharges || 0,
      electricityDuty: b.electricityDuty || 0,
      otherCharges: b.otherCharges || 0,

      securityDepositHeld: b.securityDepositHeld || 15106279.0,
      additionalSecurityRequired: b.additionalSecurityRequired || 3172600.0,
      previousPaymentAmount: b.previousPaymentAmount || 0,
      previousPaymentDate: b.previousPaymentDate || '',

      internalLoggedKwh: b.internalLoggedKwh || 0,
      status: b.status || 'Verified',
      remarks: b.remarks || '',
    })
    setEditMode(true)
    setIsModalOpen(true)
  }

  // Super Admin: Open Demand Update Modal
  const handleOpenDemandModal = (b = currentBill) => {
    if (!b) return
    setDemandForm({
      month: b.month || selectedMonth,
      contractDemandKw: b.contractDemandKw || 3200,
      remarks: '',
      applyFuture: true,
    })
    setDemandError(null)
    setDemandSuccessMsg(null)
    setDemandModalOpen(true)
  }

  // Super Admin: Save Sanctioned Contract Demand
  const handleSaveDemand = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!isSuperAdmin) {
      setDemandError('Permission Denied: Only Super Admin can modify Sanctioned Contract Demand.')
      return
    }
    const kw = Number(demandForm.contractDemandKw)
    if (!kw || kw <= 0) {
      setDemandError('Please enter a valid positive Contract Demand in KW (e.g. 3500).')
      return
    }

    try {
      setDemandSaving(true)
      setDemandError(null)
      const res = await SubstationApi.updateContractDemand(demandForm.month, {
        contractDemandKw: kw,
        remarks: demandForm.remarks,
        applyFuture: demandForm.applyFuture,
      })

      // Update local state immediately for fast response
      setBills((prev) =>
        prev.map((bill) => {
          if (bill.month === demandForm.month) {
            return { ...bill, contractDemandKw: kw, ...(res?.bill || {}) }
          }
          if (demandForm.applyFuture && bill.month > demandForm.month) {
            return { ...bill, contractDemandKw: kw }
          }
          return bill
        })
      )

      setDemandSuccessMsg(res?.message || `Sanctioned Contract Demand updated to ${kw} KW successfully.`)
      setTimeout(() => {
        setDemandSuccessMsg(null)
        setDemandModalOpen(false)
        loadBills()
      }, 1200)
    } catch (err) {
      console.warn('Failed to update contract demand:', err)
      const msg = err?.response?.data?.error || err.message || 'Failed to update Sanctioned Contract Demand.'
      setDemandError(msg)
    } finally {
      setDemandSaving(false)
    }
  }

  // Live calculations for the form modal
  const formCalculations = useMemo(() => {
    const mult = Number(formData.multiplier) || 2500.0

    const kwConsumed = Math.round((Number(formData.kwPresent) - Number(formData.kwPast || 0)) * mult * 100) / 100
    const kwhDiff = Math.max(0, Number(formData.kwhPresent) - Number(formData.kwhPast))
    const kwhConsumed = Math.round(kwhDiff * mult * 100) / 100

    const touDiff = Math.max(0, Number(formData.touKwhPresent) - Number(formData.touKwhPast))
    const touConsumed = Math.round(touDiff * mult * 100) / 100

    const kvahDiff = Math.max(0, Number(formData.kvahPresent) - Number(formData.kvahPast))
    const kvahConsumed = Math.round(kvahDiff * mult * 100) / 100

    const slrtDiff = Math.max(0, Number(formData.slrtPresent) - Number(formData.slrtPast))
    const slrtConsumed = Math.round(slrtDiff * mult * 100) / 100

    const pf = kvahConsumed > 0 ? Math.min(100.0, Math.round((kwhConsumed / kvahConsumed) * 10000) / 100) : 100.0
    const touRatio = kwhConsumed > 0 ? Math.round((touConsumed / kwhConsumed) * 10000) / 100 : 0.0

    const varianceKwh = formData.internalLoggedKwh > 0 ? Math.round((kwhConsumed - Number(formData.internalLoggedKwh)) * 100) / 100 : 0
    const variancePct = formData.internalLoggedKwh > 0 ? Math.round((varianceKwh / Number(formData.internalLoggedKwh)) * 10000) / 100 : 0

    return {
      kwConsumed,
      kwhDiff,
      kwhConsumed,
      touDiff,
      touConsumed,
      kvahDiff,
      kvahConsumed,
      slrtDiff,
      slrtConsumed,
      pf,
      touRatio,
      varianceKwh,
      variancePct,
    }
  }, [formData])

  // Save / Update Bill handler
  const handleSaveBill = async (e) => {
    e.preventDefault()
    if (!formData.month) {
      alert('Please enter a valid billing month (YYYY-MM)')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const payload = {
        ...formData,
        contractDemandKw: isSuperAdmin
          ? (formData.contractDemandKw || 3200.0)
          : (currentBill?.contractDemandKw || formData.contractDemandKw || 3200.0),
        by: user?.name || user?.username || 'Electrical Engineer',
      }

      await SubstationApi.saveTorrentBill(payload)

      setSuccessMsg(`Torrent Power Bill for ${formData.month} successfully ${editMode ? 'updated' : 'recorded'}!`)
      setTimeout(() => setSuccessMsg(null), 5000)
      setIsModalOpen(false)
      setSelectedMonth(formData.month)
      await loadBills()
    } catch (err) {
      console.error('Error saving Torrent bill:', err)
      setError(err?.response?.data?.error || err.message || 'Failed to save Torrent bill.')
    } finally {
      setSaving(false)
    }
  }

  // Delete bill handler
  const handleDeleteBill = async (monthToDelete) => {
    if (!window.confirm(`Are you sure you want to delete the Torrent Power bill for ${monthToDelete}?`)) {
      return
    }

    try {
      await SubstationApi.deleteTorrentBill(monthToDelete)
      setSuccessMsg(`Deleted bill record for ${monthToDelete}`)
      setTimeout(() => setSuccessMsg(null), 4000)
      await loadBills()
    } catch (err) {
      alert(err.message || 'Failed to delete bill record.')
    }
  }

  // Export handlers
  const handleExportCsv = () => {
    if (!bills || bills.length === 0) return
    const headers = [
      'Billing Month',
      'Bill Date',
      'Reading Date',
      'Due Date',
      'Contract Demand (KW)',
      'Billing Demand (KW)',
      'Active Energy KWH Consumed',
      'Peak TOU KWH Consumed',
      'Apparent KVAH Consumed',
      'Average Power Factor (%)',
      'Energy Charges (Rs)',
      'FPPAS Fuel Charges (Rs)',
      'Demand / Other Charges (Rs)',
      'Total Payable Bill (Rs)',
      'Security Deposit Held (Rs)',
      'Substation Internal Logged KWH',
      'Variance KWH',
      'Variance %',
      'Status',
    ]

    const rows = bills.map((b) => [
      b.month,
      b.billDate || '-',
      b.readingDate || '-',
      b.dueDate || '-',
      b.contractDemandKw || 3200,
      b.billingDemandKw || 0,
      b.kwhConsumed || 0,
      b.touKwhConsumed || 0,
      b.kvahConsumed || 0,
      b.avgPowerFactor || 100,
      b.netEnergyCharges || 0,
      b.fppasCharges || 0,
      (b.demandCharges || 0) + (b.electricityDuty || 0) + (b.otherCharges || 0),
      b.totalBillAmount || 0,
      b.securityDepositHeld || 0,
      b.internalLoggedKwh || 0,
      b.varianceKwh || 0,
      b.variancePct ? `${b.variancePct}%` : '0%',
      b.status || '-',
    ])

    SubstationApi.exportCsv(`Torrent_Power_Bills_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows])
  }

  const handleExportPdf = () => {
    if (!bills || bills.length === 0) return
    const headers = [
      'Month',
      'Bill Date',
      'Billed Demand',
      'Consumed KWH',
      'TOU Peak',
      'Power Factor',
      'Energy Charges',
      'FPPAS',
      'Total Bill (₹)',
      'Status',
    ]
    const rows = bills.map((b) => [
      b.month,
      b.billDate || '-',
      `${fmtNum(b.billingDemandKw, 1)} KW`,
      fmtNum(b.kwhConsumed, 0),
      fmtNum(b.touKwhConsumed, 0),
      `${b.avgPowerFactor}%`,
      fmtCurrency(b.netEnergyCharges, 2),
      fmtCurrency(b.fppasCharges, 2),
      fmtCurrency(b.totalBillAmount, 2),
      b.status || '-',
    ])

    SubstationApi.exportPdf(
      `Torrent_Power_Bills_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      [headers, ...rows],
      'TORRENT POWER HTMD1 ELECTRICITY BILL AUDIT REPORT (IIT GANDHINAGAR)'
    )
  }

  // Historical aggregations & trends
  const trendData = useMemo(() => {
    // Sort chronological: oldest first for chart
    return [...bills]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({
        month: b.month,
        shortMonth: b.month.slice(5),
        kwh: b.kwhConsumed || 0,
        demand: b.billingDemandKw || 0,
        pf: b.avgPowerFactor || 100,
        touRatio: b.touRatioPct || (b.kwhConsumed ? Math.round(((b.touKwhConsumed || 0) / b.kwhConsumed) * 100) : 32.8),
        totalBill: b.totalBillAmount || 0,
      }))
  }, [bills])

  return (
    <div className="torrent-bill-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Alert Banners */}
      {successMsg && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 8,
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            color: '#065f46',
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Top Main Official Identity Header */}
      <div
        className="card"
        style={{
          borderLeft: '6px solid #00843D',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%, #eff6ff 100%)',
          padding: '20px 24px',
          boxShadow: '0 4px 16px rgba(0, 132, 61, 0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          {/* Logo & Institute Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #00843D 0%, #004F9F 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 900,
                boxShadow: '0 4px 10px rgba(0, 79, 159, 0.25)',
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: '#00843D',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.8px',
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}
                >
                  TORRENT POWER
                </span>
                <span
                  style={{
                    background: '#004F9F',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}
                >
                  TARIFF: HTMD1
                </span>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  Customer ID: <strong style={{ color: '#0f172a' }}>100164311</strong>
                </span>
              </div>
              <h1 style={{ margin: '6px 0 2px 0', fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                M/S INDIAN INSTITUTE OF TECHNOLOGY, G'NA
              </h1>
              <p style={{ margin: 0, fontSize: 12.5, color: '#475569' }}>
                Room No.101, Academic Block No-3, IITGN Campus, Near Palaj Village, Gandhinagar - 382355 • PAN: <strong>AAAT17352M</strong>
              </p>
            </div>
          </div>

          {/* Action Bar (Month Selector, Add Button, Exports) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Month Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>MONTH:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#004F9F',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {bills.length === 0 ? (
                  <option value="">No bills recorded</option>
                ) : (
                  bills.map((b) => (
                    <option key={b.month} value={b.month}>
                      {b.month} ({b.billDate ? `Bill: ${b.billDate}` : 'Recorded'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Supervisor / Admin Controls */}
            {(isSupervisor || isAdmin) && (
              <>
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    background: '#00843D',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 132, 61, 0.25)',
                  }}
                >
                  <span>+</span>
                  <span>Enter New Bill</span>
                </button>

                {currentBill && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(currentBill)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      background: '#ffffff',
                      color: '#004F9F',
                      border: '1.5px solid #004F9F',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span>✏️</span>
                    <span>Edit {selectedMonth}</span>
                  </button>
                )}
              </>
            )}

            <ExportDropdown onExportCsv={handleExportCsv} onExportPdf={handleExportPdf} disabled={bills.length === 0} />
          </div>
        </div>

        {/* Technical Substation Badges Strip */}
        {currentBill && (
          <div
            style={{
              marginTop: 18,
              padding: '12px 18px',
              background: '#ffffff',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20,
              alignItems: 'center',
              fontSize: 12.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>CONTRACT DEMAND: </span>
                <strong style={{ color: '#0f172a', fontSize: 13.5 }}>{fmtNum(currentBill?.contractDemandKw || 3200, 0)} KW</strong>
              </div>
              {isSuperAdmin ? (
                <button
                  type="button"
                  id="btn-edit-contract-demand"
                  onClick={() => handleOpenDemandModal(currentBill)}
                  title="Super Admin Only: Update Sanctioned Contract Demand when electrical load increases"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #93c5fd',
                    background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
                    color: '#1d4ed8',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(29, 78, 216, 0.08)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>✏️</span> Edit Demand
                </button>
              ) : (
                <span
                  title="Sanctioned Contract Demand is locked. Only Super Admin can modify it when campus electrical load increases."
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 7px',
                    borderRadius: 5,
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#64748b',
                    fontSize: 10.5,
                    fontWeight: 600,
                    cursor: 'help',
                  }}
                >
                  <span>🔒</span> Super Admin Only
                </span>
              )}
            </div>
            <div style={{ width: 1, height: 16, background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>BILLING DEMAND: </span>
              <strong style={{ color: '#00843D' }}>{fmtNum(currentBill?.billingDemandKw || 0, 1)} KW</strong>
            </div>
            <div style={{ width: 1, height: 16, background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>METER NO: </span>
              <strong style={{ color: '#0f172a' }}>{currentBill?.meterNo || '–'}</strong>
            </div>
            <div style={{ width: 1, height: 16, background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>MULTIPLIER: </span>
              <strong style={{ color: '#004F9F' }}>{fmtNum(currentBill?.multiplier || 2500, 2)}</strong>
            </div>
            <div style={{ width: 1, height: 16, background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>READING DATE: </span>
              <strong style={{ color: '#0f172a' }}>{currentBill?.readingDate || '–'}</strong>
            </div>
            <div style={{ width: 1, height: 16, background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>BILL DATE: </span>
              <strong style={{ color: '#0f172a' }}>{currentBill?.billDate || '–'}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Top 4 KPI Metric Cards & Detailed Breakdown */}
      {currentBill && (
        <>

      {/* Top 4 KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* Card 1: Total Bill Amount */}
        <div
          className="card"
          style={{
            borderTop: '5px solid #00843D',
            padding: 16,
            background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#15803d', letterSpacing: '0.5px' }}>
            TOTAL BILL PAYABLE
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#00843D', margin: '6px 0 2px' }}>
            {fmtCurrency(currentBill?.totalBillAmount, 2)}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>Due: <strong>{currentBill?.dueDate || '13/10/26'}</strong></span>
            <span style={{ color: '#004F9F', fontWeight: 700 }}>e-Payment</span>
          </div>
        </div>

        {/* Card 2: Active Energy Consumed */}
        <div
          className="card"
          style={{
            borderTop: '5px solid #004F9F',
            padding: 16,
            background: 'linear-gradient(180deg, #ffffff 0%, #f0f7ff 100%)',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#004F9F', letterSpacing: '0.5px' }}>
            ACTIVE ENERGY (KWH)
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#004F9F', margin: '6px 0 2px' }}>
            {fmtNum(currentBill?.kwhConsumed, 0)} <span style={{ fontSize: 14, fontWeight: 700 }}>Units</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b' }}>
            Diff &times; 2,500 multiplier (1.60M KWH)
          </div>
        </div>

        {/* Card 3: Billing Demand (KW) */}
        <div
          className="card"
          style={{
            borderTop: '5px solid #0d9488',
            padding: 16,
            background: 'linear-gradient(180deg, #ffffff 0%, #f0fdfa 100%)',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#0f766e', letterSpacing: '0.5px' }}>
            BILLING DEMAND (KW)
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f766e', margin: '6px 0 2px' }}>
            {fmtNum(currentBill?.billingDemandKw, 1)} <span style={{ fontSize: 14, fontWeight: 700 }}>KW</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b' }}>
            {Math.round(((currentBill?.billingDemandKw || 2832.5) / (currentBill?.contractDemandKw || 3200)) * 100)}% of {fmtNum(currentBill?.contractDemandKw || 3200, 0)} KW Sanctioned Demand
          </div>
        </div>

        {/* Card 4: Peak TOU Units */}
        <div
          className="card"
          style={{
            borderTop: '5px solid #ea580c',
            padding: 16,
            background: 'linear-gradient(180deg, #ffffff 0%, #fff7ed 100%)',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#c2410c', letterSpacing: '0.5px' }}>
            TOU PEAK UNITS
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#c2410c', margin: '6px 0 2px' }}>
            {fmtNum(currentBill?.touKwhConsumed, 0)} <span style={{ fontSize: 14, fontWeight: 700 }}>KWH</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b' }}>
            {currentBill?.touRatioPct ? `${currentBill.touRatioPct}%` : '32.76%'} of total consumption
          </div>
        </div>
      </div>

      {/* Main Grid: Meter Telemetry (Left) and Bill Financial Breakdown (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
        {/* SECTION 1: METER DETAILS TABLE */}
        <div className="card" style={{ padding: 20, border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⏱️</span> Meter Details & Telemetry
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: 12, color: '#64748b' }}>
                Meter No: <strong>{currentBill?.meterNo || '6877522'}</strong> • Current Multiplier: <strong>{fmtNum(currentBill?.multiplier || 2500, 2)}</strong>
              </p>
            </div>
            <span
              style={{
                background: currentBill?.status === 'Verified' ? '#dcfce7' : currentBill?.status === 'Paid' ? '#dbeafe' : '#fef3c7',
                color: currentBill?.status === 'Verified' ? '#15803d' : currentBill?.status === 'Paid' ? '#1d4ed8' : '#92400e',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Status: {currentBill?.status || 'Verified'}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '9px 12px', fontWeight: 800 }}>Parameter</th>
                  <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Present</th>
                  <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Past</th>
                  <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Diff</th>
                  <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Multiplier</th>
                  <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right', color: '#00843D' }}>Consumed Units</th>
                </tr>
              </thead>
              <tbody>
                {/* KW Row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                    KW (Demand)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.kwPresent, 5)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNum(currentBill?.kwPast, 5)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum((currentBill?.kwPresent || 0) - (currentBill?.kwPast || 0), 5)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.multiplier, 2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#00843D', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.kwConsumed, 3)} KW
                  </td>
                </tr>

                {/* KWH Row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f0fdf4' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: '#166534' }}>
                    KWH (Active Energy)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {fmtNum(currentBill?.kwhPresent, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNum(currentBill?.kwhPast, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {fmtNum((currentBill?.kwhPresent || 0) - (currentBill?.kwhPast || 0), 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.multiplier, 2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#00843D', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.kwhConsumed, 3)} KWH
                  </td>
                </tr>

                {/* TOU KWH Row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c2410c' }}>
                    TOU KWH (Peak Time)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.touKwhPresent, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNum(currentBill?.touKwhPast, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum((currentBill?.touKwhPresent || 0) - (currentBill?.touKwhPast || 0), 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.multiplier, 2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#c2410c', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.touKwhConsumed, 3)} KWH
                  </td>
                </tr>

                {/* KVAH Row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                    KVAH (Apparent)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.kvahPresent, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNum(currentBill?.kvahPast, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum((currentBill?.kvahPresent || 0) - (currentBill?.kvahPast || 0), 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.multiplier, 2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.kvahConsumed, 3)} KVAH
                  </td>
                </tr>

                {/* SLRT Row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>
                    SLRT (Reactive)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.slrtPresent, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                    {fmtNum(currentBill?.slrtPast, 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum((currentBill?.slrtPresent || 0) - (currentBill?.slrtPast || 0), 3)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.multiplier, 2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(currentBill?.slrtConsumed, 3)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Substation Log Reconciliation Callout */}
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                SUBSTATION LOG RECONCILIATION
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                Campus Incomer Logged: <strong>{fmtNum(currentBill?.internalLoggedKwh || 1598200, 0)} KWH</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  background:
                    Math.abs(currentBill?.variancePct || 0.29) < 1.0 ? '#dcfce7' : '#fee2e2',
                  color:
                    Math.abs(currentBill?.variancePct || 0.29) < 1.0 ? '#15803d' : '#991b1b',
                }}
              >
                Variance: {fmtNum(currentBill?.varianceKwh || 4650, 0)} KWH ({currentBill?.variancePct || 0.29}%)
              </span>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Normal campus transmission distribution tolerance (&lt;1%)
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: MAJOR BILL COMPONENTS & DONUT BREAKDOWN */}
        <div className="card" style={{ padding: 20, border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📊</span> Major Bill Components
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: 12, color: '#64748b' }}>
                Financial breakdown matching the official Torrent Power billing structure
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Base Charges:</span>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                {fmtCurrency((currentBill?.netEnergyCharges || 7245982.5) + (currentBill?.fppasCharges || 5962602.0), 2)}
              </div>
            </div>
          </div>

          {/* Donut Chart and List */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: 20 }}>
            {/* Donut Chart representation matching the bill */}
            <div style={{ position: 'relative', width: 170, height: 170 }}>
              <svg width="170" height="170" viewBox="0 0 170 170">
                <circle cx="85" cy="85" r="65" fill="none" stroke="#e2e8f0" strokeWidth="26" />
                {/* Energy Charges Segment (Light Green) ~ 51% of base */}
                <circle
                  cx="85"
                  cy="85"
                  r="65"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="26"
                  strokeDasharray="225 408"
                  strokeDashoffset="0"
                  transform="rotate(-90 85 85)"
                />
                {/* FPPAS Charges Segment (Dark Blue) ~ 42% of base */}
                <circle
                  cx="85"
                  cy="85"
                  r="65"
                  fill="none"
                  stroke="#004F9F"
                  strokeWidth="26"
                  strokeDasharray="183 408"
                  strokeDashoffset="-225"
                  transform="rotate(-90 85 85)"
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>NET CHARGES</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', textAlign: 'center' }}>
                  ₹ 1.41 Cr
                </span>
              </div>
            </div>

            {/* Detailed Component Rows */}
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Energy Charges */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#f0fdf4',
                  borderLeft: '4px solid #22c55e',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#166534' }}>Energy Charges</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>48.15% of invoice</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>
                  {fmtCurrency(currentBill?.netEnergyCharges, 2)}
                </div>
              </div>

              {/* FPPAS Charges */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#eff6ff',
                  borderLeft: '4px solid #004F9F',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#004F9F' }}>FPPAS Charges</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Fuel price surcharge (39.62%)</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#004F9F' }}>
                  {fmtCurrency(currentBill?.fppasCharges, 2)}
                </div>
              </div>

              {/* Demand & Fixed Charges */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#f8fafc',
                  borderLeft: '4px solid #f59e0b',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#b45309' }}>Demand / Fixed Charges</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Based on 2832.5 KW billing demand</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309' }}>
                  {fmtCurrency(currentBill?.demandCharges || 948889.5, 2)}
                </div>
              </div>

              {/* Electricity Duty & Tax */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#f8fafc',
                  borderLeft: '4px solid #8b5cf6',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#6d28d9' }}>Electricity Duty & Taxes</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>State government statutory duty</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9' }}>
                  {fmtCurrency(currentBill?.electricityDuty || 891006.0, 2)}
                </div>
              </div>
            </div>
          </div>

          {/* Total Payable Summary Footer */}
          <div
            style={{
              marginTop: 14,
              padding: '12px 16px',
              borderRadius: 8,
              background: '#00843D',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.9 }}>
                NET AMOUNT PAYABLE
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                By e-payment mechanism (RTGS/NEFT)
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              {fmtCurrency(currentBill?.totalBillAmount, 2)}
            </div>
          </div>
        </div>
      </div>

      {/* Consumption Trend Graphs (Directly replicating the graphs on the bill) */}
      <div className="card" style={{ padding: 20, border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📈</span> Torrent Power Multi-Month Consumption Trends
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: '#64748b' }}>
              Historical demand (KW), energy consumption (KWH), power factor maintenance, and TOU ratio
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {/* Trend 1: Recorded Demand RD (KW) */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>RD (KW) - Recorded Demand</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>Sanction: 3,200 KW</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, paddingBottom: 4 }}>
              {trendData.map((t) => {
                const heightPct = Math.min(100, (t.demand / 3200) * 100)
                const isCur = t.month === selectedMonth
                return (
                  <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? '#00843D' : '#64748b' }}>
                      {Math.round(t.demand)}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: isCur ? '#00843D' : '#94a3b8',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? '#00843D' : '#64748b' }}>
                      {t.shortMonth}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trend 2: Active Energy KWH Units */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#004F9F' }}>KWH - Monthly Units</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>1 Unit = 1 KWH</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, paddingBottom: 4 }}>
              {trendData.map((t) => {
                const heightPct = Math.min(100, (t.kwh / 1700000) * 100)
                const isCur = t.month === selectedMonth
                return (
                  <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: isCur ? '#004F9F' : '#64748b' }}>
                      {(t.kwh / 100000).toFixed(1)}L
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: isCur ? '#004F9F' : '#60a5fa',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? '#004F9F' : '#64748b' }}>
                      {t.shortMonth}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trend 3: Power Factor % */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>Power Factor (%)</span>
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>Min Req: 90%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, paddingBottom: 4 }}>
              {trendData.map((t) => {
                const heightPct = Math.min(100, t.pf)
                const isCur = t.month === selectedMonth
                return (
                  <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>
                      {t.pf}%
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: isCur ? '#16a34a' : '#86efac',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? '#16a34a' : '#64748b' }}>
                      {t.shortMonth}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trend 4: TOU Peak Units % */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>TOU Units % of Total</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>Peak Hours Ratio</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, paddingBottom: 4 }}>
              {trendData.map((t) => {
                const heightPct = Math.min(100, t.touRatio * 2.5) // scaled for visual clarity
                const isCur = t.month === selectedMonth
                return (
                  <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#ea580c' }}>
                      {t.touRatio}%
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: isCur ? '#ea580c' : '#fdba74',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? '#ea580c' : '#64748b' }}>
                      {t.shortMonth}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Historical Monthly Bills Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
        <div
          style={{
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Historical Torrent Power Invoices & Audits
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: '#64748b' }}>
              Complete record of monthly electricity bills, demand charges, and substation reconciliation
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Showing {bills.length} billing month(s)
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            Loading Torrent Power records...
          </div>
        ) : bills.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            No Torrent Power bills found. Click <strong>Enter New Bill</strong> above to add one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Month</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Bill Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Demand (KW)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Active KWH</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Peak TOU</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>PF %</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Energy (₹)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>FPPAS (₹)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right', color: '#00843D' }}>Total Bill (₹)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center' }}>Variance</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Status</th>
                  {(isSupervisor || isAdmin) && (
                    <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center' }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const isCur = b.month === selectedMonth
                  return (
                    <tr
                      key={b.month}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isCur ? '#f0fdf4' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedMonth(b.month)}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: isCur ? '#00843D' : '#0f172a' }}>
                        {b.month} {isCur && <span style={{ fontSize: 10, color: '#00843D' }}>● Selected</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>
                        {b.billDate || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(b.billingDemandKw, 1)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#004F9F', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(b.kwhConsumed, 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#c2410c' }}>
                        {fmtNum(b.touKwhConsumed, 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                        {b.avgPowerFactor}%
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCurrency(b.netEnergyCharges, 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCurrency(b.fppasCharges, 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#00843D', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCurrency(b.totalBillAmount, 2)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: Math.abs(b.variancePct || 0) < 1.0 ? '#dcfce7' : '#fee2e2',
                            color: Math.abs(b.variancePct || 0) < 1.0 ? '#15803d' : '#991b1b',
                          }}
                        >
                          {b.variancePct ? `${b.variancePct}%` : '0%'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: b.status === 'Verified' ? '#dcfce7' : b.status === 'Paid' ? '#dbeafe' : '#fef3c7',
                            color: b.status === 'Verified' ? '#15803d' : b.status === 'Paid' ? '#1d4ed8' : '#92400e',
                          }}
                        >
                          {b.status || 'Verified'}
                        </span>
                      </td>
                      {(isSupervisor || isAdmin) && (
                        <td
                          style={{ padding: '10px 14px', textAlign: 'center' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(b)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: 13,
                                color: '#004F9F',
                              }}
                              title="Edit Bill"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBill(b.month)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: 13,
                                color: '#dc2626',
                              }}
                              title="Delete Record"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT TORRENT BILL FORM */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              maxWidth: 820,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #cbd5e1',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 22px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(90deg, #f0fdf4 0%, #eff6ff 100%)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#0f172a' }}>
                  {editMode ? `Edit Torrent Power Bill (${formData.month})` : 'Enter New Torrent Power Bill'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#475569' }}>
                  HTMD1 Tariff • Meter Multiplier 2,500.00 • IIT Gandhinagar Substation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#64748b',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveBill} style={{ padding: '20px 24px' }}>
              {/* Section 1: Bill Metadata */}
              <div style={{ marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#00843D', letterSpacing: '0.6px' }}>
                  1. BILL IDENTIFIERS & DATES
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Billing Month (YYYY-MM) *
                    </label>
                    <input
                      type="month"
                      required
                      disabled={editMode}
                      value={formData.month}
                      onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Reading Date (DD/MM/YY)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 30/09/26"
                      value={formData.readingDate}
                      onChange={(e) => setFormData({ ...formData, readingDate: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Bill Date (DD/MM/YY)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 03/10/26"
                      value={formData.billDate}
                      onChange={(e) => setFormData({ ...formData, billDate: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Due Date (DD/MM/YY)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 13/10/26"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Meter Multiplier
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.multiplier}
                      onChange={(e) => setFormData({ ...formData, multiplier: parseFloat(e.target.value) || 2500 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: isSuperAdmin ? '#004F9F' : '#475569' }}>
                        Contract Demand (KW) *
                      </label>
                      {isSuperAdmin ? (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                          👑 Super Admin
                        </span>
                      ) : (
                        <span title="Locked: Only Super Admin can edit sanctioned contract demand" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                          🔒 Super Admin Only
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="1"
                      min="100"
                      max="25000"
                      disabled={!isSuperAdmin}
                      value={formData.contractDemandKw}
                      onChange={(e) => isSuperAdmin && setFormData({ ...formData, contractDemandKw: parseFloat(e.target.value) || 3200 })}
                      title={isSuperAdmin ? "Sanctioned Contract Demand in KW (editable for Super Admin when load increases)" : "Sanctioned Contract Demand is managed by Super Admin"}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: isSuperAdmin ? '1.5px solid #004F9F' : '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 700,
                        background: isSuperAdmin ? '#ffffff' : '#f8fafc',
                        color: isSuperAdmin ? '#0f172a' : '#64748b',
                        cursor: isSuperAdmin ? 'text' : 'not-allowed',
                      }}
                    />
                    {!isSuperAdmin && (
                      <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'block' }}>
                        Sanctioned grid load (Super Admin only)
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#00843D', marginBottom: 4 }}>
                      Billing Demand (KW) *
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        step="0.1"
                        required
                        placeholder="e.g. 2832.5"
                        value={formData.billingDemandKw}
                        onChange={(e) => setFormData({ ...formData, billingDemandKw: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #00843D', fontSize: 13, fontWeight: 800, color: '#00843D' }}
                      />
                      {formCalculations.kwConsumed > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, billingDemandKw: formCalculations.kwConsumed }))}
                          title="Copy calculated KW from meter"
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#f0fdf4',
                            border: '1px solid #86efac',
                            color: '#166534',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Auto {formCalculations.kwConsumed}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Meter Readings Grid */}
              <div style={{ marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#004F9F', letterSpacing: '0.6px' }}>
                  2. METER READINGS (PRESENT & PAST)
                </span>
                <p style={{ margin: '2px 0 8px 0', fontSize: 11.5, color: '#64748b' }}>
                  Enter raw dial numbers from the physical bill. Consumed units are auto-calculated: <code>(Present - Past) &times; Multiplier</code>
                </p>

                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Parameter</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Present Dial</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Past Dial</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#00843D' }}>Auto-Computed Consumed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* KW Demand */}
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>KW (Recorded Demand)</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.00001"
                            value={formData.kwPresent}
                            onChange={(e) => setFormData({ ...formData, kwPresent: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.00001"
                            value={formData.kwPast}
                            onChange={(e) => setFormData({ ...formData, kwPast: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#00843D' }}>
                          {fmtNum(formCalculations.kwConsumed, 2)} KW
                        </td>
                      </tr>

                      {/* KWH Active Energy */}
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f0fdf4' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 800, color: '#166534' }}>KWH (Active Energy) *</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            required
                            value={formData.kwhPresent}
                            onChange={(e) => setFormData({ ...formData, kwhPresent: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1.5px solid #16a34a', fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            required
                            value={formData.kwhPast}
                            onChange={(e) => setFormData({ ...formData, kwhPast: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#15803d' }}>
                          {fmtNum(formCalculations.kwhConsumed, 2)} KWH
                        </td>
                      </tr>

                      {/* TOU KWH */}
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#c2410c' }}>TOU KWH (Peak Time)</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.touKwhPresent}
                            onChange={(e) => setFormData({ ...formData, touKwhPresent: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.touKwhPast}
                            onChange={(e) => setFormData({ ...formData, touKwhPast: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#c2410c' }}>
                          {fmtNum(formCalculations.touConsumed, 2)} KWH ({formCalculations.touRatio}%)
                        </td>
                      </tr>

                      {/* KVAH Apparent */}
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>KVAH (Apparent Energy)</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.kvahPresent}
                            onChange={(e) => setFormData({ ...formData, kvahPresent: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.kvahPast}
                            onChange={(e) => setFormData({ ...formData, kvahPast: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>
                          {fmtNum(formCalculations.kvahConsumed, 2)} KVAH (PF: {formCalculations.pf}%)
                        </td>
                      </tr>

                      {/* SLRT Reactive */}
                      <tr>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>SLRT (Reactive)</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.slrtPresent}
                            onChange={(e) => setFormData({ ...formData, slrtPresent: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.001"
                            value={formData.slrtPast}
                            onChange={(e) => setFormData({ ...formData, slrtPast: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#64748b' }}>
                          {fmtNum(formCalculations.slrtConsumed, 2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Financial Components */}
              <div style={{ marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#16a34a', letterSpacing: '0.6px' }}>
                  3. FINANCIAL AMOUNTS (₹)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>
                      Total Bill Payable (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.totalBillAmount}
                      onChange={(e) => setFormData({ ...formData, totalBillAmount: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #16a34a', fontSize: 14, fontWeight: 800, color: '#15803d' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Energy Charges (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.netEnergyCharges}
                      onChange={(e) => setFormData({ ...formData, netEnergyCharges: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      FPPAS Fuel Charges (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.fppasCharges}
                      onChange={(e) => setFormData({ ...formData, fppasCharges: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Demand / Fixed Charges (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.demandCharges}
                      onChange={(e) => setFormData({ ...formData, demandCharges: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Electricity Duty & Tax (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.electricityDuty}
                      onChange={(e) => setFormData({ ...formData, electricityDuty: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Substation Reconciliation & Audit */}
              <div style={{ marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.6px' }}>
                  4. RECONCILIATION & AUDIT
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Substation Incomer Logged (KWH)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={formData.internalLoggedKwh}
                      onChange={(e) => setFormData({ ...formData, internalLoggedKwh: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g. 1598200"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
                    >
                      <option value="Pending">Pending Verification</option>
                      <option value="Verified">Verified by Engineer</option>
                      <option value="Paid">Paid / Settled</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Remarks / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Official HTMD1 e-bill received, verified against 11kV substation telemetry"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 8,
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '9px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#00843D',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 132, 61, 0.25)',
                  }}
                >
                  {saving ? 'Saving...' : editMode ? 'Update Bill' : 'Save Torrent Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Super Admin Dedicated Sanctioned Contract Demand Update Modal */}
      {demandModalOpen && isSuperAdmin && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !demandSaving) setDemandModalOpen(false)
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 580,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#ffffff' }}>
                    Update Sanctioned Contract Demand
                  </h3>
                  <span
                    style={{
                      background: 'rgba(59, 130, 246, 0.25)',
                      color: '#93c5fd',
                      border: '1px solid rgba(147, 197, 253, 0.3)',
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}
                  >
                    👑 Super Admin Only
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                  IIT Gandhinagar Substation &bull; Torrent Power Ltd. Sanctioned Grid Load (Billing Month: <strong>{demandForm.month}</strong>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => !demandSaving && setDemandModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#e2e8f0',
                  fontSize: 18,
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleSaveDemand} style={{ padding: '20px 24px' }}>
              {demandError && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    borderRadius: 8,
                    color: '#991b1b',
                    fontSize: 12.5,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>⚠️</span> {demandError}
                </div>
              )}

              {demandSuccessMsg && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: 8,
                    color: '#166534',
                    fontSize: 12.5,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>✅</span> {demandSuccessMsg}
                </div>
              )}

              {/* Informative Context Card */}
              <div
                style={{
                  padding: '12px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  marginBottom: 18,
                  fontSize: 12,
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>ℹ️</span> Electrical Campus Load Expansion Protocol
                </div>
                Whenever IITGN adds new buildings (e.g. Research Park, New Academic Blocks, Academic Hostels),
                the sanctioned Contract Demand with Torrent Power is officially increased. Use this option to update
                the base contract capacity for billing reconciliation and maximum demand penalty audits.
              </div>

              {/* Current vs New Demand Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                    Current Sanctioned Load
                  </label>
                  <div
                    style={{
                      padding: '9px 12px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#334155',
                    }}
                  >
                    {fmtNum(currentBill?.contractDemandKw || 3200, 0)} KW
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#004F9F', marginBottom: 4 }}>
                    New Contract Demand (KW) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="100"
                    max="25000"
                    required
                    value={demandForm.contractDemandKw}
                    onChange={(e) => setDemandForm({ ...demandForm, contractDemandKw: parseFloat(e.target.value) || '' })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '2px solid #004F9F',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#004F9F',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  Quick Load Presets:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { label: '3,200 KW (Base)', val: 3200 },
                    { label: '3,500 KW (+300 KW)', val: 3500 },
                    { label: '3,800 KW (+600 KW)', val: 3800 },
                    { label: '4,000 KW (+800 KW)', val: 4000 },
                    { label: '4,500 KW (+1.3 MW)', val: 4500 },
                    { label: '5,000 KW (+1.8 MW)', val: 5000 },
                  ].map((p) => {
                    const isSelected = Number(demandForm.contractDemandKw) === p.val
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setDemandForm({ ...demandForm, contractDemandKw: p.val })}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #004F9F' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          color: isSelected ? '#004F9F' : '#475569',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Remarks / Sanction Letter reference */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Reason / Torrent Sanction Reference Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Sanctioned load enhanced as per Torrent Power order Ref #TP/IITGN/2026/092 for Research Park"
                  value={demandForm.remarks}
                  onChange={(e) => setDemandForm({ ...demandForm, remarks: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 12.5,
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Apply to Future Months Checkbox */}
              <div
                style={{
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <input
                  type="checkbox"
                  id="chk-apply-future"
                  checked={demandForm.applyFuture}
                  onChange={(e) => setDemandForm({ ...demandForm, applyFuture: e.target.checked })}
                  style={{ marginTop: 2, cursor: 'pointer', accentColor: '#16a34a' }}
                />
                <label htmlFor="chk-apply-future" style={{ fontSize: 12, color: '#166534', cursor: 'pointer' }}>
                  <strong>Apply permanently to subsequent future months</strong>
                  <div style={{ fontSize: 11, color: '#15803d', marginTop: 1 }}>
                    Contract load enhancements are permanent utility amendments. Checking this updates all subsequent billing records to this new sanctioned demand.
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  disabled={demandSaving}
                  onClick={() => setDemandModalOpen(false)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={demandSaving}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#004F9F',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0, 79, 159, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {demandSaving ? 'Updating Demand...' : 'Update Contract Demand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
