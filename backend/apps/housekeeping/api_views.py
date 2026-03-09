from datetime import timedelta
import re

from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import FileResponse, HttpResponse
from django.core.files.base import ContentFile
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from apps.reports.exporters import export_worker_report_csv, export_workers_combined_csv
from apps.reports.generators import generate_worker_report
from apps.reports.models import WorkerMonthlyReport

from .models import (
    HKAlert,
    HKArea,
    HKAttendanceRecord,
    HKDailyRecord,
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
    HKStockRequestSerializer,
    HKStockRequestStatusSerializer,
    HKWorkerSerializer,
    HKWorkerSelectionRequestSerializer,
)


class IsAdminOrHousekeepingManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and (
            user.is_admin or user.is_housekeeping_manager
        )


class IsAdminOnly(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user.is_authenticated and user.is_admin)


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


class HKAreaListView(ListAPIView):
    serializer_class = HKAreaSerializer
    permission_classes = [IsAuthenticated]

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
        cached_report = WorkerMonthlyReport.objects.filter(
            worker=worker,
            month=month,
            year=year,
        ).first()

        if _is_past_month(month, year) and cached_report and cached_report.csv_file:
            file_handle = cached_report.csv_file.open('rb')
            return FileResponse(
                file_handle,
                content_type='text/csv',
                as_attachment=True,
                filename=filename,
            )

        if _is_past_month(month, year) and cached_report and not cached_report.csv_file:
            snapshot = cached_report.snapshot or generate_worker_report(worker.id, month, year)
            csv_bytes = export_worker_report_csv(snapshot)
            cached_report.csv_file.save(filename, ContentFile(csv_bytes), save=True)

            file_handle = cached_report.csv_file.open('rb')
            return FileResponse(
                file_handle,
                content_type='text/csv',
                as_attachment=True,
                filename=filename,
            )

        snapshot = generate_worker_report(worker.id, month, year)
        csv_bytes = export_worker_report_csv(snapshot)

        response = HttpResponse(csv_bytes, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class HKWorkerReportRegenerateView(APIView):
    permission_classes = [IsAdminOrHousekeepingManager]

    def post(self, request, pk):
        worker = get_object_or_404(HKWorker, pk=pk)

        month, year, err = _parse_report_period(
            request.data.get('month'),
            request.data.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        today = timezone.localdate()
        if (year, month) >= (today.year, today.month):
            return Response(
                {'detail': 'Only completed past months can be regenerated/cached.'},
                status=400,
            )

        snapshot = generate_worker_report(worker.id, month, year)
        csv_bytes = export_worker_report_csv(snapshot)
        now = timezone.now()
        filename = _worker_report_filename(worker, month, year)

        report, created = WorkerMonthlyReport.objects.get_or_create(
            worker=worker,
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


class HKWorkersCombinedCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        month, year, err = _parse_report_period(
            request.query_params.get('month'),
            request.query_params.get('year'),
        )
        if err:
            return Response({'detail': err}, status=400)

        area_id_raw = request.query_params.get('area')
        group = (request.query_params.get('group') or '').strip().lower()
        if group and group not in {'hostels', 'academic', 'others'}:
            return Response({'detail': 'group must be hostels, academic, or others.'}, status=400)

        workers_qs = HKWorker.objects.select_related('area', 'supervisor').filter(is_active=True).order_by('area__name', 'name')

        area_obj = None
        if area_id_raw:
            try:
                area_id = int(area_id_raw)
            except (TypeError, ValueError):
                return Response({'detail': 'area must be a numeric id.'}, status=400)

            area_obj = HKArea.objects.filter(pk=area_id, is_active=True).first()
            if not area_obj:
                return Response({'detail': 'Area not found.'}, status=404)
            workers_qs = workers_qs.filter(area=area_obj)

        workers = list(workers_qs)
        if group:
            workers = [worker for worker in workers if _area_group(worker.area) == group]

        rows = []
        for worker in workers:
            snapshot = generate_worker_report(worker.id, month, year)
            attendance = snapshot.get('attendance', {})
            tasks = snapshot.get('tasks', {})
            rows.append({
                'worker_name': worker.name,
                'area_name': worker.area.name if worker.area else '',
                'supervisor_name': (
                    worker.supervisor.get_full_name() or worker.supervisor.username
                    if worker.supervisor else ''
                ),
                'worker_type': worker.worker_type,
                'shift': worker.shift,
                'punching_no': worker.punching_no,
                'phone': worker.phone,
                'is_reliever': worker.is_reliever,
                'attendance_pct': snapshot.get('attendance_pct', 0),
                'days_present': attendance.get('days_present', 0),
                'days_absent': attendance.get('days_absent', 0),
                'days_late': attendance.get('days_late', 0),
                'days_on_leave': attendance.get('days_on_leave', 0),
                'tasks_assigned': tasks.get('total_assigned', 0),
                'tasks_completed': tasks.get('total_completed', 0),
                'tasks_skipped': tasks.get('total_skipped', 0),
                'completion_pct': tasks.get('completion_pct', 0),
                'extra_work_count': snapshot.get('extra_work_count', 0),
                'reliever_days': len(snapshot.get('reliever_days', [])),
            })

        if area_obj:
            title = f"Area Worker Report - {area_obj.name}"
            filename_base = f"workers_area_{slugify(area_obj.name) or area_obj.id}"
        elif group:
            title = f"Worker Report - {group.title()}"
            filename_base = f"workers_{group}"
        else:
            title = "Worker Report - All Workers"
            filename_base = "workers_all"

        csv_bytes = export_workers_combined_csv(rows=rows, month=month, year=year, title=title)
        response = HttpResponse(csv_bytes, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename_base}_{month:02d}_{year}.csv"'
        return response


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
            ),
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


class HKInchargeNotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            HKInchargeNotification.objects
            .filter(user=request.user)
            .select_related('assignment')
            .order_by('-created_at')[:40]
        )
        serializer = HKInchargeNotificationSerializer(qs, many=True)
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

        return qs.filter(date=parsed_date)


class HKScheduleTemplateListView(ListAPIView):
    serializer_class = HKScheduleTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKScheduleTemplate.objects.select_related('area').filter(is_active=True)
        area = self.request.query_params.get('area')
        if area:
            qs = qs.filter(area_id=area)
        return qs


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


class HKStockRequestListView(ListAPIView):
    serializer_class = HKStockRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = HKStockRequest.objects.select_related('requested_by', 'area').order_by('-created_at')
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
