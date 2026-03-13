import { useEffect, useMemo, useState } from 'react'

import { inventoryAPI, reportsAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import { asList, triggerDownload } from '../../shared/utils'

const AREA_CLASS_LABELS = {
  all: 'All Areas',
  hostels: 'Hostels',
  academic: 'Academic',
  others: 'Others',
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatCurrency(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getAreaClass(areaType, areaName) {
  const name = String(areaName || '').trim()
  const type = String(areaType || '')
  if (type === 'hostel') return 'hostels'
  if (/^Academic Block/i.test(name) || ['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(name)) return 'academic'
  if (['hostel common area', 'common area', 'hostels reliever'].includes(name.toLowerCase())) return 'hostels'
  if (type === 'academic') return 'academic'
  return 'others'
}

function isIssueCompleted(issue) {
  if (issue.item_type === 'asset') return Boolean(issue.returned_at)
  return Boolean(issue.usage_finalized)
}

function isIssueInMonth(issue, month, year) {
  if (!issue?.issued_at) return false
  const issuedDate = new Date(issue.issued_at)
  if (Number.isNaN(issuedDate.getTime())) return false
  return (
    issuedDate.getUTCMonth() + 1 === Number(month) &&
    issuedDate.getUTCFullYear() === Number(year)
  )
}

export default function IssuesTab({ userRole }) {
  const { isSupervisor, isCaretaker } = useAuth()
  const [issues, setIssues] = useState([])

  const [actionModal, setActionModal] = useState(null)
  const [form, setForm] = useState({
    returned_quantity: 1,
    condition_on_return: '',
    actual_quantity_used: 1,
    notes: '',
  })

  const [areaClass, setAreaClass] = useState('all')
  const [selectedArea, setSelectedArea] = useState('all')

  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1)
  const [reportYear, setReportYear] = useState(new Date().getFullYear())
  const [generatingReport, setGeneratingReport] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [reportModal, setReportModal] = useState(false)

  const canManager = userRole === 'admin'
  const canSupervisor = isSupervisor || isCaretaker

  const { run: runAction, error: actionError, clearError } = useAsyncAction()
  const { loading, error: loadError, reload } = useAsyncLoad(async () => {
    const { data } = await inventoryAPI.getIssues()
    setIssues(asList(data))
    return null
  }, [], 'Failed to load issued items.')

  const error = actionError || loadError

  const allAreas = useMemo(() => {
    const seen = new Map()
    issues.forEach((issue) => {
      if (issue.area_name && !seen.has(issue.area_name)) {
        seen.set(issue.area_name, {
          name: issue.area_name,
          type: issue.area_type || 'other',
        })
      }
    })
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [issues])

  const filteredAreas = useMemo(() => {
    if (areaClass === 'all') return allAreas
    return allAreas.filter((area) => getAreaClass(area.type, area.name) === areaClass)
  }, [allAreas, areaClass])

  useEffect(() => {
    setSelectedArea('all')
  }, [areaClass])

  const filtered = useMemo(() => {
    let list = [...issues]
    list = list.filter((issue) => isIssueInMonth(issue, reportMonth, reportYear))
    if (areaClass !== 'all') {
      list = list.filter((issue) => getAreaClass(issue.area_type, issue.area_name) === areaClass)
    }
    if (selectedArea !== 'all') {
      list = list.filter((issue) => issue.area_name === selectedArea)
    }
    return list
  }, [issues, areaClass, selectedArea, reportMonth, reportYear])

  const totals = useMemo(() => {
    const total = filtered.length
    const ongoing = filtered.filter((issue) => !isIssueCompleted(issue)).length
    const completed = total - ongoing
    const assetsOut = filtered.filter(
      (issue) => issue.item_type === 'asset' && !issue.returned_at
    ).length
    return { total, ongoing, completed, assetsOut }
  }, [filtered])

  const pendingIssues = useMemo(
    () =>
      filtered.filter(
        (issue) =>
          (issue.item_type === 'asset' && !issue.returned_at) ||
          (issue.item_type === 'consumable' && !issue.usage_finalized)
      ),
    [filtered]
  )

  const submitAction = async () => {
    if (!actionModal) return
    await runAction(async () => {
      if (actionModal.type === 'asset') {
        await inventoryAPI.returnAsset(actionModal.id, {
          returned_quantity: Number(form.returned_quantity || 0),
          condition_on_return: form.condition_on_return,
          notes: form.notes,
        })
      } else {
        await inventoryAPI.finalizeConsumable(actionModal.id, {
          actual_quantity_used: Number(form.actual_quantity_used || 0),
          notes: form.notes,
        })
      }
      setActionModal(null)
      setForm({
        returned_quantity: 1,
        condition_on_return: '',
        actual_quantity_used: 1,
        notes: '',
      })
      await reload()
    }, 'Action failed.')
  }

  const generateReport = async () => {
    setGeneratingReport(true)
    clearError()
    try {
      await runAction(async () => {
        const params = {
          month: reportMonth,
          year: reportYear,
        }
        if (areaClass !== 'all') params.area_class = areaClass
        if (selectedArea !== 'all') params.area_name = selectedArea

        const { data } = await reportsAPI.getAreaIssuesReport(params)
        setReportData(data)
        setReportModal(true)
      }, 'Failed to generate report.')
    } finally {
      setGeneratingReport(false)
    }
  }

  const downloadMonthlyReportCsv = async () => {
    setDownloadingReport(true)
    clearError()
    try {
      await runAction(async () => {
        const params = {
          month: reportMonth,
          year: reportYear,
        }
        if (areaClass !== 'all') params.area_class = areaClass
        if (selectedArea !== 'all') params.area_name = selectedArea

        const response = await reportsAPI.downloadAreaIssuesCSV(params)
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
        const disposition = response.headers?.['content-disposition'] || ''
        const match = disposition.match(/filename=\"?([^\"]+)\"?/)
        const filename =
          match?.[1] ||
          `area_issues_${reportYear}_${String(reportMonth).padStart(2, '0')}.csv`
        triggerDownload(blob, filename)
      }, 'Failed to download report CSV.')
    } finally {
      setDownloadingReport(false)
    }
  }

  const years = Array.from(
    { length: 4 },
    (_, index) => new Date().getFullYear() - index
  )
  const allAreaOptionLabel =
    areaClass === 'all' ? 'All Areas' : `All ${AREA_CLASS_LABELS[areaClass]}`
  const reportFilterLabel = selectedArea !== 'all'
    ? selectedArea
    : areaClass !== 'all'
      ? AREA_CLASS_LABELS[areaClass]
      : 'All Areas'

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Issued Items</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Filter by area and review issued item activity.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            alignItems: 'center',
            paddingBottom: 4,
          }}
        >
          {Object.entries(AREA_CLASS_LABELS).map(([key, label]) => (
            <Btn
              key={key}
              size="sm"
              variant={areaClass === key ? 'primary' : 'secondary'}
              onClick={() => setAreaClass(key)}
              style={{ flex: '0 0 auto' }}
            >
              {label}
            </Btn>
          ))}

          <div style={{ flex: '0 0 260px' }}>
            <SelectField
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="all">{allAreaOptionLabel}</option>
              {filteredAreas.map((area) => (
                <option key={area.name} value={area.name}>
                  {area.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div style={{ flex: '0 0 140px' }}>
            <SelectField
              value={reportMonth}
              onChange={(e) => setReportMonth(Number(e.target.value))}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </SelectField>
          </div>

          <div style={{ flex: '0 0 100px' }}>
            <SelectField
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </SelectField>
          </div>

          <Btn
            onClick={generateReport}
            disabled={generatingReport || downloadingReport}
            style={{ flex: '0 0 auto' }}
          >
            {generatingReport ? 'Generating...' : 'View Report'}
          </Btn>
          <Btn
            variant="ghost"
            onClick={downloadMonthlyReportCsv}
            disabled={generatingReport || downloadingReport}
            style={{ flex: '0 0 auto' }}
          >
            {downloadingReport ? 'Downloading...' : 'Download CSV'}
          </Btn>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 12 }}>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Filtered Total</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{totals.total}</div>
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ongoing</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#c2410c' }}>{totals.ongoing}</div>
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Completed</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#065f46' }}>{totals.completed}</div>
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Assets Out</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#991b1b' }}>{totals.assetsOut}</div>
          </Card>
        </div>
      </Card>

      {pendingIssues.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Pending Actions ({pendingIssues.length})
          </div>
          {pendingIssues.slice(0, 10).map((issue) => (
            <div
              key={issue.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {issue.item_name} <Badge value={issue.item_type} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {issue.item_code || 'No code'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {issue.issued_quantity} {issue.item_unit} | {issue.requested_by_name || 'User'}
                    {issue.area_name ? ` | ${issue.area_name}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    Unit Price: {formatCurrency(issue.item_unit_price)} | Total: {formatCurrency(issue.issue_total_amount)}
                  </div>
                </div>
              {issue.item_type === 'asset' && canManager ? (
                <Btn
                  size="sm"
                  variant="orange"
                  onClick={() => setActionModal({ id: issue.id, type: 'asset', item: issue })}
                >
                  Return Asset
                </Btn>
              ) : issue.item_type === 'consumable' && (canSupervisor || canManager) ? (
                <Btn
                  size="sm"
                  variant="success"
                  onClick={() =>
                    setActionModal({ id: issue.id, type: 'consumable', item: issue })
                  }
                >
                  Finalize
                </Btn>
              ) : (
                <Badge value="pending" />
              )}
            </div>
          ))}
        </Card>
      )}

      <Card noPad style={{ marginBottom: 14 }}>
        <DataTable
          loading={loading}
          headers={[
            'Area',
            'Item',
            'Unit Price',
            'Total Price',
            'Type',
            'Requested By',
            'Issued Qty',
            'Issued At',
            'Status',
            'Actions',
          ]}
          rows={filtered.map((issue) => {
            const status = isIssueCompleted(issue) ? 'completed' : 'ongoing'
            return [
              <span
                key={`area-${issue.id}`}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}
              >
                {issue.area_name || '-'}
              </span>,
              <div key={`item-${issue.id}`}>
                <div>{issue.item_name || '-'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{issue.item_code || 'No code'}</div>
              </div>,
              formatCurrency(issue.item_unit_price),
              formatCurrency(issue.issue_total_amount),
              issue.item_type || '-',
              issue.requested_by_name || '-',
              `${issue.issued_quantity} ${issue.item_unit || ''}`,
              issue.issued_at
                ? new Date(issue.issued_at).toLocaleDateString('en-IN')
                : '-',
              <Badge key={`status-${issue.id}`} value={status} />,
              issue.item_type === 'asset' && canManager && !issue.returned_at ? (
                <Btn
                  key={`return-${issue.id}`}
                  size="sm"
                  variant="orange"
                  onClick={() => setActionModal({ id: issue.id, type: 'asset', item: issue })}
                >
                  Return
                </Btn>
              ) : issue.item_type === 'consumable' &&
                (canSupervisor || canManager) &&
                !issue.usage_finalized ? (
                <Btn
                  key={`finalize-${issue.id}`}
                  size="sm"
                  variant="success"
                  onClick={() =>
                    setActionModal({ id: issue.id, type: 'consumable', item: issue })
                  }
                >
                  Finalize
                </Btn>
              ) : (
                '-'
              ),
            ]
          })}
          emptyMsg="No issued items for selected filters."
        />
      </Card>

      <Modal
        open={reportModal}
        onClose={() => setReportModal(false)}
        title={`Area-wise Issued Items - ${MONTHS[reportMonth - 1]} ${reportYear} (${reportFilterLabel})`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setReportModal(false)}>
              Close
            </Btn>
            <Btn
              onClick={downloadMonthlyReportCsv}
              disabled={downloadingReport}
            >
              {downloadingReport ? 'Downloading...' : 'Download CSV'}
            </Btn>
          </>
        }
      >
        {reportData && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-2)' }}>
              Total Issues: <strong>{reportData.total_issues}</strong>
            </div>
            {(reportData.area_summary || []).map((area) => (
              <div
                key={area.area_name}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{area.area_name}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                  <span>
                    Total Issued: <strong>{area.total_issued}</strong>
                  </span>
                  <span>
                    Total Qty: <strong>{area.total_qty_issued}</strong>
                  </span>
                  <span style={{ color: '#92400e' }}>
                    Assets Still Out: <strong>{area.assets_out}</strong>
                  </span>
                  <span style={{ color: '#065f46' }}>
                    Returned: <strong>{area.returned}</strong>
                  </span>
                  <span>
                    Consumables Used: <strong>{area.consumables_used}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={actionModal?.type === 'asset' ? 'Return Asset' : 'Finalize Consumable'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setActionModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={submitAction}>Submit</Btn>
          </>
        }
      >
        {actionModal?.type === 'asset' ? (
          <>
            <Field label="Returned Quantity">
              <Input
                type="number"
                min="1"
                value={form.returned_quantity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, returned_quantity: e.target.value }))
                }
              />
            </Field>
            <Field label="Condition on Return">
              <Input
                value={form.condition_on_return}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, condition_on_return: e.target.value }))
                }
              />
            </Field>
          </>
        ) : (
          <Field label="Actual Quantity Used">
            <Input
              type="number"
              min="0"
              value={form.actual_quantity_used}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, actual_quantity_used: e.target.value }))
              }
            />
          </Field>
        )}
        <Field label="Notes">
          <Input
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </Field>
      </Modal>
    </div>
  )
}
