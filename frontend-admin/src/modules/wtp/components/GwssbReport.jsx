import React, { useState, useEffect, useMemo, useCallback } from 'react';
import WtpApi from '../WtpApi';
import { fmt, downloadCsv, downloadPdf } from '../lib/format';
import ExportDropdown from '../../../components/ui/ExportDropdown';

export default function GwssbReport({ user }) {
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  // Form states
  const [month, setMonth] = useState(currentMonthStr);
  const [initialReading, setInitialReading] = useState('');
  const [finalReading, setFinalReading] = useState('');
  const [ratePerUnit, setRatePerUnit] = useState(10);
  const [billNo, setBillNo] = useState('');
  const [status, setStatus] = useState('Verified');
  const [remarks, setRemarks] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Load bills from API
  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const data = await WtpApi.gwssbBills();
      setBills(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.warn('Failed to load GWSSB bills:', err);
      setError('Failed to load GWSSB billing records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // When month changes or bills load, prefill if bill exists for that month
  useEffect(() => {
    const existing = bills.find((b) => b.month === month);
    if (existing) {
      setInitialReading(existing.initialReading ?? '');
      setFinalReading(existing.finalReading ?? '');
      setRatePerUnit(existing.ratePerUnit ?? 10);
      setBillNo(existing.billNo ?? '');
      setStatus(existing.status ?? 'Verified');
      setRemarks(existing.remarks ?? '');
      setIsEditing(true);
    } else {
      // Suggest initial reading from previous month's final reading if available
      const sorted = [...bills].sort((a, b) => b.month.localeCompare(a.month));
      const prevBill = sorted.find((b) => b.month < month);
      setInitialReading(prevBill?.finalReading ?? '');
      setFinalReading('');
      setRatePerUnit(10);
      setBillNo('');
      setStatus('Pending');
      setRemarks('');
      setIsEditing(false);
    }
  }, [month, bills]);

  // Real-time calculations:
  // 1. Reading Difference = Final - Initial
  // 2. Net Water Consumption = (Final - Initial) * 1000
  // 3. Bill Amount = Net Water Consumption * 10
  const initVal = parseFloat(initialReading);
  const finalVal = parseFloat(finalReading);
  const hasValidReadings = !isNaN(initVal) && !isNaN(finalVal);
  const readingDiff = hasValidReadings ? Math.max(0, Number((finalVal - initVal).toFixed(3))) : 0;
  const netWaterConsumption = hasValidReadings ? Number((readingDiff * 1000).toFixed(2)) : 0;
  const computedBillAmount = hasValidReadings ? Number((netWaterConsumption * (ratePerUnit || 10)).toFixed(2)) : 0;

  // Save / Update bill
  const handleSave = async (e) => {
    e.preventDefault();
    if (!month) {
      setError('Please select a valid month');
      return;
    }
    if (isNaN(initVal) || isNaN(finalVal)) {
      setError('Please enter valid numerical Initial and Final readings');
      return;
    }
    if (finalVal < initVal) {
      setError('Final reading cannot be less than Initial reading');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await WtpApi.saveGwssbBill({
        month,
        initialReading: initVal,
        finalReading: finalVal,
        ratePerUnit: ratePerUnit || 10,
        billNo: billNo.trim(),
        status,
        remarks: remarks.trim(),
        date: new Date().toISOString().slice(0, 10),
        by: user?.name || user?.username || 'Supervisor',
      });

      setMsg({ type: 'ok', text: `GWSSB bill for ${month} saved successfully! Bill Amount: ₹ ${fmt(computedBillAmount, 2)}` });
      setTimeout(() => setMsg(null), 5000);
      await loadBills();
    } catch (err) {
      setError(err.message || 'Failed to save GWSSB bill');
    } finally {
      setSaving(false);
    }
  };

  // Delete bill
  const handleDelete = async (m) => {
    if (!window.confirm(`Are you sure you want to delete the GWSSB bill record for ${m}?`)) return;
    try {
      await WtpApi.deleteGwssbBill(m);
      setMsg({ type: 'ok', text: `Deleted bill for ${m}` });
      setTimeout(() => setMsg(null), 4000);
      await loadBills();
    } catch (err) {
      setError(err.message || 'Failed to delete bill');
    }
  };

  // Edit bill from table
  const handleEditClick = (b) => {
    setMonth(b.month);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Aggregated KPIs
  const totalBilledAllTime = useMemo(() => bills.reduce((acc, b) => acc + (b.billAmount || 0), 0), [bills]);
  const totalConsumptionAllTime = useMemo(() => bills.reduce((acc, b) => acc + (b.netConsumption || 0), 0), [bills]);
  const latestBill = bills.length > 0 ? bills[0] : null;

  // Exports
  const handleExportCsv = () => {
    const headers = ['Month', 'Bill No', 'Initial Reading', 'Final Reading', 'Reading Diff', 'Net Water Consumption (CUM)', 'Rate (Rs/CUM)', 'Bill Amount (Rs)', 'Status', 'Entered By'];
    const rows = bills.map((b) => [
      b.month,
      b.billNo || '-',
      b.initialReading != null ? b.initialReading : '-',
      b.finalReading != null ? b.finalReading : '-',
      b.readingDiff != null ? b.readingDiff : '-',
      b.netConsumption != null ? b.netConsumption : '-',
      b.ratePerUnit || 10,
      b.billAmount != null ? b.billAmount : '-',
      b.status || '-',
      b.by || '-',
    ]);
    downloadCsv(`GWSSB_Water_Bills_${currentMonthStr}`, headers, rows);
  };

  const handleExportPdf = () => {
    const headers = ['Month', 'Bill No', 'Init', 'Final', 'Diff', 'Net CUM', 'Rate', 'Bill Amt (Rs)', 'Status'];
    const rows = bills.map((b) => [
      b.month,
      b.billNo || '-',
      fmt(b.initialReading, 3),
      fmt(b.finalReading, 3),
      fmt(b.readingDiff, 3),
      fmt(b.netConsumption, 2),
      `Rs ${b.ratePerUnit || 10}`,
      `Rs ${fmt(b.billAmount, 2)}`,
      b.status || '-',
    ]);
    downloadPdf('GWSSB Water Bill & Monthly Consumption Report', headers, rows, `IIT Gandhinagar — Water Treatment Operations (${currentMonthStr})`);
  };

  return (
    <div className="gwssb-section" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Explanation */}
      <div className="card" style={{ borderLeft: '5px solid #0e6f8f', background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>💧</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0c4a6e' }}>
                GWSSB Bulk Water Bill Amount & Net Consumption
              </h2>
            </div>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '13.5px', lineHeight: 1.5 }}>
              Gujarat Water Supply and Sewerage Board (GWSSB) bulk incoming Narmada water invoice calculator.
              Enter monthly Initial and Final meter readings to compute Net Water Consumption and Total Bill Amount.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ExportDropdown
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
              disabled={bills.length === 0}
            />
          </div>
        </div>

        {/* Mathematical Formulas Banner */}
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #bae6fd',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          alignItems: 'center',
          boxShadow: '0 2px 6px rgba(14, 111, 143, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '11px' }}>
              FORMULA 1
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1' }}>
              Net Water Consumption = (Final Reading − Initial Reading) &times; 1,000 CUM
            </span>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '11px' }}>
              FORMULA 2
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>
              Bill Amount = Net Water Consumption &times; ₹ 10.00
            </span>
          </div>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ borderTop: '4px solid #10b981', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
            Latest Month Bill ({latestBill?.month || currentMonthStr})
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#059669', margin: '6px 0 2px' }}>
            ₹ {fmt(latestBill?.billAmount ?? computedBillAmount, 2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Calculated at ₹10 / CUM
          </div>
        </div>

        <div className="card" style={{ borderTop: '4px solid #0284c7', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
            Net Water Consumption
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0369a1', margin: '6px 0 2px' }}>
            {fmt(latestBill?.netConsumption ?? netWaterConsumption, 2)} <span style={{ fontSize: '15px' }}>CUM</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Diff &times; 1,000 multiplier
          </div>
        </div>

        <div className="card" style={{ borderTop: '4px solid #6366f1', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
            Reading Difference
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#4f46e5', margin: '6px 0 2px' }}>
            {fmt(latestBill?.readingDiff ?? readingDiff, 3)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Final − Initial reading
          </div>
        </div>

        <div className="card" style={{ borderTop: '4px solid #f59e0b', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
            Total Billed (All Time)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#d97706', margin: '6px 0 2px' }}>
            ₹ {fmt(totalBilledAllTime, 2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Total: {fmt(totalConsumptionAllTime, 1)} CUM
          </div>
        </div>
      </div>

      {/* Alerts */}
      {msg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#ecfdf5',
          border: '1.5px solid #a7f3d0',
          color: '#065f46',
          fontSize: '13.5px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>✓</span>
          <span>{msg.text}</span>
        </div>
      )}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#fef2f2',
          border: '1.5px solid #fecaca',
          color: '#991b1b',
          fontSize: '13.5px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Monthly Reading Input & Calculation Form */}
      <div className="card" style={{ padding: '20px', border: '1.5px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
              {isEditing ? `Update Monthly GWSSB Reading (${month})` : `Enter Monthly GWSSB Reading (${month})`}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Fill Initial and Final readings for the billing month. The system will automatically calculate the water consumption and bill amount.
            </p>
          </div>
          {isEditing && (
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800 }}>
              Editing Saved Record
            </span>
          )}
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Billing Month (YYYY-MM) *
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Initial Reading *
              </label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={initialReading}
                onChange={(e) => setInitialReading(e.target.value)}
                placeholder="e.g. 141.950"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Final Reading *
              </label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={finalReading}
                onChange={(e) => setFinalReading(e.target.value)}
                placeholder="e.g. 156.450"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Rate per Unit (₹ / CUM)
              </label>
              <input
                type="number"
                step="any"
                value={ratePerUnit}
                onChange={(e) => setRatePerUnit(parseFloat(e.target.value) || 10)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: '#f8fafc',
                }}
              />
            </div>
          </div>

          {/* Live Calculation Preview Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
            border: '2px dashed #86efac',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                Reading Difference (Final − Initial)
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                {hasValidReadings ? fmt(readingDiff, 3) : '–'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {hasValidReadings ? `${fmt(finalVal, 3)} − ${fmt(initVal, 3)}` : 'Enter readings above'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                Net Water Consumption (&times; 1000)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>
                {hasValidReadings ? `${fmt(netWaterConsumption, 2)} CUM` : '–'}
              </div>
              <div style={{ fontSize: '11px', color: '#0369a1' }}>
                {hasValidReadings ? `${fmt(readingDiff, 3)} &times; 1,000` : 'Waiting for input'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                Total Bill Amount (&times; ₹10)
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803d', marginTop: '2px' }}>
                {hasValidReadings ? `₹ ${fmt(computedBillAmount, 2)}` : '–'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>
                {hasValidReadings ? `${fmt(netWaterConsumption, 1)} CUM &times; ₹${ratePerUnit}` : 'Calculated automatically'}
              </div>
            </div>
          </div>

          {/* Optional Meta fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Bill / Invoice No. (Optional)
              </label>
              <input
                type="text"
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder="e.g. GWSSB/2026/10-705"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Bill Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                <option value="Pending">Pending Verification</option>
                <option value="Verified">Verified by Supervisor</option>
                <option value="Paid">Paid / Settled</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Narmada bulk supply reading"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  const nowStr = new Date().toISOString().slice(0, 7);
                  setMonth(nowStr);
                }}
                className="btn-outline"
                style={{ width: 'auto', padding: '10px 18px', fontSize: '13px' }}
              >
                Reset / New Entry
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{
                width: 'auto',
                padding: '10px 24px',
                fontSize: '13.5px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0e6f8f, #075985)',
                boxShadow: '0 4px 12px rgba(14, 111, 143, 0.25)',
              }}
            >
              {saving ? 'Saving...' : isEditing ? 'Update GWSSB Bill' : 'Save GWSSB Bill'}
            </button>
          </div>
        </form>
      </div>

      {/* Monthly History Records Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
              Historical Monthly GWSSB Bills
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {bills.length} billing month(s) recorded
            </div>
          </div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
            Total Billed: ₹ {fmt(totalBilledAllTime, 2)}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
            Loading GWSSB billing records...
          </div>
        ) : bills.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
            No monthly GWSSB bills entered yet. Fill out the form above to record your first month.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Month</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Bill No</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Initial Reading</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Final Reading</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Diff</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right', color: '#0284c7' }}>
                    Net Consumption (CUM)
                  </th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Rate (₹)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right', color: '#059669' }}>
                    Bill Amount (₹)
                  </th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Entered By</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const isCurrent = b.month === month;
                  return (
                    <tr
                      key={b.month}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isCurrent ? '#f0f9ff' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                        {b.month}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                        {b.billNo || '–'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(b.initialReading, 3)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(b.finalReading, 3)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                        {fmt(b.readingDiff, 3)}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 800,
                        color: '#0369a1',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {fmt(b.netConsumption, 2)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>
                        ₹ {b.ratePerUnit || 10}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 800,
                        color: '#15803d',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '14px',
                      }}>
                        ₹ {fmt(b.billAmount, 2)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: b.status === 'Paid' ? '#dcfce7' : b.status === 'Verified' ? '#e0f2fe' : '#fef3c7',
                          color: b.status === 'Paid' ? '#166534' : b.status === 'Verified' ? '#0369a1' : '#92400e',
                        }}>
                          {b.status || 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#64748b' }}>
                        {b.by || '–'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleEditClick(b)}
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Edit this month"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(b.month)}
                            style={{
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Delete this record"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
