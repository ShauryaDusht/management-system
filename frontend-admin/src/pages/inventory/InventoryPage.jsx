import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import AdminLayout from '../../layout/AdminLayout'
import RequestsReportTab from '../reports/RequestsReportTab'
import IssuesTab from './IssuesTab'
import ItemsTab from './ItemsTab'
import MonthlyReportTab from './MonthlyReportTab'
import RequestsTab from './RequestsTab'
import StockLogTab from './StockLogTab'
import ReportTab from './ReportTab'

const BASE_TAB_CONFIG = [
  { key: 'items', label: 'Items', icon: '📦' },
  { key: 'requests', label: 'Requests', icon: '📋' },
  { key: 'issues', label: 'Issued Items', icon: '🔄' },
  { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
  { key: 'monthly', label: 'Monthly Procurement', icon: '📅' },
]

const REQUEST_REPORT_TAB = { key: 'request-report', label: 'Request Report', icon: 'RR' }

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const inventoryRole = isHostelOffice ? 'hostel_office' : user?.role
  const canViewReports = user?.is_superuser || user?.role === 'admin' || user?.role === 'inventory_manager' || user?.role === 'hk_inventory_manager' || user?.role === 'horticulture_manager' || isHostelOffice

  const tabConfig = useMemo(() => {
    const visibleBase = isHostelOffice
      ? BASE_TAB_CONFIG.filter((tab) => ['items', 'requests', 'issues', 'stocklog'].includes(tab.key))
      : BASE_TAB_CONFIG
    const base = visibleBase.map((tab) => {
      if (tab.key === 'items') {
        return {
          ...tab,
          count: badges.lowStock > 0 ? badges.lowStock : null,
          countTone: 'yellow',
        }
      }
      if (tab.key === 'requests') {
        return {
          ...tab,
          count: badges.inventory > 0 ? badges.inventory : null,
          countTone: 'red',
        }
      }
      return tab
    })

    return canViewReports ? [...base, { key: 'inventory-report', label: 'Inventory Report', icon: 'IR' }, REQUEST_REPORT_TAB] : base
  }, [badges.inventory, badges.lowStock, canViewReports, isHostelOffice])

  const validTabs = useMemo(() => tabConfig.map((tab) => tab.key), [tabConfig])
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
    if (active === 'requests' && badges.inventory > 0) {
      markSeen('inventory')
    }
    if (active === 'items' && badges.lowStock > 0) {
      markSeen('lowStock')
    }
  }, [active, badges.inventory, badges.lowStock, markSeen])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <AdminLayout
      title={isHostelOffice ? 'Inventory Reports' : 'Inventory Management'}
      subtitle={isHostelOffice ? 'View stock, requests, issued items, and inventory reports' : 'Stock overview, requests, issued assets, replenishment logs, and reports'}
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabConfig} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && <ItemsTab userRole={inventoryRole} />}
      {active === 'requests' && (
        <RequestsTab
          userRole={inventoryRole}
          excludeCategoryScope="Garden & Horticulture Equipment"
        />
      )}
      {active === 'issues' && (
        <IssuesTab
          userRole={inventoryRole}
          excludeCategoryScope="Garden & Horticulture Equipment"
        />
      )}
      {active === 'stocklog' && <StockLogTab userRole={inventoryRole} />}
      {active === 'monthly' && !isHostelOffice && canViewReports && <MonthlyReportTab />}
      {active === 'inventory-report' && canViewReports && <ReportTab />}
      {active === 'request-report' && canViewReports && (
        <RequestsReportTab excludeCategoryScope="Garden & Horticulture Equipment" />
      )}
    </AdminLayout>
  )
}
