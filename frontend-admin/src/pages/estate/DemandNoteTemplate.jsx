import React, { Fragment } from 'react'
import { BORDER, DocFooter, DocHeader, DocShell } from './docParts'
import { inr } from './utils'

export { DOC_HEIGHT, DOC_WIDTH } from './docParts'

const descCell = { borderLeft: BORDER, padding: '0 8px', verticalAlign: 'top' }
const amtCell = { borderLeft: BORDER, borderRight: BORDER, padding: '0 8px', verticalAlign: 'top', textAlign: 'right' }

export default function DemandNoteTemplate({ note }) {
  const { paymentNote } = note

  return (
    <DocShell>
      <DocHeader note={note} />

      {/* Addressee */}
      <div style={{ fontWeight: 700, fontSize: 13 }}>To,</div>
      <div style={{ fontWeight: 700, marginTop: 6, fontSize: 13.5 }}>{note.name || 'Shop name'}</div>
      {note.sub && <div style={{ fontWeight: 700, fontSize: 13 }}>{note.sub}</div>}
      <div style={{ marginTop: 4, color: '#222' }}>
        {(note.addressLines || []).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Amount table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24, border: BORDER, fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: '#d9d9d9' }}>
            <th style={{ border: BORDER, padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>Description</th>
            <th style={{ border: BORDER, padding: '5px 8px', width: 140, textAlign: 'center', fontWeight: 700 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(note.items || []).map((it, i) => {
            const last = i === note.items.length - 1
            const bottom = last ? 10 : 0
            return it.type === 'power' ? (
              <Fragment key={i}>
                <tr>
                  <td style={{ ...descCell, paddingTop: 10 }}>
                    <div style={{ maxWidth: 430 }}>
                      {it.no} Reimbursement of power consumption charges borne by the Institute for utilization of the premises
                    </div>
                  </td>
                  <td style={amtCell} />
                </tr>
                <tr>
                  <td style={{ ...descCell, paddingTop: 12 }}>
                    <div style={{ display: 'flex' }}>
                      <span style={{ width: 120 }}>Month</span>
                      <span style={{ fontWeight: 700 }}>{note.monthHyphen}</span>
                    </div>
                  </td>
                  <td style={amtCell} />
                </tr>
                <tr>
                  <td style={{ ...descCell, paddingTop: 4, paddingBottom: bottom }}>
                    <div style={{ display: 'flex' }}>
                      <span style={{ width: 120 }}>Units Consumed</span>
                      <span style={{ fontWeight: 700, width: 70 }}>{note.hasUnits ? note.units : '—'}</span>
                      <span>at Rs.{note.rate}/- per unit</span>
                    </div>
                  </td>
                  <td style={{ ...amtCell, paddingTop: 4, paddingBottom: bottom, fontWeight: note.hasUnits ? 600 : 400 }}>
                    {note.hasUnits ? inr(note.electricity) : '—'}
                  </td>
                </tr>
              </Fragment>
            ) : (
              <tr key={i}>
                <td style={{ ...descCell, paddingTop: i ? 16 : 10, paddingBottom: bottom }}>{it.no} {it.label}</td>
                <td style={{ ...amtCell, paddingTop: i ? 16 : 10, paddingBottom: bottom, fontWeight: 600 }}>{inr(it.amount)}</td>
              </tr>
            )
          })}
          <tr>
            <td style={{ border: BORDER, borderBottom: 'none', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
              Total Payable Amount
            </td>
            <td style={{ border: BORDER, borderBottom: 'none', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
              {inr(note.total)}
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ border: BORDER, padding: '7px 8px', fontWeight: 600 }}>
              ({note.totalWords})
            </td>
          </tr>
          {paymentNote ? (
            <tr>
              <td colSpan={2} style={{ border: BORDER, padding: '10px 8px', whiteSpace: 'pre-line', fontSize: 12 }}>
                {paymentNote}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <DocFooter note={note} />
    </DocShell>
  )
}
