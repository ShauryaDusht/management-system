import React, { useState, useEffect } from 'react'
import { Trash2, Clock, RotateCcw, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal, Btn, Spinner } from '../../components/ui'
import estateApi from '../../api/estate'
import { formatDisplayDate } from './HousingStatusTab'

export default function HousingTrashModal({
  isOpen,
  onClose,
  onRecordsRestored,
}) {
  const [trashList, setTrashList] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const fetchTrash = async () => {
    setLoading(true)
    try {
      const res = await estateApi.getClearanceTrash()
      setTrashList(res?.data?.trash || [])
    } catch (err) {
      console.error('Failed to fetch trash:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchTrash()
    }
  }, [isOpen])

  const handleRestoreOne = async (id) => {
    setBusyId(id)
    try {
      await estateApi.restoreClearanceTrash({ ids: [id] })
      setTrashList((prev) => prev.filter((item) => item.id !== id))
      if (onRecordsRestored) onRecordsRestored()
    } catch (err) {
      console.error('Failed to restore clearance:', err)
      alert(err?.response?.data?.error || 'Failed to restore record.')
    } finally {
      setBusyId(null)
    }
  }

  const handleRestoreAll = async () => {
    if (trashList.length === 0) return
    setBulkBusy(true)
    try {
      await estateApi.restoreClearanceTrash({ all: true })
      setTrashList([])
      if (onRecordsRestored) onRecordsRestored()
      onClose()
    } catch (err) {
      console.error('Failed to restore all:', err)
      alert(err?.response?.data?.error || 'Failed to restore all records.')
    } finally {
      setBulkBusy(false)
    }
  }

  const handlePurgeAll = async () => {
    if (trashList.length === 0) return
    const confirmed = window.confirm(
      `CAUTION: Are you sure you want to permanently delete all ${trashList.length} records from the database immediately?\n\nThis action is irreversible and records cannot be recovered!`
    )
    if (!confirmed) return

    setBulkBusy(true)
    try {
      await estateApi.purgeClearanceTrash({ all: true })
      setTrashList([])
      if (onRecordsRestored) onRecordsRestored()
      onClose()
    } catch (err) {
      console.error('Failed to purge trash:', err)
      alert(err?.response?.data?.error || 'Failed to permanently delete records.')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="24-Hour Recovery Trash" width={820}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Info banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              Total items in recovery window: <strong>{trashList.length}</strong>
            </span>
          </div>

          {trashList.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleRestoreAll}
                disabled={bulkBusy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1.5px solid #86efac',
                  background: '#f0fdf4',
                  color: '#15803d',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} />
                <span>Restore All</span>
              </button>

              <button
                type="button"
                onClick={handlePurgeAll}
                disabled={bulkBusy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1.5px solid #fca5a5',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                <span>Purge Permanently</span>
              </button>
            </div>
          )}
        </div>

        {/* Trash Records Table */}
        <div
          style={{
            maxHeight: 340,
            overflowY: 'auto',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Spinner />
            </div>
          ) : trashList.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
              <CheckCircle2 size={32} style={{ color: '#16a34a', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                No records currently in Trash.
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                Any history deleted within the last 24 hours will appear here for 1-click recovery.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)', color: 'var(--text-3)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', width: 40 }}>#</th>
                  <th style={{ padding: '8px 12px', width: 140 }}>House</th>
                  <th style={{ padding: '8px 12px', minWidth: 150 }}>Allottee Name</th>
                  <th style={{ padding: '8px 12px', width: 120 }}>Allotment Date</th>
                  <th style={{ padding: '8px 12px', width: 130 }}>Time Remaining</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', width: 90 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {trashList.map((r, i) => {
                  const rawDate = r.estateDate1 || r.estateDate3 || r.estateDate4 || r.timeStamp || r.createdAt
                  const dStr = formatDisplayDate(rawDate)
                  const hoursLeft = r.recoveryHoursLeft != null ? r.recoveryHoursLeft : 24
                  const isUrgent = hoursLeft < 4

                  return (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text)' }}>
                        {r.houseType} {r.houseNo}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>
                        {r.allotteeName || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>
                        {dStr}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            background: isUrgent ? '#fee2e2' : '#eff6ff',
                            color: isUrgent ? '#b91c1c' : '#1d4ed8',
                            border: `1px solid ${isUrgent ? '#fca5a5' : '#bfdbfe'}`,
                          }}
                        >
                          <Clock size={11} />
                          <span>{hoursLeft > 0 ? `${hoursLeft} hrs left` : 'Expiring soon'}</span>
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRestoreOne(r.id)}
                          disabled={busyId === r.id}
                          title="Restore this record back to Allotted History"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 5,
                            border: '1px solid #86efac',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <RotateCcw size={12} />
                          <span>{busyId === r.id ? 'Restoring...' : 'Restore'}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
          <Btn variant="ghost" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
