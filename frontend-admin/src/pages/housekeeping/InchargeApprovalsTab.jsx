import { useCallback, useEffect, useMemo, useState } from 'react'

import { hkAPI } from '../../api/housekeeping'
import { Alert, Badge, Btn, Card, DataTable, Spinner } from '../../components/ui'

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN')
}

export default function InchargeApprovalsTab() {
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [decisionLoadingId, setDecisionLoadingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await hkAPI.getInchargeAssignments(statusFilter === 'all' ? undefined : statusFilter)
      setRows(normalizeList(data))
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load incharge assignments.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (id, decision) => {
    setDecisionLoadingId(id)
    setError('')
    setSuccess('')
    try {
      await hkAPI.decideInchargeAssignment(id, { decision })
      setSuccess(decision === 'approved' ? 'Incharge assignment approved.' : 'Incharge assignment rejected.')
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update assignment decision.')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  const statusCounts = useMemo(() => {
    const acc = { all: rows.length, pending_admin_approval: 0, approved: 0, admin_rejected: 0, declined: 0, pending_acceptance: 0 }
    rows.forEach((r) => {
      if (r.status in acc) acc[r.status] += 1
    })
    return acc
  }, [rows])

  const tableRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const ta = new Date(a.created_at).getTime() || 0
        const tb = new Date(b.created_at).getTime() || 0
        return tb - ta
      })
      .map((r) => [
        r.leave_staff_name || r.leave_staff_username || '-',
        r.area_name || '-',
        r.leave_date || '-',
        r.assigned_staff_name || r.assigned_staff_username || '-',
        <Badge key={`st-${r.id}`} value={r.status} />,
        r.status === 'pending_admin_approval' ? (
          <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
            <Btn
              size="sm"
              variant="success"
              onClick={() => decide(r.id, 'approved')}
              disabled={decisionLoadingId === r.id}
            >
              Approve
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => decide(r.id, 'rejected')}
              disabled={decisionLoadingId === r.id}
            >
              Reject
            </Btn>
          </div>
        ) : (
          '-'
        ),
      ])
  }, [decisionLoadingId, rows])

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />

      <Card noPad>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>Incharge Approvals</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn size="sm" variant={statusFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('all')}>
              All ({statusCounts.all})
            </Btn>
            <Btn
              size="sm"
              variant={statusFilter === 'pending_admin_approval' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('pending_admin_approval')}
            >
              Pending ({statusCounts.pending_admin_approval})
            </Btn>
            <Btn size="sm" variant={statusFilter === 'approved' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('approved')}>
              Approved ({statusCounts.approved})
            </Btn>
            <Btn
              size="sm"
              variant={statusFilter === 'admin_rejected' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('admin_rejected')}
            >
              Rejected ({statusCounts.admin_rejected})
            </Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : (
          <DataTable
            headers={['Leave Staff', 'Area / Hostel', 'Leave Date', 'Assigned Incharge', 'Status', 'Actions']}
            rows={tableRows}
            emptyMsg="No incharge assignments found."
          />
        )}
      </Card>

      {!loading && rows.length ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Latest update: {formatDateTime(rows[0]?.updated_at)}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
