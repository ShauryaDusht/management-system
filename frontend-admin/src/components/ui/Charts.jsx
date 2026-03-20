import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'

const COLORS = {
  green: '#2d4a3e',
  orange: '#c2622a',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#dc2626',
  teal: '#0d9488',
}

export const DONUT_PALETTE = Object.values(COLORS)

export function DonutChart({ data, total, label, size = 200, palette = DONUT_PALETTE }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.45}
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => Number(v).toLocaleString()} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
          {Number(total || 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

export function TrendArea({ data, lines, height = 180 }) {
  const palette = DONUT_PALETTE
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={l.key} id={`grad_${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette[i % palette.length]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={palette[i % palette.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={{ borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => (
          <Area
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={palette[i % palette.length]}
            fill={`url(#grad_${l.key})`}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarGroupChart({ data, bars, height = 180 }) {
  const palette = DONUT_PALETTE
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
        <Tooltip contentStyle={{ borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={palette[i % palette.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
