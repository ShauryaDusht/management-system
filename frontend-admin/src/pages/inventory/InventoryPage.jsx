import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const validTabs = useMemo(() => TAB_CONFIG.map((t) => t.key), [])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'items'
  )
  const { user } = useAuth()

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && validTabs.includes(tab) && tab !== active) {
      setActive(tab)
    }
  }, [active, searchParams, validTabs])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Stock overview, requests, issued assets, and replenishment logs"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_CONFIG} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && <ItemsTab userRole={user?.role} />}
      {active === 'requests' && <RequestsTab userRole={user?.role} />}
      {active === 'issues' && <IssuesTab userRole={user?.role} />}
      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}
    </AdminLayout>
  )
}
