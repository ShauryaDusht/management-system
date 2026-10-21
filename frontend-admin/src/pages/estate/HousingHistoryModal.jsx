import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui'
import { calcStayedDuration } from './utils'
import estateApi from '../../api/estate'

export default function HousingHistoryModal({
  isOpen,
  onClose,
  houseType = 'A',
  houseNo = '',
  unitId = null,
  onOpenRecord,
  onAddEarlierRecord,
}) {
  const [loading, setLoading] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [unitInfo, setUnitInfo] = useState(null)

  useEffect(() => {
    if (isOpen && (houseNo || unitId)) {
      fetchHistory()
    }
  }, [isOpen, houseNo, unitId])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await estateApi.getHousingHistory({
        house_no: houseNo,
        house_type: houseType,
        unit_id: unitId,
      })
      setHistoryList(res.data.history || [])
      setUnitInfo(res.data.unit || null)
    } catch (err) {
      console.error('Failed to load house history:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Distinct occupants count
  const distinctOccupants = new Set(historyList.map((h) => (h.emplCode || h.occupantName || '').toLowerCase())).size
  const totalOccupancies = historyList.length
  const currentStay = historyList.find((h) => h.isCurrent)
  const currentOccupantName = currentStay ? currentStay.occupantName : null

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`House ${houseType} ${houseNo} — history`}
      width={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Subtitle Summary */}
        <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
          Occupied {totalOccupancies} {totalOccupancies === 1 ? 'time' : 'times'} · by {distinctOccupants} different occupant(s) · {currentOccupantName ? `now occupied by ${currentOccupantName}` : 'currently vacant'}
        </div>

        {/* Timeline Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
            Loading history...
          </div>
        ) : historyList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>
            No stays recorded for this house.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {historyList.map((stay) => {
              const isCurrent = stay.isCurrent
              const dateIn = stay.dateOfOccupation || '—'
              const dateOut = isCurrent ? 'Present' : (stay.dateOfVacation || '—')
              const duration = calcStayedDuration(stay.dateOfOccupation, isCurrent ? null : stay.dateOfVacation)

              return (
                <div
                  key={stay.id}
                  style={{
                    display: 'flex',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Left colored bar */}
                  <div
                    style={{
                      width: 4,
                      background: isCurrent ? '#10b981' : '#cbd5e1',
                      flexShrink: 0,
                    }}
                  />

                  {/* Stay Details */}
                  <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                          {stay.occupantName}
                        </span>
                        {isCurrent && (
                          <span
                            style={{
                              background: '#dcfce7',
                              color: '#15803d',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Current
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                        {dateIn} → {dateOut} {duration ? `(${duration})` : ''}
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {stay.emplCode ? `${stay.emplCode} · ` : ''}{stay.designation || 'Staff'}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenRecord) onOpenRecord(stay)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0f172a',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Open record
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => {
              if (onAddEarlierRecord) onAddEarlierRecord({ houseType, houseNo })
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add earlier record
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 18px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
