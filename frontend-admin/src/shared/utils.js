/**
 * Shared list utility.
 * This is a simple helper to normalise API responses into a consistent shape for
 * frontend components that expect lists.
 * Usage:
 *   import { asList } from '../../shared/utils'
 */

/**
 * Normalise any API response shape into a plain array.
 * Handles:
 *   - already-an-array responses
 *   - DRF paginated { results: [...] }
 *   - custom { items: [...] } wrappers
 *
 * @param {*} data - The value from axios response.data
 * @returns {Array}
 */
export function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.items)) return data.items
  return []
}

// Error message extractor — replaces all local getErrorMessage copies
export function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error
    || error?.response?.data?.detail
    || error?.response?.data?.message
    || error?.message
    || fallback
}

// Trigger a file download from a blob response
export function triggerDownload(blob, filename) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Export data as CSV and trigger a download
export function exportCsv(rowsOrFilename, filenameOrHeaders, rowsArg) {
  if (Array.isArray(rowsOrFilename)) {
    const rows = rowsOrFilename
    const filename = filenameOrHeaders
    if (!Array.isArray(rows) || !rows.length) return
    const headers = Object.keys(rows[0])
    const bodyRows = rows.map((row) => headers.map((k) => csvEscape(row[k])).join(','))
    const blob = new Blob([[headers.join(','), ...bodyRows].join('\n')], { type: 'text/csv' })
    triggerDownload(blob, filename)
    return
  }

  if (typeof rowsOrFilename === 'string' && Array.isArray(filenameOrHeaders) && Array.isArray(rowsArg)) {
    const filename = rowsOrFilename
    const headers = filenameOrHeaders
    const rows = rowsArg
    const head = headers.map((cell) => csvEscape(cell)).join(',')
    const body = rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\n')
    const csv = `${head}\n${body}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    triggerDownload(blob, filename)
  }
}

// Get today's date as YYYY-MM-DD in local time
export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Classify area names into academic | hostels | others
export function getAreaGroup(areaName, areaType) {
  const n = String(areaName || '').trim()
  if (/^Academic Block\s+([1-9]|1[0-3])$/i.test(n)) return 'academic'
  if (['Academic Common Area', 'New AB U-Shape', 'New Academy'].includes(n)) return 'academic'
  if (['hostel common area', 'common area', 'hostels reliever'].includes(n.toLowerCase())) return 'hostels'
  if (areaType === 'hostel') return 'hostels'
  if (areaType === 'academic') return 'academic'
  return 'others'
}
