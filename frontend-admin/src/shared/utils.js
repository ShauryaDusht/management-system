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
export async function exportExcel(filename, headers, rows, sheetName = 'Sheet1', customTitle = '') {
  try {
    const xlsx = await import('xlsx-js-style')
    const XLSX = xlsx.default || xlsx
    const aoa = []
    const merges = []

    const maxCols = Math.max(1, (headers || []).length)
    let titleRowIndex = -1
    let spacerRowIndex = -1
    let headerRowIndex = 0

    // Resolve title: customTitle > sheetName (if not default 'Sheet1') > cleaned filename
    let resolvedTitle = customTitle
    if (!resolvedTitle && sheetName && sheetName !== 'Sheet1') {
      resolvedTitle = sheetName
    }
    if (!resolvedTitle && filename) {
      const base = filename.replace(/\.[^/.]+$/, '').replace(/_\d{4}-\d{2}-\d{2}.*$/, '')
      resolvedTitle = base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      if (!/report|register|log|list/i.test(resolvedTitle)) {
        resolvedTitle += ' Report'
      }
    }

    if (resolvedTitle) {
      titleRowIndex = aoa.length
      aoa.push([resolvedTitle, ...Array(Math.max(0, maxCols - 1)).fill('')])
      if (maxCols > 1) {
        merges.push({ s: { r: titleRowIndex, c: 0 }, e: { r: titleRowIndex, c: maxCols - 1 } })
      }
      spacerRowIndex = aoa.length
      aoa.push([])
    }

    headerRowIndex = aoa.length
    aoa.push(headers || [])
    ;(rows || []).forEach((row) => aoa.push(row))

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Configure row heights
    const rowHeights = []
    for (let r = 0; r < aoa.length; r++) {
      if (r === titleRowIndex) {
        rowHeights.push({ hpt: 32 })
      } else if (r === headerRowIndex) {
        rowHeights.push({ hpt: 26 })
      } else if (r === spacerRowIndex || aoa[r].length === 0) {
        rowHeights.push({ hpt: 10 })
      } else {
        rowHeights.push({ hpt: 20 })
      }
    }
    ws['!rows'] = rowHeights

    if (merges.length > 0) {
      ws['!merges'] = merges
    }

    // Style title row, header row, and data cells
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const isTitle = R === titleRowIndex
      const isHeader = R === headerRowIndex
      const isSpacer = R === spacerRowIndex

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = ws[cellRef]
        if (!cell) continue

        if (isTitle) {
          cell.s = {
            font: { bold: true, color: { rgb: '1A3C34' }, sz: 14, name: 'Calibri' },
            fill: { fgColor: { rgb: 'E8F5E9' } },
            alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
            border: {
              top: { style: 'thin', color: { rgb: 'A5D6A7' } },
              bottom: { style: 'thin', color: { rgb: 'A5D6A7' } },
              left: { style: 'thin', color: { rgb: 'A5D6A7' } },
              right: { style: 'thin', color: { rgb: 'A5D6A7' } },
            },
          }
        } else if (isHeader) {
          cell.s = {
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
        } else if (!isSpacer) {
          const isNum = typeof cell.v === 'number'
          cell.s = {
            font: { sz: 10, name: 'Calibri', color: { rgb: '0F172A' } },
            alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
            border: {
              top: { style: 'thin', color: { rgb: 'E2E8F0' } },
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } },
            },
          }
        }
      }
    }

    // Dynamic column widths (ignoring title and spacer rows)
    const colWidths = (headers || []).map((h, colIdx) => {
      let maxLen = String(h || '').length
      for (let r = 0; r < aoa.length; r++) {
        if (r === titleRowIndex || r === spacerRowIndex) continue
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
