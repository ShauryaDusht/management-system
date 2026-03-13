from datetime import timedelta
import csv
import io
import re
import zipfile
from urllib.parse import urlparse, urlunparse

from django.contrib.auth import get_user_model
from django.db import OperationalError, ProgrammingError, transaction
from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponse
from django.core.files.base import ContentFile
from django.core.cache import cache
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from apps.reports.exporters import (
    export_supervisor_report_csv,
    export_worker_report_csv,
    export_workers_combined_csv,
)
from apps.reports.generators import generate_supervisor_report, generate_worker_report
from apps.reports.models import SupervisorMonthlyReport, WorkerMonthlyReport
from apps.core.permissions import IsAdminOnly, IsAdminOrHousekeepingManager

from .models import (
    HKAlert,
    HKArea,
    HKAttendanceRecord,
    HKDailyRecord,
    HKStaffAttendanceRecord,
    HKInchargeAssignment,
    HKInchargeNotification,
    HKLeaveRequest,
    HKScheduleTemplate,
    HKStockRequest,
    HKUserArea,
    HKWorker,
    HKWorkerSelectionRequest,
)
from .serializers import (
    HKAlertSerializer,
    HKAreaSerializer,
    HKDailyRecordSerializer,
    HKInchargeAssignmentSerializer,
    HKInchargeNotificationSerializer,
    HKLeaveRequestSerializer,
    HKScheduleTemplateSerializer,
    HKStaffAttendanceRecordSerializer,
    HKStockRequestSerializer,
    HKStockRequestStatusSerializer,
    HKWorkerSerializer,
    HKWorkerSelectionRequestSerializer,
)


def _area_group(area):
    if not area:
        return 'others'
    name = (area.name or '').strip()
    if re.match(r'^Academic Block\s+([1-9]|1[0-3])$', name, re.IGNORECASE):
        return 'academic'
    if name in {'Academic Common Area', 'New AB U-Shape', 'New Academy'}:
        return 'academic'
    if name.lower() in {'hostel common area', 'common area', 'hostels reliever'}:
        return 'hostels'
    if area.area_type == 'hostel':
        return 'hostels'
    return 'others'


def _filter_workers_by_section(qs, section_filter):
    if section_filter == 'all':
        return qs
    worker_ids = [w.id for w in qs if _area_group(w.area) == section_filter]
    return HKWorker.objects.filter(id__in=worker_ids, is_active=True)


def _push_incharge_notice(user, assignment, message, level='info'):
    if not user:
        return
    HKInchargeNotification.objects.create(
        user=user,
        assignment=assignment,
        message=message,
        level=level,
    )


def _parse_report_period(month_raw, year_raw):
    today = timezone.localdate()

    if not month_raw and not year_raw:
        return today.month, today.year, None
    if not month_raw or not year_raw:
        return None, None, 'month and year must be provided together.'

    try:
        month = int(month_raw)
        year = int(year_raw)
    except (TypeError, ValueError):
        return None, None, 'month and year must be integers.'

    if not (1 <= month <= 12):
        return None, None, 'month must be between 1 and 12.'
    if year < 2000 or year > 2100:
        return None, None, 'year must be a valid 4-digit year.'

    return month, year, None


def _is_current_month(month, year):
    today = timezone.localdate()
    return (year, month) == (today.year, today.month)


def _is_past_month(month, year):
    today = timezone.localdate()
    return (year, month) < (today.year, today.month)


def _worker_report_filename(worker, month, year):
    safe_name = slugify(worker.name) or str(worker.id)
    return f"worker_{safe_name}_{month:02d}_{year}.csv"


def _get_supervisor_or_404(pk):
    User = get_user_model()
    return get_object_or_404(
        User,
        pk=pk,
        role__in=['supervisor', 'caretaker'],
    )


def _supervisor_report_filename(supervisor, month, year):
    safe_name = slugify(supervisor.username) or str(supervisor.id)
    return f"supervisor_{safe_name}_{month:02d}_{year}.csv"


def _stream_or_generate_csv(cached_report, generate_fn, export_fn, filename):
    """
    Given an optional cached report object, a generate function, an export function,
    and a filename, return the appropriate FileResponse or (csv_bytes, filename) tuple.
    """
    if cached_report and cached_report.csv_file:
        file_handle = cached_report.csv_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )

    if cached_report and not cached_report.csv_file:
        snapshot = cached_report.snapshot or generate_fn()
        csv_bytes = export_fn(snapshot)
        cached_report.csv_file.save(filename, ContentFile(csv_bytes), save=True)

        file_handle = cached_report.csv_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )

    snapshot = generate_fn()
    csv_bytes = export_fn(snapshot)
    return csv_bytes, filename


class HKAreaListCreateView(ListCreateAPIView):
    serializer_class = HKAreaSerializer

    def get_permissions(self):
        if self.request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            return [IsAdminOrHousekeepingManager()]
        return [IsAuthenticated()]

    def get_queryset(self):
        from django.db.models import Prefetch
        from .models import HKUserArea

        # Phase 3 fix: prefetch assigned_users + annotate worker count to
        # eliminate N+1 queries in HKAreaSerializer.
        return (
            HKArea.objects
            .filter(is_active=True)
            .prefetch_related(
                Prefetch(
                    'assigned_users',
                    queryset=HKUserArea.objects.select_related('user'),
                )
            )
            .annotate(_worker_count_cache=Count('workers', filter=Q(workers__is_active=True)))
        )


class HKWorkerListView(ListAPIView):
    serializer_class = HKWorkerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKWorker.objects.select_related('area', 'supervisor').filter(is_active=True)
        area = self.request.query_params.get('area')
        if area:
            qs = qs.filter(area_id=area)
        return qs


class HKWorkerCreateView(APIView):
    permission_classes = [IsAdminOrHousekeepingManager]

    def post(self, request):
        data = request.data.copy()
        first_name = (data.pop('first_name', '') or '').strip()
        last_name = (data.pop('last_name', '') or '').strip()
        if not data.get('name'):
            data['name'] = ' '.join([p for p in [first_name, last_name] if p]).strip()
        if not data.get('name'):
            return Response({'detail': 'Worker name is required.'}, status=400)

        if data.get('is_reliever') in [True, 'true', '1', 'on', 'yes']:
            data['is_reliever'] = True
            data['worker_type'] = 'reliever'

        serializer = HKWorkerSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        worker = serializer.save()
        return Response(HKWorkerSerializer(worker).data, status=201)


