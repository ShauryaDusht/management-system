import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'
import IssuesTab from './IssuesTab'
import ItemsTab from './ItemsTab'
import ReportTab from './ReportTab'
import RequestsReportTab from '../reports/RequestsReportTab'
import RequestsTab from './RequestsTab'
import StockLogTab from './StockLogTab'

const BASE_TAB_CONFIG = [
  { key: 'items', label: 'Items', icon: '📦' },
  { key: 'requests', label: 'Requests', icon: '📋' },
  { key: 'issues', label: 'Issued Items', icon: '🔄' },
  { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
]
const REPORT_TAB = { key: 'report', label: 'Report', icon: '📊' }
const REQUEST_REPORT_TAB = { key: 'request-report', label: 'Request Report', icon: 'RR' }

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const canViewReports = user?.role === 'admin'

  const tabConfig = useMemo(
    () => (canViewReports ? [...BASE_TAB_CONFIG, REPORT_TAB, REQUEST_REPORT_TAB] : BASE_TAB_CONFIG),
    [canViewReports]
  )
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

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Stock overview, requests, issued assets, replenishment logs, and reports"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabConfig} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && <ItemsTab userRole={user?.role} />}
      {active === 'requests' && <RequestsTab userRole={user?.role} />}
      {active === 'issues' && <IssuesTab userRole={user?.role} />}
      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}
      {active === 'report' && canViewReports && <ReportTab />}
      {active === 'request-report' && canViewReports && <RequestsReportTab />}
    </AdminLayout>
  )
}
