import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inventoryAPI } from '../../api/inventory'
import { Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import AdminLayout from '../../layout/AdminLayout'
import { asList } from '../../shared/utils'

import IssuesTab from '../inventory/IssuesTab'
import ItemsTab from '../inventory/ItemsTab'
import ReportTab from '../inventory/ReportTab'
import RequestsTab from '../inventory/RequestsTab'
import StockLogTab from '../inventory/StockLogTab'
import UsageReportTab from '../inventory/UsageReportTab'
import RequestsReportTab from '../reports/RequestsReportTab'

export default function HorticultureStockPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()
  const [hortPendingCount, setHortPendingCount] = useState(null)

  const loadHortPending = async () => {
    try {
      const res = await inventoryAPI.getRequests({ category: 'Garden & Horticulture Equipment', status: 'pending' })
      const list = asList(res.data)
      const count = list.filter((r) => r.status === 'pending').length
      setHortPendingCount(count > 0 ? count : null)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadHortPending()
  }, [badges.horticultureInventory])

  const tabConfig = useMemo(() => {
    return [
      {
        key: 'items',
        label: 'Items',
        icon: '📦',
        count: badges.lowStock > 0 ? badges.lowStock : null,
        countTone: 'yellow',
      },
      {
        key: 'requests',
        label: 'Requests',
        icon: '📋',
        count: badges.horticultureInventory > 0 ? badges.horticultureInventory : hortPendingCount,
        countTone: 'red',
      },
      { key: 'issues', label: 'Issued Items', icon: '🔄' },
      { key: 'usage-report', label: 'Usage Report', icon: '📊' },
      { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
      { key: 'inventory-report', label: 'Inventory Report', icon: 'IR' },
      { key: 'request-report', label: 'Request Report', icon: 'RR' },
    ]
  }, [badges.horticultureInventory, badges.lowStock, hortPendingCount])

  const validTabs = useMemo(() => tabConfig.map((t) => t.key), [tabConfig])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'items'
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && validTabs.includes(tab) && tab !== active) {
      setActive(tab)
      return
    }
    if (tab && !validTabs.includes(tab) && active !== 'items') {
      setActive('items')
    }
  }, [active, searchParams, validTabs])

  useEffect(() => {
    if (active === 'requests' && badges.horticultureInventory > 0) {
      markSeen('horticultureInventory')
    }
    if (active === 'items' && badges.lowStock > 0) {
      markSeen('lowStock')
    }
  }, [active, badges.horticultureInventory, badges.lowStock, markSeen])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <AdminLayout
      title="Horticulture Inventory"
      subtitle="Stock overview, requests, issued assets, replenishment logs, and reports"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabConfig} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && (
        <ItemsTab
          userRole={user?.role}
          initialCategory="Garden & Horticulture Equipment"
        />
      )}

      {active === 'requests' && (
        <RequestsTab
          userRole={user?.role}
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'issues' && (
        <IssuesTab
          userRole={user?.role}
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'usage-report' && (
        <UsageReportTab
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'stocklog' && (
        <StockLogTab
          userRole={user?.role}
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'inventory-report' && (
        <ReportTab
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'request-report' && (
        <RequestsReportTab
          categoryScope="Garden & Horticulture Equipment"
        />
      )}
    </AdminLayout>
  )
}
