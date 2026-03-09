import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import AssignInventoryTab from './AssignInventoryTab'
import OverviewTab from './OverviewTab'
import SectionsTab from './SectionsTab'
import WorkersTab from './WorkersTab'
import WorkerSelectionTab from './WorkerSelectionTab'

export default function HousekeepingPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => [
      { key: 'overview', label: 'Overview', icon: 'HK' },
      { key: 'directory', label: 'Sections + Staff', icon: 'AR/CT' },
      { key: 'assign_stock', label: 'Assign Inventory', icon: 'ST' },
      { key: 'attendance', label: 'Attendance', icon: 'AT' },
      { key: 'workers', label: 'Workers', icon: 'WK' },
      { key: 'worker_selection', label: 'Worker Selection', icon: 'WS' },
    ],
    []
  )

  const validTabs = useMemo(() => tabs.map((t) => t.key), [tabs])
  const mapLegacyTab = (tab) => {
    if (tab === 'sections' || tab === 'caretakers') return 'directory'
    if (tab === 'worker-selection') return 'worker_selection'
    return tab
  }
  const initialTab = mapLegacyTab(searchParams.get('tab'))
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview'
  )

  useEffect(() => {
    const tab = mapLegacyTab(searchParams.get('tab'))
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
      title="Housekeeping Administration"
      subtitle="Tasks, sections, staff directory, attendance, and inventory assignment"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabs} active={active} onChange={onTabChange} />
      </div>

      {active === 'overview' && <OverviewTab />}
      {active === 'directory' && <SectionsTab />}
      {active === 'assign_stock' && <AssignInventoryTab userRole={user?.role} />}
      {active === 'attendance' && <AttendanceTab />}
      {active === 'workers' && <WorkersTab />}
      {active === 'worker_selection' && <WorkerSelectionTab />}
    </AdminLayout>
  )
}
