"""
Phase 3B — File exporters for MonthlyReport.

generate_csv(report)  →  saves to media/reports/csv/  and updates report.csv_file
generate_pdf(report)  →  saves to media/reports/pdf/  and updates report.pdf_file

Both functions are idempotent: if the file already exists they overwrite it.
PDF uses ReportLab (added to requirements.txt in 3B).
"""

import csv
import io
import os

from django.conf import settings
from django.core.files.base import ContentFile

# ── helpers ───────────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    ('item_name',        'Item Name'),
    ('category',         'Category'),
    ('item_type',        'Type'),
    ('unit',             'Unit'),
    ('consumption',      'Consumption (Month)'),
    ('current_stock',    'Current Stock'),
    ('threshold',        'Threshold'),
    ('recommended_order','Recommended Order'),
    ('unit_cost',        'Unit Cost (₹)'),
    ('estimated_cost',   'Estimated Cost (₹)'),
    ('status',           'Stock Status'),
]


def _filename_base(report):
    return f"monthly_report_{report.year}_{report.month:02d}"


# ── CSV ───────────────────────────────────────────────────────────────────────

def generate_csv(report) -> str:
    """
    Build the CSV in memory, save it via Django's storage, persist the path
    on the MonthlyReport instance, and return the file URL.
    """
    snapshot = report.snapshot or {}
    items = snapshot.get('items', [])

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    # ── header block ──────────────────────────────────────────────────────────
    writer.writerow(['Monthly Procurement Report'])
    writer.writerow([f"Period: {snapshot.get('period_label', '')}"])
    writer.writerow([f"Generated at: {snapshot.get('generated_at', '')}"])
    writer.writerow([])                              # blank separator

    # ── summary row ───────────────────────────────────────────────────────────
    writer.writerow(['Total Items', snapshot.get('total_items', 0)])
    writer.writerow(['Items Needing Reorder', snapshot.get('items_needing_reorder', 0)])
    writer.writerow([
        'Total Estimated Cost (₹)',
        f"{snapshot.get('total_estimated_cost', 0):.2f}",
    ])
    writer.writerow([])

    # ── column headers ────────────────────────────────────────────────────────
    writer.writerow([label for _, label in CSV_COLUMNS])

    # ── data rows ─────────────────────────────────────────────────────────────
    for row in items:
        writer.writerow([
            row.get('item_name', ''),
            row.get('category', ''),
            row.get('item_type', '').capitalize(),
            row.get('unit', ''),
            row.get('consumption', 0),
            row.get('current_stock', 0),
            row.get('threshold', 0),
            row.get('recommended_order', 0),
            f"{row.get('unit_cost', 0):.2f}",
            f"{row.get('estimated_cost', 0):.2f}",
            row.get('status', '').replace('_', ' ').title(),
        ])

    csv_bytes = buffer.getvalue().encode('utf-8-sig')   # BOM for Excel compat
    filename = f"{_filename_base(report)}.csv"

    report.csv_file.save(filename, ContentFile(csv_bytes), save=True)
    return report.csv_file.url


# ── PDF ───────────────────────────────────────────────────────────────────────

def generate_pdf(report) -> str:
    """
    Build a purchase-style PDF using ReportLab, persist, and return the URL.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    snapshot = report.snapshot or {}
    items = snapshot.get('items', [])

    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title=f"Procurement Report — {snapshot.get('period_label', '')}",
    )

    styles = getSampleStyleSheet()
    story = []

    # ── Title ─────────────────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        'ReportSub',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#64748b'),
        spaceAfter=2,
    )

    story.append(Paragraph('Monthly Procurement Report', title_style))
    story.append(Paragraph(f"Period: <b>{snapshot.get('period_label', '')}</b>", sub_style))
    story.append(Paragraph(f"Generated: {snapshot.get('generated_at', '')}", sub_style))
    story.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=8))

    # ── Summary cards (as a small table) ──────────────────────────────────────
    summary_data = [
        ['Total Items', 'Items to Reorder', 'Total Estimated Cost'],
        [
            str(snapshot.get('total_items', 0)),
            str(snapshot.get('items_needing_reorder', 0)),
            f"\u20b9{snapshot.get('total_estimated_cost', 0):,.2f}",
        ],
    ]
    summary_table = Table(summary_data, colWidths=[7 * cm, 7 * cm, 7 * cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR',   (0, 0), (-1, 0), colors.HexColor('#64748b')),
        ('FONTNAME',    (0, 0), (-1, 0), 'Helvetica'),
        ('FONTSIZE',    (0, 0), (-1, 0), 8),
        ('FONTNAME',    (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE',    (0, 1), (-1, 1), 13),
        ('TEXTCOLOR',   (0, 1), (-1, 1), colors.HexColor('#0f172a')),
        ('ALIGN',       (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
        ('BOX',         (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('INNERGRID',   (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING',  (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── Main data table ───────────────────────────────────────────────────────
    col_headers = [
        'Item Name', 'Category', 'Type', 'Unit',
        'Consumption', 'Stock', 'Threshold',
        'Rec. Order', 'Unit Cost (₹)', 'Est. Cost (₹)', 'Status',
    ]

    STATUS_COLORS = {
        'in_stock':    colors.HexColor('#dcfce7'),
        'low_stock':   colors.HexColor('#fef9c3'),
        'out_of_stock': colors.HexColor('#fee2e2'),
    }

    table_data = [col_headers]
    row_status = []   # track status per row for background colouring

    for row in items:
        st = row.get('status', 'in_stock')
        row_status.append(st)
        table_data.append([
            row.get('item_name', ''),
            row.get('category', ''),
            row.get('item_type', '').capitalize(),
            row.get('unit', ''),
            str(row.get('consumption', 0)),
            str(row.get('current_stock', 0)),
            str(row.get('threshold', 0)),
            str(row.get('recommended_order', 0)),
            f"{row.get('unit_cost', 0):.2f}",
            f"{row.get('estimated_cost', 0):.2f}",
            st.replace('_', ' ').title(),
        ])

    # Column widths summing to usable landscape width (~27 cm)
    col_widths = [5.5*cm, 3*cm, 2.2*cm, 2*cm, 2.5*cm, 2*cm, 2.3*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm]

    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)

    table_style = [
        # Header row
        ('BACKGROUND',    (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR',     (0, 0), (-1, 0), colors.white),
        ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, 0), 7.5),
        ('ALIGN',         (0, 0), (-1, 0), 'CENTER'),
        # Data rows
        ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE',      (0, 1), (-1, -1), 7),
        ('TEXTCOLOR',     (0, 1), (-1, -1), colors.HexColor('#1e293b')),
        ('ALIGN',         (4, 1), (-1, -1), 'CENTER'),   # numeric cols centered
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('GRID',          (0, 0), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]

    # Apply status colour to the last column of each data row
    for i, st in enumerate(row_status, start=1):
        bg = STATUS_COLORS.get(st)
        if bg:
            table_style.append(('BACKGROUND', (-1, i), (-1, i), bg))

    main_table.setStyle(TableStyle(table_style))
    story.append(main_table)

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    filename = f"{_filename_base(report)}.pdf"

    report.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
    return report.pdf_file.url
