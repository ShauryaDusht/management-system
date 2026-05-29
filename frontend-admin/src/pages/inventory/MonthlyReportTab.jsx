import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import api from '../../api/client'
import { Alert, Badge, Btn, Card, Spinner } from '../../components/ui'
import {
  csvUrl,
  deleteMonthly,
  downloadAnnualStockRegisterCSV,
  generateMonthly,
  getAnnualBudget,
  getMonthly,
  listMonthly,
  pdfUrl,
} from '../../api/inventory'
import { triggerDownload } from '../../shared/utils'
import MonthYearPicker from '../../shared/components/MonthYearPicker'
import { useMonthYear } from '../../shared/hooks/useMonthYear'
import ConfirmModal from '../../shared/components/ConfirmModal'
import PurchasePlannerPanel from './PurchasePlannerPanel'

// ── Budget constants (housekeeping material consumption) ──────────────────────
const YEARLY_HK_MATERIAL_BUDGET = 68_00_000   // ₹68 lakh yearly housekeeping material consumption
const YEARLY_HK_MATERIAL_RANGE_TEXT = 'Approx. ₹65-68 lakh yearly'
const MONTHLY_HK_MATERIAL_RANGE_TEXT = 'Usual monthly use: ₹4-5 lakh + event requirements'
const TOTAL_BUDGET = YEARLY_HK_MATERIAL_BUDGET

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CHART_COLORS = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444','#0d9488','#f97316','#6366f1']

// ── Formatters ────────────────────────────────────────────────────────────────
const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(Number(n)||0)
const lakhs  = (n) => (Number(n)/1_00_000).toFixed(2)
const lakhLabel = (n) => `${Number(n) < 0 ? '-' : ''}₹${lakhs(Math.abs(Number(n) || 0))} Lakh`

async function downloadWithToken(url, filename) {
  try {
    const resp = await api.get(url, { responseType:'blob' })
    triggerDownload(resp.data, filename)
  } catch { window.alert('Download failed.') }
}

async function downloadStockRegister(year) {
  try {
    const resp = await downloadAnnualStockRegisterCSV(year)
    triggerDownload(resp.data, `inventory_stock_register_${year}.csv`)
  } catch { window.alert('Stock register download failed.') }
}

