/* Sheet Definitions & Engineering Parameters for Substation Log */

export const HT_RANGE = [10, 12.5];
export const LT_RANGE = [200, 260];
export const SLOTS = ['R1', 'R2', 'R3'];

const parseRow = (s) => {
  let div = false;
  if (s.endsWith('#')) { div = true; s = s.slice(0, -1); }
  if (s.startsWith('=')) return { sn: '', label: s.slice(1), div, head: true };
  const i = s.indexOf('|');
  return {
    ...(i < 0 ? { sn: '', label: s } : { sn: s.slice(0, i), label: s.slice(i + 1) }),
    div,
  };
};

export function snapCols(isHT) {
  return [
    ['vol', isHT ? 'Vol (kV)' : 'Vol (V)'],
    ['pf', 'PF'],
    ['kwh', 'kWh'],
    ['a1', 'A1'],
    ['a2', 'A2'],
    ['a3', 'A3'],
  ].map(([k, l]) => ({
    k,
    l,
    f: k,
    r: k === 'vol' ? (isHT ? HT_RANGE : LT_RANGE) : undefined,
  }));
}

export function expandRows(list) {
  const out = [];
  let m = 0;
  let j = 0;
  list.forEach((str) => {
    if (str.startsWith('+A:')) {
      const k = str.indexOf('|');
      let lab = str.slice(k + 1);
      let div = false;
      if (lab.endsWith('#')) { div = true; lab = lab.slice(0, -1); }
      out.push({ id: 'a_' + str.slice(3, k), anchor: true, group: lab, div });
    } else if (str.startsWith('+4|')) {
      let lab = str.slice(3);
      let div = false;
      if (lab.endsWith('#')) { div = true; lab = lab.slice(0, -1); }
      out.push({ id: 'a' + m, anchor: true, group: lab, div });
      m++;
    } else {
      out.push({ id: 'r' + j, ...parseRow(str) });
      j++;
    }
  });
  return out;
}

export function snap(id, name, section, sections) {
  return {
    id,
    name,
    section,
    full: name + ' – ' + section + ' Panel',
    mode: 'snapshot',
    slots: SLOTS,
    tables: sections.map((s, i) => ({
      id: 't' + i,
      title: s[0],
      cols: snapCols(section === 'HT'),
      rows: expandRows(s[1]),
    })),
  };
}

export const hours = [...Array(24).keys()].map((h) => ({
  id: 'h' + String(h).padStart(2, '0'),
  label: String(h).padStart(2, '0') + ':00',
}));

const mk = (a) => a.map(([k, l, f]) => ({ k, l, f }));
const H5 = mk([['kwh', 'KWH'], ['pf', 'PF'], ['a1', 'A1'], ['a2', 'A2'], ['a3', 'A3']]);
const HMFM = mk([['vol', 'VOL'], ['kwh', 'KWH'], ['pf', 'PF'], ['a1', 'A1'], ['a2', 'A2'], ['a3', 'A3']]);
const HTVM = mk([['pf', 'PF'], ['mwh', 'MWH', 'kwh'], ['mvah', 'MVAH'], ['mwh2', 'MWH 2', 'kwh'], ['cmd', 'CMD MW']]);

function groupCols(groups) {
  const cols = [];
  groups.forEach(([gid, gl, fields]) =>
    fields.forEach((f) => cols.push({ k: gid + '_' + f.k, f: f.f || f.k, l: f.l, g: gl }))
  );
  return cols;
}

