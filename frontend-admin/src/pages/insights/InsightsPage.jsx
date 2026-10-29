import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { reportsAPI } from '../../api/inventory'
import { Btn, Card, ExportDropdown, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'
import EstateBillingPanel from './EstateBillingPanel'
import { exportReport } from '../../shared/exportHelper'
import { todayISO } from '../../shared/utils'

const HORTI_PALETTE = ['#15803d', '#059669', '#16a34a', '#84cc16', '#0d9488', '#b45309', '#d97706', '#475569']
const HK_PALETTE = ['#2d4a3e', '#c2622a', '#3b82f6', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899', '#64748b']
const MEDAL = ['🥇', '🥈', '🥉']
const TIER_COLORS = { S: '#f59e0b', A: '#15803d', B: '#3b82f6', C: '#6b7280', D: '#dc2626' }

const DEPARTMENTS = [
  { key: 'housekeeping', label: '🧹 Housekeeping', badge: 'HK' },
  { key: 'horticulture', label: '🌱 Horticulture', badge: 'Horti' },
  { key: 'estate_billing', label: '⚡ Estate & Billing', badge: 'Estate' },
]

const HK_VIEW_OPTIONS = [
  { key: 'caretaker', label: '👷 Staff / Caretaker' },
  { key: 'workers', label: '🧹 HK Worker Performance' },
  { key: 'area_hk', label: '🏢 Area-wise HK' },
  { key: 'area_inventory', label: '📦 Inventory by Area' },
  { key: 'top_items', label: '🔝 Top Consumed Supplies' },
]

const HORTI_VIEW_OPTIONS = [
  { key: 'supervisor', label: '👨‍🌾 Supervisor Performance' },
  { key: 'workers', label: '🌱 Worker / Mali Performance' },
  { key: 'area_horti', label: '🌳 Zone & Area Performance' },
  { key: 'area_inventory', label: '📦 Zone-wise Inventory' },
  { key: 'top_items', label: '🔝 Top Consumed Items' },
]

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

const HK_AREA_CLASS_OPTIONS = [
  { key: 'all', label: 'All Areas' },
  { key: 'hostels', label: 'Hostels' },
  { key: 'academic', label: 'Academic Blocks' },
  { key: 'others', label: 'Others' },
]

function computeFairScore(row, poolAvg) {
  const raw = Number(row.fair_score || 0)
  const total = Number(row.total || row.quantity || 1)
  const avg = poolAvg > 0 ? poolAvg : 1
  const confidence = Math.min(1, Math.log(total + 1) / Math.log(avg + 1))
  return raw * confidence
}

function getTier(score) {
  if (score >= 85) return 'S'
  if (score >= 70) return 'A'
  if (score >= 50) return 'B'
  if (score >= 30) return 'C'
  return 'D'
}

function formatNum(v) { return Number(v || 0).toLocaleString('en-IN') }

function FadeSection({ delay = 0, children }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}>
      {children}
    </div>
  )
}

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

function EmptyState({ message = 'No data for the selected filters.' }) {
  return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '36px', textAlign: 'center' }}>{message}</div>
}

