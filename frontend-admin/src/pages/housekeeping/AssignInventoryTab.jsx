import { useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Btn, Card, DataTable, SelectField, Spinner } from '../../components/ui'

const STATUS_OPTIONS = ['pending', 'approved', 'issued', 'rejected']

export default function AssignInventoryTab({ userRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [draftStatus, setDraftStatus] = useState({})
  const [savingId, setSavingId] = useState(null)

  const canUpdate = userRole === 'admin'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getStockRequests()
      const list = Array.isArray(data) ? data : data?.results || []
      setRequests(list)
      const initDraft = {}
      list.forEach((r) => {
        initDraft[r.id] = r.status
      })
      setDraftStatus(initDraft)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load stock requests.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () => requests.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [requests, statusFilter]
  )

  const updateStatus = async (requestId) => {
    const nextStatus = draftStatus[requestId]
    if (!nextStatus) return
    setSavingId(requestId)
    setError('')
    try {
      await hkAPI.updateStockRequestStatus(requestId, nextStatus)
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: nextStatus } : r))
      )
    } catch (e) {
      setError(e.response?.data?.detail || 'Status update failed.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Housekeeping Stock Requests</div>
          <SelectField
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Date', 'Area', 'Item', 'Qty', 'Requested By', 'Priority', 'Status', 'Action']}
            rows={filtered.map((r) => [
              new Date(r.created_at).toLocaleDateString('en-IN'),
              r.area_name || '-',
              r.item_name,
              `${r.quantity} ${r.unit || ''}`.trim(),
              r.requested_by_name || '-',
              r.is_urgent ? <Badge key={`u-${r.id}`} value="urgent" /> : '-',
              <Badge key={`s-${r.id}`} value={r.status} />,
              canUpdate ? (
                <div key={`a-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SelectField
                    value={draftStatus[r.id] || r.status}
                    onChange={(e) => setDraftStatus((p) => ({ ...p, [r.id]: e.target.value }))}
                    style={{ minWidth: 120 }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectField>
                  <Btn
                    size="sm"
                    onClick={() => updateStatus(r.id)}
                    disabled={savingId === r.id || (draftStatus[r.id] || r.status) === r.status}
                  >
                    {savingId === r.id ? 'Saving...' : 'Update'}
                  </Btn>
                </div>
              ) : (
                '-'
              ),
            ])}
            emptyMsg="No stock requests found."
          />
        )}
      </Card>
    </div>
  )
}
