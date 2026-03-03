import { useState } from 'react'

import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import IssuesTab from './IssuesTab'
import ItemsTab from './ItemsTab'
import RequestsTab from './RequestsTab'
import StockLogTab from './StockLogTab'
import { useAuth } from '../../context/AuthContext'

const TAB_CONFIG = [
  { key: 'items', label: 'Items', icon: '📦' },
  { key: 'requests', label: 'Requests', icon: '📋' },
  { key: 'issues', label: 'Issued Items', icon: '🔄' },
  { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
]

export default function InventoryPage() {
  const [active, setActive] = useState('items')
  const { user } = useAuth()

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Stock overview, requests, issued assets, and replenishment logs"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_CONFIG} active={active} onChange={setActive} />
      </div>

      {active === 'items' && <ItemsTab userRole={user?.role} />}
      {active === 'requests' && <RequestsTab userRole={user?.role} />}
      {active === 'issues' && <IssuesTab userRole={user?.role} />}
      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}
    </AdminLayout>
  )
}
