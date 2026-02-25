import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { StatusBadge, Spinner, Table } from '../components/ui'

export default function UserActivityPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryAPI.getUserActivity(id)
      .then((res) => setData(res.data))
      .finally(() => setLoading(false))
  }, [id])

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  const columns = [
    { key: 'id', label: '#', render: (r) => <span className="text-slate-400 text-xs">#{r.id}</span> },
    { key: 'item_name', label: 'Item', render: (r) => <span className="font-medium text-slate-900">{r.item_name}</span> },
    { key: 'quantity_requested', label: 'Qty', align: 'right', render: (r) => `${r.quantity_requested} ${r.item_unit}` },
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="text-xs text-slate-500 line-clamp-2 max-w-[200px]">{r.purpose}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'requested_at', label: 'Requested', render: (r) => <span className="text-xs text-slate-500">{fmt(r.requested_at)}</span> },
  ]

  if (loading) return <Layout><div className="flex justify-center py-20"><Spinner /></div></Layout>

  const user = data?.user
  const summary = data?.summary
  const requests = data?.requests || []

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/users')} className="text-slate-400 hover:text-slate-700 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">@{user?.username} · <span className="capitalize">{user?.role}</span></p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Requests', value: summary?.total,    color: 'text-slate-900'    },
            { label: 'Issued',         value: summary?.issued,   color: 'text-emerald-600'  },
            { label: 'Pending',        value: summary?.pending,  color: 'text-amber-600'    },
            { label: 'Rejected',       value: summary?.rejected, color: 'text-red-600'      },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <Table
          columns={columns}
          data={requests}
          emptyMessage={user?.role === 'supervisor' ? 'This supervisor has not made any requests.' : 'This manager has not reviewed any requests.'}
        />
      </div>
    </Layout>
  )
}
