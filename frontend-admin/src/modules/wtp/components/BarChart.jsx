import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { fmt } from '../lib/format';

const PALETTES = {
  water: {
    primary: '#2d4a3e', // IITGN Pine Green
    secondary: '#4d8c6e', // IITGN Sage Green
    gradientStart: '#3d6b55',
    gradientEnd: '#d1fae5',
    stroke: '#1a3c34',
  },
  chemical: {
    primary: '#c2622a', // IITGN Terracotta
    secondary: '#d97706', // Warm Amber
    gradientStart: '#ea580c',
    gradientEnd: '#fff7ed',
    stroke: '#9a3412',
  },
  emerald: {
    primary: '#16a34a',
    secondary: '#4ade80',
    gradientStart: '#22c55e',
    gradientEnd: '#dcfce7',
    stroke: '#15803d',
  },
  indigo: {
    primary: '#1a3c34',
    secondary: '#3d6b55',
    gradientStart: '#2d4a3e',
    gradientEnd: '#d1fae5',
    stroke: '#1a3c34',
  },
};

const YEAR_COLORS = [
  '#1a3c34', // Forest Pine
  '#c2622a', // Terracotta
  '#0284c7', // Sky Blue
  '#d97706', // Amber
  '#7c3aed', // Royal Violet
  '#059669', // Emerald
  '#e11d48', // Rose
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parsePointDate(item) {
  if (!item) return null;
  if (item.date && typeof item.date === 'string') {
    const m = item.date.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (m) {
      return {
        year: m[1],
        month: m[2].padStart(2, '0'),
        day: m[3] ? m[3].padStart(2, '0') : '01',
        monthKey: `${m[1]}-${m[2].padStart(2, '0')}`,
        dateStr: item.date,
      };
    }
  }
  const str = String(item.title || item.label || '');
  const m = str.match(/(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (m) {
    return {
      year: m[1],
      month: m[2].padStart(2, '0'),
      day: m[3] ? m[3].padStart(2, '0') : '01',
      monthKey: `${m[1]}-${m[2].padStart(2, '0')}`,
      dateStr: `${m[1]}-${m[2].padStart(2, '0')}-${m[3] ? m[3].padStart(2, '0') : '01'}`,
    };
  }
  return null;
}

function formatMonthLabel(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return monthKey || '';
  const [y, m] = monthKey.split('-');
  const idx = parseInt(m, 10) - 1;
  const name = MONTH_NAMES[idx] || m;
  return `${name} ${y}`;
}

function computeExtendedYMax(dataMax, referenceValue) {
  const rawMax = Math.max(Number(dataMax) || 0, Number(referenceValue) || 0);
  if (rawMax <= 0) return 10;
  
  // Provide 25% headroom so the tallest bar never hits the ceiling
  const target = rawMax * 1.25;
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const ratio = target / power;
  
  let multiplier = 10.0;
  if (ratio <= 1.2) multiplier = 1.2;
  else if (ratio <= 1.5) multiplier = 1.5;
  else if (ratio <= 2.0) multiplier = 2.0;
  else if (ratio <= 2.5) multiplier = 2.5;
  else if (ratio <= 3.0) multiplier = 3.0;
  else if (ratio <= 4.0) multiplier = 4.0;
  else if (ratio <= 5.0) multiplier = 5.0;
  else if (ratio <= 6.0) multiplier = 6.0;
  else if (ratio <= 8.0) multiplier = 8.0;
  
  return Math.ceil(power * multiplier);
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const payloadTitle = p?.payload?.title;

  const total = payload.length > 1
    ? payload.reduce((acc, entry) => acc + (Number(entry.value) || 0), 0)
    : null;

  // For multi-series, filter and highlight active meters with value > 0
  const hasMultiple = payload.length > 1;
  const activeEntries = hasMultiple
    ? payload.filter((e) => Number(e.value) > 0).sort((a, b) => Number(b.value) - Number(a.value))
    : payload;
  const zeroEntries = hasMultiple
    ? payload.filter((e) => !Number(e.value) || Number(e.value) <= 0)
    : [];

  const displayEntries = activeEntries.length > 0 ? activeEntries : payload;

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
        fontSize: '12px',
        color: '#1e293b',
        minWidth: '200px',
        maxWidth: '420px',
        maxHeight: '380px',
        overflowY: 'auto',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '4px',
          marginBottom: '6px',
          color: '#475569',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>{label}</span>
        {hasMultiple && activeEntries.length > 0 && (
          <span style={{ fontSize: '10.5px', color: '#0284c7', fontWeight: 600, textTransform: 'none' }}>
            {activeEntries.length} Active Meter{activeEntries.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {payloadTitle ? (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
          {payloadTitle}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {displayEntries.map((entry, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: entry.color || entry.fill || '#0284c7',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: '#334155', fontWeight: 500 }}>{entry.name || 'Value'}:</span>
            </span>
            <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {Number(entry.value).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}{' '}
              {unit}
            </strong>
          </div>
        ))}
      </div>

      {activeEntries.length > 0 && zeroEntries.length > 0 && (
        <div style={{ fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px', paddingTop: '4px', borderTop: '1px dotted #f1f5f9' }}>
          + {zeroEntries.length} other meter{zeroEntries.length === 1 ? '' : 's'} logged 0 {unit}
        </div>
      )}

      {total !== null && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1.5px solid #e2e8f0',
            fontWeight: 800,
            fontSize: '12.5px',
          }}
        >
          <span style={{ color: '#0f172a' }}>Total Consumption:</span>
          <strong style={{ color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}>
            {total.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{' '}
            {unit}
          </strong>
        </div>
      )}
    </div>
  );
}

export default function BarChart({
  data = [],
  allData = null,
  unit = '',
  title = '',
  metricName = 'Value',
  color = 'water',
  referenceValue = null,
  referenceLabel = '',
  multiSeries = null,
  height = 420,
  defaultChartType = 'bar',
  xAxisLabel = '',
  yAxisLabel = '',
}) {
  const [chartType, setChartType] = useState(defaultChartType); // 'bar' | 'area'
  const [barLayout, setBarLayout] = useState('stacked'); // 'stacked' | 'grouped'
  const [analysisMode, setAnalysisMode] = useState('timeline'); // 'timeline' | 'monthly' | 'yearly' | 'compare_years' | 'compare_months'
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonthA, setSelectedMonthA] = useState('');
  const [selectedMonthB, setSelectedMonthB] = useState('');

  const theme = PALETTES[color] || PALETTES.water;

  // Base clean data
  const cleanData = useMemo(() => {
    return (data || []).map((d) => {
      const item = {
        ...d,
        value: Number(d.value) >= 0 ? Number(d.value) : 0,
      };
      if (multiSeries && multiSeries.length > 0) {
        multiSeries.forEach((s) => {
          item[s.key] = Number(d[s.key]) >= 0 ? Number(d[s.key]) : 0;
        });
      }
      return item;
    });
  }, [data, multiSeries]);

  // Full source dataset for aggregations and comparisons
  const sourceData = (allData && allData.length > 0) ? allData : cleanData;

  const parsedSource = useMemo(() => {
    return sourceData.map((d) => {
      const p = parsePointDate(d);
      return {
        ...d,
        _p: p,
        _year: p?.year,
        _month: p?.month,
        _day: p?.day,
        _monthKey: p?.monthKey,
      };
    });
  }, [sourceData]);

  // Discover unique available years
  const availableYears = useMemo(() => {
    const set = new Set();
    parsedSource.forEach((d) => {
      if (d._year && d._year.length === 4) set.add(d._year);
    });
    return [...set].sort();
  }, [parsedSource]);

  // Discover unique available months (sorted latest first)
  const availableMonths = useMemo(() => {
    const set = new Set();
    parsedSource.forEach((d) => {
      if (d._monthKey && d._monthKey.length === 7) set.add(d._monthKey);
    });
    return [...set].sort().reverse();
  }, [parsedSource]);

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
        if (prev.length <= 1) return prev; // Keep at least one year
        return prev.filter((y) => y !== yr);
      }
      return [...prev, yr].sort();
    });
  };

  // 1. Monthly Aggregated Data
  const monthlyData = useMemo(() => {
    const map = new Map();
    parsedSource.forEach((d) => {
      if (!d._monthKey) return;
      const mk = d._monthKey;
      let entry = map.get(mk);
      if (!entry) {
        entry = {
          label: formatMonthLabel(mk),
          monthKey: mk,
          value: 0,
          count: 0,
        };
        map.set(mk, entry);
      }
      const val = Number(d.value) || 0;
      entry.value += val;
      entry.count += 1;
      if (multiSeries && multiSeries.length > 0) {
        multiSeries.forEach((s) => {
          entry[s.key] = (entry[s.key] || 0) + (Number(d[s.key]) || 0);
        });
      }
    });

    const list = [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    if (unit === 'm') {
      list.forEach((e) => {
        if (e.count > 0) {
          e.value = Number((e.value / e.count).toFixed(3));
          if (multiSeries) multiSeries.forEach((s) => { e[s.key] = Number(((e[s.key] || 0) / e.count).toFixed(3)); });
        }
      });
    } else {
      list.forEach((e) => {
        e.value = Number(e.value.toFixed(2));
        if (multiSeries) multiSeries.forEach((s) => { e[s.key] = Number((e[s.key] || 0).toFixed(2)); });
      });
    }
    return list;
  }, [parsedSource, multiSeries, unit]);

  // 2. Yearly Aggregated Data
  const yearlyData = useMemo(() => {
    const map = new Map();
    parsedSource.forEach((d) => {
      if (!d._year) return;
      const yr = d._year;
      let entry = map.get(yr);
      if (!entry) {
        entry = {
          label: yr,
          year: yr,
          value: 0,
          count: 0,
        };
        map.set(yr, entry);
      }
      const val = Number(d.value) || 0;
      entry.value += val;
      entry.count += 1;
      if (multiSeries && multiSeries.length > 0) {
        multiSeries.forEach((s) => {
          entry[s.key] = (entry[s.key] || 0) + (Number(d[s.key]) || 0);
        });
      }
    });

    const list = [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
    if (unit === 'm') {
      list.forEach((e) => {
        if (e.count > 0) {
          e.value = Number((e.value / e.count).toFixed(3));
          if (multiSeries) multiSeries.forEach((s) => { e[s.key] = Number(((e[s.key] || 0) / e.count).toFixed(3)); });
        }
      });
    } else {
      list.forEach((e) => {
        e.value = Number(e.value.toFixed(2));
        if (multiSeries) multiSeries.forEach((s) => { e[s.key] = Number((e[s.key] || 0).toFixed(2)); });
      });
    }
    return list;
  }, [parsedSource, multiSeries, unit]);

  // 3. Compare Years (YoY) Data across 12 months
  const activeCompareYears = selectedYears.length > 0 ? selectedYears : availableYears;
  const compareYearsData = useMemo(() => {
    return MONTH_NAMES.map((mName, mIdx) => {
      const monthNum = String(mIdx + 1).padStart(2, '0');
      const row = { label: mName, monthNum: mIdx + 1 };
      activeCompareYears.forEach((yr) => {
        const matching = parsedSource.filter((d) => d._year === yr && d._month === monthNum);
        if (!matching.length) {
          row[yr] = 0;
        } else {
          const sum = matching.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
          row[yr] = unit === 'm' ? Number((sum / matching.length).toFixed(3)) : Number(sum.toFixed(2));
        }
      });
      return row;
    });
  }, [MONTH_NAMES, activeCompareYears, parsedSource, unit]);

  const compareYearsSeries = useMemo(() => {
    return activeCompareYears.map((yr, idx) => ({
      key: yr,
      label: `Year ${yr}`,
      color: YEAR_COLORS[idx % YEAR_COLORS.length],
    }));
  }, [activeCompareYears]);

  // 4. Compare Months Data (Day 1 - 31)
  const compareMonthsData = useMemo(() => {
    if (!selectedMonthA || !selectedMonthB) return [];
    const days = [];
    for (let d = 1; d <= 31; d++) {
      const dayStr = String(d).padStart(2, '0');
      const matchA = parsedSource.filter((item) => item._monthKey === selectedMonthA && item._day === dayStr);
      const matchB = parsedSource.filter((item) => item._monthKey === selectedMonthB && item._day === dayStr);

      const valA = matchA.reduce((sum, curr) => sum + (Number(curr.value) || 0), 0);
      const valB = matchB.reduce((sum, curr) => sum + (Number(curr.value) || 0), 0);

      days.push({
        label: `Day ${dayStr}`,
        day: d,
        [selectedMonthA]: unit === 'm' ? (matchA.length ? Number((valA / matchA.length).toFixed(3)) : 0) : Number(valA.toFixed(2)),
        [selectedMonthB]: unit === 'm' ? (matchB.length ? Number((valB / matchB.length).toFixed(3)) : 0) : Number(valB.toFixed(2)),
      });
    }
    return days;
  }, [parsedSource, selectedMonthA, selectedMonthB, unit]);

  const compareMonthsSeries = useMemo(() => {
    return [
      { key: selectedMonthA, label: formatMonthLabel(selectedMonthA), color: theme.primary },
      { key: selectedMonthB, label: formatMonthLabel(selectedMonthB), color: '#c2622a' },
    ];
  }, [selectedMonthA, selectedMonthB, theme.primary]);

  // Month comparison summary totals & variance
  const monthCompStats = useMemo(() => {
    if (!compareMonthsData.length || !selectedMonthA || !selectedMonthB) return null;
    const totA = compareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthA]) || 0), 0);
    const totB = compareMonthsData.reduce((acc, r) => acc + (Number(r[selectedMonthB]) || 0), 0);
    const diff = totA - totB;
    const pct = totB > 0 ? (diff / totB) * 100 : 0;
    return {
      totA: Number(totA.toFixed(1)),
      totB: Number(totB.toFixed(1)),
      diff: Number(diff.toFixed(1)),
      pct: Number(pct.toFixed(1)),
    };
  }, [compareMonthsData, selectedMonthA, selectedMonthB]);

  // Resolve active chart data and active series based on mode
  const { activeChartData, activeSeries, activeXLabel } = useMemo(() => {
    if (analysisMode === 'yearly') {
      return {
        activeChartData: yearlyData,
        activeSeries: multiSeries,
        activeXLabel: 'Calendar Year',
      };
    }
    if (analysisMode === 'monthly') {
      return {
        activeChartData: monthlyData,
        activeSeries: multiSeries,
        activeXLabel: 'Month (Chronological)',
      };
    }
    if (analysisMode === 'compare_years') {
      return {
        activeChartData: compareYearsData,
        activeSeries: compareYearsSeries,
        activeXLabel: 'Month of Year (Jan – Dec)',
      };
    }
    if (analysisMode === 'compare_months') {
      return {
        activeChartData: compareMonthsData,
        activeSeries: compareMonthsSeries,
        activeXLabel: 'Day of Month (1 – 31)',
      };
    }
    return {
      activeChartData: cleanData,
      activeSeries: multiSeries,
      activeXLabel: xAxisLabel || 'X-Axis: Date / Timeline',
    };
  }, [
    analysisMode,
    yearlyData,
    monthlyData,
    compareYearsData,
    compareYearsSeries,
    compareMonthsData,
    compareMonthsSeries,
    cleanData,
    multiSeries,
    xAxisLabel,
  ]);

  // Statistics calculation for the current active view
  const stats = useMemo(() => {
    if (!activeChartData.length) return { total: 0, avg: 0, max: 0, min: 0 };
    let vals = [];
    if (activeSeries && activeSeries.length > 0) {
      activeChartData.forEach((d) => {
        activeSeries.forEach((s) => {
          if (Number.isFinite(d[s.key])) vals.push(Number(d[s.key]));
        });
      });
    } else {
      vals = activeChartData.map((d) => d.value).filter((v) => Number.isFinite(v));
    }
    if (!vals.length) return { total: 0, avg: 0, max: 0, min: 0 };
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    return { total, avg, max, min, count: vals.length };
  }, [activeChartData, activeSeries]);

  const baseId = useMemo(() => Math.random().toString(36).substring(2, 7), []);
  const gradId = `wtpGrad_${color}_${baseId}`;
  const barGradId = `wtpBarGrad_${color}_${baseId}`;

  const resolvedYLabel = yAxisLabel || (unit ? `Y-Axis: ${metricName || 'Consumption'} (${unit})` : `Y-Axis: ${metricName || 'Consumption'}`);

  if (!sourceData.length && !cleanData.length) {
    return (
      <div
        style={{
          padding: '36px 16px',
          textAlign: 'center',
          color: 'var(--muted)',
          background: 'var(--field)',
          borderRadius: '10px',
          border: '1px dashed var(--line)',
          fontSize: '13px',
        }}
      >
        <span>📊</span> No readings recorded for this period yet.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '16px',
        marginTop: '12px',
        marginBottom: '12px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
      }}
    >
      {/* Chart Top Action Bar & Stat Badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '12px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>
            {title ? title : `${metricName} Trend`}
          </div>

          {/* Stat summary chips */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                background: 'var(--field)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '2px 8px',
                color: 'var(--muted)',
              }}
            >
              Avg: <strong style={{ color: 'var(--ink)' }}>{fmt(stats.avg, 1)} {unit}</strong>
            </span>

            <span
              style={{
                fontSize: '11px',
                background: 'var(--field)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '2px 8px',
                color: 'var(--muted)',
              }}
            >
              Peak: <strong style={{ color: theme.primary }}>{fmt(stats.max, 1)} {unit}</strong>
            </span>

            {stats.total > 0 && unit !== 'm' && (
              <span
                style={{
                  fontSize: '11px',
                  background: 'var(--field)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  color: 'var(--muted)',
                }}
              >
                Sum: <strong style={{ color: 'var(--ink)' }}>{fmt(stats.total, 0)} {unit}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Chart View Toggle Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {chartType === 'bar' && activeSeries && activeSeries.length > 0 && (
            <div
              style={{
                display: 'flex',
                background: 'var(--field)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '2px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setBarLayout('stacked')}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: barLayout === 'stacked' ? 700 : 500,
                  background: barLayout === 'stacked' ? 'var(--card)' : 'transparent',
                  color: barLayout === 'stacked' ? theme.primary : 'var(--muted)',
                  border: barLayout === 'stacked' ? '1px solid var(--line)' : 'none',
                  borderRadius: '4px',
                  boxShadow: barLayout === 'stacked' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                }}
                title="Stacked: Total with series breakdown"
              >
                Stacked
              </button>
              <button
                type="button"
                onClick={() => setBarLayout('grouped')}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: barLayout === 'grouped' ? 700 : 500,
                  background: barLayout === 'grouped' ? 'var(--card)' : 'transparent',
                  color: barLayout === 'grouped' ? theme.primary : 'var(--muted)',
                  border: barLayout === 'grouped' ? '1px solid var(--line)' : 'none',
                  borderRadius: '4px',
                  boxShadow: barLayout === 'grouped' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                }}
                title="Grouped: Side-by-side comparison"
              >
                Grouped
              </button>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              background: 'var(--field)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '2px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setChartType('bar')}
              style={{
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: chartType === 'bar' ? 700 : 500,
                background: chartType === 'bar' ? 'var(--card)' : 'transparent',
                color: chartType === 'bar' ? theme.primary : 'var(--muted)',
                borderRadius: '6px',
                border: chartType === 'bar' ? '1px solid var(--line)' : 'none',
                boxShadow: chartType === 'bar' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
              }}
            >
              📊 Bar
            </button>

            <button
              type="button"
              onClick={() => setChartType('area')}
              style={{
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: chartType === 'area' ? 700 : 500,
                background: chartType === 'area' ? 'var(--card)' : 'transparent',
                color: chartType === 'area' ? theme.primary : 'var(--muted)',
                borderRadius: '6px',
                border: chartType === 'area' ? '1px solid var(--line)' : 'none',
                boxShadow: chartType === 'area' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
              }}
            >
              📈 Area
            </button>
          </div>
        </div>
      </div>

      {/* Primary Trend & Comparison Mode Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginRight: '4px', textTransform: 'uppercase' }}>
            Graph View:
          </span>

          {[
            { id: 'timeline', label: '📅 Timeline', title: 'Granular view as selected in report' },
            { id: 'monthly', label: '📊 Monthly Trend', title: 'Monthly aggregated trend across full timeline' },
            { id: 'yearly', label: '📆 Yearly Trend', title: 'Annual total and year-by-year trend' },
            { id: 'compare_years', label: '🔄 Compare Years', title: 'Year-over-Year (YoY) overlay comparison by month' },
            { id: 'compare_months', label: '⚖️ Compare Months', title: 'Side-by-side comparison between two selected months' },
          ].map((mode) => {
            const isActive = analysisMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAnalysisMode(mode.id)}
                title={mode.title}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? theme.primary : 'var(--field)',
                  color: isActive ? '#ffffff' : 'var(--ink)',
                  border: isActive ? `1px solid ${theme.primary}` : '1px solid var(--line)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {analysisMode === 'compare_years' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Select Years:</span>
            {availableYears.map((yr, idx) => {
              const isSelected = selectedYears.includes(yr);
              const color = YEAR_COLORS[idx % YEAR_COLORS.length];
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => toggleYearSelection(yr)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: isSelected ? 700 : 500,
                    border: `1.5px solid ${color}`,
                    background: isSelected ? color : 'transparent',
                    color: isSelected ? '#ffffff' : color,
                    cursor: 'pointer',
                  }}
                >
                  {isSelected ? '✓ ' : ''}{yr}
                </button>
              );
            })}
          </div>
        )}

        {analysisMode === 'compare_months' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: theme.primary }}>Month 1:</span>
              <select
                value={selectedMonthA}
                onChange={(e) => setSelectedMonthA(e.target.value)}
                style={{ padding: '3px 6px', fontSize: '11px', borderRadius: '5px', border: '1px solid var(--line)' }}
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            </div>

            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)' }}>VS</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c2622a' }}>Month 2:</span>
              <select
                value={selectedMonthB}
                onChange={(e) => setSelectedMonthB(e.target.value)}
                style={{ padding: '3px 6px', fontSize: '11px', borderRadius: '5px', border: '1px solid var(--line)' }}
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Month-to-Month Comparison Variance Banner */}
      {analysisMode === 'compare_months' && monthCompStats && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--water) 6%, var(--field))',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '8px 14px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: theme.primary }}>{formatMonthLabel(selectedMonthA)}:</strong>{' '}
              <b>{monthCompStats.totA.toLocaleString()} {unit}</b>
            </span>
            <span>
              <strong style={{ color: '#c2622a' }}>{formatMonthLabel(selectedMonthB)}:</strong>{' '}
              <b>{monthCompStats.totB.toLocaleString()} {unit}</b>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--muted)' }}>Variance:</span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '11.5px',
                background: monthCompStats.diff >= 0 ? '#dcfce7' : '#fee2e2',
                color: monthCompStats.diff >= 0 ? '#15803d' : '#b91c1c',
                border: `1px solid ${monthCompStats.diff >= 0 ? '#86efac' : '#fca5a5'}`,
              }}
            >
              {monthCompStats.diff >= 0 ? `+${monthCompStats.diff.toLocaleString()}` : monthCompStats.diff.toLocaleString()} {unit} ({monthCompStats.pct >= 0 ? `+${monthCompStats.pct}%` : `${monthCompStats.pct}%`})
            </span>
          </div>
        </div>
      )}

      {/* Axis Guide Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '5px 10px',
          background: 'var(--field)',
          borderRadius: '6px',
          border: '1px solid var(--line)',
          fontSize: '11px',
          color: 'var(--ink)',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontWeight: 700, color: theme.primary }}>📌 Axis:</span>
        <span>
          <strong style={{ color: 'var(--muted)' }}>X:</strong> {activeXLabel.replace(/^X-Axis:\s*/i, '')}
        </span>
        <span style={{ color: 'var(--line)' }}>•</span>
        <span>
          <strong style={{ color: 'var(--muted)' }}>Y:</strong> {resolvedYLabel.replace(/^Y-Axis:\s*/i, '')}
        </span>
        {activeSeries && activeSeries.length > 0 && analysisMode !== 'compare_years' && analysisMode !== 'compare_months' && (
          <>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
              💡 Hover on any bar to see meter breakdown and values
            </span>
          </>
        )}
        {analysisMode === 'compare_years' && availableYears.length === 1 && (
          <>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
              (Note: Only {availableYears[0]} data currently recorded. Multi-year comparison will display additional bars as other years are recorded).
            </span>
          </>
        )}
      </div>

      {/* SVG Canvas via Recharts ResponsiveContainer */}
      <div style={{ width: '100%', height, minHeight: height, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={height}>
          <ComposedChart data={activeChartData} margin={{ top: 16, right: 24, left: 20, bottom: 12 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.gradientStart} stopOpacity={0.45} />
                <stop offset="65%" stopColor={theme.gradientStart} stopOpacity={0.12} />
                <stop offset="100%" stopColor={theme.gradientStart} stopOpacity={0.0} />
              </linearGradient>

              <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.secondary} />
                <stop offset="100%" stopColor={theme.primary} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} opacity={0.6} />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              interval="preserveStartEnd"
              minTickGap={16}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={(v) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : v)}
              domain={[0, (dataMax) => computeExtendedYMax(dataMax, referenceValue)]}
              width={74}
              label={{
                value: resolvedYLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 4,
                fill: 'var(--ink)',
                fontSize: 11,
                fontWeight: 700,
                style: { textAnchor: 'middle' },
              }}
            />

            <Tooltip
              content={<CustomTooltip unit={unit} />}
              cursor={{ stroke: theme.primary, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5 }}
            />

            {/* Optional Threshold / Limit Reference Line */}
            {referenceValue != null && analysisMode === 'timeline' && (
              <ReferenceLine
                y={referenceValue}
                stroke="#dc2626"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: referenceLabel || `Limit: ${referenceValue} ${unit}`,
                  fill: '#dc2626',
                  fontSize: 10,
                  fontWeight: 600,
                  position: 'insideTopRight',
                  offset: 4,
                }}
              />
            )}

            {/* Average Reference Line */}
            {stats.avg > 0 && analysisMode !== 'compare_years' && analysisMode !== 'compare_months' && (
              <ReferenceLine
                y={stats.avg}
                stroke={theme.primary}
                strokeDasharray="2 4"
                strokeOpacity={0.4}
              />
            )}

            {/* Show Legend ONLY for Year Comparison or Month Comparison (where there are only 2-3 items).
                For multi-series meter breakdowns (which can have 16+ meters), the names are removed from below
                the X-axis as requested, and are seen only when marking in the graph via the tooltip */}
            {activeSeries && activeSeries.length > 0 && (analysisMode === 'compare_years' || analysisMode === 'compare_months') && (
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="circle"
                iconSize={8}
              />
            )}

            {/* Render Series: Bar Chart vs Area Chart */}
            {chartType === 'bar' ? (
              activeSeries && activeSeries.length > 0 ? (
                activeSeries.map((s, idx) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label || s.key}
                    fill={s.color || theme.primary}
                    stackId={barLayout === 'stacked' && analysisMode !== 'compare_years' && analysisMode !== 'compare_months' ? 'meterStack' : undefined}
                    radius={
                      barLayout === 'stacked' && analysisMode !== 'compare_years' && analysisMode !== 'compare_months'
                        ? (idx === activeSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])
                        : [3, 3, 0, 0]
                    }
                    maxBarSize={barLayout === 'stacked' ? 36 : 24}
                    animationDuration={500}
                  />
                ))
              ) : (
                <Bar
                  dataKey="value"
                  name={metricName}
                  fill={`url(#${barGradId})`}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  animationDuration={500}
                />
              )
            ) : (
              activeSeries && activeSeries.length > 0 ? (
                activeSeries.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label || s.key}
                    stroke={s.color || theme.primary}
                    fill={s.color || theme.primary}
                    fillOpacity={0.16}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: s.color || theme.primary }}
                    activeDot={{ r: 5 }}
                    animationDuration={500}
                  />
                ))
              ) : (
                <Area
                  type="monotone"
                  dataKey="value"
                  name={metricName}
                  stroke={theme.stroke}
                  strokeWidth={2.5}
                  fill={`url(#${gradId})`}
                  dot={{ r: 2.5, fill: theme.primary, stroke: '#fff', strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: theme.primary, stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={500}
                />
              )
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
