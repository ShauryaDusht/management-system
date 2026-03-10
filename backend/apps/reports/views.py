from datetime import timedelta

from django.http import FileResponse
from django.core.files.base import ContentFile
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdmin as IsAdminUser
from .exporters import (
    export_consumption_item_csv,
    export_consumption_requester_csv,
    generate_csv,
    generate_pdf,
)
from .generators import (
    generate_consumption_report,
    generate_area_issues_report,
    generate_inventory_report,
    generate_monthly_report,
    generate_requests_report,
)
from .models import ItemConsumptionReport, MonthlyReport
from .serializers import MonthlyReportListSerializer, MonthlyReportDetailSerializer


# ── Existing report views ─────────────────────────────────────────────────────

class InventoryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = (request.query_params.get('status') or '').strip().lower() or None
        item_type_filter = (request.query_params.get('item_type') or '').strip().lower() or None
        data = generate_inventory_report(status_filter=status_filter, item_type_filter=item_type_filter)
        return Response(data)


class RequestsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_requests_report(date_from, date_to)
        return Response(data)


class ActivityTrendView(APIView):
    """
    GET /api/reports/activity-trend/?range=today|weekly|monthly
    Returns cross-module activity trend rows for admin dashboard charts.
    """
    permission_classes = [IsAdminUser]

    @staticmethod
    def _resolve_range(range_key):
        key = (range_key or 'weekly').strip().lower()
        if key not in {'today', 'weekly', 'monthly'}:
            key = 'weekly'
        days = 1 if key == 'today' else (30 if key == 'monthly' else 7)
        end_date = timezone.localdate()
        start_date = end_date - timedelta(days=days - 1)
        dates = [start_date + timedelta(days=i) for i in range(days)]
        return key, start_date, end_date, dates

    @staticmethod
    def _annotated_day_map(qs, datetime_field):
        return dict(
            qs.annotate(day=TruncDate(datetime_field))
            .values('day')
            .annotate(c=Count('id'))
            .values_list('day', 'c')
        )

    def get(self, request):
        range_key, start_date, end_date, dates = self._resolve_range(request.query_params.get('range'))

        from apps.inventory.models import ItemIssue, ItemRequest, PurchaseRequest, StockEntry
        from apps.housekeeping.models import HKArea, HKDailyRecord

        if end_date == timezone.localdate():
            from apps.housekeeping.htmx_views import get_today_records

            for area in HKArea.objects.filter(is_active=True):
                get_today_records(area, end_date)

        inv_requests_map = self._annotated_day_map(
            ItemRequest.objects.filter(requested_at__date__range=(start_date, end_date)),
            'requested_at',
        )
        inv_issues_map = self._annotated_day_map(
            ItemIssue.objects.filter(issued_at__date__range=(start_date, end_date)),
            'issued_at',
        )
        inv_stock_map = self._annotated_day_map(
            StockEntry.objects.filter(added_at__date__range=(start_date, end_date)),
            'added_at',
        )
        inv_purchase_map = self._annotated_day_map(
            PurchaseRequest.objects.filter(created_at__date__range=(start_date, end_date)),
            'created_at',
        )

        hk_rows = (
            HKDailyRecord.objects.filter(date__range=(start_date, end_date))
            .values('date')
            .annotate(
                total=Count('id'),
                done=Count('id', filter=Q(status='done')),
                pending=Count('id', filter=Q(status='pending')),
                in_progress=Count('id', filter=Q(status='in_progress')),
                skipped=Count('id', filter=Q(status='skipped')),
            )
        )
        hk_map = {
            row['date']: {
                'total': row['total'],
                'done': row['done'],
                'pending': row['pending'],
                'in_progress': row['in_progress'],
                'skipped': row['skipped'],
            }
            for row in hk_rows
        }

        series = []
        totals = {
            'inventory': 0,
            'housekeeping': 0,
            'horticulture': 0,
            'inventory_requests': 0,
            'inventory_issues': 0,
            'inventory_stock_additions': 0,
            'inventory_purchase_requests': 0,
            'hk_done': 0,
            'hk_pending': 0,
            'hk_in_progress': 0,
            'hk_skipped': 0,
        }

        for dt in dates:
            inv_requests = int(inv_requests_map.get(dt, 0) or 0)
            inv_issues = int(inv_issues_map.get(dt, 0) or 0)
            inv_stock = int(inv_stock_map.get(dt, 0) or 0)
            inv_purchase = int(inv_purchase_map.get(dt, 0) or 0)
            inventory_total = inv_requests + inv_issues + inv_stock + inv_purchase

            hk = hk_map.get(dt, {})
            hk_total = int(hk.get('total', 0) or 0)
            hk_done = int(hk.get('done', 0) or 0)
            hk_pending = int(hk.get('pending', 0) or 0)
            hk_in_progress = int(hk.get('in_progress', 0) or 0)
            hk_skipped = int(hk.get('skipped', 0) or 0)

            horticulture_total = 0
            total = inventory_total + hk_total + horticulture_total
            label = 'Today' if range_key == 'today' else dt.strftime('%d %b')

            row = {
                'date': dt.isoformat(),
                'label': label,
                'inventory': inventory_total,
                'housekeeping': hk_total,
                'horticulture': horticulture_total,
                'total': total,
                'inventory_requests': inv_requests,
                'inventory_issues': inv_issues,
                'inventory_stock_additions': inv_stock,
                'inventory_purchase_requests': inv_purchase,
                'hk_done': hk_done,
                'hk_pending': hk_pending,
                'hk_in_progress': hk_in_progress,
                'hk_skipped': hk_skipped,
            }
            series.append(row)

            totals['inventory'] += inventory_total
            totals['housekeeping'] += hk_total
            totals['horticulture'] += horticulture_total
            totals['inventory_requests'] += inv_requests
            totals['inventory_issues'] += inv_issues
            totals['inventory_stock_additions'] += inv_stock
            totals['inventory_purchase_requests'] += inv_purchase
            totals['hk_done'] += hk_done
            totals['hk_pending'] += hk_pending
            totals['hk_in_progress'] += hk_in_progress
            totals['hk_skipped'] += hk_skipped

        return Response(
            {
                'range': range_key,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'series': series,
                'totals': totals,
            }
        )


