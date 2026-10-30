// Meter configuration. Edit labels, units, shift timings and tank sizes here.
export const SHIFTS = [
  { id: 1, name: 'Shift 1', time: '6 AM – 2 PM' },
  { id: 2, name: 'Shift 2', time: '2 PM – 10 PM' },
  { id: 3, name: 'Shift 3', time: '10 PM – 6 AM' },
];

export const STATIONS = [
  { id: 'wtp', name: 'WTP / WSC-II' },
  { id: 'stp', name: 'STP / WSC-I' },
  { id: 'wsc3', name: 'WSC-III' },
  { id: 'jm', name: 'Jalmandapam' },
];

// field: [key, label, unit, cumulative?, coefficient]
// Cumulative meters are reported as the difference between readings × coefficient.
const group = (st, name, fields) => ({
  st, name,
  fields: fields.map(([k, label, unit, cum, coef]) => ({
    k, label, unit, st, cum: !!cum, coef: coef || 1, cu: coef && coef !== 1 ? 'CUM' : unit,
  })),
});

export const GROUPS = [
  group('wtp', 'Incoming & treatment', [
    ['b', 'Incoming Narmada flow meter', 'MLD', 1],
    ['c', 'After treatment flow meter', 'CUM', 1],
    ['d', 'pH', ''],
    ['e', 'Turbidity', 'NTU'],
    ['f', 'Clean water pumping station', 'CUM', 1],
  ]),
  group('wtp', 'WSC-II Hostel', [
    ['g', 'WSC-2 Hostel – Fresh', 'CUM', 1],
    ['h', 'WSC-2 Hostel – Recycle', 'CUM', 1],
  ]),
  // WSC-I meters read in USMG; 1 USMG = 3785.4 CUM (m3)
  group('stp', 'WSC-I', [
    ['i', 'WSC-I Fresh Water', 'USMG', 1, 3785.4],
    ['j', 'WSC-I Recycle Water', 'USMG', 1, 3785.4],
  ]),
  group('stp', 'Sewage pumping', [
    ['m', 'SPS-1 Housing', 'CUM', 1],
    ['n', 'SPS-2 Academic', 'CUM', 1],
  ]),
  group('stp', 'STP ultra filtration', [
    ['o', 'STP SKID-1', 'CUM', 1],
    ['p', 'STP SKID-2', 'CUM', 1],
  ]),
  group('stp', 'Irrigation', [
    ['q', 'Housing irrigation & R/P', 'CUM', 1],
    ['r', 'Central Vista', 'CUM', 1],
    ['s', 'Scenic Drive', 'CUM', 1],
  ]),
  group('wsc3', 'WSC-III Housing', [
    ['k', 'WSC-3 Housing – Fresh', 'CUM', 1],
    ['l', 'WSC-3 Housing – Recycle', 'CUM', 1],
  ]),
  group('wtp', 'Chlorine & alum used this shift', [
    ['cl_wtp', 'WTP Chlorine', 'kg'],
    ['alum', 'WTP Alum', 'kg'],
    ['cl_wsc2', 'WSC-II Chlorine', 'gm'],
  ]),
  group('stp', 'Chlorine used this shift', [
    ['cl_stp', 'STP Chlorine', 'kg'],
    ['cl_wsc1', 'WSC-I Chlorine', 'gm'],
  ]),
  group('wsc3', 'Chlorine used this shift', [
    ['t', 'WSC-3 Irrigation', 'CUM', 1],
    ['cl_wsc3', 'WSC-III Chlorine', 'gm'],
  ]),
  group('jm', 'Tank levels', [
    ['jm1', 'Jalmandap-1', 'm'], ['jm2', 'Jalmandap-2', 'm'], ['jm3', 'Jalmandap-3', 'm'],
    ['jm4', 'Jalmandap-4', 'm'], ['jm5', 'Jalmandap-5', 'm'],
  ]),
  group('jm', 'Flow meters (only tanks that have a meter – leave blank otherwise)', [
    ['jm1_m', 'Jalmandap-1 Meter', 'CUM', 1], ['jm2_m', 'Jalmandap-2 Meter', 'CUM', 1],
    ['jm3_m', 'Jalmandap-3 Meter', 'CUM', 1], ['jm4_m', 'Jalmandap-4 Meter', 'CUM', 1],
    ['jm5_m', 'Jalmandap-5 Meter', 'CUM', 1],
  ]),
];

export const FIELDS = GROUPS.flatMap((g) => g.fields);
export const CUMS = FIELDS.filter((f) => f.cum);
export const isChem = (f) => /^cl_|^alum$/.test(f.k);

export function getMergedGroups(customStationMeters = []) {
  if (!customStationMeters || !customStationMeters.length) return GROUPS;
  const groups = GROUPS.map((g) => ({ ...g, fields: [...g.fields] }));
  for (const cm of customStationMeters) {
    let grp = groups.find((g) => g.st === cm.station && g.name.toLowerCase() === (cm.groupName || '').toLowerCase());
    const fieldObj = {
      k: cm.k,
      label: cm.label,
      unit: cm.unit,
      st: cm.station,
      cum: !!cm.cum,
      coef: cm.coef || 1,
      cu: cm.coef && cm.coef !== 1 ? 'CUM' : cm.unit,
      isCustom: true,
      _id: cm._id,
    };
    if (grp) {
      grp.fields.push(fieldObj);
    } else {
      groups.push({
        st: cm.station,
        name: cm.groupName || 'Additional Meters',
        fields: [fieldObj],
      });
    }
  }
  return groups;
}

export function getMergedFields(customStationMeters = []) {
  return getMergedGroups(customStationMeters).flatMap((g) => g.fields);
}

// Jalmandapam tanks: cap = capacity in CUM, h = tank height limit in m (4 m).
export const JMT = {
  jm1: { cap: 1400, h: 4 }, jm2: { cap: 1400, h: 4 }, jm3: { cap: 1400, h: 4 },
  jm4: { cap: 700, h: 4 }, jm5: { cap: 1400, h: 4 },
};
