import { useEffect, useState, useCallback } from 'react'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { StatusBadge, Spinner } from '../components/ui'

const REFRESH_INTERVAL_MS = 60_000

function StatCard({ label, value, color, icon }) {
  const colors = {
    blue:   'text-blue-700',
    orange: 'text-orange-700',
    yellow: 'text-amber-700',
    red:    'text-red-700',
    purple: 'text-purple-700',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${colors[color]}`}>{value ?? '—'}</p>
      </div>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-slate-200 shrink-0" />
        <div className="w-full">
          <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-7 w-14 bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [lowStockLoading, setLowStockLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setStatsLoading(true)
      setLowStockLoading(true)
    }
    try {
      const [dashRes, lowStockRes] = await Promise.all([
        inventoryAPI.getDashboard(),
        inventoryAPI.getLowStockItems(),
      ])
      setStats(dashRes.data)
      setLowStock(lowStockRes.data.items || [])
      setLastRefreshed(new Date())
    } finally {
      setStatsLoading(false)
      setLowStockLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(true) }, [fetchData])

  useEffect(() => {
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchData])

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Inventory overview</p>
          </div>
          {lastRefreshed && (
            <p className="text-xs text-slate-400">
              Last updated {lastRefreshed.toLocaleTimeString('en-IN')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {statsLoading ? (
            <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
          ) : (
            <>
              <StatCard label="Total Items"      value={stats?.total_items}         color="blue"   icon="📦" />
              <StatCard label="Low Stock Items"  value={stats?.low_stock_count}     color="orange" icon="⚠️" />
              {/* NOTE: dashboard endpoint uses `pending_requests` (not pending_requests_count) */}
              <StatCard label="Pending Requests" value={stats?.pending_requests}    color="yellow" icon="🕐" />
              <StatCard label="Out of Stock"     value={stats?.out_of_stock_count}  color="red"    icon="📭" />
            </>
          )}
        </div>

        {/* Overdue returns alert — data now available from the unified dashboard endpoint */}
        {!statsLoading && stats?.overdue_returns > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3">
            <span className="text-xl">🔴</span>
            <div>
              <p className="font-semibold text-red-800 text-sm">
                {stats.overdue_returns} asset{stats.overdue_returns > 1 ? 's' : ''} overdue for return
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                These assets have passed their expected return date and have not been returned.
              </p>
            </div>
          </div>
        )}

        {/* Unreturned assets summary */}
        {!statsLoading && stats?.unreturned_assets > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-3">
            <span className="text-xl">📤</span>
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{stats.unreturned_assets}</span> asset{stats.unreturned_assets > 1 ? 's' : ''} currently issued and not yet returned.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Items Below Threshold</h2>
            {!lowStockLoading && lowStock.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                {lowStock.length} items need attention
              </span>
            )}
          </div>

          {lowStockLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : lowStock.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-slate-500 text-sm">All items are sufficiently stocked.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Item', 'Category', 'Type', 'Available', 'Threshold', 'Status'].map((header) => (
                      <th key={header} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-5 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-5 py-3 text-slate-600">{item.category_name}</td>
                      <td className="px-5 py-3"><StatusBadge value={item.item_type} /></td>
                      <td className="px-5 py-3 font-semibold text-red-600">{item.available_quantity} {item.unit}</td>
                      <td className="px-5 py-3 text-slate-500">{item.threshold_quantity}</td>
                      <td className="px-5 py-3"><StatusBadge value={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}