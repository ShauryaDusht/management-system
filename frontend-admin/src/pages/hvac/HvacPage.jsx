import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import AdminLayout from '../../layout/AdminLayout';
import { Tabs, Spinner, Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import HvacApi from '../../modules/hvac/hvacApi';

import DailyPlantStatus from '../../modules/hvac/components/DailyPlantStatus';
import FlashReport from '../../modules/hvac/components/FlashReport';
import MonthlyReport from '../../modules/hvac/components/MonthlyReport';
import EditReadingTab from '../../modules/hvac/components/EditReadingTab';
import OperatorsManagerTab from '../../components/OperatorsManagerTab';

import '../../modules/hvac/hvac.css';

export default function HvacPage({ defaultTab }) {
  const { user: authUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isOperator = authUser?.role === 'hvac_operator' || authUser?.role === 'operator';
  const isHvacEngineer = authUser?.role === 'hvac_engineer';
  const isEngineer = isHvacEngineer;
  const isSupervisor = authUser?.role === 'hvac_supervisor';
  const isAdmin = !isOperator && !isSupervisor && !isEngineer;
  const canEdit = isSupervisor || isEngineer || isAdmin || Boolean(authUser?.is_superuser);

  // Tabs:
  // - Operator Access: GIVE ENTRY ONLY
  // - Supervisor / Engineer / Admin Access: Plant Status & Daily Log, Daily Flash Report (R-01), Edit Readings, Monthly Report, Operators
  const availableTabs = useMemo(() => {
    if (isOperator) {
      return [
        { key: 'entry', label: 'Operator Log Entry', icon: '📝' },
      ];
    }
    const tabs = [
      { key: 'daily', label: 'Plant Status & Daily Log', icon: '❄️' },
      { key: 'flash', label: 'Daily Flash Report (R-01)', icon: '⚡' },
    ];
    if (canEdit) {
      tabs.push({ key: 'edit', label: 'Edit Readings', icon: '✏️' });
    }
    tabs.push({ key: 'monthly', label: 'Monthly Report', icon: '📊' });
    if (canEdit) {
      tabs.push({ key: 'operators', label: 'Operators (Add / Remove)', icon: '👥' });
    }
    return tabs;
  }, [isOperator, canEdit]);

  const initialTab = searchParams.get('tab') || defaultTab || availableTabs[0].key;
  const [activeTab, setActiveTab] = useState(
    availableTabs.some((t) => t.key === initialTab) ? initialTab : availableTabs[0].key
  );

  useEffect(() => {
    if (!availableTabs.some((t) => t.key === activeTab)) {
      const fallback = availableTabs[0].key;
      setActiveTab(fallback);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set('tab', fallback);
        return copy;
      });
    }
  }, [availableTabs, activeTab, setSearchParams]);

  // Selected date state
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await HvacApi.getLogs({ date: selectedDate });
      setLogs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.warn('HVAC data load error:', err);
      setError(err.message || 'Failed to load HVAC monitoring data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [selectedSlot, setSelectedSlot] = useState(0);

  const handleTabChange = (key) => {
    setActiveTab(key);
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set('tab', key);
      return copy;
    });
  };

  const handleNavigateToEdit = (slotIdx) => {
    if (slotIdx !== undefined && slotIdx !== null) {
      setSelectedSlot(slotIdx);
    }
    handleTabChange(isOperator ? 'entry' : 'edit');
  };

  return (
    <AdminLayout
      title={
        isOperator
          ? 'HVAC Operator Portal'
          : isHvacEngineer
          ? 'HVAC Engineer Portal'
          : isSupervisor
          ? 'HVAC Supervisor Portal'
          : 'HVAC Plant Daily Log'
      }
      subtitle={
        isOperator
          ? 'HVAC Plant Operations • Hourly Telemetry Logging for Chillers, Pumps, Cooling Towers & Meters'
          : isHvacEngineer
          ? 'HVAC Engineer Oversight • Real-time chiller status, R-01 daily flash reports, and monthly energy & water consumption analytics'
          : isSupervisor
          ? 'HVAC Supervisor Oversight • Shift verification, plant checklist audits, and operator oversight'
          : 'Central AC & Chiller Operations • 7 Chillers (Trane, Carrier, Daikin) · Primary/Secondary/Condenser Pumps · Cooling Towers · MWh Panels'
      }
    >
      <div className="hvac-root" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Navigation Tabs Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Tabs
            tabs={availableTabs}
            active={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {error && (
          <div className="hvac-alert-box">
            <h4>Connection Error</h4>
            <p>{error}</p>
          </div>
        )}

        {loading && !logs.length ? (
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <Spinner />
            <div style={{ marginTop: 12, color: 'var(--hvac-muted)', fontWeight: 600 }}>
              Loading HVAC Plant telemetry and logs...
            </div>
          </Card>
        ) : (
          <div>
            {(activeTab === 'entry' || (activeTab === 'edit' && canEdit)) && (
              <EditReadingTab
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                initialSlot={selectedSlot}
                logs={logs}
                onSaved={loadData}
                isOperator={isOperator}
                user={authUser}
              />
            )}

            {activeTab === 'daily' && !isOperator && (
              <DailyPlantStatus
                logs={logs}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                isSupervisor={canEdit}
                onNavigateToEdit={handleNavigateToEdit}
              />
            )}

            {activeTab === 'flash' && !isOperator && (
              <FlashReport
                logs={logs}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            )}

            {activeTab === 'monthly' && !isOperator && (
              <MonthlyReport
                defaultMonth={selectedDate.slice(0, 7)}
              />
            )}

            {activeTab === 'operators' && canEdit && (
              <OperatorsManagerTab
                department="hvac"
                operatorRole="hvac_operator"
                departmentName="HVAC Plant Operations"
                accentColor="#0f766e"
              />
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
