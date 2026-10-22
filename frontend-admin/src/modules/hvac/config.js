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
  ['sec', 'Secondary', ['1', '2', '3', '4', '5', '7', 'NA 1', 'NA 2', 'NA 3', 'NA 4']],
  ['con', 'Condenser', ['1', '2', '3', '4', '5', '6', 'NA 1', 'NA 2', 'NA 3', 'NA 4']],
];

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
];

export const WATER_METERS = [
  ['wm1', 'Water Meter 1'],
  ['wm2', 'Water Meter 2'],
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

export const evaluateAlerts = (v = {}) => {
  const al = [];
  runningChillers(v).forEach(([n, nm]) => {
    const ein = v[`c${n}_evapIn`];
    const eout = v[`c${n}_evapOut`];
    const cin = v[`c${n}_condIn`];
    const oil = v[`c${n}_oilL`];
    if (ein != null && eout != null) {
      const dt = +(Number(ein) - Number(eout)).toFixed(2);
      if (dt > 4.0) {
        al.push(`${nm}: Delta T (${dt}°C) is high (> 4°C) [Entering: ${ein}°C, Leaving: ${eout}°C]`);
      }
    }
    if (eout != null && eout > 9) al.push(`${nm}: evaporator leaving ${eout}°C is high (> 9°C)`);
    if (cin != null && cin > 33) al.push(`${nm}: condenser entering ${cin}°C is high (> 33°C)`);
    if (oil && oil !== 'wet') al.push(`${nm}: oil level sensor reads ${oil} (abnormal)`);
  });
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
