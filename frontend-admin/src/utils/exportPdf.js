import { jsPDF } from 'jspdf';
import autoTableModule from 'jspdf-autotable';

const autoTable = typeof autoTableModule === 'function' ? autoTableModule : (autoTableModule.default || autoTableModule);

/**
 * Universal PDF Table Exporter for IITGN Campus Management Reports
 * @param {string} filename - Output PDF filename (e.g., 'meter-readings.pdf')
 * @param {Array<Array<any>>} rows - 2D table array [headers, ...dataRows]
 * @param {string} [title] - Report title header
 */
export function downloadPdf(filename, rows, title = '') {
  if (!rows || !rows.length) return;

  const pdfFilename = filename.endsWith('.csv')
    ? filename.replace(/\.csv$/, '.pdf')
    : filename.endsWith('.pdf')
    ? filename
    : `${filename}.pdf`;

  const headers = rows[0] || [];
  const body = rows.slice(1) || [];

  // Use landscape if more than 5 columns
  const isLandscape = headers.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const cleanTitle = title || pdfFilename.replace(/\.pdf$/, '').replace(/[-_]/g, ' ').toUpperCase();

  // Header background bar (IITGN forest dark green)
  doc.setFillColor(30, 58, 48);
  doc.rect(0, 0, pageWidth, 40, 'F');

  // Title Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('IIT GANDHINAGAR — CAMPUS SANCHALIKA', 24, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(215, 235, 225);
  doc.text(cleanTitle, 24, 32);

  // Timestamp on top right
  const now = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setFontSize(8);
  doc.text(`Generated: ${now}`, pageWidth - 24, 25, { align: 'right' });

  // Generate Table
  autoTable(doc, {
    startY: 50,
    head: [headers],
    body: body,
    theme: 'striped',
    margin: { top: 48, bottom: 32, left: 20, right: 20 },
    headStyles: {
      fillColor: [45, 74, 62],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: headers.length > 10 ? 6.5 : headers.length > 6 ? 7.5 : 8.5,
      cellPadding: 3.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: headers.length > 10 ? 6 : headers.length > 6 ? 7 : 8,
      cellPadding: 3,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 249],
    },
    didDrawPage: (data) => {
      doc.setFontSize(7.5);
      doc.setTextColor(140, 150, 160);
      doc.text(
        `Page ${data.pageNumber} · Campus Sanchalika Estate Operations`,
        20,
        pageHeight - 12
      );
      doc.text(
        'Confidential · For Internal IITGN Use Only',
        pageWidth - 20,
        pageHeight - 12,
        { align: 'right' }
      );
    },
  });

  doc.save(pdfFilename);
}

export default downloadPdf;