function ProgressPill({ value, label, color }) {
  const pct = Math.min(100, Math.max(0, Number(value || 0)))
  return (
    <div style={{ textAlign: 'center', minWidth: 50 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{pct.toFixed(0)}%</div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', marginTop: 3, width: 50 }}>
        <div style={{ height: 4, borderRadius: 99, background: color, width: `${pct}%`, transition: 'width 0.6s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function LeaderboardCard({ rank, name, subtitle, fairScore, completionPct, attendancePct, total, done, isWinner, isHorti = false }) {
  const tier = getTier(fairScore)
  const medal = MEDAL[rank] || `#${rank + 1}`
  const activeColor = isHorti ? '#15803d' : '#2d4a3e'
  const activeBg = isHorti ? 'rgba(21,128,61,0.08)' : 'rgba(45,74,62,0.07)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
      border: `1.5px solid ${isWinner ? activeColor : 'var(--border)'}`,
      background: isWinner ? activeBg : 'var(--surface-2)', marginBottom: 8,
    }}>
      <div style={{ fontSize: rank < 3 ? 22 : 15, width: 32, textAlign: 'center', flexShrink: 0 }}>{medal}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {subtitle && <span>{subtitle}</span>}
          {subtitle && <span>•</span>}
          <span>Tasks: <strong>{done}/{total}</strong></span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <ProgressPill value={completionPct} label="Completion" color={activeColor} />
        <ProgressPill value={attendancePct} label="Attendance" color="#3b82f6" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: TIER_COLORS[tier], background: TIER_COLORS[tier] + '18', borderRadius: 8, padding: '3px 9px' }}>{tier}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Tier</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{Number(fairScore).toFixed(1)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Fair Score</div>
        </div>
      </div>
    </div>
  )
}

function InvLeaderCard({ rank, name, subtitle, total, consumables, assets, transactions, isHorti = false }) {
  const activeColor = isHorti ? '#15803d' : '#2d4a3e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', marginBottom: 8 }}>
      <div style={{ fontSize: rank < 3 ? 22 : 15, width: 32, textAlign: 'center' }}>{MEDAL[rank] || `#${rank + 1}`}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
          {subtitle ? `${subtitle} • ` : ''}{transactions} issues / requests
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        {[['Consumables', consumables, '#c2622a'], ['Assets / Tools', assets, '#3b82f6'], ['Total Qty', total, activeColor]].map(([l, v, c]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{formatNum(v)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TooltipStyle = { borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)' }

function MultiBarChart({ data, bars, height = 300, palette = HK_PALETTE }) {
  if (!data?.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} interval={0} angle={-28} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={TooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={palette[i % palette.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function FairPieChart({ data, dataKey = 'fair_score', nameKey = 'name', palette = HK_PALETTE }) {
  if (!data?.length) return <EmptyState />
  const total = data.reduce((s, d) => s + Number(d[dataKey] || 0), 0)
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={96} innerRadius={46} dataKey={dataKey} nameKey={nameKey} paddingAngle={2}
          label={({ name, percent }) => `${name?.length > 10 ? name.slice(0, 10) + '…' : name} ${(percent * 100).toFixed(0)}%`}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Pie>
        <Tooltip contentStyle={TooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function PerformanceRadar({ data, palette = HK_PALETTE }) {
  if (!data?.length) return <EmptyState />
  const top5 = data.slice(0, 5)
  const keys = top5.map(d => (d.name || '').split(' ')[0] || 'Item')
  const radarData = [
    { metric: 'Completion', ...Object.fromEntries(top5.map((d, i) => [keys[i], Number(d.completion_pct || 0)])) },
    { metric: 'Attendance', ...Object.fromEntries(top5.map((d, i) => [keys[i], Number(d.attendance_pct || 0)])) },
    { metric: 'Fair Score', ...Object.fromEntries(top5.map((d, i) => [keys[i], Number(d.fair_score || 0)])) },
  ]
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: 'var(--text-3)' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
        <Tooltip contentStyle={TooltipStyle} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {top5.map((d, i) => (
          <Radar key={i} name={keys[i]} dataKey={keys[i]}
            stroke={palette[i % palette.length]} fill={palette[i % palette.length]} fillOpacity={0.15} />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  )
}

function FairnessNote({ isHorti = false }) {
  return (
    <div style={{
      background: isHorti ? 'rgba(21,128,61,0.08)' : 'rgba(45,74,62,0.07)',
      border: `1px solid ${isHorti ? 'rgba(21,128,61,0.25)' : 'rgba(45,74,62,0.2)'}`,
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', marginBottom: 16
    }}>
      ⚖️ <strong>Fair Comparison Engine:</strong> Volume-confidence-weighted evaluation balancing task completion % and staff attendance %. Tiers: S ≥ 85 · A ≥ 70 · B ≥ 50 · C ≥ 30 · D &lt; 30.
    </div>
  )
}

function GenericPerformanceInsights({ rows, nameField, subtitleBuilder, tableColumns, isHorti = false }) {
  const palette = isHorti ? HORTI_PALETTE : HK_PALETTE
  const totalPool = useMemo(() => rows.reduce((s, r) => s + Number(r.total || 1), 0) / Math.max(rows.length, 1), [rows])
  const ranked = useMemo(() =>
    [...rows].map(r => ({ ...r, _fair: computeFairScore(r, totalPool) })).sort((a, b) => b._fair - a._fair),
    [rows, totalPool])
  const chartData = ranked.slice(0, 12).map(r => ({
    name: r[nameField] || '-',
    completion_pct: Number(r.completion_pct || 0),
    attendance_pct: Number(r.attendance_pct || 0),
    fair_score: Number(r.fair_score || 0),
  }))

  if (!rows.length) return <EmptyState />

  return (
    <>
      <FairnessNote isHorti={isHorti} />
      <FadeSection delay={0}>
        <SectionTitle icon="🏆" title="Leaderboard" subtitle="Ranked by volume-adjusted Fair Score" />
        {ranked.slice(0, 10).map((r, i) => (
          <LeaderboardCard key={i} rank={i}
            name={r[nameField] || '-'}
            subtitle={subtitleBuilder ? subtitleBuilder(r) : ''}
            fairScore={r._fair}
            completionPct={r.completion_pct}
            attendancePct={r.attendance_pct}
            total={r.total || 0}
            done={r.done || 0}
            isWinner={i === 0}
            isHorti={isHorti}
          />
        ))}
      </FadeSection>

      <FadeSection delay={130}>
        <Divider label="📊 Bar Chart Comparison" />
        <SectionTitle icon="📊" title="Comparative Performance Chart" subtitle="Completion %, Attendance % and Fair Score" />
        <MultiBarChart data={chartData} bars={[
          { key: 'completion_pct', label: 'Completion %' },
          { key: 'attendance_pct', label: 'Attendance %' },
          { key: 'fair_score', label: 'Fair Score' },
        ]} height={310} palette={palette} />
      </FadeSection>

      <FadeSection delay={260}>
        <Divider label="🥧 Proportional Distribution" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <Card>
            <SectionTitle icon="🥧" title="Fair Score Share" />
            <FairPieChart data={chartData} dataKey="fair_score" palette={palette} />
          </Card>
          <Card>
            <SectionTitle icon="✅" title="Completion % Share" />
            <FairPieChart data={chartData} dataKey="completion_pct" palette={palette} />
          </Card>
          <Card>
            <SectionTitle icon="📅" title="Attendance % Share" />
            <FairPieChart data={chartData} dataKey="attendance_pct" palette={palette} />
          </Card>
        </div>
      </FadeSection>

      <FadeSection delay={380}>
        <Divider label="🕸️ Radar Analysis" />
        <Card>
          <SectionTitle icon="🕸️" title="Top 5 Multi-Metric Radar" subtitle="Simultaneous view of completion, attendance, and fair score" />
          <PerformanceRadar data={chartData} palette={palette} />
        </Card>
      </FadeSection>

      <FadeSection delay={500}>
        <Divider label="📋 Complete Data Table" />
        <Card style={{ overflow: 'auto' }}>
          <SectionTitle icon="📋" title="Full Performance Table" subtitle="Detailed breakdown of all records" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {tableColumns.map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const tier = getTier(r._fair)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{MEDAL[i] || `#${i + 1}`}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r[nameField] || '-'}</td>
                    {r.pay_code !== undefined && <td style={{ padding: '9px 12px' }}>{r.pay_code || '-'}</td>}
                    {r.zone_name !== undefined && <td style={{ padding: '9px 12px', color: 'var(--text-2)' }}>{r.zone_name || '-'}</td>}
                    {r.worker_count !== undefined && <td style={{ padding: '9px 12px' }}>{r.worker_count || 1}</td>}
                    <td style={{ padding: '9px 12px' }}>{r.total || 0}</td>
                    <td style={{ padding: '9px 12px', color: isHorti ? '#15803d' : '#2d4a3e', fontWeight: 600 }}>{r.done || 0}</td>
                    <td style={{ padding: '9px 12px', color: '#c2622a' }}>{r.pending || 0}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ color: Number(r.completion_pct) >= 70 ? (isHorti ? '#15803d' : '#2d4a3e') : Number(r.completion_pct) >= 40 ? '#c2622a' : '#dc2626', fontWeight: 700 }}>
                        {Number(r.completion_pct || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px' }}>{Number(r.attendance_pct || 0).toFixed(1)}%</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{r._fair.toFixed(1)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ background: TIER_COLORS[tier] + '22', color: TIER_COLORS[tier], fontWeight: 800, borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>{tier}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </FadeSection>
    </>
  )
}

function InventoryAreaPanel({ rows, totals, isHorti = false }) {
  const palette = isHorti ? HORTI_PALETTE : HK_PALETTE
  const sorted = [...rows].sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
  const chartData = sorted.slice(0, 12).map(r => ({
    name: r.area_name,
    consumables: Number(r.consumable_qty || 0),
    assets: Number(r.asset_qty || 0),
    total: Number(r.total_qty || 0),
  }))

  return (
    <>
      <FadeSection delay={0}>
        <SectionTitle icon="🏆" title={isHorti ? "Zone-wise Inventory Consumption" : "Area Consumption Leaderboard"} subtitle={isHorti ? "Horticulture zones ranked by equipment & consumables issued" : "Areas ranked by total inventory consumed"} />
        {sorted.map((r, i) => (
          <InvLeaderCard key={i} rank={i} name={r.area_name} total={r.total_qty}
            consumables={r.consumable_qty} assets={r.asset_qty} transactions={r.transactions} isHorti={isHorti} />
        ))}
      </FadeSection>

      <FadeSection delay={130}>
        <Divider label="📊 Bar Chart" />
        <MultiBarChart data={chartData} bars={[
          { key: 'consumables', label: 'Consumables' },
          { key: 'assets', label: 'Assets / Tools' },
          { key: 'total', label: 'Total Issued' },
        ]} height={300} palette={palette} />
      </FadeSection>

      <FadeSection delay={260}>
        <Divider label="🥧 Proportional Share" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card>
            <SectionTitle icon="🥧" title={isHorti ? "Total Quantity Share by Zone" : "Total Qty Share by Area"} />
            <FairPieChart data={chartData} dataKey="total" palette={palette} />
          </Card>
          <Card>
            <SectionTitle icon="🥧" title="Consumables vs Assets" />
            <FairPieChart
              data={[
                { name: 'Consumables', total: Number(totals?.consumable_qty || 0) },
                { name: 'Assets / Tools', total: Number(totals?.asset_qty || 0) },
              ]}
              dataKey="total" palette={palette} />
          </Card>
        </div>
      </FadeSection>

      <FadeSection delay={380}>
        <Divider label="Summary Totals" />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[['🔄 Issues & Requests', totals?.transactions, '#3b82f6'], ['📦 Total Issued', totals?.total_qty, isHorti ? '#15803d' : '#2d4a3e'],
          ['🧴 Consumables', totals?.consumable_qty, '#c2622a'], ['🛠 Assets / Equipment', totals?.asset_qty, '#8b5cf6']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', textAlign: 'center', minWidth: 140 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{formatNum(v)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </FadeSection>
    </>
  )
}

function TopItemsPanel({ rows, isHorti = false }) {
  const palette = isHorti ? HORTI_PALETTE : HK_PALETTE
  const sorted = [...rows].sort((a, b) => Number(b.quantity) - Number(a.quantity))
  const totalQty = sorted.reduce((s, r) => s + Number(r.quantity || 0), 0)
  const chartData = sorted.slice(0, 12).map(r => ({
    name: r.item_name?.length > 18 ? r.item_name.slice(0, 16) + '…' : r.item_name,
    quantity: Number(r.quantity || 0),
    transactions: Number(r.transactions || 0),
  }))

  if (!rows.length) return <EmptyState message={isHorti ? "No horticulture items consumed in this period." : "No items consumed in this period."} />

  return (
    <>
      <FadeSection delay={0}>
        <SectionTitle icon="🏆" title={isHorti ? "Top Consumed Horticulture Items" : "Top Items Leaderboard"} subtitle={isHorti ? "Garden equipment, fuels, oils & agricultural supplies" : "Most consumed inventory items this period"} />
        {sorted.slice(0, 10).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', marginBottom: 8 }}>
            <div style={{ fontSize: i < 3 ? 22 : 15, width: 32, textAlign: 'center' }}>{MEDAL[i] || `#${i + 1}`}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.item_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {r.item_type || 'Consumable'} • {r.areas_count || (r.areas || []).length || 0} locations
              </div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: isHorti ? '#15803d' : '#2d4a3e' }}>
                {formatNum(r.quantity)} {r.unit || 'units'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.transactions} transactions</div>
            </div>
            <div style={{ width: 68 }}>
              <div style={{ height: 5, borderRadius: 99, background: 'var(--border)' }}>
                <div style={{ height: 5, borderRadius: 99, background: palette[i % palette.length], width: `${totalQty > 0 ? (r.quantity / totalQty) * 100 : 0}%`, transition: 'width 0.6s' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{totalQty > 0 ? ((r.quantity / totalQty) * 100).toFixed(1) : 0}%</div>
            </div>
          </div>
        ))}
      </FadeSection>

      <FadeSection delay={130}>
        <Divider label="📊 Bar Chart" />
        <MultiBarChart data={chartData} bars={[
          { key: 'quantity', label: 'Quantity' },
          { key: 'transactions', label: 'Transactions' },
        ]} height={300} palette={palette} />
      </FadeSection>

      <FadeSection delay={260}>
        <Divider label="🥧 Item Consumption Share" />
        <Card>
          <SectionTitle icon="🥧" title={isHorti ? "Horticulture Supplies Consumption Share" : "Item Consumption Share"} />
          <FairPieChart data={chartData} dataKey="quantity" palette={palette} />
        </Card>
      </FadeSection>
    </>
  )
}

export default function InsightsPage({ embedded = false, defaultDepartment = null, hideDepartmentSelector = false }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const isHorticultureManager = user?.role === 'horticulture_manager'
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const isEstateOffice = user?.role === 'estate_office' || user?.actual_role === 'estate_office' || user?.username === 'estate.office'
  const isHKInventoryManager = user?.role === 'hk_inventory_manager'

  // Resolve initial department
  const paramDept = searchParams.get('department')
  const initialDept = defaultDepartment || (
    isHorticultureManager ? 'horticulture' :
    isHostelOffice || isHKInventoryManager ? 'housekeeping' :
    isEstateOffice ? 'estate_billing' :
    paramDept && ['housekeeping', 'horticulture', 'estate_billing'].includes(paramDept) ? paramDept :
    'housekeeping'
  )

  const [department, setDepartment] = useState(initialDept)
  const isHorti = department === 'horticulture'

  const [range, setRange] = useState('weekly')
  const [areaClass, setAreaClass] = useState(isHostelOffice ? 'hostels' : 'all')
  const [selectedZone, setSelectedZone] = useState('all')
  const [activeView, setActiveView] = useState(isHorti ? 'supervisor' : department === 'estate_billing' ? 'estate_billing' : 'caretaker')
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // View Options depending on active department
  const activeViewOptions = useMemo(() => {
    if (department === 'estate_billing') {
      return [{ key: 'estate_billing', label: '⚡ Estate & Billing Insights' }]
    }
    if (department === 'horticulture') {
      return HORTI_VIEW_OPTIONS
    }
    return HK_VIEW_OPTIONS
  }, [department])

  // Reset activeView when department changes
  useEffect(() => {
    if (department === 'estate_billing') {
      setActiveView('estate_billing')
    } else if (department === 'horticulture') {
      if (!HORTI_VIEW_OPTIONS.some(v => v.key === activeView)) {
        setActiveView('supervisor')
      }
    } else {
      if (!HK_VIEW_OPTIONS.some(v => v.key === activeView)) {
        setActiveView('caretaker')
      }
    }
  }, [department])

  // Load insights from backend
  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const params = {
          range,
          department,
        }
        if (department === 'horticulture') {
          if (selectedZone && selectedZone !== 'all') {
            params.zone = selectedZone
          }
        } else {
          params.area_class = isHostelOffice ? 'hostels' : areaClass
        }

        const { data } = await reportsAPI.getDashboardInsights(params)
        if (!alive) return
        setInsights(data || null)
      } catch (e) {
        if (!alive) return
        setError(e?.response?.data?.detail || 'Failed to load insights data.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [range, department, areaClass, selectedZone, isHostelOffice])

  // Extract response collections
  const caretakerRows = Array.isArray(insights?.caretaker_supervisor_performance?.rows) ? insights.caretaker_supervisor_performance.rows : []
  const workerRows = Array.isArray(insights?.worker_performance?.rows) ? insights.worker_performance.rows : []
  const areaRows = Array.isArray(insights?.area_performance?.rows) ? insights.area_performance.rows : []
  const invAreaRows = Array.isArray(insights?.inventory_consumption?.areas) ? insights.inventory_consumption.areas : []
  const topItemRows = Array.isArray(insights?.inventory_consumption?.top_items) ? insights.inventory_consumption.top_items : []
  const consumptionTotals = insights?.inventory_consumption?.totals || {}
  const availableZones = Array.isArray(insights?.zones) ? insights.zones : []

  // Dynamic zone options
  const zoneOptions = useMemo(() => {
    const list = [{ key: 'all', label: 'All Zones' }]
    availableZones.forEach(z => {
      let shortLabel = z.name
      if (shortLabel.includes('Academic')) shortLabel = 'Academic & Director'
      else if (shortLabel.includes('Housing')) shortLabel = 'Housing & Hostel'
      else if (shortLabel.includes('Research')) shortLabel = 'Research Park'
      list.push({ key: z.name, label: shortLabel })
    })
    return list
  }, [availableZones])

  const handleExportInsights = async (format) => {
    const day = todayISO()
    const viewLabel = activeViewOptions.find((v) => v.key === activeView)?.label || activeView
    const filterDesc = isHorti ? `Zone: ${selectedZone.toUpperCase()}` : `Area: ${areaClass.toUpperCase()}`

    const exportData = {
      filename: `${isHorti ? 'horticulture' : 'housekeeping'}_insights_${activeView}_${range}_${day}`,
      module: isHorti ? 'Horticulture Analytics & Insights' : 'Housekeeping Analytics & Insights',
      title: `${isHorti ? 'Horticulture ' : ''}${viewLabel} Report`,
      subtitle: `Period: ${range.toUpperCase()} • ${filterDesc} • Date: ${day}`,
      metadata: [
        { label: 'Department', value: isHorti ? 'Horticulture' : 'Housekeeping' },
        { label: 'View', value: viewLabel },
        { label: 'Period Range', value: range.toUpperCase() },
        { label: isHorti ? 'Zone Filter' : 'Area Class', value: isHorti ? selectedZone : areaClass },
        { label: 'Export Date', value: day },
      ],
      stats: [],
      headers: [],
      rows: [],
    }

    if (activeView === 'supervisor' || activeView === 'caretaker') {
      const avgScore = caretakerRows.length
        ? (caretakerRows.reduce((a, b) => a + Number(b.fair_score || 0), 0) / caretakerRows.length).toFixed(1)
        : '0.0'
      exportData.stats = [
        { label: isHorti ? 'Total Supervisors' : 'Total Staff', value: caretakerRows.length },
        { label: 'Avg Fair Score', value: avgScore },
      ]
      exportData.headers = isHorti
        ? ['Supervisor', 'Pay Code', 'Assigned Zone', 'Assigned Workers', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']
        : ['Staff / Caretaker', 'Pay Code', 'Role', 'Areas', 'Worker Count', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']

      exportData.rows = caretakerRows.map((r) => [
        r.staff_name || '-',
        r.pay_code || '-',
        isHorti ? (r.zone_name || (r.areas || []).join(' | ') || '-') : (r.role || '-'),
        isHorti ? (r.worker_count || 0) : ((r.areas || []).join(' | ') || '-'),
        isHorti ? (r.total || 0) : (r.worker_count || 0),
        isHorti ? (r.done || 0) : (r.total || 0),
        isHorti ? (r.pending || 0) : (r.done || 0),
        isHorti ? `${Number(r.completion_pct || 0).toFixed(1)}%` : (r.pending || 0),
        isHorti ? `${Number(r.attendance_pct || 0).toFixed(1)}%` : `${Number(r.completion_pct || 0).toFixed(1)}%`,
        isHorti ? Number(r.fair_score || 0).toFixed(2) : `${Number(r.attendance_pct || 0).toFixed(1)}%`,
      ])
    } else if (activeView === 'workers') {
      const avgScore = workerRows.length
        ? (workerRows.reduce((a, b) => a + Number(b.fair_score || 0), 0) / workerRows.length).toFixed(1)
        : '0.0'
      exportData.stats = [
        { label: isHorti ? 'Total Malis / Workers' : 'Total Workers', value: workerRows.length },
        { label: 'Avg Fair Score', value: avgScore },
      ]
      exportData.headers = isHorti
        ? ['Worker / Mali', 'Pay Code', 'Zone', 'Assigned Areas', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']
        : ['Worker', 'Pay Code', 'Areas', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']

      exportData.rows = workerRows.map((r) => [
        r.worker_name || '-',
        r.pay_code || '-',
        isHorti ? (r.zone_name || '-') : ((r.areas || []).join(' | ') || '-'),
        isHorti ? ((r.areas || []).join(' | ') || '-') : (r.total || 0),
        isHorti ? (r.total || 0) : (r.done || 0),
        isHorti ? (r.done || 0) : (r.pending || 0),
        isHorti ? (r.pending || 0) : `${Number(r.completion_pct || 0).toFixed(1)}%`,
        isHorti ? `${Number(r.completion_pct || 0).toFixed(1)}%` : `${Number(r.attendance_pct || 0).toFixed(1)}%`,
        isHorti ? `${Number(r.attendance_pct || 0).toFixed(1)}%` : Number(r.fair_score || 0).toFixed(2),
        isHorti ? Number(r.fair_score || 0).toFixed(2) : undefined,
      ].filter(v => v !== undefined))
    } else if (activeView === 'area_horti' || activeView === 'area_hk') {
      exportData.stats = [
        { label: isHorti ? 'Horticulture Areas' : 'Total Areas', value: areaRows.length },
      ]
      exportData.headers = isHorti
        ? ['Horticulture Area', 'Zone', 'Worker Count', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']
        : ['Area / Zone', 'Department', 'Area Class', 'Worker Count', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score']

      exportData.rows = areaRows.map((r) => isHorti ? [
        r.area_name || '-',
        r.zone_name || '-',
        r.worker_count || 0,
        r.total || 0,
        r.done || 0,
        r.pending || 0,
        `${Number(r.completion_pct || 0).toFixed(1)}%`,
        `${Number(r.attendance_pct || 0).toFixed(1)}%`,
        Number(r.fair_score || 0).toFixed(2),
      ] : [
        r.area_name || '-',
        r.department || 'housekeeping',
        r.area_class || '-',
        r.worker_count || 0,
        r.total || 0,
        r.done || 0,
        r.pending || 0,
        `${Number(r.completion_pct || 0).toFixed(1)}%`,
        `${Number(r.attendance_pct || 0).toFixed(1)}%`,
        Number(r.fair_score || 0).toFixed(2),
      ])
    } else if (activeView === 'area_inventory') {
      const totalTx = invAreaRows.reduce((a, b) => a + Number(b.transactions || 0), 0)
      const totalQty = invAreaRows.reduce((a, b) => a + Number(b.total_qty || 0), 0)
      exportData.stats = [
        { label: isHorti ? 'Zones Tracked' : 'Areas Tracked', value: invAreaRows.length },
        { label: 'Total Transactions', value: totalTx },
        { label: 'Total Items Issued', value: totalQty },
      ]
      exportData.headers = isHorti
        ? ['Zone / Section', 'Transactions', 'Consumables', 'Assets / Tools', 'Total Issued']
        : ['Area', 'Area Class', 'Transactions', 'Consumable Qty', 'Asset Qty', 'Total Qty']

      exportData.rows = invAreaRows.map((r) => isHorti ? [
        r.area_name || '-',
        r.transactions || 0,
        r.consumable_qty || 0,
        r.asset_qty || 0,
        r.total_qty || 0,
      ] : [
        r.area_name || '-',
        r.area_class || '-',
        r.transactions || 0,
        r.consumable_qty || 0,
        r.asset_qty || 0,
        r.total_qty || 0,
      ])
    } else {
      const totalItemQty = topItemRows.reduce((a, b) => a + Number(b.quantity || 0), 0)
      exportData.stats = [
        { label: 'Top Items Count', value: topItemRows.length },
        { label: 'Total Quantity', value: totalItemQty },
      ]
      exportData.headers = ['Item Name', 'Type', 'Unit', 'Quantity', 'Transactions', 'Locations Count', 'Locations']
      exportData.rows = topItemRows.map((r) => [
        r.item_name || '-',
        r.item_type || '-',
        r.unit || 'Units',
        r.quantity || 0,
        r.transactions || 0,
        r.areas_count || 0,
        (r.areas || []).join(' | ') || '-',
      ])
    }

    await exportReport(format, exportData)
  }

  const pageContent = (
    <div>
      {/* 1. Department Selector Tabs (Shown if not locked or hidden) */}
      {!hideDepartmentSelector && !isHorticultureManager && !isHostelOffice && !isHKInventoryManager && !isEstateOffice && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {DEPARTMENTS.map(d => {
            const active = department === d.key
            return (
              <button
                key={d.key}
                onClick={() => setDepartment(d.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                  borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  border: `1.5px solid ${active ? (d.key === 'horticulture' ? '#15803d' : '#2d4a3e') : 'var(--border)'}`,
                  background: active ? (d.key === 'horticulture' ? 'rgba(21,128,61,0.1)' : 'rgba(45,74,62,0.08)') : 'var(--surface)',
                  color: active ? (d.key === 'horticulture' ? '#15803d' : '#2d4a3e') : 'var(--text-2)',
                  transition: 'all 0.2s ease',
                  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <span>{d.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 2. Controls & Filter Card */}
      <Card style={{ marginBottom: 14, borderColor: isHorti ? 'rgba(21,128,61,0.25)' : 'var(--border)' }}>
        {/* View Selection Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: activeView === 'estate_billing' ? 0 : 14 }}>
          {activeViewOptions.map(opt => (
            <Btn
              key={opt.key}
              size="sm"
              variant={activeView === opt.key ? 'primary' : 'secondary'}
              onClick={() => setActiveView(opt.key)}
              style={activeView === opt.key && isHorti ? { background: '#15803d', borderColor: '#15803d' } : {}}
            >
              {opt.label}
            </Btn>
          ))}
        </div>

        {/* Period & Scope Filters */}
        {activeView !== 'estate_billing' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Period Filter */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2, fontWeight: 600 }}>Period:</span>
                {RANGE_OPTIONS.map(opt => (
                  <Btn
                    key={opt.key}
                    size="sm"
                    variant={range === opt.key ? 'primary' : 'secondary'}
                    onClick={() => setRange(opt.key)}
                    style={range === opt.key && isHorti ? { background: '#15803d', borderColor: '#15803d' } : {}}
                  >
                    {opt.label}
                  </Btn>
                ))}
              </div>

              {/* Department-Specific Scope Filter */}
              {isHorti ? (
                /* Zone Filter for Horticulture */
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2, fontWeight: 600 }}>Zone:</span>
                  {zoneOptions.map(opt => (
                    <Btn
                      key={opt.key}
                      size="sm"
                      variant={selectedZone === opt.key ? 'primary' : 'secondary'}
                      onClick={() => setSelectedZone(opt.key)}
                      style={selectedZone === opt.key ? { background: '#15803d', borderColor: '#15803d' } : {}}
                    >
                      {opt.label}
                    </Btn>
                  ))}
                </div>
              ) : !isHostelOffice && (
                /* Area Class Filter for Housekeeping */
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2, fontWeight: 600 }}>Area:</span>
                  {HK_AREA_CLASS_OPTIONS.map(opt => (
                    <Btn
                      key={opt.key}
                      size="sm"
                      variant={areaClass === opt.key ? 'primary' : 'secondary'}
                      onClick={() => setAreaClass(opt.key)}
                    >
                      {opt.label}
                    </Btn>
                  ))}
                </div>
              )}
            </div>

            {/* Export Dropdown */}
            <ExportDropdown
              label={isHorti ? "Export Horticulture" : "Export Insights"}
              onExport={handleExportInsights}
              disabled={loading}
            />
          </div>
        )}
      </Card>

      {/* Error Message */}
      {error && (
        <Card style={{ marginBottom: 14, borderColor: '#fecaca', background: '#fff1f2' }}>
          <div style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{error}</div>
        </Card>
      )}

      {/* Main View Render */}
      <Card>
        {activeView === 'estate_billing' ? (
          <EstateBillingPanel />
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
        ) : isHorti ? (
          /* ============================================================== */
          /* PURE HORTICULTURE VIEWS                                        */
          /* ============================================================== */
          <div key={`horti-${activeView}-${range}-${selectedZone}`}>
            {/* 1. Horticulture Supervisors */}
            {activeView === 'supervisor' && (
              <GenericPerformanceInsights
                rows={caretakerRows}
                nameField="staff_name"
                subtitleBuilder={(r) => `Zone: ${r.zone_name || 'All'} • Workers: ${r.worker_count || 0}`}
                tableColumns={['Rank', 'Supervisor', 'Pay Code', 'Assigned Zone', 'Workers', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={true}
              />
            )}

            {/* 2. Horticulture Workers / Malis */}
            {activeView === 'workers' && (
              <GenericPerformanceInsights
                rows={workerRows}
                nameField="worker_name"
                subtitleBuilder={(r) => `${r.zone_name || 'Horticulture'} • Pay Code: ${r.pay_code || '-'}`}
                tableColumns={['Rank', 'Worker / Mali', 'Pay Code', 'Zone', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={true}
              />
            )}

            {/* 3. Horticulture Areas */}
            {activeView === 'area_horti' && (
              <GenericPerformanceInsights
                rows={areaRows}
                nameField="area_name"
                subtitleBuilder={(r) => `Zone: ${r.zone_name || 'Horticulture'}`}
                tableColumns={['Rank', 'Horticulture Area', 'Zone', 'Workers', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={true}
              />
            )}

            {/* 4. Horticulture Zone-wise Inventory */}
            {activeView === 'area_inventory' && (
              <InventoryAreaPanel rows={invAreaRows} totals={consumptionTotals} isHorti={true} />
            )}

            {/* 5. Horticulture Top Consumed Items */}
            {activeView === 'top_items' && (
              <TopItemsPanel rows={topItemRows} isHorti={true} />
            )}
          </div>
        ) : (
          /* ============================================================== */
          /* HOUSEKEEPING VIEWS                                             */
          /* ============================================================== */
          <div key={`hk-${activeView}-${range}-${areaClass}`}>
            {activeView === 'caretaker' && (
              <GenericPerformanceInsights
                rows={caretakerRows}
                nameField="staff_name"
                subtitleBuilder={(r) => `Role: ${r.role || 'Staff'} • Areas: ${r.areas_count || (r.areas || []).length || 0}`}
                tableColumns={['Rank', 'Staff / Caretaker', 'Pay Code', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={false}
              />
            )}
            {activeView === 'workers' && (
              <GenericPerformanceInsights
                rows={workerRows}
                nameField="worker_name"
                subtitleBuilder={(r) => `Pay Code: ${r.pay_code || '-'} • ${(r.areas || []).join(', ')}`}
                tableColumns={['Rank', 'HK Worker', 'Pay Code', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={false}
              />
            )}
            {activeView === 'area_hk' && (
              <GenericPerformanceInsights
                rows={areaRows}
                nameField="area_name"
                subtitleBuilder={(r) => `Class: ${r.area_class || 'General'}`}
                tableColumns={['Rank', 'HK Area', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier']}
                isHorti={false}
              />
            )}
            {activeView === 'area_inventory' && (
              <InventoryAreaPanel rows={invAreaRows} totals={consumptionTotals} isHorti={false} />
            )}
            {activeView === 'top_items' && (
              <TopItemsPanel rows={topItemRows} isHorti={false} />
            )}
          </div>
        )}
      </Card>
    </div>
  )

  if (embedded) {
    return pageContent
  }

  return (
    <AdminLayout
      title={isHorti ? "Horticulture Insights" : "Insights"}
      subtitle={
        isEstateOffice
          ? 'Commercial outlets, electricity billing, housing occupancy, and clearance analytics'
          : isHorti
            ? 'Horticulture zone health, supervisor compliance, mali performance, and equipment/consumable usage'
            : isHostelOffice
              ? 'Hostel area performance analysis — staff, workers and areas'
              : 'Multi-module performance analytics — Housekeeping, Horticulture, and Estate'
      }
    >
      {pageContent}
    </AdminLayout>
  )
}
