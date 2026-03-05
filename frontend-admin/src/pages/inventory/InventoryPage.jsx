import { useState } from 'react'

import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import IssuesTab from './IssuesTab'
import ItemsTab from './ItemsTab'
import RequestsTab from './RequestsTab'
import StockLogTab from './StockLogTab'
import TasksTab from './TasksTab'
import { useAuth } from '../../context/AuthContext'

export default function InventoryPage() {
  const [active, setActive] = useState('items')
  const { user } = useAuth()

  const isAdmin = user?.role === 'admin'
  const isManager = ['admin', 'manager', 'inventory_manager'].includes(user?.role)

  const TAB_CONFIG = [
    { key: 'items', label: 'Items', icon: '📦' },
    { key: 'requests', label: 'Requests', icon: '📋' },
    { key: 'issues', label: 'Issued Items', icon: '🔄' },
    { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
    // Only admins/managers see the Tasks tab
    ...(isManager ? [{ key: 'tasks', label: 'Assign Task', icon: '✅' }] : []),
  ]

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Stock overview, requests, issued assets, and replenishment logs"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_CONFIG} active={active} onChange={setActive} />
      </div>

      {active === 'items' && (
        <ItemsTab userRole={user?.role} onTabChange={setActive} />
      )}
      {active === 'requests' && <RequestsTab userRole={user?.role} />}
      {active === 'issues' && <IssuesTab userRole={user?.role} />}
      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}
      {active === 'tasks' && isManager && <TasksTab userRole={user?.role} />}
    </AdminLayout>
  )
}
