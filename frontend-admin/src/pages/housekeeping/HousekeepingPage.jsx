import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { Spinner, Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import OverviewTab from './OverviewTab'
import SectionsTab from './SectionsTab'
import SupervisorsTab from './SupervisorsTab'
import WorkersTab from './WorkersTab'

const AttendanceTab = lazy(() => import('./AttendanceTab'))
const StaffAttendanceTab = lazy(() => import('./StaffAttendanceTab'))
const InchargeApprovalsTab = lazy(() => import('./InchargeApprovalsTab'))
const GalleryTab = lazy(() => import('./GalleryTab'))
const ScheduleTab = lazy(() => import('./ScheduleTab'))

const tabFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
    <Spinner />
  </div>
)

export default function HousekeepingPage() {
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => {
      const base = [
        { key: 'overview', label: 'Overview' },
        { key: 'directory', label: 'Sections + Staff' },
        { key: 'supervisors', label: 'Supervisors' },
        { key: 'attendance', label: 'Worker Attendance' },
        { key: 'staff_attendance', label: 'Staff Attendance' },
        { key: 'workers', label: 'Workers' },
      ]
      if (['admin', 'housekeeping_manager', 'hk_inventory_manager'].includes(user?.role)) {
        base.push({ key: 'schedule', label: 'Schedule' })
        base.push({
          key: 'incharge_approvals',
          label: 'Incharge Approvals',
          count: badges.housekeeping > 0 ? badges.housekeeping : null,
          countTone: 'red',
        })
      }
      if (['admin', 'hk_inventory_manager'].includes(user?.role)) {
        base.push({ key: 'gallery', label: 'Gallery' })
      }
      return base
    },
    [badges.housekeeping, user?.role]
  )

  const validTabs = useMemo(() => tabs.map((t) => t.key), [tabs])
  const mapLegacyTab = (tab) => {
    if (tab === 'sections' || tab === 'caretakers') return 'directory'
    if (tab === 'worker-selection' || tab === 'worker_selection') return 'workers'
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

  useEffect(() => {
    if (active === 'incharge_approvals' && badges.housekeeping > 0) {
      markSeen('housekeeping')
    }
  }, [active, badges.housekeeping, markSeen])

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
      {active === 'supervisors' && <SupervisorsTab />}
      {active === 'attendance' && (
        <Suspense fallback={tabFallback}>
          <AttendanceTab />
        </Suspense>
      )}
      {active === 'staff_attendance' && (
        <Suspense fallback={tabFallback}>
          <StaffAttendanceTab />
        </Suspense>
      )}
      {active === 'workers' && <WorkersTab />}
      {active === 'schedule' && (
        <Suspense fallback={tabFallback}>
          <ScheduleTab />
        </Suspense>
      )}
      {active === 'incharge_approvals' && (
        <Suspense fallback={tabFallback}>
          <InchargeApprovalsTab />
        </Suspense>
      )}
      {active === 'gallery' && (
        <Suspense fallback={tabFallback}>
          <GalleryTab />
        </Suspense>
      )}
    </AdminLayout>
  )
}
