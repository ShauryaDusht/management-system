import { useEffect, useState, useCallback } from "react"
import { inventoryAPI } from "../api/inventory"
import Layout from "../layout/Layout"
import { PageHeader, Spinner, Table, Select } from "../components/ui"

export default function StockEntriesPage() {
  const [entries, setEntries] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterItem, setFilterItem] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterItem) params.item = filterItem
      const [entriesRes, itemsRes] = await Promise.all([
        inventoryAPI.getStockEntries(params),
        inventoryAPI.getItems(),
      ])
      setEntries(entriesRes.data.results ?? entriesRes.data)
      setItems(itemsRes.data.results ?? itemsRes.data)
    } finally {
      setLoading(false)
    }
  }, [filterItem])

  useEffect(() => { load() }, [load])

  const fmt = (dt) => new Date(dt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  const total = entries.reduce((sum, e) => sum + e.quantity_added, 0)

  const columns = [
    { key: "id", label: "#", render: (r) => r.id },
    { key: "item_name", label: "Item", render: (r) => r.item_name },
    { key: "quantity_added", label: "Qty Added", align: "right", render: (r) => r.quantity_added + " " + r.item_unit },
    { key: "added_by_name", label: "Added By" },
    { key: "added_at", label: "Date", render: (r) => fmt(r.added_at) },
    { key: "notes", label: "Notes", render: (r) => r.notes || "—" },
  ]

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <PageHeader title="Stock Replenishment Log" subtitle={entries.length + " entries"} />
        <div className="mb-5">
          <Select value={filterItem} onChange={(e) => setFilterItem(e.target.value)} className="w-56">
            <option value="">All Items</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </div>
        {loading ? <div className="flex justify-center py-20"><Spinner /></div>
          : <Table columns={columns} data={entries} emptyMessage="No stock entries recorded yet." />
        }
      </div>
    </Layout>
  )
}
