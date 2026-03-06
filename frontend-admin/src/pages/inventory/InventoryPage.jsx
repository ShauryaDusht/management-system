import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import IssuesTab from './IssuesTab'
import ItemsTab from './ItemsTab'
import RequestsTab from './RequestsTab'
import StockLogTab from './StockLogTab'
import AssignTaskTab from './AssignTaskTab'
import { useAuth } from '../../context/AuthContext'

const TAB_CONFIG = [
  { key: 'items', label: 'Items', icon: '📦' },
  { key: 'requests', label: 'Requests', icon: '📋' },
  { key: 'issues', label: 'Issued Items', icon: '🔄' },
  { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
  { key: 'tasks', label: 'Assign Task', icon: '✅' },
]

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const validTabs = useMemo(() => TAB_CONFIG.map((t) => t.key), [])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'items'
  )
  // statusFilter for ItemsTab — set when clicking filtered cards
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const { user } = useAuth()

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && validTabs.includes(tab) && tab !== active) {
      setActive(tab)
    }
    const status = searchParams.get('status')
    if (status) setStatusFilter(status)
  }, [active, searchParams, validTabs])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    next.delete('status')
    setSearchParams(next, { replace: true })
  }

  // Handler for ItemsTab stat card → "Pending Requests" navigating to requests tab
  const handleItemsNav = (tab) => {
    onTabChange(tab)
  }

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Stock overview, requests, issued assets, replenishment logs, and task assignment"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_CONFIG} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && (
        <ItemsTab
          userRole={user?.role}
          initialStatusFilter={statusFilter !== 'all' ? statusFilter : undefined}
          onNavigate={handleItemsNav}
        />
      )}
      {active === 'requests' && <RequestsTab userRole={user?.role} />}
      {active === 'issues' && <IssuesTab userRole={user?.role} />}
      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}
      {active === 'tasks' && <AssignTaskTab userRole={user?.role} />}
    </AdminLayout>
  )
}
