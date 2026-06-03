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

function adminHref(to = '/dashboard') {
  if (/^https?:\/\//i.test(to)) return to
  const path = to.startsWith('/') ? to : `/${to}`
  return path.startsWith('/admin/') ? path : `/admin${path}`
}

const CHART_TYPES = [
  { key: 'area',  label: 'Area' },
  { key: 'bar',   label: 'Bar' },
  { key: 'pie',   label: 'Pie' },
]

const MODULE_OPTIONS = [
  { key: 'all',          label: 'All' },
  { key: 'inventory',    label: 'Inventory' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'horticulture', label: 'Horticulture' },
]

const RANGE_OPTIONS = [
  { key: 'today',   label: 'Today' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

function SummaryStatBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '12px 16px', textAlign: 'center',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{Number(value || 0).toLocaleString('en-IN')}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function EmptyTrend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 13, flexDirection: 'column', gap: 8, border: '1px dashed var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 800 }}>--</div>
      <div>No activity data for this period yet.</div>
    </div>
  )
}

function DashboardHero({ title, subtitle, metric, quickActions, variant = 'default' }) {
  const isHostel = variant === 'hostel'
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 18,
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
      padding: 22,
      borderRadius: 8,
      border: isHostel ? '1px solid rgba(44, 83, 73, 0.24)' : '1px solid rgba(20, 83, 69, 0.18)',
      background: isHostel
        ? 'linear-gradient(135deg, #f8fafc 0%, #eef7f1 46%, #fff7ed 100%)'
        : 'linear-gradient(135deg, #f7faf8 0%, #edf6f0 52%, #fff7ed 100%)',
      boxShadow: isHostel ? '0 14px 34px rgba(20, 83, 69, 0.10)' : '0 10px 24px rgba(15, 23, 42, 0.06)',
    }}>
      <div style={{ minWidth: 260, flex: '1 1 420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0, color: 'var(--green-800)', fontWeight: 800 }}>
            {isHostel ? 'Hostel operations' : 'Live operations'}
          </div>
        </div>
        <div style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 850, color: 'var(--text)' }}>{title}</div>
        <div style={{ marginTop: 7, color: 'var(--text-2)', fontSize: 13, maxWidth: 680 }}>{subtitle}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {quickActions.map((action) => (
            <a key={action.label} href={adminHref(action.to)} style={{ textDecoration: 'none' }}>
              <Btn size="sm" variant={action.primary ? 'primary' : 'secondary'}>{action.label}</Btn>
            </a>
          ))}
        </div>
      </div>
      <div style={{
        width: 170,
        flex: '0 0 170px',
        minHeight: 118,
        borderRadius: 8,
        background: 'rgba(255,255,255,0.78)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 16,
      }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: metric.color, lineHeight: 1 }}>{metric.value}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{metric.label}</div>
        <div style={{ marginTop: 10, height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, Number(metric.progress || 0)))}%`, background: metric.color }} />
        </div>
      </div>
    </div>
  )
}

function HostelActionBox({ title, text, to }) {
  return (
    <a
      href={adminHref(to)}
      className="ui-interactive-card-link"
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        minHeight: 88,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.35 }}>{text}</div>
      </div>
    </a>
  )
}

function HostelOfficePanel({ hkSummary, invSummary }) {
  const completion = Number(hkSummary?.completion_pct || 0)
  const present = Number(hkSummary?.present_today || 0)
  const workers = Number(hkSummary?.total_workers || 0)
  const presentPct = workers ? Math.round((present / workers) * 100) : 0
  const pendingStock = Number(hkSummary?.pending_stock_requests || 0)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 14,
      marginBottom: 18,
    }}>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        padding: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 850 }}>Hostel Office Shortcuts</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Fast access to daily hostel workflows.</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>Live</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <HostelActionBox icon="EW" title="Assign Extra Work" text="Create hostel-only extra work." to="/housekeeping?tab=overview" accent="#c2410c" />
          <HostelActionBox icon="SC" title="Sections + Staff" text="Area-wise or temporary staff switch." to="/housekeeping?tab=directory" accent="#2d5b4d" />
          <HostelActionBox icon="AT" title="Attendance Export" text="Download absent-only CSV." to="/housekeeping?tab=staff_attendance" accent="#2563eb" />
          <HostelActionBox icon="IR" title="Inventory Usage" text="View hostel inventory reports." to="/inventory?tab=inventory-report" accent="#7c3aed" />
        </div>
      </div>

      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: '#fbfaf7',
        padding: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 850 }}>Today Snapshot</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {[
            { label: 'Task Completion', value: `${completion}%`, width: completion, color: '#2d5b4d' },
            { label: 'Worker Presence', value: `${presentPct}%`, width: presentPct, color: '#2563eb' },
            { label: 'Stock Requests', value: pendingStock, width: Math.min(100, pendingStock * 12), color: '#c2410c' },
          ].map((row) => (
            <div key={row.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, gap: 8 }}>
                <span>{row.label}</span>
                <span style={{ color: row.color }}>{row.value}</span>
              </div>
              <div style={{ marginTop: 6, height: 8, borderRadius: 99, background: '#ede9dd', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(4, Math.min(100, Number(row.width || 0)))}%`, background: row.color }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
          {Number(invSummary?.total_items || 0).toLocaleString('en-IN')} inventory items available in view-only reporting.
        </div>
      </div>
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
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const canViewInventory = !isHorticultureManager
  const canViewHousekeeping = !isHorticultureManager
  const canViewHorticulture = user?.role !== 'hk_inventory_manager' && !isHostelOffice
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
    if (isHostelOffice && trendModule !== 'housekeeping') {
      setTrendModule('housekeeping')
    } else if (isHorticultureManager && trendModule !== 'horticulture') {
      setTrendModule('horticulture')
    } else if (!canViewHorticulture && trendModule === 'horticulture') {
      setTrendModule('all')
    }
  }, [canViewHorticulture, isHorticultureManager, isHostelOffice, trendModule])

  const todayLabel = useMemo(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), [])
  const moduleOptions = useMemo(
    () => MODULE_OPTIONS.filter((option) => {
      if (isHostelOffice) return option.key === 'housekeeping'
      if (isHorticultureManager) return option.key === 'horticulture'
      return canViewHorticulture || option.key !== 'horticulture'
    }),
    [canViewHorticulture, isHorticultureManager, isHostelOffice]
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
        { label: 'Total Inventory', value: trendTotals?.inventory ?? 0,                   color: 'var(--green-800)', icon: 'IR' },
        { label: 'Requests',        value: trendTotals?.inventory_requests ?? 0,          color: 'var(--ongoing)', icon: 'RQ' },
        { label: 'Issues',          value: trendTotals?.inventory_issues ?? 0,            color: 'var(--orange-600)', icon: 'IS' },
        { label: 'Stock Additions', value: trendTotals?.inventory_stock_additions ?? 0,   color: 'var(--completed)', icon: 'ST' },
        { label: 'Purchase Req.',   value: trendTotals?.inventory_purchase_requests ?? 0, color: 'var(--pending)', icon: 'PR' },
      ]
    : trendModule === 'housekeeping'
    ? [
        { label: 'Total HK',    value: trendTotals?.housekeeping ?? 0,  color: 'var(--green-800)', icon: 'HK' },
        { label: 'Completed',   value: trendTotals?.hk_done ?? 0,       color: 'var(--completed)', icon: 'DN' },
        { label: 'Pending',     value: trendTotals?.hk_pending ?? 0,    color: 'var(--pending)', icon: 'PD' },
        { label: 'In Progress', value: trendTotals?.hk_in_progress ?? 0,color: 'var(--ongoing)', icon: 'IP' },
        { label: 'Skipped',     value: trendTotals?.hk_skipped ?? 0,    color: 'var(--text-3)', icon: 'SK' },
      ]
    : trendModule === 'horticulture'
    ? [{ label: 'Horticulture', value: trendTotals?.horticulture ?? 0, color: 'var(--green-700)', icon: 'HT' }]
    : [
        { label: 'Inventory',    value: trendTotals?.inventory ?? 0,    color: 'var(--green-800)', icon: 'IR' },
        { label: 'Housekeeping', value: trendTotals?.housekeeping ?? 0, color: 'var(--orange-600)', icon: 'HK' },
        { label: 'Horticulture', value: trendTotals?.horticulture ?? 0, color: 'var(--green-700)', icon: 'HT' },
      ]

  const visibleTrendLines = isHorticultureManager
    ? trendLines.filter((line) => line.key === 'horticulture')
    : isHostelOffice
    ? trendLines.filter((line) => line.key === 'housekeeping' || line.key.startsWith('hk_'))
    : canViewHorticulture
    ? trendLines
    : trendLines.filter((line) => line.key !== 'horticulture')
  const visibleSummaryBoxes = isHorticultureManager
    ? summaryBoxes.filter((box) => box.label === 'Horticulture')
    : isHostelOffice
    ? summaryBoxes.filter((box) => ['Total HK', 'Completed', 'Pending', 'In Progress', 'Skipped'].includes(box.label))
    : canViewHorticulture
    ? summaryBoxes
    : summaryBoxes.filter((box) => box.label !== 'Horticulture')

  const baseStatCards = [
    { label: 'Total Inventory Items',  value: invSummary?.total_items ?? '-',           icon: 'IR', color: 'var(--green-800)', sub: `${invSummary?.pending_requests ?? 0} requests pending`, to: '/inventory?tab=items' },
    { label: 'Low Stock Alerts',       value: invSummary?.low_stock_count ?? '-',        icon: 'LS', color: 'var(--orange-600)', sub: `${invSummary?.out_of_stock_count ?? 0} out of stock`,  to: '/inventory?tab=items' },
    { label: 'HK Tasks Today',         value: hkSummary?.total_tasks ?? '-',            icon: 'HK', color: 'var(--green-700)', sub: `${hkSummary?.completion_pct ?? 0}% completed`,           to: '/housekeeping?tab=overview' },
    { label: 'HK Workers',             value: hkSummary?.total_workers ?? '-',          icon: 'WK', color: '#3b82f6',          sub: `${hkSummary?.present_today ?? 0} present today`,          to: '/housekeeping?tab=attendance' },
    { label: 'Unreturned Assets',      value: invSummary?.unreturned_assets ?? '-',     icon: 'UA', color: '#f59e0b',          sub: `${invSummary?.overdue_returns ?? 0} overdue`,             to: '/inventory?tab=issues' },
    { label: 'Pending Stock Req.',     value: hkSummary?.pending_stock_requests ?? '-', icon: 'SR', color: 'var(--orange-600)', sub: 'Open approval queue',                                    to: '/inventory?tab=requests' },
  ]
  const statCards = isHorticultureManager
    ? [
        { label: 'Horticulture Tasks', value: hortiTotal || '-', icon: 'HT', color: 'var(--green-700)', sub: `${Number(hortiCounts.on_track || 0)} on track`, to: '/horticulture?tab=schedule' },
        { label: 'Due Soon', value: Number(hortiCounts.due_soon || 0), icon: 'DS', color: 'var(--orange-600)', sub: `${Number(hortiCounts.overdue || 0)} overdue`, to: '/horticulture?tab=worker_selection' },
        { label: 'Active Areas', value: hortiSummary?.total_areas ?? '-', icon: 'AR', color: '#3b82f6', sub: 'Horticulture coverage', to: '/horticulture?tab=zones' },
      ]
    : isHostelOffice
    ? [
        { label: 'Hostel Tasks Today', value: hkSummary?.total_tasks ?? '-', icon: 'HK', color: 'var(--green-700)', sub: `${hkSummary?.completion_pct ?? 0}% completed`, to: '/housekeeping?tab=overview' },
        { label: 'Completed Tasks', value: hkSummary?.done_tasks ?? '-', icon: 'DN', color: 'var(--completed)', sub: 'Marked done today', to: '/housekeeping?tab=overview' },
        { label: 'Pending Tasks', value: hkSummary?.pending_tasks ?? '-', icon: 'PD', color: 'var(--orange-600)', sub: 'Open hostel tasks', to: '/housekeeping?tab=overview' },
        { label: 'Hostel Workers', value: hkSummary?.total_workers ?? '-', icon: 'HW', color: '#3b82f6', sub: `${hkSummary?.present_today ?? 0} present today`, to: '/housekeeping?tab=attendance' },
        { label: 'Hostel Areas', value: hkSummary?.total_areas ?? '-', icon: 'AR', color: 'var(--green-800)', sub: 'Active hostel sections', to: '/housekeeping?tab=directory' },
        { label: 'Inventory Items', value: invSummary?.total_items ?? '-', icon: 'IR', color: '#7c3aed', sub: 'View-only stock report', to: '/inventory?tab=inventory-report' },
      ]
    : baseStatCards
  const completionPct = Number(hkSummary?.completion_pct || 0)
  const heroMetric = isHorticultureManager
    ? { value: hortiTotal || 0, label: 'active horticulture tasks', progress: hortiTotal ? (Number(hortiCounts.on_track || 0) / hortiTotal) * 100 : 0, color: 'var(--green-700)' }
    : isHostelOffice
    ? { value: `${completionPct}%`, label: 'hostel task completion', progress: completionPct, color: 'var(--green-800)' }
    : { value: invSummary?.pending_requests ?? 0, label: 'inventory requests pending', progress: Math.min(100, Number(invSummary?.pending_requests || 0) * 8), color: 'var(--orange-600)' }
  const heroTitle = isHorticultureManager
    ? 'Horticulture Control Room'
    : isHostelOffice
    ? 'Hostel Office Control Room'
    : 'Campus Operations Control Room'
  const heroSubtitle = isHorticultureManager
    ? 'Track zones, due tasks, and field progress from one focused home view.'
    : isHostelOffice
    ? 'Assign hostel work, monitor JRHA and hostel sections, and open inventory reports without admin-only controls.'
    : 'A cleaner snapshot of stock, housekeeping, and horticulture activity for the day.'
  const quickActions = isHorticultureManager
    ? [
        { label: 'Schedule', to: '/horticulture?tab=schedule', primary: true },
        { label: 'Zones', to: '/horticulture?tab=zones' },
      ]
    : isHostelOffice
    ? [
        { label: 'Assign Work', to: '/housekeeping?tab=overview', primary: true },
        { label: 'Section Staff', to: '/housekeeping?tab=directory' },
        { label: 'Inventory Report', to: '/inventory?tab=inventory-report' },
        { label: 'Stock Requests', to: '/housekeeping?tab=stock' },
      ]
    : [
        { label: 'Housekeeping', to: '/housekeeping?tab=overview', primary: true },
        { label: 'Inventory', to: '/inventory?tab=items' },
        { label: 'Reports', to: '/inventory?tab=inventory-report' },
      ]

  return (
    <AdminLayout title={isHorticultureManager ? 'Horticulture Home' : isHostelOffice ? 'Hostel Office Dashboard' : 'Admin Dashboard'} subtitle={`Welcome back - ${todayLabel}`}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>
      ) : (
        <>
          <DashboardHero title={heroTitle} subtitle={heroSubtitle} metric={heroMetric} quickActions={quickActions} variant={isHostelOffice ? 'hostel' : 'default'} />
          {isHostelOffice && <HostelOfficePanel hkSummary={hkSummary} invSummary={invSummary} />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            {statCards.map(card => (
              <a key={card.label} href={adminHref(card.to || '/dashboard')} className="ui-interactive-card-link" style={{ height: '100%', textDecoration: 'none', color: 'inherit' }} title={`Open ${card.label}`}>
                <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} sub={card.sub} style={{ height: '100%', cursor: 'pointer', userSelect: 'none' }} />
              </a>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              canViewInventory ? { title: 'Inventory', subtitle: 'Stock overview', data: invDonut, total: invSummary?.total_items, label: 'Items', palette: DONUT_PALETTE, to: '/inventory' } : null,
              canViewHousekeeping ? { title: isHostelOffice ? 'Hostel Housekeeping' : 'Housekeeping', subtitle: isHostelOffice ? 'Hostel tasks today' : 'Today tasks', data: hkDonutData, total: hkSummary?.total_tasks, label: hkHasAct ? 'Tasks' : 'No Activity', palette: DONUT_PALETTE, to: '/housekeeping' } : null,
              canViewHorticulture && !isHorticultureManager ? { title: 'Horticulture', subtitle: 'Task status', data: hortiDonutData, total: hortiTotal, label: hortiTotal > 0 ? 'Tasks' : 'No Activity', palette: DONUT_PALETTE, to: '/horticulture' } : null,
            ].filter(Boolean).map(card => (
              <Card key={card.title}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{card.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{card.subtitle}</div>
                  </div>
                  <a href={adminHref(card.to || '/dashboard')} style={{ textDecoration: 'none' }}><Btn size="sm" variant="ghost">View</Btn></a>
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

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Activity Trend</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{isHostelOffice ? 'Hostel housekeeping activity over time' : 'System-wide activity over time'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RANGE_OPTIONS.map(opt => (
                  <Btn key={opt.key} size="sm" variant={trendRange === opt.key ? 'primary' : 'secondary'} onClick={() => setTrendRange(opt.key)}>
                    {opt.label}
                  </Btn>
                ))}
              </div>
            </div>

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

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              {visibleSummaryBoxes.map(b => (
                <SummaryStatBox key={b.label} label={b.label} value={b.value} color={b.color} icon={b.icon} />
              ))}
            </div>

            {trendLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
            ) : chartType === 'area' ? (
              <ActivityAreaChart data={trendData} lines={visibleTrendLines} height={240} />
            ) : chartType === 'bar' ? (
              <ActivityBarChart data={trendData} lines={visibleTrendLines} height={240} />
            ) : (
              <ActivityPieChart data={trendData} lines={visibleTrendLines} />
            )}

            {!trendLoading && trendData.length > 0 && chartType !== 'pie' && (() => {
              const primaryKey = visibleTrendLines[0]?.key
              const peak = trendData.reduce((best, row) => Number(row[primaryKey] || 0) > Number(best[primaryKey] || 0) ? row : best, trendData[0])
              const total = trendData.reduce((s, row) => s + Number(row[primaryKey] || 0), 0)
              const avg = total / trendData.length
              return (
                <div style={{ marginTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }}>
                  <div>Peak day: <strong>{peak?.name}</strong> ({Number(peak?.[primaryKey] || 0).toLocaleString('en-IN')} events)</div>
                  <div>Daily avg: <strong>{avg.toFixed(1)}</strong></div>
                  <div>Period total: <strong>{total.toLocaleString('en-IN')}</strong></div>
                </div>
              )
            })()}
          </Card>
        </>
      )}
    </AdminLayout>
  )
}
