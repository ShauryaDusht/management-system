import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import ManagerTab from './ManagerTab'
import OverviewTab from './OverviewTab'
import SupervisorsTab from './SupervisorsTab'
import ZonesTab from './ZonesTab'

export default function HorticulturePage() {
  const { isHorticultureManager } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => {
      const base = [
        { key: 'overview', label: 'Overview' },
        { key: 'zones', label: 'Zone Detail' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'supervisors', label: 'Supervisors' },
      ]
      if (isHorticultureManager) {
        base.push({ key: 'manager', label: 'Manager' })
      }
      return base
    },
    [isHorticultureManager]
  )

  const validTabs = useMemo(() => tabs.map((tab) => tab.key), [tabs])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview'
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
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
      {active === 'manager' && isHorticultureManager && <ManagerTab />}
    </AdminLayout>
  )
}
