import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../../layout/AdminLayout'
import { Tabs, Spinner, Card } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import SubstationApi from '../../modules/substation/substationApi'
import { BASE_SHEETS, mkSub } from '../../modules/substation/sheetsData'

// Full Substation Module components
import SupervisorView from '../../modules/substation/SupervisorView'
import OperatorView from '../../modules/substation/OperatorView'
import FlashReportView from '../../modules/substation/FlashReportView'
import ReportsView from '../../modules/substation/ReportsView'
import LayoutManager from '../../modules/substation/LayoutManager'
import SubstationOverviewTab from './SubstationOverviewTab'
import OperatorsManagerTab from '../../components/OperatorsManagerTab'
import TorrentBillReport from '../../modules/substation/TorrentBillReport'
import '../../modules/substation/substation.css'

export default function SubstationPage() {
  const { user: authUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // 1. Role determination:
  // - electrical_operator: enters readings only
  // - electrical_supervisor: supervisor section, layout, operator entry, overview, flash, reports
  // - admin: campus overview, substations & incomers, flash report, reports & analytics (NO operator or supervisor section)
  const isOperator = authUser?.role === 'electrical_operator' || authUser?.role === 'operator'
  const isSupervisor = authUser?.role === 'electrical_supervisor' || authUser?.role === 'plant_engineer'
  const isAdmin = !isOperator && !isSupervisor

  const user = useMemo(() => ({
    role: isOperator ? 'operator' : isSupervisor ? 'supervisor' : 'admin',
    name: authUser?.get_full_name || authUser?.username || (
      isOperator ? 'Substation Operator' : isSupervisor ? 'Substation Engineer' : 'Admin'
    ),
  }), [authUser, isOperator, isSupervisor])

  // 2. Strict Role-based Tab Access as specified in the project
  const availableTabs = useMemo(() => {
    if (isOperator) {
      // OPERATOR ACCESS: Only enters readings in Operator View
      return [
        { key: 'operator', label: 'Operator Log Entry', icon: '📝' },
      ]
    }
    if (isSupervisor) {
      // SUPERVISOR / ENGINEER ACCESS: Engineer Section, Campus Overview, Flash Report, Reports & Analytics, Operators
      return [
        { key: 'supervisor', label: 'Engineer Section', icon: '🛡️' },
        { key: 'overview', label: 'Campus Overview', icon: '⚡' },
        { key: 'flash', label: 'R-01 Flash Report', icon: '⚡' },
        { key: 'reports', label: 'Reports & Analytics', icon: '📊' },
        { key: 'torrent', label: 'Torrent Bill', icon: '⚡' },
        { key: 'operators', label: 'Operators (Add / Remove)', icon: '👥' },
      ]
    }
    // ADMIN PORTAL
    return [
      { key: 'overview', label: 'Campus Overview', icon: '⚡' },
      { key: 'layout', label: 'Substations & Incomers', icon: '🏢' },
      { key: 'flash', label: 'R-01 Flash Report', icon: '⚡' },
      { key: 'reports', label: 'Reports & Analytics', icon: '📊' },
      { key: 'torrent', label: 'Torrent Bill', icon: '⚡' },
    ]
  }, [isOperator, isSupervisor, isAdmin])

  const initialTab = searchParams.get('tab') || availableTabs[0].key
  const [activeTab, setActiveTab] = useState(
    availableTabs.some((t) => t.key === initialTab) ? initialTab : availableTabs[0].key
  )

  // Ensure active tab is valid for current role
  useEffect(() => {
    if (!availableTabs.some((t) => t.key === activeTab)) {
      setActiveTab(availableTabs[0].key)
    }
  }, [availableTabs, activeTab])

  const [sheets, setSheets] = useState(BASE_SHEETS)
  const [docs, setDocs] = useState([])
  const [layout, setLayout] = useState({})
  const [flashConfig, setFlashConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [layoutSheetId, setLayoutSheetId] = useState('sport_lt')

  // Merge static/server sheets with custom substations from layout
  const allSheets = useMemo(() => {
    const list = [...sheets]
    const custom = (layout.substations || []).filter((x) => !x.removed && x.id !== 'nlib')
    custom.forEach((x) => {
      if (!list.find((s) => s.id === x.id)) {
        list.push(mkSub(x))
      }
    })
    return list
  }, [sheets, layout.substations])

  // Working date and slot for overview navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedSlot, setSelectedSlot] = useState(() => {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 14) return 'R1'
    if (hour >= 14 && hour < 22) return 'R2'
    return 'R3'
  })

  const querySigRef = useRef('')

  // Load sheets, readings, layout, and flash config from backend
  const loadInitialData = async () => {
    try {
      // 1. Fetch sheets from backend API
      const sheetsRes = await SubstationApi.getSheets().catch(() => null)
      if (Array.isArray(sheetsRes) && sheetsRes.length > 0) {
        setSheets(sheetsRes)
      }

      // 2. Fetch layout config
      const layoutRes = await SubstationApi.getDoc('config', 'layout').catch(() => null)
      if (layoutRes && layoutRes.exists && layoutRes.data) {
        setLayout(layoutRes.data)
      }

      // 3. Fetch flash config
      const flashRes = await SubstationApi.getDoc('config', 'flash').catch(() => null)
      if (flashRes && flashRes.exists && flashRes.data) {
        setFlashConfig(flashRes.data)
      }

      // 4. Query readings
      const qRes = await SubstationApi.query(
        'readings',
        [],
        ['date', 'desc'],
        1000,
        querySigRef.current
      ).catch(() => null)

      if (qRes && !qRes.unchanged && Array.isArray(qRes.docs)) {
        querySigRef.current = qRes.sig || ''
        const mapped = qRes.docs.map((d) => ({
          ...d.data,
          _id: d.id,
        }))
        setDocs(mapped)
      }
    } catch (err) {
      console.warn('Substation data loading error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
    const timer = setInterval(() => {
      SubstationApi.query('readings', [], ['date', 'desc'], 1000, querySigRef.current)
        .then((qRes) => {
          if (qRes && !qRes.unchanged && Array.isArray(qRes.docs)) {
            querySigRef.current = qRes.sig || ''
            const mapped = qRes.docs.map((d) => ({
              ...d.data,
              _id: d.id,
            }))
            setDocs(mapped)
          }
        })
        .catch(() => {})
    }, 30000)

    return () => clearInterval(timer)
  }, [])

  // Sync tab with URL search params
  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev)
      copy.set('tab', key)
      return copy
    })
  }

  // Save reading doc handler
  const handleSaveDoc = async (doc) => {
    await SubstationApi.saveDoc('readings', doc._id, doc)
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d._id === doc._id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = doc
        return copy
      }
      return [doc, ...prev]
    })
  }

  // Save layout config handler
  const handleSaveLayout = async (key, items) => {
    const updated = { ...layout, [key]: items }
    await SubstationApi.saveDoc('config', 'layout', updated)
    setLayout(updated)
  }

  // Save flash config handler
  const handleSaveFlashConfig = async (newCfg) => {
    await SubstationApi.saveDoc('config', 'flash', newCfg)
    setFlashConfig(newCfg)
  }

  // Reset flash config handler
  const handleResetFlashConfig = async () => {
    await SubstationApi.saveDoc('config', 'flash', {})
    setFlashConfig({})
  }

  // Navigation handler to open Layout Manager directly for a specific substation
  const handleOpenLayout = (sheetId = null) => {
    if (sheetId) {
      setLayoutSheetId(sheetId)
    }
    handleTabChange('layout')
  }

  // Navigation handler from Overview
  const handleSelectPanelForEntry = (sheetId, date = null, slot = null) => {
    if (date) setSelectedDate(date)
    if (slot) setSelectedSlot(slot)
    if (isAdmin) {
      handleTabChange('reports')
    } else if (isOperator) {
      handleTabChange('operator')
    } else {
      handleTabChange('supervisor')
    }
  }

  return (
    <AdminLayout
      title="Substation Log"
      subtitle={
        isOperator
          ? 'Operator Shift Log Entry • Record hourly and snapshot feeder readings'
          : isSupervisor
          ? 'Supervisor Control & Audit • Multi-shift verification, readings corrections, and layout management'
          : 'Campus Electrical Monitoring • Live power demand, transformer loads, solar telemetry, and audit reports'
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Navigation Tabs Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Tabs
            tabs={availableTabs}
            active={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {/* Tab Content Body */}
        {loading ? (
          <Card style={{ padding: 50, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Spinner size={24} />
              <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 600 }}>
                Loading Substation Telemetry & Logs...
              </span>
            </div>
          </Card>
        ) : (
          <div className="substation-theme-wrapper" style={{ borderRadius: 12 }}>
            {/* 1. Full Supervisor Section (Supervisor role only) */}
            {activeTab === 'supervisor' && isSupervisor && (
              <SupervisorView
                docs={docs}
                layout={layout}
                user={user}
                onSaveDoc={handleSaveDoc}
                onSaveLayout={handleSaveLayout}
              />
            )}

            {/* 2. Full Operator View (Operator role only) */}
            {activeTab === 'operator' && isOperator && (
              <OperatorView
                docs={docs}
                layout={layout}
                user={user}
                onSaveDoc={handleSaveDoc}
              />
            )}

            {/* 3. Campus Overview Matrix */}
            {activeTab === 'overview' && (
              <SubstationOverviewTab
                sheets={allSheets}
                docs={docs}
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
                isAdmin={isAdmin}
                isSupervisor={isSupervisor}
                onDateChange={setSelectedDate}
                onSlotChange={setSelectedSlot}
                onSelectPanelForEntry={handleSelectPanelForEntry}
                onOpenFlash={() => handleTabChange('flash')}
                onOpenLayout={handleOpenLayout}
              />
            )}

            {/* 4. Substation & Incomer Layout Manager (Admin only) */}
            {activeTab === 'layout' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Card style={{ padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🏢</span> Substations & Incomers Configuration
                      </h2>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        Add new Low Tension (LT) substations, register new incoming supply connections, and configure outgoing feeder circuits.
                      </p>
                    </div>
                  </div>
                </Card>

                <LayoutManager
                  layout={layout}
                  onSaveLayout={handleSaveLayout}
                  section="LT"
                  initialSheetId={layoutSheetId}
                  defaultOpen={true}
                />
              </div>
            )}

            {/* 4. R-01 Flash Report View */}
            {activeTab === 'flash' && (
              <FlashReportView
                docs={docs}
                flashConfig={flashConfig}
                onSaveFlashConfig={handleSaveFlashConfig}
                onResetFlashConfig={handleResetFlashConfig}
                onRefresh={loadInitialData}
              />
            )}

            {/* 5. Historical Reports View */}
            {activeTab === 'reports' && (
              <ReportsView
                docs={docs}
                layout={layout}
                user={user}
                onSaveLayout={handleSaveLayout}
                onRefresh={loadInitialData}
              />
            )}

            {/* 6. Torrent Power Electricity Bill Audit (Supervisor & Admin) */}
            {activeTab === 'torrent' && (
              <TorrentBillReport
                user={user}
                authUser={authUser}
                isSupervisor={isSupervisor}
                isAdmin={isAdmin}
              />
            )}

            {/* 7. Substation Operators Management (Supervisor only - removed from Admin) */}
            {activeTab === 'operators' && isSupervisor && (
              <OperatorsManagerTab
                department="electrical"
                operatorRole="electrical_operator"
                departmentName="Substation Electrical"
                accentColor="#0284c7"
              />
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
