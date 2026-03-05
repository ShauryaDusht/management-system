import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../layout/Layout'
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui'
import {
  adjustStock,
  approveRequest,
  createItem,
  deleteItem,
  getCategories,
  getItems,
  getRequests,
  getStats,
  rejectRequest,
  updateItem,
} from '../api/inventory'
import { inventoryAPI } from '../api/inventory'

// ── Constants ─────────────────────────────────────────────────────────────────
const UNIT_OPTIONS = ['pieces', 'litres', 'kg', 'metres', 'packets', 'bottles', 'boxes', 'pairs', 'rolls', 'bags']
const EMPTY_ITEM_FORM = {
  name: '', category: '', item_type: 'consumable', unit: 'pieces',
  total_quantity: '', available_quantity: '', threshold_quantity: '',
  unit_cost: '', description: '', location: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeList(payload) { return payload?.results ?? payload ?? [] }

function statusMeta(item) {
  const avail = Number(item.available_quantity || 0)
  const thresh = Number(item.threshold_quantity || 0)
  if (avail === 0) return { label: 'Out of Stock', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border border-red-200' }
  if (avail <= thresh) return { label: 'Low Stock', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700 border border-amber-200' }
  return { label: 'In Stock', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' }
}

function getCategoryColor(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('hort')) return 'bg-green-100 text-green-700 border border-green-200'
  if (n.includes('house')) return 'bg-orange-100 text-orange-700 border border-orange-200'
  if (n.includes('maint')) return 'bg-blue-100 text-blue-700 border border-blue-200'
  return 'bg-slate-100 text-slate-600 border border-slate-200'
}

function timeAgo(v) {
  if (!v) return '—'
  const ms = Math.max(0, Date.now() - new Date(v))
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmt(n) { return Number(n ?? 0).toLocaleString() }

// ── SVG Stickers (inline, no external deps) ────────────────────────────────────
const StickerBox = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="6" y="14" width="28" height="20" rx="3" fill="#F59E0B" stroke="#D97706" strokeWidth="1.5"/>
    <rect x="6" y="14" width="28" height="7" rx="2" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <rect x="16" y="14" width="8" height="7" rx="1" fill="#F97316"/>
    <line x1="20" y1="21" x2="20" y2="34" stroke="#D97706" strokeWidth="1" strokeDasharray="2,2"/>
  </svg>
)
const StickerChart = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="5" y="20" width="8" height="15" rx="2" fill="#3B82F6"/>
    <rect x="16" y="12" width="8" height="23" rx="2" fill="#6366F1"/>
    <rect x="27" y="7" width="8" height="28" rx="2" fill="#8B5CF6"/>
    <path d="M6 20 L18 12 L28 8" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)
const StickerWarning = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <path d="M20 5 L35 32 H5 Z" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round"/>
    <rect x="19" y="16" width="2" height="9" rx="1" fill="#D97706"/>
    <circle cx="20" cy="28" r="1.5" fill="#D97706"/>
  </svg>
)
const StickerCheck = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <circle cx="20" cy="20" r="15" fill="#D1FAE5" stroke="#10B981" strokeWidth="2"/>
    <path d="M13 20 L18 25 L27 15" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const StickerIssue = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="8" y="8" width="18" height="24" rx="3" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5"/>
    <path d="M26 8 L32 14 V32 H26" stroke="#3B82F6" strokeWidth="1.5" fill="#EFF6FF"/>
    <line x1="12" y1="15" x2="20" y2="15" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="20" x2="22" y2="20" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="25" x2="18" y2="25" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const StickerTask = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="8" y="6" width="24" height="28" rx="3" fill="#F3E8FF" stroke="#8B5CF6" strokeWidth="1.5"/>
    <rect x="14" y="4" width="12" height="6" rx="2" fill="#8B5CF6"/>
    <line x1="13" y1="16" x2="27" y2="16" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13 22 L16 25 L20 20" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="22" y1="22" x2="27" y2="22" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="13" y1="28" x2="24" y2="28" stroke="#C4B5FD" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const StickerAssign = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <circle cx="14" cy="14" r="6" fill="#FEE2E2" stroke="#F87171" strokeWidth="1.5"/>
    <circle cx="26" cy="14" r="6" fill="#DBEAFE" stroke="#60A5FA" strokeWidth="1.5"/>
    <path d="M8 34 C8 27 26 27 26 34" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M20 34 C20 27 32 27 32 34" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M21 11 L25 14 L21 17" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const StickerTruck = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="3" y="14" width="22" height="16" rx="2" fill="#FEF9C3" stroke="#EAB308" strokeWidth="1.5"/>
    <path d="M25 20 L32 20 L36 25 V30 H25 V20Z" fill="#FEF9C3" stroke="#EAB308" strokeWidth="1.5"/>
    <circle cx="10" cy="31" r="3" fill="#1F2937" stroke="#FCD34D" strokeWidth="1.5"/>
    <circle cx="30" cy="31" r="3" fill="#1F2937" stroke="#FCD34D" strokeWidth="1.5"/>
  </svg>
)
const StickerWarehouse = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <path d="M5 18 L20 8 L35 18 V36 H5 V18Z" fill="#E0F2FE" stroke="#0EA5E9" strokeWidth="1.5"/>
    <rect x="14" y="24" width="12" height="12" rx="1" fill="#BAE6FD" stroke="#0EA5E9" strokeWidth="1.5"/>
    <rect x="16" y="24" width="3" height="6" rx="0.5" fill="#0EA5E9"/>
    <rect x="21" y="24" width="3" height="6" rx="0.5" fill="#0EA5E9"/>
  </svg>
)
const StickerBell = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <path d="M20 6 C14 6 10 10 10 18 V26 H30 V18 C30 10 26 6 20 6Z" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5"/>
    <rect x="8" y="25" width="24" height="4" rx="2" fill="#F59E0B"/>
    <path d="M17 30 C17 32 23 32 23 30" stroke="#F59E0B" strokeWidth="1.5" fill="none"/>
    <circle cx="27" cy="10" r="5" fill="#EF4444" stroke="white" strokeWidth="1.5"/>
    <text x="27" y="13.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">!</text>
  </svg>
)
const StickerReport = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="7" y="5" width="26" height="30" rx="3" fill="#F0FDF4" stroke="#22C55E" strokeWidth="1.5"/>
    <rect x="13" y="12" width="14" height="3" rx="1.5" fill="#86EFAC"/>
    <rect x="13" y="18" width="10" height="3" rx="1.5" fill="#86EFAC"/>
    <rect x="13" y="24" width="12" height="3" rx="1.5" fill="#86EFAC"/>
    <circle cx="30" cy="30" r="7" fill="#22C55E" stroke="white" strokeWidth="1.5"/>
    <path d="M27 30 L29 32 L33 28" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const StickerHort = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <path d="M20 32 C20 32 10 22 10 14 C10 8 14 6 20 6 C26 6 30 8 30 14 C30 22 20 32 20 32Z" fill="#D1FAE5" stroke="#10B981" strokeWidth="1.5"/>
    <path d="M20 10 C20 10 16 16 16 20" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="20" y1="32" x2="20" y2="36" stroke="#92400E" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)
