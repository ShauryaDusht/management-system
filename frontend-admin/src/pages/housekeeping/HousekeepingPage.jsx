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
import AssignInventoryTab from './AssignInventoryTab'

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
  const isHostelOffice = user?.role === 'hostel_office' || user?.actual_role === 'hostel_office' || user?.username === 'hostel.office'

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
      if (['admin', 'housekeeping_manager', 'hk_inventory_manager', 'hostel_office'].includes(user?.role)) {
        base.push({ key: 'schedule', label: 'Schedule' })
        base.push({
          key: 'incharge_approvals',
          label: 'Incharge Approvals',
          count: !isHostelOffice && badges.housekeeping > 0 ? badges.housekeeping : null,
          countTone: 'red',
        })
      }
      if (['admin', 'hk_inventory_manager', 'hostel_office'].includes(user?.role)) {
        base.push({ key: 'stock', label: 'Stock Requests' })
      }
      if (['admin', 'hk_inventory_manager', 'hostel_office'].includes(user?.role)) {
        base.push({ key: 'gallery', label: 'Gallery' })
      }
      return base
    },
    [badges.housekeeping, isHostelOffice, user?.role]
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
      title={isHostelOffice ? 'Hostel Office' : 'Housekeeping Administration'}
      subtitle={isHostelOffice ? 'Hostel areas, supervisors, workers, attendance, schedule, and stock requests' : 'Tasks, sections, staff directory, attendance, and inventory assignment'}
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabs} active={active} onChange={onTabChange} />
      </div>

      {active === 'overview' && <OverviewTab readOnly={false} hostelOnly={isHostelOffice} />}
      {active === 'directory' && <SectionsTab hostelOnly={isHostelOffice} />}
      {active === 'supervisors' && <SupervisorsTab hostelOnly={isHostelOffice} />}
      {active === 'attendance' && (
        <Suspense fallback={tabFallback}>
          <AttendanceTab hostelOnly={isHostelOffice} />
        </Suspense>
      )}
      {active === 'staff_attendance' && (
        <Suspense fallback={tabFallback}>
          <StaffAttendanceTab />
        </Suspense>
      )}
      {active === 'workers' && <WorkersTab readOnly={isHostelOffice} hostelOnly={isHostelOffice} />}
      {active === 'schedule' && (
        <Suspense fallback={tabFallback}>
          <ScheduleTab readOnly={isHostelOffice} hostelOnly={isHostelOffice} />
        </Suspense>
      )}
      {active === 'stock' && <AssignInventoryTab userRole={user?.role} readOnly={isHostelOffice} />}
      {active === 'incharge_approvals' && (
        <Suspense fallback={tabFallback}>
          <InchargeApprovalsTab readOnly={isHostelOffice} />
        </Suspense>
      )}
      {active === 'gallery' && (
        <Suspense fallback={tabFallback}>
          <GalleryTab readOnly={isHostelOffice} />
        </Suspense>
      )}
    </AdminLayout>
  )
}
