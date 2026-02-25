import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { inventoryAPI } from '../api/inventory'
import Layout from '../layout/Layout'
import { Button, Badge, Modal, Field, Input, Textarea, Alert, Spinner } from '../components/ui'

const EVENT_CONFIG = {
  stock_added: { label: 'Stock Added',     color: 'green',  dot: 'bg-emerald-500' },
  issued:      { label: 'Issued',          color: 'blue',   dot: 'bg-blue-500'    },
  returned:    { label: 'Returned',        color: 'teal',   dot: 'bg-teal-500'    },
  finalized:   { label: 'Usage Finalized', color: 'purple', dot: 'bg-purple-500'  },
}

export default function ItemHistoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [addStockModal, setAddStockModal] = useState(false)
  const [stockForm, setStockForm] = useState({ quantity_added: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [stockError, setStockError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await inventoryAPI.getItemHistory(id)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleAddStock = async () => {
    setSaving(true)
    setStockError('')
    try {
      await inventoryAPI.createStockEntry({
        item: Number(id),
        quantity_added: Number(stockForm.quantity_added),
        notes: stockForm.notes,
      })
      setAddStockModal(false)
      setStockForm({ quantity_added: '', notes: '' })
      load()
    } catch (err) {
      setStockError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (dt) => new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

  if (loading) return <Layout><div className="flex justify-center py-20"><Spinner /></div></Layout>

  const item = data?.item
  const events = data?.events || []

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/items')} className="text-slate-400 hover:text-slate-700 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{item?.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{item?.category_name} · {item?.item_type}</p>
          </div>
          <Button onClick={() => setAddStockModal(true)}>+ Add Stock</Button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Available', value: item?.available_quantity, color: item?.is_below_threshold ? 'text-red-600' : 'text-emerald-600' },
            { label: 'Total',     value: item?.total_quantity,     color: 'text-slate-900' },
            { label: 'Threshold', value: item?.threshold_quantity, color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value} {item?.unit}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Full History</h2>
            <p className="text-xs text-slate-500 mt-0.5">{events.length} events</p>
          </div>
          {events.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No history yet.</div>
          ) : (
            <div className="p-6">
              <div className="relative">
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-slate-200" />
                <div className="space-y-6">
                  {events.map((event, i) => {
                    const cfg = EVENT_CONFIG[event.type] || { label: event.type, color: 'gray', dot: 'bg-slate-400' }
                    return (
                      <div key={i} className="flex gap-4 relative">
                        <div className={`w-3.5 h-3.5 rounded-full ${cfg.dot} shrink-0 mt-1 z-10`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge color={cfg.color}>{cfg.label}</Badge>
                            <span className="text-xs text-slate-400">{fmt(event.date)}</span>
                          </div>
                          <p className="text-sm text-slate-700 mt-1">
                            <span className="font-medium">{event.person}</span>
                            {' · '}
                            <span className="font-semibold text-slate-900">
                              {event.type === 'stock_added' ? '+' : ''}{event.quantity} {item?.unit}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{event.detail}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={addStockModal}
        onClose={() => setAddStockModal(false)}
        title={`Add Stock — ${item?.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddStockModal(false)}>Cancel</Button>
            <Button onClick={handleAddStock} disabled={saving}>{saving ? 'Adding...' : 'Add Stock'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={stockError} />
          <Field label={`Quantity to Add (${item?.unit})`}>
            <Input
              type="number" min="1"
              value={stockForm.quantity_added}
              onChange={(e) => setStockForm((p) => ({ ...p, quantity_added: e.target.value }))}
              placeholder="e.g. 50"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={stockForm.notes}
              onChange={(e) => setStockForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="e.g. Received from contractor on 5th March"
            />
          </Field>
        </div>
      </Modal>
    </Layout>
  )
}
