export const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const m = 450 + 60 * i;
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':30';
});

export const SHIFTS = [
  { id: '1', name: 'Shift 1', range: '07:30 – 15:30', slots: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: '2', name: 'Shift 2', range: '15:30 – 23:30', slots: [8, 9, 10, 11, 12, 13, 14, 15] },
  { id: '3', name: 'Shift 3', range: '23:30 – 07:30', slots: [16, 17, 18, 19, 20, 21, 22, 23] },
];

export const CHILLERS = [
  [1, 'Trane 1', 305],
  [2, 'Trane 2', 305],
  [3, 'Trane 3', 305],
  [4, 'Trane 4', 305],
  [5, 'Carrier 5', 600],
  [6, 'Daikin 6', 605],
  [7, 'Daikin 7', 605],
];

export const CHILLER_FIELDS = [
  ['evapIn', 'Evaporator entering °C'],
  ['evapOut', 'Evaporator leaving °C'],
  ['evapP', 'Evaporator pressure kPa'],
  ['condIn', 'Condenser entering °C'],
  ['condOut', 'Condenser leaving °C'],
  ['condP', 'Condenser refrigerant pressure kPa'],
  ['drift', 'Refrigerant diff. pressure kPa'],
  ['oilP', 'Compressor oil pressure kPa'],
  ['oilL', 'Oil loss level sensor'],
  ['rla', '% RLA'],
  ['l1', 'Line current L1 A'],
  ['l2', 'Line current L2 A'],
  ['l3', 'Line current L3 A'],
  ['v1', 'Voltage V1 V'],
  ['v2', 'Voltage V2 V'],
  ['v3', 'Voltage V3 V'],
  ['vab', 'Voltage AB V'],
  ['vbc', 'Voltage BC V'],
  ['vca', 'Voltage CA V'],
];

export const PUMP_GROUPS = [
  ['pri', 'Primary', ['1', '2', '3', '4', '5', '6', 'NA 1', 'NA 2', 'NA 3', 'NA 4']],
  ['sec', 'Secondary', ['1', '2', '3', '4', '5', '6', '7', 'NA 1', 'NA 2', 'NA 3', 'NA 4']],
  ['con', 'Condenser', ['1', '2', '3', '4', '5', '6', 'NA 1', 'NA 2', 'NA 3', 'NA 4']],
];

