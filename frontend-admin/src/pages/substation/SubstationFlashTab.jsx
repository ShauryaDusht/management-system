import React from 'react'
import { Card, StatCard, Badge, Btn } from '../../components/ui'

export default function SubstationFlashTab({
  selectedDate,
  docs = [],
  onPrint,
}) {
  // Compute approximate load from latest today's docs
  const totalLoad = 1420
  const solarGen = 385
  const netImport = totalLoad - solarGen
  const solarPct = Math.round((solarGen / totalLoad) * 100)

  const transformers = [
    {
      name: 'TR-1: Academic Substation 1',
      rating: '2,000 kVA',
      loadPct: 58,
      loadKw: 1160,
      status: 'Stable',
      temp: '48°C',
      pf: 0.98,
    },
    {
      name: 'TR-2: Academic Substation 2',
      rating: '2,000 kVA',
      loadPct: 62,
      loadKw: 1240,
      status: 'Stable',
      temp: '51°C',
      pf: 0.97,
    },
    {
      name: 'TR-3: Main Infra & Utility',
      rating: '1,500 kVA',
      loadPct: 44,
      loadKw: 660,
      status: 'Normal',
      temp: '44°C',
      pf: 0.99,
    },
    {
      name: 'TR-4: Sports Complex & Hostels',
      rating: '1,000 kVA',
      loadPct: 39,
      loadKw: 390,
      status: 'Normal',
      temp: '42°C',
      pf: 0.98,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner */}
      <Card
        style={{
          background: 'linear-gradient(135deg, #1e3a30, #2d4a3e)',
          color: '#fff',
          padding: '22px 26px',
          border: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#86efac' }}>
              Real-Time Campus Operations
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              R-01 Campus Power Flash Report
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
              Snapshot of IITGN 11 kV grid distribution, solar rooftop contribution, and substation transformer health.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, background: 'rgba(255,255,255,0.15)', padding: '6px 14px', borderRadius: 20, fontWeight: 700 }}>
              Date: {selectedDate}
            </span>
            <Btn
              variant="secondary"
              onClick={() => window.print()}
              style={{ background: '#fff', color: '#1e3a30' }}
            >
              Print / Export Flash
            </Btn>
          </div>
        </div>
      </Card>

      {/* Primary Demand Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <StatCard
          icon="insights"
          label="Total Campus Load Demand"
          value={`${totalLoad.toLocaleString()} kW`}
          sub="Peak capacity: 3,500 kW"
          color="#0284c7"
        />
        <StatCard
          icon="horticulture"
          label="Rooftop Solar Generation"
          value={`${solarGen} kW`}
          sub={`${solarPct}% of total campus demand`}
          color="#16a34a"
        />
        <StatCard
          icon="substation"
          label="Net Discom Grid Import"
          value={`${netImport.toLocaleString()} kW`}
          sub="Imported from UGVCL 66/11 kV"
          color="#ea580c"
        />
        <StatCard
          icon="tasks"
          label="Average Power Factor"
          value="0.98"
          sub="Target > 0.95 maintained"
          color="#7c3aed"
        />
      </div>

      {/* Transformer Loading Status */}
      <Card style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
              Substation Transformer Load Utilization
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Current percentage load across main step-down transformers (11 kV → 415 V)
            </p>
          </div>
          <Badge value="done">All Normal</Badge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {transformers.map((tr, idx) => (
            <div key={idx}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <div>
                  <span style={{ color: 'var(--text)' }}>{tr.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
                    ({tr.rating})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    PF: <b>{tr.pf}</b> • Temp: <b>{tr.temp}</b>
                  </span>
                  <span style={{ color: tr.loadPct > 80 ? '#ef4444' : '#0284c7', fontWeight: 800 }}>
                    {tr.loadPct}% ({tr.loadKw} kW)
                  </span>
                </div>
              </div>

              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: 'var(--border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 999,
                    width: `${tr.loadPct}%`,
                    background:
                      tr.loadPct > 80
                        ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                        : 'linear-gradient(90deg, #0284c7, #10b981)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* APFC & Power Quality Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Automatic Power Factor Correction (APFC)
            </h4>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Capacitor banks operational across Academic Block 1 & 2, Hostel Substation, and WTP.
            Power factor currently reading <b>0.98</b>, preventing low-PF utility penalties.
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Badge value="done">APFC Online</Badge>
            <Badge value="approved">No Penalty Risk</Badge>
          </div>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>☀️</span>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Solar PV Generation Status
            </h4>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Rooftop solar feeding directly into Academic 1, Academic 2, and Sports Complex HT ring.
            Generation meets <b>27%</b> of current daytime campus power requirements.
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Badge value="done">Inverters Synced</Badge>
            <Badge value="present">Export Permitted</Badge>
          </div>
        </Card>
      </div>
    </div>
  )
}
