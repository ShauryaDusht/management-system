import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import { Alert, Btn, Card, DataTable, Field, Modal, SelectField, Spinner } from '../../components/ui'
import { csvUrl, deleteMonthly, generateMonthly, getMonthly, listMonthly, pdfUrl } from '../../api/inventory'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

async function downloadWithToken(url, filename) {
  try {
    const response = await api.get(url, { responseType: 'blob' })
    const href = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  } catch {
    window.alert('Download failed.')
  }
}

export default function MonthlyReportTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingSelected, setLoadingSelected] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), [])

  const loadHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await listMonthly()
      setHistory(Array.isArray(data) ? data : data?.results || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load monthly report history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  const generate = async (overwrite = false) => {
    setError('')
    try {
      const { data } = await generateMonthly(month, year, overwrite)
      await loadHistory()
      await viewReport(data.id)
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.message || 'Monthly generation failed.')
    }
  }

  const viewReport = async (id) => {
    setLoadingSelected(true)
    setError('')
    try {
      const { data } = await getMonthly(id)
      setSelected(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load selected monthly report.')
    } finally {
      setLoadingSelected(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMonthly(confirmDelete.id)
      setConfirmDelete(null)
      if (selected?.id === confirmDelete.id) setSelected(null)
      await loadHistory()
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed.')
    }
  }

  return (
    <div>
      <Alert message={error} />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Month">
            <SelectField value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 160 }}>
              {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
            </SelectField>
          </Field>
          <Field label="Year">
            <SelectField value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </SelectField>
          </Field>
          <Btn onClick={() => generate(false)} style={{ marginBottom: 14 }}>Generate Report</Btn>
          <Btn variant="danger" onClick={() => generate(true)} style={{ marginBottom: 14 }}>Overwrite</Btn>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 14 }}>
        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            Monthly History
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
          ) : (
            <DataTable
              headers={['Period', 'Items', 'Reorder', 'Actions']}
              rows={history.map((r) => [
                r.period_label || `${MONTHS[(r.month || 1) - 1]} ${r.year}`,
                r.total_items || 0,
                r.items_needing_reorder || 0,
                <div key={`act-${r.id}`} style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => viewReport(r.id)}>View</Btn>
                  <Btn size="sm" variant="danger" onClick={() => setConfirmDelete(r)}>Delete</Btn>
                </div>,
              ])}
              emptyMsg="No monthly reports generated yet."
            />
          )}
        </Card>

        <Card noPad>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Selected Report</div>
            {selected && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn size="sm" variant="secondary"
                  onClick={() => downloadWithToken(csvUrl(selected.id), `procurement_${selected.year}_${String(selected.month).padStart(2,'0')}.csv`)}>
                  CSV
                </Btn>
                <Btn size="sm" variant="secondary"
                  onClick={() => downloadWithToken(pdfUrl(selected.id), `procurement_${selected.year}_${String(selected.month).padStart(2,'0')}.pdf`)}>
                  PDF
                </Btn>
              </div>
            )}
          </div>
          {loadingSelected ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
          ) : selected ? (
            <DataTable
              headers={['Item', 'Category', 'Current', 'Threshold', 'Recommended', 'Est. Cost']}
              rows={(selected.snapshot?.items || []).map((i) => [
                i.item_name, i.category, i.current_stock, i.threshold,
                i.recommended_order,
                `INR ${Number(i.estimated_cost || 0).toFixed(2)}`,
              ])}
              emptyMsg="No item snapshot available."
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
              Select a monthly report from history to view details.
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Monthly Report"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={doDelete}>Delete</Btn>
          </>
        }
      >
        <p style={{ fontSize: 14 }}>Delete report <strong>{confirmDelete?.period_label}</strong>?</p>
      </Modal>
    </div>
  )
}