class HKWorkerDetailView(APIView):
    permission_classes = [IsAdminOrHousekeepingManager]

    def patch(self, request, pk):
        worker = get_object_or_404(HKWorker, pk=pk)
        data = request.data.copy()

        first_name = (data.pop('first_name', '') or '').strip()
        last_name = (data.pop('last_name', '') or '').strip()
        if first_name or last_name:
            data['name'] = ' '.join([p for p in [first_name, last_name] if p]).strip()

        if data.get('is_reliever') in [True, 'true', '1', 'on', 'yes']:
            data['is_reliever'] = True
            if not data.get('worker_type'):
                data['worker_type'] = 'reliever'

        serializer = HKWorkerSerializer(worker, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        worker = serializer.save()
        return Response(HKWorkerSerializer(worker).data, status=200)

    def delete(self, request, pk):
        worker = get_object_or_404(HKWorker, pk=pk)
        worker.is_active = False
        worker.save(update_fields=['is_active'])
        return Response(status=204)


class HKWorkerReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        worker = get_object_or_404(HKWorker, pk=pk)

        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        if not _is_current_month(month, year):
            cached_report = WorkerMonthlyReport.objects.filter(
                worker=worker,
                month=month,
                year=year,
            ).first()
            if cached_report:
                return Response(
                    {
                        'cached': True,
                        'generated_at': cached_report.generated_at,
                        'snapshot': cached_report.snapshot,
                    }
                )

        snapshot = generate_worker_report(worker.id, month, year)
        return Response(
            {
                'cached': False,
                'generated_at': snapshot.get('generated_at'),
                'snapshot': snapshot,
            }
        )


class HKWorkerReportCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        worker = get_object_or_404(HKWorker, pk=pk)

        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        filename = _worker_report_filename(worker, month, year)
        cached_report = None
        if _is_past_month(month, year):
            cached_report = WorkerMonthlyReport.objects.filter(
                worker=worker,
                month=month,
                year=year,
            ).first()

        result = _stream_or_generate_csv(
            cached_report,
            lambda: generate_worker_report(worker.id, month, year),
            export_worker_report_csv,
            filename,
        )
        if isinstance(result, FileResponse):
            return result

        csv_bytes, filename = result
        response = HttpResponse(csv_bytes, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class SupervisorReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        supervisor = _get_supervisor_or_404(pk)

        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        if _is_past_month(month, year):
            try:
                cached_report = SupervisorMonthlyReport.objects.filter(
                    supervisor=supervisor,
                    month=month,
                    year=year,
                ).first()
            except (OperationalError, ProgrammingError):
                cached_report = None
            if cached_report:
                return Response(
                    {
                        'cached': True,
                        'generated_at': cached_report.generated_at,
                        'snapshot': cached_report.snapshot,
                    }
                )

        snapshot = generate_supervisor_report(supervisor.id, month, year)
        return Response(
            {
                'cached': False,
                'generated_at': snapshot.get('generated_at'),
                'snapshot': snapshot,
            }
        )


class SupervisorReportCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        supervisor = _get_supervisor_or_404(pk)

        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        filename = _supervisor_report_filename(supervisor, month, year)
        cached_report = None
        if _is_past_month(month, year):
            try:
                cached_report = SupervisorMonthlyReport.objects.filter(
                    supervisor=supervisor,
                    month=month,
                    year=year,
                ).first()
            except (OperationalError, ProgrammingError):
                cached_report = None

        result = _stream_or_generate_csv(
            cached_report,
            lambda: generate_supervisor_report(supervisor.id, month, year),
            export_supervisor_report_csv,
            filename,
        )
        if isinstance(result, FileResponse):
            return result

        csv_bytes, filename = result
        response = HttpResponse(csv_bytes, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class SupervisorReportRegenerateView(APIView):
    permission_classes = [IsAdminOrHousekeepingManager]

    def post(self, request, pk):
        supervisor = _get_supervisor_or_404(pk)

        month, year, err = _parse_report_period(
            request.data.get('month'),
            request.data.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        if not _is_past_month(month, year):
            return Response(
                {'detail': 'Only completed past months can be regenerated/cached.'},
                status=400,
            )

        snapshot = generate_supervisor_report(supervisor.id, month, year)
        csv_bytes = export_supervisor_report_csv(snapshot)
        now = timezone.now()
        filename = _supervisor_report_filename(supervisor, month, year)

        report, created = SupervisorMonthlyReport.objects.get_or_create(
            supervisor=supervisor,
            month=month,
            year=year,
            defaults={
                'generated_at': now,
                'snapshot': snapshot,
            },
        )
        if not created:
            if report.csv_file:
                report.csv_file.delete(save=False)
            report.snapshot = snapshot
            report.generated_at = now
        else:
            report.generated_at = now
            report.snapshot = snapshot

        report.csv_file.save(filename, ContentFile(csv_bytes), save=False)
        report.save()

        return Response({'success': True, 'generated_at': report.generated_at})


class HKInchargeReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        from calendar import month_name
        import datetime
        period_start = datetime.date(year, month, 1)
        import calendar
        period_end = datetime.date(year, month, calendar.monthrange(year, month)[1])

        qs = (
            HKInchargeAssignment.objects
            .filter(leave_date__gte=period_start, leave_date__lte=period_end)
            .select_related('leave_staff', 'assigned_staff', 'area', 'admin_action_by')
            .order_by('leave_date', 'leave_staff__first_name')
        )

        rows = []
        for a in qs:
            rows.append({
                'leave_staff': a.leave_staff_name,
                'area': a.area.name if a.area else '',
                'cover_all_areas': a.cover_all_areas,
                'leave_date': a.leave_date.isoformat(),
                'incharge': a.assigned_staff_name,
                'status': a.status,
                'reason': a.leave_request.reason if hasattr(a, 'leave_request') and a.leave_request else '',
                'admin_action_by': (
                    a.admin_action_by.get_full_name() or a.admin_action_by.username
                    if a.admin_action_by else ''
                ),
                'admin_action_note': a.admin_action_note or '',
                'admin_action_at': a.admin_action_at.isoformat() if a.admin_action_at else '',
            })

        total = len(rows)
        approved = sum(1 for r in rows if r['status'] == 'approved')
        rejected = sum(1 for r in rows if r['status'] == 'admin_rejected')
        pending = sum(1 for r in rows if r['status'] in ('pending_acceptance', 'pending_admin_approval'))
        declined = sum(1 for r in rows if r['status'] == 'declined')

        return Response({
            'month': month,
            'year': year,
            'period_label': f"{month_name[month]} {year}",
            'summary': {
                'total': total,
                'approved': approved,
                'rejected': rejected,
                'pending': pending,
                'declined': declined,
            },
            'rows': rows,
        })


class HKWorkerSelectionRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = (request.query_params.get('status') or '').strip().lower()
        qs = (
            HKWorkerSelectionRequest.objects
            .select_related(
                'source_area',
                'target_area',
                'target_supervisor',
                'requested_by',
                'approved_by',
            )
            .prefetch_related('workers')
            .order_by('-created_at')
        )
        if status_filter in {'pending', 'approved', 'rejected'}:
            qs = qs.filter(status=status_filter)
        serializer = HKWorkerSelectionRequestSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not request.user.is_admin:
            return Response({'detail': 'Only admin can create worker selection requests.'}, status=403)

        data = request.data
        selection_type = (data.get('selection_type') or 'specific').strip().lower()
        section_filter = (data.get('section_filter') or 'all').strip().lower()
        target_group = (data.get('target_group') or '').strip().lower()
        target_area_id = data.get('target_area_id') or data.get('target_area')
        source_area_id = data.get('source_area_id') or data.get('source_area')
        target_supervisor_id = data.get('target_supervisor_id') or data.get('target_supervisor')
        note = (data.get('note') or '').strip()

        if selection_type not in {'all', 'section', 'specific'}:
            return Response({'detail': 'selection_type must be all, section, or specific.'}, status=400)
        if section_filter not in {'all', 'hostels', 'academic', 'others'}:
            return Response({'detail': 'section_filter must be all, hostels, academic, or others.'}, status=400)
        if target_group not in {'all', 'hostels', 'academic', 'others'}:
            return Response({'detail': 'target_group is required and must be all, hostels, academic, or others.'}, status=400)

        target_area = None
        if target_area_id:
            target_area = HKArea.objects.filter(pk=target_area_id, is_active=True).first()
            if not target_area:
                return Response({'detail': 'Target area not found.'}, status=404)
            if target_group != 'all' and _area_group(target_area) != target_group:
                return Response({'detail': 'Target area does not belong to selected target group.'}, status=400)

        source_area = None
        if source_area_id:
            source_area = HKArea.objects.filter(pk=source_area_id, is_active=True).first()
            if not source_area:
                return Response({'detail': 'Source area not found.'}, status=404)

        target_supervisor = None
        if target_supervisor_id:
            from apps.users.models import User

            target_supervisor = User.objects.filter(pk=target_supervisor_id).first()
            if not target_supervisor:
                return Response({'detail': 'Target supervisor not found.'}, status=404)
            if target_supervisor.role not in {'supervisor', 'caretaker'}:
                return Response({'detail': 'Target supervisor must have role supervisor or caretaker.'}, status=400)

        workers_qs = HKWorker.objects.select_related('area').filter(is_active=True)
        if source_area:
            workers_qs = workers_qs.filter(area=source_area)

        raw_worker_ids = data.get('worker_ids') or []
        selected_worker_ids = []
        if raw_worker_ids:
            if not isinstance(raw_worker_ids, (list, tuple)):
                return Response({'detail': 'worker_ids must be a list.'}, status=400)
            try:
                worker_ids = [int(wid) for wid in raw_worker_ids]
            except (TypeError, ValueError):
                return Response({'detail': 'worker_ids must contain numeric ids only.'}, status=400)
            pre_qs = workers_qs.filter(id__in=worker_ids)
            if section_filter != 'all':
                pre_qs = _filter_workers_by_section(pre_qs, section_filter)
            selected_worker_ids = list(pre_qs.values_list('id', flat=True).distinct())

        req_obj = HKWorkerSelectionRequest.objects.create(
            selection_type=selection_type,
            section_filter=section_filter,
            target_group=target_group,
            source_area=source_area,
            target_area=target_area,
            target_supervisor=target_supervisor,
            note=note,
            status='pending',
            requested_by=request.user,
        )
        # Strict workflow: staff must submit workers first from mobile overlay.
        # Admin pre-selection is stored as note hint only; workers remain empty.
        if selected_worker_ids:
            suggested = list(
                HKWorker.objects.filter(id__in=selected_worker_ids).values_list('name', flat=True)[:30]
            )
            hint = f"[Admin Suggested Workers] {', '.join(suggested)}"
            req_obj.note = f"{req_obj.note}\n{hint}".strip() if req_obj.note else hint
            req_obj.save(update_fields=['note'])

        serializer = HKWorkerSelectionRequestSerializer(req_obj)
        return Response(serializer.data, status=201)


class HKWorkerSelectionRequestDecisionView(APIView):
    permission_classes = [IsAdminOnly]

    def post(self, request, pk):
        req_obj = get_object_or_404(
            HKWorkerSelectionRequest.objects.prefetch_related('workers'),
            pk=pk,
        )
        if req_obj.status != 'pending':
            return Response({'detail': 'Only pending requests can be decided.'}, status=400)

        decision = (request.data.get('decision') or '').strip().lower()
        decision_note = (request.data.get('decision_note') or '').strip()
        if decision not in {'approved', 'rejected'}:
            return Response({'detail': 'decision must be approved or rejected.'}, status=400)

        moved_count = req_obj.workers.filter(is_active=True).count()
        if decision == 'approved' and moved_count == 0:
            return Response(
                {'detail': 'Staff worker selection is pending. No workers selected yet.'},
                status=400,
            )
        if decision == 'approved' and not req_obj.target_area_id:
            return Response(
                {'detail': 'Staff selection is pending destination area. Ask staff to submit from mobile dashboard.'},
                status=400,
            )

        with transaction.atomic():
            if decision == 'approved':
                workers_qs = req_obj.workers.filter(is_active=True)
                # Ensure area + supervisor mapping both update after approval.
                # If explicit target supervisor is not set, map to area assignee.
                target_supervisor = req_obj.target_supervisor
                if not target_supervisor:
                    area_links = list(
                        HKUserArea.objects.select_related('user').filter(
                            area=req_obj.target_area,
                            user__is_active=True,
                            user__role__in=['caretaker', 'supervisor'],
                        )
                    )
                    if area_links:
                        area_links.sort(key=lambda link: 0 if link.user.role == 'caretaker' else 1)
                        target_supervisor = area_links[0].user

                workers_qs.update(area=req_obj.target_area, supervisor=target_supervisor)

            req_obj.status = decision
            req_obj.approved_by = request.user
            req_obj.decision_note = decision_note
            req_obj.decided_at = timezone.now()
            req_obj.save(
                update_fields=['status', 'approved_by', 'decision_note', 'decided_at']
            )

        payload = HKWorkerSelectionRequestSerializer(req_obj).data
        payload['moved_count'] = moved_count
        return Response(payload, status=200)


class HKInchargeAssignmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = (request.query_params.get('status') or '').strip().lower()
        qs = (
            HKInchargeAssignment.objects
            .select_related(
                'area',
                'leave_request',
                'leave_staff',
                'assigned_staff',
                'admin_action_by',
            )
            .prefetch_related('leave_staff__hk_areas__area')
            .order_by('-created_at')
        )
        if request.user.role not in ['admin', 'housekeeping_manager']:
            qs = qs.filter(Q(leave_staff=request.user) | Q(assigned_staff=request.user))
        if status_filter:
            qs = qs.filter(status=status_filter)
        serializer = HKInchargeAssignmentSerializer(qs, many=True)
        return Response(serializer.data)


class HKInchargeAssignmentDecisionView(APIView):
    permission_classes = [IsAdminOnly]

    def post(self, request, pk):
        assignment = get_object_or_404(
            HKInchargeAssignment.objects.select_related(
                'leave_request',
                'area',
                'leave_staff',
                'assigned_staff',
            ).prefetch_related('leave_staff__hk_areas__area'),
            pk=pk,
        )
        if assignment.status != 'pending_admin_approval':
            return Response(
                {'detail': 'Only pending_admin_approval assignments can be decided.'},
                status=400,
            )

        decision = (request.data.get('decision') or '').strip().lower()
        note = (request.data.get('decision_note') or '').strip()
        if decision not in {'approved', 'rejected'}:
            return Response({'detail': 'decision must be approved or rejected.'}, status=400)

        with transaction.atomic():
            now = timezone.now()
            if decision == 'approved':
                assignment.status = 'approved'
                assignment.arrival_notified = False
                assignment.leave_request.status = 'approved'
            else:
                assignment.status = 'admin_rejected'
                assignment.leave_request.status = 'reassign_required'

            assignment.admin_action_by = request.user
            assignment.admin_action_at = now
            assignment.admin_action_note = note
            assignment.leave_request.save(update_fields=['status', 'updated_at'])
            assignment.save(
                update_fields=[
                    'status',
                    'arrival_notified',
                    'admin_action_by',
                    'admin_action_at',
                    'admin_action_note',
                    'updated_at',
                ]
            )

            if decision == 'approved':
                leave_request = assignment.leave_request
                leave_att, _ = HKStaffAttendanceRecord.objects.get_or_create(
                    staff=assignment.leave_staff,
                    date=assignment.leave_date,
                    defaults={
                        'status': 'leave',
                        'source': 'auto_leave',
                        'leave_request': leave_request,
                    },
                )
                leave_att.status = 'leave'
                leave_att.source = 'auto_leave'
                leave_att.leave_request = leave_request
                leave_att.save(update_fields=['status', 'source', 'leave_request'])

                HKStaffAttendanceRecord.objects.get_or_create(
                    staff=assignment.assigned_staff,
                    date=assignment.leave_date,
                    defaults={
                        'status': 'present',
                        'source': 'auto_attendance',
                    },
                )

                _push_incharge_notice(
                    assignment.leave_staff,
                    assignment,
                    f'Admin approved {assignment.assigned_staff_name} as incharge for {assignment.leave_date}.',
                    level='success',
                )
                _push_incharge_notice(
                    assignment.assigned_staff,
                    assignment,
                    f'Admin approved you as incharge for {assignment.leave_date}.',
                    level='success',
                )
            else:
                _push_incharge_notice(
                    assignment.leave_staff,
                    assignment,
                    f'Admin rejected incharge assignment for {assignment.leave_date}. Please select another incharge.',
                    level='error',
                )
                _push_incharge_notice(
                    assignment.assigned_staff,
                    assignment,
                    f'Admin rejected your temporary incharge assignment for {assignment.leave_date}.',
                    level='warning',
                )

        return Response(HKInchargeAssignmentSerializer(assignment).data)


class HKLeaveRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            HKLeaveRequest.objects
            .select_related('staff', 'area')
            .order_by('-leave_date', '-created_at')
        )
        if request.user.role not in ['admin', 'housekeeping_manager']:
            qs = qs.filter(staff=request.user)
        serializer = HKLeaveRequestSerializer(qs, many=True)
        return Response(serializer.data)


class HKDailyRecordListView(ListAPIView):
    serializer_class = HKDailyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKDailyRecord.objects.select_related('schedule', 'area', 'assigned_worker', 'assigned_by')
        area = self.request.query_params.get('area')
        date_str = self.request.query_params.get('date', str(timezone.localdate()))

        try:
            parsed_date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            parsed_date = timezone.localdate()

        if area:
            area_obj = HKArea.objects.filter(pk=area).first()
            if area_obj:
                # Keep REST behavior consistent with HTMX mobile: ensure
                # today's daily records exist before listing them.
                from .htmx_views import get_today_records
                get_today_records(area_obj, parsed_date)
                qs = qs.filter(area=area_obj)
            else:
                return qs.none()
        else:
            # Admin overview fetches daily records without area filter.
            # Ensure all active areas have today's records generated so counts
            # are real (not zeros caused by missing pre-generated rows).
            if parsed_date == timezone.localdate():
                from .htmx_views import get_today_records
                for area_obj in HKArea.objects.filter(is_active=True):
                    get_today_records(area_obj, parsed_date)

        return qs.filter(date=parsed_date)


class HKScheduleTemplateListCreateView(ListCreateAPIView):
    serializer_class = HKScheduleTemplateSerializer
    permission_classes = [IsAdminOrHousekeepingManager]

    def get_queryset(self):
        qs = HKScheduleTemplate.objects.select_related('area')
        area = self.request.query_params.get('area')
        active = (self.request.query_params.get('is_active') or self.request.query_params.get('active') or '').strip().lower()
        if area:
            qs = qs.filter(area_id=area)
        if active in {'true', '1', 'yes', 'on'}:
            qs = qs.filter(is_active=True)
        elif active in {'false', '0', 'no', 'off'}:
            qs = qs.filter(is_active=False)
        return qs.order_by('area__name', 'worker_tag', 'order', 'start_time')


class HKScheduleTemplateDetailView(RetrieveUpdateDestroyAPIView):
    serializer_class = HKScheduleTemplateSerializer
    permission_classes = [IsAdminOrHousekeepingManager]
    queryset = HKScheduleTemplate.objects.select_related('area')


class HKAttendanceSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date = request.query_params.get('date', str(timezone.localdate()))
        areas = list(HKArea.objects.filter(is_active=True))
        area_ids = [a.id for a in areas]

        worker_totals = dict(
            HKWorker.objects
            .filter(area_id__in=area_ids, is_active=True, is_reliever=False)
            .values('area_id')
            .annotate(n=Count('id'))
            .values_list('area_id', 'n')
        )

        first_half_map: dict = {}
        for row in (
            HKAttendanceRecord.objects
            .filter(
                worker__area_id__in=area_ids,
                date=date,
                half='first',
                status__in=['present', 'late'],
            )
            .values_list('worker__area_id', 'worker_id')
        ):
            first_half_map.setdefault(row[0], set()).add(row[1])

        second_half_map: dict = {}
        for row in (
            HKAttendanceRecord.objects
            .filter(
                worker__area_id__in=area_ids,
                date=date,
                half='second',
                status__in=['present', 'late'],
            )
            .values_list('worker__area_id', 'worker_id')
        ):
            second_half_map.setdefault(row[0], set()).add(row[1])

        summary = []
        for area in areas:
            total = worker_totals.get(area.id, 0)
            first = first_half_map.get(area.id, set())
            second = second_half_map.get(area.id, set())
            # Present for admin dashboard should reflect any marked presence
            # (first OR second half), so counts move immediately after marking.
            present_any = len(first | second)
            full_day = len(first & second)
            partial = len(first ^ second)
            summary.append({
                'area_id': area.id,
                'area_name': area.name,
                'total_workers': total,
                'present': present_any,
                'partial': partial,
                'absent': max(total - present_any, 0),
                'full_day_present': full_day,
            })

        return Response(summary)


class HKStaffAttendanceListView(ListAPIView):
    serializer_class = HKStaffAttendanceRecordSerializer
    permission_classes = [IsAdminOrHousekeepingManager]

    def get_queryset(self):
        date_str = self.request.query_params.get('date', str(timezone.localdate()))
        parsed_date = _parse_iso_date(date_str) or timezone.localdate()
        User = get_user_model()
        staff_qs = User.objects.filter(is_active=True, role__in=['supervisor', 'caretaker'])
        existing_ids = set(
            HKStaffAttendanceRecord.objects.filter(
                date=parsed_date,
                staff__in=staff_qs,
            ).values_list('staff_id', flat=True)
        )
        missing = [s for s in staff_qs if s.id not in existing_ids]
        if missing:
            HKStaffAttendanceRecord.objects.bulk_create(
                [
                    HKStaffAttendanceRecord(
                        staff=staff,
                        date=parsed_date,
                        status='absent',
                        source='manual',
                    )
                    for staff in missing
                ],
                ignore_conflicts=True,
            )
        return (
            HKStaffAttendanceRecord.objects
            .select_related('staff', 'leave_request')
            .prefetch_related('staff__hk_areas__area')
            .filter(date=parsed_date)
            .order_by('staff__first_name', 'staff__username', 'id')
        )


class HKStockRequestListView(ListAPIView):
    serializer_class = HKStockRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = HKStockRequest.objects.select_related('requested_by', 'area', 'item').order_by('-created_at')
        if user.role not in ['admin', 'housekeeping_manager']:
            qs = qs.filter(requested_by=user)
        return qs[:50]


class HKStockRequestStatusUpdateView(RetrieveUpdateAPIView):
    """permission applied in get_permissions(), not update()."""
    queryset = HKStockRequest.objects.all()
    serializer_class = HKStockRequestStatusSerializer

    def get_permissions(self):
        return [IsAdminOrHousekeepingManager()]


class HKAlertListView(ListAPIView):
    serializer_class = HKAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKAlert.objects.filter(is_active=True).order_by('-created_at')[:20]


class HKAssignAreaTaskView(APIView):
    """
    Admin/manager assigns a one-time area-level task for today.
    The task is created under worker_tag='all' and appears in mobile "Special" tab.
    """
    permission_classes = [IsAdminOrHousekeepingManager]

    def post(self, request):
        area_id = request.data.get('area_id')
        task_name = (request.data.get('task_name') or '').strip()
        note = (request.data.get('note') or '').strip()
        task_mode = str(request.data.get('task_mode') or 'temporary').strip().lower()

        if not area_id:
            return Response({'detail': 'area_id is required.'}, status=400)
        if not task_name:
            return Response({'detail': 'task_name is required.'}, status=400)
        if task_mode not in {'temporary', 'permanent'}:
            return Response({'detail': 'task_mode must be temporary or permanent.'}, status=400)

        area = HKArea.objects.filter(pk=area_id, is_active=True).first()
        if not area:
            return Response({'detail': 'Area not found.'}, status=404)

        try:
            period_minutes = int(request.data.get('period_minutes') or 60)
        except (TypeError, ValueError):
            period_minutes = 60
        period_minutes = max(30, min(period_minutes, 240))

        requires_photo_raw = str(request.data.get('requires_photo', '')).strip().lower()
        requires_photo = requires_photo_raw in {'1', 'true', 'yes', 'on'}
        add_to_daily_raw = str(request.data.get('add_to_daily', '')).strip().lower()
        add_to_daily = add_to_daily_raw in {'1', 'true', 'yes', 'on'}

        now = timezone.localtime()
        start_dt = now.replace(second=0, microsecond=0)
        end_dt = start_dt + timedelta(minutes=period_minutes)

        assigned_by_name = request.user.get_full_name() or request.user.username
        desc = f"Admin assigned by {assigned_by_name} | mode={task_mode}"
        if note:
            desc = f"{desc} | {note}"
        if task_mode == 'permanent' and not add_to_daily:
            desc = f"{desc} | pending_daily_promotion=1"

        next_order = (
            HKScheduleTemplate.objects
            .filter(area=area)
            .aggregate(m=Max('order'))
            .get('m') or 0
        ) + 1

        is_active = bool(task_mode == 'permanent' and add_to_daily)

        schedule = HKScheduleTemplate.objects.create(
            area=area,
            order=next_order,
            start_time=start_dt.time(),
            end_time=end_dt.time(),
            task_name=task_name,
            task_description=desc,
            worker_tag='all',
            requires_photo=requires_photo,
            frequency='daily',
            is_active=is_active,
        )

        record = HKDailyRecord.objects.create(
            schedule=schedule,
            originating_template=schedule,
            area=area,
            date=timezone.localdate(),
            status='pending',
            assigned_by=request.user,
            assigned_at=timezone.now(),
            note=note,
        )

        return Response(
            {
                'record': HKDailyRecordSerializer(record).data,
                'task_mode': task_mode,
                'added_to_daily': is_active,
                'can_promote_to_daily': bool(task_mode == 'permanent' and not is_active),
            },
            status=201,
        )


class HKPromoteTaskToDailyView(APIView):
    """
    Promote an existing special task record into the daily schedule.
    This makes the same task appear automatically every day going forward.
    """
    permission_classes = [IsAdminOrHousekeepingManager]

    def post(self, request):
        record_id = request.data.get('record_id')
        if not record_id:
            return Response({'detail': 'record_id is required.'}, status=400)

        record = HKDailyRecord.objects.select_related('schedule', 'area').filter(pk=record_id).first()
        if not record:
            return Response({'detail': 'Task record not found.'}, status=404)

        schedule = record.schedule
        if schedule.worker_tag != 'all':
            return Response({'detail': 'Only special tasks can be promoted to daily schedule.'}, status=400)

        schedule.is_active = True
        schedule.frequency = 'daily'
        schedule.save(update_fields=['is_active', 'frequency'])

        return Response(
            {
                'record': HKDailyRecordSerializer(record).data,
                'promoted': True,
            },
            status=200,
        )


class HKDashboardSummaryView(APIView):
    """single aggregate counts done/pending/skipped separately."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()

        counts = (
            HKDailyRecord.objects
            .filter(date=today)
            .aggregate(
                total=Count('id'),
                done=Count('id', filter=Q(status='done')),
                pending=Count('id', filter=Q(status='pending')),
                ongoing=Count('id', filter=Q(status='in_progress')),
                skipped=Count('id', filter=Q(status='skipped')),
            )
        )
        total_records = counts['total']
        done = counts['done']
        pending = counts['pending']
        ongoing = counts['ongoing']
        skipped = counts['skipped']

        total_workers = HKWorker.objects.filter(is_active=True, is_reliever=False).count()
        first_half_workers = set(
            HKAttendanceRecord.objects.filter(
                date=today,
                half='first',
                status__in=['present', 'late'],
            ).values_list('worker_id', flat=True)
        )
        second_half_workers = set(
            HKAttendanceRecord.objects.filter(
                date=today,
                half='second',
                status__in=['present', 'late'],
            ).values_list('worker_id', flat=True)
        )
        present_today = len(first_half_workers | second_half_workers)
        full_day_present = len(first_half_workers & second_half_workers)
        pending_stock = HKStockRequest.objects.filter(status='pending').count()

        return Response({
            'total_tasks': total_records,
            'done_tasks': done,
            'pending_tasks': pending,
            'ongoing_tasks': ongoing,
            'skipped_tasks': skipped,
            'completion_pct': int((done / total_records * 100) if total_records else 0),
            'total_workers': total_workers,
            'present_today': present_today,
            'full_day_present': full_day_present,
            'pending_stock_requests': pending_stock,
            'total_areas': HKArea.objects.filter(is_active=True).count(),
        })


def _gallery_base_queryset():
    return (
        HKDailyRecord.objects
        .select_related('schedule', 'area', 'completed_by', 'assigned_worker', 'photo_after_flagged_by')
        .filter(photo_after__isnull=False)
        .exclude(photo_after='')
        .annotate(capture_ts=Coalesce('photo_after_captured_at', 'completed_at'))
    )


def _parse_int(value, default=0, min_value=None, max_value=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return timezone.datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _apply_gallery_filters(request, qs):
    area = (request.query_params.get('area') or request.query_params.get('areaId') or '').strip()
    task_id = (request.query_params.get('taskId') or '').strip()
    staff_id = (request.query_params.get('staffId') or '').strip()
    search = (request.query_params.get('search') or '').strip()
    date_from = _parse_iso_date(request.query_params.get('dateFrom'))
    date_to = _parse_iso_date(request.query_params.get('dateTo'))

    if area:
        if area.isdigit():
            qs = qs.filter(area_id=int(area))
        else:
            qs = qs.filter(area__name__icontains=area)

    if task_id:
        try:
            qs = qs.filter(schedule_id=int(task_id))
        except (TypeError, ValueError):
            pass

    if staff_id:
        try:
            qs = qs.filter(completed_by_id=int(staff_id))
        except (TypeError, ValueError):
            pass

    if date_from:
        qs = qs.filter(capture_ts__date__gte=date_from)
    if date_to:
        qs = qs.filter(capture_ts__date__lte=date_to)

    if search:
        qs = qs.filter(
            Q(area__name__icontains=search)
            | Q(schedule__task_name__icontains=search)
            | Q(completed_by__first_name__icontains=search)
            | Q(completed_by__last_name__icontains=search)
            | Q(completed_by__username__icontains=search)
            | Q(assigned_worker__name__icontains=search)
        )

    return qs


def _public_gallery_host(request):
    forwarded = (request.META.get("HTTP_X_FORWARDED_HOST") or "").split(",")[0].strip()
    host = forwarded or request.get_host() or "localhost:8000"
    hostname = host.split(":")[0].lower()
    if hostname in {"backend", "web", "app", "django", "server"}:
        return "localhost:8000"
    return host


def _public_media_url(request, raw_url):
    if not raw_url:
        return ""
    try:
        absolute = request.build_absolute_uri(raw_url)
    except Exception:
        absolute = raw_url

    try:
        parsed = urlparse(absolute)
        hostname = (parsed.hostname or "").lower()
        if hostname in {"backend", "web", "app", "django", "server"}:
            parsed = parsed._replace(netloc=_public_gallery_host(request))
            return urlunparse(parsed)
    except Exception:
        return absolute
    return absolute


def _file_field_url(request, file_field):
    if not file_field:
        return ""
    try:
        return _public_media_url(request, file_field.url)
    except Exception:
        return ""


def _serialize_gallery_photo(request, record):
    before_url = _file_field_url(request, record.photo_before)
    photo_url = _file_field_url(request, record.photo_after)
    thumbnail_url = _file_field_url(request, record.photo_after_thumbnail) or photo_url
    staff_name = ''
    staff_id = None
    if record.completed_by:
        staff_name = record.completed_by.get_full_name() or record.completed_by.username
        staff_id = record.completed_by_id
    elif record.assigned_worker:
        staff_name = record.assigned_worker.name
    else:
        staff_name = 'Unknown'

    capture_ts = record.photo_after_captured_at or record.completed_at
    return {
        'id': record.id,
        'beforeUrl': before_url,
        'beforeThumbnailUrl': before_url,
        'url': photo_url,
        'thumbnailUrl': thumbnail_url,
        'taskId': record.schedule_id,
        'taskName': record.schedule.task_name if record.schedule else '',
        'areaId': record.area_id,
        'areaName': record.area.name if record.area else '',
        'staffId': staff_id,
        'staffName': staff_name,
        'capturedAt': capture_ts,
        'captureMethod': record.photo_after_capture_method or 'file_upload',
        'fileSize': int(record.photo_after_saved_size or (record.photo_after.size if record.photo_after else 0)),
        'originalSize': int(record.photo_after_original_size or 0),
        'savedSize': int(record.photo_after_saved_size or 0),
        'thumbSize': int(record.photo_after_thumb_size or 0),
        'compressionRatio': int(record.photo_after_compression_ratio or 0),
        'format': record.photo_after_format or "jpeg",
        'flagged': bool(record.photo_after_flagged),
        'flagNote': record.photo_after_flag_note or '',
    }


class HKAdminGalleryView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request):
        page = _parse_int(request.query_params.get('page'), default=1, min_value=1)
        limit = _parse_int(request.query_params.get('limit'), default=50, min_value=1, max_value=200)
        sort = (request.query_params.get('sort') or 'newest').strip().lower()

        qs = _apply_gallery_filters(request, _gallery_base_queryset())

        if sort in {'oldest', 'oldest_first'}:
            qs = qs.order_by('capture_ts', 'id')
        elif sort in {'area_a-z', 'area_az'}:
            qs = qs.order_by('area__name', '-capture_ts', '-id')
        elif sort in {'most_photos', 'task_most'}:
            qs = qs.annotate(task_photo_count=Count('schedule_id')).order_by('-task_photo_count', '-capture_ts', '-id')
        else:
            qs = qs.order_by('-capture_ts', '-id')

        total = qs.count()
        start = (page - 1) * limit
        end = start + limit
        records = list(qs[start:end])

        photos = [_serialize_gallery_photo(request, rec) for rec in records]
        return Response(
            {
                'photos': photos,
                'total': total,
                'page': page,
                'limit': limit,
                'hasMore': end < total,
            }
        )


class HKAdminGalleryGroupedByAreaView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request):
        params_key = '&'.join(
            [f'{k}={v}' for k, v in sorted(request.query_params.items()) if v not in [None, '']]
        )
        cache_key = f'hk_gallery_grouped_v3::{params_key or "all"}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = _apply_gallery_filters(request, _gallery_base_queryset()).order_by('area__name', 'schedule__task_name', '-capture_ts', '-id')
        grouped = {}
        for rec in qs:
            area = rec.area
            schedule = rec.schedule
            if not area or not schedule:
                continue

            area_bucket = grouped.setdefault(
                area.id,
                {
                    'areaId': area.id,
                    'areaName': area.name,
                    'areaIcon': '🏢',
                    'totalPhotos': 0,
                    'tasks_map': {},
                },
            )
            area_bucket['totalPhotos'] += 1

            task_bucket = area_bucket['tasks_map'].setdefault(
                schedule.id,
                {
                    'taskId': schedule.id,
                    'taskName': schedule.task_name,
                    'photoCount': 0,
                    'recentPhotos': [],
                },
            )
            task_bucket['photoCount'] += 1
            if len(task_bucket['recentPhotos']) < 4:
                task_bucket['recentPhotos'].append(_serialize_gallery_photo(request, rec))

        payload = []
        for area_id in sorted(grouped.keys(), key=lambda aid: grouped[aid]['areaName'].lower()):
            area_bucket = grouped[area_id]
            tasks = list(area_bucket['tasks_map'].values())
            tasks.sort(key=lambda t: (-t['photoCount'], (t['taskName'] or '').lower()))
            payload.append(
                {
                    'areaId': area_bucket['areaId'],
                    'areaName': area_bucket['areaName'],
                    'areaIcon': area_bucket['areaIcon'],
                    'totalPhotos': area_bucket['totalPhotos'],
                    'tasks': tasks,
                }
            )

        cache.set(cache_key, payload, timeout=60)
        return Response(payload)


class HKAdminGalleryStatsView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request):
        qs = _apply_gallery_filters(request, _gallery_base_queryset())
        total = qs.count()

        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        this_week = qs.filter(capture_ts__date__gte=week_start, capture_ts__date__lte=today).count()

        areas_with_photos = qs.values('area_id').distinct().count()
        total_areas = HKArea.objects.filter(is_active=True).count()
        tasks_with_photos = qs.values('schedule_id').distinct().count()
        avg_photos_per_task = round((total / tasks_with_photos), 2) if tasks_with_photos else 0
        size_agg = qs.aggregate(
            original_total=Coalesce(Sum('photo_after_original_size'), 0),
            saved_total=Coalesce(Sum('photo_after_saved_size'), 0),
            thumb_total=Coalesce(Sum('photo_after_thumb_size'), 0),
        )
        original_total = int(size_agg.get('original_total') or 0)
        saved_total = int(size_agg.get('saved_total') or 0)
        thumb_total = int(size_agg.get('thumb_total') or 0)
        storage_used_total = saved_total + thumb_total
        if original_total <= 0:
            # fallback for legacy rows where metadata is absent.
            original_total = storage_used_total
        storage_saved = max(0, original_total - storage_used_total)
        storage_saved_pct = int(round((storage_saved / float(original_total)) * 100)) if original_total > 0 else 0

        return Response(
            {
                'totalPhotos': total,
                'thisWeekPhotos': this_week,
                'areasWithPhotos': areas_with_photos,
                'totalAreas': total_areas,
                'avgPhotosPerTask': avg_photos_per_task,
                'storageOriginalBytes': original_total,
                'storageUsedBytes': storage_used_total,
                'storageSavedBytes': storage_saved,
                'storageSavedPercent': storage_saved_pct,
            }
        )


class HKAdminGalleryTaskPhotosView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request, task_id):
        qs = _apply_gallery_filters(
            request,
            _gallery_base_queryset().filter(schedule_id=task_id).order_by('-capture_ts', '-id'),
        )
        photos = [_serialize_gallery_photo(request, rec) for rec in qs]
        return Response({'taskId': task_id, 'photos': photos})


class HKAdminGalleryPhotoDeleteView(APIView):
    permission_classes = [IsAdminOnly]

    def delete(self, request, photo_id):
        record = get_object_or_404(HKDailyRecord, pk=photo_id)
        if not record.photo_after:
            return Response({'detail': 'Photo not found.'}, status=404)

        old_name = record.photo_after.name
        old_storage = record.photo_after.storage
        thumb_name = record.photo_after_thumbnail.name if record.photo_after_thumbnail else ''
        thumb_storage = record.photo_after_thumbnail.storage if record.photo_after_thumbnail else old_storage

        record.photo_after = None
        record.photo_after_thumbnail = None
        record.photo_after_captured_at = None
        record.photo_after_capture_method = ''
        record.photo_after_original_size = 0
        record.photo_after_saved_size = 0
        record.photo_after_thumb_size = 0
        record.photo_after_compression_ratio = 0
        record.photo_after_format = ''
        record.photo_after_flagged = False
        record.photo_after_flag_note = ''
        record.photo_after_flagged_at = None
        record.photo_after_flagged_by = None
        record.save(
            update_fields=[
                'photo_after',
                'photo_after_thumbnail',
                'photo_after_captured_at',
                'photo_after_capture_method',
                'photo_after_original_size',
                'photo_after_saved_size',
                'photo_after_thumb_size',
                'photo_after_compression_ratio',
                'photo_after_format',
                'photo_after_flagged',
                'photo_after_flag_note',
                'photo_after_flagged_at',
                'photo_after_flagged_by',
            ]
        )

        try:
            if old_name:
                old_storage.delete(old_name)
        except Exception:
            pass
        try:
            if thumb_name:
                thumb_storage.delete(thumb_name)
        except Exception:
            pass

        return Response({'success': True})


class HKAdminGalleryPhotoFlagView(APIView):
    permission_classes = [IsAdminOnly]

    def post(self, request, photo_id):
        record = get_object_or_404(HKDailyRecord, pk=photo_id)
        if not record.photo_after:
            return Response({'detail': 'Photo not found.'}, status=404)

        raw_flagged = str(request.data.get('flagged', 'true')).strip().lower()
        flagged = raw_flagged in {'1', 'true', 'yes', 'on'}
        note = (request.data.get('note') or '').strip()

        if flagged:
            record.photo_after_flagged = True
            record.photo_after_flag_note = note
            record.photo_after_flagged_at = timezone.now()
            record.photo_after_flagged_by = request.user
        else:
            record.photo_after_flagged = False
            record.photo_after_flag_note = ''
            record.photo_after_flagged_at = None
            record.photo_after_flagged_by = None

        record.save(
            update_fields=[
                'photo_after_flagged',
                'photo_after_flag_note',
                'photo_after_flagged_at',
                'photo_after_flagged_by',
            ]
        )

        return Response({'success': True, 'flagged': record.photo_after_flagged})


class HKAdminGalleryExportCSVView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request):
        qs = _apply_gallery_filters(request, _gallery_base_queryset()).order_by('-capture_ts', '-id')

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                'area',
                'task',
                'staff',
                'captured_at',
                'capture_method',
                'photo_url',
                'thumbnail_url',
                'original_size',
                'saved_size',
                'thumbnail_size',
                'compression_ratio',
                'format',
            ]
        )
        for rec in qs:
            photo_url = _file_field_url(request, rec.photo_after)
            thumbnail_url = _file_field_url(request, rec.photo_after_thumbnail)
            staff_name = ''
            if rec.completed_by:
                staff_name = rec.completed_by.get_full_name() or rec.completed_by.username
            elif rec.assigned_worker:
                staff_name = rec.assigned_worker.name
            writer.writerow(
                [
                    rec.area.name if rec.area else '',
                    rec.schedule.task_name if rec.schedule else '',
                    staff_name,
                    (rec.photo_after_captured_at or rec.completed_at or '').isoformat() if (rec.photo_after_captured_at or rec.completed_at) else '',
                    rec.photo_after_capture_method or 'file_upload',
                    photo_url,
                    thumbnail_url,
                    int(rec.photo_after_original_size or 0),
                    int(rec.photo_after_saved_size or (rec.photo_after.size if rec.photo_after else 0)),
                    int(rec.photo_after_thumb_size or 0),
                    int(rec.photo_after_compression_ratio or 0),
                    rec.photo_after_format or 'jpeg',
                ]
            )

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="housekeeping_gallery_export.csv"'
        return response


class HKAdminGalleryTaskZipView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request, task_id):
        records = list(
            _gallery_base_queryset()
            .filter(schedule_id=task_id)
            .order_by('-capture_ts', '-id')
        )
        if not records:
            return Response({'detail': 'No photos available for this task.'}, status=404)

        mem_file = io.BytesIO()
        with zipfile.ZipFile(mem_file, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            for rec in records:
                if not rec.photo_after:
                    continue
                stamp = timezone.localtime(rec.photo_after_captured_at or rec.completed_at or timezone.now()).strftime('%Y%m%d_%H%M%S')
                area_slug = slugify(rec.area.name if rec.area else 'area') or 'area'
                ext = (rec.photo_after_format or '').strip().lower() or 'jpg'
                filename = f'{area_slug}_{stamp}_{rec.id}.{ext}'
                try:
                    rec.photo_after.open('rb')
                    zf.writestr(filename, rec.photo_after.read())
                finally:
                    try:
                        rec.photo_after.close()
                    except Exception:
                        pass

        mem_file.seek(0)
        response = HttpResponse(mem_file.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="task_{task_id}_photos.zip"'
        return response

