import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  Legend,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Zap,
  Activity,
  Layers,
  Calendar,
  CheckCircle2,
  Sparkles,
  ArrowRightLeft,
  CalendarRange,
  Gauge,
} from 'lucide-react';
import { num, isEnergy, isIncomer } from './sheetsData';

const COLORS = {
  primary: '#1a3c34', // IITGN Pine Green
  secondary: '#3d6b55', // Sage Green
  accent: '#c2622a', // IITGN Terracotta
  amber: '#d97706', // Warm Amber
  emerald: '#16a34a', // Emerald Green
  sky: '#0284c7', // Sky Blue
  purple: '#7c3aed', // Royal Violet
  border: '#e5e1d8',
  bgCard: '#ffffff',
  textMain: '#1a1a1a',
  textMuted: '#4a4540',
};

const FEEDER_PALETTE = [
  '#1a3c34',
  '#2d4a3e',
  '#3d6b55',
  '#c2622a',
  '#d97706',
  '#0284c7',
  '#059669',
  '#7c3aed',
  '#e11d48',
  '#475569',
];

const YEAR_COLORS = [
  '#1a3c34', // IITGN Pine Green
  '#c2622a', // Terracotta
  '#0284c7', // Sky Blue
  '#d97706', // Amber
  '#7c3aed', // Royal Violet
  '#059669', // Emerald
  '#e11d48', // Rose
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return monthKey || '';
  const [y, m] = monthKey.split('-');
  const idx = parseInt(m, 10) - 1;
  const name = MONTH_NAMES[idx] || m;
  return `${name} ${y}`;
}

// Extract reportable meter/feeder items for any substation sheet definition
function getSheetReportItems(sh) {
  if (!sh || !sh.tables) return [];
  const out = [];
  sh.tables.forEach((t) => {
    if (t.raw) return;
    if (sh.mode === 'snapshot') {
      (t.rows || []).forEach((r) => {
        if (r.head || r.anchor) return;
        const rk = t.id + ':' + r.id;
        out.push({
          label: r.label,
          sn: r.sn,
          bold: r.kind === 'incomer',
          incoming: isIncomer(r),
          unit: sh.section === 'HT' ? 'kWh' : 'kWh',
          read: (d) => [{ ord: d.date + '|' + d.slot, v: d.rows?.[rk]?.kwh }],
        });
      });
    } else {
      (t.cols || []).filter(isEnergy).forEach((c) =>
        out.push({
          label: c.f === 'kwh' && !/Meter/.test(c.g) ? c.g : c.g + ' · ' + c.l,
          incoming: /^Incomer/i.test(c.g) || /HT\s*TVM\s*Meter/i.test(c.g),
          unit: c.k === 'tvm_mwh' || c.k === 'tvm_mwh2' ? 'MWh' : c.f === 'kwh' ? 'kWh' : 'MWh',
          read: (d) =>
            (t.rows || []).map((hr) => ({
              ord: d.date + '|' + hr.id,
              v: d.rows?.[t.id + ':' + hr.id]?.[c.k],
            })),
        })
      );
    }
  });
  return out;
}

// Compute daily, monthly, and yearly consumption for a single sheet across all available docs
function computeSheetFullHistory(sh, allDocs) {
  if (!sh || !allDocs || !allDocs.length) {
    return {
      subDaily: {},
      subMonthly: {},
      subYearly: {},
      feederItems: [],
    };
  }
  const sheetDocs = allDocs.filter((d) => d.sheet === sh.id);
  const items = getSheetReportItems(sh);
  if (!items.length) {
    return {
      subDaily: {},
      subMonthly: {},
      subYearly: {},
      feederItems: [],
    };
  }

  const feederItems = items.map((it) => {
    const reads = [];
    sheetDocs.forEach((d) => {
      it.read(d).forEach((x) => {
        const n = num(x.v);
        if (n != null) reads.push({ ord: x.ord, date: d.date, v: n });
      });
    });
    reads.sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));

    const daily = {};
    const monthly = {};
    const yearly = {};
    let prev = null;

    reads.forEach((r) => {
      if (prev) {
        const diff = r.v - prev.v;
        if (diff >= 0) {
          daily[r.date] = (daily[r.date] || 0) + diff;
          const [y, m] = r.date.split('-');
          const mk = `${y}-${m}`;
          monthly[mk] = (monthly[mk] || 0) + diff;
          yearly[y] = (yearly[y] || 0) + diff;
        }
      }
      prev = r;
    });

    Object.keys(daily).forEach((k) => (daily[k] = Number(daily[k].toFixed(2))));
    Object.keys(monthly).forEach((k) => (monthly[k] = Number(monthly[k].toFixed(2))));
    Object.keys(yearly).forEach((k) => (yearly[k] = Number(yearly[k].toFixed(2))));

    return {
      label: it.label,
      shortLabel: it.label.length > 20 ? it.label.slice(0, 18) + '…' : it.label,
      sn: it.sn,
      isIncoming: it.incoming,
      unit: it.unit,
      daily,
      monthly,
      yearly,
    };
  });

  const allDates = new Set();
  const allMonths = new Set();
  const allYears = new Set();

  feederItems.forEach((f) => {
    Object.keys(f.daily).forEach((dt) => allDates.add(dt));
    Object.keys(f.monthly).forEach((mk) => allMonths.add(mk));
    Object.keys(f.yearly).forEach((yr) => allYears.add(yr));
  });

  const subDaily = {};
  allDates.forEach((dt) => {
    let inc = 0;
    let hasInc = false;
    let tot = 0;
    feederItems.forEach((f) => {
      const v = f.daily[dt] || 0;
      tot += v;
      if (f.isIncoming) {
        inc += v;
        hasInc = true;
      }
    });
    const val = hasInc && inc > 0 ? inc : tot;
    subDaily[dt] = Number(val.toFixed(2));
  });

  const subMonthly = {};
  allMonths.forEach((mk) => {
    let inc = 0;
    let hasInc = false;
    let tot = 0;
    feederItems.forEach((f) => {
      const v = f.monthly[mk] || 0;
      tot += v;
      if (f.isIncoming) {
        inc += v;
        hasInc = true;
      }
    });
    const val = hasInc && inc > 0 ? inc : tot;
    subMonthly[mk] = Number(val.toFixed(2));
  });

  const subYearly = {};
  allYears.forEach((yr) => {
    let inc = 0;
    let hasInc = false;
    let tot = 0;
    feederItems.forEach((f) => {
      const v = f.yearly[yr] || 0;
      tot += v;
      if (f.isIncoming) {
        inc += v;
        hasInc = true;
      }
    });
    const val = hasInc && inc > 0 ? inc : tot;
    subYearly[yr] = Number(val.toFixed(2));
  });

  return {
    subDaily,
    subMonthly,
    subYearly,
    feederItems,
  };
}

