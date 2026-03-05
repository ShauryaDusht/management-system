import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import AssignInventoryTab from './AssignInventoryTab'
import CaretakersTab from './CaretakersTab'
import OverviewTab from './OverviewTab'
import SectionsTab from './SectionsTab'
import WorkersTab from './WorkersTab'

export default function HousekeepingPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => [
      { key: 'overview', label: 'Overview', icon: 'HK' },
      { key: 'sections', label: 'Sections / Areas', icon: 'AR' },
      { key: 'caretakers', label: 'Caretakers', icon: 'CT' },
      { key: 'workers', label: 'Workers', icon: 'WK' },
      { key: 'attendance', label: 'Attendance', icon: 'AT' },
      { key: 'assign_stock', label: 'Assign Inventory', icon: 'ST' },
    ],
    []
  )

  const validTabs = useMemo(() => tabs.map((t) => t.key), [tabs])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview'
  )

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
      title="Housekeeping Administration"
      subtitle="Tasks, sections, caretakers, attendance, and inventory assignment"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabs} active={active} onChange={onTabChange} />
      </div>

      {active === 'overview' && <OverviewTab />}
      {active === 'sections' && <SectionsTab />}
      {active === 'caretakers' && <CaretakersTab />}
      {active === 'workers' && <WorkersTab />}
      {active === 'attendance' && <AttendanceTab />}
      {active === 'assign_stock' && <AssignInventoryTab userRole={user?.role} />}
    </AdminLayout>
  )
}
