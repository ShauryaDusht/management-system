import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Recursively extracts plain text from values, arrays, and React element objects.
 */
export function extractText(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val)
  }
  if (Array.isArray(val)) {
    return val.map(extractText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  }
  if (typeof val === 'object') {
    // React element handling
    if (val.props) {
      if (val.props.value !== undefined) return extractText(val.props.value)
      if (val.props.children !== undefined) return extractText(val.props.children)
    }
    // Date instance
    if (val instanceof Date) {
      return val.toLocaleDateString('en-IN')
    }
  }
  return String(val)
}

/**
 * Triggers a browser file download for a Blob.
 */
export function triggerDownload(blob, filename) {
  if (typeof document === 'undefined') return
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/**
 * Cleans a filename and ensures it ends with the proper extension.
 */
export function cleanFilename(name, defaultExt = 'csv') {
  let base = String(name || 'report').trim().replace(/[<>:"/\\|?*]+/g, '_')
  const ext = defaultExt.replace(/^\./, '')
  if (base.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
    return base
  }
  return `${base}.${ext}`
}

/**
 * CSV escaping following RFC 4180 rules.
 */
function csvEscape(value) {
  const str = extractText(value)
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Exports data to a CSV file.
 */
export function exportToCsv({ filename, headers = [], rows = [], title = '' }) {
  const lines = []

  if (title) {
    lines.push(csvEscape(title))
    lines.push('')
  }

  if (headers && headers.length) {
    lines.push(headers.map(csvEscape).join(','))
  }

  rows.forEach((row) => {
    if (Array.isArray(row)) {
      lines.push(row.map(csvEscape).join(','))
    } else if (row && typeof row === 'object') {
      const rowArr = headers.map((h) => csvEscape(row[h]))
      lines.push(rowArr.join(','))
    }
  })

  // \uFEFF UTF-8 BOM ensures special symbols like INR ₹ and non-ASCII render correctly in Excel
  const csvContent = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, cleanFilename(filename, 'csv'))
  return csvContent
}

/**
 * Exports data to an Excel (.xlsx) file using genuine SheetJS workbooks.
 */
export function exportToExcel({ filename, headers = [], rows = [], sheetName = 'Report', title = '', subtitle = '' }) {
  const wb = XLSX.utils.book_new()
  const aoa = []

  let headerRowIndex = 0

  if (title) {
    aoa.push([title])
    headerRowIndex++
    if (subtitle) {
      aoa.push([subtitle])
      headerRowIndex++
    }
    aoa.push([]) // empty row before table
    headerRowIndex++
  }

  if (headers && headers.length) {
    aoa.push(headers.map((h) => extractText(h)))
  }

  rows.forEach((row) => {
    if (Array.isArray(row)) {
      aoa.push(row.map((cell) => {
        const text = extractText(cell)
        // Try converting numeric strings to numbers if clean integer or decimal
        if (/^-?\d+(\.\d+)?$/.test(text) && !text.startsWith('0') && text.length < 15) {
          const num = Number(text)
          if (!isNaN(num)) return num
        }
        return text
      }))
    } else if (row && typeof row === 'object') {
      aoa.push(headers.map((h) => {
        const text = extractText(row[h])
        if (/^-?\d+(\.\d+)?$/.test(text) && !text.startsWith('0') && text.length < 15) {
          const num = Number(text)
          if (!isNaN(num)) return num
        }
        return text
      }))
    }
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Compute column widths dynamically
  const colWidths = (headers || []).map((h, colIdx) => {
    let maxLen = String(h || '').length
    for (let r = headerRowIndex; r < aoa.length; r++) {
      const cellVal = aoa[r]?.[colIdx]
      if (cellVal !== undefined && cellVal !== null) {
        maxLen = Math.max(maxLen, String(cellVal).length)
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) }
  })
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Report')
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, cleanFilename(filename, 'xlsx'))
}

/**
 * Exports data to a styled, paginated PDF document.
 */
export function exportToPdf({
  filename,
  headers = [],
  rows = [],
  title = 'IIT Gandhinagar Management System Report',
  subtitle = '',
  orientation,
  metadata = {},
}) {
  const isLandscape = orientation === 'landscape' || (!orientation && headers.length > 5)
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Clean strings
  const cleanHeadersList = headers.map(extractText)
  const cleanRowsList = rows.map((r) =>
    Array.isArray(r)
      ? r.map(extractText)
      : cleanHeadersList.map((h) => extractText(r[h]))
  )

  // Document Title & IIT Gandhinagar Branding
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text('IIT GANDHINAGAR — CAMPUS SANCHALIKA', 14, 15)

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(String(title || 'Report').slice(0, 80), 14, 23)

  let startY = 27
  if (subtitle) {
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text(String(subtitle), 14, startY)
    startY += 5
  }

  // Generation timestamp & metadata
  const now = new Date()
  const metaText = `Generated: ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · Total Records: ${cleanRowsList.length}`
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(metaText, 14, startY)
  startY += 4

  // Thin separator rule
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(14, startY, pageWidth - 14, startY)
  startY += 4

  // Run autoTable
  const callAutoTable = (d, opts) => {
    if (typeof d.autoTable === 'function') {
      d.autoTable(opts)
    } else if (typeof autoTable === 'function') {
      autoTable(d, opts)
    } else if (autoTable.default) {
      autoTable.default(d, opts)
    }
  }

  callAutoTable(doc, {
    startY,
    head: [cleanHeadersList],
    body: cleanRowsList,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: cleanHeadersList.length > 8 ? 7.5 : 8.5,
      cellPadding: 2.5,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: cleanHeadersList.length > 8 ? 8 : 9,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: (data) => {
      // Footer with page numbering
      const pageNumber = doc.internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(
        `Page ${data.pageNumber} of ${pageNumber}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      )
      doc.text(
        'IIT Gandhinagar · Campus Sanchalika Management System',
        14,
        pageHeight - 8
      )
    },
  })

  doc.save(cleanFilename(filename, 'pdf'))
}

/**
 * Prepares a clean print-friendly window/iframe and triggers native print.
 */
export function printReport({
  title = 'IIT Gandhinagar Report',
  subtitle = '',
  headers = [],
  rows = [],
  metadata = {},
}) {
  const cleanHeadersList = headers.map(extractText)
  const cleanRowsList = rows.map((r) =>
    Array.isArray(r)
      ? r.map(extractText)
      : cleanHeadersList.map((h) => extractText(r[h]))
  )

  const printFrame = document.createElement('iframe')
  printFrame.style.position = 'fixed'
  printFrame.style.right = '0'
  printFrame.style.bottom = '0'
  printFrame.style.width = '0'
  printFrame.style.height = '0'
  printFrame.style.border = '0'
  document.body.appendChild(printFrame)

  const frameDoc = printFrame.contentWindow.document
  const now = new Date()
  const dateStr = `${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`

  const tableHeadHtml = cleanHeadersList.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const tableRowsHtml = cleanRowsList
    .map(
      (row, idx) =>
        `<tr class="${idx % 2 === 0 ? 'even' : 'odd'}">${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: auto;
            margin: 12mm 14mm 14mm 14mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #0f172a;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
          }
          .header {
            margin-bottom: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
          }
          .brand {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: #64748b;
            text-transform: uppercase;
          }
          h1 {
            font-size: 18px;
            margin: 4px 0 2px 0;
            color: #0f172a;
            font-weight: 800;
          }
          .sub {
            font-size: 12px;
            color: #475569;
            margin: 2px 0;
          }
          .meta {
            font-size: 10px;
            color: #64748b;
            margin-top: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10px;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
          }
          th {
            background-color: #0f172a !important;
            color: #ffffff !important;
            font-weight: 700;
            text-align: left;
            padding: 6px 8px;
            border: 1px solid #0f172a;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          td {
            padding: 5px 8px;
            border: 1px solid #cbd5e1;
            vertical-align: top;
          }
          tr.odd {
            background-color: #f8fafc;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .footer {
            margin-top: 14px;
            font-size: 9px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">IIT Gandhinagar · Campus Sanchalika</div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
          <div class="meta">Generated: ${dateStr} · Total Records: ${cleanRowsList.length}</div>
        </div>
        <table>
          <thead>
            <tr>${tableHeadHtml}</tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <span>Campus Sanchalika Operations Management System</span>
          <span>Confidential — Internal Use Only</span>
        </div>
      </body>
    </html>
  `

  frameDoc.open()
  frameDoc.write(html)
  frameDoc.close()

  setTimeout(() => {
    try {
      printFrame.contentWindow.focus()
      printFrame.contentWindow.print()
    } finally {
      setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame)
        }
      }, 2000)
    }
  }, 350)
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Standard unified dispatcher for exporting in any format.
 */
export async function exportReport({
  format = 'csv',
  filename = 'report',
  title = 'Report',
  subtitle = '',
  headers = [],
  rows = [],
  data = null,
  columns = null,
  orientation,
  metadata = {},
}) {
  let resolvedHeaders = [...headers]
  let resolvedRows = [...rows]

  // If columns and data are provided
  if (columns && data && Array.isArray(data)) {
    resolvedHeaders = columns.map((col) => col.header || col.label || col.key)
    resolvedRows = data.map((item) =>
      columns.map((col) => {
        if (typeof col.getValue === 'function') return col.getValue(item)
        if (col.key) return item[col.key]
        return ''
      })
    )
  } else if (!resolvedHeaders.length && data && Array.isArray(data) && data.length) {
    resolvedHeaders = Object.keys(data[0])
    resolvedRows = data.map((item) => resolvedHeaders.map((k) => item[k]))
  }

  switch (format) {
    case 'csv':
      exportToCsv({ filename, headers: resolvedHeaders, rows: resolvedRows, title })
      break
    case 'excel':
    case 'xlsx':
      exportToExcel({ filename, headers: resolvedHeaders, rows: resolvedRows, title, subtitle })
      break
    case 'pdf':
      exportToPdf({ filename, headers: resolvedHeaders, rows: resolvedRows, title, subtitle, orientation, metadata })
      break
    case 'print':
      printReport({ title, subtitle, headers: resolvedHeaders, rows: resolvedRows, metadata })
      break
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}
