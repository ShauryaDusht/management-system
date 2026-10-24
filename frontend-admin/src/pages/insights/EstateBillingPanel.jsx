import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { estateApi } from '../../api/estate'
import { Btn, Card, Spinner, Input } from '../../components/ui'
import { inr, inr0, calcMeters, calcNote } from '../estate/utils'
import { exportCsv, todayISO } from '../../shared/utils'

const PALETTE = ['#2d4a3e', '#c2622a', '#3b82f6', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899', '#64748b']
const HOUSE_TYPE_COLORS = {
  A: '#2d4a3e',
  B: '#3b82f6',
  C: '#c2622a',
  D: '#8b5cf6',
  E: '#0d9488',
  F: '#f59e0b',
}

const TooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: 12,
  background: 'var(--surface)',
}

function SectionTitle({ tag, title, subtitle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
        {tag && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '2px 8px',
              borderRadius: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {tag}
          </span>
        )}
        <span>{title}</span>
      </div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

export default function EstateBillingPanel() {
  const [subView, setSubView] = useState('overview') // overview | shops | contractors | housing | clearances
  const [cycles, setCycles] = useState([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [shops, setShops] = useState([])
  const [contractors, setContractors] = useState([])
  const [housingUnits, setHousingUnits] = useState([])
  const [clearances, setClearances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Search & Filter States
  const [outletSearch, setOutletSearch] = useState('')
  const [outletFilter, setOutletFilter] = useState('all') // all | shop | contractor

  const [housingSearch, setHousingSearch] = useState('')
  const [housingTypeFilter, setHousingTypeFilter] = useState('all') // all | A | B | C | D | E | F
  const [housingStatusFilter, setHousingStatusFilter] = useState('all') // all | occupied | vacant

  const [clearanceSearch, setClearanceSearch] = useState('')
  const [clearanceStatusFilter, setClearanceStatusFilter] = useState('all') // all | completed | in_progress

  // 1. Fetch Cycles & Initial Base Data (Housing & Clearances)
  useEffect(() => {
    let alive = true
    Promise.all([
      estateApi.getCycles(),
      estateApi.getHousingUnits(),
      estateApi.getClearances(),
    ])
      .then(([cyclesRes, unitsRes, clearancesRes]) => {
        if (!alive) return
        const cycleList = Array.isArray(cyclesRes.data) ? cyclesRes.data : []
        setCycles(cycleList)
        if (cycleList.length > 0 && !selectedCycle) {
          const active = cycleList.find((c) => c.is_active) || cycleList[0]
          setSelectedCycle(active.month)
        }
        setHousingUnits(Array.isArray(unitsRes.data) ? unitsRes.data : [])
        setClearances(Array.isArray(clearancesRes.data) ? clearancesRes.data : [])
      })
      .catch(() => {
        if (!alive) return
        setError('Failed to load initial estate dataset.')
      })
    return () => { alive = false }
  }, [])

  // 2. Fetch Shops & Contractors for Selected Cycle
  useEffect(() => {
    let alive = true
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const [shopsRes, contractorsRes] = await Promise.all([
          estateApi.getShops(selectedCycle || undefined),
          estateApi.getContractors(selectedCycle || undefined),
        ])
        if (!alive) return
        setShops(Array.isArray(shopsRes.data) ? shopsRes.data : [])
        setContractors(Array.isArray(contractorsRes.data) ? contractorsRes.data : [])
      } catch (err) {
        if (!alive) return
        setError('Failed to load Estate billing data for this cycle.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    fetchData()
    return () => { alive = false }
  }, [selectedCycle])

  // --- Process Shops Data ---
  const shopsProcessed = useMemo(() => {
    return shops.map((s) => {
      const calc = calcNote(s)
      return {
        id: s.id,
        type: 'shop',
        typeLabel: 'Commercial Shop',
        name: s.name,
        noteNo: s.noteNo || '-',
        units: s.fixed ? 0 : Number(s.units) || 0,
        rate: Number(s.rate) || 0,
        fixed: !!s.fixed,
        electricityAmount: calc.electricity,
        waterAmount: calc.water,
        extrasAmount: calc.extrasTotal,
        totalAmount: Number(s.total_amount) || calc.total,
        expiryDate: s.expiryDate || '-',
      }
    })
  }, [shops])

  // --- Process Contractors Data ---
  const contractorsProcessed = useMemo(() => {
    return contractors.map((c) => {
      const calc = calcMeters(c.meters)
      const units = calc.rows.reduce((sum, r) => sum + (r.units || 0), 0)
      return {
        id: c.id,
        type: 'contractor',
        typeLabel: 'Power Contractor',
        name: c.name,
        noteNo: c.noteNo || '-',
        units: Math.round(units * 100) / 100,
        rate: c.meters?.[0]?.rate || 9.55,
        fixed: false,
        electricityAmount: calc.total,
        waterAmount: 0,
        extrasAmount: 0,
        totalAmount: calc.total,
        metersCount: (c.meters || []).length,
      }
    })
  }, [contractors])

  // Combined Outlets
  const allOutlets = useMemo(() => {
    return [...shopsProcessed, ...contractorsProcessed]
  }, [shopsProcessed, contractorsProcessed])

  // Outlets Billing Totals
  const billingTotals = useMemo(() => {
    const shopsTotal = shopsProcessed.reduce((s, r) => s + r.totalAmount, 0)
    const contractorsTotal = contractorsProcessed.reduce((s, r) => s + r.totalAmount, 0)
    const shopsElectricity = shopsProcessed.reduce((s, r) => s + r.electricityAmount, 0)
    const shopsWater = shopsProcessed.reduce((s, r) => s + r.waterAmount, 0)
    const shopsExtras = shopsProcessed.reduce((s, r) => s + r.extrasAmount, 0)
    const shopsUnits = shopsProcessed.reduce((s, r) => s + r.units, 0)
    const contractorsUnits = contractorsProcessed.reduce((s, r) => s + r.units, 0)

    return {
      shopsCount: shops.length,
      contractorsCount: contractors.length,
      shopsTotal,
      contractorsTotal,
      grandTotal: shopsTotal + contractorsTotal,
      shopsElectricity,
      shopsWater,
      shopsExtras,
      totalUnits: Math.round(shopsUnits + contractorsUnits),
      shopsUnits: Math.round(shopsUnits),
      contractorsUnits: Math.round(contractorsUnits),
    }
  }, [shopsProcessed, contractorsProcessed, shops.length, contractors.length])

  // --- Process Housing Data ---
  const housingStats = useMemo(() => {
    const total = housingUnits.length
    let occupied = 0
    let vacant = 0
    let maintenance = 0
    let underClearance = 0
    const byType = {}

    housingUnits.forEach((u) => {
      const typeKey = u.houseType || 'Other'
      if (!byType[typeKey]) {
        byType[typeKey] = { type: typeKey, occupied: 0, vacant: 0, total: 0 }
      }
      byType[typeKey].total += 1

      const st = String(u.status || '').toLowerCase()
      if (st === 'occupied') {
        occupied += 1
        byType[typeKey].occupied += 1
      } else if (st === 'vacant') {
        vacant += 1
        byType[typeKey].vacant += 1
      } else if (st === 'under_maintenance') {
        maintenance += 1
      } else if (st === 'under_clearance') {
        underClearance += 1
      }
    })

    const occupancyRate = total > 0 ? ((occupied / total) * 100).toFixed(1) : 0
    const typeChartData = Object.values(byType).sort((a, b) => a.type.localeCompare(b.type))

    return {
      total,
      occupied,
      vacant,
      maintenance,
      underClearance,
      occupancyRate,
      typeChartData,
      occupancyPieData: [
        { name: 'Occupied', value: occupied, color: '#166534' },
        { name: 'Vacant', value: vacant, color: '#ca8a04' },
        ...(maintenance > 0 ? [{ name: 'Under Maintenance', value: maintenance, color: '#9333ea' }] : []),
        ...(underClearance > 0 ? [{ name: 'Under Clearance', value: underClearance, color: '#ea580c' }] : []),
      ].filter((d) => d.value > 0),
    }
  }, [housingUnits])

  // --- Process Clearances Data ---
  const clearanceStats = useMemo(() => {
    const total = clearances.length
    let completed = 0
    let inProgress = 0
    let allotted = 0

    let civilDone = 0
    let elecDone = 0
    let hkDone = 0
    let estateDone = 0

    clearances.forEach((c) => {
      const st = String(c.status || '').toLowerCase()
      if (st === 'completed') completed += 1
      else inProgress += 1

      if (c.isAllotted || c.is_allotted) allotted += 1

      if (String(c.civilStatus || '').toLowerCase().includes('complet')) civilDone += 1
      if (String(c.electricalStatus || '').toLowerCase().includes('complet')) elecDone += 1
      if (String(c.hkStatus || '').toLowerCase().includes('complet')) hkDone += 1
      if (c.keyHandedOverToAllotteeDate || c.estateDate3) estateDone += 1
    })

    const stageData = [
      { department: 'Civil Handover', completed: civilDone, total },
      { department: 'Electrical Handover', completed: elecDone, total },
      { department: 'Housekeeping Handover', completed: hkDone, total },
      { department: 'Estate Handover', completed: estateDone, total },
    ]

    return {
      total,
      completed,
      inProgress,
      allotted,
      civilDone,
      elecDone,
      hkDone,
      estateDone,
      stageData,
      statusPieData: [
        { name: 'Completed', value: completed, color: '#166534' },
        { name: 'In Progress', value: inProgress, color: '#2563eb' },
      ].filter((d) => d.value > 0),
    }
  }, [clearances])

  // Top 10 Commercial Shops Bar Chart
  const topShopsChart = useMemo(() => {
    return [...shopsProcessed]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10)
      .map((s) => ({
        name: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
        fullName: s.name,
        Electricity: s.electricityAmount,
        'Water & Fixed': s.waterAmount,
        Extras: s.extrasAmount,
        Total: s.totalAmount,
      }))
  }, [shopsProcessed])

  // Contractor Chart
  const contractorChart = useMemo(() => {
    return [...contractorsProcessed]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((c) => ({
        name: c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name,
        fullName: c.name,
        'Amount (Rs)': c.totalAmount,
        'Units (kWh)': Math.round(c.units),
      }))
  }, [contractorsProcessed])

  // Revenue Pie Chart
  const revenuePieData = useMemo(() => {
    return [
      { name: 'Shop Electricity', value: billingTotals.shopsElectricity },
      { name: 'Shop Water/Fixed', value: billingTotals.shopsWater },
      { name: 'Contractor Power', value: billingTotals.contractorsTotal },
      { name: 'Extras/Rent', value: billingTotals.shopsExtras },
    ].filter((d) => d.value > 0)
  }, [billingTotals])

  // Top Consumers Leaderboard
  const leaderboard = useMemo(() => {
    return [...allOutlets]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10)
  }, [allOutlets])

  const maxLeaderboardAmount = leaderboard[0]?.totalAmount || 1

  // Filtered Tables
  const filteredOutlets = useMemo(() => {
    const q = outletSearch.trim().toLowerCase()
    return allOutlets.filter((row) => {
      if (outletFilter !== 'all' && row.type !== outletFilter) return false
      if (!q) return true
      return row.name.toLowerCase().includes(q) || String(row.noteNo).toLowerCase().includes(q)
    })
  }, [allOutlets, outletFilter, outletSearch])

  const filteredHousing = useMemo(() => {
    const q = housingSearch.trim().toLowerCase()
    return housingUnits.filter((u) => {
      if (housingTypeFilter !== 'all' && u.houseType !== housingTypeFilter) return false
      if (housingStatusFilter !== 'all' && u.status !== housingStatusFilter) return false
      if (!q) return true
      const houseNo = String(u.houseNo || '').toLowerCase()
      const occupant = String(u.currentOccupant?.occupantName || '').toLowerCase()
      const empl = String(u.currentOccupant?.emplCode || '').toLowerCase()
      const desig = String(u.currentOccupant?.designation || '').toLowerCase()
      return houseNo.includes(q) || occupant.includes(q) || empl.includes(q) || desig.includes(q)
    })
  }, [housingUnits, housingTypeFilter, housingStatusFilter, housingSearch])

  const filteredClearances = useMemo(() => {
    const q = clearanceSearch.trim().toLowerCase()
    return clearances.filter((c) => {
      if (clearanceStatusFilter !== 'all' && c.status !== clearanceStatusFilter) return false
      if (!q) return true
      const houseNo = String(c.houseNo || '').toLowerCase()
      const allottee = String(c.allotteeName || '').toLowerCase()
      const empl = String(c.emplCode || '').toLowerCase()
      return houseNo.includes(q) || allottee.includes(q) || empl.includes(q)
    })
  }, [clearances, clearanceStatusFilter, clearanceSearch])

  // Export handlers
  const handleExportCSV = () => {
    const day = todayISO()
    if (subView === 'housing') {
      const filename = `estate_housing_inventory_${day}.csv`
      const headers = ['House Type', 'House No', 'Block', 'Floor', 'Status', 'Occupant Name', 'Employee Code', 'Designation', 'Email', 'Occupation Date']
      const rows = filteredHousing.map((u) => [
        u.houseType,
        u.houseNo,
        u.blockNo || '-',
        u.floor || '-',
        u.status,
        u.currentOccupant?.occupantName || '-',
        u.currentOccupant?.emplCode || '-',
        u.currentOccupant?.designation || '-',
        u.currentOccupant?.email || '-',
        u.currentOccupant?.dateOfOccupation || '-',
      ])
      exportCsv(filename, headers, rows)
    } else if (subView === 'clearances') {
      const filename = `estate_housing_clearances_${day}.csv`
      const headers = ['Sr No', 'House Type', 'House No', 'Allottee Name', 'Employee Code', 'Designation', 'Civil Status', 'Civil Completed', 'Electrical Status', 'Electrical Completed', 'HK Status', 'HK Completed', 'Estate Handover', 'Overall Status']
      const rows = filteredClearances.map((c) => [
        c.srNo,
        c.houseType,
        c.houseNo,
        c.allotteeName || '-',
        c.emplCode || '-',
        c.designation || '-',
        c.civilStatus || '-',
        c.civilCompletedDate || '-',
        c.electricalStatus || '-',
        c.electricalCompletedDate || '-',
        c.hkStatus || '-',
        c.hkCompletedDate || '-',
        c.keyHandedOverToAllotteeDate || c.estateDate3 || '-',
        c.status,
      ])
      exportCsv(filename, headers, rows)
    } else {
      const filename = `estate_outlets_billing_${selectedCycle || day}.csv`
      const headers = ['Type', 'Name', 'Demand Note No', 'Units (kWh)', 'Rate (INR)', 'Electricity (INR)', 'Water / Fixed (INR)', 'Extras (INR)', 'Total Amount (INR)']
      const rows = filteredOutlets.map((r) => [
        r.typeLabel,
        r.name,
        r.noteNo,
        r.units,
        r.rate,
        r.electricityAmount,
        r.waterAmount,
        r.extrasAmount,
        r.totalAmount,
      ])
      exportCsv(filename, headers, rows)
    }
  }

  if (loading && !shops.length && !contractors.length && !housingUnits.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const SUB_TABS = [
    { key: 'overview', label: 'All Estate Overview' },
    { key: 'shops', label: `Commercial Shops (${shops.length})` },
    { key: 'contractors', label: `Power Contractors (${contractors.length})` },
    { key: 'housing', label: `Housing & Occupancy (${housingStats.total})` },
    { key: 'clearances', label: `Clearance Pipeline (${clearanceStats.total})` },
  ]

  return (
    <div>
      {/* Top Estate Navigation & Control Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
          padding: '12px 18px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {SUB_TABS.map((tab) => (
            <Btn
              key={tab.key}
              size="sm"
              variant={subView === tab.key ? 'primary' : 'secondary'}
              onClick={() => setSubView(tab.key)}
            >
              {tab.label}
            </Btn>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(subView === 'overview' || subView === 'shops' || subView === 'contractors') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>
                Billing Cycle:
              </span>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'var(--green-900)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {cycles.map((c) => (
                  <option key={c.id || c.month} value={c.month}>
                    {c.label || c.month} {c.is_active ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Btn size="sm" variant="secondary" onClick={handleExportCSV}>
            Export {subView === 'housing' ? 'Housing CSV' : subView === 'clearances' ? 'Clearances CSV' : 'Billing CSV'}
          </Btn>

          <a href="/admin/estate" style={{ textDecoration: 'none' }}>
            <Btn size="sm" variant="primary">
              Open Estate Module
            </Btn>
          </a>
        </div>
      </div>

      {error && (
        <Card style={{ marginBottom: 16, borderColor: '#fecaca', background: '#fff1f2' }}>
          <div style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{error}</div>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. OVERVIEW VIEW
         ───────────────────────────────────────────────────────────── */}
      {subView === 'overview' && (
        <div>
          {/* Executive Overview KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {[
              {
                tag: 'REVENUE',
                label: 'Total Demand Raised',
                value: `Rs. ${billingTotals.grandTotal.toLocaleString('en-IN')}`,
                sub: `${selectedCycle || 'Current'} billing cycle`,
                color: 'var(--green-900)',
              },
              {
                tag: 'POWER',
                label: 'Total Power Draw',
                value: `${billingTotals.totalUnits.toLocaleString('en-IN')} kWh`,
                sub: `Shops: ${billingTotals.shopsUnits} | Ctr: ${billingTotals.contractorsUnits}`,
                color: '#3b82f6',
              },
              {
                tag: 'COMMERCIAL',
                label: 'Commercial Outlets',
                value: `${billingTotals.shopsCount + billingTotals.contractorsCount} Units`,
                sub: `${billingTotals.shopsCount} Shops · ${billingTotals.contractorsCount} Contractors`,
                color: '#c2622a',
              },
              {
                tag: 'RESIDENTIAL',
                label: 'Housing Units',
                value: `${housingStats.total} Units`,
                sub: `${housingStats.occupancyRate}% Occupancy Rate`,
                color: '#0d9488',
              },
              {
                tag: 'VACANCY',
                label: 'Vacant Residences',
                value: `${housingStats.vacant} Units`,
                sub: `${housingStats.occupied} Occupied units`,
                color: housingStats.vacant > 0 ? '#f59e0b' : '#64748b',
              },
              {
                tag: 'HANDOVER',
                label: 'Housing Clearances',
                value: `${clearanceStats.completed}/${clearanceStats.total}`,
                sub: `${clearanceStats.allotted} Officially Allotted`,
                color: '#8b5cf6',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderTop: `3px solid ${kpi.color}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                    {kpi.tag}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color, marginTop: 4 }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Major Comparison Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, marginBottom: 24 }}>
            {/* Housing Type Distribution Bar Chart */}
            <Card style={{ padding: 18 }}>
              <SectionTitle
                tag="Housing"
                title="Residential Units by House Type"
                subtitle="Occupied vs Vacant status across Type A through F"
              />
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={housingStats.typeChartData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="type" tick={{ fontSize: 12, fill: 'var(--text)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                  <Tooltip contentStyle={TooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="occupied" name="Occupied" stackId="a" fill="#2d4a3e" />
                  <Bar dataKey="vacant" name="Vacant" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Demand Note Revenue Share Pie Chart */}
            <Card style={{ padding: 18 }}>
              <SectionTitle
                tag="Commercial"
                title="Commercial Revenue Share"
                subtitle="Distribution across shop electricity, water/fixed, and contractor power"
              />
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={revenuePieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={96}
                    innerRadius={48}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                    label={({ name, percent }) => `${name.slice(0, 10)} ${(percent * 100).toFixed(0)}%`}
                  >
                    {revenuePieData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TooltipStyle}
                    formatter={(v) => [`Rs. ${Number(v).toLocaleString('en-IN')} (${((v / billingTotals.grandTotal) * 100).toFixed(1)}%)`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Department Clearance Pipeline Progress Chart */}
          <Card style={{ padding: 18, marginBottom: 24 }}>
            <SectionTitle
              tag="Clearance Pipeline"
              title="Department Handover Completion Status"
              subtitle="Completion readiness across Civil, Electrical, Housekeeping, and Estate Office"
            />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clearanceStats.stageData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="department" tick={{ fontSize: 12, fill: 'var(--text)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <Tooltip contentStyle={TooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" name="Completed Handovers" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Total Required" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. COMMERCIAL SHOPS VIEW
         ───────────────────────────────────────────────────────────── */}
      {subView === 'shops' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Active Commercial Shops', value: billingTotals.shopsCount, sub: 'Operating campus outlets', color: 'var(--green-900)' },
              { label: 'Total Shop Billing', value: `Rs. ${billingTotals.shopsTotal.toLocaleString('en-IN')}`, sub: `${selectedCycle} Demand`, color: '#0d9488' },
              { label: 'Shop Power Charges', value: `Rs. ${billingTotals.shopsElectricity.toLocaleString('en-IN')}`, sub: `${billingTotals.shopsUnits.toLocaleString('en-IN')} kWh`, color: '#3b82f6' },
              { label: 'Water & Fixed Charges', value: `Rs. ${billingTotals.shopsWater.toLocaleString('en-IN')}`, sub: 'Maintenance & fixed fees', color: '#c2622a' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderTop: `3px solid ${kpi.color}`,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Top 10 Shops Bar Chart */}
          <Card style={{ padding: 18, marginBottom: 20 }}>
            <SectionTitle
              tag="Commercial Demand"
              title="Top Commercial Shops by Demand"
              subtitle="Breakdown of Electricity, Water/Fixed, and Extras"
            />
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={topShopsChart} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} angle={-25} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <Tooltip contentStyle={TooltipStyle} formatter={(val) => `Rs. ${Number(val).toLocaleString('en-IN')}`} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Electricity" stackId="a" fill="#2d4a3e" />
                <Bar dataKey="Water & Fixed" stackId="a" fill="#3b82f6" />
                <Bar dataKey="Extras" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Top Outlets Leaderboard */}
          <Divider label="Top Commercial Consumers Leaderboard" />
          <div style={{ marginBottom: 24 }}>
            {leaderboard
              .filter((item) => item.type === 'shop')
              .slice(0, 8)
              .map((item, idx) => {
                const pct = Math.round((item.totalAmount / maxLeaderboardAmount) * 100)
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: `1.5px solid ${idx < 3 ? 'var(--green-700)' : 'var(--border)'}`,
                      background: idx < 3 ? 'rgba(45,74,62,0.05)' : 'var(--surface-2)',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        width: 44,
                        textAlign: 'center',
                        flexShrink: 0,
                        background: 'var(--surface)',
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                      }}
                    >
                      #{idx + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 750, fontSize: 14 }}>{item.name}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 99,
                            background: '#dcfce7',
                            color: '#166534',
                          }}
                        >
                          Shop
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                        Note: <strong>{item.noteNo}</strong> · Consumed: <strong>{item.units} kWh</strong>
                        {item.waterAmount > 0 && ` · Water/Fixed: Rs. ${item.waterAmount}`}
                        {item.expiryDate !== '-' && ` · Expiry: ${item.expiryDate}`}
                      </div>
                    </div>

                    <div style={{ width: 140, flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 850, color: 'var(--green-900)' }}>
                        Rs. {item.totalAmount.toLocaleString('en-IN')}
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', marginTop: 4 }}>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 99,
                            background: idx < 3 ? 'var(--green-800)' : '#3b82f6',
                            width: `${pct}%`,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. POWER CONTRACTORS VIEW
         ───────────────────────────────────────────────────────────── */}
      {subView === 'contractors' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Active Power Contractors', value: billingTotals.contractorsCount, sub: 'LT/HT direct feeds', color: '#c2622a' },
              { label: 'Total Contractor Billing', value: `Rs. ${billingTotals.contractorsTotal.toLocaleString('en-IN')}`, sub: `${selectedCycle} Power fees`, color: 'var(--green-900)' },
              { label: 'Contractor Power Draw', value: `${billingTotals.contractorsUnits.toLocaleString('en-IN')} kWh`, sub: 'Calculated tariff load', color: '#3b82f6' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderTop: `3px solid ${kpi.color}`,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          <Card style={{ padding: 18, marginBottom: 20 }}>
            <SectionTitle
              tag="Contractor Power"
              title="Contractor Electricity Consumption & Billed Amount"
              subtitle="Monthly power draw and calculated tariff across contractor meters"
            />
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={contractorChart} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <Tooltip contentStyle={TooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Units (kWh)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Amount (Rs)" fill="#c2622a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. HOUSING & OCCUPANCY VIEW
         ───────────────────────────────────────────────────────────── */}
      {subView === 'housing' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Total Housing Units', value: housingStats.total, sub: 'Institute residential inventory', color: 'var(--green-900)' },
              { label: 'Occupied Residences', value: housingStats.occupied, sub: `${housingStats.occupancyRate}% Occupancy`, color: '#166534' },
              { label: 'Vacant Residences', value: housingStats.vacant, sub: 'Available for allotment', color: housingStats.vacant > 0 ? '#ca8a04' : '#64748b' },
              { label: 'Occupancy Rate', value: `${housingStats.occupancyRate}%`, sub: `${housingStats.occupied} of ${housingStats.total} occupied`, color: '#3b82f6' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderTop: `3px solid ${kpi.color}`,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Housing Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, marginBottom: 24 }}>
            <Card style={{ padding: 18 }}>
              <SectionTitle
                tag="Housing Types"
                title="Units Breakdown by House Type"
                subtitle="Distribution of occupied and vacant housing units across campus"
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={housingStats.typeChartData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="type" tick={{ fontSize: 12, fill: 'var(--text)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                  <Tooltip contentStyle={TooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="occupied" name="Occupied" stackId="a" fill="#2d4a3e" />
                  <Bar dataKey="vacant" name="Vacant" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card style={{ padding: 18 }}>
              <SectionTitle
                tag="Occupancy Share"
                title="Overall Campus Housing Occupancy"
                subtitle="Proportion of occupied versus vacant accommodation"
              />
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={housingStats.occupancyPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {housingStats.occupancyPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color || PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TooltipStyle}
                    formatter={(val) => [`${val} Units (${((val / housingStats.total) * 100).toFixed(1)}%)`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Housing Register Table */}
          <Divider label="Housing Units & Allotment Register" />
          <Card noPad>
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 340px' }}>
                <Input
                  placeholder="Search house no, occupant, designation, employee code..."
                  value={housingSearch}
                  onChange={(e) => setHousingSearch(e.target.value)}
                  style={{ maxWidth: 320 }}
                />

                {/* Filter by Type */}
                <select
                  value={housingTypeFilter}
                  onChange={(e) => setHousingTypeFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Types</option>
                  {housingStats.typeChartData.map((t) => (
                    <option key={t.type} value={t.type}>
                      Type {t.type} ({t.total})
                    </option>
                  ))}
                </select>

                {/* Filter by Status */}
                <select
                  value={housingStatusFilter}
                  onChange={(e) => setHousingStatusFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="occupied">Occupied ({housingStats.occupied})</option>
                  <option value="vacant">Vacant ({housingStats.vacant})</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Showing <strong>{filteredHousing.length}</strong> of {housingStats.total} units
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 480 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>Type</th>
                    <th style={{ padding: '10px 14px' }}>House No</th>
                    <th style={{ padding: '10px 14px' }}>Block</th>
                    <th style={{ padding: '10px 14px' }}>Floor</th>
                    <th style={{ padding: '10px 14px' }}>Current Occupant</th>
                    <th style={{ padding: '10px 14px' }}>Designation</th>
                    <th style={{ padding: '10px 14px' }}>Empl Code</th>
                    <th style={{ padding: '10px 14px' }}>Occupation Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHousing.map((row, i) => {
                    const isOcc = row.status === 'occupied'
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 ? 'var(--surface-2)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '9px 14px', fontWeight: 700 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            Type {row.houseType}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px', fontWeight: 700 }}>{row.houseNo}</td>
                        <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{row.blockNo || '-'}</td>
                        <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{row.floor || '-'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 650 }}>
                          {row.currentOccupant?.occupantName || <span style={{ color: 'var(--text-3)' }}>None (Vacant)</span>}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)' }}>
                          {row.currentOccupant?.designation || '-'}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>
                          {row.currentOccupant?.emplCode || '-'}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>
                          {row.currentOccupant?.dateOfOccupation || '-'}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 99,
                              background: isOcc ? '#dcfce7' : '#fef3c7',
                              color: isOcc ? '#166534' : '#92400e',
                              textTransform: 'capitalize',
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. CLEARANCE PIPELINE VIEW
         ───────────────────────────────────────────────────────────── */}
      {subView === 'clearances' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Total Clearance Cases', value: clearanceStats.total, sub: 'Vacation handover pipeline', color: 'var(--green-900)' },
              { label: 'Completed Clearances', value: clearanceStats.completed, sub: 'All 4 stages approved', color: '#166534' },
              { label: 'In-Progress Handover', value: clearanceStats.inProgress, sub: 'Pending departmental signoff', color: clearanceStats.inProgress > 0 ? '#2563eb' : '#64748b' },
              { label: 'Officially Allotted', value: clearanceStats.allotted, sub: 'Keys handed over to user', color: '#8b5cf6' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderTop: `3px solid ${kpi.color}`,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Department Pipeline Handover Chart */}
          <Card style={{ padding: 18, marginBottom: 20 }}>
            <SectionTitle
              tag="Handover Workflow"
              title="Department Handover Stage Completion"
              subtitle="Progress tracking across Civil, Electrical, Housekeeping, and Estate Office"
            />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={clearanceStats.stageData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="department" tick={{ fontSize: 12, fill: 'var(--text)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                <Tooltip contentStyle={TooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" name="Completed Stages" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Total Required" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Clearances Register Table */}
          <Divider label="Clearance Cases Register" />
          <Card noPad>
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 300px' }}>
                <Input
                  placeholder="Search unit, allottee, employee code..."
                  value={clearanceSearch}
                  onChange={(e) => setClearanceSearch(e.target.value)}
                  style={{ maxWidth: 300 }}
                />
                <select
                  value={clearanceStatusFilter}
                  onChange={(e) => setClearanceStatusFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed ({clearanceStats.completed})</option>
                  <option value="in_progress">In Progress ({clearanceStats.inProgress})</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Showing <strong>{filteredClearances.length}</strong> clearance records
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 460 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>#</th>
                    <th style={{ padding: '10px 14px' }}>Unit</th>
                    <th style={{ padding: '10px 14px' }}>Allottee Name</th>
                    <th style={{ padding: '10px 14px' }}>Empl Code</th>
                    <th style={{ padding: '10px 14px' }}>Civil Stage</th>
                    <th style={{ padding: '10px 14px' }}>Electrical Stage</th>
                    <th style={{ padding: '10px 14px' }}>HK Stage</th>
                    <th style={{ padding: '10px 14px' }}>Estate Handover</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClearances.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{c.srNo || i + 1}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 700 }}>
                        {c.houseType} - {c.houseNo}
                      </td>
                      <td style={{ padding: '9px 14px', fontWeight: 650 }}>{c.allotteeName || '-'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>{c.emplCode || '-'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: String(c.civilStatus || '').toLowerCase().includes('complet') ? '#dcfce7' : '#fef3c7',
                            color: String(c.civilStatus || '').toLowerCase().includes('complet') ? '#166534' : '#92400e',
                            fontWeight: 600,
                          }}
                        >
                          {c.civilStatus || 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: String(c.electricalStatus || '').toLowerCase().includes('complet') ? '#dcfce7' : '#fef3c7',
                            color: String(c.electricalStatus || '').toLowerCase().includes('complet') ? '#166534' : '#92400e',
                            fontWeight: 600,
                          }}
                        >
                          {c.electricalStatus || 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: String(c.hkStatus || '').toLowerCase().includes('complet') ? '#dcfce7' : '#fef3c7',
                            color: String(c.hkStatus || '').toLowerCase().includes('complet') ? '#166534' : '#92400e',
                            fontWeight: 600,
                          }}
                        >
                          {c.hkStatus || 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>
                        {c.keyHandedOverToAllotteeDate || c.estateDate3 || '-'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: c.status === 'completed' ? '#dcfce7' : '#dbeafe',
                            color: c.status === 'completed' ? '#166534' : '#1e40af',
                            textTransform: 'capitalize',
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          COMMON OUTLETS REGISTER TABLE (Visible on Overview, Shops, Contractors)
         ───────────────────────────────────────────────────────────── */}
      {(subView === 'overview' || subView === 'shops' || subView === 'contractors') && (
        <div style={{ marginTop: 24 }}>
          <Divider label="Commercial Outlets & Contractors Demand Register" />
          <Card noPad>
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 300px' }}>
                <Input
                  placeholder="Search outlet name, demand note no..."
                  value={outletSearch}
                  onChange={(e) => setOutletSearch(e.target.value)}
                  style={{ maxWidth: 300 }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { key: 'all', label: `All (${allOutlets.length})` },
                    { key: 'shop', label: `Shops (${shops.length})` },
                    { key: 'contractor', label: `Contractors (${contractors.length})` },
                  ].map((tab) => (
                    <Btn
                      key={tab.key}
                      size="sm"
                      variant={outletFilter === tab.key ? 'primary' : 'secondary'}
                      onClick={() => setOutletFilter(tab.key)}
                    >
                      {tab.label}
                    </Btn>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Showing <strong>{filteredOutlets.length}</strong> outlets
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 460 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>#</th>
                    <th style={{ padding: '10px 14px' }}>Category</th>
                    <th style={{ padding: '10px 14px' }}>Outlet / Contractor</th>
                    <th style={{ padding: '10px 14px' }}>Note No</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Units (kWh)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Electricity (Rs)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Water/Fixed (Rs)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Demand (Rs)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutlets.map((row, i) => (
                    <tr
                      key={row.id + row.type}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{i + 1}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: row.type === 'shop' ? '#dcfce7' : '#ffedd5',
                            color: row.type === 'shop' ? '#166534' : '#9a3412',
                          }}
                        >
                          {row.type === 'shop' ? 'Shop' : 'Contractor'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', fontWeight: 650 }}>{row.name}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <code style={{ fontSize: 11, background: 'var(--surface)', padding: '2px 5px', borderRadius: 4 }}>
                          {row.noteNo}
                        </code>
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {row.units > 0 ? row.units.toLocaleString('en-IN') : '-'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--text-3)' }}>
                        Rs. {row.rate}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        {row.electricityAmount > 0 ? `Rs. ${row.electricityAmount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        {row.waterAmount > 0 ? `Rs. ${row.waterAmount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--green-900)' }}>
                        Rs. {row.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
