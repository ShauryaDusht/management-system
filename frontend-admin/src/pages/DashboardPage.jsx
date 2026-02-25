import { useEffect, useState } from 'react'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { StatusBadge, Spinner } from '../components/ui'

function StatCard({ label, value, color, icon }) {
  const colors = {
    blue:   'text-blue-700',
    orange: 'text-orange-700',
    red:    'text-red-700',
    green:  'text-emerald-700',
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

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([inventoryAPI.getDashboard(), inventoryAPI.getLowStockItems()])
      .then(([dash, ls]) => {
        setSummary(dash.data)
        setLowStock(ls.data.items)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Layout><div className="flex justify-center py-20"><Spinner /></div></Layout>
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Inventory overview</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Items"       value={summary?.total_items}       color="blue"   icon="📦" />
          <StatCard label="Low Stock"         value={summary?.low_stock_count}    color="orange" icon="⚠️" />
          <StatCard label="Out of Stock"      value={summary?.out_of_stock_count} color="red"    icon="🚫" />
          <StatCard label="Pending Requests"  value={summary?.pending_requests}   color="green"  icon="📋" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Items Below Threshold</h2>
            {lowStock.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                {lowStock.length} items need attention
              </span>
            )}
          </div>
          {lowStock.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-slate-500 text-sm">All items are sufficiently stocked.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Item', 'Category', 'Type', 'Available', 'Threshold', 'Status'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
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
