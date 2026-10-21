import React, { useState, useEffect } from 'react'
import AdminLayout from '../../layout/AdminLayout'
import { Badge, Btn, Card, Modal, Spinner, StatCard, Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import estateApi from '../../api/estate'
import ShopsTab from './ShopsTab'
import ElectricityTab from './ElectricityTab'
import HousingTab from './HousingTab'
import HousingStatusTab from './HousingStatusTab'
import ShopEditorModal from './ShopEditorModal'
import ElectricityEditorModal from './ElectricityEditorModal'
import SettingsModal from './SettingsModal'
import { calcNote, calcMeters, inr0 } from './utils'

export default function EstatePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.is_superuser
  const isCivil = user?.role === 'civil_team'
  const isElectrical = user?.role === 'electrical_team'
  const isHK = user?.role === 'hk_inventory_manager' || user?.role === 'supervisor' || user?.role === 'caretaker'
  const isDeptUser = isCivil || isElectrical || isHK

  const [adminEditEnabled, setAdminEditEnabled] = useState(true)
  const isReadOnly = isAdmin ? !adminEditEnabled : (user?.role !== 'estate_office')

  const defaultTab = isDeptUser || isHK ? 'housing_status' : 'shops'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [shops, setShops] = useState([])
  const [contractors, setContractors] = useState([])
  const [housingRecords, setHousingRecords] = useState([])
  const [housingUnits, setHousingUnits] = useState([])
  const [totalHousingUnits, setTotalHousingUnits] = useState(0)
  const [occupiedHousingCount, setOccupiedHousingCount] = useState(0)
  const [settings, setSettings] = useState({})

  // Modals state
  const [editorShopId, setEditorShopId] = useState(null)
  const [editorContractorId, setEditorContractorId] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isNewCycleOpen, setIsNewCycleOpen] = useState(false)
  const [newCycleMonth, setNewCycleMonth] = useState('')

  // Load initial cycles & settings
  useEffect(() => {
    loadInitialData()
  }, [])

  // Load shops and contractors whenever selectedCycle changes
  useEffect(() => {
    if (selectedCycle) {
      loadCycleData(selectedCycle)
    }
  }, [selectedCycle])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const [cyclesRes, settingsRes] = await Promise.all([
        estateApi.getCycles(),
        estateApi.getSettings(),
      ])
      const cycleList = cyclesRes.data || []
      setCycles(cycleList)
      setSettings(settingsRes.data || {})

      const initialCycle = cycleList.length > 0 ? cycleList[0].month : new Date().toISOString().slice(0, 7)
      setSelectedCycle(initialCycle)
      loadHousingData()
    } catch (err) {
      console.error('Failed to load estate initial data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCycleData = async (cycle) => {
    try {
      const [shopsRes, contractorsRes] = await Promise.all([
        estateApi.getShops(cycle),
        estateApi.getContractors(cycle),
      ])
      setShops(shopsRes.data || [])
      setContractors(contractorsRes.data || [])
    } catch (err) {
      console.error('Failed to load cycle data:', err)
    }
  }

  // Shop handlers
  const handlePatchShop = async (id, data) => {
    setShops((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)))
    try {
      const res = await estateApi.patchShop(id, data)
      setShops((prev) => prev.map((s) => (s.id === id ? res.data : s)))
    } catch (err) {
      console.error('Failed to patch shop:', err)
      loadCycleData(selectedCycle)
    }
  }

  const handlePatchAllShops = async (data) => {
    setShops((prev) =>
      prev.map((s) => ({
        ...s,
        ...data,
        ...(data.monthTo !== undefined ? { monthTo: data.monthTo, month_to: data.monthTo } : {}),
      }))
    )
    try {
      await estateApi.patchAllShops(data, selectedCycle)
      loadCycleData(selectedCycle)
    } catch (err) {
      console.error('Failed to patch all shops:', err)
      loadCycleData(selectedCycle)
    }
  }

  const handleCreateShop = async (data) => {
    try {
      const res = await estateApi.createShop(data, selectedCycle)
      setShops((prev) => [...prev, res.data])
      loadCycleData(selectedCycle)
    } catch (err) {
      console.error('Failed to create shop:', err)
      throw err
    }
  }

  const handleDeleteShop = async (id) => {
    try {
      await estateApi.deleteShop(id)
      setShops((prev) => prev.filter((s) => s.id !== id))
      setEditorShopId(null)
    } catch (err) {
      console.error('Failed to delete shop:', err)
      alert('Could not delete shop.')
    }
  }

  // Contractor handlers
  const handlePatchContractor = async (id, data) => {
    setContractors((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)))
    try {
      const res = await estateApi.patchContractor(id, data)
      setContractors((prev) => prev.map((c) => (c.id === id ? res.data : c)))
    } catch (err) {
      console.error('Failed to patch contractor:', err)
      loadCycleData(selectedCycle)
    }
  }

  const handlePatchAllContractors = async (data) => {
    setContractors((prev) =>
      prev.map((c) => ({
        ...c,
        ...data,
        ...(data.monthTo !== undefined ? { monthTo: data.monthTo, month_to: data.monthTo } : {}),
      }))
    )
    try {
      await estateApi.patchAllContractors(data, selectedCycle)
      loadCycleData(selectedCycle)
    } catch (err) {
      console.error('Failed to patch all contractors:', err)
      loadCycleData(selectedCycle)
    }
  }

  const handleCreateContractor = async (data) => {
    try {
      const res = await estateApi.createContractor(data, selectedCycle)
      setContractors((prev) => [...prev, res.data])
      loadCycleData(selectedCycle)
    } catch (err) {
      console.error('Failed to create contractor:', err)
      throw err
    }
  }

  const handleDeleteContractor = async (id) => {
    try {
      await estateApi.deleteContractor(id)
      setContractors((prev) => prev.filter((c) => c.id !== id))
      setEditorContractorId(null)
    } catch (err) {
      console.error('Failed to delete contractor:', err)
      alert('Could not delete contractor.')
    }
  }

  // Housing handlers
  const loadHousingData = async () => {
    try {
      const [allotRes, unitsRes] = await Promise.all([
        estateApi.getHousing({ include_vacated: true }),
        estateApi.getHousingUnits(),
      ])
      const records = allotRes.data || []
      const uList = unitsRes.data || []
      setHousingRecords(records)
      setHousingUnits(uList)
      setTotalHousingUnits(uList.length || 0)
      const occCount = uList.filter((u) => u.status === 'occupied').length
      setOccupiedHousingCount(occCount)
    } catch (err) {
      console.error('Failed to load housing data:', err)
    }
  }

  const handleCreateHousing = async (data) => {
    try {
      const res = await estateApi.createHousing(data)
      setHousingRecords((prev) => [...prev, res.data])
      return res.data
    } catch (err) {
      console.error('Failed to create housing allotment:', err)
      throw err
    }
  }

  const handlePatchHousing = async (id, data) => {
    setHousingRecords((prev) => prev.map((h) => (h.id === id ? { ...h, ...data } : h)))
    try {
      const res = await estateApi.patchHousing(id, data)
      setHousingRecords((prev) => prev.map((h) => (h.id === id ? res.data : h)))
    } catch (err) {
      console.error('Failed to patch housing allotment:', err)
      loadHousingData()
    }
  }

  const handleDeleteHousing = async (id) => {
    setHousingRecords((prev) => prev.filter((h) => h.id !== id))
    try {
      await estateApi.deleteHousing(id)
    } catch (err) {
      console.error('Failed to delete housing allotment:', err)
      loadHousingData()
    }
  }

  // Settings update
  const handleSaveSettings = async (data) => {
    const res = await estateApi.updateSettings(data)
    setSettings(res.data)
  }

  // Cycle creation
  const handleCreateCycle = async (e) => {
    e.preventDefault()
    if (!newCycleMonth || newCycleMonth.length !== 7) return
    try {
      const res = await estateApi.createCycle(newCycleMonth, newCycleMonth)
      setCycles((prev) => [res.data, ...prev.filter((c) => c.month !== newCycleMonth)])
      setSelectedCycle(newCycleMonth)
      setIsNewCycleOpen(false)
      setNewCycleMonth('')
    } catch (err) {
      alert('Could not create cycle.')
    }
  }

  // Shop editor indices
  const currentShopIdx = shops.findIndex((s) => s.id === editorShopId)
  const currentContractorIdx = contractors.findIndex((c) => c.id === editorContractorId)

  // Executive overview metrics calculation
  const totalShops = shops.length
  const billedShops = shops.filter((s) => s.fixed || String(s.units || '').trim() !== '').length
  const shopsTotalAmount = shops.reduce((sum, s) => sum + calcNote(s).total, 0)

  const totalContractors = contractors.length
  const contractorsReady = contractors.filter((c) => calcMeters(c.meters).complete).length
  const contractorsTotalAmount = contractors.reduce(
    (sum, c) => sum + (calcMeters(c.meters).complete ? calcMeters(c.meters).total : 0),
    0
  )

  const grandTotal = shopsTotalAmount + contractorsTotalAmount

  let pageTitle = user?.role === 'estate_office' ? 'Estate Dashboard' : 'Estate Administration'
  let pageSubtitle = 'Demand notes for commercial campus shops and contractor electricity charges'

  if (isCivil) {
    pageTitle = 'Estate Clearances — Civil Team'
    pageSubtitle = 'Inspect campus quarters, update civil repairs & maintenance, and submit clearance approvals.'
  } else if (isElectrical) {
    pageTitle = 'Estate Clearances — Electrical Team'
    pageSubtitle = 'Inspect campus quarters, update electrical works, and submit clearance approvals.'
  } else if (isHK) {
    pageTitle = 'Estate Clearances — Housekeeping'
    pageSubtitle = 'Manage key handover, cleaning progress, and final handover clearance.'
  }

  const tabsList = isCivil
    ? [{ key: 'housing_status', label: 'Civil Clearances' }]
    : isElectrical
      ? [{ key: 'housing_status', label: 'Electrical Clearances' }]
      : isHK
        ? [{ key: 'housing_status', label: 'Housekeeping Clearances' }]
        : [
          { key: 'shops', label: 'Commercial Shops', count: shops.length },
          { key: 'electricity', label: 'Power Contractors', count: contractors.length },
          { key: 'housing', label: 'Staff Housing', count: totalHousingUnits || housingRecords.length },
          { key: 'housing_status', label: 'Housing Status' },
        ]

  return (
    <AdminLayout
      title={pageTitle}
      subtitle={pageSubtitle}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Cycle Selector - only for general billing admin */}
          {!isDeptUser && activeTab !== 'housing' && activeTab !== 'housing_status' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--surface)',
                padding: '6px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>Billing Month:</span>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--green-900)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {cycles.map((c) => (
                  <option key={c.month} value={c.month}>
                    {c.label || c.month}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && (
            <Btn
              size="sm"
              variant={adminEditEnabled ? 'secondary' : 'primary'}
              onClick={() => setAdminEditEnabled((prev) => !prev)}
            >
              {adminEditEnabled ? 'View-Only' : 'Edit'}
            </Btn>
          )}

          {!isDeptUser && (activeTab === 'shops' || activeTab === 'electricity') && (
            <>
              {!isReadOnly && (
                <Btn size="sm" variant="ghost" onClick={() => setIsNewCycleOpen(true)}>
                  + New Month Cycle
                </Btn>
              )}
              <Btn size="sm" variant="ghost" onClick={() => setIsSettingsOpen(true)}>
                Settings
              </Btn>
            </>
          )}
        </div>

      }
    >
      <div style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
        {/* Overview Stat Cards - only show for admin / estate office */}
        {!isDeptUser && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatCard
              label="Commercial Shops"
              value={totalShops}
              icon="estate"
              color="var(--green-800)"
              sub={`${billedShops} of ${totalShops} billed`}
              onClick={() => setActiveTab('shops')}
              style={{ cursor: 'pointer' }}
            />
            <StatCard
              label="Power Contractors"
              value={totalContractors}
              icon="workers"
              color="var(--green-700)"
              sub={`${contractorsReady} of ${totalContractors} ready`}
              onClick={() => setActiveTab('electricity')}
              style={{ cursor: 'pointer' }}
            />
            <StatCard
              label="Staff Housing"
              value={totalHousingUnits || 435}
              icon="home"
              color="var(--green-800)"
              sub={`${occupiedHousingCount || 13} occupied · ${(totalHousingUnits || 435) - (occupiedHousingCount || 13)} vacant`}
              onClick={() => setActiveTab('housing')}
              style={{ cursor: 'pointer' }}
            />
            <StatCard
              label="Cycle Total Recovery"
              value={`₹ ${inr0(grandTotal)}`}
              icon="value"
              color="var(--orange-600)"
              sub="Combined estimated demand"
            />
            <StatCard
              label="Active Period"
              value={selectedCycle || '—'}
              icon="dashboard"
              color="var(--green-800)"
              sub="Current billing cycle"
            />
          </div>
        )}

        {/* Navigation Tabs - only shown when there are multiple tabs (Admin / Estate Office) */}
        {!isDeptUser && (
          <div style={{ marginBottom: 16 }}>
            <Tabs
              tabs={tabsList}
              active={activeTab}
              onChange={setActiveTab}
            />
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
            <Spinner />
          </div>
        ) : (
          <>
            {activeTab === 'shops' && (
              <ShopsTab
                records={shops}
                onPatch={handlePatchShop}
                onPatchAll={handlePatchAllShops}
                onCreate={handleCreateShop}
                onOpenEditor={setEditorShopId}
                cycleMonth={selectedCycle}
                settings={settings}
                onUpdateSettings={handleSaveSettings}
                isReadOnly={isReadOnly}
              />
            )}

            {activeTab === 'electricity' && (
              <ElectricityTab
                records={contractors}
                onPatch={handlePatchContractor}
                onPatchAll={handlePatchAllContractors}
                onCreate={handleCreateContractor}
                onOpenEditor={setEditorContractorId}
                cycleMonth={selectedCycle}
                isReadOnly={isReadOnly}
              />
            )}

            {activeTab === 'housing' && (
              <HousingTab
                records={housingRecords}
                initialUnits={housingUnits}
                initialStays={housingRecords}
                onCreate={handleCreateHousing}
                onPatch={handlePatchHousing}
                onDelete={handleDeleteHousing}
                isReadOnly={isReadOnly}
                onReload={loadHousingData}
                onSwitchTab={setActiveTab}
              />
            )}

            {activeTab === 'housing_status' && (
              <HousingStatusTab
                onReloadHousing={loadHousingData}
              />
            )}
          </>
        )}

        {/* Shop Editor Modal */}
        <ShopEditorModal
          isOpen={editorShopId !== null}
          onClose={() => setEditorShopId(null)}
          records={shops}
          currentIndex={currentShopIdx >= 0 ? currentShopIdx : 0}
          onNavigate={(idx) => setEditorShopId(shops[idx]?.id || null)}
          onPatch={handlePatchShop}
          onDelete={handleDeleteShop}
          settings={settings}
          isReadOnly={isReadOnly}
        />

        {/* Electricity Editor Modal */}
        <ElectricityEditorModal
          isOpen={editorContractorId !== null}
          onClose={() => setEditorContractorId(null)}
          records={contractors}
          currentIndex={currentContractorIdx >= 0 ? currentContractorIdx : 0}
          onNavigate={(idx) => setEditorContractorId(contractors[idx]?.id || null)}
          onPatch={handlePatchContractor}
          onDelete={handleDeleteContractor}
          settings={settings}
          isReadOnly={isReadOnly}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />

        {/* New Month Cycle Modal */}
        <Modal
          open={isNewCycleOpen}
          onClose={() => setIsNewCycleOpen(false)}
          title="Start New Month Cycle"
          width={420}
        >
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>
            Create a new billing month (e.g. 2026-11). It will automatically copy active commercial shops and contractors baseline.
          </p>
          <form onSubmit={handleCreateCycle}>
            <input
              type="month"
              required
              value={newCycleMonth}
              onChange={(e) => setNewCycleMonth(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--border)',
                fontSize: 14,
                marginBottom: 16,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setIsNewCycleOpen(false)}>
                Cancel
              </Btn>
              <Btn type="submit" variant="primary">
                Create Cycle
              </Btn>
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  )
}
