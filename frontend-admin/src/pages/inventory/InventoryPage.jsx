import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

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
import HorticultureStockPage from '../horticulture/HorticultureStockPage'
import InventoryDepartmentHeader from './InventoryDepartmentHeader'
import InventorySelectView from './InventorySelectView'

const BASE_TAB_CONFIG = [
  { key: 'items', label: 'Items', icon: '📦' },
  { key: 'requests', label: 'Requests', icon: '📋' },
  { key: 'issues', label: 'Issued Items', icon: '🔄' },
  { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
  { key: 'monthly', label: 'Monthly Procurement', icon: '📅' },
]

const REQUEST_REPORT_TAB = { key: 'request-report', label: 'Request Report', icon: 'RR' }

export default function InventoryPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()

  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'
  const isHorticultureManager = user?.role === 'horticulture_manager'
  const inventoryRole = isHostelOffice ? 'hostel_office' : user?.role
  const canViewReports = user?.is_superuser || user?.role === 'admin' || user?.role === 'inventory_manager' || user?.role === 'hk_inventory_manager' || user?.role === 'horticulture_manager' || isHostelOffice

  const path = location.pathname.toLowerCase()
  const deptParam = searchParams.get('dept') || searchParams.get('section')

  // Detect which department is active
  const isHorticulture = path.includes('/horticulture') || deptParam === 'horticulture' || isHorticultureManager
  const isHousekeeping = path.includes('/housekeeping') || deptParam === 'housekeeping' || isHostelOffice

  // If Horticulture is selected, render the dedicated Horticulture Inventory dashboard
  if (isHorticulture) {
    return <HorticultureStockPage />
  }

  // If neither department is explicitly opened (and not restricted by role like hostel_office), render the Selection Hub
  if (!isHousekeeping && !isHostelOffice) {
    return <InventorySelectView />
  }

  // Otherwise, render Housekeeping Inventory Dashboard
  return (
    <HousekeepingInventoryDashboard
      searchParams={searchParams}
      setSearchParams={setSearchParams}
      userRole={inventoryRole}
      isHostelOffice={isHostelOffice}
      canViewReports={canViewReports}
      badges={badges}
      markSeen={markSeen}
    />
  )
}

function HousekeepingInventoryDashboard({
  searchParams,
  setSearchParams,
  userRole,
  isHostelOffice,
  canViewReports,
  badges,
  markSeen,
}) {
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
      title={isHostelOffice ? 'Inventory Reports' : 'Housekeeping Inventory'}
      subtitle={isHostelOffice ? 'View stock, requests, issued items, and inventory reports' : 'Stock overview, requests, issued assets, replenishment logs, and reports'}
    >
      <InventoryDepartmentHeader currentDepartment="housekeeping" />

      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabConfig} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && <ItemsTab userRole={userRole} />}
      {active === 'requests' && (
        <RequestsTab
          userRole={userRole}
          excludeCategoryScope="Garden & Horticulture Equipment"
        />
      )}
      {active === 'issues' && (
        <IssuesTab
          userRole={userRole}
          excludeCategoryScope="Garden & Horticulture Equipment"
        />
      )}
      {active === 'stocklog' && (
        <StockLogTab
          userRole={userRole}
          excludeCategoryScope="Garden & Horticulture Equipment"
        />
      )}
      {active === 'monthly' && !isHostelOffice && canViewReports && <MonthlyReportTab />}
      {active === 'inventory-report' && canViewReports && <ReportTab />}
      {active === 'request-report' && canViewReports && (
        <RequestsReportTab excludeCategoryScope="Garden & Horticulture Equipment" />
      )}
    </AdminLayout>
  )
}
