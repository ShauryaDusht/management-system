import React, { Fragment } from 'react'
import { BORDER, DocFooter, DocHeader, DocShell } from './docParts'
import { inr0 } from './utils'

const LABEL_W = '52%'
const cell = { padding: '3px 8px', verticalAlign: 'top' }

function Row({ label, children, bold, gap }) {
  return (
    <tr>
      <td style={{ ...cell, paddingTop: gap ? 14 : 3, width: LABEL_W, fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td style={{ ...cell, paddingTop: gap ? 14 : 3, borderLeft: BORDER }}>{children}</td>
    </tr>
  )
}

export default function ElectricityTemplate({ note }) {
  const parts = String(note.billing || '').split(' to ')
  const lines = parts.length === 2 ? [parts[0], 'to', parts[1]] : parts

  return (
    <DocShell>
      <DocHeader note={note} />

      <div style={{ fontWeight: 700, fontSize: 13 }}>To,</div>
      <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13.5 }}>{note.toLine || 'Contractor name'}</div>
      <div style={{ color: '#222' }}>
        {(note.addressLines || []).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      <div style={{ marginTop: 20, fontWeight: 700, whiteSpace: 'pre-line', fontSize: 13 }}>
        {note.intro}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, border: BORDER, fontSize: 12.5 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, paddingTop: 10, paddingBottom: 10, width: LABEL_W, fontWeight: 700 }}>Billing Month :</td>
            <td style={{ ...cell, paddingTop: 10, paddingBottom: 10, borderLeft: BORDER, textAlign: 'center', fontWeight: 700 }}>
              {lines.map((l, i) => (
                <div key={i} style={lines.length === 3 && i === 1 ? { fontWeight: 400 } : undefined}>{l}</div>
              ))}
            </td>
          </tr>
          {(note.meters || []).map((m, i) => (
            <Fragment key={i}>
              <Row gap label={`Current Meter reading${m.label ? ` (${m.label})` : ''}:`}>
                {m.filled || String(m.current ?? '').trim() ? m.current : '—'}
              </Row>
              <Row label="Past Meter reading :">
                {String(m.previous ?? '').trim() ? m.previous : '—'}
              </Row>
              <Row label="Unit Consumed :">
                {m.filled ? m.units : '—'}
              </Row>
              {note.multi && (
                <Row label={`Amount Rs. (at Rs.${Number(m.rate) || 0}/- per unit) :`}>
                  {m.filled && !m.invalid ? inr0(m.amount) : '—'}
                </Row>
              )}
            </Fragment>
          ))}
          <Row gap bold label="Total Payable amount Rs.">
            <strong>{inr0(note.total)}</strong>
          </Row>
          <tr>
            <td colSpan={2} style={{ ...cell, paddingTop: 12, paddingBottom: 10, textAlign: 'center', fontWeight: 600 }}>
              ({note.totalWords})
            </td>
          </tr>
        </tbody>
      </table>

      {note.paymentNote ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, border: BORDER }}>
          <tbody>
            <tr>
              <td style={{ ...cell, padding: '10px 8px', fontWeight: 700, whiteSpace: 'pre-line', fontSize: 12 }}>
                {note.paymentNote}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}

      <DocFooter note={note} bankTitle="Bank Details :" />
    </DocShell>
  )
}
