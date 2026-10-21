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
const MEDAL = ['🥇', '🥈', '🥉']
const TooltipStyle = { borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)' }

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span>{title}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

export default function EstateBillingPanel() {
  const [cycles, setCycles] = useState([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [shops, setShops] = useState([])
  const [contractors, setContractors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all') // all | shops | contractors

  // 1. Fetch Cycles
  useEffect(() => {
    let alive = true
    estateApi.getCycles()
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res.data) ? res.data : []
        setCycles(list)
        if (list.length > 0 && !selectedCycle) {
          const active = list.find((c) => c.is_active) || list[0]
          setSelectedCycle(active.month)
        }
      })
      .catch(() => { })
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

  // Process Shops Data
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
      }
    })
  }, [shops])

  // Process Contractors Data
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

  // Metrics Totals
  const totals = useMemo(() => {
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

  // Top 10 Shops Chart
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
        'Amount (₹)': c.totalAmount,
        'Units (kWh)': Math.round(c.units),
      }))
  }, [contractorsProcessed])

  // Revenue Pie Chart
  const revenuePieData = useMemo(() => {
    return [
      { name: 'Shop Electricity', value: totals.shopsElectricity },
      { name: 'Shop Water/Fixed', value: totals.shopsWater },
      { name: 'Contractor Power', value: totals.contractorsTotal },
      { name: 'Miscellaneous/Extras', value: totals.shopsExtras },
    ].filter((d) => d.value > 0)
  }, [totals])

  // Top Consumers Leaderboard (combined)
  const leaderboard = useMemo(() => {
    return [...allOutlets]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10)
  }, [allOutlets])

  const maxLeaderboardAmount = leaderboard[0]?.totalAmount || 1

  // Filtered Table Rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOutlets.filter((row) => {
      if (filterType !== 'all' && row.type !== filterType) return false
      if (!q) return true
      return row.name.toLowerCase().includes(q) || String(row.noteNo).toLowerCase().includes(q)
    })
  }, [allOutlets, filterType, search])

  const handleExportCSV = () => {
    const filename = `estate_billing_insights_${selectedCycle || todayISO()}.csv`
    const headers = [
      'Type',
      'Name',
      'Demand Note No',
      'Units (kWh)',
      'Rate (₹)',
      'Electricity (₹)',
      'Water / Fixed (₹)',
      'Extras (₹)',
      'Total Amount (₹)',
    ]
    const rows = filteredRows.map((r) => [
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

  if (loading && !shops.length && !contractors.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      {/* Cycle Selector & Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          padding: '12px 18px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            📅 Billing Month Cycle:
          </span>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--green-900)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {cycles.map((c) => (
              <option key={c.id || c.month} value={c.month}>
                {c.label || c.month} {c.is_active ? '★ (Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn size="sm" variant="secondary" onClick={handleExportCSV}>
            📥 Export Estate CSV
          </Btn>
          <a href="/admin/estate" style={{ textDecoration: 'none' }}>
            <Btn size="sm" variant="primary">
              ⚡ Open Estate Module
            </Btn>
          </a>
        </div>
      </div>

      {error && (
        <Card style={{ marginBottom: 16, borderColor: '#fecaca', background: '#fff1f2' }}>
          <div style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{error}</div>
        </Card>
      )}

      {/* KPI Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { label: '🏪 Commercial Shops', value: totals.shopsCount, sub: 'Campus outlets', color: 'var(--green-800)' },
          { label: '⚡ Power Contractors', value: totals.contractorsCount, sub: 'LT/HT power feeds', color: '#c2622a' },
          { label: '💡 Total Power', value: `${totals.totalUnits.toLocaleString('en-IN')} kWh`, sub: `Shops: ${totals.shopsUnits} | Ctr: ${totals.contractorsUnits}`, color: '#3b82f6' },
          { label: '💰 Shop Billing', value: `₹${totals.shopsTotal.toLocaleString('en-IN')}`, sub: `₹${totals.shopsElectricity.toLocaleString('en-IN')} power`, color: '#0d9488' },
          { label: '🔌 Contractor Power', value: `₹${totals.contractorsTotal.toLocaleString('en-IN')}`, sub: 'Multi-meter tariff', color: '#8b5cf6' },
          { label: '🏛️ Total Demand Raised', value: `₹${totals.grandTotal.toLocaleString('en-IN')}`, sub: `${selectedCycle} Billing`, color: 'var(--green-900)' },
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
            <div style={{ fontSize: 20, fontWeight: 850, color: kpi.color }}>
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

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, marginBottom: 24 }}>
        {/* Top Shops Bar Chart */}
        <Card style={{ padding: 18 }}>
          <SectionTitle
            icon="📊"
            title="Top Commercial Shops by Demand"
            subtitle="Breakdown of Electricity, Water/Fixed, and Extras"
          />
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={topShopsChart} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} angle={-25} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
              <Tooltip contentStyle={TooltipStyle} formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Electricity" stackId="a" fill="#2d4a3e" />
              <Bar dataKey="Water & Fixed" stackId="a" fill="#3b82f6" />
              <Bar dataKey="Extras" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue Distribution Pie Chart */}
        <Card style={{ padding: 18 }}>
          <SectionTitle
            icon="🥧"
            title="Demand Note Revenue Share"
            subtitle="Proportion of commercial power vs water vs contractor feeds"
          />
          <ResponsiveContainer width="100%" height={290}>
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
                formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')} (${((v / totals.grandTotal) * 100).toFixed(1)}%)`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Contractor Electricity Consumption Bar Chart */}
      <Card style={{ padding: 18, marginBottom: 24 }}>
        <SectionTitle
          icon="⚡"
          title="Contractor Electricity Consumption & Billed Amount"
          subtitle="Monthly power draw and calculated tariff across contractor meters"
        />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={contractorChart} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <Tooltip contentStyle={TooltipStyle} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Units (kWh)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Amount (₹)" fill="#c2622a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Top 10 Consumers Leaderboard */}
      <Divider label="🏆 Top Commercial Consumers Leaderboard" />
      <div style={{ marginBottom: 28 }}>
        {leaderboard.map((item, idx) => {
          const pct = Math.round((item.totalAmount / maxLeaderboardAmount) * 100)
          const medal = MEDAL[idx] || `#${idx + 1}`
          return (
            <div
              key={item.id + item.type}
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
              <div style={{ fontSize: idx < 3 ? 22 : 15, width: 32, textAlign: 'center', flexShrink: 0 }}>
                {medal}
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
                      background: item.type === 'shop' ? '#dcfce7' : '#ffedd5',
                      color: item.type === 'shop' ? '#166534' : '#9a3412',
                    }}
                  >
                    {item.typeLabel}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                  Note: <strong>{item.noteNo}</strong> · Consumed: <strong>{item.units} kWh</strong>
                  {item.waterAmount > 0 && ` · Water/Fixed: ₹${item.waterAmount}`}
                </div>
              </div>

              <div style={{ width: 140, flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 850, color: 'var(--green-900)' }}>
                  ₹{item.totalAmount.toLocaleString('en-IN')}
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

      {/* Comprehensive Outlets Table */}
      <Divider label="📋 Campus Outlets Demand Register" />
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'all', label: 'All (34)' },
                { key: 'shop', label: 'Shops (29)' },
                { key: 'contractor', label: 'Contractors (5)' },
              ].map((tab) => (
                <Btn
                  key={tab.key}
                  size="sm"
                  variant={filterType === tab.key ? 'primary' : 'secondary'}
                  onClick={() => setFilterType(tab.key)}
                >
                  {tab.label}
                </Btn>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong>{filteredRows.length}</strong> outlets
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>#</th>
                <th style={{ padding: '10px 14px' }}>Category</th>
                <th style={{ padding: '10px 14px' }}>Outlet / Contractor</th>
                <th style={{ padding: '10px 14px' }}>Note No</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Units (kWh)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Electricity (₹)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Water/Fixed (₹)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Demand (₹)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
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
                    ₹{row.rate}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    {row.electricityAmount > 0 ? `₹${row.electricityAmount.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    {row.waterAmount > 0 ? `₹${row.waterAmount.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--green-900)' }}>
                    ₹{row.totalAmount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
