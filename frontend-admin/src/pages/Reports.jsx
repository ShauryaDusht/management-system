import { useEffect, useMemo, useState } from 'react'
import Layout from '../layout/Layout'
import { Button, Input, Select, Spinner, StatusBadge } from '../components/ui'
import { getInventoryReport, getRequestsReport } from '../api/inventory'

function exportToCSV(data, filename) {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map((row) => Object.values(row).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ReportCard({ title, value, color }) {
  const palette = {
    blue: 'text-blue-700',
    green: 'text-emerald-700',
    orange: 'text-amber-700',
    red: 'text-red-700',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${palette[color] || 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState('inventory')

  const [inventoryReport, setInventoryReport] = useState(null)
  const [requestsReport, setRequestsReport] = useState(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadInventoryReport = async () => {
    setInventoryLoading(true)
    setError('')
    try {
      const response = await getInventoryReport()
      setInventoryReport(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load inventory report.')
    } finally {
      setInventoryLoading(false)
    }
  }

  const loadRequestsReport = async () => {
    setRequestsLoading(true)
    setError('')
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const response = await getRequestsReport(params)
      setRequestsReport(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load requests report.')
    } finally {
      setRequestsLoading(false)
    }
  }

  useEffect(() => {
    loadInventoryReport()
  }, [])

  useEffect(() => {
    if (activeTab === 'requests' && !requestsReport) {
      loadRequestsReport()
    }
  }, [activeTab, requestsReport])

  const filteredInventoryItems = useMemo(() => {
    const items = inventoryReport?.items || []
    if (statusFilter === 'all') return items
    return items.filter((item) => item.status === statusFilter)
  }, [inventoryReport, statusFilter])

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">Inventory and request analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-3 py-2 rounded-lg text-sm border ${
                activeTab === 'inventory'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              Inventory Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-2 rounded-lg text-sm border ${
                activeTab === 'requests'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              Requests Report
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'inventory' && (
          <>
            {inventoryLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                  <ReportCard title="Total Items" value={inventoryReport?.total_items ?? 0} color="blue" />
                  <ReportCard title="Total Value" value={`₹${(inventoryReport?.total_value ?? 0).toFixed(2)}`} color="green" />
                  <ReportCard title="Low Stock" value={inventoryReport?.low_stock_count ?? 0} color="orange" />
                  <ReportCard title="Out of Stock" value={inventoryReport?.out_of_stock_count ?? 0} color="red" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="w-56">
                    <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All</option>
                      <option value="in_stock">In Stock</option>
                      <option value="low_stock">Low Stock</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </Select>
                  </div>
                  <Button onClick={() => exportToCSV(filteredInventoryItems, 'inventory_report.csv')}>
                    Export to CSV
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Item Name', 'Category', 'Type', 'Available', 'Threshold', 'Unit Cost', 'Total Value', 'Status'].map((header) => (
                            <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInventoryItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No data available.</td>
                          </tr>
                        ) : (
                          filteredInventoryItems.map((item) => (
                            <tr key={item.id} className="border-b border-slate-50">
                              <td className="px-4 py-3 text-slate-700">{item.name}</td>
                              <td className="px-4 py-3 text-slate-700">{item.category}</td>
                              <td className="px-4 py-3 text-slate-700 capitalize">{item.type}</td>
                              <td className="px-4 py-3 text-slate-700">{item.available_quantity} {item.unit}</td>
                              <td className="px-4 py-3 text-slate-700">{item.threshold_quantity}</td>
                              <td className="px-4 py-3 text-slate-700">₹{Number(item.unit_cost || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-slate-700">₹{Number(item.total_value || 0).toFixed(2)}</td>
                              <td className="px-4 py-3"><StatusBadge value={item.status} /></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'requests' && (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date From</label>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date To</label>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
              <Button onClick={loadRequestsReport} disabled={requestsLoading}>
                {requestsLoading ? 'Loading...' : 'Apply'}
              </Button>
              <Button
                variant="outline"
                onClick={() => exportToCSV(requestsReport?.requests || [], 'requests_report.csv')}
              >
                Export to CSV
              </Button>
            </div>

            {requestsLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                  <ReportCard title="Total" value={requestsReport?.total ?? 0} color="blue" />
                  <ReportCard title="Pending" value={requestsReport?.pending ?? 0} color="orange" />
                  <ReportCard title="Approved" value={requestsReport?.approved ?? 0} color="green" />
                  <ReportCard title="Rejected" value={requestsReport?.rejected ?? 0} color="red" />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Requester', 'Item', 'Quantity', 'Status', 'Date', 'Reviewed By'].map((header) => (
                            <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(requestsReport?.requests || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No data available.</td>
                          </tr>
                        ) : (
                          (requestsReport?.requests || []).map((req) => (
                            <tr key={req.id} className="border-b border-slate-50">
                              <td className="px-4 py-3 text-slate-700">{req.requester}</td>
                              <td className="px-4 py-3 text-slate-700">{req.item}</td>
                              <td className="px-4 py-3 text-slate-700">{req.quantity}</td>
                              <td className="px-4 py-3"><StatusBadge value={req.status} /></td>
                              <td className="px-4 py-3 text-slate-500">{new Date(req.created_at).toLocaleDateString('en-IN')}</td>
                              <td className="px-4 py-3 text-slate-500">{req.reviewed_by || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