# ── Monthly report views ──────────────────────────────────────────────────────

class MonthlyReportListView(APIView):
    """
    GET  /api/reports/monthly/  → list all saved monthly reports (admin only)
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        reports = MonthlyReport.objects.all()
        serializer = MonthlyReportListSerializer(reports, many=True, context={'request': request})
        return Response(serializer.data)


class MonthlyReportGenerateView(APIView):
    """
    POST /api/reports/monthly/generate/
    Body: { "month": 1-12, "year": 2024, "overwrite": false }

    Generates the procurement snapshot and persists it.
    If a report for that month/year already exists, returns 409 unless
    overwrite=true is passed.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        month = request.data.get('month')
        year = request.data.get('year')
        overwrite = request.data.get('overwrite', False)

        errors = {}
        if not month:
            errors['month'] = 'This field is required.'
        if not year:
            errors['year'] = 'This field is required.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            month = int(month)
            year = int(year)
        except (ValueError, TypeError):
            return Response({'detail': 'month and year must be integers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12):
            return Response({'month': 'Must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)

        if year < 2000 or year > 2100:
            return Response({'year': 'Must be a valid 4-digit year.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = MonthlyReport.objects.filter(month=month, year=year).first()
        if existing and not overwrite:
            return Response(
                {
                    'detail': f'A report for {existing.period_label} already exists. '
                               'Pass overwrite=true to regenerate.',
                    'existing_id': existing.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        snapshot = generate_monthly_report(month=month, year=year)

        if existing and overwrite:
            # generated_at is now a plain DateTimeField (not auto_now_add),
            # so we can update it properly on regeneration via .update().
            MonthlyReport.objects.filter(pk=existing.pk).update(
                snapshot=snapshot,
                generated_by=request.user,
                generated_at=timezone.now(),  # reset timestamp on regeneration
                csv_file=None,
                pdf_file=None,
            )
            existing.refresh_from_db()
            report = existing
            # return 200 OK for an update, not 201 Created
            response_status = status.HTTP_200_OK
        else:
            report = MonthlyReport.objects.create(
                month=month,
                year=year,
                snapshot=snapshot,
                generated_by=request.user,
            )
            response_status = status.HTTP_201_CREATED

        serializer = MonthlyReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data, status=response_status)


class MonthlyReportDetailView(APIView):
    """
    GET    /api/reports/monthly/<id>/  → full report including snapshot rows
    DELETE /api/reports/monthly/<id>/  → remove saved report
    """
    permission_classes = [IsAdminUser]

    def _get_object(self, pk):
        try:
            return MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return None

    def get(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MonthlyReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MonthlyReportCSVView(APIView):
    """
    GET /api/reports/monthly/<id>/csv/
    Generates (or re-uses cached) CSV and streams it as a download.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not report.csv_file:
            generate_csv(report)

        file_handle = report.csv_file.open('rb')
        response = FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=f"procurement_{report.year}_{report.month:02d}.csv",
        )
        return response


class MonthlyReportPDFView(APIView):
    """
    GET /api/reports/monthly/<id>/pdf/
    Generates (or re-uses cached) PDF and streams it as a download.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not report.pdf_file:
            generate_pdf(report)

        file_handle = report.pdf_file.open('rb')
        response = FileResponse(
            file_handle,
            content_type='application/pdf',
            as_attachment=True,
            filename=f"procurement_{report.year}_{report.month:02d}.pdf",
        )
        return response


def _serialize_consumption_report_list_row(report):
    return {
        'id': report.id,
        'month': report.month,
        'year': report.year,
        'period_label': report.period_label,
        'generated_at': report.generated_at,
        'generated_by_name': (
            report.generated_by.get_full_name() or report.generated_by.username
            if report.generated_by else None
        ),
        'has_item_csv': bool(report.csv_item_file),
        'has_requester_csv': bool(report.csv_requester_file),
    }


def _consumption_report_filename(prefix: str, year: int, month: int) -> str:
    return f"{prefix}_{year}_{month:02d}.csv"


class ConsumptionReportListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        reports = ItemConsumptionReport.objects.all().order_by('-year', '-month')
        data = [_serialize_consumption_report_list_row(report) for report in reports]
        return Response(data)


class ConsumptionReportGenerateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        month = request.data.get('month')
        year = request.data.get('year')
        overwrite_raw = request.data.get('overwrite', False)
        overwrite = overwrite_raw in [True, 'true', 'True', 1, '1', 'yes', 'on']

        errors = {}
        if month is None:
            errors['month'] = 'This field is required.'
        if year is None:
            errors['year'] = 'This field is required.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            month = int(month)
            year = int(year)
        except (TypeError, ValueError):
            return Response({'detail': 'month and year must be integers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12):
            return Response({'month': 'Must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)
        if year < 2000 or year > 2100:
            return Response({'year': 'Must be between 2000 and 2100.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = ItemConsumptionReport.objects.filter(month=month, year=year).first()
        if existing and not overwrite:
            return Response(
                {
                    'detail': f'A consumption report for {existing.period_label} already exists. '
                              'Pass overwrite=true to regenerate.',
                    'existing_id': existing.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        snapshot = generate_consumption_report(month=month, year=year)
        item_csv_bytes = export_consumption_item_csv(snapshot)
        requester_csv_bytes = export_consumption_requester_csv(snapshot)
        now = timezone.now()
        item_filename = _consumption_report_filename('consumption_items', year, month)
        requester_filename = _consumption_report_filename('consumption_requesters', year, month)

        if existing and overwrite:
            if existing.csv_item_file:
                existing.csv_item_file.delete(save=False)
            if existing.csv_requester_file:
                existing.csv_requester_file.delete(save=False)

            existing.snapshot = snapshot
            existing.generated_by = request.user
            existing.generated_at = now
            existing.csv_item_file.save(item_filename, ContentFile(item_csv_bytes), save=False)
            existing.csv_requester_file.save(requester_filename, ContentFile(requester_csv_bytes), save=False)
            existing.save()
            report = existing
            response_status = status.HTTP_200_OK
        else:
            report = ItemConsumptionReport(
                month=month,
                year=year,
                generated_by=request.user,
                generated_at=now,
                snapshot=snapshot,
            )
            report.csv_item_file.save(item_filename, ContentFile(item_csv_bytes), save=False)
            report.csv_requester_file.save(requester_filename, ContentFile(requester_csv_bytes), save=False)
            report.save()
            response_status = status.HTTP_201_CREATED

        return Response(
            {
                'id': report.id,
                'month': report.month,
                'year': report.year,
                'period_label': report.period_label,
                'generated_at': report.generated_at,
            },
            status=response_status,
        )


class ConsumptionReportDetailView(APIView):
    permission_classes = [IsAdminUser]

    def _get_object(self, pk):
        try:
            return ItemConsumptionReport.objects.select_related('generated_by').get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return None

    def get(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'id': report.id,
                'month': report.month,
                'year': report.year,
                'period_label': report.period_label,
                'generated_at': report.generated_at,
                'generated_by_name': (
                    report.generated_by.get_full_name() or report.generated_by.username
                    if report.generated_by else None
                ),
                'has_item_csv': bool(report.csv_item_file),
                'has_requester_csv': bool(report.csv_requester_file),
                'snapshot': report.snapshot or {},
            }
        )

    def delete(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConsumptionReportItemCSVView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = ItemConsumptionReport.objects.get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        filename = _consumption_report_filename('consumption_items', report.year, report.month)
        if not report.csv_item_file:
            snapshot = report.snapshot or generate_consumption_report(report.month, report.year)
            report.snapshot = snapshot
            item_csv_bytes = export_consumption_item_csv(snapshot)
            report.csv_item_file.save(filename, ContentFile(item_csv_bytes), save=False)
            report.save()

        file_handle = report.csv_item_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )


class ConsumptionReportRequesterCSVView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = ItemConsumptionReport.objects.get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        filename = _consumption_report_filename('consumption_requesters', report.year, report.month)
        if not report.csv_requester_file:
            snapshot = report.snapshot or generate_consumption_report(report.month, report.year)
            report.snapshot = snapshot
            requester_csv_bytes = export_consumption_requester_csv(snapshot)
            report.csv_requester_file.save(filename, ContentFile(requester_csv_bytes), save=False)
            report.save()

        file_handle = report.csv_requester_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )


class AreaIssuesReportView(APIView):
    """
    GET /api/reports/area-issues/
    Optional params: ?month=3&year=2026
    Returns area-wise issued items report.
    Also supports ?download=csv to get a CSV file.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        area_class = request.query_params.get('area_class', 'all')
        area_name = request.query_params.get('area_name', '')
        download = request.query_params.get('download', '')

        try:
            month = int(month) if month else None
            year = int(year) if year else None
        except (ValueError, TypeError):
            month = year = None

        data = generate_area_issues_report(
            month=month,
            year=year,
            area_class=area_class,
            area_name=area_name,
        )

        if download == 'csv':
            import csv
            import io
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Area', 'Area Type', 'Item', 'Item Type', 'Unit',
                'Requested By', 'Qty Requested', 'Qty Issued',
                'Issued At', 'Issued By', 'Status', 'Returned/Finalized'
            ])
            for row in data['rows']:
                writer.writerow([
                    row['area_name'], row['area_type'], row['item_name'],
                    row['item_type'], row['item_unit'], row['requested_by'],
                    row['quantity_requested'], row['quantity_issued'],
                    row['issued_at'], row['issued_by'], row['status'],
                    'Yes' if (row['returned'] or row['usage_finalized']) else 'No'
                ])
            output.seek(0)
            from django.http import HttpResponse
            period = f"_{year}_{month:02d}" if month and year else "_all"
            if data.get('area_class') and data.get('area_class') != 'all':
                period += f"_{data['area_class']}"
            if data.get('area_name'):
                safe_area = ''.join(ch if ch.isalnum() else '_' for ch in data['area_name']).strip('_')
                if safe_area:
                    period += f"_{safe_area.lower()}"
            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="area_issues{period}.csv"'
            return response

        return Response(data)
