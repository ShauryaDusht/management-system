import { useEffect, useMemo, useState, useCallback } from 'react'
import Layout from '../layout/Layout'
import { Button, Input, Select, Spinner, StatusBadge } from '../components/ui'
import api from '../api/client'

// ── API helpers ───────────────────────────────────────────────
const fetchReport = (type, params = {}) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return api.get(`/reports/${type}/${qs ? '?' + qs : ''}`)
}

// ── CSV Export ────────────────────────────────────────────────
function exportCSV(data, filename) {
  if (!data?.length) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(r =>
    Object.values(r).map(v => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(',')
  )
  const csv = [headers, ...rows].join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Mini Bar Chart (SVG) ──────────────────────────────────────
function MiniBarChart({ data, labelKey, valueKey, color = '#4d7c5a', height = 120 }) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-slate-400 text-xs">No data</div>
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  const barW = 100 / data.length
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const bh = Math.max(2, (d[valueKey] / max) * (height - 20))
        return (
          <g key={i}>
            <rect x={i * barW + barW * 0.15} y={height - 20 - bh} width={barW * 0.7} height={bh} rx="1.5" fill={color} opacity={0.8} />
            <text x={i * barW + barW / 2} y={height - 4} textAnchor="middle" fontSize="4.5" fill="#64748b">{d[valueKey]}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Donut Chart ───────────────────────────────────────────────
const DONUT_COLORS = ['#4d7c5a', '#c2622a', '#1e6b7a', '#8b5e3c', '#5b6e8c', '#7a4d6b', '#2d5a46']

function DonutChart({ segments, size = 150 }) {
  const total = segments.reduce((s, g) => s + (g.value || 0), 0)
  if (!total) return <div className="flex items-center justify-center" style={{ width: size, height: size }}><span className="text-xs text-slate-400">No data</span></div>
  const r = 45, cx = 50, cy = 50
  const circ = 2 * Math.PI * r
  let cumPct = 0
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
      {segments.map((seg, i) => {
        if (!seg.value) return null
        const pct = seg.value / total
        const dash = pct * circ
        const offset = -cumPct * circ
        cumPct += pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeWidth={18} strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={offset} />
        )
      })}
      <circle cx={cx} cy={cy} r={32} fill="white" />
    </svg>
  )
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, color = 'blue', sub, icon }) {
  const palettes = {
    blue:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    green:  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
    amber:  { bg: '#fffbeb', border: '#fed7aa', text: '#b45309' },
    red:    { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
    purple: { bg: '#faf5ff', border: '#ddd6fe', text: '#7c3aed' },
    teal:   { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e' },
  }
  const p = palettes[color] || palettes.blue
  return (
    <div style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 14, padding: '14px 18px' }}>
      {icon && <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: p.text, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Date Range Bar ────────────────────────────────────────────
function DateRangeBar({ dateFrom, dateTo, onDateFrom, onDateTo, onApply, loading, onExport, exportLabel = 'Export CSV' }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>FROM</div>
        <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none' }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>TO</div>
        <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none' }} />
      </div>
      <button onClick={onApply} disabled={loading}
        style={{ background: '#2d5a46', color: 'white', border: 'none', borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Loading…' : '↻ Refresh'}
      </button>
      <button onClick={onExport}
        style={{ background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        ⬇ {exportLabel}
      </button>
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────
function StatusPill({ value }) {
  const map = {
    in_stock:     { bg: '#dcfce7', color: '#166534', label: 'In Stock' },
    low_stock:    { bg: '#fef9c3', color: '#854d0e', label: 'Low Stock' },
    out_of_stock: { bg: '#fee2e2', color: '#991b1b', label: 'Out of Stock' },
    pending:      { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
    approved:     { bg: '#dbeafe', color: '#1e40af', label: 'Approved' },
    rejected:     { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
    issued:       { bg: '#dcfce7', color: '#166534', label: 'Issued' },
    returned:     { bg: '#dcfce7', color: '#166534', label: 'Returned' },
    pending_return: { bg: '#fef9c3', color: '#854d0e', label: 'Pending Return' },
    finalized:    { bg: '#dcfce7', color: '#166534', label: 'Finalized' },
    pending_finalization: { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
  }
  const s = map[value] || { bg: '#f1f5f9', color: '#475569', label: value }
  return <span style={{ background: s.bg, color: s.color, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
}

// ── Shared Table ──────────────────────────────────────────────
function DataTable({ columns, rows, emptyMsg = 'No data' }) {
  if (!rows?.length) return (
    <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>{emptyMsg}</div>
  )
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: '10px 14px', textAlign: c.align === 'right' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '11px 14px', textAlign: c.align === 'right' ? 'right' : 'left', color: c.color || '#334155' }}>
                  {c.render ? c.render(row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── INVENTORY REPORT ──────────────────────────────────────────
function InventoryReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchReport('inventory')
      setReport(res.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let items = report?.items || []
    if (statusFilter !== 'all') items = items.filter(i => i.status === statusFilter)
    if (typeFilter !== 'all') items = items.filter(i => i.type === typeFilter)
    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
    return items
  }, [report, statusFilter, typeFilter, search])

  const catSegments = useMemo(() =>
    (report?.category_breakdown || []).map(c => ({ label: c.category, value: c.available_qty })),
    [report]
  )

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner /></div>

  const cols = [
    { key: 'name', label: 'Item Name' },
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{r.type}</span> },
    { key: 'available_quantity', label: 'Available', align: 'right', render: r => `${r.available_quantity} ${r.unit}` },
    { key: 'total_quantity', label: 'Total', align: 'right', render: r => `${r.total_quantity} ${r.unit}` },
    { key: 'threshold_quantity', label: 'Threshold', align: 'right' },
    { key: 'unit_cost', label: 'Unit Cost', align: 'right', render: r => r.unit_cost ? `₹${r.unit_cost.toFixed(2)}` : '—' },
    { key: 'total_value', label: 'Value', align: 'right', render: r => <strong>₹{r.total_value.toFixed(2)}</strong> },
    { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
  ]

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon="🗂️" label="Total Items" value={report?.total_items} color="blue" />
        <StatCard icon="💰" label="Total Value" value={`₹${(report?.total_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="green" />
        <StatCard icon="✅" label="In Stock" value={report?.in_stock_count} color="green" />
        <StatCard icon="⚠️" label="Low Stock" value={report?.low_stock_count} color="amber" />
        <StatCard icon="❌" label="Out of Stock" value={report?.out_of_stock_count} color="red" />
        <StatCard icon="🔧" label="Assets" value={report?.asset_count} color="purple" />
      </div>

      {/* Charts + Category breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Category donut */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>📊 Stock by Category</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <DonutChart segments={catSegments} size={130} />
            <div style={{ flex: 1, minWidth: 120 }}>
              {(report?.category_breakdown || []).map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#475569' }}>{c.category}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{c.item_count} items</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category value breakdown */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>💰 Value by Category</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(report?.category_breakdown || []).map((c, i) => {
              const pct = report?.total_value > 0 ? (c.total_value / report.total_value) * 100 : 0
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#475569' }}>{c.category}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>₹{c.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: DONUT_COLORS[i % DONUT_COLORS.length], borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filters + Table */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…"
            style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', minWidth: 160 }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: 'white', outline: 'none' }}>
            <option value="all">All Statuses</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: 'white', outline: 'none' }}>
            <option value="all">All Types</option>
            <option value="asset">Assets</option>
            <option value="consumable">Consumables</option>
          </select>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} items</span>
          <button onClick={() => exportCSV(filtered, 'inventory_report.csv')}
            style={{ background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ⬇ Export CSV
          </button>
        </div>
        <DataTable columns={cols} rows={filtered} emptyMsg="No items match your filters." />
      </div>
    </div>
  )
}

// ── REQUESTS REPORT ───────────────────────────────────────────
function RequestsReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchReport('requests', { date_from: dateFrom, date_to: dateTo })
      setReport(res.data)
    } finally { setLoading(false) }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let reqs = report?.requests || []
    if (statusFilter !== 'all') reqs = reqs.filter(r => r.status === statusFilter)
    return reqs
  }, [report, statusFilter])

  const statusBars = [
    { label: 'Pending', value: report?.pending || 0, color: '#f59e0b' },
    { label: 'Approved', value: report?.approved || 0, color: '#3b82f6' },
    { label: 'Issued', value: report?.issued || 0, color: '#22c55e' },
    { label: 'Rejected', value: report?.rejected || 0, color: '#ef4444' },
  ]

  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: '#94a3b8', fontSize: 12 }}>#{r.id}</span> },
    { key: 'requester', label: 'Requester' },
    { key: 'item', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty', align: 'right', render: r => `${r.quantity} ${r.unit}` },
    { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
    { key: 'is_urgent', label: 'Urgent', render: r => r.is_urgent ? <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 Yes</span> : <span style={{ color: '#94a3b8' }}>No</span> },
    { key: 'created_at', label: 'Date', render: r => new Date(r.created_at).toLocaleDateString('en-IN') },
    { key: 'reviewed_by', label: 'Reviewed By', render: r => r.reviewed_by || '—' },
  ]

  return (
    <div>
      <DateRangeBar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo}
        onApply={load} loading={loading}
        onExport={() => exportCSV(filtered, 'requests_report.csv')}
      />

      {loading && !report ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon="📋" label="Total Requests" value={report?.total} color="blue" />
            <StatCard icon="⏳" label="Pending" value={report?.pending} color="amber" />
            <StatCard icon="✅" label="Approved" value={report?.approved} color="green" />
            <StatCard icon="📦" label="Issued" value={report?.issued} color="teal" />
            <StatCard icon="❌" label="Rejected" value={report?.rejected} color="red" />
            <StatCard icon="🔴" label="Urgent" value={report?.urgent} color="red" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Status bar chart */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>📊 Requests by Status</h3>
              <MiniBarChart data={statusBars} labelKey="label" valueKey="value" height={100} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {statusBars.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top requesters + items */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 10px' }}>🏆 Top Requesters</h3>
              {(report?.top_requesters || []).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 12, color: '#475569' }}>
                    <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, marginRight: 6 }}>#{i + 1}</span>
                    {r.name}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4d7c5a' }}>{r.count} requests</span>
                </div>
              ))}
              {!report?.top_requesters?.length && <p style={{ fontSize: 12, color: '#94a3b8' }}>No data</p>}
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '14px 0 10px' }}>📦 Most Requested Items</h3>
              {(report?.top_items || []).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ fontSize: 12, color: '#475569' }}>{r.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#c2622a' }}>{r.count}×</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: 'white', outline: 'none' }}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="issued">Issued</option>
                <option value="rejected">Rejected</option>
              </select>
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} rows</span>
            </div>
            <DataTable columns={cols} rows={filtered} />
          </div>
        </>
      )}
    </div>
  )
}

// ── ISSUES REPORT ─────────────────────────────────────────────
function IssuesReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchReport('issues', { date_from: dateFrom, date_to: dateTo })
      setReport(res.data)
    } finally { setLoading(false) }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let issues = report?.issues || []
    if (typeFilter !== 'all') issues = issues.filter(i => i.item_type === typeFilter)
    return issues
  }, [report, typeFilter])

  const cols = [
    { key: 'id', label: '#', render: r => <span style={{ color: '#94a3b8', fontSize: 12 }}>#{r.id}</span> },
    { key: 'item', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'item_type', label: 'Type', render: r => <span style={{ textTransform: 'capitalize', fontSize: 12 }}>{r.item_type === 'asset' ? '🔧 Asset' : '🧴 Consumable'}</span> },
    { key: 'issued_to', label: 'Issued To' },
    { key: 'issued_quantity', label: 'Issued Qty', align: 'right', render: r => `${r.issued_quantity} ${r.unit}` },
    { key: 'issued_value', label: 'Value', align: 'right', render: r => `₹${r.issued_value.toFixed(2)}` },
    { key: 'issued_at', label: 'Date', render: r => new Date(r.issued_at).toLocaleDateString('en-IN') },
    {
      key: 'status', label: 'Status',
      render: r => r.item_type === 'asset'
        ? <StatusPill value={r.return_status} />
        : <StatusPill value={r.usage_status} />,
    },
    {
      key: 'detail', label: 'Detail',
      render: r => {
        if (r.item_type === 'asset' && r.returned_at) return <span style={{ fontSize: 11, color: '#64748b' }}>Returned {new Date(r.returned_at).toLocaleDateString('en-IN')} · {r.returned_quantity} {r.unit}</span>
        if (r.item_type === 'consumable' && r.usage_finalized) return <span style={{ fontSize: 11, color: '#64748b' }}>Used {r.actual_quantity_used} {r.unit}</span>
        return '—'
      },
    },
  ]

  return (
    <div>
      <DateRangeBar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo}
        onApply={load} loading={loading}
        onExport={() => exportCSV(filtered, 'issues_report.csv')}
      />

      {loading && !report ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon="📤" label="Total Issues" value={report?.total_issues} color="blue" />
            <StatCard icon="💰" label="Total Value Issued" value={`₹${(report?.total_value_issued || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="green" />
            <StatCard icon="🔧" label="Asset Issues" value={report?.asset_issues} color="purple" />
            <StatCard icon="🧴" label="Consumable Issues" value={report?.consumable_issues} color="teal" />
            <StatCard icon="⏳" label="Assets Pending Return" value={report?.assets_pending_return} color="amber" />
            <StatCard icon="⏳" label="Consumables Pending" value={report?.consumables_pending_finalization} color="amber" />
          </div>

          {/* Top issued items */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px', marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>🏆 Most Issued Items</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(report?.top_issued_items || []).map((item, i) => {
                const maxVal = Math.max(...(report?.top_issued_items || []).map(x => x.total_issued), 1)
                const pct = (item.total_issued / maxVal) * 100
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#475569', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.item}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{item.total_issued} units · {item.count} issues</span>
                      </div>
                      <div style={{ background: '#f1f5f9', borderRadius: 4, height: 5 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#4d7c5a', borderRadius: 4 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#4d7c5a', flexShrink: 0 }}>₹{item.total_value.toFixed(0)}</span>
                  </div>
                )
              })}
              {!report?.top_issued_items?.length && <p style={{ fontSize: 13, color: '#94a3b8' }}>No issues recorded yet.</p>}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: 'white', outline: 'none' }}>
                <option value="all">All Types</option>
                <option value="asset">Assets Only</option>
                <option value="consumable">Consumables Only</option>
              </select>
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} rows</span>
            </div>
            <DataTable columns={cols} rows={filtered} />
          </div>
        </>
      )}
    </div>
  )
}

// ── STOCK MOVEMENT REPORT ─────────────────────────────────────
function StockMovementReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchReport('stock-movement', { date_from: dateFrom, date_to: dateTo })
      setReport(res.data)
    } finally { setLoading(false) }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let entries = report?.entries || []
    if (search) entries = entries.filter(e => e.item.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()))
    return entries
  }, [report, search])

  const cols = [
    { key: 'id', label: '#', render: r => <span style={{ color: '#94a3b8', fontSize: 12 }}>#{r.id}</span> },
    { key: 'item', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'quantity_added', label: 'Qty Added', align: 'right', render: r => <span style={{ color: '#22c55e', fontWeight: 700 }}>+{r.quantity_added} {r.unit}</span> },
    { key: 'unit_cost', label: 'Unit Cost', align: 'right', render: r => r.unit_cost ? `₹${r.unit_cost.toFixed(2)}` : '—' },
    { key: 'total_cost', label: 'Total Cost', align: 'right', render: r => <strong>₹{r.total_cost.toFixed(2)}</strong> },
    { key: 'added_by', label: 'Added By' },
    { key: 'added_at', label: 'Date', render: r => new Date(r.added_at).toLocaleDateString('en-IN') },
    { key: 'notes', label: 'Notes', render: r => <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.notes || '—'}</span> },
  ]

  return (
    <div>
      <DateRangeBar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo}
        onApply={load} loading={loading}
        onExport={() => exportCSV(filtered, 'stock_movement_report.csv')}
      />

      {loading && !report ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon="📦" label="Total Entries" value={report?.total_entries} color="blue" />
            <StatCard icon="📈" label="Total Qty Added" value={report?.total_quantity_added?.toLocaleString()} color="green" sub="across all items" />
            <StatCard icon="💰" label="Total Cost" value={`₹${(report?.total_cost || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="amber" />
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search item or category…"
                style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', minWidth: 160 }} />
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} entries</span>
            </div>
            <DataTable columns={cols} rows={filtered} />
          </div>
        </>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
const TABS = [
  { key: 'inventory',      label: '📦 Inventory',      desc: 'Stock levels, values & categories' },
  { key: 'requests',       label: '📋 Requests',        desc: 'Request history & analytics' },
  { key: 'issues',         label: '📤 Issued Items',    desc: 'Issuance tracking & returns' },
  { key: 'stock-movement', label: '📈 Stock Movement',  desc: 'Replenishment log' },
]

export default function Reports() {
  const [activeTab, setActiveTab] = useState('inventory')

  return (
    <Layout>
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a3a2e 0%, #2d5a46 40%, #4d7c5a 100%)',
            borderRadius: 16, padding: '20px 28px', margin: '16px 0 0', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 120, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 22 }}>📊</span>
                <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>Reports & Analytics</h1>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>
                Inventory snapshots · Request analytics · Issue tracking · Stock movement logs
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '14px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', background: 'none', whiteSpace: 'nowrap',
                  borderBottom: activeTab === tab.key ? '2.5px solid #4d7c5a' : '2.5px solid transparent',
                  color: activeTab === tab.key ? '#2d5a46' : '#64748b',
                  transition: 'all 0.15s',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
          {/* Tab description */}
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            {TABS.find(t => t.key === activeTab)?.desc}
          </p>

          {activeTab === 'inventory' && <InventoryReport />}
          {activeTab === 'requests' && <RequestsReport />}
          {activeTab === 'issues' && <IssuesReport />}
          {activeTab === 'stock-movement' && <StockMovementReport />}
        </div>
      </div>
    </Layout>
  )
}
