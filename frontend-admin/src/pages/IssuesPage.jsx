import { useEffect, useState } from 'react'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { PageHeader, Spinner, Table } from '../components/ui'

export default function IssuesPage() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryAPI.getIssues()
      .then((res) => setIssues(res.data.results ?? res.data))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  const columns = [
    { key: 'id', label: '#', render: (r) => <span className="text-slate-400 text-xs">#{r.id}</span> },
    { key: 'item_name', label: 'Item', render: (r) => <span className="font-medium text-slate-900">{r.item_name}</span> },
    { key: 'requested_by_name', label: 'Supervisor' },
    { key: 'issued_by_name', label: 'Issued By' },
    { key: 'issued_quantity', label: 'Qty Issued', align: 'right' },
    { key: 'issued_at', label: 'Issued At', render: (r) => <span className="text-xs text-slate-500">{fmt(r.issued_at)}</span> },
    {
      key: 'returned_at', label: 'Returned',
      render: (r) => r.returned_at
        ? <span className="text-xs text-emerald-600">{fmt(r.returned_at)}</span>
        : <span className="text-xs text-slate-400">Not returned</span>
    },
    { key: 'notes', label: 'Notes', render: (r) => <span className="text-xs text-slate-500">{r.notes || '—'}</span> },
  ]

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader title="Issued Items" subtitle="Full history of all item issues" />
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <Table columns={columns} data={issues} emptyMessage="No items have been issued yet." />
        )}
      </div>
    </Layout>
  )
}
