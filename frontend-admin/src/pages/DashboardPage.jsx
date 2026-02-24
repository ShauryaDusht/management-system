import { useEffect, useState } from 'react'
import { inventoryAPI } from '../api/inventory'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    green: 'bg-green-50 text-green-700 border-green-100',
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value ?? '—'}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
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

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (loading) return <div className="p-8 text-gray-500">Loading dashboard...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900">Inventory System</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.full_name} <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">{user?.role}</span></span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Items" value={summary?.total_items} color="blue" />
          <StatCard label="Low Stock" value={summary?.low_stock_count} color="orange" />
          <StatCard label="Out of Stock" value={summary?.out_of_stock_count} color="red" />
          <StatCard label="Pending Requests" value={summary?.pending_requests} color="green" />
        </div>

        {/* Low Stock Table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Items Below Threshold</h2>
            <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">{lowStock.length} items</span>
          </div>
          {lowStock.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">All items are sufficiently stocked.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-6 py-3 text-left">Item</th>
                    <th className="px-6 py-3 text-left">Category</th>
                    <th className="px-6 py-3 text-left">Type</th>
                    <th className="px-6 py-3 text-right">Available</th>
                    <th className="px-6 py-3 text-right">Threshold</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-3 text-gray-600">{item.category_name}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${item.item_type === 'asset' ? 'bg-purple-50 text-purple-700' : 'bg-teal-50 text-teal-700'}`}>
                          {item.item_type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-red-600">
                        {item.available_quantity} {item.unit}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-500">{item.threshold_quantity}</td>
                      <td className="px-6 py-3 text-center">
                        {item.status === 'out_of_stock'
                          ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Out of Stock</span>
                          : <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Low Stock</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