// Custom Tooltip Component
function CustomAnalyticsTooltip({
  active,
  payload,
  label,
  unit,
  viewMode,
  analysisMode,
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const d = p.payload || {};

  let headerTitle = d.fullName || d.label || d.name || d.date || label;
  if (viewMode === 'trend') {
    if (analysisMode === 'compare_years') {
      headerTitle = `Month: ${d.label || label}`;
    } else if (analysisMode === 'compare_months') {
      headerTitle = `${d.label || label}`;
    } else if (analysisMode === 'yearly') {
      headerTitle = `${d.label || label}`;
    } else if (analysisMode === 'monthly') {
      headerTitle = `${d.label || label}`;
    } else if (analysisMode === 'timeline') {
      headerTitle = d.date ? `Date: ${d.date}` : (d.label || label);
    }
  } else if (viewMode === 'comparison') {
    if (analysisMode === 'compare_years' || analysisMode === 'compare_months') {
      headerTitle = d.fullName || d.name || label;
    }
  } else if (viewMode === 'feeder') {
    headerTitle = d.label || d.shortLabel || label;
  }

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #d1cdc4',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 10px 25px -5px rgba(26, 60, 52, 0.18)',
        fontSize: '12px',
        color: '#1a1a1a',
        minWidth: '180px',
        maxWidth: '340px',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#1a3c34', borderBottom: '1px solid #f1f0ec', paddingBottom: 4 }}>
        {headerTitle}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {payload.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4a4540' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color || item.fill || COLORS.primary }} />
              {item.name || 'Consumption'}:
            </span>
            <strong style={{ color: '#1a1a1a', fontFamily: "'DM Mono', monospace" }}>
              {Number(item.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit || unit || 'kWh'}
            </strong>
          </div>
        ))}

        {/* Live Variance Calculation in Tooltip for Compare Months */}
        {analysisMode === 'compare_months' && payload.length === 2 && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px dashed #e5e1d8',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            <span style={{ color: '#64748b' }}>Difference:</span>
            {(() => {
              const vA = Number(payload[0].value || 0);
              const vB = Number(payload[1].value || 0);
              const diff = vA - vB;
              const pct = vB > 0 ? (diff / vB) * 100 : 0;
              const isInc = diff > 0;
              return (
                <span style={{ color: isInc ? '#c2622a' : '#16a34a' }}>
                  {isInc ? `+${diff.toFixed(1)}` : diff.toFixed(1)} ({isInc ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`})
                </span>
              );
            })()}
          </div>
        )}

        {d.isIncoming != null && (
          <div style={{ fontSize: '11px', marginTop: 4, color: d.isIncoming ? '#16a34a' : '#c2622a', fontWeight: 600 }}>
            {d.isIncoming ? '⚡ Incoming Main Feed' : '🔌 Outgoing Distribution Circuit'}
          </div>
        )}

        {d.activeFeeders != null && (
          <div style={{ fontSize: '11px', marginTop: 2, color: '#64748b' }}>
            Reporting: {d.activeFeeders} of {d.totalFeeders} locations
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubstationAnalyticsChart({
  section = 'HT',
  reportType = 'daily',
  date = '',
  month = '',
  sectionResults = [],
  activeSheet = {},
  activeResult = null,
  onSelectSheet = () => {},
  docs = [],
  numDaysInMonth = 30,
  onJumpToDate = null,
}) {
  const [viewMode, setViewMode] = useState('comparison'); // 'comparison' | 'feeder' | 'trend'
  const [analysisMode, setAnalysisMode] = useState('timeline'); // 'timeline' | 'monthly' | 'yearly' | 'compare_years' | 'compare_months'
  const [trendChartType, setTrendChartType] = useState('area'); // 'area' | 'bar'
  const [analysisScope, setAnalysisScope] = useState('substation'); // 'substation' | 'section'
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonthA, setSelectedMonthA] = useState('');
  const [selectedMonthB, setSelectedMonthB] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  const unit = activeResult?.items?.[0]?.it?.unit || (section === 'HT' ? 'kWh' : 'kWh');

  // Compute Full Historical Series for Every Substation Sheet and All Feeders
  const allSheetsHistory = useMemo(() => {
    const map = {};
    sectionResults.forEach(({ sh }) => {
      map[sh.id] = computeSheetFullHistory(sh, docs);
    });
    if (activeSheet?.id && !map[activeSheet.id]) {
      map[activeSheet.id] = computeSheetFullHistory(activeSheet, docs);
    }
    return map;
  }, [sectionResults, activeSheet, docs]);

  // Discover all unique dates across history
  const allHistoricalDates = useMemo(() => {
    const set = new Set();
    Object.values(allSheetsHistory).forEach((h) => {
      Object.keys(h.subDaily).forEach((dt) => set.add(dt));
    });
    docs.forEach((d) => {
      if (d.date && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
        set.add(d.date);
      }
    });
    return [...set].sort();
  }, [allSheetsHistory, docs]);

  // Discover unique available years
  const availableYears = useMemo(() => {
    const set = new Set();
    allHistoricalDates.forEach((dt) => {
      const yr = dt.slice(0, 4);
      if (yr.length === 4) set.add(yr);
    });
    if (set.size === 1) {
      const yr = Number([...set][0]);
      if (!isNaN(yr)) set.add(String(yr - 1));
    } else if (set.size === 0) {
      const curYear = new Date().getFullYear();
      set.add(String(curYear - 1));
      set.add(String(curYear));
    }
    return [...set].sort();
  }, [allHistoricalDates]);

  // Discover unique available months (sorted latest first)
  const availableMonths = useMemo(() => {
    const set = new Set();
    allHistoricalDates.forEach((dt) => {
      const mk = dt.slice(0, 7);
      if (mk.length === 7) set.add(mk);
    });
    if (set.size <= 1) {
      const curMonth = month || new Date().toISOString().slice(0, 7);
      set.add(curMonth);
      const [y, m] = curMonth.split('-').map(Number);
      const prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      set.add(prevM);
    }
    return [...set].sort().reverse();
  }, [allHistoricalDates, month]);

  // Initialize selected year and month
  useEffect(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(month || availableMonths[0]);
    }
  }, [availableYears, availableMonths, selectedYear, selectedMonth, month]);

  // Initialize selected years for comparison
  useEffect(() => {
    if (availableYears.length > 0 && selectedYears.length === 0) {
      setSelectedYears(availableYears.slice(-3));
    }
  }, [availableYears, selectedYears.length]);

  // Initialize selected months for comparison
  useEffect(() => {
    if (availableMonths.length > 0) {
      if (!selectedMonthA || !availableMonths.includes(selectedMonthA)) {
        setSelectedMonthA(availableMonths[0]);
      }
      if (!selectedMonthB || !availableMonths.includes(selectedMonthB)) {
        setSelectedMonthB(availableMonths[1] || availableMonths[0]);
      }
    }
  }, [availableMonths, selectedMonthA, selectedMonthB]);

  const toggleYearSelection = (yr) => {
    setSelectedYears((prev) => {
      if (prev.includes(yr)) {
        if (prev.length <= 1) return prev;
        return prev.filter((y) => y !== yr);
      }
      return [...prev, yr].sort();
    });
  };

  const activeCompareYears = useMemo(() => {
    return selectedYears.length > 0 ? selectedYears : availableYears;
  }, [selectedYears, availableYears]);

  // ==========================================================
  // VIEW 1: SUBSTATION COMPARISON DATASETS (ALL 5 MODES)
  // ==========================================================
  const comparisonData = useMemo(() => {
    return sectionResults.map(({ sh, incomingTotal, items }) => {
      const feederSum = items.reduce((acc, x) => acc + (x.c?.total || 0), 0);
      let val = incomingTotal != null && incomingTotal > 0 ? incomingTotal : feederSum;

      if (val === 0 && date && allSheetsHistory[sh.id]?.subDaily?.[date] != null) {
        val = allSheetsHistory[sh.id].subDaily[date];
      }

      if (analysisMode === 'monthly') {
        val = allSheetsHistory[sh.id]?.subMonthly?.[selectedMonth] ?? 0;
      } else if (analysisMode === 'yearly') {
        val = allSheetsHistory[sh.id]?.subYearly?.[selectedYear] ?? 0;
      }

      return {
        id: sh.id,
        name: sh.name.replace(/ Sub Station| \(hourly\)| Panel/gi, '').trim(),
        fullName: sh.name,
        value: Math.max(0, Number(val.toFixed(2))),
        unit: items[0]?.it?.unit || unit,
        activeFeeders: items.filter((x) => x.c?.has).length,
        totalFeeders: items.length,
        isSelected: sh.id === activeSheet?.id,
      };
    });
  }, [sectionResults, activeSheet?.id, unit, date, analysisMode, selectedMonth, selectedYear, allSheetsHistory]);

  const comparisonCompareYearsData = useMemo(() => {
    return sectionResults.map(({ sh }) => {
      const row = {
        id: sh.id,
        name: sh.name.replace(/ Sub Station| \(hourly\)| Panel/gi, '').trim(),
        fullName: sh.name,
        unit,
      };
      activeCompareYears.forEach((yr) => {
        row[yr] = allSheetsHistory[sh.id]?.subYearly?.[yr] ?? 0;
      });
      return row;
    });
  }, [sectionResults, activeCompareYears, allSheetsHistory, unit]);

  const comparisonCompareMonthsData = useMemo(() => {
    return sectionResults.map(({ sh }) => {
      const vA = allSheetsHistory[sh.id]?.subMonthly?.[selectedMonthA] ?? 0;
      const vB = allSheetsHistory[sh.id]?.subMonthly?.[selectedMonthB] ?? 0;
      return {
        id: sh.id,
        name: sh.name.replace(/ Sub Station| \(hourly\)| Panel/gi, '').trim(),
        fullName: sh.name,
        unit,
        [selectedMonthA]: vA,
        [selectedMonthB]: vB,
      };
    });
  }, [sectionResults, selectedMonthA, selectedMonthB, allSheetsHistory, unit]);

  // ==========================================================
  // VIEW 2: FEEDER LOAD BREAKDOWN DATASETS (ALL 5 MODES)
  // ==========================================================
  const activeFeederItems = useMemo(() => {
    return allSheetsHistory[activeSheet?.id]?.feederItems || [];
  }, [allSheetsHistory, activeSheet?.id]);

  const feederData = useMemo(() => {
    if (activeFeederItems.length > 0) {
      return activeFeederItems
        .map((f, idx) => {
          let val = 0;
          if (analysisMode === 'monthly') {
            val = f.monthly[selectedMonth] ?? 0;
          } else if (analysisMode === 'yearly') {
            val = f.yearly[selectedYear] ?? 0;
          } else {
            val = reportType === 'daily' ? (f.daily[date] ?? 0) : (f.monthly[month] ?? 0);
            if (val === 0 && activeResult?.items?.[idx]?.c) {
              const c = activeResult.items[idx].c;
              val = reportType === 'daily' ? (c.perDate?.[date] ?? 0) : (c.total ?? 0);
            }
          }

          return {
            id: f.sn || `f_${idx}`,
            label: f.label,
            shortLabel: f.shortLabel,
            value: Math.max(0, Number(val.toFixed(2))),
            isIncoming: f.isIncoming,
            unit: f.unit || unit,
            hasData: val > 0,
          };
        })
        .sort((a, b) => b.value - a.value);
    }

    if (!activeResult) return [];
    return activeResult.items
      .map(({ it, c }, idx) => {
        const val = reportType === 'daily' ? (c?.perDate?.[date] ?? 0) : (c?.total ?? 0);
        return {
          id: it.sn || `f_${idx}`,
          label: it.label,
          shortLabel: it.label.length > 20 ? it.label.slice(0, 18) + '…' : it.label,
          value: Math.max(0, Number(val.toFixed(2))),
          isIncoming: it.incoming,
          unit: it.unit || unit,
          hasData: c?.has,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [activeFeederItems, activeResult, reportType, date, month, unit, analysisMode, selectedMonth, selectedYear]);

  const feederCompareYearsData = useMemo(() => {
    return activeFeederItems
      .slice(0, 10)
      .map((f, idx) => {
        const row = {
          id: f.sn || `f_${idx}`,
          label: f.label,
          shortLabel: f.shortLabel,
          isIncoming: f.isIncoming,
          unit: f.unit || unit,
        };
        activeCompareYears.forEach((yr) => {
          row[yr] = f.yearly[yr] ?? 0;
        });
        return row;
      });
  }, [activeFeederItems, activeCompareYears, unit]);

  const feederCompareMonthsData = useMemo(() => {
    return activeFeederItems
      .slice(0, 10)
      .map((f, idx) => {
        const vA = f.monthly[selectedMonthA] ?? 0;
        const vB = f.monthly[selectedMonthB] ?? 0;
        return {
          id: f.sn || `f_${idx}`,
          label: f.label,
          shortLabel: f.shortLabel,
          isIncoming: f.isIncoming,
          unit: f.unit || unit,
          [selectedMonthA]: vA,
          [selectedMonthB]: vB,
        };
      });
  }, [activeFeederItems, selectedMonthA, selectedMonthB, unit]);

  // ==========================================================
  // VIEW 3: POWER TREND & TIME-SERIES DATASETS (ALL 5 MODES)
  // ==========================================================
  const allHistoricalDaily = useMemo(() => {
    const isSection = analysisScope === 'section';

    return allHistoricalDates.map((dt) => {
      const [y, m, d] = dt.split('-');
      const monthKey = `${y}-${m}`;

      const subVal = allSheetsHistory[activeSheet?.id]?.subDaily?.[dt] ?? 0;
      let secVal = 0;
      sectionResults.forEach(({ sh }) => {
        secVal += allSheetsHistory[sh.id]?.subDaily?.[dt] ?? 0;
      });

      const activeVal = isSection ? secVal : subVal;

      return {
        date: dt,
        dateStr: dt,
        year: y,
        month: m,
        day: d,
        monthKey,
        value: Number(activeVal.toFixed(2)),
        subVal: Number(subVal.toFixed(2)),
        secVal: Number(secVal.toFixed(2)),
        unit,
      };
    });
  }, [allHistoricalDates, allSheetsHistory, analysisScope, activeSheet?.id, sectionResults, unit]);

  // MODE 1: Granular Timeline Dataset
  const trendData = useMemo(() => {
    const isSection = analysisScope === 'section';

    if (reportType === 'monthly') {
      const days = [...Array(numDaysInMonth).keys()].map((i) => {
        const dNum = String(i + 1).padStart(2, '0');
        return `${month}-${dNum}`;
      });

      return days.map((dStr) => {
        const dNum = dStr.slice(8);
        const match = allHistoricalDaily.find((h) => h.dateStr === dStr);

        let activeVal = 0;
        if (match) {
          activeVal = isSection ? match.secVal : match.subVal;
        } else if (activeResult) {
          activeResult.items.forEach(({ it, c }) => {
            if (it.incoming && c?.perDate?.[dStr] != null) {
              activeVal += c.perDate[dStr];
            }
          });
          if (activeVal === 0) {
            activeResult.items.forEach(({ c }) => {
              if (c?.perDate?.[dStr] != null) activeVal += c.perDate[dStr];
            });
          }
        }

        return {
          date: dStr,
          label: `${dNum} ${month.slice(5) === '10' ? 'Oct' : ''}`,
          shortLabel: dNum,
          value: Number(activeVal.toFixed(2)),
          unit,
        };
      });
    }

    // Daily Mode: Trailing 14 days curve leading to current date
    const dates = [];
    const curr = new Date(date || new Date().toISOString().slice(0, 10));
    for (let i = 13; i >= 0; i--) {
      const past = new Date(curr);
      past.setDate(past.getDate() - i);
      dates.push(past.toISOString().slice(0, 10));
    }

    return dates.map((dStr) => {
      const match = allHistoricalDaily.find((h) => h.dateStr === dStr);
      let val = 0;
      if (match) {
        val = isSection ? match.secVal : match.subVal;
      } else if (activeResult) {
        activeResult.items.forEach(({ it, c }) => {
          if (it.incoming && c?.perDate?.[dStr] != null) {
            val += c.perDate[dStr];
          }
        });
        if (val === 0) {
          activeResult.items.forEach(({ c }) => {
            if (c?.perDate?.[dStr] != null) val += c.perDate[dStr];
          });
        }
      }

      return {
        date: dStr,
        label: dStr.slice(5),
        shortLabel: dStr.slice(8),
        value: Number(val.toFixed(2)),
        isCurrent: dStr === date,
        unit,
      };
    });
  }, [reportType, month, numDaysInMonth, date, allHistoricalDaily, analysisScope, activeResult, unit]);

  // MODE 2: Monthly Aggregated Data
  const monthlyData = useMemo(() => {
    const map = new Map();
    allHistoricalDaily.forEach((d) => {
      if (!d.monthKey) return;
      const mk = d.monthKey;
      let entry = map.get(mk);
      if (!entry) {
        entry = {
          label: formatMonthLabel(mk),
          monthKey: mk,
          value: 0,
          count: 0,
          unit,
        };
        map.set(mk, entry);
      }
      entry.value += d.value;
      entry.count += 1;
    });

    const list = [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    list.forEach((e) => {
      e.value = Number(e.value.toFixed(2));
    });
    return list;
  }, [allHistoricalDaily, unit]);

  // MODE 3: Yearly Aggregated Data
  const yearlyData = useMemo(() => {
    const map = new Map();
    allHistoricalDaily.forEach((d) => {
      if (!d.year) return;
      const yr = d.year;
      let entry = map.get(yr);
      if (!entry) {
        entry = {
          label: `Year ${yr}`,
          year: yr,
          value: 0,
          count: 0,
          unit,
        };
        map.set(yr, entry);
      }
      entry.value += d.value;
      entry.count += 1;
    });

    const list = [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
    list.forEach((e) => {
      e.value = Number(e.value.toFixed(2));
    });
    return list;
  }, [allHistoricalDaily, unit]);

  // MODE 4: Compare Years (YoY) Overlay Dataset across 12 months (Jan–Dec)
  const compareYearsData = useMemo(() => {
    return MONTH_NAMES.map((mName, mIdx) => {
      const monthNum = String(mIdx + 1).padStart(2, '0');
      const row = { label: mName, monthNum: mIdx + 1 };
      activeCompareYears.forEach((yr) => {
        const matching = allHistoricalDaily.filter((d) => d.year === yr && d.month === monthNum);
        const sum = matching.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        row[yr] = Number(sum.toFixed(2));
      });
      return row;
    });
  }, [activeCompareYears, allHistoricalDaily]);

  // MODE 5: Compare Months Side-by-Side Dataset (Day 01–Day 31)
  const compareMonthsData = useMemo(() => {
    if (!selectedMonthA || !selectedMonthB) return [];
    const days = [];
    for (let d = 1; d <= 31; d++) {
      const dayStr = String(d).padStart(2, '0');
      const matchA = allHistoricalDaily.find((item) => item.monthKey === selectedMonthA && item.day === dayStr);
      const matchB = allHistoricalDaily.find((item) => item.monthKey === selectedMonthB && item.day === dayStr);
      const valA = matchA ? Number(matchA.value) : 0;
      const valB = matchB ? Number(matchB.value) : 0;
      days.push({
        label: `Day ${dayStr}`,
        day: d,
        [selectedMonthA]: Number(valA.toFixed(2)),
        [selectedMonthB]: Number(valB.toFixed(2)),
      });
    }
    return days;
  }, [allHistoricalDaily, selectedMonthA, selectedMonthB]);

  // ==========================================================
  // LIVE VARIANCE STATS (CONTEXTUALIZED FOR ALL 3 VIEWS)
  // ==========================================================
  const monthCompStats = useMemo(() => {
    if (!selectedMonthA || !selectedMonthB) return null;

    let totA = 0;
    let totB = 0;

    if (viewMode === 'comparison') {
      totA = comparisonCompareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthA]) || 0), 0);
      totB = comparisonCompareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthB]) || 0), 0);
    } else if (viewMode === 'feeder') {
      totA = feederCompareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthA]) || 0), 0);
      totB = feederCompareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthB]) || 0), 0);
    } else {
      totA = compareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthA]) || 0), 0);
      totB = compareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthB]) || 0), 0);
    }

    const diff = totA - totB;
    const pct = totB > 0 ? (diff / totB) * 100 : 0;
    return {
      totA: Number(totA.toFixed(1)),
      totB: Number(totB.toFixed(1)),
      diff: Number(diff.toFixed(1)),
      pct: Number(pct.toFixed(1)),
    };
  }, [viewMode, comparisonCompareMonthsData, feederCompareMonthsData, compareMonthsData, selectedMonthA, selectedMonthB]);

  // Active trend chart dataset depending on mode
  const activeTrendChartData = useMemo(() => {
    if (analysisMode === 'monthly') return monthlyData;
    if (analysisMode === 'yearly') return yearlyData;
    if (analysisMode === 'compare_years') return compareYearsData;
    if (analysisMode === 'compare_months') return compareMonthsData;
    return trendData;
  }, [analysisMode, monthlyData, yearlyData, compareYearsData, compareMonthsData, trendData]);

  // Dynamic titles and labels
  const scopeLabel = analysisScope === 'section' ? `All ${section} Substations Combined` : (activeSheet?.name || 'Substation');

  const chartTitle = useMemo(() => {
    if (viewMode === 'comparison') {
      const modeSuffix =
        analysisMode === 'monthly'
          ? ` · ${formatMonthLabel(selectedMonth)}`
          : analysisMode === 'yearly'
          ? ` · Annual ${selectedYear}`
          : analysisMode === 'compare_years'
          ? ` · Multi-Year Overlay (${activeCompareYears.join(' vs ')})`
          : analysisMode === 'compare_months'
          ? ` · ${formatMonthLabel(selectedMonthA)} vs ${formatMonthLabel(selectedMonthB)}`
          : '';
      return `Substation Energy Comparison (${section} Panels)${modeSuffix}`;
    }
    if (viewMode === 'feeder') {
      const modeSuffix =
        analysisMode === 'monthly'
          ? ` · ${formatMonthLabel(selectedMonth)}`
          : analysisMode === 'yearly'
          ? ` · Annual ${selectedYear}`
          : analysisMode === 'compare_years'
          ? ` · Multi-Year Comparison (${activeCompareYears.join(' vs ')})`
          : analysisMode === 'compare_months'
          ? ` · ${formatMonthLabel(selectedMonthA)} vs ${formatMonthLabel(selectedMonthB)}`
          : '';
      return `${activeSheet?.name || 'Substation'} Feeder Load Breakdown${modeSuffix}`;
    }
    const modeName =
      analysisMode === 'timeline'
        ? '📅 Granular Timeline'
        : analysisMode === 'monthly'
        ? '📊 Monthly Trend'
        : analysisMode === 'yearly'
        ? '📆 Yearly Trend'
        : analysisMode === 'compare_years'
        ? '🔄 Year-over-Year (YoY) Overlay'
        : '⚖️ Month-to-Month Variance';
    return `${scopeLabel} · ${modeName}`;
  }, [viewMode, activeSheet?.name, section, scopeLabel, analysisMode, selectedMonth, selectedYear, selectedMonthA, selectedMonthB, activeCompareYears]);

  const xAxisTitle = useMemo(() => {
    if (viewMode === 'comparison') {
      return 'X-Axis: Substation / Panel Name';
    }
    if (viewMode === 'feeder') {
      if (analysisMode === 'compare_years' || analysisMode === 'compare_months') {
        return 'X-Axis: Feeder / Circuit Name';
      }
      return `X-Axis: Energy Consumption (${unit || 'kWh'})`;
    }
    if (analysisMode === 'timeline') {
      return reportType === 'daily' ? 'X-Axis: Hourly Time Slot / Date' : 'X-Axis: Date (Day of Month)';
    }
    if (analysisMode === 'monthly') return 'X-Axis: Month (Chronological)';
    if (analysisMode === 'yearly') return 'X-Axis: Year (Annual Summary)';
    if (analysisMode === 'compare_years') return 'X-Axis: Month of Year (Jan – Dec)';
    if (analysisMode === 'compare_months') return 'X-Axis: Day of Month (Day 01 – Day 31)';
    return 'X-Axis: Timeline';
  }, [viewMode, analysisMode, reportType, unit]);

  const yAxisTitle = useMemo(() => {
    if (viewMode === 'feeder') {
      if (analysisMode === 'compare_years' || analysisMode === 'compare_months') {
        return `Y-Axis: Energy Consumption (${unit || 'kWh'})`;
      }
      return 'Y-Axis: Feeder / Circuit Name';
    }
    if (viewMode === 'trend') {
      if (analysisMode === 'yearly') return `Y-Axis: Annual Consumption (${unit || 'kWh'})`;
      if (analysisMode === 'monthly') return `Y-Axis: Monthly Consumption (${unit || 'kWh'})`;
      return `Y-Axis: Daily Consumption (${unit || 'kWh'})`;
    }
    return `Y-Axis: Energy Consumption (${unit || 'kWh'})`;
  }, [viewMode, analysisMode, unit]);

  // Aggregate stats for KPI badges
  const stats = useMemo(() => {
    const totalEnergy = comparisonData.reduce((acc, x) => acc + x.value, 0);
    const sortedSubs = [...comparisonData].sort((a, b) => b.value - a.value);
    const topSub = sortedSubs[0] || null;

    const validTrendPoints = activeTrendChartData.filter((d) => d.value > 0);
    const trendAvg = validTrendPoints.length
      ? validTrendPoints.reduce((acc, d) => acc + d.value, 0) / validTrendPoints.length
      : 0;
    const trendPeak = validTrendPoints.length ? Math.max(...validTrendPoints.map((d) => d.value)) : 0;

    const hasData = totalEnergy > 0 || feederData.some((f) => f.value > 0) || allHistoricalDaily.some((h) => h.value > 0);

    return {
      totalEnergy,
      topSub,
      trendAvg,
      trendPeak,
      hasData,
    };
  }, [comparisonData, feederData, activeTrendChartData, allHistoricalDaily]);

  // Gradient IDs
  const gradSubstation = `substationGrad_${section}`;
  const gradTrend = `trendGrad_${section}`;
  const gradFeeder = `feederGrad_${section}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
      {/* 1. Quick Stats Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
        }}
      >
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'rgba(26, 60, 52, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--green-900)',
            }}
          >
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Total {section} Power ({analysisMode === 'monthly' ? formatMonthLabel(selectedMonth) : analysisMode === 'yearly' ? `Year ${selectedYear}` : 'Logged'})
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
              {stats.totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unit}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'rgba(194, 98, 42, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--orange-600)',
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Peak Consuming Substation
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginTop: 2 }}>
              {stats.topSub && stats.topSub.value > 0 ? (
                <>
                  {stats.topSub.name}{' '}
                  <span style={{ fontSize: 12, color: 'var(--orange-600)', fontFamily: "'DM Mono', monospace" }}>
                    ({stats.topSub.value.toLocaleString()} {unit})
                  </span>
                </>
              ) : (
                '–'
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'rgba(45, 74, 62, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--green-800)',
            }}
          >
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Active Panel / Substation
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green-900)', marginTop: 2 }}>
              {activeSheet?.name || 'Selected'}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'rgba(22, 163, 74, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--status-ok)',
            }}
          >
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Historical Telemetry Logs
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--status-ok)', marginTop: 2 }}>
              {allHistoricalDates.length} Days Recorded ✓
            </div>
          </div>
        </div>
      </div>

      {/* Zero Data Helpful Banner */}
      {!stats.hasData && onJumpToDate && (
        <div
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px dashed var(--glass-border-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 12.5,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} color="var(--orange-600)" />
            <span>
              Selected date <strong>{date}</strong> has 0 logged entries. Logs exist in historical timeline.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '4px 12px', fontSize: 12, height: 30 }}
            onClick={onJumpToDate}
          >
            📅 View Latest Recorded Logs
          </button>
        </div>
      )}

      {/* 2. Interactive Analytics Glass Card */}
      <div className="glass-card" style={{ marginBottom: 0 }}>
        {/* Card Header & Primary Tabs */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Title & Scope Label */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="var(--green-800)" />
              <span>{chartTitle}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {reportType === 'daily' ? `Log Date: ${date}` : `Monthly Period: ${month}`} · Units in {unit}
            </div>
          </div>

          {/* Interactive View Switcher Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('comparison')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: viewMode === 'comparison' ? 700 : 500,
                  border: 'none',
                  background: viewMode === 'comparison' ? 'var(--green-800)' : 'transparent',
                  color: viewMode === 'comparison' ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <BarChart3 size={13} />
                <span>Substation Comparison</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('feeder')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: viewMode === 'feeder' ? 700 : 500,
                  border: 'none',
                  background: viewMode === 'feeder' ? 'var(--green-800)' : 'transparent',
                  color: viewMode === 'feeder' ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Zap size={13} />
                <span>Feeder Load Breakdown</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('trend')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: viewMode === 'trend' ? 700 : 500,
                  border: 'none',
                  background: viewMode === 'trend' ? 'var(--green-800)' : 'transparent',
                  color: viewMode === 'trend' ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <TrendingUp size={13} />
                <span>Power Trend & Analysis</span>
              </button>
            </div>

            {/* Toggle area vs bar when in Trend view */}
            {viewMode === 'trend' && (
              <div
                style={{
                  display: 'inline-flex',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 8,
                  padding: 3,
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => setTrendChartType('area')}
                  style={{
                    padding: '5px 9px',
                    fontSize: 11,
                    fontWeight: trendChartType === 'area' ? 700 : 500,
                    border: 'none',
                    background: trendChartType === 'area' ? 'var(--bg-tertiary)' : 'transparent',
                    color: trendChartType === 'area' ? 'var(--green-900)' : 'var(--text-muted)',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  📈 Spline
                </button>
                <button
                  type="button"
                  onClick={() => setTrendChartType('bar')}
                  style={{
                    padding: '5px 9px',
                    fontSize: 11,
                    fontWeight: trendChartType === 'bar' ? 700 : 500,
                    border: 'none',
                    background: trendChartType === 'bar' ? 'var(--bg-tertiary)' : 'transparent',
                    color: trendChartType === 'bar' ? 'var(--green-900)' : 'var(--text-muted)',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  📊 Bar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5-Mode Primary Trend & Comparison Toolbar (ACTIVE ACROSS ALL 3 VIEWS) */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* The 5 Analysis Modes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginRight: 2 }}>
              Mode:
            </span>
            {[
              { id: 'timeline', label: '📅 Timeline', title: 'Regular granular view' },
              { id: 'monthly', label: '📊 Monthly Trend', title: 'Aggregated monthly consumption' },
              { id: 'yearly', label: '📆 Yearly Trend', title: 'Annual totals with year-over-year trends' },
              { id: 'compare_years', label: '🔄 Compare Years', title: 'Multi-year side-by-side overlay comparison' },
              { id: 'compare_months', label: '⚖️ Compare Months', title: 'Side-by-side day-by-day comparison with live variance' },
            ].map((m) => {
              const isActive = analysisMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAnalysisMode(m.id)}
                  title={m.title}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '11.5px',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'var(--green-800)' : 'var(--bg-tertiary)',
                    color: isActive ? '#ffffff' : 'var(--text-main)',
                    border: isActive ? '1px solid var(--green-900)' : '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Context Controls: Single Month / Single Year / Scope Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* When in Monthly view: choose month */}
            {analysisMode === 'monthly' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11.5,
                    borderRadius: 6,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-main)',
                  }}
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* When in Yearly view: choose year */}
            {analysisMode === 'yearly' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>Select Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11.5,
                    borderRadius: 6,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-main)',
                  }}
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>Year {yr}</option>
                  ))}
                </select>
              </div>
            )}

            {/* In Trend View: Scope Switcher */}
            {viewMode === 'trend' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>Scope:</span>
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 6,
                    padding: 2,
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAnalysisScope('substation')}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: analysisScope === 'substation' ? 700 : 500,
                      borderRadius: 4,
                      border: 'none',
                      background: analysisScope === 'substation' ? 'var(--green-800)' : 'transparent',
                      color: analysisScope === 'substation' ? '#ffffff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    🏢 {activeSheet?.name ? activeSheet.name.replace(/ Sub Station| \(hourly\)| Panel/gi, '') : 'Active Substation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisScope('section')}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: analysisScope === 'section' ? 700 : 500,
                      borderRadius: 4,
                      border: 'none',
                      background: analysisScope === 'section' ? 'var(--green-800)' : 'transparent',
                      color: analysisScope === 'section' ? '#ffffff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ All {section} Panels
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sub-selectors for Compare Years across all 3 views */}
        {analysisMode === 'compare_years' && (
          <div
            style={{
              padding: '8px 18px',
              borderBottom: '1px solid var(--glass-border)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
                Select Years to Overlay:
              </span>
              {availableYears.map((yr, idx) => {
                const isSelected = selectedYears.includes(yr);
                const color = YEAR_COLORS[idx % YEAR_COLORS.length];
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => toggleYearSelection(yr)}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: isSelected ? 700 : 500,
                      border: `1.5px solid ${color}`,
                      background: isSelected ? color : 'transparent',
                      color: isSelected ? '#ffffff' : color,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓ ' : ''}{yr}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {viewMode === 'comparison' && 'Compares all substations side-by-side for each selected year.'}
              {viewMode === 'feeder' && 'Compares top feeder loads side-by-side for each selected year.'}
              {viewMode === 'trend' && 'Overlays monthly consumption (Jan–Dec) for chosen years side-by-side.'}
            </div>
          </div>
        )}

        {/* Sub-selectors for Compare Months across all 3 views */}
        {analysisMode === 'compare_months' && (
          <div
            style={{
              padding: '8px 18px',
              borderBottom: '1px solid var(--glass-border)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1a3c34' }}>Month 1:</span>
                <select
                  value={selectedMonthA}
                  onChange={(e) => setSelectedMonthA(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11.5,
                    borderRadius: 6,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-main)',
                  }}
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c2622a' }}>Month 2:</span>
                <select
                  value={selectedMonthB}
                  onChange={(e) => setSelectedMonthB(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11.5,
                    borderRadius: 6,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-main)',
                  }}
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {viewMode === 'comparison' && 'Compares all substations between Month 1 and Month 2 with live variance.'}
              {viewMode === 'feeder' && 'Compares active substation feeders between Month 1 and Month 2 with live variance.'}
              {viewMode === 'trend' && 'Compares Day 01 to Day 31 side-by-side with live variance calculation.'}
            </div>
          </div>
        )}

        {/* Month-to-Month Live Variance Summary Card across all 3 views */}
        {analysisMode === 'compare_months' && monthCompStats && (
          <div
            style={{
              margin: '10px 16px 4px 16px',
              padding: '10px 16px',
              background: 'rgba(26, 60, 52, 0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span>
                <strong style={{ color: '#1a3c34' }}>{formatMonthLabel(selectedMonthA)}:</strong>{' '}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                  {monthCompStats.totA.toLocaleString()} {unit}
                </span>
              </span>
              <span>
                <strong style={{ color: '#c2622a' }}>{formatMonthLabel(selectedMonthB)}:</strong>{' '}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                  {monthCompStats.totB.toLocaleString()} {unit}
                </span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                {viewMode === 'comparison' ? `All ${section} Net Variance:` : viewMode === 'feeder' ? 'Substation Net Variance:' : 'Net Variance:'}
              </span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 11.5,
                  fontFamily: "'DM Mono', monospace",
                  background: monthCompStats.diff <= 0 ? '#dcfce7' : '#fee2e2',
                  color: monthCompStats.diff <= 0 ? '#15803d' : '#b91c1c',
                  border: `1px solid ${monthCompStats.diff <= 0 ? '#86efac' : '#fca5a5'}`,
                }}
              >
                {monthCompStats.diff >= 0 ? `+${monthCompStats.diff.toLocaleString()}` : monthCompStats.diff.toLocaleString()} {unit} ({monthCompStats.pct >= 0 ? `+${monthCompStats.pct}%` : `${monthCompStats.pct}%`})
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Axis Guide Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '7px 14px',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            fontSize: '11.5px',
            color: 'var(--text-main)',
            margin: '8px 16px 8px 16px',
          }}
        >
          <span style={{ fontWeight: 700, color: COLORS.accent }}>📌 Graph Axis Labels:</span>
          <span>
            <strong style={{ color: 'var(--text-muted)' }}>X-Axis:</strong>{' '}
            {xAxisTitle.replace(/^X-Axis:\s*/i, '')}
          </span>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <span>
            <strong style={{ color: 'var(--text-muted)' }}>Y-Axis:</strong>{' '}
            {yAxisTitle.replace(/^Y-Axis:\s*/i, '')}
          </span>
        </div>

        {/* SVG Recharts Canvas */}
        <div style={{ padding: '10px 20px 14px 10px', width: '100%', height: 350, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'comparison' ? (
              analysisMode === 'compare_years' ? (
                /* Substation Comparison - Compare Years */
                <ComposedChart data={comparisonCompareYearsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    dy={4}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={68}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 2,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                  {activeCompareYears.map((yr, idx) => (
                    <Bar
                      key={yr}
                      dataKey={yr}
                      name={`Year ${yr}`}
                      fill={YEAR_COLORS[idx % YEAR_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      animationDuration={600}
                    />
                  ))}
                </ComposedChart>
              ) : analysisMode === 'compare_months' ? (
                /* Substation Comparison - Compare Months */
                <ComposedChart data={comparisonCompareMonthsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    dy={4}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={68}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 2,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                  <Bar
                    dataKey={selectedMonthA}
                    name={formatMonthLabel(selectedMonthA)}
                    fill="#1a3c34"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    animationDuration={600}
                  />
                  <Bar
                    dataKey={selectedMonthB}
                    name={formatMonthLabel(selectedMonthB)}
                    fill="#c2622a"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    animationDuration={600}
                  />
                </ComposedChart>
              ) : (
                /* Substation Comparison - Standard / Monthly / Yearly */
                <BarChart data={comparisonData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                  <defs>
                    <linearGradient id={gradSubstation} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1a3c34" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#3d6b55" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id={`${gradSubstation}_selected`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c2622a" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#ea580c" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    dy={4}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={68}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 2,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Bar
                    dataKey="value"
                    name="Energy Consumption"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                    animationDuration={600}
                    onClick={(entry) => entry && entry.id && onSelectSheet(entry.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {comparisonData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isSelected ? `url(#${gradSubstation}_selected)` : `url(#${gradSubstation})`}
                        stroke={entry.isSelected ? '#c2622a' : '#1a3c34'}
                        strokeWidth={entry.isSelected ? 2 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              )
            ) : viewMode === 'feeder' ? (
              analysisMode === 'compare_years' ? (
                /* Feeder Breakdown - Compare Years */
                <ComposedChart data={feederCompareYearsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="shortLabel"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    dy={4}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={68}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 2,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                  {activeCompareYears.map((yr, idx) => (
                    <Bar
                      key={yr}
                      dataKey={yr}
                      name={`Year ${yr}`}
                      fill={YEAR_COLORS[idx % YEAR_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      animationDuration={600}
                    />
                  ))}
                </ComposedChart>
              ) : analysisMode === 'compare_months' ? (
                /* Feeder Breakdown - Compare Months */
                <ComposedChart data={feederCompareMonthsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="shortLabel"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    dy={4}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={68}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 2,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                  <Bar
                    dataKey={selectedMonthA}
                    name={formatMonthLabel(selectedMonthA)}
                    fill="#1a3c34"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    animationDuration={600}
                  />
                  <Bar
                    dataKey={selectedMonthB}
                    name={formatMonthLabel(selectedMonthB)}
                    fill="#c2622a"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    animationDuration={600}
                  />
                </ComposedChart>
              ) : (
                /* Feeder Breakdown - Standard / Monthly / Yearly (Ranked Horizontal Bars) */
                <BarChart
                  data={feederData.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 12, right: 30, left: 24, bottom: 26 }}
                >
                  <defs>
                    <linearGradient id={gradFeeder} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2d4a3e" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#4d8c6e" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id={`${gradFeeder}_inc`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#1a3c34" stopOpacity={1} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                  <XAxis
                    type="number"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    label={{
                      value: xAxisTitle,
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="shortLabel"
                    stroke="var(--text-dim)"
                    fontSize={11}
                    tickLine={false}
                    width={150}
                    label={{
                      value: yAxisTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: -4,
                      fill: 'var(--text-main)',
                      fontSize: 11,
                      fontWeight: 700,
                      style: { textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                  <Bar
                    dataKey="value"
                    name="Feeder Load"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={22}
                    animationDuration={600}
                  >
                    {feederData.slice(0, 10).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isIncoming ? `url(#${gradFeeder}_inc)` : FEEDER_PALETTE[index % FEEDER_PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              )
            ) : analysisMode === 'compare_years' ? (
              /* Power Trend - Year-over-Year (YoY) Overlay Comparison */
              <ComposedChart data={compareYearsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                <XAxis
                  dataKey="label"
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  dy={4}
                  label={{
                    value: xAxisTitle,
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
                <YAxis
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                  width={68}
                  label={{
                    value: yAxisTitle,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 2,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                {activeCompareYears.map((yr, idx) => {
                  const color = YEAR_COLORS[idx % YEAR_COLORS.length];
                  return trendChartType === 'bar' ? (
                    <Bar
                      key={yr}
                      dataKey={yr}
                      name={`Year ${yr}`}
                      fill={color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      animationDuration={600}
                    />
                  ) : (
                    <Line
                      key={yr}
                      type="monotone"
                      dataKey={yr}
                      name={`Year ${yr}`}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: color, stroke: '#fff', strokeWidth: 1.5 }}
                      activeDot={{ r: 5 }}
                      animationDuration={600}
                    />
                  );
                })}
              </ComposedChart>
            ) : analysisMode === 'compare_months' ? (
              /* Power Trend - Month-to-Month Side-by-Side Day 01-31 Comparison */
              <ComposedChart data={compareMonthsData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                <defs>
                  <linearGradient id="gradMonthA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a3c34" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#1a3c34" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradMonthB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c2622a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#c2622a" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                <XAxis
                  dataKey="label"
                  stroke="var(--text-dim)"
                  fontSize={10.5}
                  tickLine={false}
                  dy={4}
                  interval={1}
                  label={{
                    value: xAxisTitle,
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
                <YAxis
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                  width={68}
                  label={{
                    value: yAxisTitle,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 2,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />
                <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} />

                {trendChartType === 'bar' ? (
                  <>
                    <Bar
                      dataKey={selectedMonthA}
                      name={formatMonthLabel(selectedMonthA)}
                      fill="#1a3c34"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                      animationDuration={600}
                    />
                    <Bar
                      dataKey={selectedMonthB}
                      name={formatMonthLabel(selectedMonthB)}
                      fill="#c2622a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                      animationDuration={600}
                    />
                  </>
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey={selectedMonthA}
                      name={formatMonthLabel(selectedMonthA)}
                      stroke="#1a3c34"
                      strokeWidth={2.5}
                      fill="url(#gradMonthA)"
                      dot={{ r: 2.5, fill: '#1a3c34' }}
                      activeDot={{ r: 4.5 }}
                      animationDuration={600}
                    />
                    <Area
                      type="monotone"
                      dataKey={selectedMonthB}
                      name={formatMonthLabel(selectedMonthB)}
                      stroke="#c2622a"
                      strokeWidth={2.5}
                      fill="url(#gradMonthB)"
                      dot={{ r: 2.5, fill: '#c2622a' }}
                      activeDot={{ r: 4.5 }}
                      animationDuration={600}
                    />
                  </>
                )}
              </ComposedChart>
            ) : (
              /* Power Trend - MODES 1, 2, 3: Timeline, Monthly Trend, Yearly Trend */
              <ComposedChart data={activeTrendChartData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                <defs>
                  <linearGradient id={gradTrend} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a3c34" stopOpacity={0.4} />
                    <stop offset="65%" stopColor="#3d6b55" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3d6b55" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                <XAxis
                  dataKey={analysisMode === 'timeline' ? 'shortLabel' : 'label'}
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  dy={4}
                  label={{
                    value: xAxisTitle,
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
                <YAxis
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                  width={68}
                  label={{
                    value: yAxisTitle,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 2,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} analysisMode={analysisMode} />} />

                {stats.trendAvg > 0 && analysisMode === 'timeline' && (
                  <ReferenceLine
                    y={stats.trendAvg}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Avg: ${stats.trendAvg.toFixed(0)} ${unit}`,
                      fill: '#d97706',
                      fontSize: 10,
                      fontWeight: 600,
                      position: 'insideTopRight',
                    }}
                  />
                )}

                {trendChartType === 'area' ? (
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={scopeLabel}
                    stroke="#1a3c34"
                    strokeWidth={2.5}
                    fill={`url(#${gradTrend})`}
                    dot={{ r: 3, fill: '#1a3c34', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: '#1a3c34', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={600}
                  />
                ) : (
                  <Bar
                    dataKey="value"
                    name={scopeLabel}
                    fill="#1a3c34"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={analysisMode === 'yearly' ? 56 : 36}
                    animationDuration={600}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Chart Bottom Info Bar */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--glass-border)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span>
              💡 <strong>Tip:</strong>{' '}
              {viewMode === 'comparison' && analysisMode === 'timeline' && 'Click on any substation bar to inspect its feeder breakdown.'}
              {viewMode === 'comparison' && analysisMode === 'monthly' && `Showing all ${section} substations for ${formatMonthLabel(selectedMonth)}.`}
              {viewMode === 'comparison' && analysisMode === 'yearly' && `Showing annual totals for all ${section} substations for Year ${selectedYear}.`}
              {viewMode === 'comparison' && analysisMode === 'compare_years' && 'Select any years to compare all substations side-by-side YoY.'}
              {viewMode === 'comparison' && analysisMode === 'compare_months' && 'Compare all substations between two selected months with net variance.'}
              {viewMode === 'feeder' && analysisMode === 'timeline' && 'Green bars indicate incoming feeds, other bars represent outgoing load circuits.'}
              {viewMode === 'feeder' && analysisMode === 'monthly' && `Showing active feeder loads for ${formatMonthLabel(selectedMonth)}.`}
              {viewMode === 'feeder' && analysisMode === 'yearly' && `Showing active feeder annual loads for Year ${selectedYear}.`}
              {viewMode === 'feeder' && analysisMode === 'compare_years' && 'Side-by-side feeder load comparison across chosen years.'}
              {viewMode === 'feeder' && analysisMode === 'compare_months' && 'Side-by-side feeder circuit comparison between two selected months.'}
              {viewMode === 'trend' && analysisMode === 'timeline' && 'The dashed amber line shows the average daily load for this cycle.'}
              {viewMode === 'trend' && analysisMode === 'monthly' && 'Aggregates all daily consumption across the campus history month-by-month.'}
              {viewMode === 'trend' && analysisMode === 'yearly' && 'Shows annual energy consumption totals and multi-year progression.'}
              {viewMode === 'trend' && analysisMode === 'compare_years' && 'Select any years above to overlay monthly trends (Jan–Dec) side-by-side.'}
              {viewMode === 'trend' && analysisMode === 'compare_months' && 'Select any two months to inspect day-by-day (1–31) variance and net deltas.'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                color: 'var(--green-900)',
              }}
            >
              Active: {viewMode === 'comparison' ? `All ${section} Substations` : scopeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
