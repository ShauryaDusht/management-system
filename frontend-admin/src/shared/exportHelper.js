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
  const metadata = Array.isArray(config.metadata) ? config.metadata : []
  const stats = Array.isArray(config.stats) ? config.stats : []

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
  }

  return {
    filename,
    module: moduleName,
    title,
    subtitle,
    metadata,
    stats,
    sections,
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
export async function exportToPdf(rawConfig) {
  const config = normalizeExportConfig(rawConfig)

  // Decide orientation: if any table has > 6 columns, use landscape
  const maxCols = Math.max(0, ...config.sections.map((s) => (s.headers || []).length))
  const orientation = maxCols > 6 ? 'landscape' : 'portrait'

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

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

    autoTable(doc, {
      startY: currentY,
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [45, 74, 62], // #2d4a3e
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'left',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 30, 30],
        cellPadding: 2.2,
      },
      alternateRowStyles: {
        fillColor: [249, 248, 246],
      },
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
// Unified Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export async function exportReport(format, config) {
  switch (format) {
    case 'csv':
      return exportToCsv(config)
    case 'pdf':
      return await exportToPdf(config)
    case 'word':
      return await exportToWord(config)
    case 'slides':
      return await exportToSlides(config)
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}
