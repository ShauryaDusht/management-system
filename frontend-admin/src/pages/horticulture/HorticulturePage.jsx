import { useState } from 'react'

import { Btn, Tabs } from '../../components/ui'
import AdminLayout from '../../layout/AdminLayout'
import AttendanceTab from './AttendanceTab'
import SupervisorsTab from './SupervisorsTab'
import WorkersTab from './WorkersTab'
import ZonesTab from './ZonesTab'

const TAB_CONFIG = [
  { key: 'zones', label: 'Zone List', icon: 'ZN' },
  { key: 'supervisors', label: 'Supervisor List', icon: 'SP' },
  { key: 'attendance', label: 'Worker Attendance', icon: 'AT' },
  { key: 'inventory', label: 'Assigned Inventory', icon: 'IV' },
]

export default function HorticulturePage() {
  const [active, setActive] = useState('zones')

  return (
    <AdminLayout
      title="Horticulture"
      subtitle="Zone operations dashboard (module under development)"
      actions={
        <>
          <Btn variant="secondary" onClick={() => window.alert('Weekly report export is under development.')}>
            Generate Weekly Report
          </Btn>
          <Btn variant="orange" onClick={() => window.alert('Monthly report export is under development.')}>
            Generate Monthly Report
          </Btn>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={TAB_CONFIG} active={active} onChange={setActive} />
      </div>

      {active === 'zones' && <ZonesTab />}
      {active === 'supervisors' && <SupervisorsTab />}
      {active === 'attendance' && <AttendanceTab />}
      {active === 'inventory' && <WorkersTab />}
    </AdminLayout>
  )
}