export const BASE_SHEETS = [
  snap('sport_ht', 'Sport Sub Station', 'HT', [
    ['HT Panel', [
      '1|Incomer 1 (Main Infra Ring)',
      '2|Incomer 2 (Research Park Ring)#',
      '3|Panel 3 O.G. (Block 13)',
      '4|Panel 4 O.G. (Block 12)',
      '5|Panel 5 O.G. (Block 11)',
      '6|Panel 6 O.G. (Sport Complex)',
    ]],
  ]),
  snap('rpark_ht', 'Research Park Sub Station', 'HT', [
    ['HT Panel', [
      '1|Incomer 1',
      '2|Incomer 2#',
      '3|Transformer 1',
      '4|Transformer 2',
      '5|Transformer 3',
    ]],
  ]),
  {
    id: 'newht',
    name: 'Main Infra New HT Panel (hourly)',
    full: 'Main Infra New HT Panel (hourly)',
    section: 'HT',
    mode: 'hourly',
    slots: ['day'],
    tables: [
      {
        id: 'hr',
        title: 'Hourly readings',
        hourly: true,
        rows: hours,
        cols: groupCols([
          ['i1', 'Incomer 1', H5],
          ['i2', 'Incomer 2', H5],
          ['hos', 'OG1 (HOSTEL-WTP-MRS)', H5],
          ['hmms', 'OG 4(MRS-WTP-Hostel)', H5],
          ['spa', 'OG3 SPR Research Park (1)', H5],
          ['spb', 'OG5 SPR Research Park (2)', H5],
          ['sp1', 'Spare 2', H5],
          ['sp2', 'Spare 6', H5],
        ]),
      },
    ],
  },
  {
    id: 'oldht',
    name: 'Main Infra Old HT Panel (hourly)',
    full: 'Main Infra Old HT Panel (hourly)',
    section: 'HT',
    mode: 'hourly',
    slots: ['day'],
    tables: [
      {
        id: 'hr',
        title: 'Hourly readings',
        hourly: true,
        rows: hours,
        cols: groupCols([
          ['tvm', 'HTTVM Meter', HTVM],
          ['mfm', 'MFM Meter', HMFM],
          ['spc', 'OG 1/Sport Complex (1)', H5],
          ['spc2', 'OG 2/Sport Complex (2)', H5],
          ['aca', 'OG 3/Academic(1)', H5],
          ['bac', 'OG 4/Academic(2)', H5],
        ]),
      },
      {
        id: 'torrent',
        title: 'Torrent Meter Reading',
        raw: true,
        rows: [
          { id: 'daily', label: 'Torrent Meter' },
        ],
        cols: [
          { k: 'time', l: 'Time', txt: 1 },
          { k: 'tc_mwh', l: 'TC MWH' },
          { k: 'cm_varh', l: 'CM/VARH' },
          { k: 't1c_mwh', l: 'T/C MWH' },
          { k: 't2c_mwh', l: 'T2C MWH' },
          { k: 'cmd', l: 'CMD' },
          { k: 'mvah', l: 'MVAH' },
          { k: 'elec', l: 'Electrician name', txt: 1 },
        ],
      },
    ],
  },
  snap('sport_lt', 'Sport Sub Station', 'LT', [
    ['LT Panel', [
      '1|Incomer (Block 13) 1600 A',
      '+4|Incomer 1 (Block 13)#',
      '2|Incomer (Block 12) 1600 A',
      '+4|Incomer 2 (Block 12)#',
      '3|Incomer (Block 11) 1600 A',
      '+4|Incomer 3 (Block 11)#',
      '4|Incomer (Sport Com.) 1600 A',
      '5|Football G. LT 250 A',
      '6|Cricket G. LT Panel 100 A',
      '7|External Lighting Panel 3 63 A',
      '+4|Incomer 4 (Sport Complex)',
    ]],
  ]),
  snap('rpark_lt', 'Research Park Sub Station', 'LT', [
    ['LT Panel', [
      '=Incomer 1 – feeders up to Substation Light DB',
      '1|Incomer 1',
      '2|APFC Feeder 1',
      '–|APFC Panel 1',
      '3|Spare',
      '4|External Lighting',
      '5|HVAC Panel',
      '6|UPS Feeder',
      '7|B1 Rising Main',
      '8|Emergency Panel',
      '9|Substation Light DB',
      '+4|Incomer 1#',
      '=Incomer 2 – feeders up to Spare',
      '10|Incomer 2',
      '11|APFC Feeder 2',
      '–|APFC Panel 2',
      '12|Pump Room',
      '13|Spare (Ex Lighting)',
      '14|Spare',
      '15|Spare',
      '+4|Incomer 2#',
      '=Incomer 3',
      '16|Incomer 3',
      '17|Block-D',
      '+4|Incomer 3',
    ]],
  ]),
  snap('hostel', 'Hostel Sub Station', 'LT', [
    ['LT Panel', [
      '1|Main Incomer No 1',
      '2|Street Lighting Feeder 1 & 2',
      '3|UG 1 Hostel Electrical Room 1',
      '4|UG 2 Hostel Electrical Room 1',
      '5|UG 3 Hostel Electrical Room 1',
      '6|Spare',
      '7|UG 1 Hostel Electrical Room 2',
      '8|UG 2 Hostel Electrical Room 2',
      '9|UG 3 Hostel Electrical Room 2',
      '10|LT Supply Sub Station',
      '11|Bore Well Hostel',
      '12|200 kVAr Capacitor Feeder 1',
      '–|200 kVAr APFC Panel 1',
      '+4|Main Incomer No 1#',
      '13|Main Incomer No 4',
      '14|PG 1 Hostel Electrical Room 2',
      '15|PG 2 Hostel Electrical Room 2',
      '16|GH 2 Hostel Electrical Room 2',
      '17|PG 1 Hostel Electrical Room 1',
      '18|PG 2 Hostel Electrical Room 1',
      '19|Dining Electrical Room',
      '20|GH 1 Hostel Electrical Room 1',
      '21|Street Lighting Feeder 10 & 11',
      '22|200 kVAr Capacitor Feeder 2',
      '–|200 kVAr APFC Panel 2',
      '+4|Main Incomer No 4#',
      '23|New CSS 2',
      '24|OAT SAC',
      '25|New Hostel Block 5',
      '26|Ex Lighting Panel',
      '27|New Hostel Block 4',
      '28|Mess',
      '+A:css2|New CSS 2#',
      '29|New CSS 3',
      '30|New Hostel Block 6',
      '31|New Hostel Block 2',
      '32|New Hostel Block 1',
      '33|New Hostel Block 3',
    ]],
  ]),
  snap('acad1', 'Academic Sub Station 1', 'LT', [
    ['LT Panel', [
      '1|Main Incomer No 1',
      '2|Chiller No 2',
      '3|Solar Incomer',
      '+A:solar|Solar Incomer',
      '4|Block 7 Main Panel',
      '5|Block 6 Cubical Panel 1',
      '6|Block 8 Main Panel',
      '7|Block 6 Cubical Panel 2',
      '8|300 kVAr Capacitor Feeder 1',
      '–|300 kVAr APFC Panel 1#',
      '9(A)|AMF Feeder',
      'A1|140 kVA AMF Panel',
      'A2|Essential Main LT Panel',
      'A3|Block 6 Essential Panel',
      'A4|External Lighting Panel 1',
      'A5|External Lighting Panel 2',
      'A6|Solar Carport Lighting',
      'A7|LT Supply Sub Station',
      '+4|Main Incomer No 1#',
      '10|Main Incomer No 2',
      '11|Chiller 1',
      '12|BLOCK 7/109',
      '13|Block 6 Main Panel',
      '14|Block 9 Main Panel',
      '15|VRF Block 7',
      '16|300 kVAr Capacitor Feeder 2',
      '–|300 kVAr APFC Panel',
      '+4|Main Incomer No 2#',
      '17|Main Incomer No 3',
      '18|Chiller 3',
      '19|310 kVAr Capacitor Feeder 3',
      '20|310 kVAr APFC Panel 3',
      '+4|Main Incomer No 3#',
      '21|Main Incomer No 4',
      '22|Chiller 4',
      '+4|Main Incomer No 4#',
      '23|Main Incomer 5',
      '24|Chiller 5',
      '+4|Main Incomer 5',
    ]],
  ]),
  snap('acad2', 'Academic Sub Station 2', 'LT', [
    ['LT Panel', [
      '1|Main Incomer No 1',
      '2|Block 3 Main Panel',
      '3|Block 4 F Floor Main Panel',
      '4|Street Lighting Feeder 3',
      '5|225 kVAr Capacitor Feeder 1',
      '–|225 kVAr APFC Panel 1#',
      '6(A)|AMF Feeder',
      '–|500 kVA AMF Panel',
      'a1|Essential Main Panel',
      'a2|Block 5 Essential Feeder',
      'a3|Block 4 Essential Feeder',
      'a4|Block 1 Essential Feeder',
      'a5|External Lighting Feeder 1',
      'a6|External Lighting Feeder 2',
      'a7|LT Supply Sub Station',
      'a8|Block 3 Essential Feeder',
      'a9|Block 5 Essential Feeder (102)',
      'a10|Block 2 Stage Lit. Feeder',
      'a11|Block 2 Essential Feeder',
      '+4|Main Incomer No 1#',
      '7|Main Incomer No 2',
      '8|Block 5 Main Feeder',
      '9|Block 4 Main Feeder',
      '10|External Lighting Feeder',
      '11|225 kVAr Capacitor Feeder 2',
      '–|225 kVAr Panel 2#',
      '12|AMF Feeder 2',
      '+4|Main Incomer No 2',
    ]],
  ]),
  snap('mainlt', 'Main Infra LT Panel', 'LT', [
    ['LT Panel', [
      '1|Main Incomer No 1',
      '2|SPS 2',
      '3|Street Lighting Feeder',
      '4|Bore Well Academic',
      '5|LT Supply Substation',
      '6|Guest House of LTP 1',
      '7|225 kVAr Capacitor Feeder 1',
      '–|225 kVAr APFC Panel 1',
      '+4|Main Incomer No 1#',
      '8|Main Incomer No 2',
      '9|WSC 1',
      '10|Laundry',
      '11|Gate No 2',
      '12|WSC 3',
      '13|Guest House of LTP 2',
      '14|225 kVAr Capacitor Feeder 2',
      '–|225 kVAr APFC Panel 2',
      '+4|Main Incomer No 2',
    ]],
  ]),
  snap('wtp', 'WTP Sub Station', 'LT', [
    ['LT Panel', [
      '1|Main Incomer No 1',
      '2|Street Lighting Main Panel',
      '3|WTP',
      '4|LT Supply Sub Station',
      '5|SPS 2',
      '6|100 kVAr Capacitor Feeder 1',
      '–|100 kVAr APFC Panel 1',
      '+4|Main Incomer No 1#',
      '7|Main Incomer 2',
      '8|WSC 2',
      '9|CWPS WTP',
      '10|New External S. Light Feeder',
      '11|100 kVAr Capacitor Feeder 2',
      '–|100 kVAr APFC Panel 2',
      '12|Green House',
      '+4|Main Incomer 2',
    ]],
  ]),
];

