import React, { useState, useMemo } from 'react';
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
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Zap,
  Activity,
  Layers,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

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

// Custom Tooltip Component
function CustomAnalyticsTooltip({ active, payload, label, unit, viewMode }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const d = p.payload || {};

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
        minWidth: '170px',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#1a3c34', borderBottom: '1px solid #f1f0ec', paddingBottom: 4 }}>
        {d.fullName || d.label || d.date || label}
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
  const [trendChartType, setTrendChartType] = useState('area'); // 'area' | 'bar'

  const unit = activeResult?.items?.[0]?.it?.unit || (section === 'HT' ? 'kWh' : 'kWh');

  // 1. Substation Comparison Dataset
  const comparisonData = useMemo(() => {
    return sectionResults.map(({ sh, incomingTotal, items }) => {
      const feederSum = items.reduce((acc, x) => acc + (x.c?.total || 0), 0);
      const val = incomingTotal != null && incomingTotal > 0 ? incomingTotal : feederSum;
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
  }, [sectionResults, activeSheet?.id, unit]);

  // 2. Feeder Load Breakdown Dataset for Active Substation
  const feederData = useMemo(() => {
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
  }, [activeResult, reportType, date, unit]);

  // 3. Time-Series Timeline Dataset
  const trendData = useMemo(() => {
    if (reportType === 'monthly') {
      const days = [...Array(numDaysInMonth).keys()].map((i) => {
        const dNum = String(i + 1).padStart(2, '0');
        return `${month}-${dNum}`;
      });

      return days.map((dStr) => {
        const dNum = dStr.slice(8);
        let activeVal = 0;
        if (activeResult) {
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

        let sectionVal = 0;
        sectionResults.forEach(({ items }) => {
          items.forEach(({ it, c }) => {
            if (it.incoming && c?.perDate?.[dStr] != null) {
              sectionVal += c.perDate[dStr];
            }
          });
        });

        return {
          date: dStr,
          label: `${dNum} ${month.slice(5) === '10' ? 'Oct' : ''}`,
          shortLabel: dNum,
          value: Number(activeVal.toFixed(2)),
          sectionTotal: Number(sectionVal.toFixed(2)),
          unit,
        };
      });
    }

    // Daily Mode: Trailing 14 days curve leading to current date
    const dates = [];
    const curr = new Date(date);
    for (let i = 13; i >= 0; i--) {
      const past = new Date(curr);
      past.setDate(past.getDate() - i);
      dates.push(past.toISOString().slice(0, 10));
    }

    const sheetDocs = docs.filter((d) => d.sheet === activeSheet?.id);
    return dates.map((dStr) => {
      let val = 0;
      if (activeResult) {
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
  }, [reportType, month, numDaysInMonth, date, activeResult, sectionResults, activeSheet?.id, docs, unit]);

  // Aggregate stats for KPI badges
  const stats = useMemo(() => {
    const totalEnergy = comparisonData.reduce((acc, x) => acc + x.value, 0);
    const sortedSubs = [...comparisonData].sort((a, b) => b.value - a.value);
    const topSub = sortedSubs[0] || null;
    const sortedFeeders = [...feederData].sort((a, b) => b.value - a.value);
    const topFeeder = sortedFeeders[0] || null;

    const validTrendPoints = trendData.filter((d) => d.value > 0);
    const trendAvg = validTrendPoints.length
      ? validTrendPoints.reduce((acc, d) => acc + d.value, 0) / validTrendPoints.length
      : 0;
    const trendPeak = validTrendPoints.length ? Math.max(...validTrendPoints.map((d) => d.value)) : 0;

    const hasData = totalEnergy > 0 || feederData.some((f) => f.value > 0);

    return {
      totalEnergy,
      topSub,
      topFeeder,
      trendAvg,
      trendPeak,
      hasData,
    };
  }, [comparisonData, feederData, trendData]);

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
              Total {section} Power Logged
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
              Feeder Telemetry Health
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--status-ok)', marginTop: 2 }}>
              {stats.hasData ? 'Active Telemetry ✓' : 'Standby / Ready'}
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
              Selected date <strong>{date}</strong> has 0 logged entries. Logs exist up to mid-October.
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
        {/* Card Header & Controls */}
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
              <span>
                {viewMode === 'comparison' && `Substation Energy Comparison (${section} Panels)`}
                {viewMode === 'feeder' && `${activeSheet?.name || 'Substation'} Feeder Load Breakdown`}
                {viewMode === 'trend' && `${activeSheet?.name || 'Substation'} Daily Power Trend`}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {reportType === 'daily' ? `Log Date: ${date}` : `Monthly Period: ${month}`} · Units in {unit}
            </div>
          </div>

          {/* Interactive Mode Switcher Tabs */}
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
                <span>Daily Load Trend</span>
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

        {/* Axis Guide Strip */}
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
            margin: '0 16px 8px 16px',
          }}
        >
          <span style={{ fontWeight: 700, color: COLORS.accent }}>📌 Graph Axis Labels:</span>
          <span>
            <strong style={{ color: 'var(--text-muted)' }}>X-Axis:</strong>{' '}
            {viewMode === 'comparison'
              ? 'Substation / Panel Name'
              : viewMode === 'feeder'
              ? `Energy Consumption (${unit || 'kWh'})`
              : reportType === 'daily'
              ? 'Hourly Time Slot (Hour of Day)'
              : 'Date (Day of Month)'}
          </span>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <span>
            <strong style={{ color: 'var(--text-muted)' }}>Y-Axis:</strong>{' '}
            {viewMode === 'feeder'
              ? 'Feeder / Circuit Name'
              : `Energy Consumption (${unit || 'kWh'})`}
          </span>
        </div>

        {/* SVG Recharts Canvas */}
        <div style={{ padding: '10px 20px 14px 10px', width: '100%', height: 350, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'comparison' ? (
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
                    value: 'X-Axis: Substation / Panel Name',
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
                    value: `Y-Axis: Energy Consumption (${unit || 'kWh'})`,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 2,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} />} />
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
            ) : viewMode === 'feeder' ? (
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
                    value: `X-Axis: Energy Consumption (${unit || 'kWh'})`,
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
                    value: 'Y-Axis: Feeder / Circuit Name',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -4,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} />} />
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
            ) : (
              <ComposedChart data={trendData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
                <defs>
                  <linearGradient id={gradTrend} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a3c34" stopOpacity={0.4} />
                    <stop offset="65%" stopColor="#3d6b55" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3d6b55" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--table-border)" strokeOpacity={0.6} />
                <XAxis
                  dataKey="shortLabel"
                  stroke="var(--text-dim)"
                  fontSize={11}
                  tickLine={false}
                  dy={4}
                  label={{
                    value: reportType === 'daily' ? 'X-Axis: Hourly Time Slot (Hour of Day)' : 'X-Axis: Date (Day of Month)',
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
                    value: `Y-Axis: Energy Consumption (${unit || 'kWh'})`,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 2,
                    fill: 'var(--text-main)',
                    fontSize: 11,
                    fontWeight: 700,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip content={<CustomAnalyticsTooltip unit={unit} viewMode={viewMode} />} />

                {stats.trendAvg > 0 && (
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
                    name={activeSheet?.name || 'Substation Load'}
                    stroke="#1a3c34"
                    strokeWidth={2.5}
                    fill={`url(#${gradTrend})`}
                    dot={{ r: 2.5, fill: '#1a3c34', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: '#1a3c34', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={600}
                  />
                ) : (
                  <Bar
                    dataKey="value"
                    name={activeSheet?.name || 'Substation Load'}
                    fill="#1a3c34"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
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
              {viewMode === 'comparison' && 'Click on any substation bar to inspect its feeder breakdown below.'}
              {viewMode === 'feeder' && 'Green bars indicate incoming feeds, other bars represent outgoing load circuits.'}
              {viewMode === 'trend' && 'The dashed amber line shows the average daily load for this cycle.'}
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
              Active: {activeSheet?.name || 'Substation'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
