import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Spinner, Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import ManagerTab from './ManagerTab'
import OverviewTab from './OverviewTab'
import SupervisorsTab from './SupervisorsTab'
import WorkersTab from './WorkersTab'
import ZonesTab from './ZonesTab'

const WorkerSelectionTab = lazy(() => import('./WorkerSelectionTab'))
const ScheduleTab = lazy(() => import('./ScheduleTab'))
const GalleryTab = lazy(() => import('./GalleryTab'))

const tabFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
    <Spinner />
  </div>
)

export default function HorticulturePage() {
  const { isHorticultureManager } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => {
      const base = [
        { key: 'overview', label: 'Overview' },
        { key: 'zones', label: 'Sections + Staff' },
        { key: 'supervisors', label: 'Supervisors' },
        { key: 'attendance', label: 'Worker Attendance' },
        { key: 'workers', label: 'Workers' },
        { key: 'worker_selection', label: 'Task Assign' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'gallery', label: 'Gallery' },
      ]
      if (isHorticultureManager) {
        base.push({ key: 'manager', label: 'Manager' })
      }
      return base
    },
    [isHorticultureManager]
  )

  const validTabs = useMemo(() => tabs.map((tab) => tab.key), [tabs])
  const mapLegacyTab = (tab) => {
    if (tab === 'zone-detail') return 'zones'
    if (tab === 'attendance') return 'attendance'
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
  }, [searchParams])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <AdminLayout
      title="Horticulture Administration"
      subtitle="Zone health, task compliance, supervisor attendance, and horticulture oversight"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabs} active={active} onChange={onTabChange} />
      </div>

      {active === 'overview' && <OverviewTab />}
      {active === 'zones' && <ZonesTab />}
      {active === 'attendance' && <AttendanceTab />}
      {active === 'supervisors' && <SupervisorsTab />}
      {active === 'workers' && <WorkersTab />}
      {active === 'worker_selection' && (
        <Suspense fallback={tabFallback}>
          <WorkerSelectionTab />
        </Suspense>
      )}
      {active === 'schedule' && (
        <Suspense fallback={tabFallback}>
          <ScheduleTab />
        </Suspense>
      )}
      {active === 'gallery' && (
        <Suspense fallback={tabFallback}>
          <GalleryTab />
        </Suspense>
      )}
      {active === 'manager' && isHorticultureManager && <ManagerTab />}
    </AdminLayout>
  )
}
