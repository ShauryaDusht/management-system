import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  AlignmentType,
} from 'docx'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from 'xlsx-js-style'

import { triggerDownload } from './utils'

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Normalise config into a standard multi-section structure:
 * {
 *   filename: 'report',
 *   module: 'Housekeeping Operations',
 *   title: 'Worker Attendance Report',
 *   subtitle: '...',
 *   metadata: [{ label: 'Date', value: '...' }],
 *   stats: [{ label: 'Total', value: 10 }],
 *   sections: [{ title: '...', headers: [...], rows: [[...]] }]
 * }
 */
export function normalizeExportConfig(config) {
  const filename = config.filename || 'report'
  const moduleName = config.module || 'Campus Operations'
  const title = config.title || 'Report'
  const subtitle = config.subtitle || ''

  let metadata = []
  if (Array.isArray(config.metadata)) {
    metadata = config.metadata
  } else if (config.metadata && typeof config.metadata === 'object') {
    metadata = Object.entries(config.metadata).map(([label, value]) => ({ label, value }))
  }

  let stats = []
  if (Array.isArray(config.stats)) {
    stats = config.stats
  } else if (Array.isArray(config.kpis)) {
    stats = config.kpis
  } else if (config.stats && typeof config.stats === 'object') {
    stats = Object.entries(config.stats).map(([label, value]) => ({ label, value }))
  }

  let sections = []
  if (Array.isArray(config.sections) && config.sections.length) {
    sections = config.sections
  } else if (Array.isArray(config.headers) && Array.isArray(config.rows)) {
    sections = [
      {
        title: config.sectionTitle || '',
        headers: config.headers,
        rows: config.rows,
      },
    ]
  } else if (Array.isArray(config.data) && config.data.length) {
    let resolvedHeaders = []
    let resolvedRows = []
    if (Array.isArray(config.columns) && config.columns.length) {
      resolvedHeaders = config.columns.map((c) => (typeof c === 'string' ? c : c.header || c.label || c.key || ''))
      resolvedRows = config.data.map((item) =>
        config.columns.map((c) => {
          const k = typeof c === 'string' ? c : c.key
          return item[k]
        })
      )
    } else {
      resolvedHeaders = Object.keys(config.data[0])
      resolvedRows = config.data.map((item) => resolvedHeaders.map((k) => item[k]))
    }
    sections = [
      {
        title: config.sectionTitle || '',
        headers: resolvedHeaders,
        rows: resolvedRows,
      },
    ]
  }

  return {
    filename,
    module: moduleName,
    title,
    subtitle,
    metadata,
    stats,
    sections,
    photoTasks: config.photoTasks || config.taskPhotos || [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function exportToCsv(rawConfig) {
  const config = normalizeExportConfig(rawConfig)
  const lines = []

  // Report Header
  lines.push([csvEscape('Report Title'), csvEscape(config.title)].join(','))
  lines.push([csvEscape('Module'), csvEscape(config.module)].join(','))
  if (config.subtitle) {
    lines.push([csvEscape('Description'), csvEscape(config.subtitle)].join(','))
  }
  lines.push([csvEscape('Generated On'), csvEscape(new Date().toLocaleString('en-IN'))].join(','))

  if (config.metadata.length) {
    config.metadata.forEach((item) => {
      lines.push([csvEscape(item.label), csvEscape(item.value)].join(','))
    })
  }

  if (config.stats.length) {
    lines.push([])
    lines.push([csvEscape('Summary Metrics')])
    config.stats.forEach((st) => {
      lines.push([csvEscape(st.label), csvEscape(st.value)].join(','))
    })
  }

  // Sections
  config.sections.forEach((sec) => {
    lines.push([])
    if (sec.title) {
      lines.push([csvEscape(sec.title)].join(','))
    }
    if (sec.headers && sec.headers.length) {
      lines.push(sec.headers.map((h) => csvEscape(cleanText(h))).join(','))
    }
    ;(sec.rows || []).forEach((row) => {
      lines.push(row.map((cell) => csvEscape(cleanText(cell))).join(','))
    })
  })

  const csvContent = `\uFEFF${lines.join('\n')}`
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `${config.filename}.csv`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PDF EXPORT (jsPDF + autoTable)
// ─────────────────────────────────────────────────────────────────────────────
async function loadImageAsBase64(url, timeoutMs = 6000) {
  if (!url) return null
  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (res.ok) {
        const blob = await res.blob()
        return await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
      }
    } catch {
      // Fallback to Image canvas
    }
    return new Promise((resolve) => {
      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth || 600
            canvas.height = img.naturalHeight || 600
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/jpeg', 0.85))
          } catch {
            resolve(null)
          }
        }
        img.onerror = () => resolve(null)
        img.src = url
      } catch {
        resolve(null)
      }
    })
  })()

  return Promise.race([
    fetchPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

export async function exportToPdf(rawConfig) {
  const config = normalizeExportConfig(rawConfig)

  // Decide orientation: if any table has > 6 columns, or photoTasks are present, use landscape
  const maxCols = Math.max(0, ...config.sections.map((s) => (s.headers || []).length))
  const orientation = (config.photoTasks && config.photoTasks.length) || maxCols > 6 ? 'landscape' : 'portrait'

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const hasPhotoTasks = Array.isArray(config.photoTasks) && config.photoTasks.length > 0

  if (!hasPhotoTasks) {
    // Top Accent Banner (Deep Pine Green)
    doc.setFillColor(26, 60, 52) // #1a3c34
    doc.rect(0, 0, pageWidth, 16, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`CAMPUS SANCHALIKA  |  ${String(config.module).toUpperCase()}`, 14, 10.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Indian Institute of Technology Gandhinagar', pageWidth - 14, 10.5, { align: 'right' })

    // Report Title
    let currentY = 25
    doc.setTextColor(26, 60, 52)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(config.title, 14, currentY)

    currentY += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110, 110, 110)

    const genDateStr = `Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    const metaParts = [genDateStr]
    config.metadata.forEach((m) => {
      if (m.label && m.value) metaParts.push(`${m.label}: ${m.value}`)
    })
    doc.text(metaParts.join('  •  '), 14, currentY)

    // Stats boxes if present
    if (config.stats.length) {
      currentY += 6
      const statBoxWidth = Math.min(42, (pageWidth - 28 - (config.stats.length - 1) * 6) / config.stats.length)
      config.stats.forEach((st, idx) => {
        const boxX = 14 + idx * (statBoxWidth + 6)
        doc.setFillColor(248, 246, 242) // #f8f6f2
        doc.setDrawColor(229, 225, 216) // #e5e1d8
        doc.roundedRect(boxX, currentY, statBoxWidth, 14, 2, 2, 'FD')

        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(120, 115, 110)
        doc.text(String(st.label).toUpperCase(), boxX + statBoxWidth / 2, currentY + 4.5, { align: 'center' })

        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(26, 60, 52)
        doc.text(String(st.value), boxX + statBoxWidth / 2, currentY + 11.5, { align: 'center' })
      })
      currentY += 18
    } else {
      currentY += 4
    }

    // Render Table Sections
    config.sections.forEach((sec) => {
      if (sec.title) {
        if (currentY > pageHeight - 35) {
          doc.addPage()
          currentY = 20
        }
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(45, 74, 62)
        doc.text(sec.title, 14, currentY + 4)
        currentY += 7
      }

      const head = [sec.headers.map((h) => cleanText(h))]
      const body = (sec.rows || []).map((row) => row.map((c) => cleanText(c)))
      const colCount = sec.headers.length

      const urlColIndex = sec.headers.findIndex((h) => /photo\s*url|url/i.test(String(h)))
      const columnStyles = {}
      if (urlColIndex !== -1) {
        columnStyles[urlColIndex] = {
          cellWidth: 46,
          fontSize: 5.5,
          overflow: 'linebreak',
        }
      }

      autoTable(doc, {
        startY: currentY,
        head,
        body,
        theme: 'grid',
        headStyles: {
          fillColor: [45, 74, 62], // #2d4a3e
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: colCount > 8 ? 7.5 : 8.5,
          halign: 'left',
        },
        bodyStyles: {
          fontSize: colCount > 8 ? 6.8 : 8,
          textColor: [30, 30, 30],
          cellPadding: colCount > 8 ? 1.6 : 2.2,
        },
        alternateRowStyles: {
          fillColor: [249, 248, 246],
        },
        columnStyles,
        styles: {
          lineColor: [229, 225, 216],
          lineWidth: 0.15,
          overflow: 'linebreak',
        },
        margin: { left: 14, right: 14 },
        didDrawPage: () => {},
      })

      currentY = (doc.lastAutoTable?.finalY || currentY) + 10
    })
  }

  // ── Render 2 × 2 Inch Side-by-Side Task Photo Pages (2 to 3 Tasks Per Page) ──
  if (hasPhotoTasks) {
    // 1 inch = 25.4 mm => exactly 2 inches = 50.8 mm
    const PHOTO_W = 50.8
    const PHOTO_H = 50.8
    const BEFORE_X = 168
    const AFTER_X = 168 + PHOTO_W + 5 // 223.8 mm (Card ends at 283 mm)

    // Pre-load all Before & After images in parallel
    const loadedTasks = await Promise.all(
      config.photoTasks.map(async (task) => {
        const [beforeData, afterData] = await Promise.all([
          loadImageAsBase64(task.before_photo_url),
          loadImageAsBase64(task.after_photo_url),
        ])
        return {
          ...task,
          beforeData,
          afterData,
        }
      })
    )

    // Format time safely for labels
    const formatTimeSafe = (val) => {
      if (!val) return ''
      try {
        const d = new Date(val)
        if (isNaN(d.getTime())) return ''
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      } catch {
        return ''
      }
    }

    // Partition tasks so every page contains exactly 2 or 3 tasks (never 1 task unless total is 1)
    const partitionIntoPages = (total) => {
      if (total <= 3) return [total]
      const chunks = []
      let rem = total
      while (rem > 0) {
        if (rem === 4) {
          chunks.push(2, 2)
          rem = 0
        } else if (rem === 2) {
          chunks.push(2)
          rem = 0
        } else {
          chunks.push(3)
          rem -= 3
        }
      }
      return chunks
    }

    const pageChunks = partitionIntoPages(loadedTasks.length)
    let taskPointer = 0

    const drawPageHeader = (visualPageNum, totalVisualPages) => {
      // Top Accent Banner (Deep Pine Green #1a3c34)
      doc.setFillColor(26, 60, 52)
      doc.rect(0, 0, pageWidth, 14, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'bold')
      doc.text(`CAMPUS SANCHALIKA  |  ${String(config.module || 'HORTICULTURE OPERATIONS').toUpperCase()}`, 14, 9.5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Indian Institute of Technology Gandhinagar', pageWidth - 14, 9.5, { align: 'right' })

      // Page Title & Header
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 60, 52)
      doc.text(`${cleanText(config.title)} — Visual Task Audit (2x2 in Photos)`, 14, 20.5)

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      const pageInfo = totalVisualPages > 1 ? `Visual Page ${visualPageNum} of ${totalVisualPages}  •  ` : ''
      doc.text(`${pageInfo}2 to 3 Tasks / Page  •  2x2 inch (50.8x50.8 mm) Photos`, pageWidth - 14, 20.5, { align: 'right' })
    }

    pageChunks.forEach((chunkCount, pageIdx) => {
      // First batch renders on initial Page 1; subsequent batches add new landscape pages
      if (pageIdx > 0) {
        doc.addPage('a4', 'landscape')
      }
      drawPageHeader(pageIdx + 1, pageChunks.length)

      // Dynamic spacing: if 3 tasks, card height 55.5 mm; if 2 tasks, 56.5 mm with more vertical breathing room
      const cardH = chunkCount === 3 ? 55.5 : 56.5
      const gapY = chunkCount === 3 ? 3.0 : 8.0
      const startY = chunkCount === 3 ? 23.0 : 35.0

      for (let i = 0; i < chunkCount; i += 1) {
        const task = loadedTasks[taskPointer]
        if (!task) break
        taskPointer += 1

        const cardY = startY + i * (cardH + gapY)

        // ── Task Card Outer Container ──
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.35)
        doc.roundedRect(14, cardY, pageWidth - 28, cardH, 1.5, 1.5, 'FD')

        // Left Accent Bar (Pine Green)
        doc.setFillColor(26, 60, 52)
        doc.roundedRect(14, cardY, 2.5, cardH, 1, 1, 'F')

        // Vertical Separator between Details & Photos
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.25)
        doc.line(164, cardY + 3, 164, cardY + cardH - 3)

        // ── 1. LEFT SIDE: Task Details ──
        // Row 1: Task Name & Task ID
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(26, 60, 52)
        const taskName = cleanText(task.task_name || task.task_type_name || 'Horticulture Task')
        const shortTaskName = doc.splitTextToSize(taskName, 105)[0] || taskName
        doc.text(shortTaskName, 20, cardY + 6.5)

        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 116, 139)
        doc.text(`[Task #${task.id}]`, 160, cardY + 6.5, { align: 'right' })

        // Row 2: Area / Location
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('Area / Location:', 20, cardY + 13.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(15, 23, 42)
        const areaName = cleanText(task.area_name || 'General Campus')
        const shortArea = doc.splitTextToSize(areaName, 100)[0] || areaName
        doc.text(shortArea, 52, cardY + 13.5)

        // Row 3: Supervisor (Photo By)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(21, 128, 61)
        doc.text('Photo By (Supervisor):', 20, cardY + 20.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(21, 128, 61)
        const supervisorName = cleanText(task.supervisor_name || 'Supervisor')
        const shortSupervisor = doc.splitTextToSize(supervisorName, 90)[0] || supervisorName
        doc.text(shortSupervisor, 62, cardY + 20.5)

        // Row 4: Assigned Worker(s)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('Assigned Worker(s):', 20, cardY + 27.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(15, 23, 42)
        const workerName = cleanText(task.worker_name || 'Unassigned')
        const shortWorker = doc.splitTextToSize(workerName, 95)[0] || workerName
        doc.text(shortWorker, 58, cardY + 27.5)

        // Row 5: Date & Session
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('Date & Session:', 20, cardY + 34.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(15, 23, 42)
        const dateStr = cleanText(task.date || '-')
        const sessionStr = task.session ? ` (${task.session})` : ''
        doc.text(`${dateStr}${sessionStr}`, 52, cardY + 34.5)

        // Row 6: Note / Remarks
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 116, 139)
        doc.text('Remarks / Notes:', 20, cardY + 41.5)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100, 116, 139)
        const noteText = cleanText(task.note ? doc.splitTextToSize(task.note, 100)[0] : 'None recorded')
        doc.text(noteText, 52, cardY + 41.5)

        // Row 7: Verification Badge Pill
        doc.setFillColor(240, 253, 244)
        doc.setDrawColor(187, 247, 208)
        doc.setLineWidth(0.2)
        doc.roundedRect(20, cardY + 46.5, 138, 5.5, 1, 1, 'FD')

        doc.setFontSize(6.8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52)
        doc.text('VERIFIED PHOTO LOG  •  Field Supervisor Photo Authority', 23, cardY + 50.3)

        // ── 2. RIGHT SIDE: Side-by-Side 2 × 2 Inch Photos ──
        const PHOTO_Y = cardY + 4.6

        // ── A. BEFORE PHOTO (Left Column) ──
        // Label Bar (amber)
        doc.setFillColor(254, 243, 199)
        doc.setDrawColor(245, 158, 11)
        doc.setLineWidth(0.25)
        doc.roundedRect(BEFORE_X, cardY + 0.8, PHOTO_W, 3.8, 0.8, 0.8, 'FD')

        doc.setFontSize(6.8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(180, 83, 9)
        doc.text('BEFORE PHOTO', BEFORE_X + 2, cardY + 3.4)

        const beforeTime = formatTimeSafe(task.before_uploaded_at)
        if (beforeTime) {
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.text(beforeTime, BEFORE_X + PHOTO_W - 2, cardY + 3.4, { align: 'right' })
        }

        // Photo Image / Frame (Exactly 2 × 2 inches: 50.8 × 50.8 mm)
        if (task.beforeData) {
          doc.addImage(task.beforeData, 'JPEG', BEFORE_X, PHOTO_Y, PHOTO_W, PHOTO_H, undefined, 'FAST')
          doc.setDrawColor(203, 213, 225)
          doc.setLineWidth(0.25)
          doc.rect(BEFORE_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'S')
        } else {
          doc.setFillColor(243, 244, 246)
          doc.rect(BEFORE_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'F')
          doc.setDrawColor(209, 213, 219)
          doc.setLineWidth(0.25)
          doc.rect(BEFORE_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'S')

          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(156, 163, 175)
          doc.text('Photo Not Available', BEFORE_X + PHOTO_W / 2, PHOTO_Y + 23, { align: 'center' })
          doc.setFontSize(6.5)
          doc.setFont('helvetica', 'normal')
          doc.text('(Before photo not captured)', BEFORE_X + PHOTO_W / 2, PHOTO_Y + 29, { align: 'center' })
        }

        // ── B. AFTER PHOTO (Right Column) ──
        // Label Bar (green)
        doc.setFillColor(220, 252, 231)
        doc.setDrawColor(34, 197, 94)
        doc.setLineWidth(0.25)
        doc.roundedRect(AFTER_X, cardY + 0.8, PHOTO_W, 3.8, 0.8, 0.8, 'FD')

        doc.setFontSize(6.8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(21, 128, 61)
        doc.text('AFTER PHOTO', AFTER_X + 2, cardY + 3.4)

        const afterTime = formatTimeSafe(task.after_uploaded_at)
        if (afterTime) {
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.text(afterTime, AFTER_X + PHOTO_W - 2, cardY + 3.4, { align: 'right' })
        }

        // Photo Image / Frame (Exactly 2 × 2 inches: 50.8 × 50.8 mm)
        if (task.afterData) {
          doc.addImage(task.afterData, 'JPEG', AFTER_X, PHOTO_Y, PHOTO_W, PHOTO_H, undefined, 'FAST')
          doc.setDrawColor(203, 213, 225)
          doc.setLineWidth(0.25)
          doc.rect(AFTER_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'S')
        } else {
          doc.setFillColor(243, 244, 246)
          doc.rect(AFTER_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'F')
          doc.setDrawColor(209, 213, 219)
          doc.setLineWidth(0.25)
          doc.rect(AFTER_X, PHOTO_Y, PHOTO_W, PHOTO_H, 'S')

          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(156, 163, 175)
          doc.text('Photo Not Available', AFTER_X + PHOTO_W / 2, PHOTO_Y + 23, { align: 'center' })
          doc.setFontSize(6.5)
          doc.setFont('helvetica', 'normal')
          doc.text('(After photo not captured)', AFTER_X + PHOTO_W / 2, PHOTO_Y + 29, { align: 'center' })
        }
      }
    })
  }

  // Add Page Numbers & Footer to each page
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(140, 140, 140)
    doc.text(`Campus Sanchalika  •  ${config.module} Report`, 14, pageHeight - 8)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
  }

  doc.save(`${config.filename}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WORD (.docx) EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function exportToWord(rawConfig) {
  const config = normalizeExportConfig(rawConfig)

  const children = []

  // Document Top Kicker
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `CAMPUS SANCHALIKA  •  ${String(config.module).toUpperCase()}`,
          bold: true,
          size: 18, // 9pt
          color: '3D6B55',
        }),
      ],
      spacing: { after: 120 },
    })
  )

  // Document Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: config.title,
          bold: true,
          size: 36, // 18pt
          color: '1A3C34',
        }),
      ],
      spacing: { after: 100 },
    })
  )

  // Subtitle / Metadata
  const metaText = [
    `Generated on: ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`,
    config.subtitle || '',
    ...config.metadata.map((m) => `${m.label}: ${m.value}`),
  ]
    .filter(Boolean)
    .join('  |  ')

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: metaText,
          italics: true,
          size: 18,
          color: '666666',
        }),
      ],
      spacing: { after: 200 },
    })
  )

  // Stats Table if present
  if (config.stats.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Key Metrics & Summary',
            bold: true,
            size: 24, // 12pt
            color: '2D4A3E',
          }),
        ],
        spacing: { before: 100, after: 100 },
      })
    )

    const statCells = config.stats.map(
      (st) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: 'F4F2ED' },
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: String(st.label).toUpperCase(),
                  bold: true,
                  size: 16,
                  color: '666666',
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: String(st.value),
                  bold: true,
                  size: 28,
                  color: '1A3C34',
                }),
              ],
            }),
          ],
        })
    )

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: statCells })],
      })
    )

    children.push(new Paragraph({ spacing: { after: 240 } }))
  }

  // Render Table Sections
  config.sections.forEach((sec) => {
    if (sec.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: sec.title,
              bold: true,
              size: 24,
              color: '2D4A3E',
            }),
          ],
          spacing: { before: 180, after: 120 },
        })
      )
    }

    const tableRows = []

    // Header Row
    if (sec.headers && sec.headers.length) {
      tableRows.push(
        new TableRow({
          tableHeader: true,
          children: sec.headers.map(
            (h) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: '2D4A3E' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cleanText(h),
                        bold: true,
                        size: 18,
                        color: 'FFFFFF',
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
      )
    }

    // Data Rows
    ;(sec.rows || []).forEach((row, rIdx) => {
      tableRows.push(
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                shading: rIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F9F8F6' } : undefined,
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cleanText(cell),
                        size: 18,
                        color: '222222',
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
      )
    })

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      })
    )

    children.push(new Paragraph({ spacing: { after: 240 } }))
  })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${config.filename}.docx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SLIDE PRESENTATION (.pptx) EXPORT (PptxGenJS)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportToSlides(rawConfig) {
  const config = normalizeExportConfig(rawConfig)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Campus Sanchalika'
  pptx.company = 'IIT Gandhinagar'
  pptx.title = config.title

  // ── SLIDE 1: COVER SLIDE ──────────────────────────────────────────────────
  const slide1 = pptx.addSlide()
  slide1.background = { color: '1A3C34' } // Deep Pine Green

  slide1.addText(`CAMPUS SANCHALIKA  •  ${String(config.module).toUpperCase()}`, {
    x: 0.8,
    y: 1.4,
    w: '85%',
    h: 0.4,
    fontSize: 14,
    fontFace: 'Helvetica',
    color: 'A7F3D0',
    bold: true,
  })

  slide1.addText(config.title, {
    x: 0.8,
    y: 2.0,
    w: '85%',
    h: 1.4,
    fontSize: 32,
    fontFace: 'Helvetica',
    color: 'FFFFFF',
    bold: true,
  })

  const coverSubtitle = [
    config.subtitle,
    `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    ...config.metadata.map((m) => `${m.label}: ${m.value}`),
  ]
    .filter(Boolean)
    .join('   |   ')

  slide1.addText(coverSubtitle, {
    x: 0.8,
    y: 3.6,
    w: '85%',
    h: 0.6,
    fontSize: 13,
    fontFace: 'Helvetica',
    color: 'D1FAE5',
  })

  slide1.addText('Indian Institute of Technology Gandhinagar (IITGN)', {
    x: 0.8,
    y: 6.4,
    w: '85%',
    h: 0.4,
    fontSize: 11,
    fontFace: 'Helvetica',
    color: '9CA3AF',
  })

  // ── SLIDE 2: EXECUTIVE SUMMARY & METRICS (if stats exist) ─────────────────
  if (config.stats.length || config.metadata.length) {
    const slide2 = pptx.addSlide()
    slide2.background = { color: 'F9F8F6' }

    slide2.addText('Executive Summary & Metrics', {
      x: 0.8,
      y: 0.6,
      w: '85%',
      h: 0.6,
      fontSize: 22,
      fontFace: 'Helvetica',
      color: '1A3C34',
      bold: true,
    })

    slide2.addText(`${config.title}  •  ${config.module}`, {
      x: 0.8,
      y: 1.2,
      w: '85%',
      h: 0.35,
      fontSize: 12,
      fontFace: 'Helvetica',
      color: '6B7280',
    })

    if (config.stats.length) {
      const cardWidth = Math.min(2.8, (11.5 - (config.stats.length - 1) * 0.3) / config.stats.length)
      config.stats.forEach((st, idx) => {
        const cardX = 0.8 + idx * (cardWidth + 0.3)
        slide2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: cardX,
          y: 1.8,
          w: cardWidth,
          h: 2.0,
          fill: { color: 'FFFFFF' },
          line: { color: 'E5E1D8', width: 1.5 },
          rectRadius: 0.1,
        })

        slide2.addText(String(st.value), {
          x: cardX,
          y: 2.1,
          w: cardWidth,
          h: 0.9,
          fontSize: 34,
          fontFace: 'Helvetica',
          color: '1A3C34',
          bold: true,
          align: 'center',
        })

        slide2.addText(String(st.label).toUpperCase(), {
          x: cardX,
          y: 3.1,
          w: cardWidth,
          h: 0.5,
          fontSize: 11,
          fontFace: 'Helvetica',
          color: '4B5563',
          bold: true,
          align: 'center',
        })
      })
    }

    if (config.metadata.length) {
      const metaY = config.stats.length ? 4.3 : 2.0
      slide2.addText('Operational Context', {
        x: 0.8,
        y: metaY,
        w: '85%',
        h: 0.4,
        fontSize: 14,
        fontFace: 'Helvetica',
        color: '2D4A3E',
        bold: true,
      })

      const metaBulletRows = config.metadata.map((m) => `${m.label}: ${m.value}`).join('\n')
      slide2.addText(metaBulletRows, {
        x: 0.8,
        y: metaY + 0.5,
        w: '85%',
        h: 1.8,
        fontSize: 12,
        fontFace: 'Helvetica',
        color: '374151',
        lineSpacingMultiple: 1.4,
      })
    }
  }

  // ── SLIDE 3+: DATA TABLES (CHUNKED TO ~8-9 ROWS PER SLIDE) ────────────────
  const ROWS_PER_SLIDE = 8

  config.sections.forEach((sec) => {
    const secHeaders = (sec.headers || []).map((h) => cleanText(h))
    const secRows = (sec.rows || []).map((row) => row.map((c) => cleanText(c)))

    const totalChunks = Math.ceil(secRows.length / ROWS_PER_SLIDE) || 1

    for (let c = 0; c < totalChunks; c += 1) {
      const chunkRows = secRows.slice(c * ROWS_PER_SLIDE, (c + 1) * ROWS_PER_SLIDE)
      const tableSlide = pptx.addSlide()
      tableSlide.background = { color: 'F9F8F6' }

      const chunkLabel = totalChunks > 1 ? ` (Part ${c + 1} of ${totalChunks})` : ''
      const sectionHeaderTitle = sec.title ? `${sec.title}${chunkLabel}` : `${config.title}${chunkLabel}`

      tableSlide.addText(sectionHeaderTitle, {
        x: 0.8,
        y: 0.4,
        w: '85%',
        h: 0.5,
        fontSize: 18,
        fontFace: 'Helvetica',
        color: '1A3C34',
        bold: true,
      })

      // Construct PPTX Table
      const headerRowCells = secHeaders.map((h) => ({
        text: h,
        options: {
          bold: true,
          color: 'FFFFFF',
          fill: { color: '2D4A3E' },
          fontSize: 9,
          fontFace: 'Helvetica',
          align: 'left',
          valign: 'middle',
        },
      }))

      const dataRowCells = chunkRows.map((r, rIdx) =>
        r.map((cell) => ({
          text: cell,
          options: {
            color: '1F2937',
            fill: { color: rIdx % 2 === 1 ? 'F3F4F6' : 'FFFFFF' },
            fontSize: 8.5,
            fontFace: 'Helvetica',
            valign: 'middle',
          },
        }))
      )

      tableSlide.addTable([headerRowCells, ...dataRowCells], {
        x: 0.8,
        y: 1.1,
        w: 11.7,
        rowH: 0.42,
        border: { pt: 0.5, color: 'E5E7EB' },
      })
    }
  })

  await pptx.writeFile({ fileName: `${config.filename}.pptx` })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXCEL (.XLSX) EXPORT (SheetJS with Highlights and Bold Headers)
// ─────────────────────────────────────────────────────────────────────────────
export function exportToExcel(rawConfig) {
  const config = normalizeExportConfig(rawConfig)
  const wb = XLSX.utils.book_new()
  const aoa = []
  const headerRowIndices = []
  const sectionTitleRowIndices = []
  const spacerRowIndices = []
  const merges = []

  // Determine maximum column count across all sections to span title merges properly
  let maxCols = 1
  ;(config.sections || []).forEach((sec) => {
    if (sec.headers && sec.headers.length > maxCols) {
      maxCols = sec.headers.length
    }
    if (sec.rows && sec.rows.length) {
      sec.rows.forEach((row) => {
        if (Array.isArray(row) && row.length > maxCols) {
          maxCols = row.length
        }
      })
    }
  })

  let titleRowIndex = -1
  let subtitleRowIndex = -1
  let metaRowIndex = -1
  let statsRowIndex = -1

  // Prominently render report title, subtitle, and metadata at the top of the worksheet
  if (config.title) {
    titleRowIndex = aoa.length
    aoa.push([cleanText(config.title), ...Array(Math.max(0, maxCols - 1)).fill('')])
    if (maxCols > 1) {
      merges.push({ s: { r: titleRowIndex, c: 0 }, e: { r: titleRowIndex, c: maxCols - 1 } })
    }

    if (config.subtitle) {
      subtitleRowIndex = aoa.length
      aoa.push([cleanText(config.subtitle), ...Array(Math.max(0, maxCols - 1)).fill('')])
      if (maxCols > 1) {
        merges.push({ s: { r: subtitleRowIndex, c: 0 }, e: { r: subtitleRowIndex, c: maxCols - 1 } })
      }
    }

    const genDateStr = `Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    const metaParts = [genDateStr]
    if (config.metadata && config.metadata.length) {
      config.metadata.forEach((m) => {
        if (m.label && m.value !== undefined && m.value !== null && m.value !== '') {
          metaParts.push(`${m.label}: ${m.value}`)
        }
      })
    }
    metaRowIndex = aoa.length
    aoa.push([metaParts.join('   •   '), ...Array(Math.max(0, maxCols - 1)).fill('')])
    if (maxCols > 1) {
      merges.push({ s: { r: metaRowIndex, c: 0 }, e: { r: metaRowIndex, c: maxCols - 1 } })
    }

    if (config.stats && config.stats.length) {
      const statsStr = config.stats.map((st) => `${st.label}: ${st.value}`).join('   |   ')
      statsRowIndex = aoa.length
      aoa.push([statsStr, ...Array(Math.max(0, maxCols - 1)).fill('')])
      if (maxCols > 1) {
        merges.push({ s: { r: statsRowIndex, c: 0 }, e: { r: statsRowIndex, c: maxCols - 1 } })
      }
    }

    spacerRowIndices.push(aoa.length)
    aoa.push([]) // empty row separator between title block and table
  }

  const isMultiSection = config.sections && config.sections.length > 1

  config.sections.forEach((sec, sIdx) => {
    if (isMultiSection && sec.title) {
      const secRowIdx = aoa.length
      sectionTitleRowIndices.push(secRowIdx)
      aoa.push([cleanText(sec.title), ...Array(Math.max(0, maxCols - 1)).fill('')])
      if (maxCols > 1) {
        merges.push({ s: { r: secRowIdx, c: 0 }, e: { r: secRowIdx, c: maxCols - 1 } })
      }
    }
    if (sec.headers && sec.headers.length) {
      headerRowIndices.push(aoa.length)
      aoa.push(sec.headers.map((h) => cleanText(h)))
    }
    if (sec.rows && sec.rows.length) {
      sec.rows.forEach((row) => {
        if (Array.isArray(row)) {
          aoa.push(
            row.map((cell) => {
              const text = cleanText(cell)
              if (/^-?\d+(\.\d+)?$/.test(text) && !text.startsWith('0') && text.length < 15) {
                const num = Number(text)
                if (!isNaN(num)) return num
              }
              return text
            })
          )
        } else if (row && typeof row === 'object') {
          aoa.push(
            (sec.headers || []).map((h) => {
              const text = cleanText(row[h])
              if (/^-?\d+(\.\d+)?$/.test(text) && !text.startsWith('0') && text.length < 15) {
                const num = Number(text)
                if (!isNaN(num)) return num
              }
              return text
            })
          )
        }
      })
    }
    if (isMultiSection && sIdx < config.sections.length - 1) {
      spacerRowIndices.push(aoa.length)
      aoa.push([]) // empty row between sections
    }
  })

  // If no sections produced data, fallback to empty sheet
  if (aoa.length === 0) {
    aoa.push(['No data available'])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Configure row heights (taller for title and headers)
  const rowHeights = []
  for (let r = 0; r < aoa.length; r++) {
    if (r === titleRowIndex) {
      rowHeights.push({ hpt: 32 })
    } else if (r === subtitleRowIndex) {
      rowHeights.push({ hpt: 20 })
    } else if (r === metaRowIndex || r === statsRowIndex) {
      rowHeights.push({ hpt: 18 })
    } else if (sectionTitleRowIndices.includes(r)) {
      rowHeights.push({ hpt: 24 })
    } else if (headerRowIndices.includes(r)) {
      rowHeights.push({ hpt: 26 })
    } else if (spacerRowIndices.includes(r) || aoa[r].length === 0) {
      rowHeights.push({ hpt: 10 })
    } else {
      rowHeights.push({ hpt: 20 })
    }
  }
  ws['!rows'] = rowHeights

  if (merges.length > 0) {
    ws['!merges'] = merges
  }

  // Apply styling to all cells: title banner, bold & highlighted headers, crisp cell borders
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let R = range.s.r; R <= range.e.r; ++R) {
    const isTitle = R === titleRowIndex
    const isSubtitle = R === subtitleRowIndex
    const isMeta = R === metaRowIndex
    const isStats = R === statsRowIndex
    const isSectionTitle = sectionTitleRowIndices.includes(R)
    const isHeaderRow = headerRowIndices.includes(R)
    const isSpacer = spacerRowIndices.includes(R)

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[cellRef]
      if (!cell) continue

      if (isTitle) {
        cell.s = {
          font: {
            bold: true,
            color: { rgb: '1A3C34' }, // Signature IITGN deep pine green
            sz: 14,
            name: 'Calibri',
          },
          fill: {
            fgColor: { rgb: 'E8F5E9' }, // Soft sage green tint
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            indent: 1,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'A5D6A7' } },
            bottom: { style: 'thin', color: { rgb: 'A5D6A7' } },
            left: { style: 'thin', color: { rgb: 'A5D6A7' } },
            right: { style: 'thin', color: { rgb: 'A5D6A7' } },
          },
        }
      } else if (isSubtitle) {
        cell.s = {
          font: {
            italic: true,
            color: { rgb: '334155' },
            sz: 10,
            name: 'Calibri',
          },
          fill: {
            fgColor: { rgb: 'F8FAFC' },
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            indent: 1,
          },
          border: {
            left: { style: 'thin', color: { rgb: 'E2E8F0' } },
            right: { style: 'thin', color: { rgb: 'E2E8F0' } },
          },
        }
      } else if (isMeta || isStats) {
        cell.s = {
          font: {
            color: isStats ? { rgb: '1E3A2F' } : { rgb: '64748B' },
            bold: Boolean(isStats),
            sz: 9,
            name: 'Calibri',
          },
          fill: {
            fgColor: { rgb: 'F8FAFC' },
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            indent: 1,
          },
          border: {
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'E2E8F0' } },
            right: { style: 'thin', color: { rgb: 'E2E8F0' } },
          },
        }
      } else if (isSectionTitle) {
        cell.s = {
          font: {
            bold: true,
            color: { rgb: '1A3C34' },
            sz: 11,
            name: 'Calibri',
          },
          fill: {
            fgColor: { rgb: 'F1F5F9' },
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            indent: 1,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        }
      } else if (isHeaderRow) {
        cell.s = {
          font: {
            bold: true,
            color: { rgb: 'FFFFFF' },
            sz: 11,
            name: 'Calibri',
          },
          fill: {
            fgColor: { rgb: '1E3A2F' }, // Signature IITGN forest green
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
          },
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
          font: {
            sz: 10,
            name: 'Calibri',
            color: { rgb: '0F172A' },
          },
          alignment: {
            vertical: 'center',
            horizontal: isNum ? 'right' : 'left',
          },
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

  // Dynamic column widths (ignoring title/subtitle/meta rows so col A is not overly stretched)
  const colWidths = []
  aoa.forEach((row, rIdx) => {
    if (
      rIdx === titleRowIndex ||
      rIdx === subtitleRowIndex ||
      rIdx === metaRowIndex ||
      rIdx === statsRowIndex ||
      sectionTitleRowIndices.includes(rIdx) ||
      spacerRowIndices.includes(rIdx) ||
      !row ||
      row.length === 0
    ) {
      return
    }
    if (Array.isArray(row)) {
      row.forEach((cell, idx) => {
        const len = String(cell ?? '').length
        colWidths[idx] = Math.min(Math.max(colWidths[idx] || 12, len + 4), 60)
      })
    }
  })
  for (let c = 0; c < maxCols; c++) {
    if (!colWidths[c]) colWidths[c] = 14
  }
  ws['!cols'] = colWidths.map((w) => ({ wch: w }))

  const sheetName = (config.title || 'Report').replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31).trim() || 'Report'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const baseName = config.filename.replace(/\.[^.]+$/, '')
  triggerDownload(blob, `${baseName}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PRINT REPORT
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function printReport(rawConfig) {
  const config = normalizeExportConfig(rawConfig)

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

  let statsHtml = ''
  if (config.stats && config.stats.length) {
    statsHtml = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        ${config.stats
          .map(
            (s) => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;min-width:110px;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.04em;">${escapeHtml(s.label)}</div>
            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(s.value)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `
  }

  let metaHtml = ''
  if (config.metadata && config.metadata.length) {
    metaHtml = `
      <div style="font-size:11px;color:#475569;margin-bottom:12px;background:#f1f5f9;padding:6px 10px;border-radius:4px;display:inline-block;">
        ${config.metadata.map((m) => `<strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}`).join(' &nbsp;|&nbsp; ')}
      </div>
    `
  }

  let sectionsHtml = ''
  config.sections.forEach((sec) => {
    const secTitle = sec.title
      ? `<h3 style="font-size:13px;margin:14px 0 6px 0;color:#1e293b;font-weight:700;">${escapeHtml(sec.title)}</h3>`
      : ''
    const headersList = (sec.headers || []).map(cleanText)
    const rowsList = (sec.rows || []).map((r) =>
      Array.isArray(r) ? r.map(cleanText) : headersList.map((h) => cleanText(r[h]))
    )

    const tableHeadHtml = headersList.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
    const tableRowsHtml = rowsList
      .map(
        (row, idx) => `
      <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
        ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}
      </tr>
    `
      )
      .join('')

    sectionsHtml += `
      ${secTitle}
      <table>
        <thead>
          <tr>${tableHeadHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    `
  })

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(config.title)}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm 12mm 12mm 12mm;
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
            margin-bottom: 12px;
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
            margin-top: 8px;
            margin-bottom: 14px;
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
            margin-top: 16px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            font-size: 9px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">IIT Gandhinagar · ${escapeHtml(config.module || 'Campus Operations')}</div>
          <h1>${escapeHtml(config.title)}</h1>
          ${config.subtitle ? `<div class="sub">${escapeHtml(config.subtitle)}</div>` : ''}
          <div class="meta">Generated: ${dateStr}</div>
        </div>
        ${metaHtml}
        ${statsHtml}
        ${sectionsHtml}
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
    } catch (e) {
      console.warn('Iframe print fallback to window.print', e)
      window.print()
    } finally {
      setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame)
        }
      }, 3000)
    }
  }, 400)
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export async function exportReport(format, config) {
  let targetFormat = format
  let targetConfig = config
  if (typeof format === 'object' && format !== null && !config) {
    targetConfig = format
    targetFormat = format.format || 'excel'
  }
  const fmt = String(targetFormat || '').toLowerCase()
  switch (fmt) {
    case 'excel':
    case 'xlsx':
      return exportToExcel(targetConfig)
    case 'csv':
      return exportToCsv(targetConfig)
    case 'pdf':
      return await exportToPdf(targetConfig)
    case 'print':
      return printReport(targetConfig)
    case 'word':
    case 'docx':
      return await exportToWord(targetConfig)
    case 'slides':
    case 'pptx':
      return await exportToSlides(targetConfig)
    default:
      return exportToExcel(targetConfig)
  }
}