export const mkSub = (x) => ({
  id: x.id,
  name: x.name,
  full: x.name + ' – LT Panel',
  section: 'LT',
  dyn: true,
  mode: 'snapshot',
  slots: SLOTS,
  tables: [{ id: 't0', title: 'LT Panel', cols: snapCols(false), rows: [] }],
});

/* Flash Report Constants */
export const FL_SS = [
  ['S1', 'Academic Substation 1', 'acad1', 'C', [1000, 1000, 1000, 1000, 1000]],
  ['S2', 'Academic SS2', 'acad2', 'C', [630, 630]],
  ['S3', 'WTP SS', 'wtp', 'C', [315, 315]],
  ['S4', 'Hostel Substation', 'hostel', 'C', [630, 750, 750, 630]],
  ['S5', 'Sports Complex Substation', 'sport_lt', 'T', [1000, 1000, 1000, 1000]],
  ['S6', 'MRS Substation', 'mainlt', 'C', [630, 630]],
  ['S7', 'Research Park Substation', 'rpark_lt', 'T', [800, 800, 1000]],
];

export const FL_TR = [];
FL_SS.forEach(([k, name, sheet, l, kv]) =>
  kv.forEach((v, i) =>
    FL_TR.push({ id: k + l + (i + 1), ss: k, ssName: name, sheet, idx: i, kva: v })
  )
);