// ── Tiny sub-components ───────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, right }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:8 }}>
      <div>
        <div style={{ fontWeight:800, fontSize:16 }}>{icon} {title}</div>
        {subtitle && <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

function KpiCard({ icon, label, value, sub, valueColor='var(--text)', subColor='var(--text-3)' }) {
  return (
    <div style={{ flex:1, minWidth:200, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
      <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {icon && <span style={{ marginRight:5 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize:26, fontWeight:900, marginTop:6, color:valueColor, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, marginTop:4, color:subColor, fontWeight:500 }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ spent, total }) {
  const pct = Math.min(100, (spent / total) * 100)
  const color = pct < 50 ? '#16a34a' : pct < 75 ? '#f59e0b' : '#dc2626'
  return (
    <div>
      <div style={{ height:16, background:'var(--surface-2)', borderRadius:99, border:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${color}bb,${color})`, borderRadius:99, transition:'width 0.7s ease' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12 }}>
        <span style={{ color, fontWeight:700 }}>{inr(spent)} spent &nbsp;({pct.toFixed(1)}%)</span>
        <span style={{ color:'var(--text-3)' }}>{inr(total - spent)} remaining of {inr(total)}</span>
      </div>
    </div>
  )
}

function MonthlySpendChart({ data }) {
  if (!data?.length) return null
  const chartData = data.map((d) => ({ name:d.month_label, 'Lakhs ₹':parseFloat(lakhs(d.spent)) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top:5, right:10, left:0, bottom:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)' }} />
        <YAxis tick={{ fontSize:11, fill:'var(--text-3)' }} tickFormatter={(v)=>`₹${v}L`} />
        <Tooltip formatter={(v)=>[`₹${v} Lakhs`,'Spent']} contentStyle={{ borderRadius:9, border:'1px solid var(--border)', fontSize:12 }} />
        <Bar dataKey="Lakhs ₹" radius={[5,5,0,0]}>
          {chartData.map((d,i) => <Cell key={i} fill={d['Lakhs ₹']>0 ? '#3b82f6' : '#e2e8f0'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryPieChart({ data }) {
  if (!data?.length) return null
  const top6 = data.slice(0,6).map((d)=>({ name:d.category, value:parseFloat(lakhs(d.spent)) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={top6} cx="45%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}
          label={({ name, percent }) => `${name.substring(0,10)} ${(percent*100).toFixed(0)}%`} labelLine={false}>
          {top6.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v)=>[`₹${v} Lakhs`]} contentStyle={{ fontSize:12, borderRadius:9 }} />
        <Legend iconSize={10} wrapperStyle={{ fontSize:11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function YearSelector({ value, onChange }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-2)' }}>Year:</span>
      {[2024,2025,2026].map((y)=>(
        <button key={y} onClick={()=>onChange(y)} style={{
          padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
          border: value===y ? 'none' : '1px solid var(--border)',
          background: value===y ? '#3b82f6' : 'var(--surface)',
          color: value===y ? '#fff' : 'var(--text-2)',
        }}>{y}</button>
      ))}
    </div>
  )
}

function NavTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
      {tabs.map((t)=>(
        <button key={t.key} onClick={()=>onChange(t.key)} style={{
          padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer',
          border: active===t.key ? 'none' : '1px solid var(--border)',
          background: active===t.key ? 'var(--green-800)' : 'var(--surface)',
          color: active===t.key ? '#fff' : 'var(--text-2)',
          transition:'all 0.15s',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

function SecondaryActions({ active, onChange }) {
  const actions = [
    { key:'report', label:'📋 Monthly Report' },
    { key:'history', label:'🗂 History' },
  ]
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap', margin:'-8px 0 20px' }}>
      {actions.map((action)=>(
        <button key={action.key} onClick={()=>onChange(action.key)} style={{
          padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer',
          border: active===action.key ? 'none' : '1px solid var(--border)',
          background: active===action.key ? 'var(--green-800)' : 'var(--surface)',
          color: active===action.key ? '#fff' : 'var(--text-2)',
          transition:'all 0.15s',
        }}>{action.label}</button>
      ))}
    </div>
  )
}

function Th({ children }) {
  return (
    <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, fontSize:11,
      textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-3)',
      borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{children}</th>
  )
}
function Td({ children, style }) {
  return <td style={{ padding:'10px 12px', color:'var(--text-2)', ...style }}>{children}</td>
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MonthlyReportTab() {
  const nowYear  = new Date().getFullYear()
  const nowMonth = new Date().getMonth() + 1

  // monthly report state
  const { month, year:rptYear, setMonth, setYear } = useMonthYear()
  const [history,        setHistory]        = useState([])
  const [selected,       setSelected]       = useState(null)
  const [loadingHist,    setLoadingHist]    = useState(true)
  const [loadingSnap,    setLoadingSnap]    = useState(false)
  const [error,          setError]          = useState('')
  const [confirmDelete,  setConfirmDelete]  = useState(null)

  // budget analytics state
  const [budgetYear,    setBudgetYear]    = useState(nowYear)
  const [budgetData,    setBudgetData]    = useState(null)
  const [budgetLoading, setBudgetLoading] = useState(true)
  const [budgetError,   setBudgetError]   = useState('')

  // snapshot filters
  const [fCat,    setFCat]    = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fType,   setFType]   = useState('')
  const [fSearch, setFSearch] = useState('')
  const [stockSearch, setStockSearch] = useState('')

  // active section
  const [view, setView] = useState('budget')

  // ── loaders ───────────────────────────────────────────────────────────────
  const loadBudget = async (yr) => {
    setBudgetLoading(true); setBudgetError('')
    try {
      const { data } = await getAnnualBudget(yr)
      setBudgetData(data)
    } catch(e) { setBudgetError(e.response?.data?.detail || 'Budget data load failed.') }
    finally { setBudgetLoading(false) }
  }
  useEffect(()=>{ loadBudget(budgetYear) }, [budgetYear])

  const loadHistory = async () => {
    setLoadingHist(true); setError('')
    try {
      const { data } = await listMonthly()
      setHistory(Array.isArray(data) ? data : data?.results || [])
    } catch(e) { setError(e.response?.data?.detail || 'Failed to load history.') }
    finally { setLoadingHist(false) }
  }
  useEffect(()=>{ loadHistory() }, [])

  const generate = async (overwrite=false) => {
    setError('')
    try {
      const { data } = await generateMonthly(month, rptYear, overwrite)
      await loadHistory()
      await viewReport(data.id)
      setView('report')
    } catch(e) { setError(e.response?.data?.detail || e.response?.data?.message || 'Generation failed.') }
  }

  const viewReport = async (id) => {
    setLoadingSnap(true); setError('')
    try {
      const { data } = await getMonthly(id)
      setSelected(data)
      setFCat(''); setFStatus(''); setFType(''); setFSearch('')
    } catch(e) { setError(e.response?.data?.detail || 'Load failed.') }
    finally { setLoadingSnap(false) }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMonthly(confirmDelete.id)
      setConfirmDelete(null)
      if (selected?.id === confirmDelete.id) setSelected(null)
      await loadHistory()
    } catch(e) { setError(e.response?.data?.detail || 'Delete failed.') }
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const spent       = budgetData?.total_spent_year || 0
  const remaining   = TOTAL_BUDGET - spent
  const spentPct    = Math.min(100, (spent/TOTAL_BUDGET)*100)
  const remColor    = remaining > TOTAL_BUDGET*0.5 ? '#16a34a' : remaining > TOTAL_BUDGET*0.25 ? '#f59e0b' : '#dc2626'
  const stockSummary = budgetData?.current_stock_register_summary || {}
  const stockRows = budgetData?.current_stock_register || []
  const trackedCurrentStockValue = stockSummary?.tracked_current_stock_value || 0
  const trackedReceiptValue = stockSummary?.tracked_receipt_value_year || 0
  const trackedCurrentQty = stockSummary?.tracked_current_quantity || 0
  const trackedReceivedQty = stockSummary?.tracked_received_quantity_year || 0
  const outOfStockCount = stockSummary?.out_of_stock_count || 0
  const lowStockCount = stockSummary?.low_stock_count || 0
  const stockRetentionPct = trackedReceiptValue > 0 ? (trackedCurrentStockValue / trackedReceiptValue) * 100 : 0

  const snapshotCats = useMemo(()=>{
    const s = new Set((selected?.snapshot?.items||[]).map(i=>i.category))
    return [...s].filter(Boolean).sort()
  }, [selected])

  const filteredItems = useMemo(()=>{
    let rows = selected?.snapshot?.items || []
    if (fCat)    rows = rows.filter(r=>r.category===fCat)
    if (fStatus==='out_of_stock')  rows = rows.filter(r=>r.status==='out_of_stock')
    else if (fStatus==='low_stock')   rows = rows.filter(r=>r.status==='low_stock')
    else if (fStatus==='in_stock')    rows = rows.filter(r=>r.status==='in_stock')
    else if (fStatus==='needs_reorder') rows = rows.filter(r=>r.recommended_order>0)
    if (fType)   rows = rows.filter(r=>r.item_type===fType)
    if (fSearch) rows = rows.filter(r=>
      (r.item_name||'').toLowerCase().includes(fSearch.toLowerCase()) ||
      (r.item_code||'').toLowerCase().includes(fSearch.toLowerCase())
    )
    return rows
  }, [selected, fCat, fStatus, fType, fSearch])

  const reorderItems = useMemo(()=>
    [...(budgetData?.reorder_priority||[])].sort((a,b)=>b.estimated_cost-a.estimated_cost)
  , [budgetData])

  const filteredStockRows = useMemo(()=>{
    const q = stockSearch.trim().toLowerCase()
    if (!q) return stockRows
    return stockRows.filter((row)=>
      (row.item_name||'').toLowerCase().includes(q) ||
      (row.category||'').toLowerCase().includes(q) ||
      (row.item_code||'').toLowerCase().includes(q) ||
      (row.status||'').toLowerCase().includes(q)
    )
  }, [stockRows, stockSearch])

  const totalReorderCost = reorderItems.reduce((s,i)=>s+i.estimated_cost,0)
  const totalSnapshotCost = filteredItems.reduce((s,r)=>s+(r.estimated_cost||0),0)

  const VIEWS = [
    { key:'budget',   label:'💰 Budget Overview' },
    { key:'charts',   label:'📊 Analytics' },
    { key:'purchase', label:'🧾 Purchase Planner' },
    { key:'reorder',  label:`🔴 Reorder Alerts${reorderItems.length>0?` (${reorderItems.length})`:''}` },
    { key:'consumed', label:'📈 Top Consumed' },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page title */}
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>
          📦 Procurement Intelligence & Budget Tracker
        </h2>
        <p style={{ fontSize:13, color:'var(--text-3)' }}>
          Yearly HK material consumption:&nbsp;
          <strong>{inr(TOTAL_BUDGET)}</strong>
          &nbsp;·&nbsp; {YEARLY_HK_MATERIAL_RANGE_TEXT}
          &nbsp;·&nbsp; {MONTHLY_HK_MATERIAL_RANGE_TEXT}
        </p>
      </div>

      <Alert message={error} />
      <Alert message={budgetError} type="warn" />

      <NavTabs tabs={VIEWS} active={view} onChange={setView} />
      <SecondaryActions active={view} onChange={setView} />

      {/* ══════════════════════════════════════════════════════════════════════
          BUDGET OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='budget' && (
        <div>
          <YearSelector value={budgetYear} onChange={setBudgetYear} />
          {budgetLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={32} /></div>
            : <>
              {/* KPI row */}
              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:20 }}>
                <KpiCard icon="🏦" label="Yearly HK Material Budget" valueColor="#2d4a3e"
                  value={lakhLabel(TOTAL_BUDGET)}
                  sub={`${YEARLY_HK_MATERIAL_RANGE_TEXT} | ${MONTHLY_HK_MATERIAL_RANGE_TEXT}`} />
                <KpiCard icon="💸" label={`Spent in ${budgetYear}`} valueColor="#dc2626"
                  value={lakhLabel(spent)}
                  sub={inr(spent)} subColor="#dc2626" />
                <KpiCard icon="✅" label="Remaining Budget" valueColor={remColor}
                  value={lakhLabel(remaining)}
                  sub={`${(100-spentPct).toFixed(1)}% still available`} subColor={remColor} />
                <KpiCard icon="📦" label="Tracked Stock Value" valueColor="#2563eb"
                  value={inr(trackedCurrentStockValue)}
                  sub={`${trackedCurrentQty} units currently in store`} subColor="#2563eb" />
                <KpiCard icon="🚚" label={`Received in ${budgetYear}`} valueColor="#7c3aed"
                  value={inr(trackedReceiptValue)}
                  sub={`${trackedReceivedQty} units logged this year`} subColor="#7c3aed" />
                <KpiCard icon="🔴" label="Reorder Alerts" valueColor="#f59e0b"
                  value={reorderItems.length}
                  sub="items below threshold" subColor="#f59e0b" />
              </div>

              {/* Progress bar */}
              <Card style={{ marginBottom:20 }}>
                <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>
                  Annual HK Material Budget Utilization — {budgetYear}
                </div>
                <ProgressBar spent={spent} total={TOTAL_BUDGET} />
                <div style={{ display:'flex', gap:24, marginTop:14, flexWrap:'wrap', fontSize:12 }}>
                  <div><span style={{ color:'var(--text-3)' }}>Yearly HK Material Budget: </span><strong>{inr(TOTAL_BUDGET)}</strong></div>
                  <div><span style={{ color:'var(--text-3)' }}>Planned Monthly Use: </span><strong>{MONTHLY_HK_MATERIAL_RANGE_TEXT}</strong></div>
                  <div><span style={{ color:'var(--text-3)' }}>All-time Procurement: </span><strong>{inr(budgetData?.total_procurement_value)}</strong></div>
                  <div><span style={{ color:'var(--text-3)' }}>Current Inventory Value: </span><strong>{inr(budgetData?.current_stock_value)}</strong></div>
                  <div><span style={{ color:'var(--text-3)' }}>Tracked Receipt Retention: </span><strong>{stockRetentionPct.toFixed(1)}%</strong></div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginTop:14, flexWrap:'wrap' }}>
                  <div style={{ fontSize:12, color:'var(--text-3)' }}>
                    Latest tracked receipt: <strong>{stockSummary?.latest_receipt_date || '—'}</strong>
                    &nbsp;·&nbsp; Out of stock: <strong style={{ color:'#dc2626' }}>{outOfStockCount}</strong>
                    &nbsp;·&nbsp; Low stock: <strong style={{ color:'#f59e0b' }}>{lowStockCount}</strong>
                  </div>
                  <Btn size="sm" variant="secondary" onClick={()=>downloadStockRegister(budgetYear)}>
                    ⬇ Stock Register CSV
                  </Btn>
                </div>
              </Card>

              {/* Smart recommendation banners */}
              <Card>
                <SectionHeader icon="💡" title="Admin Recommendations"
                  subtitle={`AI-based procurement guidance for ${budgetYear}`} />
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {spentPct < 30 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#d1fae5', border:'1px solid #6ee7b7', fontSize:13, color:'#065f46' }}>
                      ✅ <strong>Budget healthy.</strong> Only {spentPct.toFixed(1)}% spent.
                      Good time to procure consumables in bulk for cost savings — especially cleaning acids, phenyl, and floor cleaners that are used heavily.
                    </div>
                  )}
                  {spentPct>=30 && spentPct<65 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#dbeafe', border:'1px solid #93c5fd', fontSize:13, color:'#1e40af' }}>
                      📊 <strong>On track.</strong> {spentPct.toFixed(1)}% spent with {(100-spentPct).toFixed(1)}% remaining.
                      Monitor top consuming categories and plan next quarter procurement now.
                    </div>
                  )}
                  {spentPct>=65 && spentPct<85 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#fef3c7', border:'1px solid #fde68a', fontSize:13, color:'#92400e' }}>
                      ⚠️ <strong>Budget caution.</strong> {spentPct.toFixed(1)}% spent.
                      Prioritize only essential reorders. Avoid bulk speculative purchases.
                    </div>
                  )}
                  {spentPct>=85 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#fee2e2', border:'1px solid #fca5a5', fontSize:13, color:'#991b1b' }}>
                      🚨 <strong>Budget critical — {spentPct.toFixed(1)}% exhausted!</strong>&nbsp;
                      Only purchase out-of-stock or safety-critical items. Seek budget reallocation if needed.
                    </div>
                  )}
                  {reorderItems.length>0 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#fef3c7', border:'1px solid #fde68a', fontSize:13, color:'#92400e' }}>
                      🔴 <strong>{reorderItems.length} items</strong> below threshold.
                      Estimated reorder cost: <strong>{inr(totalReorderCost)}</strong>.&nbsp;
                      <button onClick={()=>setView('reorder')} style={{ color:'#dc2626', fontWeight:700, background:'none', border:'none', cursor:'pointer', fontSize:13, textDecoration:'underline' }}>
                        View list →
                      </button>
                    </div>
                  )}
                  {stockRows.length>0 && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#eff6ff', border:'1px solid #bfdbfe', fontSize:13, color:'#1d4ed8' }}>
                      📦 <strong>Verified stock register active.</strong> Tracked stock value is <strong>{inr(trackedCurrentStockValue)}</strong>
                      with <strong>{outOfStockCount}</strong> out-of-stock items and <strong>{lowStockCount}</strong> low-stock items.
                      <button onClick={()=>setView('stock')} style={{ color:'#1d4ed8', fontWeight:700, background:'none', border:'none', cursor:'pointer', fontSize:13, textDecoration:'underline', marginLeft:6 }}>
                        Open stock register →
                      </button>
                    </div>
                  )}
                  {budgetData?.top_consumed_items?.[0] && (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#f0fdf4', border:'1px solid #bbf7d0', fontSize:13, color:'#166534' }}>
                      📈 <strong>Top consumed item:</strong> {budgetData.top_consumed_items[0].item_name} —&nbsp;
                      {inr(budgetData.top_consumed_items[0].total_value)} consumed this year.
                      Consider negotiating a bulk-rate annual contract with the supplier.
                    </div>
                  )}
                </div>
              </Card>
            </>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ANALYTICS CHARTS
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='charts' && (
        <div>
          <YearSelector value={budgetYear} onChange={setBudgetYear} />
          {budgetLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={32} /></div>
            : <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <Card>
                <SectionHeader icon="📊" title="Monthly Procurement Spend" subtitle={`₹ Lakhs — ${budgetYear}`} />
                <MonthlySpendChart data={budgetData?.monthly_spending||[]} />
                <div style={{ marginTop:8, fontSize:12, color:'var(--text-3)', textAlign:'center' }}>
                  Year Total: <strong>{inr(budgetData?.total_spent_year)}</strong>
                  &nbsp;({lakhLabel(budgetData?.total_spent_year)})
                </div>
              </Card>

              <Card>
                <SectionHeader icon="🗂" title="Spend by Category" subtitle={`Top categories — ${budgetYear}`} />
                <CategoryPieChart data={budgetData?.category_breakdown||[]} />
              </Card>

              {/* Full category table */}
              <Card style={{ gridColumn:'1 / -1' }} noPad>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                  <SectionHeader icon="📋" title="Category-wise Spend Detail"
                    subtitle="All categories sorted by total procurement spend" />
                </div>
                <div style={{ overflow:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead><tr>
                      <Th>#</Th><Th>Category</Th><Th>Item Count</Th>
                      <Th>Spent (₹)</Th><Th>% of Budget</Th><Th>Visual</Th>
                    </tr></thead>
                    <tbody>
                      {(budgetData?.category_breakdown||[]).map((cat,i)=>{
                        const pct=(cat.spent/TOTAL_BUDGET)*100
                        return (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)', background:i%2?'var(--surface-2)':'transparent' }}>
                            <Td style={{ color:'var(--text-3)', fontWeight:700, width:36 }}>{i+1}</Td>
                            <Td style={{ fontWeight:600 }}>{cat.category}</Td>
                            <Td>{cat.item_count}</Td>
                            <Td style={{ fontWeight:700 }}>{inr(cat.spent)}</Td>
                            <Td>{pct.toFixed(2)}%</Td>
                            <td style={{ padding:'10px 12px', minWidth:140 }}>
                              <div style={{ height:8, background:'var(--surface-2)', borderRadius:99, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${Math.min(100,pct*6)}%`,
                                  background:CHART_COLORS[i%CHART_COLORS.length], borderRadius:99 }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          REORDER ALERTS
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='purchase' && <PurchasePlannerPanel />}

      {view==='stock' && (
        <div>
          <YearSelector value={budgetYear} onChange={setBudgetYear} />
          {budgetLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={32} /></div>
            : <>
              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:20 }}>
                <KpiCard icon="📦" label="Tracked Stock Value" valueColor="#2563eb"
                  value={inr(trackedCurrentStockValue)}
                  sub={`${trackedCurrentQty} units currently in stock`} subColor="#2563eb" />
                <KpiCard icon="🚚" label={`Received in ${budgetYear}`} valueColor="#7c3aed"
                  value={inr(trackedReceiptValue)}
                  sub={`${trackedReceivedQty} units logged this year`} subColor="#7c3aed" />
                <KpiCard icon="🔴" label="Out of Stock" valueColor="#dc2626"
                  value={outOfStockCount}
                  sub="items requiring attention" subColor="#dc2626" />
                <KpiCard icon="🟠" label="Low Stock" valueColor="#f59e0b"
                  value={lowStockCount}
                  sub="items at threshold or below" subColor="#f59e0b" />
              </div>

              <Card noPad>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                  <SectionHeader
                    icon="📦"
                    title={`Current Stock Register — ${budgetYear}`}
                    subtitle={`Verified housekeeping consumables. Baseline receipt date: ${stockSummary?.baseline_received_date || '—'} · Latest receipt: ${stockSummary?.latest_receipt_date || '—'}`}
                    right={
                      <Btn size="sm" variant="secondary" onClick={()=>downloadStockRegister(budgetYear)}>
                        ⬇ CSV
                      </Btn>
                    }
                  />
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                    <input
                      placeholder="🔍 Search material / code / category..."
                      value={stockSearch}
                      onChange={e=>setStockSearch(e.target.value)}
                      style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, background:'var(--surface)', color:'var(--text)', outline:'none', minWidth:240 }}
                    />
                    {stockSearch && (
                      <Btn size="sm" variant="ghost" onClick={()=>setStockSearch('')}>
                        ✕ Clear
                      </Btn>
                    )}
                  </div>
                </div>

                <div style={{ overflow:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr>
                        <Th>Code</Th>
                        <Th>Material</Th>
                        <Th>Category</Th>
                        <Th>Unit</Th>
                        <Th>Current Qty</Th>
                        <Th>Current Value</Th>
                        <Th>Received Qty</Th>
                        <Th>Received Value</Th>
                        <Th>Balance</Th>
                        <Th>Last Received</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockRows.length===0
                        ? <tr><td colSpan={11} style={{ padding:30, textAlign:'center', color:'var(--text-3)' }}>No stock rows match the current search.</td></tr>
                        : filteredStockRows.map((row,i)=>(
                          <tr key={row.item_id || i} style={{ borderBottom:'1px solid var(--border)', background:row.status==='out_of_stock'?'#fee2e208':row.status==='low_stock'?'#fef3c708':i%2?'var(--surface-2)':'transparent' }}>
                            <td style={{ padding:'10px 12px', color:'var(--text-3)', fontSize:11 }}>{row.item_code || '—'}</td>
                            <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--text)' }}>{row.item_name}</td>
                            <Td>{row.category}</Td>
                            <Td>{row.unit}</Td>
                            <td style={{ padding:'10px 12px', fontWeight:700, color:row.current_quantity===0?'#dc2626':row.status==='low_stock'?'#f59e0b':'#16a34a' }}>{row.current_quantity}</td>
                            <td style={{ padding:'10px 12px', fontWeight:700 }}>{inr(row.current_value)}</td>
                            <Td>{row.received_quantity_year}</Td>
                            <Td>{inr(row.received_value_year)}</Td>
                            <Td>{row.balance_pct_of_year_receipts!=null ? `${row.balance_pct_of_year_receipts}%` : '—'}</Td>
                            <Td>{row.last_received_on || '—'}</Td>
                            <td style={{ padding:'10px 12px' }}><Badge value={row.status} /></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          }
        </div>
      )}

      {view==='reorder' && (
        <Card noPad>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
            <SectionHeader icon="🔴" title="Priority Reorder List"
              subtitle="Items at or below threshold — purchase immediately to avoid stockout"
              right={
                <span style={{ fontSize:12, color:'var(--text-3)' }}>
                  {reorderItems.length} items · Est. Total:&nbsp;
                  <strong style={{ color:'#dc2626' }}>{inr(totalReorderCost)}</strong>
                </span>
              } />
          </div>
          {budgetLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
            : reorderItems.length===0
            ? <div style={{ padding:40, textAlign:'center', color:'var(--text-3)' }}>
                ✅ All items above threshold. No urgent reorders needed!
              </div>
            : <div style={{ overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr>
                  <Th>Item</Th><Th>Category</Th><Th>Current</Th>
                  <Th>Threshold</Th><Th>Rec. Qty</Th><Th>Unit Cost</Th>
                  <Th>Est. Cost</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {reorderItems.map((item,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)',
                      background:item.status==='out_of_stock'?'#fee2e208':item.status==='low_stock'?'#fef3c708':'transparent' }}>
                      <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--text)' }}>
                        {item.item_code && <span style={{ fontSize:10, color:'var(--text-3)', marginRight:4 }}>#{item.item_code}</span>}
                        {item.item_name}
                      </td>
                      <Td>{item.category}</Td>
                      <td style={{ padding:'10px 12px', fontWeight:700,
                        color:item.current_stock===0?'#dc2626':'#f59e0b' }}>{item.current_stock}</td>
                      <Td>{item.threshold}</Td>
                      <td style={{ padding:'10px 12px', fontWeight:700, color:'#3b82f6' }}>{item.recommended_qty}</td>
                      <Td>{inr(item.unit_cost)}</Td>
                      <td style={{ padding:'10px 12px', fontWeight:700 }}>{inr(item.estimated_cost)}</td>
                      <td style={{ padding:'10px 12px' }}><Badge value={item.status} /></td>
                    </tr>
                  ))}
                  <tr style={{ background:'var(--surface-2)', fontWeight:800 }}>
                    <td colSpan={6} style={{ padding:'10px 12px', textAlign:'right', fontSize:12, color:'var(--text-3)' }}>
                      Total Estimated Reorder Cost:
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:15, fontWeight:900, color:'#dc2626' }}>
                      {inr(totalReorderCost)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          }
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TOP CONSUMED ITEMS
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='consumed' && (
        <div>
          <YearSelector value={budgetYear} onChange={setBudgetYear} />
          <Card noPad>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
              <SectionHeader icon="📈" title={`Top 10 Most Consumed Items — ${budgetYear}`}
                subtitle="Sorted by total value consumed. Use to plan bulk purchases & negotiate supplier rates." />
            </div>
            {budgetLoading
              ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
              : !budgetData?.top_consumed_items?.length
              ? <div style={{ padding:40, textAlign:'center', color:'var(--text-3)' }}>No consumption data for this year yet.</div>
              : <div style={{ overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr>
                    <Th>#</Th><Th>Item</Th><Th>Category</Th><Th>Unit</Th>
                    <Th>Total Consumed</Th><Th>Avg/Month</Th>
                    <Th>Unit Cost</Th><Th>Total Value</Th>
                  </tr></thead>
                  <tbody>
                    {budgetData.top_consumed_items.map((item,i)=>{
                      const mths = budgetYear===nowYear ? nowMonth : 12
                      const avg = mths>0 ? (item.total_consumed/mths).toFixed(1) : '—'
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid var(--border)', background:i%2?'var(--surface-2)':'transparent' }}>
                          <td style={{ padding:'10px 12px', color:'var(--text-3)', fontWeight:700, width:36 }}>{i+1}</td>
                          <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--text)' }}>
                            {item.item_code && <span style={{ fontSize:10, color:'var(--text-3)', marginRight:4 }}>#{item.item_code}</span>}
                            {item.item_name}
                          </td>
                          <Td>{item.category}</Td>
                          <Td style={{ color:'var(--text-3)' }}>{item.unit}</Td>
                          <td style={{ padding:'10px 12px', fontWeight:700, color:'#3b82f6' }}>{item.total_consumed}</td>
                          <Td>{avg}/mo</Td>
                          <Td>{inr(item.unit_cost)}</Td>
                          <td style={{ padding:'10px 12px', fontWeight:700 }}>{inr(item.total_value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            }
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MONTHLY REPORT SNAPSHOT
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='report' && (
        <div>
          {/* Generate controls */}
          <Card style={{ marginBottom:16 }}>
            <SectionHeader icon="📅" title="Generate Monthly Procurement Report"
              subtitle="Full snapshot of all items: consumption, stock levels, recommended order quantities & cost estimates" />
            <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
              <MonthYearPicker month={month} year={rptYear} onMonthChange={setMonth} onYearChange={setYear} />
              <Btn onClick={()=>generate(false)} style={{ marginBottom:14 }}>⚙️ Generate</Btn>
              <Btn variant="danger" onClick={()=>generate(true)} style={{ marginBottom:14 }}>♻️ Overwrite</Btn>
            </div>
          </Card>

          {selected ? (
            <Card noPad>
              {/* Report header + controls */}
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15 }}>
                      {MONTHS[(selected.month||1)-1]} {selected.year} — Procurement Snapshot
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                      {selected.snapshot?.total_items||0} items ·&nbsp;
                      {selected.snapshot?.items_needing_reorder||0} need reorder ·&nbsp;
                      Showing {filteredItems.length} · Est. Cost:&nbsp;
                      <strong>{inr(totalSnapshotCost)}</strong>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <Btn size="sm" variant="secondary"
                      onClick={()=>downloadWithToken(csvUrl(selected.id), `procurement_${selected.year}_${String(selected.month).padStart(2,'0')}.csv`)}>
                      ⬇ CSV
                    </Btn>
                    <Btn size="sm" variant="secondary"
                      onClick={()=>downloadWithToken(pdfUrl(selected.id), `procurement_${selected.year}_${String(selected.month).padStart(2,'0')}.pdf`)}>
                      ⬇ PDF
                    </Btn>
                  </div>
                </div>

                {/* Filter bar */}
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                  <input placeholder="🔍 Search item / code..."
                    value={fSearch} onChange={e=>setFSearch(e.target.value)}
                    style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid var(--border)',
                      fontSize:13, background:'var(--surface)', color:'var(--text)', outline:'none', minWidth:200 }} />
                  <select value={fCat} onChange={e=>setFCat(e.target.value)}
                    style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)',
                      fontSize:13, background:'var(--surface)', color:'var(--text)', cursor:'pointer' }}>
                    <option value="">All Categories</option>
                    {snapshotCats.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={fStatus} onChange={e=>setFStatus(e.target.value)}
                    style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)',
                      fontSize:13, background:'var(--surface)', color:'var(--text)', cursor:'pointer' }}>
                    <option value="">All Status</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="in_stock">In Stock</option>
                    <option value="needs_reorder">Needs Reorder</option>
                  </select>
                  <select value={fType} onChange={e=>setFType(e.target.value)}
                    style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)',
                      fontSize:13, background:'var(--surface)', color:'var(--text)', cursor:'pointer' }}>
                    <option value="">All Types</option>
                    <option value="consumable">Consumable</option>
                    <option value="asset">Asset</option>
                  </select>
                  {(fCat||fStatus||fType||fSearch) && (
                    <Btn size="sm" variant="ghost" onClick={()=>{setFCat('');setFStatus('');setFType('');setFSearch('')}}>
                      ✕ Clear filters
                    </Btn>
                  )}
                </div>
              </div>

              {loadingSnap
                ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
                : <div style={{ overflow:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead><tr>
                      <Th>Code</Th><Th>Item</Th><Th>Category</Th><Th>Type</Th>
                      <Th>Stock</Th><Th>Threshold</Th><Th>Consumed</Th>
                      <Th>Rec. Order</Th><Th>Unit Cost</Th><Th>Est. Cost</Th><Th>Status</Th>
                    </tr></thead>
                    <tbody>
                      {filteredItems.length===0
                        ? <tr><td colSpan={11} style={{ padding:30, textAlign:'center', color:'var(--text-3)' }}>No items match the filters.</td></tr>
                        : filteredItems.map((r,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)',
                            background:r.status==='out_of_stock'?'#fee2e208':r.status==='low_stock'?'#fef3c708':'transparent' }}>
                            <td style={{ padding:'9px 12px', color:'var(--text-3)', fontSize:11 }}>{r.item_code||'—'}</td>
                            <td style={{ padding:'9px 12px', fontWeight:600, color:'var(--text)' }}>{r.item_name}</td>
                            <Td>{r.category}</Td>
                            <td style={{ padding:'9px 12px' }}>
                              <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:99,
                                background:r.item_type==='asset'?'#dbeafe':'#d1fae5',
                                color:r.item_type==='asset'?'#1d4ed8':'#065f46' }}>{r.item_type}</span>
                            </td>
                            <td style={{ padding:'9px 12px', fontWeight:700,
                              color:r.current_stock===0?'#dc2626':r.status==='low_stock'?'#f59e0b':'#16a34a' }}>
                              {r.current_stock}
                            </td>
                            <Td>{r.threshold}</Td>
                            <Td>{r.consumption??'—'}</Td>
                            <td style={{ padding:'9px 12px', fontWeight:r.recommended_order>0?700:400,
                              color:r.recommended_order>0?'#3b82f6':'var(--text-3)' }}>
                              {r.recommended_order}
                            </td>
                            <Td>{inr(r.unit_cost)}</Td>
                            <td style={{ padding:'9px 12px', fontWeight:700 }}>{inr(r.estimated_cost)}</td>
                            <td style={{ padding:'9px 12px' }}><Badge value={r.status} /></td>
                          </tr>
                        ))
                      }
                      {filteredItems.length>0 && (
                        <tr style={{ background:'var(--surface-2)', fontWeight:800 }}>
                          <td colSpan={9} style={{ padding:'10px 12px', textAlign:'right', fontSize:12, color:'var(--text-3)' }}>
                            {filteredItems.length} items · Total Est. Cost:
                          </td>
                          <td style={{ padding:'10px 12px', fontWeight:900, fontSize:14, color:'#dc2626' }}>
                            {inr(totalSnapshotCost)}
                          </td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              }
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign:'center', padding:50, color:'var(--text-3)' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
                <div style={{ fontWeight:700, marginBottom:6, fontSize:16 }}>No report selected</div>
                <div style={{ fontSize:13 }}>
                  Generate a new report above, or go to <button onClick={()=>setView('history')} style={{ color:'var(--primary)', background:'none', border:'none', cursor:'pointer', fontWeight:700, fontSize:13 }}>History</button> to load a past one.
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          HISTORY
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='history' && (
        <Card noPad>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
            <SectionHeader icon="🗂" title="Monthly Report History"
              subtitle="All previously generated procurement snapshots" />
          </div>
          {loadingHist
            ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
            : <div style={{ overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr>
                  <Th>Period</Th><Th>Items</Th><Th>Needs Reorder</Th>
                  <Th>Est. Cost</Th><Th>Generated</Th><Th>Actions</Th>
                </tr></thead>
                <tbody>
                  {history.length===0
                    ? <tr><td colSpan={6} style={{ padding:30, textAlign:'center', color:'var(--text-3)' }}>No reports generated yet.</td></tr>
                    : history.map((r,i)=>(
                      <tr key={r.id} style={{ borderBottom:'1px solid var(--border)', background:i%2?'var(--surface-2)':'transparent' }}>
                        <td style={{ padding:'10px 12px', fontWeight:700 }}>
                          {r.period_label || `${MONTHS[(r.month||1)-1]} ${r.year}`}
                        </td>
                        <Td>{r.total_items||0}</Td>
                        <td style={{ padding:'10px 12px' }}>
                          {(r.items_needing_reorder||0)>0
                            ? <span style={{ color:'#dc2626', fontWeight:700 }}>🔴 {r.items_needing_reorder}</span>
                            : <span style={{ color:'#16a34a', fontWeight:700 }}>✅ 0</span>
                          }
                        </td>
                        <td style={{ padding:'10px 12px', fontWeight:700 }}>
                          {r.snapshot?.total_estimated_cost ? inr(r.snapshot.total_estimated_cost) : '—'}
                        </td>
                        <Td style={{ fontSize:12, color:'var(--text-3)' }}>
                          {r.generated_at ? new Date(r.generated_at).toLocaleDateString('en-IN') : '—'}
                        </Td>
                        <td style={{ padding:'10px 12px' }}>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            <Btn size="sm" variant="ghost" onClick={()=>{ viewReport(r.id); setView('report') }}>View</Btn>
                            <Btn size="sm" variant="secondary"
                              onClick={()=>downloadWithToken(csvUrl(r.id),`procurement_${r.year}_${String(r.month).padStart(2,'0')}.csv`)}>CSV</Btn>
                            <Btn size="sm" variant="secondary"
                              onClick={()=>downloadWithToken(pdfUrl(r.id),`procurement_${r.year}_${String(r.month).padStart(2,'0')}.pdf`)}>PDF</Btn>
                            <Btn size="sm" variant="danger" onClick={()=>setConfirmDelete(r)}>Delete</Btn>
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          }
        </Card>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Monthly Report"
        message={`Delete report for ${confirmDelete?.period_label||''}? This cannot be undone.`}
        onConfirm={doDelete}
        onCancel={()=>setConfirmDelete(null)}
      />
    </div>
  )
}
