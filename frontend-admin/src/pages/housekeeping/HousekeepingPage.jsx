import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import OverviewTab from './OverviewTab'
import SectionsTab from './SectionsTab'
import SupervisorsTab from './SupervisorsTab'
import WorkersTab from './WorkersTab'
import WorkerSelectionTab from './WorkerSelectionTab'
import InchargeApprovalsTab from './InchargeApprovalsTab'
import GalleryTab from './GalleryTab'

export default function HousekeepingPage() {
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => {
      const base = [
        { key: 'overview', label: 'Overview', icon: 'HK' },
        { key: 'directory', label: 'Sections + Staff', icon: 'AR/CT' },
        { key: 'supervisors', label: 'Supervisors', icon: 'SP' },
        { key: 'attendance', label: 'Attendance', icon: 'AT' },
        { key: 'workers', label: 'Workers', icon: 'WK' },
        { key: 'worker_selection', label: 'Worker Selection', icon: 'WS' },
      ]
      if (['admin', 'housekeeping_manager'].includes(user?.role)) {
        base.push({
          key: 'incharge_approvals',
          label: 'Incharge Approvals',
          icon: 'IA',
          count: badges.housekeeping > 0 ? badges.housekeeping : null,
          countTone: 'red',
        })
      }
      if (user?.role === 'admin') {
        base.push({ key: 'gallery', label: 'Gallery', icon: 'GL' })
      }
      return base
    },
    [badges.housekeeping, user?.role]
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
      {active === 'attendance' && <AttendanceTab />}
      {active === 'workers' && <WorkersTab />}
      {active === 'worker_selection' && <WorkerSelectionTab />}
      {active === 'incharge_approvals' && <InchargeApprovalsTab />}
      {active === 'gallery' && <GalleryTab />}
    </AdminLayout>
  )
}
