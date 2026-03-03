import { useMemo, useState } from 'react'

import { useAuth } from '../../context/AuthContext'
import { Btn, Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import AssignInventoryTab from './AssignInventoryTab'
import CaretakersTab from './CaretakersTab'
import OverviewTab from './OverviewTab'
import SectionsTab from './SectionsTab'
import WorkersTab from './WorkersTab'

export default function HousekeepingPage() {
  const { user } = useAuth()
  const [active, setActive] = useState('overview')

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

  return (
    <AdminLayout
      title="Housekeeping Administration"
      subtitle="Tasks, sections, caretakers, attendance, and inventory assignment"
      actions={
        <>
          <Btn
            variant="secondary"
            onClick={() => window.alert('Weekly report export is available in this module overview.')}
          >
            Generate Weekly Report
          </Btn>
          <Btn
            variant="orange"
            onClick={() => window.alert('Monthly report export is available in this module overview.')}
          >
            Generate Monthly Report
          </Btn>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabs} active={active} onChange={setActive} />
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
