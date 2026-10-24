import React from 'react'
import { inr } from './utils'

export const DOC_WIDTH = 794
export const DOC_HEIGHT = 1115
export const FONT = 'Arial, "Nirmala UI", "Noto Sans Devanagari", sans-serif'
export const BORDER = '1px solid #1a1a1a'

export function DocShell({ children }) {
  return (
    <div
      id="demand-note-doc"
      style={{
        width: DOC_WIDTH,
        minHeight: DOC_HEIGHT,
        boxSizing: 'border-box',
        padding: '44px 56px',
        background: '#fff',
        color: '#111',
        fontFamily: FONT,
        fontSize: 13,
        lineHeight: 1.45,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        margin: '0 auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </div>
  )
}

export function DocHeader({ note }) {
  return (
    <>
      {/* Letterhead */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img
          src="/iitgn-logo.png"
          alt="IITGN Logo"
          width={76}
          height={76}
          style={{ objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => {
            e.currentTarget.src = '/campus-sanchalika-logo.png'
          }}
        />
        <div style={{ flex: 1, textAlign: 'center', paddingRight: 76 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>
            भारतीय प्रौद्योगिकी संस्थान गांधीनगर
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            INDIAN INSTITUTE OF TECHNOLOGY GANDHINAGAR
          </div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            संस्थान कार्य विभाग / Institute Works Department
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 19,
          textDecoration: 'underline',
          margin: '24px 0 16px',
          letterSpacing: '0.02em',
        }}
      >
        {note.headline || 'Demand Note'}
      </div>

      {/* Note no. + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontSize: 13 }}>
        <div><strong style={{ fontWeight: 600 }}>No.:</strong> {note.noteNo}</div>
        <div><strong style={{ fontWeight: 600 }}>Date:</strong> {note.date}</div>
      </div>
    </>
  )
}

export function DocFooter({ note, bankTitle = 'The bank account details are as follows:' }) {
  return (
    <div style={{ marginTop: 24, fontSize: 12.5 }}>
      {note.paymentNote && (
        <div style={{ marginBottom: 12, lineHeight: 1.4 }}>
          {note.paymentNote}
        </div>
      )}

      {note.bank && note.bank.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{bankTitle}</div>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {note.bank.map(([label, value], i) => (
                <tr key={i}>
                  <td style={{ padding: '1px 8px 1px 0', fontWeight: 600, color: '#333' }}>
                    {label}
                  </td>
                  <td style={{ padding: '1px 6px' }}>:</td>
                  <td style={{ padding: '1px 0', fontFamily: 'inherit' }}>
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature Section */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40, textAlign: 'right' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{note.signatory?.name}</div>
          <div style={{ fontSize: 12.5, color: '#444' }}>{note.signatory?.title}</div>
        </div>
      </div>
    </div>
  )
}
