from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdmin as IsAdminUser
from .exporters import generate_csv, generate_pdf
from .generators import generate_inventory_report, generate_requests_report, generate_monthly_report
from .models import MonthlyReport
from .serializers import MonthlyReportListSerializer, MonthlyReportDetailSerializer


# ── Existing report views ─────────────────────────────────────────────────────

class InventoryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = generate_inventory_report()
        return Response(data)


class RequestsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_requests_report(date_from, date_to)
        return Response(data)


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
