import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../../layout/AdminLayout'
import { Tabs, Spinner, Card } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import WtpApi from '../../modules/wtp/WtpApi'
import { mergeReadings } from '../../modules/wtp/lib/calc'

// WTP / STP Components
import StationForm from '../../modules/wtp/components/StationForm'
import BlockForm from '../../modules/wtp/components/BlockForm'
import MeterReport from '../../modules/wtp/components/MeterReport'
import JalmandapamReport from '../../modules/wtp/components/JalmandapamReport'
import ChemReport from '../../modules/wtp/components/ChemReport'
import BlockReport from '../../modules/wtp/components/BlockReport'
import MeterManager from '../../modules/wtp/components/MeterManager'
import GwssbReport from '../../modules/wtp/components/GwssbReport'
import OperatorsManagerTab from '../../components/OperatorsManagerTab'

import '../../modules/wtp/wtp.css'

export default function WtpPage() {
  const { user: authUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const isOperator = authUser?.role === 'wtp_operator' || authUser?.role === 'operator'
  const isSupervisor = authUser?.role === 'wtp_supervisor' || authUser?.role === 'plant_engineer'
  const isAdmin = !isOperator && !isSupervisor

  const user = useMemo(() => ({
    role: isOperator ? 'operator' : isSupervisor ? 'supervisor' : 'admin',
    name: authUser?.get_full_name || authUser?.username || (
      isOperator ? 'Plant Operator' : isSupervisor ? 'Shift Engineer' : 'Administrator'
    ),
  }), [authUser, isOperator, isSupervisor])

  // Strict role-based tabs
  const availableTabs = useMemo(() => {
    if (isOperator) {
      return [
        { key: 'enter', label: 'Operator Log Entry', icon: '📝' },
      ]
    }
    if (isSupervisor) {
      return [
        { key: 'meters', label: 'Meter Readings', icon: '💧' },
        { key: 'enter', label: 'Edit', icon: '✏️' },
        { key: 'gwssb', label: 'GWSSB Bill', icon: '💰' },
        { key: 'jm', label: 'Jalmandapam Tanks', icon: '🚰' },
        { key: 'chem', label: 'Chlorination & Alum', icon: '🧪' },
        { key: 'blocks', label: 'Block Meters', icon: '🏢' },
        { key: 'operators', label: 'Operators (Add / Remove)', icon: '👥' },
      ]
    }
    // Admin (no Edit option, Engineer section only)
    return [
      { key: 'meters', label: 'Meter Readings', icon: '💧' },
      { key: 'jm', label: 'Jalmandapam Tanks', icon: '🚰' },
      { key: 'chem', label: 'Chlorination & Alum', icon: '🧪' },
      { key: 'blocks', label: 'Block Meters', icon: '🏢' },
      { key: 'manage', label: 'Add / Manage Meters', icon: '⚙️' },
      { key: 'operators', label: 'Operators (Add / Remove)', icon: '👥' },
    ]
  }, [isOperator, isSupervisor, isAdmin])

  const initialTab = searchParams.get('tab') || availableTabs[0].key
  const [activeTab, setActiveTab] = useState(
    availableTabs.some((t) => t.key === initialTab) ? initialTab : availableTabs[0].key
  )

  useEffect(() => {
    if (!availableTabs.some((t) => t.key === activeTab)) {
      const fallback = availableTabs[0].key
      setActiveTab(fallback)
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev)
        copy.set('tab', fallback)
        return copy
      })
    }
  }, [availableTabs, activeTab, setSearchParams])

  // Mode for operator tab ('station' or 'block')
  const [operatorMode, setOperatorMode] = useState('station')

  // Data state
  const [readings, setReadings] = useState([])
  const [blockMeters, setBlockMeters] = useState([])
  const [blockDocs, setBlockDocs] = useState([])
  const [stationMeters, setStationMeters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [r, bm, bd, sm] = await Promise.all([
        WtpApi.readings(),
        WtpApi.blockMeters(),
        WtpApi.blockReadings(),
        WtpApi.stationMeters().catch(() => []),
      ])
      setReadings(Array.isArray(r) ? r : [])
      setBlockMeters(Array.isArray(bm) ? bm : [])
      setBlockDocs(Array.isArray(bd) ? bd : [])
      setStationMeters(Array.isArray(sm) ? sm : [])
      setError(null)
    } catch (err) {
      console.warn('WTP data load error:', err)
      setError(err.message || 'Failed to load water monitoring data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const rows = useMemo(() => mergeReadings(readings), [readings])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev)
      copy.set('tab', key)
      return copy
    })
  }

  return (
    <AdminLayout
      title="WTP / STP Meter Readings"
      subtitle={
        isOperator
          ? 'Plant Operator Shift Log • Record incoming Narmada water, Jalmandapam levels, treated output, and block meters'
          : isSupervisor
          ? 'Shift Engineer Oversight • Real-time tank capacity tracking, water quality monitoring, and verification audit'
          : 'Campus Water Management • WTP, STP, WSC-I/II/III, Jalmandapam storage, chemical logs, and 84 block meters'
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

        {loading ? (
          <Card style={{ padding: 50, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Spinner size={24} />
              <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 600 }}>
                Loading Water Monitoring Telemetry & Readings...
              </span>
            </div>
          </Card>
        ) : (
          <div className="wtp-theme-wrapper" style={{ borderRadius: 12 }}>
            {error && (
              <div className="msg err" style={{ marginBottom: 14 }}>
                {error}
              </div>
            )}

            {/* 1. Shift Entry & Readings Edit (Engineer / Operator only) */}
            {activeTab === 'enter' && (isSupervisor || isOperator) && (
              <div>
                <div className="seg" style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className={operatorMode === 'station' ? 'on' : ''}
                    onClick={() => setOperatorMode('station')}
                  >
                    Station & Shift Readings
                  </button>
                  <button
                    type="button"
                    className={operatorMode === 'block' ? 'on' : ''}
                    onClick={() => setOperatorMode('block')}
                  >
                    Monthly Block Meters (84 Meters)
                  </button>
                </div>

                {operatorMode === 'station' ? (
                  <StationForm
                    rows={rows}
                    user={user}
                    onSaved={loadData}
                    stationMeters={stationMeters}
                  />
                ) : (
                  <BlockForm
                    blockMeters={blockMeters}
                    blockDocs={blockDocs}
                    user={user}
                    onSaved={loadData}
                  />
                )}
              </div>
            )}

            {/* Meter Readings Report */}
            {activeTab === 'meters' && !isOperator && (
              <MeterReport
                rows={rows}
                stationMeters={stationMeters}
                user={user}
                onReload={loadData}
                onNavigateToEdit={isSupervisor ? () => handleTabChange('enter') : null}
              />
            )}


            {/* GWSSB Monthly Water Bill (Supervisor only - hidden from Admin) */}
            {activeTab === 'gwssb' && isSupervisor && (
              <GwssbReport
                user={user}
              />
            )}

            {/* 4. Jalmandapam Tanks Report */}
            {activeTab === 'jm' && !isOperator && (
              <JalmandapamReport
                rows={rows}
              />
            )}

            {/* 5. Chlorination & Alum Report */}
            {activeTab === 'chem' && (
              <ChemReport
                rows={rows}
              />
            )}

            {/* 6. Block Meters Report */}
            {activeTab === 'blocks' && (
              <BlockReport
                meters={blockMeters}
                docs={blockDocs}
              />
            )}

            {/* 7. Add / Manage Meters (Admin only) */}
            {activeTab === 'manage' && (
              <MeterManager
                blockMeters={blockMeters}
                stationMeters={stationMeters}
                reload={loadData}
              />
            )}

            {/* 8. WTP/STP Operators Management (Supervisor & Admin) */}
            {activeTab === 'operators' && (isSupervisor || isAdmin) && (
              <OperatorsManagerTab
                department="wtp"
                operatorRole="wtp_operator"
                departmentName="WTP / STP Plant"
                accentColor="#059669"
              />
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
