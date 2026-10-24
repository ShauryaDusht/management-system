import React, { useState, useMemo } from 'react';
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

function CustomTooltip({ active, payload, label, unit, customTitle }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const payloadTitle = p?.payload?.title;

  const total = payload.length > 1
    ? payload.reduce((acc, entry) => acc + (Number(entry.value) || 0), 0)
    : null;

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
        minWidth: '160px',
        maxWidth: '300px',
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
        }}
      >
        {label}
      </div>

      {payloadTitle ? (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
          {payloadTitle}
        </div>
      ) : null}

      {payload.map((entry, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginTop: '3px',
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
            <span style={{ color: '#64748b' }}>{entry.name || 'Value'}:</span>
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

      {total !== null && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1px dashed #e2e8f0',
            fontWeight: 700,
          }}
        >
          <span style={{ color: '#334155' }}>Total:</span>
          <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
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
  unit = '',
  title = '',
  metricName = 'Value',
  color = 'water',
  referenceValue = null,
  referenceLabel = '',
  multiSeries = null,
  height = 280,
  defaultChartType = 'bar',
  xAxisLabel = '',
  yAxisLabel = '',
}) {
  const [chartType, setChartType] = useState(defaultChartType); // 'bar' | 'area'
  const [barLayout, setBarLayout] = useState('stacked'); // 'stacked' | 'grouped'

  const theme = PALETTES[color] || PALETTES.water;

  const resolvedXLabel = xAxisLabel || 'X-Axis: Date / Timeline';
  const resolvedYLabel = yAxisLabel || (unit ? `Y-Axis: ${metricName || 'Consumption'} (${unit})` : `Y-Axis: ${metricName || 'Consumption'}`);

  // Clean data for Recharts
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

  // Statistical calculations
  const stats = useMemo(() => {
    if (!cleanData.length) return { total: 0, avg: 0, max: 0, min: 0 };
    const vals = cleanData.map((d) => d.value).filter((v) => Number.isFinite(v));
    if (!vals.length) return { total: 0, avg: 0, max: 0, min: 0 };
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    return { total, avg, max, min, count: vals.length };
  }, [cleanData]);

  const baseId = useMemo(() => Math.random().toString(36).substring(2, 7), []);
  const gradId = `wtpGrad_${color}_${baseId}`;
  const barGradId = `wtpBarGrad_${color}_${baseId}`;

  if (!cleanData.length) {
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
          marginBottom: '14px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
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
          {chartType === 'bar' && multiSeries && multiSeries.length > 0 && (
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
                title="Stacked: Total daily consumption with meter breakdown"
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
                title="Grouped: Side-by-side meter comparison"
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
                padding: '4px 10px',
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
              📊 Bar Chart
            </button>

            <button
              type="button"
              onClick={() => setChartType('area')}
              style={{
                padding: '4px 10px',
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
              📈 Smooth Area
            </button>
          </div>
        </div>
      </div>

      {/* Axis Guide Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '6px 12px',
          background: 'var(--field)',
          borderRadius: '8px',
          border: '1px solid var(--line)',
          fontSize: '11.5px',
          color: 'var(--ink)',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontWeight: 700, color: theme.primary }}>📌 Axis Labels:</span>
        <span>
          <strong style={{ color: 'var(--muted)' }}>X-Axis:</strong> {resolvedXLabel.replace(/^X-Axis:\s*/i, '')}
        </span>
        <span style={{ color: 'var(--line)' }}>•</span>
        <span>
          <strong style={{ color: 'var(--muted)' }}>Y-Axis:</strong> {resolvedYLabel.replace(/^Y-Axis:\s*/i, '')}
        </span>
      </div>

      {/* SVG Canvas via Recharts ResponsiveContainer */}
      <div style={{ width: '100%', height, minHeight: height, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={height}>
          <ComposedChart data={cleanData} margin={{ top: 14, right: 20, left: 18, bottom: 26 }}>
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
              minTickGap={20}
              label={{
                value: resolvedXLabel,
                position: 'insideBottom',
                offset: -16,
                fill: 'var(--ink)',
                fontSize: 11,
                fontWeight: 700,
              }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
              domain={[0, (dataMax) => (referenceValue && referenceValue > dataMax ? Math.ceil(referenceValue * 1.1) : Math.ceil(dataMax * 1.15) || 10)]}
              width={66}
              label={{
                value: resolvedYLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 2,
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

            {/* Optional Threshold / Max Limit Reference Line */}
            {referenceValue != null && (
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
            {stats.avg > 0 && (
              <ReferenceLine
                y={stats.avg}
                stroke={theme.primary}
                strokeDasharray="2 4"
                strokeOpacity={0.4}
              />
            )}

            {/* Multi-series Legend */}
            {multiSeries && multiSeries.length > 0 && (
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="circle"
                iconSize={8}
              />
            )}

            {/* Render Series: Bar Chart vs Area Chart */}
            {chartType === 'bar' ? (
              multiSeries && multiSeries.length > 0 ? (
                multiSeries.map((s, idx) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label || s.key}
                    fill={s.color || theme.primary}
                    stackId={barLayout === 'stacked' ? 'meterStack' : undefined}
                    radius={
                      barLayout === 'stacked'
                        ? (idx === multiSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])
                        : [3, 3, 0, 0]
                    }
                    maxBarSize={barLayout === 'stacked' ? 36 : 18}
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
              multiSeries && multiSeries.length > 0 ? (
                multiSeries.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label || s.key}
                    stroke={s.color || theme.primary}
                    fill={s.color || theme.primary}
                    fillOpacity={0.16}
                    strokeWidth={2}
                    dot={{ r: 2, fill: s.color || theme.primary }}
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