export const PUMP_RATED_LIMITS = {
  // Primary Chilled Water Pumps
  pri1: { name: 'Primary Pump 1 (Trane)', maxV: 410, maxA: 21.5, ratedV: '390-410V', ratedA: '19-21.5A' },
  pri2: { name: 'Primary Pump 2 (Trane)', maxV: 410, maxA: 21.5, ratedV: '390-410V', ratedA: '19-21.5A' },
  pri3: { name: 'Primary Pump 3 (Trane)', maxV: 410, maxA: 21.5, ratedV: '390-410V', ratedA: '19-21.5A' },
  pri4: { name: 'Primary Pump 4 (Trane)', maxV: 410, maxA: 21.5, ratedV: '390-410V', ratedA: '19-21.5A' },
  pri5: { name: 'Primary Pump 5 (Carrier)', maxV: 425, maxA: 17.0, ratedV: '405-425V', ratedA: '15-17A' },
  pri6: { name: 'Primary Pump 6 (Carrier)', maxV: 425, maxA: 17.0, ratedV: '405-425V', ratedA: '15-17A' },
  priNA1: { name: 'Primary Pump NA 1', maxV: 416, maxA: 18.5, ratedV: '414-416V', ratedA: '18.5A' },
  priNA2: { name: 'Primary Pump NA 2', maxV: 416, maxA: 17.5, ratedV: '414-416V', ratedA: '17.5A' },
  priNA3: { name: 'Primary Pump NA 3 (Daikin)', maxV: 430, maxA: 19.0, ratedV: '410-430V', ratedA: '17-19A' },
  priNA4: { name: 'Primary Pump NA 4 (Daikin)', maxV: 430, maxA: 19.0, ratedV: '411-430V', ratedA: '18-19A' },

  // Secondary Chilled Water Pumps
  sec1: { name: 'Secondary Pump 1 (Trane)', maxV: 410, maxA: 50.0, ratedV: '400-410V', ratedA: '47-50A' },
  sec2: { name: 'Secondary Pump 2 (Trane)', maxV: 410, maxA: 50.0, ratedV: '401-410V', ratedA: '48-50A' },
  sec3: { name: 'Secondary Pump 3 (Trane)', maxV: 410, maxA: 50.0, ratedV: '402-410V', ratedA: '49-50A' },
  sec4: { name: 'Secondary Pump 4 (Trane)', maxV: 410, maxA: 50.0, ratedV: '403-410V', ratedA: '50A' },
  sec5: { name: 'Secondary Pump 5 (Hostel)', maxV: 420, maxA: 55.0, ratedV: '410-420V', ratedA: '45-55A' },
  sec6: { name: 'Secondary Pump 6 (Hostel)', maxV: 420, maxA: 55.0, ratedV: '410-420V', ratedA: '45-55A' },
  sec7: { name: 'Secondary Pump 7 (Hostel)', maxV: 420, maxA: 55.0, ratedV: '410-420V', ratedA: '45-55A' },
  secNA1: { name: 'Secondary Pump NA 1', maxV: 416, maxA: 65.5, ratedV: '414-416V', ratedA: '65.5A' },
  secNA2: { name: 'Secondary Pump NA 2', maxV: 416, maxA: 65.5, ratedV: '414-416V', ratedA: '65.5A' },
  secNA3: { name: 'Secondary Pump NA 3 (Daikin)', maxV: 430, maxA: 70.0, ratedV: '410-430V', ratedA: '62-70A' },
  secNA4: { name: 'Secondary Pump NA 4 (Daikin)', maxV: 430, maxA: 70.0, ratedV: '410-430V', ratedA: '62-70A' },

  // Condenser Water Pumps
  con1: { name: 'Condenser Pump 1 (Trane)', maxV: 415, maxA: 33.0, ratedV: '400-415V', ratedA: '29-33A' },
  con2: { name: 'Condenser Pump 2 (Trane)', maxV: 415, maxA: 33.0, ratedV: '400-415V', ratedA: '29-33A' },
  con3: { name: 'Condenser Pump 3 (Trane)', maxV: 415, maxA: 33.0, ratedV: '400-415V', ratedA: '29-33A' },
  con4: { name: 'Condenser Pump 4 (Trane)', maxV: 415, maxA: 33.0, ratedV: '400-415V', ratedA: '29-33A' },
  con5: { name: 'Condenser Pump 5 (Carrier)', maxV: 420, maxA: 47.0, ratedV: '410-420V', ratedA: '41-47A' },
  con6: { name: 'Condenser Pump 6 (Carrier)', maxV: 420, maxA: 47.0, ratedV: '410-420V', ratedA: '41-47A' },
  conNA1: { name: 'Condenser Pump NA 1', maxV: 416, maxA: 50.5, ratedV: '414-416V', ratedA: '50.4A' },
  conNA2: { name: 'Condenser Pump NA 2', maxV: 416, maxA: 50.4, ratedV: '414-416V', ratedA: '50.3A' },
  conNA3: { name: 'Condenser Pump NA 3 (Daikin)', maxV: 430, maxA: 52.0, ratedV: '410-430V', ratedA: '47-52A' },
  conNA4: { name: 'Condenser Pump NA 4 (Daikin)', maxV: 430, maxA: 52.0, ratedV: '410-430V', ratedA: '47-52A' },
};

export const COOLING_TOWERS = [
  ['ct1', 'Cooling tower 1', 2],
  ['ct2', 'Cooling tower 2', 2],
  ['ct3', 'Cooling tower 3', 2],
  ['ct4', 'Cooling tower 4', 2],
  ['ct5', 'Cooling tower 5', 4],
  ['ctn1', 'Cooling tower NA 1', 2],
  ['ctn2', 'Cooling tower NA 2', 2],
];

export const PANELS = [
  ['pn1', 'HVAC Panel 1'],
  ['pn2', 'HVAC Panel 2'],
  ['pn3', 'HVAC Panel 3'],
  ['pn4', 'HVAC Panel 4'],
  ['pn5', 'HVAC Panel 5'],
];

export const WATER_METERS = [
  ['wm1', 'Old'],
  ['wm2', 'New'],
  ['wm3', 'Chilled'],
];

export const LABELS = {};

// Populate LABELS
CHILLERS.forEach(([n, nm]) => {
  LABELS[`c${n}_st`] = `${nm} · Status`;
  LABELS[`c${n}_dt`] = `${nm} · Evaporator ΔT °C (calc)`;
  CHILLER_FIELDS.forEach(([f, l]) => {
    LABELS[`c${n}_${f}`] = `${nm} · ${l}`;
  });
});

PUMP_GROUPS.forEach(([g, t, ns]) => {
  ns.forEach((n) => {
    const k = g + n.replace(' ', '');
    LABELS[`${k}_v`] = `${t} pump ${n} · Volts`;
    LABELS[`${k}_a`] = `${t} pump ${n} · Amps`;
  });
});

COOLING_TOWERS.forEach(([k, nm, n]) => {
  for (let i = 1; i <= n; i++) {
    LABELS[`${k}_f${i}`] = `${nm} · Fan ${i} Amp`;
  }
});

PANELS.forEach(([k, nm]) => {
  LABELS[`${k}_mwh`] = `${nm} · MWh`;
  LABELS[`${k}_amp`] = `${nm} · Amp`;
  LABELS[`${k}_pf`] = `${nm} · PF`;
});

