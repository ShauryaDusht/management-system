import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { reportsAPI } from '../../api/inventory'
import { Btn, Card, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'
import { exportCsv, todayISO } from '../../shared/utils'
import EstateBillingPanel from './EstateBillingPanel'

const PALETTE = ['#2d4a3e', '#c2622a', '#3b82f6', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899', '#64748b']
const MEDAL = ['🥇', '🥈', '🥉']
const TIER_COLORS = { S: '#f59e0b', A: '#2d4a3e', B: '#3b82f6', C: '#6b7280', D: '#dc2626' }

const VIEW_OPTIONS = [
  { key: 'caretaker', label: '👷 Staff Performance' },
  { key: 'workers', label: '🧹 Worker Performance' },
  { key: 'area_hk', label: '🏢 Area-wise HK' },
  { key: 'area_inventory', label: '📦 Inventory by Area' },
  { key: 'top_items', label: '🔝 Top Consumed Items' },
  { key: 'estate_billing', label: '⚡ Estate & Electricity' },
]
const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]
const AREA_CLASS_OPTIONS = [
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

function EmptyState() {
  return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px', textAlign: 'center' }}>No data for the selected filters.</div>
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

function LeaderboardCard({ rank, name, fairScore, completionPct, attendancePct, total, done, isWinner }) {
  const tier = getTier(fairScore)
  const medal = MEDAL[rank] || `#${rank + 1}`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 12,
      border: `1.5px solid ${isWinner ? '#2d4a3e' : 'var(--border)'}`,
      background: isWinner ? 'rgba(45,74,62,0.07)' : 'var(--surface-2)', marginBottom: 8,
    }}>
      <div style={{ fontSize: rank < 3 ? 22 : 15, width: 32, textAlign: 'center', flexShrink: 0 }}>{medal}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
          Tasks: <strong>{done}/{total}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <ProgressPill value={completionPct} label="Completion" color="#2d4a3e" />
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

function InvLeaderCard({ rank, name, total, consumables, assets, transactions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', marginBottom: 8 }}>
      <div style={{ fontSize: rank < 3 ? 22 : 15, width: 32, textAlign: 'center' }}>{MEDAL[rank] || `#${rank + 1}`}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{transactions} transactions</div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        {[['Consumables', consumables, '#c2622a'], ['Assets', assets, '#3b82f6'], ['Total', total, '#2d4a3e']].map(([l, v, c]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{formatNum(v)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TooltipStyle = { borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)' }

function MultiBarChart({ data, bars, height = 300 }) {
  if (!data?.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} interval={0} angle={-28} textAnchor="end" height={55} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={TooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function FairPieChart({ data, dataKey = 'fair_score', nameKey = 'name' }) {
  if (!data?.length) return <EmptyState />
  const total = data.reduce((s, d) => s + Number(d[dataKey] || 0), 0)
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={98} innerRadius={46} dataKey={dataKey} nameKey={nameKey} paddingAngle={2}
          label={({ name, percent }) => `${name.length > 9 ? name.slice(0, 9) + '…' : name} ${(percent * 100).toFixed(0)}%`}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={TooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function PerformanceRadar({ data }) {
  if (!data?.length) return <EmptyState />
  const top5 = data.slice(0, 5)
  const keys = top5.map(d => d.name.split(' ')[0])
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
          <Radar key={i} name={d.name.split(' ')[0]} dataKey={d.name.split(' ')[0]}
            stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.13} />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  )
}

function FairnessNote() {
  return (
    <div style={{ background: 'rgba(45,74,62,0.07)', border: '1px solid rgba(45,74,62,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>
      ⚖️ <strong>Fair Comparison Engine:</strong> Rankings use <em>Fair Score</em> — volume-confidence-weighted blend of completion % + attendance %. A 100% score on 3 tasks is <em>not</em> equal to 100% on 200 tasks. Tiers: S ≥ 85 · A ≥ 70 · B ≥ 50 · C ≥ 30 · D &lt; 30.
    </div>
  )
}

function PerformanceInsights({ rows, nameField }) {
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
      <FairnessNote />
      <FadeSection delay={0}>
        <SectionTitle icon="🏆" title="Leaderboard" subtitle="Ranked by Fair Score — volume-adjusted for honest comparison" />
        {ranked.slice(0, 10).map((r, i) => (
          <LeaderboardCard key={i} rank={i}
            name={r[nameField] || '-'}
            fairScore={r._fair}
            completionPct={r.completion_pct}
            attendancePct={r.attendance_pct}
            total={r.total || 0}
            done={r.done || 0}
            isWinner={i === 0}
          />
        ))}
      </FadeSection>
      <FadeSection delay={130}>
        <Divider label="📊 Bar Chart — Side-by-side comparison" />
        <SectionTitle icon="📊" title="Performance Bar Chart" subtitle="Completion %, Attendance % and Fair Score — top 12" />
        <MultiBarChart data={chartData} bars={[
          { key: 'completion_pct', label: 'Completion %' },
          { key: 'attendance_pct', label: 'Attendance %' },
          { key: 'fair_score', label: 'Fair Score' },
        ]} height={310} />
      </FadeSection>
      <FadeSection delay={260}>
        <Divider label="🥧 Pie Charts — Proportional share" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <Card>
            <SectionTitle icon="🥧" title="Fair Score Share" subtitle="Who holds what slice of overall performance?" />
            <FairPieChart data={chartData} dataKey="fair_score" />
          </Card>
          <Card>
            <SectionTitle icon="✅" title="Completion % Share" />
            <FairPieChart data={chartData} dataKey="completion_pct" />
          </Card>
          <Card>
            <SectionTitle icon="📅" title="Attendance % Share" />
            <FairPieChart data={chartData} dataKey="attendance_pct" />
          </Card>
        </div>
      </FadeSection>
      <FadeSection delay={380}>
        <Divider label="🕸️ Radar — Top 5 multi-dimension" />
        <Card>
          <SectionTitle icon="🕸️" title="Top 5 Radar Comparison" subtitle="Compare top 5 across completion, attendance and fair score simultaneously" />
          <PerformanceRadar data={chartData} />
        </Card>
      </FadeSection>
      <FadeSection delay={500}>
        <Divider label="📋 Full Data Table" />
        <Card style={{ overflow: 'auto' }}>
          <SectionTitle icon="📋" title="Complete Stats Table" subtitle="Every person ranked with all metrics" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Rank', 'Name', 'Total', 'Done', 'Pending', 'Completion %', 'Attendance %', 'Fair Score', 'Tier'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const tier = getTier(r._fair)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{MEDAL[i] || `#${i + 1}`}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r[nameField] || '-'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.total || 0}</td>
                    <td style={{ padding: '8px 12px', color: '#2d4a3e', fontWeight: 600 }}>{r.done || 0}</td>
                    <td style={{ padding: '8px 12px', color: '#c2622a' }}>{r.pending || 0}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ color: Number(r.completion_pct) >= 70 ? '#2d4a3e' : Number(r.completion_pct) >= 40 ? '#c2622a' : '#dc2626', fontWeight: 700 }}>
                        {Number(r.completion_pct || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{Number(r.attendance_pct || 0).toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r._fair.toFixed(1)}</td>
                    <td style={{ padding: '8px 12px' }}>
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

function InventoryAreaPanel({ rows, totals }) {
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
        <SectionTitle icon="🏆" title="Area Consumption Leaderboard" subtitle="Areas ranked by total inventory consumed" />
        {sorted.slice(0, 10).map((r, i) => (
          <InvLeaderCard key={i} rank={i} name={r.area_name} total={r.total_qty}
            consumables={r.consumable_qty} assets={r.asset_qty} transactions={r.transactions} />
        ))}
      </FadeSection>
      <FadeSection delay={130}>
        <Divider label="📊 Bar Chart" />
        <MultiBarChart data={chartData} bars={[
          { key: 'consumables', label: 'Consumables' },
          { key: 'assets', label: 'Assets' },
          { key: 'total', label: 'Total' },
        ]} height={300} />
      </FadeSection>
      <FadeSection delay={260}>
        <Divider label="🥧 Pie Charts" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card>
            <SectionTitle icon="🥧" title="Total Qty Share by Area" />
            <FairPieChart data={chartData} dataKey="total" />
          </Card>
          <Card>
            <SectionTitle icon="🥧" title="Consumables vs Assets" />
            <FairPieChart
              data={[
                { name: 'Consumables', total: Number(totals?.consumable_qty || 0) },
                { name: 'Assets', total: Number(totals?.asset_qty || 0) },
              ]}
              dataKey="total" />
          </Card>
        </div>
      </FadeSection>
      <FadeSection delay={380}>
        <Divider label="Summary Totals" />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[['🔄 Transactions', totals?.transactions, '#3b82f6'], ['📦 Total Qty', totals?.total_qty, '#2d4a3e'],
          ['🧴 Consumables', totals?.consumable_qty, '#c2622a'], ['🛠 Assets', totals?.asset_qty, '#8b5cf6']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', textAlign: 'center', minWidth: 130 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{formatNum(v)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </FadeSection>
    </>
  )
}

function TopItemsPanel({ rows }) {
  const sorted = [...rows].sort((a, b) => Number(b.quantity) - Number(a.quantity))
  const totalQty = sorted.reduce((s, r) => s + Number(r.quantity || 0), 0)
  const chartData = sorted.slice(0, 12).map(r => ({
    name: r.item_code ? `[${r.item_code}] ${r.item_name?.slice(0, 14)}` : r.item_name?.slice(0, 18),
    quantity: Number(r.quantity || 0),
    transactions: Number(r.transactions || 0),
  }))
  return (
    <>
      <FadeSection delay={0}>
        <SectionTitle icon="🏆" title="Top Items Leaderboard" subtitle="Most consumed inventory items this period" />
        {sorted.slice(0, 10).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', marginBottom: 8 }}>
            <div style={{ fontSize: i < 3 ? 22 : 15, width: 32, textAlign: 'center' }}>{MEDAL[i] || `#${i + 1}`}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.item_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.item_code} · {r.item_type} · {r.areas_count || 0} areas</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2d4a3e' }}>{formatNum(r.quantity)} units</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.transactions} txns</div>
            </div>
            <div style={{ width: 68 }}>
              <div style={{ height: 5, borderRadius: 99, background: 'var(--border)' }}>
                <div style={{ height: 5, borderRadius: 99, background: PALETTE[i % PALETTE.length], width: `${totalQty > 0 ? (r.quantity / totalQty) * 100 : 0}%`, transition: 'width 0.6s' }} />
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
        ]} height={300} />
      </FadeSection>
      <FadeSection delay={260}>
        <Divider label="🥧 Consumption Share — Pie Chart" />
        <Card>
          <SectionTitle icon="🥧" title="Item Consumption Share" subtitle="Which items dominate total inventory consumption?" />
          <FairPieChart data={chartData} dataKey="quantity" />
        </Card>
      </FadeSection>
    </>
  )
}

export default function InsightsPage() {
  const { user } = useAuth()
  const isHorticultureManager = user?.role === 'horticulture_manager'
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const isEstateOffice = user?.role === 'estate_office' || user?.actual_role === 'estate_office' || user?.username === 'estate.office'
  const [range, setRange] = useState('weekly')
  const [areaClass, setAreaClass] = useState(isHostelOffice ? 'hostels' : 'all')
  const [activeView, setActiveView] = useState(isEstateOffice ? 'estate_billing' : 'caretaker')
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const visibleViewOptions = useMemo(
    () => VIEW_OPTIONS.filter((option) => (
      isEstateOffice
        ? option.key === 'estate_billing'
        : isHorticultureManager
          ? ['caretaker', 'workers', 'area_hk'].includes(option.key)
          : isHostelOffice
            ? ['caretaker', 'workers', 'area_hk'].includes(option.key)
            : true
    )),
    [isHorticultureManager, isHostelOffice, isEstateOffice]
  )
  const visibleAreaOptions = useMemo(
    () => isHorticultureManager
      ? AREA_CLASS_OPTIONS.filter((option) => option.key === 'all' || option.key === 'others')
      : isHostelOffice
        ? AREA_CLASS_OPTIONS.filter((option) => option.key === 'hostels')
        : AREA_CLASS_OPTIONS,
    [isHorticultureManager, isHostelOffice]
  )

  useEffect(() => {
    if (isEstateOffice && activeView !== 'estate_billing') {
      setActiveView('estate_billing')
    } else if ((isHorticultureManager || isHostelOffice) && !visibleViewOptions.some((option) => option.key === activeView)) {
      setActiveView('caretaker')
    }
    if (isHostelOffice && areaClass !== 'hostels') {
      setAreaClass('hostels')
    }
    if (isHorticultureManager && !visibleAreaOptions.some((option) => option.key === areaClass)) {
      setAreaClass('all')
    }
  }, [activeView, areaClass, isHorticultureManager, isHostelOffice, isEstateOffice, visibleAreaOptions, visibleViewOptions])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true); setError('')
      try {
        const { data } = await reportsAPI.getDashboardInsights({ range, area_class: isHostelOffice ? 'hostels' : areaClass })
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
  }, [range, areaClass, isHostelOffice])

  const caretakerRows = Array.isArray(insights?.caretaker_supervisor_performance?.rows) ? insights.caretaker_supervisor_performance.rows : []
  const workerRows = Array.isArray(insights?.worker_performance?.rows) ? insights.worker_performance.rows : []
  const areaRows = Array.isArray(insights?.area_performance?.rows) ? insights.area_performance.rows : []
  const invAreaRows = Array.isArray(insights?.inventory_consumption?.areas) ? insights.inventory_consumption.areas : []
  const topItemRows = Array.isArray(insights?.inventory_consumption?.top_items) ? insights.inventory_consumption.top_items : []
  const consumptionTotals = insights?.inventory_consumption?.totals || {}

  const exportCurrentCsv = () => {
    const day = todayISO()
    const baseName = `insights_${activeView}_${range}_${areaClass}_${day}.csv`
    if (activeView === 'caretaker') {
      exportCsv(baseName, ['Staff', 'Pay Code', 'Role', 'Areas', 'Worker Count', 'Total Tasks', 'Completed', 'Pending', 'In Progress', 'Skipped', 'Completion %', 'Attendance %', 'Fair Score'],
        caretakerRows.map(r => [r.staff_name, r.pay_code || '-', r.role, (r.areas || []).join(' | '), r.worker_count || 0, r.total || 0, r.done || 0, r.pending || 0, r.in_progress || 0, r.skipped || 0, Number(r.completion_pct || 0).toFixed(1), Number(r.attendance_pct || 0).toFixed(1), Number(r.fair_score || 0).toFixed(2)]))
    } else if (activeView === 'workers') {
      exportCsv(baseName, ['Worker', 'Pay Code', 'Areas', 'Total Tasks', 'Completed', 'Pending', 'In Progress', 'Skipped', 'Completion %', 'Attendance %', 'Fair Score'],
        workerRows.map(r => [r.worker_name, r.pay_code || '-', (r.areas || []).join(' | '), r.total || 0, r.done || 0, r.pending || 0, r.in_progress || 0, r.skipped || 0, Number(r.completion_pct || 0).toFixed(1), Number(r.attendance_pct || 0).toFixed(1), Number(r.fair_score || 0).toFixed(2)]))
    } else if (activeView === 'area_hk') {
      exportCsv(baseName, ['Area / Zone', 'Department', 'Area Class', 'Worker Count', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Attendance %', 'Fair Score'],
        areaRows.map(r => [r.area_name, r.department || 'housekeeping', r.area_class, r.worker_count || 0, r.total || 0, r.done || 0, r.pending || 0, Number(r.completion_pct || 0).toFixed(1), Number(r.attendance_pct || 0).toFixed(1), Number(r.fair_score || 0).toFixed(2)]))
    } else if (activeView === 'area_inventory') {
      exportCsv(baseName, ['Area', 'Area Class', 'Transactions', 'Consumable Qty', 'Asset Qty', 'Total Qty'],
        invAreaRows.map(r => [r.area_name, r.area_class, r.transactions || 0, r.consumable_qty || 0, r.asset_qty || 0, r.total_qty || 0]))
    } else {
      exportCsv(baseName, ['Item Code', 'Item', 'Type', 'Quantity', 'Transactions', 'Area Count', 'Areas'],
        topItemRows.map(r => [r.item_code || '-', r.item_name, r.item_type, r.quantity || 0, r.transactions || 0, r.areas_count || 0, (r.areas || []).join(' | ')]))
    }
  }

  return (
    <AdminLayout
      title="Insights"
      subtitle={
        isEstateOffice
          ? 'Commercial outlets & electricity billing analytics'
          : isHorticultureManager
            ? 'Horticulture performance analysis'
            : isHostelOffice
              ? 'Hostel area performance analysis - staff, workers and areas'
              : 'Fair, multi-chart performance analysis - staff, workers, areas, inventory and Estate billing'
      }
    >
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: activeView === 'estate_billing' ? 0 : 12 }}>
          {visibleViewOptions.map(opt => (
            <Btn key={opt.key} size="sm" variant={activeView === opt.key ? 'primary' : 'secondary'} onClick={() => setActiveView(opt.key)}>
              {opt.key === 'area_hk' ? (isHorticultureManager ? 'Area-wise Horticulture' : isHostelOffice ? 'Area-wise Hostels' : 'Area-wise Comparison') : opt.label}
            </Btn>
          ))}
        </div>
        {activeView !== 'estate_billing' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2 }}>Period:</span>
                {RANGE_OPTIONS.map(opt => (
                  <Btn key={opt.key} size="sm" variant={range === opt.key ? 'primary' : 'secondary'} onClick={() => setRange(opt.key)}>{opt.label}</Btn>
                ))}
              </div>
              {!isHostelOffice && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2 }}>Area:</span>
                  {visibleAreaOptions.map(opt => (
                    <Btn key={opt.key} size="sm" variant={areaClass === opt.key ? 'primary' : 'secondary'} onClick={() => setAreaClass(opt.key)}>
                      {isHorticultureManager && opt.key === 'others' ? 'Horticulture' : opt.label}
                    </Btn>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Btn size="sm" variant="secondary" onClick={exportCurrentCsv}>📥 Export CSV</Btn>
            </div>
          </>
        )}
      </Card>
      {error && (
        <Card style={{ marginBottom: 14, borderColor: '#fecaca', background: '#fff1f2' }}>
          <div style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{error}</div>
        </Card>
      )}
      <Card>
        {activeView === 'estate_billing' ? (
          <EstateBillingPanel />
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
        ) : (
          <div key={`${activeView}-${range}-${areaClass}`}>
            {activeView === 'caretaker' && <PerformanceInsights rows={caretakerRows} nameField="staff_name" />}
            {activeView === 'workers' && <PerformanceInsights rows={workerRows} nameField="worker_name" />}
            {activeView === 'area_hk' && <PerformanceInsights rows={areaRows} nameField="area_name" />}
            {activeView === 'area_inventory' && (invAreaRows.length ? <InventoryAreaPanel rows={invAreaRows} totals={consumptionTotals} /> : <EmptyState />)}
            {activeView === 'top_items' && (topItemRows.length ? <TopItemsPanel rows={topItemRows} /> : <EmptyState />)}
          </div>
        )}
      </Card>
    </AdminLayout>
  )
}
