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
  const data = error?.response?.data
  if (data?.error || data?.detail || data?.message) {
    return data.error || data.detail || data.message
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const firstField = Object.keys(data).find((key) => data[key])
    const firstValue = firstField ? data[firstField] : null
    if (Array.isArray(firstValue) && firstValue.length) {
      return `${firstField}: ${firstValue[0]}`
    }
    if (typeof firstValue === 'string') {
      return `${firstField}: ${firstValue}`
    }
  }
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

// Export data as genuine Microsoft Excel (.xlsx) file and trigger download
export async function exportExcel(filename, headers, rows, sheetName = 'Sheet1') {
  try {
    const xlsx = await import('xlsx-js-style')
    const XLSX = xlsx.default || xlsx
    const aoa = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    ws['!rows'] = [{ hpt: 26 }, ...Array(Math.max(0, rows.length)).fill({ hpt: 20 })]

    // Style header row (bold, highlighted background)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: C })
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
          fill: { fgColor: { rgb: '1E3A2F' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: {
            top: { style: 'thin', color: { rgb: '0F172A' } },
            bottom: { style: 'medium', color: { rgb: '0F172A' } },
            left: { style: 'thin', color: { rgb: '334155' } },
            right: { style: 'thin', color: { rgb: '334155' } },
          },
        }
      }
    }

    // Dynamic column widths
    const colWidths = (headers || []).map((h, colIdx) => {
      let maxLen = String(h || '').length
      for (let r = 0; r < aoa.length; r++) {
        const cellVal = aoa[r]?.[colIdx]
        if (cellVal !== undefined && cellVal !== null) {
          maxLen = Math.max(maxLen, String(cellVal).length)
        }
      }
      return { wch: Math.min(Math.max(maxLen + 4, 12), 60) }
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    const cleanSheet = (sheetName || 'Sheet1').replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31).trim() || 'Sheet1'
    XLSX.utils.book_append_sheet(wb, ws, cleanSheet)
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const finalFilename = filename.endsWith('.xlsx')
      ? filename
      : filename.replace(/\.[^/.]+$/, '') + '.xlsx'
    triggerDownload(blob, finalFilename)
  } catch (err) {
    console.error('Failed to export Excel file, falling back to CSV:', err)
    exportCsv(filename.replace(/\.xlsx$/, '.csv'), headers, rows)
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
  if (/\bJRHA\b/i.test(n) || /Jeet Hostel/i.test(n)) return 'hostels'
  if (areaType === 'hostel' || areaType === 'jrha') return 'hostels'
  if (areaType === 'academic') return 'academic'
  return 'others'
}