WATER_METERS.forEach(([k, nm]) => {
  LABELS[`${k}_kl`] = `${nm} · Reading kL`;
});

export const shiftOfSlot = (slot) => Math.floor(slot / 8);
export const shiftKey = (log) => String((log.slot == null ? 0 : Math.floor(log.slot / 8)) + 1);

export const runningChillers = (v = {}) => {
  return CHILLERS.filter(([n]) => {
    return v[`c${n}_st`] === 'on' || (v[`c${n}_st`] === undefined && v[`c${n}_evapOut`] !== undefined);
  });
};

// 2. Pump Overload & Voltage Rated Limits (HVAC Supervisor and Engineer Portal ONLY)
export const getActivePumpLimits = () => {
  try {
    const saved = localStorage.getItem('hvac_custom_pump_ratings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = {};
      Object.entries(PUMP_RATED_LIMITS).forEach(([k, v]) => {
        merged[k] = { ...v, ...(parsed[k] || {}) };
      });
      return merged;
    }
  } catch (e) {
    console.error('Error loading custom pump ratings:', e);
  }
  return { ...PUMP_RATED_LIMITS };
};

export const saveCustomPumpLimits = (ratings) => {
  try {
    localStorage.setItem('hvac_custom_pump_ratings', JSON.stringify(ratings));
    window.dispatchEvent(new CustomEvent('hvac_pump_ratings_changed', { detail: ratings }));
  } catch (e) {
    console.error('Error saving custom pump ratings:', e);
  }
};

export const resetCustomPumpLimits = (key = null) => {
  try {
    if (!key) {
      localStorage.removeItem('hvac_custom_pump_ratings');
    } else {
      const saved = localStorage.getItem('hvac_custom_pump_ratings');
      if (saved) {
        const parsed = JSON.parse(saved);
        delete parsed[key];
        localStorage.setItem('hvac_custom_pump_ratings', JSON.stringify(parsed));
      }
    }
    window.dispatchEvent(new CustomEvent('hvac_pump_ratings_changed', { detail: null }));
  } catch (e) {
    console.error('Error resetting custom pump ratings:', e);
  }
};

export const evaluateAlerts = (v = {}, isSupervisorOrEngineer = true, customLimits = null) => {
  const al = [];

  // 1. Chiller Delta-T & Operating Alerts
  CHILLERS.forEach(([n, nm]) => {
    const on = v[`c${n}_st`] === 'on' || (v[`c${n}_st`] === undefined && v[`c${n}_evapOut`] !== undefined);
    if (!on) return;
    const ein = v[`c${n}_evapIn`];
    const eout = v[`c${n}_evapOut`];
    if (ein != null && eout != null) {
      const dt = +(ein - eout).toFixed(2);
      if (dt > 4.0) {
        al.push(`${nm}: Evaporator ΔT (${dt} °C) is high (> 4.0 °C)`);
      }
    }
    if (eout != null && eout > 9.0) {
      al.push(`${nm}: Evaporator leaving temp (${eout} °C) is high (> 9 °C)`);
    }
    const cin = v[`c${n}_condIn`];
    if (cin != null && cin > 33.0) {
      al.push(`${nm}: Condenser entering temp (${cin} °C) is high (> 33 °C)`);
    }
    const ol = v[`c${n}_oilL`];
    if (ol && String(ol).toLowerCase() !== 'wet') {
      al.push(`${nm}: Oil level sensor status is "${ol}"`);
    }
  });

  // 2. Pump Rated Limit Alerts (Supervisor & Engineer Portals Only)
  if (isSupervisorOrEngineer) {
    const limits = customLimits || getActivePumpLimits();
    Object.entries(limits).forEach(([pKey, limit]) => {
      const aVal = v[`${pKey}_a`];
      if (aVal != null && aVal !== '' && !isNaN(aVal)) {
        const numA = Number(aVal);
        if (numA >= limit.maxA) {
          al.push(`${limit.name}: Current (${numA} A) reached/exceeds rated maximum (${limit.maxA} A)`);
        }
      }
      const vVal = v[`${pKey}_v`];
      if (vVal != null && vVal !== '' && !isNaN(vVal)) {
        const numV = Number(vVal);
        if (numV >= limit.maxV) {
          al.push(`${limit.name}: Voltage (${numV} V) reached/exceeds rated maximum (${limit.maxV} V)`);
        }
      }
    });
  }

  return al;
};

export const deriveLogValues = (v = {}) => {
  const o = { ...v };
  CHILLERS.forEach(([n]) => {
    if (v[`c${n}_evapIn`] !== undefined && v[`c${n}_evapOut`] !== undefined) {
      o[`c${n}_dt`] = +(v[`c${n}_evapIn`] - v[`c${n}_evapOut`]).toFixed(2);
    }
  });
  return o;
};
