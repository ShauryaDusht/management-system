import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI, reportsAPI } from '../../api/inventory'
import { hkAPI } from '../../api/housekeeping'
import { Btn, Card, Spinner, StatCard } from '../../components/ui'
import { DonutChart, DONUT_PALETTE } from '../../components/ui/Charts'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'

const PALETTE = DONUT_PALETTE
const TooltipStyle = { borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)' }

const CHART_TYPES = [
  { key: 'area',  label: '📈 Area' },
  { key: 'bar',   label: '📊 Bar' },
  { key: 'pie',   label: '🥧 Pie' },
]

const MODULE_OPTIONS = [
  { key: 'all',          label: '🌐 All' },
  { key: 'inventory',    label: '📦 Inventory' },
  { key: 'housekeeping', label: '🧹 Housekeeping' },
  { key: 'horticulture', label: '🌿 Horticulture' },
]

function adminHref(path) {
  const cleanPath = String(path || '/dashboard')
  return cleanPath.startsWith('/admin/') ? cleanPath : `/admin${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`
}

const RANGE_OPTIONS = [
  { key: 'today',   label: 'Today' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

function SummaryStatBox({ label, value, color, icon }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '12px 16px', textAlign: 'center',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{Number(value || 0).toLocaleString('en-IN')}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function EmptyTrend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 13, flexDirection: 'column', gap: 8, border: '1px dashed var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 28 }}>📭</div>
      <div>No activity data for this period yet.</div>
    </div>
  )
}

function ActivityAreaChart({ data, lines, height }) {
  if (!data.length) return <EmptyTrend />
  return (
    <ResponsiveContainer width="100%" height={height || 230}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={l.key} id={`grad_${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={TooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => (
          <Area key={l.key} type="monotone" dataKey={l.key} name={l.label}
            stroke={PALETTE[i % PALETTE.length]} fill={`url(#grad_${l.key})`}
            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ActivityBarChart({ data, lines, height }) {
  if (!data.length) return <EmptyTrend />
  return (
    <ResponsiveContainer width="100%" height={height || 230}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={TooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => (
          <Bar key={l.key} dataKey={l.key} name={l.label}
            fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ActivityPieChart({ data, lines }) {
  if (!data.length) return <EmptyTrend />
  const totals = lines.map((l, i) => ({
    name: l.label,
    value: data.reduce((s, row) => s + Number(row[l.key] || 0), 0),
    color: PALETTE[i % PALETTE.length],
  })).filter(d => d.value > 0)
  if (!totals.length) return <EmptyTrend />
  const grand = totals.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', padding: '10px 0' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 280,
          minWidth: 200,
          height: 'clamp(200px, 50vw, 280px)',
          flex: '0 1 280px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={totals} 
              cx="50%" cy="50%" 
              outerRadius={80} 
              innerRadius={45}
              dataKey="value" 
              paddingAngle={2}
              labelLine={true}
              label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
            >
              {totals.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={TooltipStyle} formatter={v => [Number(v).toLocaleString()]} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', pointerEvents: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(14px, 4vw, 20px)', fontWeight: 800, lineHeight: 1.1, maxWidth: '70%', margin: '0 auto', wordBreak: 'break-word' }}>
            {grand.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 'clamp(10px, 2.2vw, 11px)', color: 'var(--text-3)' }}>Total</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 220, borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-2)' }}>Segment Breakdown</div>
        {totals.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{d.name}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{d.value.toLocaleString('en-IN')}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>{grand > 0 ? ((d.value / grand) * 100).toFixed(1) : 0}%</span>
              <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', marginTop: 4, width: 100, marginLeft: 'auto', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: d.color, width: `${grand > 0 ? (d.value / grand) * 100 : 0}%`, transition: 'width 0.8s ease-out' }} />
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total Activity Scope:</span>
          <strong style={{ color: 'var(--text)', fontSize: 13 }}>{grand.toLocaleString('en-IN')} Units</strong>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isHorticultureManager = user?.role === 'horticulture_manager'
  const canViewInventory = !isHorticultureManager
  const canViewHousekeeping = !isHorticultureManager
  const canViewHorticulture = user?.role !== 'hk_inventory_manager'
  const [invSummary, setInvSummary]     = useState(null)
  const [hkSummary, setHkSummary]       = useState(null)
  const [hortiSummary, setHortiSummary] = useState(null)

  const [trendRange,   setTrendRange]   = useState('weekly')
  const [trendModule,  setTrendModule]  = useState('all')
  const [chartType,    setChartType]    = useState('area')
  const [trendData,    setTrendData]    = useState([])
  const [trendTotals,  setTrendTotals]  = useState(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    let alive = true
    const fetchData = async () => {
      setTrendLoading(true)
      try {
        const [inv, hk, horti, trend] = await Promise.all([
          canViewInventory ? inventoryAPI.getDashboard().catch(() => null) : Promise.resolve(null),
          canViewHousekeeping ? hkAPI.getDashboardSummary().catch(() => null) : Promise.resolve(null),
          canViewHorticulture ? horticultureAPI.getSummary().catch(() => null) : Promise.resolve(null),
          reportsAPI.getActivityTrend({ range: trendRange }).catch(() => null),
        ])
        if (!alive) return
        setInvSummary(inv?.data || null)
        setHkSummary(hk?.data || null)
        setHortiSummary(horti?.data || null)
        const series = Array.isArray(trend?.data?.series) ? trend.data.series : []
        setTrendData(series.map(row => ({
          name: row.label || row.date,
          inventory:                    Number(row.inventory || 0),
          housekeeping:                 Number(row.housekeeping || 0),
          horticulture:                 Number(row.horticulture || 0),
          total:                        Number(row.total || 0),
          inventory_requests:           Number(row.inventory_requests || 0),
          inventory_issues:             Number(row.inventory_issues || 0),
          inventory_stock_additions:    Number(row.inventory_stock_additions || 0),
          inventory_purchase_requests:  Number(row.inventory_purchase_requests || 0),
          hk_done:                      Number(row.hk_done || 0),
          hk_pending:                   Number(row.hk_pending || 0),
          hk_in_progress:               Number(row.hk_in_progress || 0),
          hk_skipped:                   Number(row.hk_skipped || 0),
        })))
        setTrendTotals(trend?.data?.totals || null)
      } finally {
        if (alive) { setTrendLoading(false); setLoading(false) }
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => { alive = false; clearInterval(interval) }
  }, [trendRange, canViewHorticulture, canViewHousekeeping, canViewInventory])

  useEffect(() => {
    if (isHorticultureManager && trendModule !== 'horticulture') {
      setTrendModule('horticulture')
    } else if (!canViewHorticulture && trendModule === 'horticulture') {
      setTrendModule('all')
    }
  }, [canViewHorticulture, isHorticultureManager, trendModule])

  const todayLabel = useMemo(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), [])
  const moduleOptions = useMemo(
    () => MODULE_OPTIONS.filter((option) => {
      if (isHorticultureManager) return option.key === 'horticulture'
      return canViewHorticulture || option.key !== 'horticulture'
    }),
    [canViewHorticulture, isHorticultureManager]
  )

  const inStockCount = invSummary
    ? (invSummary.in_stock_count ?? Math.max(0, (invSummary.total_items || 0) - (invSummary.low_stock_count || 0) - (invSummary.out_of_stock_count || 0)))
    : 0

  const invDonut     = invSummary ? [{ name: 'In Stock', value: inStockCount }, { name: 'Low Stock', value: invSummary.low_stock_count || 0 }, { name: 'Out of Stock', value: invSummary.out_of_stock_count || 0 }] : []
  const hkDonut      = hkSummary  ? [{ name: 'Done', value: hkSummary.done_tasks || 0 }, { name: 'Pending', value: hkSummary.pending_tasks || 0 }] : []
  const hkHasAct     = hkDonut.some(d => d.value > 0)
  const hkDonutData  = hkHasAct ? hkDonut : [{ name: 'No Activity', value: 1 }]

  const hortiCounts  = hortiSummary?.task_status_counts || {}
  const hortiTotal   = Number(hortiCounts.total || 0)
  const hortiDonut   = [
    { name: 'On Track', value: Number(hortiCounts.on_track || 0) },
    { name: 'Due Soon', value: Number(hortiCounts.due_soon || 0) },
    { name: 'Overdue', value: Number(hortiCounts.overdue || 0) },
  ]
  const hortiDonutData = hortiTotal > 0 ? hortiDonut : [{ name: 'No Activity', value: 1 }]

  const trendLines = trendModule === 'inventory'
    ? [
        { key: 'inventory',                   label: 'Total Inventory' },
        { key: 'inventory_requests',          label: 'Requests' },
        { key: 'inventory_issues',            label: 'Issues' },
        { key: 'inventory_stock_additions',   label: 'Stock Additions' },
        { key: 'inventory_purchase_requests', label: 'Purchase Requests' },
      ]
    : trendModule === 'housekeeping'
    ? [
        { key: 'housekeeping',  label: 'Total HK Tasks' },
        { key: 'hk_done',       label: 'Completed' },
        { key: 'hk_pending',    label: 'Pending' },
        { key: 'hk_in_progress',label: 'In Progress' },
        { key: 'hk_skipped',    label: 'Skipped' },
      ]
    : trendModule === 'horticulture'
    ? [{ key: 'horticulture', label: 'Horticulture Activity' }]
    : [
        { key: 'inventory',    label: 'Inventory' },
        { key: 'housekeeping', label: 'Housekeeping' },
        { key: 'horticulture', label: 'Horticulture' },
      ]

  const summaryBoxes = trendModule === 'inventory'
    ? [
        { label: 'Total Inventory', value: trendTotals?.inventory ?? 0,                   color: 'var(--green-800)', icon: '📦' },
        { label: 'Requests',        value: trendTotals?.inventory_requests ?? 0,          color: 'var(--ongoing)', icon: '📋' },
        { label: 'Issues',          value: trendTotals?.inventory_issues ?? 0,            color: 'var(--orange-600)', icon: '🔁' },
        { label: 'Stock Additions', value: trendTotals?.inventory_stock_additions ?? 0,   color: 'var(--completed)', icon: '➕' },
        { label: 'Purchase Req.',   value: trendTotals?.inventory_purchase_requests ?? 0, color: 'var(--pending)', icon: '🛒' },
      ]
    : trendModule === 'housekeeping'
    ? [
        { label: 'Total HK',    value: trendTotals?.housekeeping ?? 0,  color: 'var(--green-800)', icon: '🧹' },
        { label: 'Completed',   value: trendTotals?.hk_done ?? 0,       color: 'var(--completed)', icon: '✅' },
        { label: 'Pending',     value: trendTotals?.hk_pending ?? 0,    color: 'var(--pending)', icon: '⏳' },
        { label: 'In Progress', value: trendTotals?.hk_in_progress ?? 0,color: 'var(--ongoing)', icon: '🔄' },
        { label: 'Skipped',     value: trendTotals?.hk_skipped ?? 0,    color: 'var(--text-3)', icon: '⏭️' },
      ]
    : trendModule === 'horticulture'
    ? [{ label: 'Horticulture', value: trendTotals?.horticulture ?? 0, color: 'var(--green-700)', icon: '🌿' }]
    : [
        { label: 'Inventory',    value: trendTotals?.inventory ?? 0,    color: 'var(--green-800)', icon: '📦' },
        { label: 'Housekeeping', value: trendTotals?.housekeeping ?? 0, color: 'var(--orange-600)', icon: '🧹' },
        { label: 'Horticulture', value: trendTotals?.horticulture ?? 0, color: 'var(--green-700)', icon: '🌿' },
      ]

  const visibleTrendLines = isHorticultureManager
    ? trendLines.filter((line) => line.key === 'horticulture')
    : canViewHorticulture
    ? trendLines
    : trendLines.filter((line) => line.key !== 'horticulture')
  const visibleSummaryBoxes = isHorticultureManager
    ? summaryBoxes.filter((box) => box.label === 'Horticulture')
    : canViewHorticulture
    ? summaryBoxes
    : summaryBoxes.filter((box) => box.label !== 'Horticulture')

  const baseStatCards = [
    { label: 'Total Inventory Items',  value: invSummary?.total_items ?? '-',           icon: '📦', color: 'var(--green-800)', sub: `${invSummary?.pending_requests ?? 0} requests pending`, to: '/inventory?tab=items' },
    { label: 'Low Stock Alerts',       value: invSummary?.low_stock_count ?? '-',        icon: '⚠️', color: 'var(--orange-600)', sub: `${invSummary?.out_of_stock_count ?? 0} out of stock`,  to: '/inventory?tab=items' },
    { label: 'HK Tasks Today',         value: hkSummary?.total_tasks ?? '-',            icon: '🧹', color: 'var(--green-700)', sub: `${hkSummary?.completion_pct ?? 0}% completed`,           to: '/housekeeping?tab=overview' },
    { label: 'HK Workers',             value: hkSummary?.total_workers ?? '-',          icon: '👷', color: '#3b82f6',          sub: `${hkSummary?.present_today ?? 0} present today`,          to: '/housekeeping?tab=attendance' },
    { label: 'Unreturned Assets',      value: invSummary?.unreturned_assets ?? '-',     icon: '🔁', color: '#f59e0b',          sub: `${invSummary?.overdue_returns ?? 0} overdue`,             to: '/inventory?tab=issues' },
    { label: 'Pending Stock Req.',     value: hkSummary?.pending_stock_requests ?? '-', icon: '📋', color: 'var(--orange-600)', sub: 'Open approval queue',                                    to: '/inventory?tab=requests' },
  ]
  const statCards = isHorticultureManager
    ? [
        { label: 'Horticulture Tasks', value: hortiTotal || '-', icon: 'HT', color: 'var(--green-700)', sub: `${Number(hortiCounts.on_track || 0)} on track` },
        { label: 'Due Soon', value: Number(hortiCounts.due_soon || 0), icon: 'DS', color: 'var(--orange-600)', sub: `${Number(hortiCounts.overdue || 0)} overdue` },
        { label: 'Active Areas', value: hortiSummary?.total_areas ?? '-', icon: 'AR', color: '#3b82f6', sub: 'Horticulture coverage' },
      ]
    : baseStatCards

  return (
    <AdminLayout title={isHorticultureManager ? 'Horticulture Home' : 'Admin Dashboard'} subtitle={`Welcome back — ${todayLabel}`}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            {statCards.map(card => (
              isHorticultureManager ? (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  color={card.color}
                  sub={card.sub}
                  style={{ height: '100%', cursor: 'default', userSelect: 'none', transition: 'none', pointerEvents: 'none' }}
                />
              ) : (
                <a key={card.label} href={adminHref(card.to)} className="ui-interactive-card-link" style={{ height: '100%', textDecoration: 'none', color: 'inherit' }} title={`Open ${card.label}`}>
                  <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} sub={card.sub} style={{ height: '100%', cursor: 'pointer', userSelect: 'none' }} />
                </a>
              )
            ))}
          </div>

          {/* ── Donut cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              canViewInventory ? { title: 'Inventory', subtitle: 'Stock overview', data: invDonut, total: invSummary?.total_items, label: 'Items', palette: DONUT_PALETTE, to: '/inventory' } : null,
              canViewHousekeeping ? { title: 'Housekeeping', subtitle: 'Today tasks', data: hkDonutData, total: hkSummary?.total_tasks, label: hkHasAct ? 'Tasks' : 'No Activity', palette: DONUT_PALETTE, to: '/housekeeping' } : null,
              canViewHorticulture && !isHorticultureManager ? { title: 'Horticulture', subtitle: 'Task status', data: hortiDonutData, total: hortiTotal, label: hortiTotal > 0 ? 'Tasks' : 'No Activity', palette: DONUT_PALETTE, to: '/horticulture' } : null,
            ].filter(Boolean).map(card => (
              <Card key={card.title}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{card.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{card.subtitle}</div>
                  </div>
                  <a href={adminHref(card.to)} style={{ textDecoration: 'none' }}><Btn size="sm" variant="ghost">View →</Btn></a>
                </div>
                <DonutChart data={card.data} total={card.total} label={card.label} size={160} palette={card.palette} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  {card.data.filter(d => d.name !== 'No Activity').map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: card.palette[i % card.palette.length], display: 'inline-block' }} />
                      {d.name}: <strong>{d.value}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* ── Activity Trend ── */}
          <Card>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>📈 Activity Trend</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>System-wide activity over time</div>
              </div>
              {/* Range buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RANGE_OPTIONS.map(opt => (
                  <Btn key={opt.key} size="sm" variant={trendRange === opt.key ? 'primary' : 'secondary'} onClick={() => setTrendRange(opt.key)}>
                    {opt.label}
                  </Btn>
                ))}
              </div>
            </div>

            {/* Module + Chart type row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {moduleOptions.map(opt => (
                  <Btn key={opt.key} size="sm" variant={trendModule === opt.key ? 'primary' : 'secondary'} onClick={() => setTrendModule(opt.key)}>
                    {opt.label}
                  </Btn>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {CHART_TYPES.map(ct => (
                  <Btn key={ct.key} size="sm" variant={chartType === ct.key ? 'orange' : 'secondary'} onClick={() => setChartType(ct.key)}>
                    {ct.label}
                  </Btn>
                ))}
              </div>
            </div>

            {/* Summary stat boxes */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              {visibleSummaryBoxes.map(b => (
                <SummaryStatBox key={b.label} label={b.label} value={b.value} color={b.color} icon={b.icon} />
              ))}
            </div>

            {/* Chart */}
            {trendLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
            ) : chartType === 'area' ? (
              <ActivityAreaChart data={trendData} lines={visibleTrendLines} height={240} />
            ) : chartType === 'bar' ? (
              <ActivityBarChart data={trendData} lines={visibleTrendLines} height={240} />
            ) : (
              <ActivityPieChart data={trendData} lines={visibleTrendLines} />
            )}

            {/* Peak day insight */}
            {!trendLoading && trendData.length > 0 && chartType !== 'pie' && (() => {
              const primaryKey = visibleTrendLines[0]?.key
              const peak = trendData.reduce((best, row) => Number(row[primaryKey] || 0) > Number(best[primaryKey] || 0) ? row : best, trendData[0])
              const total = trendData.reduce((s, row) => s + Number(row[primaryKey] || 0), 0)
              const avg = total / trendData.length
              return (
                <div style={{ marginTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }}>
                  <div>📅 Peak day: <strong>{peak?.name}</strong> ({Number(peak?.[primaryKey] || 0).toLocaleString('en-IN')} events)</div>
                  <div>📊 Daily avg: <strong>{avg.toFixed(1)}</strong></div>
                  <div>📦 Period total: <strong>{total.toLocaleString('en-IN')}</strong></div>
                </div>
              )
            })()}
          </Card>
        </>
      )}
    </AdminLayout>
  )
}