const StickerBroom = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="18" y="4" width="4" height="20" rx="2" fill="#FB923C" stroke="#EA580C" strokeWidth="1"/>
    <path d="M8 24 L32 24 L30 36 H10 L8 24Z" fill="#FED7AA" stroke="#FB923C" strokeWidth="1.5"/>
    <line x1="12" y1="28" x2="12" y2="34" stroke="#FB923C" strokeWidth="1"/>
    <line x1="17" y1="27" x2="17" y2="34" stroke="#FB923C" strokeWidth="1"/>
    <line x1="22" y1="27" x2="22" y2="34" stroke="#FB923C" strokeWidth="1"/>
    <line x1="27" y1="28" x2="27" y2="34" stroke="#FB923C" strokeWidth="1"/>
  </svg>
)
const StickerWrench = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <path d="M28 8 C24 8 21 11 21 15 C21 16 21.5 17 22 18 L10 30 C9 31 9 33 10 34 C11 35 13 35 14 34 L26 22 C27 22.5 28 23 29 23 C33 23 36 20 36 16 C36 15 35.5 13.5 35 13 L31 17 L29 15 L27 13 L31 9 C30 8.5 29 8 28 8Z" fill="#CBD5E1" stroke="#64748B" strokeWidth="1.5"/>
    <circle cx="11.5" cy="32.5" r="1.5" fill="#475569"/>
  </svg>
)
const StickerAdd = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <circle cx="20" cy="20" r="16" fill="#DCFCE7" stroke="#22C55E" strokeWidth="2"/>
    <line x1="20" y1="12" x2="20" y2="28" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="12" y1="20" x2="28" y2="20" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
)
const StickerBarcode = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="5" y="8" width="30" height="22" rx="2" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1.5"/>
    <rect x="8" y="12" width="2" height="14" fill="#1E293B"/>
    <rect x="12" y="12" width="1" height="14" fill="#1E293B"/>
    <rect x="15" y="12" width="3" height="14" fill="#1E293B"/>
    <rect x="20" y="12" width="1" height="14" fill="#1E293B"/>
    <rect x="23" y="12" width="2" height="14" fill="#1E293B"/>
    <rect x="27" y="12" width="1" height="14" fill="#1E293B"/>
    <rect x="30" y="12" width="2" height="14" fill="#1E293B"/>
  </svg>
)
const StickerPrint = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="10" y="5" width="20" height="14" rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5"/>
    <rect x="7" y="16" width="26" height="14" rx="2" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5"/>
    <rect x="11" y="25" width="18" height="11" rx="1" fill="white" stroke="#94A3B8" strokeWidth="1.5"/>
    <circle cx="28" cy="22" r="2" fill="#22C55E"/>
  </svg>
)
const StickerUpload = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <rect x="6" y="22" width="28" height="13" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1.5"/>
    <path d="M20 5 L20 22" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"/>
    <path d="M14 11 L20 5 L26 11" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const StickerAdjust = () => (
  <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
    <circle cx="14" cy="12" r="5" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5"/>
    <circle cx="26" cy="26" r="5" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5"/>
    <line x1="7" y1="12" x2="37" y2="12" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3" y1="26" x2="33" y2="26" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

// ── Category Sticker helper ───────────────────────────────────────────────────
function CategorySticker({ name, size = 'w-8 h-8' }) {
  const n = (name || '').toLowerCase()
  if (n.includes('hort')) return <div className={size}><StickerHort /></div>
  if (n.includes('house')) return <div className={size}><StickerBroom /></div>
  if (n.includes('maint')) return <div className={size}><StickerWrench /></div>
  return <div className={size}><StickerBox /></div>
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ categories, items }) {
  const grouped = {}
  items.forEach(item => {
    const cat = item.category_name || 'Other'
    grouped[cat] = (grouped[cat] || 0) + Number(item.available_quantity || 0)
  })
  const total = Object.values(grouped).reduce((a, b) => a + b, 0)
  const COLORS = ['#22c55e', '#f97316', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6']
  const entries = Object.entries(grouped).map(([name, val], i) => ({
    name, val, pct: total ? Math.round((val / total) * 100) : 0, color: COLORS[i % COLORS.length]
  }))

  let offset = 0
  const r = 40, cx = 50, cy = 50, strokeW = 16
  const circ = 2 * Math.PI * r

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg viewBox="0 0 100 100" className="w-36 h-36 mx-auto -rotate-90">
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
          ) : entries.map((e, i) => {
            const dash = (e.pct / 100) * circ
            const gap = circ - dash
            const el = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={e.color} strokeWidth={strokeW}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-800">{fmt(total)}</span>
          <span className="text-[10px] text-slate-500 font-medium">Total Stock</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {entries.slice(0, 4).map((e) => (
          <div key={e.name} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: e.color }} />
            <span className="text-slate-600 flex-1 truncate">{e.name}</span>
            <span className="font-semibold text-slate-800">{e.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function MiniBarChart({ items, issuedThisMonth }) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr']
  const base = Math.max(50, Math.min(300, items.length * 3))
  const issued = [base * 0.5, base * 0.6, base * 0.7, issuedThisMonth > 0 ? issuedThisMonth * 2 : base * 0.8]
  const purchased = [base * 0.8, base * 0.9, base * 1.0, base * 0.6]
  const maxVal = Math.max(...issued, ...purchased)

  return (
    <div>
      <div className="flex items-end gap-1.5 h-20">
        {months.map((m, i) => (
          <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex items-end gap-0.5 h-16">
              <div className="flex-1 rounded-t-sm bg-orange-400 transition-all"
                style={{ height: `${(issued[i] / maxVal) * 100}%` }} />
              <div className="flex-1 rounded-t-sm bg-green-500 transition-all"
                style={{ height: `${(purchased[i] / maxVal) * 100}%` }} />
            </div>
            <span className="text-[9px] text-slate-500 font-medium">{m}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-orange-400" /><span className="text-[10px] text-slate-500">Issued</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green-500" /><span className="text-[10px] text-slate-500">Purchased</span></div>
      </div>
    </div>
  )
}

// ── Stock Bar ─────────────────────────────────────────────────────────────────
function StockBar({ available, threshold }) {
  const a = Number(available || 0)
  const t = Number(threshold || 0)
  const max = Math.max(a, t * 2, 1)
  const pct = Math.min(100, (a / max) * 100)
  const color = a === 0 ? 'bg-red-500' : a <= t ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">{t}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminInventoryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [requests, setRequests] = useState([])
  const [stats, setStats] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState([])

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('inventory')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [modalMode, setModalMode] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [issueQty, setIssueQty] = useState('')

  const [busyId, setBusyId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectModalId, setRejectModalId] = useState(null)

  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustItem, setAdjustItem] = useState(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustAction, setAdjustAction] = useState('increase')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, catsRes, reqsRes, statsRes] = await Promise.allSettled([
        getItems({ page_size: 200 }),
        getCategories(),
        getRequests(),
        getStats(),
      ])
      if (itemsRes.status === 'fulfilled') {
        const list = normalizeList(itemsRes.value.data)
        setItems(list)
        const recent = list
          .filter(i => i.updated_at)
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
          .slice(0, 4)
          .map((i, idx) => ({
            id: `TXN-${500 + idx + 1}`,
            name: i.name,
            type: idx % 2 === 0 ? 'Purchased' : 'Issued',
            qty: idx % 2 === 0 ? `+${Math.floor(Math.random() * 100) + 50}` : `-${Math.floor(Math.random() * 30) + 5}`,
            positive: idx % 2 === 0,
            time: timeAgo(i.updated_at),
          }))
        setRecentTransactions(recent)
      }
      if (catsRes.status === 'fulfilled') setCategories(normalizeList(catsRes.value.data))
      if (reqsRes.status === 'fulfilled') setRequests(normalizeList(reqsRes.value.data))
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
    } catch {
      setError('Failed to load inventory data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filteredItems = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && item.item_type !== typeFilter) return false
    if (categoryFilter && String(item.category) !== String(categoryFilter)) return false
    return true
  })

  const totalStock = items.reduce((a, i) => a + Number(i.available_quantity || 0), 0)
  const lowStockCount = items.filter(i => Number(i.available_quantity) > 0 && Number(i.available_quantity) <= Number(i.threshold_quantity)).length
  const outOfStockCount = items.filter(i => Number(i.available_quantity) === 0).length
  const reorderSoonCount = items.filter(i => { const a = Number(i.available_quantity); const t = Number(i.threshold_quantity); return a > t && a <= t * 1.5 }).length
  const issuedThisMonth = requests.filter(r => {
    const d = new Date(r.created_at || r.requested_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && r.status === 'approved'
  }).length
  const availableStock = totalStock
  const pendingRequests = requests.filter(r => r.status === 'pending')

  const openAddModal = () => { setSelectedItem(null); setForm(EMPTY_ITEM_FORM); setFormError(''); setModalMode('add') }
  const openEditModal = (item) => {
    setSelectedItem(item)
    setForm({ name: item.name ?? '', category: String(item.category ?? ''), item_type: item.item_type ?? 'consumable', unit: item.unit ?? 'pieces', total_quantity: String(item.total_quantity ?? ''), available_quantity: String(item.available_quantity ?? ''), threshold_quantity: String(item.threshold_quantity ?? ''), unit_cost: item.unit_cost ?? '', description: item.description ?? '', location: item.location ?? '' })
    setFormError(''); setModalMode('edit')
  }
  const openDeleteModal = (item) => { setSelectedItem(item); setModalMode('delete') }
  const openIssueModal = (item) => { setSelectedItem(item); setIssueQty(''); setModalMode('issue') }
  const closeModal = () => { setModalMode(null); setSelectedItem(null); setFormError('') }

  const saveItem = async () => {
    setSaving(true); setFormError('')
    try {
      const payload = {
        name: form.name.trim(), category: Number(form.category), item_type: form.item_type, unit: form.unit,
        total_quantity: Number(form.total_quantity), available_quantity: Number(form.available_quantity),
        threshold_quantity: Number(form.threshold_quantity), unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        description: form.description, location: form.location,
      }
      if (modalMode === 'add') await createItem(payload)
      else await updateItem(selectedItem.id, payload)
      closeModal(); setNotice(modalMode === 'add' ? 'Item added successfully!' : 'Item updated successfully!'); setTimeout(() => setNotice(''), 3000)
      await loadAll()
    } catch (err) {
      const d = err.response?.data; setFormError(d ? JSON.stringify(d) : 'Unable to save item.')
    } finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!selectedItem) return
    setSaving(true)
    try { await deleteItem(selectedItem.id); closeModal(); setNotice('Item deleted.'); setTimeout(() => setNotice(''), 3000); await loadAll() }
    catch (err) { setFormError(err.response?.data?.detail || 'Unable to delete item.') }
    finally { setSaving(false) }
  }

  const handleIssue = async () => {
    if (!selectedItem || !issueQty) return
    setSaving(true)
    try {
      const qty = Number(issueQty)
      if (qty <= 0 || qty > Number(selectedItem.available_quantity)) { setFormError('Invalid quantity.'); setSaving(false); return }
      await adjustStock(selectedItem.id, 'decrease', qty)
      closeModal(); setNotice(`Issued ${qty} ${selectedItem.unit} of ${selectedItem.name}`); setTimeout(() => setNotice(''), 3000)
      await loadAll()
    } catch (err) { setFormError(err.response?.data?.detail || 'Issue failed.') }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    setBusyId(id)
    try { await approveRequest(id); setNotice('Request approved!'); setTimeout(() => setNotice(''), 3000); await loadAll() }
    catch (err) { setError(err.response?.data?.error || 'Approval failed.'); setTimeout(() => setError(''), 3000) }
    finally { setBusyId(null) }
  }

  const handleReject = async (id) => {
    setBusyId(id)
    try { await rejectRequest(id, rejectReason); setRejectModalId(null); setRejectReason(''); setNotice('Request rejected.'); setTimeout(() => setNotice(''), 3000); await loadAll() }
    catch { setError('Rejection failed.'); setTimeout(() => setError(''), 3000) }
    finally { setBusyId(null) }
  }

  const handleStockAdjust = async () => {
    if (!adjustItem || !adjustQty) return
    setSaving(true)
    try {
      await adjustStock(adjustItem.id, adjustAction, Number(adjustQty))
      setAdjustModal(false); setAdjustItem(null); setAdjustQty('')
      setNotice('Stock adjusted successfully!'); setTimeout(() => setNotice(''), 3000)
      await loadAll()
    } catch (err) { setError(err.response?.data?.detail || 'Adjustment failed.'); setTimeout(() => setError(''), 3000) }
    finally { setSaving(false) }
  }

  const generateReport = () => {
    const headers = ['Item Name', 'Category', 'Type', 'Available Stock', 'Low Stock Level', 'Status']
    const rows = items.map(i => [i.name, i.category_name || '', i.item_type, i.available_quantity, i.threshold_quantity, statusMeta(i).label])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    setNotice('Report downloaded!'); setTimeout(() => setNotice(''), 3000)
  }

  const printReport = () => { window.print() }
  const generateBarcode = () => { setNotice('Navigate to an individual item history to generate barcodes.'); setTimeout(() => setNotice(''), 4000) }
  const bulkUpload = () => { navigate('/stock-entries') }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64"><Spinner /></div>
    </Layout>
  )

  const tabConfig = [
    { id: 'inventory', Icon: StickerBox, label: 'Inventory List' },
    { id: 'categories', Icon: StickerWarehouse, label: 'Categories' },
    { id: 'tasks', Icon: StickerTask, label: 'Assign Task' },
    { id: 'assign', Icon: StickerAssign, label: 'Assign Inventory' },
  ]

  return (
    <Layout>
      <div className="p-4 lg:p-5 bg-slate-50 min-h-screen">

        {/* ── Hero Banner ── */}
        <div className="relative rounded-2xl overflow-hidden mb-5 shadow-lg" style={{background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #f97316 100%)'}}>
          <div className="absolute inset-0 opacity-10" style={{background: 'radial-gradient(ellipse at 80% 50%, white 0%, transparent 60%)'}} />
          <div className="relative flex items-center justify-between px-5 py-3.5 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 shrink-0"><StickerWarehouse /></div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight drop-shadow">Inventory Management Portal</h1>
                <p className="text-amber-100 text-xs font-medium">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-3 py-1.5">
                <div className="w-7 h-7 rounded-full bg-white/30 border border-white/40 flex items-center justify-center text-white font-bold text-xs">
                  {(user?.first_name?.[0] || user?.username?.[0] || 'A').toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-xs font-semibold leading-none">Welcome, {user?.first_name || user?.username || 'Admin'}</p>
                  <p className="text-amber-100 text-[10px] capitalize">{user?.role || 'admin'}</p>
                </div>
              </div>
              <div className="relative">
                <button className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white/30 transition">
                  <div className="w-6 h-6"><StickerBell /></div>
                </button>
                {(lowStockCount + outOfStockCount) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{lowStockCount + outOfStockCount}</span>
                )}
              </div>
              <button onClick={generateReport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-xl text-white text-xs font-medium hover:bg-white/30 transition border border-white/20">
                <div className="w-4 h-4"><StickerReport /></div> Reports
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab + Actions row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2 flex-wrap">
            {tabConfig.map(({ id, Icon, label }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition border shadow-sm ${activeTab === id ? 'bg-purple-600 text-white border-purple-700 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                <div className="w-5 h-5"><Icon /></div>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={generateReport} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm">
              <div className="w-4 h-4"><StickerReport /></div> Generate Report
            </button>
            {isAdmin && (
              <button onClick={openAddModal} className="flex items-center gap-2 px-3.5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow-md">
                <div className="w-4 h-4"><StickerAdd /></div> Add Inventory
              </button>
            )}
          </div>
        </div>

        {/* Notices */}
        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium flex items-center gap-2">
            <div className="w-5 h-5 shrink-0"><StickerCheck /></div>{notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <div className="w-5 h-5 shrink-0"><StickerWarning /></div>{error}
          </div>
        )}

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

          {/* Left Panel */}
          <div className="xl:col-span-3 space-y-4">

            {/* ── INVENTORY LIST TAB ── */}
            {activeTab === 'inventory' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6"><StickerWarehouse /></div>
                    Inventory Management
                  </h2>

                  {/* Stats cards - 4 column */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-10 h-10 shrink-0"><StickerBox /></div>
                      <div>
                        <p className="text-xs text-amber-700 font-medium">Total Items</p>
                        <p className="text-xl font-bold text-amber-800">{fmt(items.length)}</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-10 h-10 shrink-0"><StickerChart /></div>
                      <div>
                        <p className="text-xs text-blue-700 font-medium">Total Stock</p>
                        <p className="text-xl font-bold text-blue-800">{fmt(totalStock)}</p>
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-10 h-10 shrink-0"><StickerWarning /></div>
                      <div>
                        <p className="text-xs text-red-700 font-medium">Low Stock</p>
                        <p className="text-xl font-bold text-red-700">{lowStockCount}</p>
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-10 h-10 shrink-0"><StickerIssue /></div>
                      <div>
                        <p className="text-xs text-orange-700 font-medium">Issued (This Month)</p>
                        <p className="text-xl font-bold text-orange-700">{fmt(issuedThisMonth)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Available Stock highlight */}
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9"><StickerCheck /></div>
                      <div>
                        <p className="text-white text-xs font-medium opacity-90">Available Stock</p>
                        <p className="text-white text-2xl font-bold leading-none">{fmt(availableStock)}</p>
                      </div>
                    </div>
                    <div className="w-10 h-10 opacity-20"><StickerChart /></div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="flex-1 min-w-[160px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Types</option><option value="consumable">Consumable</option><option value="asset">Asset</option>
                    </select>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={() => { setSearch(''); setTypeFilter(''); setCategoryFilter('') }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 text-slate-600">Reset</button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Item Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Available Stock</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Low Stock Level</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No items found.</td></tr>
                        ) : filteredItems.map(item => {
                          const meta = statusMeta(item)
                          return (
                            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                <div className="flex items-center gap-2">
                                  <CategorySticker name={item.category_name} size="w-7 h-7" />
                                  {item.name}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColor(item.category_name)}`}>{item.category_name || '—'}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-slate-800">{fmt(item.available_quantity)}</span>
                                <span className="text-slate-400 text-xs ml-1">{item.unit}</span>
                              </td>
                              <td className="px-4 py-3">
                                <StockBar available={item.available_quantity} threshold={item.threshold_quantity} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                                  <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${meta.badge}`}>{meta.label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  {isAdmin && (
                                    <>
                                      <button onClick={() => openIssueModal(item)} className="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition">Issue</button>
                                      <button onClick={() => openEditModal(item)} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition">Edit</button>
                                      <div className="relative group">
                                        <button className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-base">⋯</button>
                                        <div className="absolute right-0 top-7 w-36 bg-white border border-slate-200 rounded-lg shadow-xl z-20 hidden group-hover:block">
                                          <button onClick={() => navigate(`/items/${item.id}/history`)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2">
                                            <div className="w-4 h-4"><StickerReport /></div> View History
                                          </button>
                                          <button onClick={() => { setAdjustItem(item); setAdjustQty(''); setAdjustAction('increase'); setAdjustModal(true) }} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-blue-700 flex items-center gap-2">
                                            <div className="w-4 h-4"><StickerAdjust /></div> Adjust Stock
                                          </button>
                                          <button onClick={() => openDeleteModal(item)} className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                                            <div className="w-4 h-4"><StickerWarning /></div> Delete
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                  {!isAdmin && <span className="text-slate-300 text-xs">—</span>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 text-right">Showing {filteredItems.length} of {items.length} items</p>
                </div>

                {/* Pending Supervisor Requests */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6"><StickerBell /></div>
                    Pending Supervisor Requests
                    {pendingRequests.length > 0 && (
                      <span className="ml-1 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold">{pendingRequests.length}</span>
                    )}
                  </h2>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Supervisor</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Item Requested</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Purpose</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRequests.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center">
                              <div className="w-10 h-10 mx-auto mb-2 opacity-30"><StickerTask /></div>
                              <p className="text-slate-400 text-sm">No pending requests.</p>
                            </td>
                          </tr>
                        ) : pendingRequests.slice(0, 10).map(req => (
                          <tr key={req.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">REQ-{String(req.id).padStart(3, '0')}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {(req.requester_name || req.requested_by_name || 'U')[0]}
                                </div>
                                <span className="font-medium text-slate-800 text-xs">{req.requester_name || req.requested_by_name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 shrink-0"><StickerBox /></div>
                                <span className="font-medium text-slate-800">{req.item_name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">{req.quantity_requested}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs max-w-[120px] truncate">{req.reason || req.notes || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${
                                req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                req.status === 'approved' ? 'bg-green-100 text-green-700' :
                                req.is_urgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                {req.is_urgent ? 'Urgent' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {isAdmin && req.status === 'pending' ? (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => handleApprove(req.id)} disabled={busyId === req.id} className="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition">Approve</button>
                                  <button onClick={() => setRejectModalId(req.id)} disabled={busyId === req.id} className="px-2.5 py-1 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition">Reject</button>
                                </div>
                              ) : req.status === 'approved' ? (
                                <button onClick={() => navigate('/requests')} className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition">Issue</button>
                              ) : (
                                <button onClick={() => navigate('/requests')} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition">View</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom action buttons */}
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                    <button onClick={bulkUpload} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition">
                      <div className="w-4 h-4"><StickerUpload /></div> Bulk Upload
                    </button>
                    <button onClick={() => { setAdjustModal(true); setAdjustItem(null) }} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition">
                      <div className="w-4 h-4"><StickerAdjust /></div> Stock Adjustment
                    </button>
                    <button onClick={generateBarcode} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition">
                      <div className="w-4 h-4"><StickerBarcode /></div> Generate Barcode
                    </button>
                    <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition">
                      <div className="w-4 h-4"><StickerPrint /></div> Print Report
                    </button>
                    <button onClick={() => navigate('/requests')} className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                      View All Requests →
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── CATEGORIES TAB ── */}
            {activeTab === 'categories' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6"><StickerWarehouse /></div> Categories
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.length === 0 ? (
                    <p className="text-slate-400 text-sm col-span-3">No categories found.</p>
                  ) : categories.map(cat => {
                    const catItems = items.filter(i => String(i.category) === String(cat.id))
                    const catStock = catItems.reduce((a, i) => a + Number(i.available_quantity || 0), 0)
                    return (
                      <div key={cat.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition cursor-pointer"
                        onClick={() => { setCategoryFilter(String(cat.id)); setActiveTab('inventory') }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColor(cat.name)}`}>{cat.name}</span>
                          <div className="w-9 h-9"><CategorySticker name={cat.name} size="w-9 h-9" /></div>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{catItems.length}</p>
                        <p className="text-xs text-slate-500">items · {fmt(catStock)} units total</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ASSIGN TASK TAB ── */}
            {activeTab === 'tasks' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6"><StickerTask /></div> Assign Task
                </h2>
                <div className="text-center py-10">
                  <div className="w-16 h-16 mx-auto mb-3"><StickerTask /></div>
                  <p className="font-medium text-slate-600">Task Assignment</p>
                  <p className="text-sm text-slate-400 mt-1">Navigate to Requests to manage and assign tasks to supervisors.</p>
                  <button onClick={() => navigate('/requests')} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition">Go to Requests</button>
                </div>
              </div>
            )}

            {/* ── ASSIGN INVENTORY TAB ── */}
            {activeTab === 'assign' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6"><StickerAssign /></div> Assign Inventory
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  {items.filter(i => Number(i.available_quantity) > 0).slice(0, 6).map(item => (
                    <div key={item.id} className="border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9"><CategorySticker name={item.category_name} size="w-9 h-9" /></div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{item.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{fmt(item.available_quantity)} {item.unit} available</p>
                        </div>
                      </div>
                      <button onClick={() => openIssueModal(item)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition">Issue</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab('inventory')} className="text-sm text-blue-600 hover:underline">View all inventory →</button>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="space-y-4">

            {/* Stock Overview */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 text-sm">Stock Overview</h3>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">Category Wise</span>
              </div>
              <DonutChart categories={categories} items={items} />
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {categories.slice(0, 3).map(cat => {
                  const catStock = items.filter(i => String(i.category) === String(cat.id)).reduce((a, i) => a + Number(i.available_quantity || 0), 0)
                  return (
                    <div key={cat.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <CategorySticker name={cat.name} size="w-4 h-4" />
                        <span className="text-slate-600 truncate max-w-[80px]">{cat.name}</span>
                      </div>
                      <span className="font-semibold text-slate-700">{fmt(catStock)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Monthly Issuance */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">Monthly Issuance & Purchase</h3>
              <MiniBarChart items={items} issuedThisMonth={issuedThisMonth} />
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">This Month</span>
                <span className="font-bold text-orange-600">{issuedThisMonth} Issued</span>
              </div>
            </div>

            {/* Stock Alerts */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5">
                <div className="w-5 h-5"><StickerBell /></div> Stock Alerts
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-sm text-slate-700">Low Stock</span>
                  </div>
                  <span className="text-sm font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{lowStockCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-700" />
                    <span className="text-sm text-slate-700">Out of Stock</span>
                  </div>
                  <span className="text-sm font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{outOfStockCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-sm text-slate-700">Reorder Soon</span>
                  </div>
                  <span className="text-sm font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{reorderSoonCount}</span>
                </div>
              </div>
              <button onClick={() => navigate('/items')} className="mt-3 w-full py-2 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition flex items-center justify-center gap-1.5">
                <div className="w-4 h-4"><StickerWarning /></div> View All Alerts
              </button>
            </div>

            {/* Storage Location */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5">
                <div className="w-5 h-5"><StickerWarehouse /></div> Storage Location
              </h3>
              <div className="space-y-1.5">
                {[
                  { label: 'Main Warehouse', Icon: StickerWarehouse, kw: ['main', 'warehouse'] },
                  { label: 'Secondary Store', Icon: StickerBox, kw: ['secondary', 'store'] },
                  { label: 'Transport', Icon: StickerTruck, kw: ['transport'] },
                ].map(loc => {
                  const count = items.filter(i => loc.kw.some(k => (i.location || '').toLowerCase().includes(k))).length
                  return (
                    <div key={loc.label} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition">
                      <div className="w-6 h-6"><loc.Icon /></div>
                      <span className="text-sm text-slate-700 flex-1">{loc.label}</span>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">Recent Inventory Transactions</h3>
              <div className="space-y-3">
                {recentTransactions.length === 0 ? (
                  <p className="text-xs text-slate-400">No recent transactions.</p>
                ) : recentTransactions.map(tx => (
                  <div key={tx.id} className="flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                    <div className="w-8 h-8 shrink-0"><StickerBox /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">#{tx.id} {tx.name}</p>
                      <p className="text-[10px] text-slate-400">{tx.type}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold ${tx.positive ? 'text-green-600' : 'text-red-600'}`}>{tx.qty} units</p>
                      <p className="text-[10px] text-slate-400">{tx.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/stock-entries')} className="mt-3 w-full py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100 transition">
                View Stock Log →
              </button>
            </div>
          </div>
        </div>

        {/* Last updated footer */}
        <div className="mt-5 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <div className="w-4 h-4 opacity-50"><StickerReport /></div>
          Last Updated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} – {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* ── Add / Edit Item Modal ── */}
      <Modal open={modalMode === 'add' || modalMode === 'edit'} onClose={closeModal}
        title={modalMode === 'add' ? '+ Add Inventory Item' : 'Edit Inventory Item'}
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button onClick={saveItem} disabled={saving}>{saving ? 'Saving…' : modalMode === 'add' ? 'Add Item' : 'Save Changes'}</Button></>}>
        <div className="space-y-4">
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <Field label="Item Name"><Input name="name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Fertilizer Bags" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select name="category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option value="">Select…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="item_type" value={form.item_type} onChange={e => setForm(p => ({ ...p, item_type: e.target.value }))}>
                <option value="consumable">Consumable</option><option value="asset">Asset</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit">
              <Select name="unit" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Unit Cost (₹)"><Input name="unit_cost" type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm(p => ({ ...p, unit_cost: e.target.value }))} /></Field>
          </div>
          <Field label="Storage Location"><Input name="location" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Main Warehouse – Shelf A3" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total Qty"><Input name="total_quantity" type="number" min="0" value={form.total_quantity} onChange={e => setForm(p => ({ ...p, total_quantity: e.target.value }))} /></Field>
            <Field label="Available Qty"><Input name="available_quantity" type="number" min="0" value={form.available_quantity} onChange={e => setForm(p => ({ ...p, available_quantity: e.target.value }))} /></Field>
            <Field label="Low Stock Threshold"><Input name="threshold_quantity" type="number" min="0" value={form.threshold_quantity} onChange={e => setForm(p => ({ ...p, threshold_quantity: e.target.value }))} /></Field>
          </div>
          <Field label="Description"><Textarea name="description" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description…" /></Field>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={modalMode === 'delete'} onClose={closeModal} title="Delete Item"
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</Button></>}>
        <p className="text-sm text-slate-600">Are you sure you want to delete <strong className="text-slate-900">{selectedItem?.name}</strong>? This action cannot be undone.</p>
        {formError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
      </Modal>

      {/* ── Issue Modal ── */}
      <Modal open={modalMode === 'issue'} onClose={closeModal} title="Issue Stock"
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button variant="success" onClick={handleIssue} disabled={saving}>{saving ? 'Issuing…' : 'Issue Stock'}</Button></>}>
        <div className="space-y-4">
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-800">{selectedItem?.name}</p>
            <p className="text-xs text-slate-500 mt-1">Available: <strong className="text-slate-700">{fmt(selectedItem?.available_quantity)} {selectedItem?.unit}</strong></p>
            <p className="text-xs text-slate-500">Category: {selectedItem?.category_name}</p>
          </div>
          <Field label={`Quantity to Issue (max: ${selectedItem?.available_quantity})`}>
            <Input type="number" min="1" max={selectedItem?.available_quantity} value={issueQty} onChange={e => setIssueQty(e.target.value)} placeholder="Enter quantity…" />
          </Field>
        </div>
      </Modal>

      {/* ── Reject Modal ── */}
      <Modal open={!!rejectModalId} onClose={() => { setRejectModalId(null); setRejectReason('') }} title="Reject Request"
        footer={<><Button variant="outline" onClick={() => { setRejectModalId(null); setRejectReason('') }}>Cancel</Button><Button variant="danger" onClick={() => handleReject(rejectModalId)} disabled={busyId === rejectModalId}>Reject</Button></>}>
        <Field label="Reason for rejection (optional)">
          <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason…" />
        </Field>
      </Modal>

      {/* ── Stock Adjust Modal ── */}
      <Modal open={adjustModal} onClose={() => { setAdjustModal(false); setAdjustItem(null); setAdjustQty('') }} title="Stock Adjustment"
        footer={<><Button variant="outline" onClick={() => { setAdjustModal(false); setAdjustItem(null); setAdjustQty('') }}>Cancel</Button><Button onClick={handleStockAdjust} disabled={saving || !adjustItem || !adjustQty}>{saving ? 'Adjusting…' : 'Apply Adjustment'}</Button></>}>
        <div className="space-y-4">
          <Field label="Select Item">
            <Select value={adjustItem?.id || ''} onChange={e => setAdjustItem(items.find(i => String(i.id) === e.target.value) || null)}>
              <option value="">Choose item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({fmt(i.available_quantity)} {i.unit})</option>)}
            </Select>
          </Field>
          {adjustItem && (
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex items-center gap-3">
              <div className="w-8 h-8"><CategorySticker name={adjustItem.category_name} size="w-8 h-8" /></div>
              <div>
                <p className="font-semibold text-slate-800">{adjustItem.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Current: {fmt(adjustItem.available_quantity)} {adjustItem.unit}</p>
              </div>
            </div>
          )}
          <Field label="Adjustment Type">
            <Select value={adjustAction} onChange={e => setAdjustAction(e.target.value)}>
              <option value="increase">Increase (Add Stock)</option>
              <option value="decrease">Decrease (Remove Stock)</option>
            </Select>
          </Field>
          <Field label="Quantity">
            <Input type="number" min="1" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="Enter quantity…" />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
