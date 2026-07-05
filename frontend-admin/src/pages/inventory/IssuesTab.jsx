import { useEffect, useMemo, useState } from 'react'

import { inventoryAPI, reportsAPI } from '../../api/inventory'
import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField } from '../../components/ui'
import { useAsyncAction, useAsyncLoad } from '../../shared/hooks/useAsync'
import { asList, todayISO, triggerDownload } from '../../shared/utils'

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

function getAreaClass(areaType, areaName) {
  const name = String(areaName || '').trim()
  const type = String(areaType || '')
  if (type === 'hostel' || type === 'jrha') return 'hostels'
  if (/^Academic Block/i.test(name) || ['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(name)) return 'academic'
  if (['hostel common area', 'common area', 'hostels reliever'].includes(name.toLowerCase())) return 'hostels'
  if (/\bJRHA\b/i.test(name) || /Jeet Hostel/i.test(name)) return 'hostels'
  if (type === 'academic') return 'academic'
  return 'others'
}

function isIssueCompleted(issue) {
  if (issue.item_type === 'asset') return Boolean(issue.returned_at)
  const consumed = Number(issue.total_consumed || 0)
  const issued = Number(issue.issued_quantity || 0)
  return consumed >= issued && issued > 0
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
  const [issues, setIssues] = useState([])

  const [actionModal, setActionModal] = useState(null)
  const [form, setForm] = useState({
    returned_quantity: 1,
    condition_on_return: '',
    notes: '',
  })
  const [usageIssue, setUsageIssue] = useState(null)
  const [usageLogs, setUsageLogs] = useState([])
  const [usageTotal, setUsageTotal] = useState(0)
  const [usageRemaining, setUsageRemaining] = useState(0)
  const [usageLoading, setUsageLoading] = useState(false)

  const [areaClass, setAreaClass] = useState('all')
  const [selectedArea, setSelectedArea] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())

  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1)
  const [reportYear, setReportYear] = useState(new Date().getFullYear())
  const [generatingReport, setGeneratingReport] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [reportModal, setReportModal] = useState(false)

  const canManager = ['admin', 'inventory_manager', 'hk_inventory_manager'].includes(userRole)

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

  const peopleOptions = useMemo(() => {
    const names = new Set()
    issues.forEach((issue) => {
      if (issue.requested_by_name) {
        names.add(issue.requested_by_name)
      }
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [issues])

  const itemOptions = useMemo(() => {
    const names = new Set()
    issues.forEach((issue) => {
      if (issue.item_name) {
        names.add(issue.item_name)
      }
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [issues])

  useEffect(() => {
    setSelectedArea('all')
  }, [areaClass])

  const filtered = useMemo(() => {
    let list = [...issues]
    if (!dateFrom && !dateTo) {
      list = list.filter((issue) => isIssueInMonth(issue, reportMonth, reportYear))
    }
    if (areaClass !== 'all') {
      list = list.filter((issue) => getAreaClass(issue.area_type, issue.area_name) === areaClass)
    }
    if (selectedArea !== 'all') {
      list = list.filter((issue) => issue.area_name === selectedArea)
    }
    if (personFilter !== 'all') {
      list = list.filter((issue) => (issue.requested_by_name || '') === personFilter)
    }
    if (itemFilter !== 'all') {
      list = list.filter((issue) => (issue.item_name || '') === itemFilter)
    }
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`)
      list = list.filter((issue) => {
        if (!issue.issued_at) return false
        const issued = new Date(issue.issued_at)
        return issued >= from
      })
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`)
      list = list.filter((issue) => {
        if (!issue.issued_at) return false
        const issued = new Date(issue.issued_at)
        return issued <= to
      })
    }
    return list
  }, [issues, areaClass, selectedArea, reportMonth, reportYear, personFilter, itemFilter, dateFrom, dateTo])

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
        (issue) => issue.item_type === 'asset' && !issue.returned_at
      ),
    [filtered]
  )

  const submitAction = async () => {
    if (!actionModal) return
    await runAction(async () => {
      await inventoryAPI.returnAsset(actionModal.id, {
        returned_quantity: Number(form.returned_quantity || 0),
        condition_on_return: form.condition_on_return,
        notes: form.notes,
      })
      setActionModal(null)
      setForm({
        returned_quantity: 1,
        condition_on_return: '',
        notes: '',
      })
      await reload()
    }, 'Action failed.')
  }

  const openUsageModal = async (issue) => {
    setUsageIssue(issue)
    setUsageLogs([])
    setUsageTotal(Number(issue.total_consumed || 0))
    setUsageRemaining(
      Math.max(Number(issue.issued_quantity || 0) - Number(issue.total_consumed || 0), 0)
    )
    setUsageLoading(true)
    clearError()
    try {
      await runAction(async () => {
        const { data } = await inventoryAPI.getUserIssueLogs(issue.id)
        const logs = data?.logs || data || []
        setUsageLogs(asList(logs))
        if (data?.issue) {
          setUsageIssue(data.issue)
        }
        if (data?.total_consumed !== undefined && data?.total_consumed !== null) {
          setUsageTotal(Number(data.total_consumed))
        }
        if (data?.remaining_quantity !== undefined && data?.remaining_quantity !== null) {
          setUsageRemaining(Number(data.remaining_quantity))
        }
      }, 'Failed to load usage logs.')
    } finally {
      setUsageLoading(false)
    }
  }

  const closeUsageModal = () => {
    setUsageIssue(null)
    setUsageLogs([])
    setUsageTotal(0)
    setUsageRemaining(0)
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
          {pendingIssues.slice(0, 100).map((issue) => (
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
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {issue.issued_quantity} {issue.item_unit} | {issue.requested_by_name || 'User'}
                  {issue.area_name ? ` | ${issue.area_name}` : ''}
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
              ) : (
                <Badge value="pending" />
              )}
            </div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Usage Tracking Filters</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '0 0 220px' }}>
            <SelectField value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="all">All People</option>
              {peopleOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          </div>
          <div style={{ flex: '0 0 240px' }}>
            <SelectField value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
              <option value="all">All Items</option>
              {itemOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          </div>
          <div style={{ flex: '0 0 160px' }}>
            <Input
              type="date"
              value={dateFrom}
              max={dateTo || todayISO()}
              onChange={(e) => {
                const val = e.target.value
                setDateFrom(val)
                if (dateTo && val > dateTo) setDateTo(val)
              }}
            />
          </div>
          <div style={{ flex: '0 0 160px' }}>
            <Input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayISO()}
              onChange={(e) => {
                const val = e.target.value
                setDateTo(val)
                if (dateFrom && val < dateFrom) setDateFrom(val)
              }}
            />
          </div>
          <Btn
            variant="ghost"
            onClick={() => {
              setPersonFilter('all')
              setItemFilter('all')
              setDateFrom('')
              setDateTo('')
            }}
          >
            Clear Filters
          </Btn>
        </div>
      </Card>

      <Card noPad style={{ marginBottom: 14 }}>
        <DataTable
          loading={loading}
          headers={[
            'Area',
            'Item Code',
            'Item',
            'Type',
            'Requested By',
            'Issued Qty',
            'Consumed',
            'Issued At',
            'Status',
            'Actions',
          ]}
          rows={filtered.map((issue) => {
            const status = isIssueCompleted(issue) ? 'completed' : 'ongoing'
            const consumed = Number(issue.total_consumed || 0)
            return [
              <span
                key={`area-${issue.id}`}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}
              >
                {issue.area_name || '-'}
              </span>,
              issue.item_code || '—',
              issue.item_name || '-',
              issue.item_type || '-',
              issue.requested_by_name || '-',
              `${issue.issued_quantity} ${issue.item_unit || ''}`,
              issue.item_type === 'consumable'
                ? `${consumed} / ${issue.issued_quantity} ${issue.item_unit || ''}`
                : '-',
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
              ) : issue.item_type === 'consumable' ? (
                <Btn
                  key={`usage-${issue.id}`}
                  size="sm"
                  variant="secondary"
                  onClick={() => openUsageModal(issue)}
                >
                  View Usage
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
        open={!!usageIssue}
        onClose={closeUsageModal}
        title={usageIssue ? `Usage Logs - ${usageIssue.item_name || 'Item'}` : 'Usage Logs'}
        footer={
          <Btn variant="ghost" onClick={closeUsageModal}>
            Close
          </Btn>
        }
      >
        {usageIssue && (
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-2)' }}>
            Issued: <strong>{usageIssue.issued_quantity} {usageIssue.item_unit || ''}</strong> •
            Used: <strong>{usageTotal} {usageIssue.item_unit || ''}</strong> •
            Remaining: <strong>{usageRemaining} {usageIssue.item_unit || ''}</strong>
          </div>
        )}
        {usageLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading usage logs...</div>
        ) : usageLogs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {usageLogs.map((log) => (
              <Card key={log.id} style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {log.logged_at
                    ? new Date(log.logged_at).toLocaleString('en-IN')
                    : '-'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {log.logged_by_name || 'Logged by user'}
                </div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>
                  {log.quantity_used} {usageIssue?.item_unit || ''}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                  {log.purpose}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            No usage logs recorded yet.
          </div>
        )}
      </Modal>

      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title="Return Asset"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setActionModal(null)}>
              Cancel
            </Btn>
            <Btn onClick={submitAction}>Submit</Btn>
          </>
        }
      >
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