export const FL_OG = [
  { id: 'P1a', panel: 'MRS HT PANEL 1', label: 'Sports', og: 'OG2', sheet: 'oldht', group: 'spc' },
  { id: 'P1b', panel: 'MRS HT PANEL 1', label: 'Academic 2', og: 'OG3', sheet: 'oldht', group: 'aca' },
  { id: 'P1c', panel: 'MRS HT PANEL 1', label: 'Academic 1', og: 'OG4', sheet: 'oldht', group: 'bac' },
  { id: 'P1d', panel: 'MRS HT PANEL 1', label: 'Sports', og: 'OG5', sheet: 'oldht', group: 'spc2' },
  { id: 'P2a', panel: 'MRS HT PANEL 2', label: 'Hostel', og: 'OG1', sheet: 'newht', group: 'hos' },
  { id: 'P2b', panel: 'MRS HT PANEL 2', label: 'Research', og: 'OG3', sheet: 'newht', group: 'spa' },
  { id: 'P2c', panel: 'MRS HT PANEL 2', label: 'MRS', og: 'OG4', sheet: 'newht', group: 'hmms' },
  { id: 'P2d', panel: 'MRS HT PANEL 2', label: 'Research', og: 'OG5', sheet: 'newht', group: 'spb' },
];

/* Helper Utility Functions */
export const num = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

export const docId = (sh, d, sl) => `${sh}__${d}__${sl}`;
export const orderKey = (d, sl) => `${d}|${sl === 'day' ? '0' : sl}`;
export const isEnergy = (c) => c && (c.f === 'kwh' || c.f === 'mwh');
export const isIncomer = (r) =>
  r.dyn ? r.kind === 'incomer' : (/incomer/i.test(r.label) && !/solar/i.test(r.label));

export const todayDate = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
};

export const nowHM = () => {
  const d = new Date();
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
};

export function flagInfo(c, raw, prev) {
  if (raw === '' || raw == null || c.txt) return ['', ''];
  const n = num(raw);
  if (n == null) return ['bad', 'Not a valid number'];
  if (c.f === 'pf') {
    if (n < 0 || n > 1) return ['bad', 'Power Factor must be between 0.00 and 1.00'];
    if (n > 0 && n < 0.9) return ['warn', 'Power Factor below nominal 0.90'];
  }
  if (c.f === 'vol' && c.r && n > 0 && (n < c.r[0] || n > c.r[1])) {
    return ['warn', `Voltage outside nominal ${c.r[0]}–${c.r[1]} range (check decimal)`];
  }
  if (isEnergy(c) && prev != null && n < prev) {
    return ['bad', `Reading is lower than previous reading (${prev})`];
  }
  return ['', ''];
}

export const trKva = (cfg, t) => (cfg.kva && num(cfg.kva[t.id])) ?? t.kva;
export const lvAmp = (kva) => Math.round(kva / (1.7320508 * 0.415));
