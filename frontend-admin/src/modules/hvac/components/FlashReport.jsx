import React, { useMemo } from 'react';
import {
  TIME_SLOTS,
  CHILLERS,
  CHILLER_FIELDS,
  PUMP_GROUPS,
  COOLING_TOWERS,
  PANELS,
  WATER_METERS,
  LABELS,
  deriveLogValues,
  shiftKey,
} from '../config';
import HvacApi from '../hvacApi';
import ExportDropdown from '../../../components/ui/ExportDropdown';

export default function FlashReport({
  logs = [],
  selectedDate,
  onDateChange,
}) {
  // Map of slot index -> log entry
  const slotMap = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      map[l.slot] = {
        ...l,
        v: deriveLogValues(l.v || {}),
      };
    });
    return map;
  }, [logs]);

  // Construct parameter order
  const flashData = useMemo(() => {
    const rows = [];

    // 1. Chillers
    CHILLERS.forEach(([n, nm]) => {
      rows.push({
        group: nm,
        param: 'Status',
        key: `c${n}_st`,
        values: TIME_SLOTS.map((_, i) => slotMap[i]?.v[`c${n}_st`] || ''),
      });
      rows.push({
        group: nm,
        param: 'Evaporator ΔT °C',
        key: `c${n}_dt`,
        values: TIME_SLOTS.map((_, i) => slotMap[i]?.v[`c${n}_dt`] ?? ''),
      });
      CHILLER_FIELDS.forEach(([f, label]) => {
        rows.push({
          group: nm,
          param: label,
          key: `c${n}_${f}`,
          values: TIME_SLOTS.map((_, i) => slotMap[i]?.v[`c${n}_${f}`] ?? ''),
        });
      });
    });

    // 2. Pumps
    PUMP_GROUPS.forEach(([g, t, ns]) => {
      ns.forEach((n) => {
        const k = g + n.replace(' ', '');
        rows.push({
          group: `${t} Pumps`,
          param: `Pump ${n} Volts`,
          key: `${k}_v`,
          values: TIME_SLOTS.map((_, i) => slotMap[i]?.v[`${k}_v`] ?? ''),
        });
        rows.push({
          group: `${t} Pumps`,
          param: `Pump ${n} Amps`,
          key: `${k}_a`,
          values: TIME_SLOTS.map((_, i) => slotMap[i]?.v[`${k}_a`] ?? ''),
        });
      });
    });

    // 3. Cooling Towers
    COOLING_TOWERS.forEach(([k, nm, n]) => {
      for (let i = 1; i <= n; i++) {
        rows.push({
          group: 'Cooling Towers',
          param: `${nm} Fan ${i} (A)`,
          key: `${k}_f${i}`,
          values: TIME_SLOTS.map((_, idx) => slotMap[idx]?.v[`${k}_f${i}`] ?? ''),
        });
      }
    });

    // 4. Panels
    PANELS.forEach(([k, nm]) => {
      rows.push({
        group: 'HVAC Panels',
        param: `${nm} MWh`,
        key: `${k}_mwh`,
        values: TIME_SLOTS.map((_, idx) => slotMap[idx]?.v[`${k}_mwh`] ?? ''),
      });
      rows.push({
        group: 'HVAC Panels',
        param: `${nm} Current (A)`,
        key: `${k}_amp`,
        values: TIME_SLOTS.map((_, idx) => slotMap[idx]?.v[`${k}_amp`] ?? ''),
      });
      rows.push({
        group: 'HVAC Panels',
        param: `${nm} Power Factor`,
        key: `${k}_pf`,
        values: TIME_SLOTS.map((_, idx) => slotMap[idx]?.v[`${k}_pf`] ?? ''),
      });
    });

    // 5. Water Meters
    WATER_METERS.forEach(([k, nm]) => {
      rows.push({
        group: 'Water Meters',
        param: `${nm} Reading kL`,
        key: `${k}_kl`,
        values: TIME_SLOTS.map((_, idx) => slotMap[idx]?.v[`${k}_kl`] ?? ''),
      });
    });

    return rows;
  }, [slotMap]);

  // CSV Export
  const handleExportCsv = () => {
    const csvRows = [
      ['IIT Gandhinagar - HVAC Plant Daily Log Sheet', `Date: ${selectedDate}`],
      [],
      ['Group', 'Parameter', ...TIME_SLOTS],
      ['Shift', '', ...TIME_SLOTS.map((_, i) => `Shift ${Math.floor(i / 8) + 1}`)],
      ['Operator', '', ...TIME_SLOTS.map((_, i) => slotMap[i]?.operator || '')],
      ['Set Point °C', '', ...TIME_SLOTS.map((_, i) => slotMap[i]?.setpoint ?? '')],
      ...flashData.map((r) => [r.group, r.param, ...r.values]),
      [],
      ['Checked by (Shift In-charge)', 'Approved by (Plant Manager)'],
    ];
    HvacApi.exportCsv(`hvac_flash_report_${selectedDate}.csv`, csvRows);
  };

  // PDF Export
  const handleExportPdf = () => {
    const pdfRows = [
      ['Group', 'Parameter', ...TIME_SLOTS],
      ['Shift', '', ...TIME_SLOTS.map((_, i) => `S${Math.floor(i / 8) + 1}`)],
      ['Operator', '', ...TIME_SLOTS.map((_, i) => (slotMap[i]?.operator || '').split(' ')[0])],
      ['Set Point', '', ...TIME_SLOTS.map((_, i) => String(slotMap[i]?.setpoint ?? '–'))],
      ...flashData.map((r) => [r.group, r.param, ...r.values.map((v) => (v === '' ? '–' : String(v)))]),
    ];
    HvacApi.exportPdf(
      `hvac_flash_report_${selectedDate}.pdf`,
      pdfRows,
      `HVAC Daily Log Sheet (R-01) - IIT Gandhinagar - ${selectedDate}`
    );
  };

  return (
    <div>
      {/* Header controls */}
      <div className="hvac-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hvac-muted)', textTransform: 'uppercase' }}>Log Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                style={{ padding: '6px 12px', fontWeight: 700, borderRadius: 8 }}
              />
            </label>
            <span className="pill pill-blue">
              {logs.length} of 24 Slots Logged
            </span>
          </div>

          <div>
            <ExportDropdown
              label="Export Flash Sheet"
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
            />
          </div>
        </div>
      </div>

      {/* Main Flash Report Table */}
      <div className="hvac-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hvac-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0c2535' }}>
              Daily Flash Report &middot; R-01 Log Sheet
            </div>
            <small style={{ color: 'var(--hvac-muted)' }}>
              24-Hour continuous matrix across all chillers, pumps, towers, and metering panels
            </small>
          </div>
        </div>

        <div className="hvac-scroll" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <table className="hvac-flash-table">
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                <th style={{ minWidth: 220, position: 'sticky', left: 0, top: 0, zIndex: 4 }}>Parameter</th>
                {TIME_SLOTS.map((s) => (
                  <th key={s} style={{ minWidth: 65, textAlign: 'right' }}>{s}</th>
                ))}
              </tr>
              {/* Meta Rows: Shift, Operator, SP */}
              <tr style={{ background: '#f8fafc', fontWeight: 700, borderBottom: '1px solid var(--hvac-line)' }}>
                <td style={{ fontWeight: 800 }}>Shift</td>
                {TIME_SLOTS.map((_, i) => (
                  <td key={i} style={{ textAlign: 'right', color: 'var(--hvac-cyan)' }}>
                    Shift {Math.floor(i / 8) + 1}
                  </td>
                ))}
              </tr>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--hvac-line)' }}>
                <td style={{ fontWeight: 800 }}>Operator</td>
                {TIME_SLOTS.map((_, i) => (
                  <td key={i} style={{ textAlign: 'right', fontSize: 11 }}>
                    {(slotMap[i]?.operator || '').split(' ')[0] || '–'}
                  </td>
                ))}
              </tr>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <td style={{ fontWeight: 800 }}>Set Point (°C)</td>
                {TIME_SLOTS.map((_, i) => (
                  <td key={i} style={{ textAlign: 'right', fontWeight: 700 }}>
                    {slotMap[i]?.setpoint ?? '–'}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let currentGroup = '';
                return flashData.map((r, idx) => {
                  const isNewGroup = r.group !== currentGroup;
                  if (isNewGroup) currentGroup = r.group;
                  return (
                    <React.Fragment key={idx}>
                      {isNewGroup && (
                        <tr className="group-header">
                          <td colSpan={25}>{r.group}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ paddingLeft: 18 }}>{r.param}</td>
                        {r.values.map((val, vIdx) => (
                          <td key={vIdx} style={{ color: val === '' ? '#94a3b8' : 'inherit' }}>
                            {val === '' ? '–' : val}
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Signature Sign-off footer */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32, padding: '24px 20px', borderTop: '1px solid var(--hvac-line)', background: '#f8fafc' }}>
          <div>
            <div style={{ borderBottom: '1.5px solid #0c2535', paddingBottom: 36 }}></div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hvac-muted)', marginTop: 6 }}>
              Checked by (Shift In-charge)
            </div>
          </div>
          <div>
            <div style={{ borderBottom: '1.5px solid #0c2535', paddingBottom: 36 }}></div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hvac-muted)', marginTop: 6 }}>
              Approved by (Plant Manager)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
