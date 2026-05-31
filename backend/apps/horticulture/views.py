import functools
import calendar
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import models, transaction
from django.db.models import Count, DecimalField, Prefetch, Sum, Value
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import generics, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.image_urls import image_debug_payload, image_field_url, log_image_event
from apps.users.permissions import IsSupervisor

from .models import (
    HorticultureAttendance,
    HorticultureAttendanceRecord,
    HorticultureArea,
    HorticultureAreaStock,
    HorticultureAreaTaskAssignment,
    HorticultureDailyAssignment,
    HorticultureInchargeAssignment,
    HorticultureInchargeNotification,
    HorticultureLeaveRequest,
    HorticultureStockRequest,
    HorticultureTaskWorkerAssignment,
    HorticultureWorker,
    HorticultureWorkerArea,
    HorticultureZone,
    SeasonSetting,
    TaskLog,
    TaskType,
    WorkerAttendance,
)
from .serializers import (
    AdminAttendanceSerializer,
    AdminAttendanceRecordSerializer,
    AdminAreaTaskAssignmentSerializer,
    AdminDailyAssignmentSerializer,
    AdminSummarySerializer,
    AdminSupervisorsSerializer,
    AdminTaskTypeSerializer,
    AdminWorkerReportSerializer,
    AdminWorkerSerializer,
    AdminZoneDetailSerializer,
    ManagerSeasonStatusSerializer,
    ManagerSeasonUpdateSerializer,
    ManagerWeeklySummarySerializer,
    SupervisorAttendanceCreateSerializer,
    SupervisorAttendanceSerializer,
    SupervisorDashboardSerializer,
    SupervisorTaskLogSerializer,
    SupervisorWorkerSerializer,
)
from .services import (
    build_zone_dashboard_payload,
    get_current_season,
    get_current_season_setting,
    get_horticulture_supervisors,
    get_horticulture_zones,
    get_selected_supervisor_zone,
    get_supervisor_zones,
    get_supervisor_worker_queryset,
    get_task_threshold,
    get_zone_choices_payload,
)

User = get_user_model()


def horticulture_task_done_rank(task, completed_task_ids):
    assignment = task.get('assignment') if isinstance(task, dict) else None
    is_done = (
        task.get('task_type_id') in completed_task_ids
        or getattr(assignment, 'status', None) == HorticultureDailyAssignment.Status.DONE
    )
    return 1 if is_done else 0


def stable_horticulture_area_nav_rows(area_rows):
    return sorted(
        area_rows or [],
        key=lambda area: (
            area.get('area_number') or 0,
            area.get('name') or '',
            area.get('id') or 0,
        ),
    )


def _flatten_errors(detail):
    if isinstance(detail, dict):
        parts = []
        for value in detail.values():
            text = _flatten_errors(value)
            if text:
                parts.append(text)
        return ' '.join(parts)
    if isinstance(detail, (list, tuple)):
        return ' '.join(filter(None, (_flatten_errors(item) for item in detail)))
    return str(detail)


def _mobile_zone_context(supervisor, zone_id=None):
    selected_zone, zones_qs = get_selected_supervisor_zone(supervisor, zone_id)
    zones = list(zones_qs)
    payload = build_zone_dashboard_payload(selected_zone)
    payload['zones'] = get_zone_choices_payload(zones)
    return selected_zone, zones, payload


def _selected_area_for_zone(zone, area_id=None):
    if zone is None:
        return None
    area_qs = zone.areas.order_by('area_number', 'id')
    if area_id:
        area = area_qs.filter(pk=area_id).first()
        if area:
            return area
    return area_qs.first()


def _workers_for_area(area):
    if area is None:
        return HorticultureWorker.objects.none()
    return (
        HorticultureWorker.objects
        .filter(is_active=True, area_assignments__area=area, area_assignments__is_active=True)
        .distinct()
        .order_by('name', 'pay_code')
    )


def _workers_for_zone(zone):
    if zone is None:
        return HorticultureWorker.objects.none()
    return (
        HorticultureWorker.objects
        .filter(is_active=True, area_assignments__area__zone=zone, area_assignments__is_active=True)
        .distinct()
        .order_by('name', 'pay_code')
    )


def _busy_horticulture_worker_ids(zone, date, exclude_assignment_id=None):
    if zone is None:
        return set()
    active_assignments = HorticultureDailyAssignment.objects.filter(
        area__zone=zone,
        date=date,
        status__in=[
            HorticultureDailyAssignment.Status.PENDING,
            HorticultureDailyAssignment.Status.IN_PROGRESS,
        ],
    )
    if exclude_assignment_id:
        active_assignments = active_assignments.exclude(pk=exclude_assignment_id)
    busy_ids = set(active_assignments.values_list('worker_id', flat=True))
    busy_ids.update(
        HorticultureTaskWorkerAssignment.objects
        .filter(daily_assignment__in=active_assignments)
        .values_list('worker_id', flat=True)
    )
    return busy_ids


def _mark_horticulture_busy_workers(workers, busy_ids):
    for worker in workers:
        worker.is_busy_for_task = worker.id in busy_ids
    return workers


def _horticulture_attendance_choices():
    return [
        ('present', 'Present', '#d1fae5', '#065f46'),
        ('absent', 'Absent', '#fee2e2', '#991b1b'),
        ('late', 'Late', '#fef3c7', '#92400e'),
        ('leave', 'Leave', '#dbeafe', '#1d4ed8'),
    ]


def _auto_create_horti_second_half_from_first(workers, date, marked_by):
    worker_ids = [worker.id for worker in workers]
    if not worker_ids:
        return 0
    first_present_ids = set(
        HorticultureAttendanceRecord.objects.filter(
            worker_id__in=worker_ids,
            date=date,
            half='first',
            status__in=['present', 'late'],
        ).values_list('worker_id', flat=True)
    )
    if not first_present_ids:
        return 0
    existing_second_ids = set(
        HorticultureAttendanceRecord.objects.filter(
            worker_id__in=first_present_ids,
            date=date,
            half='second',
        ).values_list('worker_id', flat=True)
    )
    now = timezone.now()
    records = [
        HorticultureAttendanceRecord(
            worker_id=worker_id,
            date=date,
            half='second',
            status='present',
            marked_by=marked_by,
            submitted_at=now,
        )
        for worker_id in sorted(first_present_ids - existing_second_ids)
    ]
    HorticultureAttendanceRecord.objects.bulk_create(records, ignore_conflicts=True)
    return len(records)


def _current_half():
    return 'first' if timezone.localtime().hour < 13 else 'second'


def _supervisor_areas(supervisor):
    return HorticultureArea.objects.filter(zone__supervisor=supervisor).select_related('zone').order_by('area_number')


def _attendance_for_date(supervisor, date):
    return (
        HorticultureAttendance.objects.filter(supervisor=supervisor, date=date)
        .prefetch_related('worker_attendances__worker')
        .first()
    )


def _query_string(**params):
    clean = {key: value for key, value in params.items() if value not in (None, '', [])}
    return urlencode(clean)


def _create_horti_incharge_notice(user, assignment, message, level='info'):
    if user:
        HorticultureInchargeNotification.objects.create(
            user=user,
            assignment=assignment,
            message=message,
            level=level,
        )


def _horticulture_incharge_candidates(leave_req, exclude_user_id=None):
    supervisor_qs = (
        User.objects
        .filter(
            is_active=True,
            role=User.Role.SUPERVISOR,
            horticulture_supervised_zones__isnull=False,
        )
        .exclude(pk=exclude_user_id)
        .distinct()
        .order_by('first_name', 'last_name', 'username')
    )
    manager_qs = (
        User.objects
        .filter(is_active=True, role=User.Role.HORTICULTURE_MANAGER)
        .exclude(pk=exclude_user_id)
        .order_by('first_name', 'last_name', 'username')
    )
    rows = []
    for user in supervisor_qs:
        zones = list(get_supervisor_zones(user))
        rows.append({'user': user, 'zones': zones})
    for user in manager_qs:
        rows.append({'user': user, 'zones': list(get_horticulture_zones())})
    return rows


def _assign_horti_incharge_for_leave(leave_req, assigned_staff, acted_by_user, note=''):
    leave_staff_name = leave_req.staff.get_full_name() or leave_req.staff.username
    assigned_staff_name = assigned_staff.get_full_name() or assigned_staff.username
    assignment, _ = HorticultureInchargeAssignment.objects.update_or_create(
        leave_request=leave_req,
        defaults={
            'zone': leave_req.zone,
            'leave_staff': leave_req.staff,
            'leave_staff_name': leave_staff_name,
            'leave_date': leave_req.leave_date,
            'assigned_staff': assigned_staff,
            'assigned_staff_name': assigned_staff_name,
            'status': HorticultureInchargeAssignment.Status.PENDING_ACCEPTANCE,
            'staff_action_at': None,
            'staff_action_note': '',
            'admin_action_by': None,
            'admin_action_at': None,
            'admin_action_note': '',
            'arrival_notified': False,
        },
    )
    leave_req.status = HorticultureLeaveRequest.Status.PENDING_ACCEPTANCE
    leave_req.save(update_fields=['status', 'updated_at'])
    message = (
        f'You have been assigned as Temporary Incharge for {leave_req.zone.name} '
        f'on {leave_req.leave_date} by {leave_staff_name}.'
    )
    if note:
        message = f'{message} Note: {note}'
    _create_horti_incharge_notice(assigned_staff, assignment, message)
    _create_horti_incharge_notice(
        leave_req.staff,
        assignment,
        f'Incharge request sent to {assigned_staff_name} for {leave_req.zone.name} on {leave_req.leave_date}. Awaiting confirmation.',
    )
    return assignment


class IsAdminOrHorticultureManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (user.is_admin or user.is_horticulture_manager)
        )


class IsHorticultureManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_horticulture_manager
        )


def _display_name(user):
    if not user:
        return ''
    if hasattr(user, 'name'):
        return user.name
    return user.get_full_name() or user.username


def _zone_order_key(zone_like):
    if isinstance(zone_like, str):
        name = zone_like
    elif hasattr(zone_like, 'name'):
        name = zone_like.name
    else:
        name = zone_like.get('zone_name', '')
    priority = {
        'Zone Red': 0,
        'Zone Blue': 1,
        'Zone Black': 2,
    }
    return (priority.get(name, 99), name)


def _attendance_counts(entries):
    counts = {
        'present': 0,
        'absent': 0,
        'half_day': 0,
    }
    for entry in entries:
        if entry.status == WorkerAttendance.Status.PRESENT:
            counts['present'] += 1
        elif entry.status == WorkerAttendance.Status.ABSENT:
            counts['absent'] += 1
        elif entry.status == WorkerAttendance.Status.HALF_DAY:
            counts['half_day'] += 1
    return counts


def _team_workers_by_supervisor(supervisors):
    team_map = {}
    for supervisor in supervisors:
        team_map[supervisor.id] = list(
            HorticultureWorker.objects.filter(
                is_active=True,
                area_assignments__area__zone__supervisor=supervisor,
                area_assignments__is_active=True,
            )
            .distinct()
            .order_by('name', 'pay_code')
        )
    return team_map


def _worker_rows(supervisors=None, zones=None):
    return (
        HorticultureWorker.objects
        .prefetch_related(
            Prefetch(
                'area_assignments',
                queryset=(
                    HorticultureWorkerArea.objects
                    .filter(is_active=True)
                    .select_related('area__zone__supervisor')
                    .order_by('area__area_number')
                ),
            )
        )
        .order_by('name', 'id')
    )


def _zone_names_by_supervisor(zones):
    zone_map = {}
    for zone in zones:
        if zone.supervisor_id is None:
            continue
        zone_map.setdefault(zone.supervisor_id, []).append(zone.name)
    for names in zone_map.values():
        names.sort(key=_zone_order_key)
    return zone_map


def _attendance_payload_for_supervisor(supervisor, attendance, team_workers):
    if attendance is not None:
        entries = list(attendance.worker_attendances.all())
        counts = _attendance_counts(entries)
        workers = [
            {
                'worker_id': entry.worker_id,
                'worker_name': _display_name(entry.worker),
                'pay_code': entry.worker.pay_code or '',
                'status': entry.status,
            }
            for entry in entries
        ]
        return {
            'submitted': True,
            'submitted_at': attendance.submitted_at,
            'present_count': counts['present'],
            'absent_count': counts['absent'],
            'half_day_count': counts['half_day'],
            'total_workers': len(team_workers),
            'workers': workers,
        }

    return {
        'submitted': False,
        'submitted_at': None,
        'present_count': 0,
        'absent_count': 0,
        'half_day_count': 0,
        'total_workers': len(team_workers),
        'workers': [
            {
                'worker_id': worker.id,
                'worker_name': _display_name(worker),
                'pay_code': worker.pay_code or '',
                'status': 'pending',
            }
            for worker in team_workers
        ],
    }


def _zone_status_payload(zone, dashboard_payload, today_attendance_map, team_workers):
    task_rows = [task for area in dashboard_payload['areas'] for task in area['tasks']]
    total_tasks = len(task_rows)
    overdue_count = sum(1 for task in task_rows if task['is_overdue'])
    on_track_pct = int(round(((total_tasks - overdue_count) / total_tasks) * 100)) if total_tasks else 100

    attendance = today_attendance_map.get(zone.supervisor_id) if zone.supervisor_id else None
    attendance_payload = _attendance_payload_for_supervisor(
        zone.supervisor,
        attendance,
        team_workers,
    )

    return {
        'zone_id': zone.id,
        'zone_name': zone.name,
        'zone_color': zone.color_code,
        'supervisor_id': zone.supervisor_id,
        'supervisor_name': _display_name(zone.supervisor),
        'tasks_on_track_pct': on_track_pct,
        'attendance_submitted_today': attendance_payload['submitted'],
        'attendance_status': 'submitted' if attendance_payload['submitted'] else 'not_submitted',
        'present_count': attendance_payload['present_count'],
        'absent_count': attendance_payload['absent_count'],
        'half_day_count': attendance_payload['half_day_count'],
        'total_workers': attendance_payload['total_workers'],
    }


def _season_setting_payload(season_setting=None):
    season_setting = season_setting or get_current_season_setting()
    if season_setting is None:
        return {
            'season': get_current_season(),
            'updated_by_name': '',
            'updated_at': None,
        }
    return {
        'season': season_setting.season,
        'updated_by_name': _display_name(season_setting.updated_by),
        'updated_at': season_setting.updated_at,
    }


def _days_overdue(task_row):
    if task_row['days_since_done'] is None:
        return task_row['threshold']
    return max(1, task_row['days_since_done'] - task_row['threshold'])


def _is_critical_task(task_row):
    return task_row['is_overdue'] and (
        task_row['days_since_done'] is None
        or task_row['days_since_done'] > (task_row['threshold'] * 2)
    )


class AdminHorticultureSummaryAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        today = timezone.localdate()
        zones = list(get_horticulture_zones())
        supervisors = list(get_horticulture_supervisors())
        team_map = _team_workers_by_supervisor(supervisors)

        attendance_map = {
            attendance.supervisor_id: attendance
            for attendance in HorticultureAttendance.objects.filter(
                date=today,
                supervisor_id__in=[supervisor.id for supervisor in supervisors],
            ).prefetch_related('worker_attendances__worker')
        }

        zone_status = []
        overdue_tasks = []
        tasks_due_today = 0
        tasks_overdue = 0
        task_status_counts = {
            'on_track': 0,
            'due_soon': 0,
            'overdue': 0,
            'total': 0,
        }

        for zone in zones:
            dashboard_payload = build_zone_dashboard_payload(zone, today=today)
            zone_status.append(
                _zone_status_payload(
                    zone,
                    dashboard_payload,
                    attendance_map,
                    team_map.get(zone.supervisor_id, []),
                )
            )

            for area in dashboard_payload['areas']:
                for task in area['tasks']:
                    task_status_counts['total'] += 1
                    if task['urgency'] == 'ok':
                        task_status_counts['on_track'] += 1
                    elif task['urgency'] == 'due_soon':
                        task_status_counts['due_soon'] += 1
                    else:
                        task_status_counts['overdue'] += 1

                    if task['days_since_done'] is not None and task['days_since_done'] == task['threshold']:
                        tasks_due_today += 1

                    if not task['is_overdue']:
                        continue

                    tasks_overdue += 1
                    days_since_done = task['days_since_done']
                    days_overdue = (
                        max(1, days_since_done - task['threshold'])
                        if days_since_done is not None
                        else task['threshold']
                    )
                    overdue_tasks.append(
                        {
                            'area_id': area['id'],
                            'area_name': area['name'],
                            'zone_id': zone.id,
                            'zone_name': zone.name,
                            'task_type_id': task['task_type_id'],
                            'task_type_name': task['task_type_name'],
                            'last_done_date': task['last_done_date'],
                            'days_since_done': days_since_done,
                            'threshold': task['threshold'],
                            'days_overdue': days_overdue,
                            '_sort_key': 10**9 if days_since_done is None else days_overdue,
                        }
                    )

        overdue_tasks.sort(
            key=lambda item: (
                -item['_sort_key'],
                item['zone_name'],
                item['area_name'],
                item['task_type_name'],
            )
        )
        for item in overdue_tasks:
            item.pop('_sort_key', None)

        zone_status.sort(key=_zone_order_key)

        worker_ids = {
            worker.id
            for workers in team_map.values()
            for worker in workers
        }
        payload = {
            'current_season': get_current_season(),
            'total_areas': sum(len(zone.areas.all()) for zone in zones),
            'total_workers': len(worker_ids),
            'tasks_due_today': tasks_due_today,
            'tasks_overdue': tasks_overdue,
            'task_status_counts': task_status_counts,
            'zones': get_zone_choices_payload(sorted(zones, key=_zone_order_key)),
            'zone_status': zone_status,
            'overdue_tasks': overdue_tasks,
        }
        serializer = AdminSummarySerializer(payload)
        return Response(serializer.data)


class AdminHorticultureZoneDetailAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request, zone_id):
        zone = get_object_or_404(get_horticulture_zones(), pk=zone_id)
        payload = build_zone_dashboard_payload(zone, today=timezone.localdate())
        task_types = list(TaskType.objects.filter(is_active=True).order_by('name'))
        response_payload = {
            'zone_id': zone.id,
            'zone_name': zone.name,
            'zone_color': zone.color_code,
            'supervisor_id': zone.supervisor_id,
            'supervisor_name': _display_name(zone.supervisor),
            'season': payload['season'],
            'task_types': [
                {
                    'id': task_type.id,
                    'name': task_type.name,
                    'threshold': get_task_threshold(task_type, season=payload['season']),
                }
                for task_type in task_types
            ],
            'areas': payload['areas'],
        }
        serializer = AdminZoneDetailSerializer(response_payload)
        return Response(serializer.data)


class AdminHorticultureAreasAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        areas = (
            HorticultureArea.objects
            .select_related('zone__supervisor')
            .order_by('area_number')
        )
        return Response([
            {
                'id': area.id,
                'area_number': area.area_number,
                'name': area.name,
                'zone_id': area.zone_id,
                'zone_name': area.zone.name if area.zone else '',
                'supervisor_name': _display_name(area.zone.supervisor) if area.zone and area.zone.supervisor else '',
            }
            for area in areas
        ])


class AdminHorticultureAttendanceAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        requested_date = request.query_params.get('date')
        attendance_date = parse_date(requested_date) if requested_date else timezone.localdate()
        if requested_date and attendance_date is None:
            return Response(
                {'detail': 'Invalid date. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        zones = list(get_horticulture_zones())
        supervisors = list(get_horticulture_supervisors())
        team_map = _team_workers_by_supervisor(supervisors)
        zone_map = _zone_names_by_supervisor(zones)

        attendance_map = {
            attendance.supervisor_id: attendance
            for attendance in HorticultureAttendance.objects.filter(
                date=attendance_date,
                supervisor_id__in=[supervisor.id for supervisor in supervisors],
            ).prefetch_related('worker_attendances__worker')
        }

        supervisor_rows = []
        for supervisor in supervisors:
            attendance = attendance_map.get(supervisor.id)
            attendance_payload = _attendance_payload_for_supervisor(
                supervisor,
                attendance,
                team_map.get(supervisor.id, []),
            )
            supervisor_rows.append(
                {
                    'supervisor_id': supervisor.id,
                    'supervisor_name': _display_name(supervisor),
                    'pay_code': supervisor.pay_code or '',
                    'role': supervisor.role or '',
                    'zone_names': zone_map.get(supervisor.id, []),
                    **attendance_payload,
                }
            )

        supervisor_rows.sort(
            key=lambda row: (
                _zone_order_key(row['zone_names'][0]) if row['zone_names'] else (99, row['supervisor_name']),
                row['supervisor_name'],
            )
        )

        serializer = AdminAttendanceSerializer(
            {
                'date': attendance_date,
                'supervisors': supervisor_rows,
            }
        )
        return Response(serializer.data)


class AdminHorticultureSupervisorsAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        zones = list(get_horticulture_zones())
        supervisors = list(get_horticulture_supervisors())
        team_map = _team_workers_by_supervisor(supervisors)
        zone_map = _zone_names_by_supervisor(zones)
        area_map = {}
        for area in HorticultureArea.objects.select_related('zone').filter(
            zone__supervisor_id__in=[supervisor.id for supervisor in supervisors],
        ).order_by('area_number'):
            area_map.setdefault(area.zone.supervisor_id, []).append(area.name)

        weekly_task_counts = {
            row['done_by_id']: row['count']
            for row in (
                TaskLog.objects.filter(
                    done_by_id__in=[supervisor.id for supervisor in supervisors],
                    created_at__date__gte=week_start,
                    created_at__date__lte=today,
                )
                .values('done_by_id')
                .annotate(count=Count('id'))
            )
        }

        supervisor_rows = [
            {
                'id': supervisor.id,
                'supervisor_id': supervisor.id,
                'supervisor_name': _display_name(supervisor),
                'full_name': _display_name(supervisor),
                'first_name': supervisor.first_name,
                'last_name': supervisor.last_name,
                'email': supervisor.email,
                'username': supervisor.username,
                'phone': supervisor.phone or '',
                'pay_code': supervisor.pay_code or '',
                'role': supervisor.role,
                'is_active': supervisor.is_active,
                'zone_names': zone_map.get(supervisor.id, []),
                'area_names': area_map.get(supervisor.id, []),
                'workers_count': len(team_map.get(supervisor.id, [])),
                'last_login': supervisor.last_login,
                'tasks_logged_this_week': weekly_task_counts.get(supervisor.id, 0),
            }
            for supervisor in supervisors
        ]
        supervisor_rows.sort(
            key=lambda row: (
                _zone_order_key(row['zone_names'][0]) if row['zone_names'] else (99, row['supervisor_name']),
                row['supervisor_name'],
            )
        )

        serializer = AdminSupervisorsSerializer({'supervisors': supervisor_rows})
        return Response(serializer.data)


class AdminHorticultureWorkersAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        serializer = AdminWorkerSerializer(_worker_rows(), many=True, context={'request': request})
        return Response({'workers': serializer.data})

    def post(self, request):
        data = request.data.copy()
        if hasattr(request.data, 'getlist'):
            data.setlist('area_ids', request.data.getlist('area_ids'))
        serializer = AdminWorkerSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        worker = serializer.save()
        worker = _worker_rows().get(pk=worker.pk)
        return Response(AdminWorkerSerializer(worker, context={'request': request}).data, status=status.HTTP_201_CREATED)


class AdminHorticultureWorkerDetailAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get_object(self, worker_id):
        return get_object_or_404(_worker_rows(), pk=worker_id)

    def patch(self, request, worker_id):
        worker = self.get_object(worker_id)
        data = request.data.copy()
        if hasattr(request.data, 'getlist'):
            data.setlist('area_ids', request.data.getlist('area_ids'))
        serializer = AdminWorkerSerializer(worker, data=data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        worker = serializer.save()
        worker = _worker_rows().get(pk=worker.pk)
        return Response(AdminWorkerSerializer(worker, context={'request': request}).data)

    def delete(self, request, worker_id):
        worker = self.get_object(worker_id)
        worker.is_active = False
        worker.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminHorticultureWorkerReportAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request, worker_id):
        month = int(request.query_params.get('month') or timezone.localdate().month)
        year = int(request.query_params.get('year') or timezone.localdate().year)
        if month < 1 or month > 12:
            return Response({'detail': 'Invalid month.'}, status=status.HTTP_400_BAD_REQUEST)

        worker = get_object_or_404(_worker_rows(), pk=worker_id)
        worker_row = AdminWorkerSerializer(worker, context={'request': request}).data

        start = date(year, month, 1)
        end = date(year, month, calendar.monthrange(year, month)[1])
        entries = (
            HorticultureAttendanceRecord.objects.filter(
                worker_id=worker_id,
                date__gte=start,
                date__lte=end,
            )
            .select_related('marked_by')
            .order_by('date', 'half')
        )

        days_present = 0
        days_absent = 0
        half_days = 0
        daily_breakdown = []
        for entry in entries:
            if entry.status in {HorticultureAttendanceRecord.Status.PRESENT, HorticultureAttendanceRecord.Status.LATE}:
                days_present += 1
            elif entry.status == HorticultureAttendanceRecord.Status.ABSENT:
                days_absent += 1
            elif entry.status == HorticultureAttendanceRecord.Status.LEAVE:
                half_days += 1
            daily_breakdown.append(
                {
                    'date': entry.date,
                    'status': f'{entry.half}_{entry.status}',
                    'supervisor_name': _display_name(entry.marked_by),
                }
            )

        marked_days = len(daily_breakdown)
        attendance_pct = round((days_present / marked_days) * 100, 2) if marked_days else 0
        task_assignments = list(
            HorticultureDailyAssignment.objects
            .filter(worker_id=worker_id, date__gte=start, date__lte=end)
            .select_related('area', 'task_type', 'assigned_by', 'completed_by')
            .order_by('date', 'session', 'assigned_at')
        )
        task_details = [
            {
                'date': item.date,
                'area_name': item.area.name if item.area else '',
                'task_name': item.task_type.name if item.task_type else '',
                'session': item.session,
                'status': item.status,
                'assigned_at': item.assigned_at,
                'submitted_at': item.completed_at or item.photo_uploaded_at,
                'supervisor_name': _display_name(item.completed_by or item.assigned_by),
                'remarks': item.note or '',
                'photo_submitted': bool(item.photo),
            }
            for item in task_assignments
        ]
        tasks_assigned = len(task_details)
        tasks_completed = sum(
            1
            for item in task_assignments
            if item.status == HorticultureDailyAssignment.Status.DONE
        )
        tasks_pending = sum(
            1
            for item in task_assignments
            if item.status in {
                HorticultureDailyAssignment.Status.PENDING,
                HorticultureDailyAssignment.Status.IN_PROGRESS,
            }
        )
        serializer = AdminWorkerReportSerializer(
            {
                'worker': worker_row,
                'month': month,
                'year': year,
                'days_present': days_present,
                'days_absent': days_absent,
                'half_days': half_days,
                'marked_days': marked_days,
                'attendance_pct': attendance_pct,
                'tasks_assigned': tasks_assigned,
                'tasks_completed': tasks_completed,
                'tasks_pending': tasks_pending,
                'task_completion_pct': round((tasks_completed / tasks_assigned) * 100, 2) if tasks_assigned else 0,
                'daily_breakdown': daily_breakdown,
                'task_details': task_details,
            }
        )
        return Response(serializer.data)


class AdminHorticultureAttendanceSummaryAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        requested_date = request.query_params.get('date')
        attendance_date = parse_date(requested_date) if requested_date else timezone.localdate()
        if requested_date and attendance_date is None:
            return Response({'detail': 'Invalid date. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        areas = list(HorticultureArea.objects.select_related('zone').order_by('area_number'))
        worker_links = (
            HorticultureWorkerArea.objects
            .filter(is_active=True, worker__is_active=True)
            .values_list('area_id', 'worker_id')
        )
        workers_by_area = {}
        for area_id, worker_id in worker_links:
            workers_by_area.setdefault(area_id, set()).add(worker_id)

        present_map = {}
        status_counts = {}
        for area_id, worker_id, half, record_status in (
            HorticultureAttendanceRecord.objects
            .filter(worker__area_assignments__is_active=True, date=attendance_date)
            .values_list('worker__area_assignments__area_id', 'worker_id', 'half', 'status')
        ):
            if record_status in {HorticultureAttendanceRecord.Status.PRESENT, HorticultureAttendanceRecord.Status.LATE}:
                present_map.setdefault(area_id, set()).add(worker_id)
            status_counts.setdefault(area_id, {'late': 0, 'leave': 0})
            if record_status in {'late', 'leave'}:
                status_counts[area_id][record_status] += 1

        rows = []
        for area in areas:
            total = len(workers_by_area.get(area.id, set()))
            present = len(present_map.get(area.id, set()))
            rows.append({
                'area_id': area.id,
                'area_name': area.name,
                'zone_name': area.zone.name if area.zone else '',
                'total_workers': total,
                'present': present,
                'absent': max(total - present, 0),
                'late': status_counts.get(area.id, {}).get('late', 0),
                'leave': status_counts.get(area.id, {}).get('leave', 0),
            })
        return Response(rows)


class AdminHorticultureAttendanceRecordListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = AdminAttendanceRecordSerializer
    permission_classes = [IsAdminOrHorticultureManager]

    def get_queryset(self):
        qs = HorticultureAttendanceRecord.objects.select_related('worker', 'marked_by')
        date_str = self.request.query_params.get('date')
        if date_str:
            qs = qs.filter(date=parse_date(date_str) or timezone.localdate())
        return qs

    def perform_create(self, serializer):
        serializer.save(marked_by=self.request.user, submitted_at=timezone.now())


class AdminHorticultureAttendanceRecordDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminAttendanceRecordSerializer
    permission_classes = [IsAdminOrHorticultureManager]
    queryset = HorticultureAttendanceRecord.objects.select_related('worker', 'marked_by')


class AdminHorticultureDailyAssignmentListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = AdminDailyAssignmentSerializer
    permission_classes = [IsAdminOrHorticultureManager]

    def get_queryset(self):
        qs = HorticultureDailyAssignment.objects.select_related('worker', 'area', 'task_type', 'assigned_by', 'completed_by')
        date_str = self.request.query_params.get('date')
        area_id = self.request.query_params.get('area')
        worker_id = self.request.query_params.get('worker')
        if date_str:
            qs = qs.filter(date=parse_date(date_str) or timezone.localdate())
        if area_id:
            qs = qs.filter(area_id=area_id)
        if worker_id:
            qs = qs.filter(worker_id=worker_id)
        return qs

    def perform_create(self, serializer):
        photo = serializer.validated_data.get('photo')
        photo_before = serializer.validated_data.get('photo_before')
        photo_after = serializer.validated_data.get('photo_after')
        is_done = serializer.validated_data.get('status', HorticultureDailyAssignment.Status.DONE) == HorticultureDailyAssignment.Status.DONE
        serializer.save(
            assigned_by=self.request.user,
            completed_by=self.request.user if is_done else None,
            completed_at=timezone.now() if is_done else None,
            photo_uploaded_at=timezone.now() if photo else None,
            photo_before_uploaded_at=timezone.now() if photo_before else None,
            photo_after_uploaded_at=timezone.now() if photo_after else None,
        )


class AdminHorticultureDailyAssignmentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminDailyAssignmentSerializer
    permission_classes = [IsAdminOrHorticultureManager]
    queryset = HorticultureDailyAssignment.objects.select_related('worker', 'area', 'task_type', 'assigned_by', 'completed_by')

    def perform_update(self, serializer):
        photo = serializer.validated_data.get('photo')
        photo_before = serializer.validated_data.get('photo_before')
        photo_after = serializer.validated_data.get('photo_after')
        status_value = serializer.validated_data.get('status', serializer.instance.status)
        completion_updates = {}
        if status_value == HorticultureDailyAssignment.Status.DONE and serializer.instance.status != HorticultureDailyAssignment.Status.DONE:
            completion_updates = {'completed_by': self.request.user, 'completed_at': timezone.now()}
        serializer.save(
            photo_uploaded_at=timezone.now() if photo else serializer.instance.photo_uploaded_at,
            photo_before_uploaded_at=timezone.now() if photo_before else serializer.instance.photo_before_uploaded_at,
            photo_after_uploaded_at=timezone.now() if photo_after else serializer.instance.photo_after_uploaded_at,
            **completion_updates,
        )


class AdminHorticultureDailyAssignmentPhotoAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request, pk):
        assignment = get_object_or_404(HorticultureDailyAssignment, pk=pk)
        photo = assignment.photo_after or assignment.photo
        if not photo:
            return Response({'detail': 'Photo not found.'}, status=status.HTTP_404_NOT_FOUND)
        file_handle = photo.open('rb')
        filename = f"horticulture_{assignment.date}_{assignment.area_id}_{assignment.task_type_id}_{assignment.worker_id}.jpg"
        return FileResponse(file_handle, as_attachment=True, filename=filename)


class AdminHorticultureAreaTaskAssignmentListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = AdminAreaTaskAssignmentSerializer
    permission_classes = [IsAdminOrHorticultureManager]

    def get_queryset(self):
        qs = HorticultureAreaTaskAssignment.objects.select_related('area__zone', 'task_type', 'assigned_by')
        date_str = self.request.query_params.get('date')
        area_id = self.request.query_params.get('area')
        if date_str:
            qs = qs.filter(date=parse_date(date_str) or timezone.localdate())
        if area_id:
            qs = qs.filter(area_id=area_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class AdminHorticultureAreaTaskAssignmentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminAreaTaskAssignmentSerializer
    permission_classes = [IsAdminOrHorticultureManager]
    queryset = HorticultureAreaTaskAssignment.objects.select_related('area__zone', 'task_type', 'assigned_by')


class AdminHorticultureTaskTypeListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = AdminTaskTypeSerializer
    permission_classes = [IsAdminOrHorticultureManager]
    queryset = TaskType.objects.order_by('name')


class AdminHorticultureTaskTypeDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminTaskTypeSerializer
    permission_classes = [IsAdminOrHorticultureManager]
    queryset = TaskType.objects.order_by('name')


class ManagerSeasonAPIView(APIView):
    permission_classes = [IsHorticultureManager]

    def patch(self, request):
        serializer = ManagerSeasonUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        season_setting, _created = SeasonSetting.objects.get_or_create(
            pk=1,
            defaults={
                'season': serializer.validated_data['season'],
                'updated_by': request.user,
            },
        )

        season_setting.season = serializer.validated_data['season']
        season_setting.updated_by = request.user
        season_setting.save()

        return Response(
            ManagerSeasonStatusSerializer(_season_setting_payload(season_setting)).data
        )


class ManagerWeeklySummaryAPIView(APIView):
    permission_classes = [IsHorticultureManager]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        zones = list(get_horticulture_zones())
        task_types = list(TaskType.objects.filter(is_active=True).order_by('name'))
        zone_ids = [zone.id for zone in zones]
        supervisor_ids = [zone.supervisor_id for zone in zones if zone.supervisor_id]
        elapsed_week_days = ((today - week_start).days + 1) if today >= week_start else 0

        task_count_map = {
            (row['zone_id'], row['task_type_id']): row['completed_count']
            for row in (
                TaskLog.objects.filter(
                    zone_id__in=zone_ids,
                    done_date__gte=week_start,
                    done_date__lte=today,
                )
                .values('zone_id', 'task_type_id')
                .annotate(completed_count=Count('id'))
            )
        }
        attendance_days_map = {
            row['supervisor_id']: row['submitted_days']
            for row in (
                HorticultureAttendance.objects.filter(
                    supervisor_id__in=supervisor_ids,
                    date__gte=week_start,
                    date__lte=today,
                )
                .values('supervisor_id')
                .annotate(submitted_days=Count('date', distinct=True))
            )
        }

        zone_rows = []
        report_rows = []

        for zone in zones:
            dashboard_payload = build_zone_dashboard_payload(zone, today=today)
            critical_areas = []
            critical_overdue_count = 0

            for area in dashboard_payload['areas']:
                critical_tasks = []
                for task in area['tasks']:
                    if task['is_overdue']:
                        report_rows.append(
                            {
                                'zone_name': zone.name,
                                'area_name': area['name'],
                                'task_name': task['task_type_name'],
                                'last_done_date': task['last_done_date'],
                                'days_overdue': _days_overdue(task),
                                '_sort_days': 10**9
                                if task['days_since_done'] is None
                                else _days_overdue(task),
                            }
                        )

                    if not _is_critical_task(task):
                        continue

                    critical_overdue_count += 1
                    critical_tasks.append(
                        {
                            'task_type_id': task['task_type_id'],
                            'task_type_name': task['task_type_name'],
                            'last_done_date': task['last_done_date'],
                            'days_since_done': task['days_since_done'],
                            'threshold': task['threshold'],
                            'days_overdue': _days_overdue(task),
                        }
                    )

                if critical_tasks:
                    critical_tasks.sort(
                        key=lambda item: (
                            -(10**9 if item['days_since_done'] is None else item['days_overdue']),
                            item['task_type_name'],
                        )
                    )
                    critical_areas.append(
                        {
                            'area_id': area['id'],
                            'area_name': area['name'],
                            'critical_tasks': critical_tasks,
                        }
                    )

            critical_areas.sort(
                key=lambda item: (
                    -len(item['critical_tasks']),
                    item['area_name'],
                )
            )

            task_totals = [
                {
                    'task_type_id': task_type.id,
                    'task_type_name': task_type.name,
                    'completed_count': task_count_map.get((zone.id, task_type.id), 0),
                }
                for task_type in task_types
            ]
            tasks_completed_total = sum(
                item['completed_count']
                for item in task_totals
            )
            attendance_days_submitted = attendance_days_map.get(zone.supervisor_id, 0)
            attendance_compliance_pct = (
                int(round((attendance_days_submitted / elapsed_week_days) * 100))
                if elapsed_week_days
                else 0
            )

            zone_rows.append(
                {
                    'zone_id': zone.id,
                    'zone_name': zone.name,
                    'zone_color': zone.color_code,
                    'supervisor_id': zone.supervisor_id,
                    'supervisor_name': _display_name(zone.supervisor),
                    'tasks_completed_total': tasks_completed_total,
                    'task_totals': task_totals,
                    'attendance_days_submitted': attendance_days_submitted,
                    'attendance_expected_days': elapsed_week_days,
                    'attendance_compliance_pct': attendance_compliance_pct,
                    'critical_overdue_count': critical_overdue_count,
                    'critical_areas': critical_areas,
                }
            )

        zone_rows.sort(key=_zone_order_key)
        report_rows.sort(
            key=lambda item: (
                -item['_sort_days'],
                item['zone_name'],
                item['area_name'],
                item['task_name'],
            )
        )
        for item in report_rows:
            item.pop('_sort_days', None)

        serializer = ManagerWeeklySummarySerializer(
            {
                'week_start': week_start,
                'week_end': today,
                'season_setting': _season_setting_payload(),
                'zones': zone_rows,
                'report_rows': report_rows,
            }
        )
        return Response(serializer.data)


class SupervisorDashboardAPIView(APIView):
    permission_classes = [IsSupervisor]

    def get(self, request):
        selected_zone, _zones, payload = _mobile_zone_context(
            request.user,
            request.query_params.get('zone_id'),
        )
        if selected_zone is None:
            payload['zone_id'] = None
            payload['zone_name'] = ''
            payload['zone_color'] = ''
        serializer = SupervisorDashboardSerializer(payload)
        return Response(serializer.data)


class SupervisorWorkersAPIView(APIView):
    permission_classes = [IsSupervisor]

    def get(self, request):
        workers = get_supervisor_worker_queryset(request.user)
        serializer = SupervisorWorkerSerializer(workers, many=True)
        return Response(serializer.data)


class SupervisorTaskLogCreateAPIView(APIView):
    permission_classes = [IsSupervisor]

    def post(self, request):
        serializer = SupervisorTaskLogSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        task_log = serializer.save()
        return Response(
            SupervisorTaskLogSerializer(task_log).data,
            status=status.HTTP_201_CREATED,
        )


class SupervisorAttendanceCreateAPIView(APIView):
    permission_classes = [IsSupervisor]

    def post(self, request):
        serializer = SupervisorAttendanceCreateSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        attendance = serializer.save()
        attendance = _attendance_for_date(request.user, attendance.date)
        return Response(
            SupervisorAttendanceSerializer(attendance).data,
            status=status.HTTP_201_CREATED,
        )


class SupervisorTodayAttendanceAPIView(APIView):
    permission_classes = [IsSupervisor]

    def get(self, request):
        today = timezone.localdate()
        attendance = _attendance_for_date(request.user, today)
        if attendance is None:
            return Response({})
        return Response(SupervisorAttendanceSerializer(attendance).data)


def horticulture_supervisor_required(fn):
    @functools.wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f'/portal/login/?next={request.path}')
        if not request.user.is_active:
            return redirect('/portal/login/')
        if request.user.role != 'supervisor':
            return HttpResponseForbidden()
        return fn(request, *args, **kwargs)

    return wrapper


def horticulture_manager_required(fn):
    @functools.wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f'/portal/login/?next={request.path}')
        if not request.user.is_active:
            return redirect('/portal/login/')
        if request.user.role not in ['admin', 'horticulture_manager']:
            return HttpResponseForbidden()
        return fn(request, *args, **kwargs)

    return wrapper


def _horticulture_manager_context():
    today = timezone.localdate()
    zones = list(get_horticulture_zones())
    zone_rows = []
    for zone in zones:
        area_ids = list(zone.areas.values_list('id', flat=True))
        workers_count = (
            HorticultureWorker.objects
            .filter(is_active=True, area_assignments__area__zone=zone, area_assignments__is_active=True)
            .distinct()
            .count()
        )
        done_today = HorticultureDailyAssignment.objects.filter(
            area_id__in=area_ids,
            date=today,
            status=HorticultureDailyAssignment.Status.DONE,
        ).count()
        assigned_today = HorticultureAreaTaskAssignment.objects.filter(
            area_id__in=area_ids,
            date=today,
            is_active=True,
        ).count()
        overdue_tasks = sum(
            area_row['overdue_task_count']
            for area_row in build_zone_dashboard_payload(zone, today=today)['areas']
        )
        attendance_workers = (
            HorticultureAttendanceRecord.objects
            .filter(worker__area_assignments__area__zone=zone, date=today)
            .values('worker_id')
            .distinct()
            .count()
        )
        pending_requests = HorticultureStockRequest.objects.filter(area__zone=zone, status='pending').count()
        low_stock_count = HorticultureAreaStock.objects.filter(area__zone=zone, quantity__lte=models.F('low_stock_threshold')).count()
        zone_rows.append(
            {
                'zone': zone,
                'areas_count': len(area_ids),
                'workers_count': workers_count,
                'done_today': done_today,
                'assigned_today': assigned_today,
                'overdue_tasks': overdue_tasks,
                'attendance_workers': attendance_workers,
                'pending_requests': pending_requests,
                'low_stock_count': low_stock_count,
            }
        )
    totals = {
        'zones': len(zones),
        'areas': sum(row['areas_count'] for row in zone_rows),
        'workers': sum(row['workers_count'] for row in zone_rows),
        'done_today': sum(row['done_today'] for row in zone_rows),
        'assigned_today': sum(row['assigned_today'] for row in zone_rows),
        'overdue_tasks': sum(row['overdue_tasks'] for row in zone_rows),
        'pending_requests': sum(row['pending_requests'] for row in zone_rows),
        'low_stock_count': sum(row['low_stock_count'] for row in zone_rows),
    }
    task_total = totals['done_today'] + totals['assigned_today']
    totals['task_progress_pct'] = int(round((totals['done_today'] / task_total) * 100)) if task_total else 0
    return today, zones, zone_rows, totals


@login_required
def horticulture_root(request):
    return redirect('/horticulture/dashboard/')


@login_required
def horticulture_dashboard(request):
    if not request.user.is_active:
        return redirect('/portal/login/')

    if request.user.role in ['admin', 'horticulture_manager']:
        today, zones, zone_rows, totals = _horticulture_manager_context()
        pending_requests = (
            HorticultureStockRequest.objects
            .filter(status='pending')
            .select_related('requested_by', 'area__zone', 'item')
            .order_by('-is_urgent', '-created_at')[:6]
        )
        incharge_notice = (
            HorticultureInchargeNotification.objects
            .filter(user=request.user, is_seen=False)
            .select_related('assignment', 'assignment__zone')
            .order_by('-created_at')
            .first()
        )
        if incharge_notice:
            incharge_notice.is_seen = True
            incharge_notice.save(update_fields=['is_seen'])
        incoming_incharge_requests = list(
            HorticultureInchargeAssignment.objects
            .filter(
                assigned_staff=request.user,
                status=HorticultureInchargeAssignment.Status.PENDING_ACCEPTANCE,
                leave_date__gte=today,
            )
            .select_related('zone', 'leave_staff')
            .order_by('leave_date', '-created_at')[:10]
        )
        incoming_waiting_admin = list(
            HorticultureInchargeAssignment.objects
            .filter(
                assigned_staff=request.user,
                status=HorticultureInchargeAssignment.Status.PENDING_ADMIN_APPROVAL,
                leave_date__gte=today,
            )
            .select_related('zone', 'leave_staff')
            .order_by('leave_date', '-created_at')[:10]
        )
        return render(
            request,
            'horticulture/mobile/manager_dashboard.html',
            {
                'today': today,
                'zones': zones,
                'zone_rows': zone_rows,
                'totals': totals,
                'pending_requests': pending_requests,
                'incharge_notice': incharge_notice,
                'incoming_incharge_requests': incoming_incharge_requests,
                'incoming_waiting_admin': incoming_waiting_admin,
                'is_horti_manager': True,
            },
        )

    if request.user.role != 'supervisor':
        return HttpResponseForbidden()

    selected_zone, zones, dashboard_payload = _mobile_zone_context(
        request.user,
        request.GET.get('zone'),
    )
    selected_area = _selected_area_for_zone(selected_zone)
    requested_area_id = request.GET.get('area')
    if requested_area_id:
        selected_area = _selected_area_for_zone(selected_zone, requested_area_id)

    today = timezone.localdate()
    selected_area_payload = None
    for area in dashboard_payload['areas']:
        if selected_area and area['id'] == selected_area.id:
            selected_area_payload = area
            break
    task_rows = selected_area_payload['tasks'] if selected_area_payload else []
    area_task_assignments = (
        HorticultureAreaTaskAssignment.objects
        .filter(area=selected_area, date=today, is_active=True)
        .select_related('task_type', 'assigned_by')
        .order_by('session', 'task_type__name')
    ) if selected_area else []
    completed_assignments = (
        HorticultureDailyAssignment.objects
        .filter(area=selected_area, date=today, status=HorticultureDailyAssignment.Status.DONE)
        .select_related('worker', 'task_type')
    ) if selected_area else []
    completed_task_ids = {assignment.task_type_id for assignment in completed_assignments}
    done_task_type_ids = {
        task['task_type_id']
        for task in task_rows
        if task.get('last_done_date') == today
    }
    done_task_type_ids.update(completed_task_ids)
    total_tasks = len(task_rows)
    done_tasks = sum(1 for task in task_rows if task['task_type_id'] in done_task_type_ids)
    pending_tasks = max(total_tasks - done_tasks, 0)
    percent_done = int(round((done_tasks / total_tasks) * 100)) if total_tasks else 0
    task_rows = sorted(task_rows, key=lambda task: horticulture_task_done_rank(task, done_task_type_ids))
    incharge_notice = (
        HorticultureInchargeNotification.objects
        .filter(user=request.user, is_seen=False)
        .select_related('assignment', 'assignment__zone')
        .order_by('-created_at')
        .first()
    )
    if incharge_notice:
        incharge_notice.is_seen = True
        incharge_notice.save(update_fields=['is_seen'])
    incoming_incharge_requests = list(
        HorticultureInchargeAssignment.objects
        .filter(
            assigned_staff=request.user,
            status=HorticultureInchargeAssignment.Status.PENDING_ACCEPTANCE,
            leave_date__gte=today,
        )
        .select_related('zone', 'leave_staff')
        .order_by('leave_date', '-created_at')[:10]
    )
    incoming_waiting_admin = list(
        HorticultureInchargeAssignment.objects
        .filter(
            assigned_staff=request.user,
            status=HorticultureInchargeAssignment.Status.PENDING_ADMIN_APPROVAL,
            leave_date__gte=today,
        )
        .select_related('zone', 'leave_staff')
        .order_by('leave_date', '-created_at')[:10]
    )
    incharge_today_assignments = list(
        HorticultureInchargeAssignment.objects
        .filter(
            assigned_staff=request.user,
            status=HorticultureInchargeAssignment.Status.APPROVED,
            leave_date=today,
        )
        .select_related('zone', 'leave_staff')
        .order_by('-created_at')
    )
    for assignment in incharge_today_assignments:
        if not assignment.arrival_notified:
            _create_horti_incharge_notice(
                request.user,
                assignment,
                f'Incharge mode active today for {assignment.zone.name}.',
                level='success',
            )
            assignment.arrival_notified = True
            assignment.save(update_fields=['arrival_notified', 'updated_at'])
    my_open_leave_reqs = list(
        HorticultureLeaveRequest.objects
        .filter(
            staff=request.user,
            leave_date__gte=today,
            status__in=[
                HorticultureLeaveRequest.Status.AWAITING_INCHARGE,
                HorticultureLeaveRequest.Status.REASSIGN_REQUIRED,
            ],
        )
        .select_related('zone')
        .order_by('leave_date', '-created_at')[:10]
    )
    leave_reselection_cards = [
        {
            'leave_request': leave_req,
            'candidates': _horticulture_incharge_candidates(leave_req, exclude_user_id=request.user.id),
            'latest_assignment': getattr(leave_req, 'incharge_assignment', None),
        }
        for leave_req in my_open_leave_reqs
    ]

    return render(
        request,
        'horticulture/mobile/dashboard.html',
        {
            'today': today,
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'task_rows': task_rows,
            'area_task_assignments': area_task_assignments,
            'completed_assignments': completed_assignments,
            'completed_task_ids': done_task_type_ids,
            'total_tasks': total_tasks,
            'done_tasks': done_tasks,
            'pending_tasks': pending_tasks,
            'percent_done': percent_done,
            'season': dashboard_payload['season'],
            'zone_count': len(zones),
            'incharge_notice': incharge_notice,
            'incoming_incharge_requests': incoming_incharge_requests,
            'incoming_waiting_admin': incoming_waiting_admin,
            'incharge_today_assignments': incharge_today_assignments,
            'leave_reselection_cards': leave_reselection_cards,
        },
    )


@login_required
def horticulture_profile(request):
    if not request.user.is_active:
        return redirect('/portal/login/')
    if request.user.role not in ['supervisor', 'horticulture_manager', 'admin']:
        return HttpResponseForbidden()

    user = request.user
    selected_zone = None
    selected_area = None
    zones = []
    success = ''
    error = ''
    today = timezone.localdate()
    show_incharge_selector = False
    selector_leave_request = None
    selector_candidates = []
    selected_leave_date = ''
    selected_leave_zone_id = ''
    leave_reason_value = ''

    if user.role == 'supervisor':
        selected_zone, zones, _dashboard_payload = _mobile_zone_context(
            user,
            request.GET.get('zone'),
        )
        selected_area = _selected_area_for_zone(selected_zone)

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'change_password':
            cur = request.POST.get('current_password', '')
            new = request.POST.get('new_password', '')
            conf = request.POST.get('confirm_password', '')
            if not user.check_password(cur):
                error = 'Current password is incorrect.'
            elif new != conf:
                error = 'Passwords do not match.'
            elif len(new) < 8:
                error = 'Minimum 8 characters required.'
            else:
                user.set_password(new)
                user.save()
                update_session_auth_hash(request, user)
                success = 'Password updated successfully.'
        elif action == 'upload_photo' and 'profile_photo' in request.FILES:
            user.profile_photo = request.FILES['profile_photo']
            user.save(update_fields=['profile_photo'])
            success = 'Photo updated.'
        elif action == 'submit_leave' and user.role == 'supervisor':
            zone_id = request.POST.get('leave_zone_id')
            selected_leave_zone_id = zone_id or ''
            selected_leave_date = (request.POST.get('leave_date') or '').strip()
            leave_reason_value = (request.POST.get('leave_reason') or '').strip()
            zone = get_supervisor_zones(user).filter(pk=zone_id).first() if zone_id else selected_zone
            leave_date = parse_date(selected_leave_date)
            if not zone:
                error = 'Please select a valid zone.'
            elif not leave_date:
                error = 'Please select a valid leave date.'
            elif leave_date < today:
                error = 'Leave date cannot be in the past.'
            else:
                leave_req, _created = HorticultureLeaveRequest.objects.get_or_create(
                    staff=user,
                    zone=zone,
                    leave_date=leave_date,
                    defaults={
                        'reason': leave_reason_value,
                        'status': HorticultureLeaveRequest.Status.AWAITING_INCHARGE,
                    },
                )
                leave_req.reason = leave_reason_value
                if leave_req.status in {
                    HorticultureLeaveRequest.Status.APPROVED,
                    HorticultureLeaveRequest.Status.PENDING_ADMIN_APPROVAL,
                    HorticultureLeaveRequest.Status.PENDING_ACCEPTANCE,
                }:
                    leave_req.status = HorticultureLeaveRequest.Status.AWAITING_INCHARGE
                leave_req.save(update_fields=['reason', 'status', 'updated_at'])
                show_incharge_selector = True
                selector_leave_request = leave_req
                selector_candidates = _horticulture_incharge_candidates(leave_req, exclude_user_id=user.id)
                success = 'Leave request submitted. Select temporary incharge.' if selector_candidates else ''
                if not selector_candidates:
                    error = 'No eligible horticulture supervisor found for temporary incharge.'
        elif action == 'assign_temp_incharge' and user.role == 'supervisor':
            leave_req = (
                HorticultureLeaveRequest.objects
                .select_related('zone', 'staff')
                .filter(pk=request.POST.get('leave_request_id'), staff=user)
                .first()
            )
            assigned_staff_id = request.POST.get('assigned_staff_id')
            note = (request.POST.get('incharge_note') or '').strip()
            if not leave_req:
                error = 'Leave request not found.'
            else:
                candidate_ids = {row['user'].id for row in _horticulture_incharge_candidates(leave_req, exclude_user_id=user.id)}
                if not assigned_staff_id or not str(assigned_staff_id).isdigit():
                    error = 'Please select temporary incharge.'
                elif int(assigned_staff_id) not in candidate_ids:
                    error = 'Selected incharge is not valid.'
                else:
                    assigned_staff = get_object_or_404(
                        User,
                        pk=int(assigned_staff_id),
                        is_active=True,
                        role__in=[User.Role.SUPERVISOR, User.Role.HORTICULTURE_MANAGER],
                    )
                    _assign_horti_incharge_for_leave(leave_req, assigned_staff, user, note=note)
                    return redirect(f'/horticulture/dashboard/?zone={leave_req.zone_id}&ic_ok=sent')

    zone_source = get_supervisor_zones(user) if user.role == 'supervisor' else get_horticulture_zones()
    zone_items = [
        {
            'name': zone.name,
            'meta': f'{zone.area_count} areas',
        }
        for zone in zone_source.annotate(area_count=Count('areas'))
    ]
    recent_leaves = list(
        HorticultureLeaveRequest.objects
        .filter(staff=user, leave_date__gte=today - timedelta(days=30))
        .select_related('zone')
        .order_by('-leave_date', '-created_at')[:20]
    ) if user.role == 'supervisor' else []

    return render(
        request,
        'horticulture/mobile/profile.html',
        {
            'user': user,
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'success': success,
            'error': error,
            'today': today,
            'recent_leaves': recent_leaves,
            'show_incharge_selector': show_incharge_selector,
            'selector_leave_request': selector_leave_request,
            'selector_candidates': selector_candidates,
            'selected_leave_date': selected_leave_date,
            'selected_leave_zone_id': selected_leave_zone_id,
            'leave_reason_value': leave_reason_value,
            'zone_items': zone_items,
            'zones': zones,
            'zone_count': len(zones),
            'is_horti_manager': user.role in ['admin', 'horticulture_manager'],
        },
    )


@login_required
def horticulture_incharge_respond(request):
    if not request.user.is_active:
        return redirect('/portal/login/')
    if request.user.role not in [User.Role.SUPERVISOR, User.Role.HORTICULTURE_MANAGER]:
        return HttpResponseForbidden()
    if request.method != 'POST':
        return HttpResponseForbidden()
    assignment = (
        HorticultureInchargeAssignment.objects
        .select_related('leave_request', 'zone', 'leave_staff', 'assigned_staff')
        .filter(pk=request.POST.get('assignment_id'), assigned_staff=request.user)
        .first()
    )
    zone_id = request.POST.get('zone') or (assignment.zone_id if assignment else None)
    query = _query_string(zone=zone_id)
    if not assignment:
        return redirect(f'/horticulture/dashboard/?{query}&ic_err=invalid_assignment')
    if assignment.status != HorticultureInchargeAssignment.Status.PENDING_ACCEPTANCE:
        return redirect(f'/horticulture/dashboard/?{query}&ic_err=assignment_locked')
    decision = (request.POST.get('decision') or '').strip().lower()
    note = (request.POST.get('note') or '').strip()
    if decision == 'accept':
        assignment.status = HorticultureInchargeAssignment.Status.PENDING_ADMIN_APPROVAL
        assignment.staff_action_at = timezone.now()
        assignment.staff_action_note = note
        assignment.save(update_fields=['status', 'staff_action_at', 'staff_action_note', 'updated_at'])
        assignment.leave_request.status = HorticultureLeaveRequest.Status.PENDING_ADMIN_APPROVAL
        assignment.leave_request.save(update_fields=['status', 'updated_at'])
        _create_horti_incharge_notice(
            assignment.leave_staff,
            assignment,
            f'{assignment.assigned_staff_name} accepted temporary incharge for {assignment.zone.name}. Awaiting admin approval.',
        )
        return redirect(f'/horticulture/dashboard/?{query}&ic_ok=accepted')
    if decision == 'decline':
        assignment.status = HorticultureInchargeAssignment.Status.DECLINED
        assignment.staff_action_at = timezone.now()
        assignment.staff_action_note = note
        assignment.save(update_fields=['status', 'staff_action_at', 'staff_action_note', 'updated_at'])
        assignment.leave_request.status = HorticultureLeaveRequest.Status.REASSIGN_REQUIRED
        assignment.leave_request.save(update_fields=['status', 'updated_at'])
        _create_horti_incharge_notice(
            assignment.leave_staff,
            assignment,
            f'{assignment.assigned_staff_name} declined temporary incharge for {assignment.leave_date}. Please select another incharge.',
            level='error',
        )
        return redirect(f'/horticulture/dashboard/?{query}&ic_ok=declined')
    return redirect(f'/horticulture/dashboard/?{query}&ic_err=invalid_decision')


class AdminHorticultureLeaveApprovalAPIView(APIView):
    permission_classes = [IsAdminOrHorticultureManager]

    def get(self, request):
        rows = []
        assignments = (
            HorticultureInchargeAssignment.objects
            .filter(status=HorticultureInchargeAssignment.Status.PENDING_ADMIN_APPROVAL)
            .select_related('zone', 'leave_request', 'leave_staff', 'assigned_staff')
            .order_by('leave_date', '-created_at')
        )
        for assignment in assignments:
            rows.append({
                'id': assignment.id,
                'leave_request_id': assignment.leave_request_id,
                'zone_name': assignment.zone.name,
                'leave_staff_name': assignment.leave_staff_name,
                'assigned_staff_name': assignment.assigned_staff_name,
                'leave_date': assignment.leave_date,
                'reason': assignment.leave_request.reason,
                'staff_action_note': assignment.staff_action_note,
                'created_at': assignment.created_at,
            })
        return Response(rows)

    def post(self, request, assignment_id):
        assignment = get_object_or_404(
            HorticultureInchargeAssignment.objects.select_related('leave_request', 'zone', 'leave_staff', 'assigned_staff'),
            pk=assignment_id,
            status=HorticultureInchargeAssignment.Status.PENDING_ADMIN_APPROVAL,
        )
        decision = (request.data.get('decision') or '').strip().lower()
        note = (request.data.get('note') or '').strip()
        if decision not in {'approve', 'reject'}:
            return Response({'detail': 'decision must be approve or reject.'}, status=status.HTTP_400_BAD_REQUEST)
        if decision == 'approve':
            assignment.status = HorticultureInchargeAssignment.Status.APPROVED
            assignment.leave_request.status = HorticultureLeaveRequest.Status.APPROVED
            level = 'success'
            msg = f'Admin approved temporary incharge: {assignment.assigned_staff_name} for {assignment.zone.name} on {assignment.leave_date}.'
        else:
            assignment.status = HorticultureInchargeAssignment.Status.ADMIN_REJECTED
            assignment.leave_request.status = HorticultureLeaveRequest.Status.REASSIGN_REQUIRED
            level = 'error'
            msg = f'Admin rejected temporary incharge: {assignment.assigned_staff_name} for {assignment.zone.name} on {assignment.leave_date}. Please select another.'
        assignment.admin_action_by = request.user
        assignment.admin_action_at = timezone.now()
        assignment.admin_action_note = note
        assignment.save(update_fields=['status', 'admin_action_by', 'admin_action_at', 'admin_action_note', 'updated_at'])
        assignment.leave_request.save(update_fields=['status', 'updated_at'])
        _create_horti_incharge_notice(assignment.leave_staff, assignment, msg, level=level)
        _create_horti_incharge_notice(assignment.assigned_staff, assignment, msg, level=level)
        return Response({'detail': 'Decision saved.'})


@horticulture_supervisor_required
def horticulture_mark_task(request):
    selected_zone, zones, dashboard_payload = _mobile_zone_context(
        request.user,
        request.GET.get('zone') or request.POST.get('zone_id'),
    )
    selected_area = _selected_area_for_zone(
        selected_zone,
        request.GET.get('area') or request.POST.get('area_id'),
    )
    error_message = ''
    today = timezone.localdate()

    if request.method == 'POST':
        action = request.POST.get('action') or ''
        query = _query_string(
            zone=selected_zone.id if selected_zone else None,
            area=selected_area.id if selected_area else None,
            task=request.POST.get('task_type_id') or request.GET.get('task'),
        )
        with transaction.atomic():
            if selected_area is not None:
                selected_area = (
                    HorticultureArea.objects
                    .select_for_update()
                    .filter(pk=selected_area.pk, zone=selected_zone)
                    .first()
                )
            assignment = None
            if request.POST.get('assignment_id'):
                assignment = (
                    HorticultureDailyAssignment.objects
                    .select_for_update()
                    .filter(
                        pk=request.POST.get('assignment_id'),
                        area=selected_area,
                        date=today,
                    )
                    .first()
                )
            worker_ids = list(dict.fromkeys(wid for wid in request.POST.getlist('worker_ids') if str(wid).isdigit()))
            fallback_worker_id = request.POST.get('worker_id')
            if not worker_ids and fallback_worker_id and str(fallback_worker_id).isdigit():
                worker_ids = [fallback_worker_id]
            workers = []
            if worker_ids:
                workers = list(
                    HorticultureWorker.objects.filter(
                        pk__in=worker_ids,
                        is_active=True,
                        area_assignments__area__zone=selected_zone,
                        area_assignments__is_active=True,
                    )
                    .distinct()
                    .order_by('name', 'pay_code')
                )
            worker = workers[0] if workers else None
            session = request.POST.get('session') or HorticultureDailyAssignment.Session.MORNING
            task_type_id = request.POST.get('task_type_id')
            task_type = TaskType.objects.filter(pk=task_type_id, is_active=True).first()
            if selected_zone is None:
                error_message = 'No horticulture zone is assigned to this supervisor.'
            elif selected_area is None:
                error_message = 'Select a valid area before marking a task.'
            elif action == 'assign' and not workers:
                error_message = 'Select at least one valid worker assigned to this zone.'
            elif session not in {HorticultureDailyAssignment.Session.MORNING, HorticultureDailyAssignment.Session.AFTERNOON}:
                error_message = 'Select morning or afternoon session.'
            elif action == 'assign':
                if task_type is None:
                    error_message = 'Select a valid active task.'
                elif TaskLog.objects.filter(zone=selected_zone, area=selected_area, task_type=task_type, done_date=today).exists():
                    error_message = 'This task is already submitted for today.'
                elif HorticultureDailyAssignment.objects.filter(
                    area=selected_area,
                    date=today,
                    task_type=task_type,
                    status__in=[
                        HorticultureDailyAssignment.Status.PENDING,
                        HorticultureDailyAssignment.Status.IN_PROGRESS,
                    ],
                ).exists():
                    error_message = 'Worker is already assigned for this task.'
                elif len(workers) != len(set(int(wid) for wid in worker_ids)):
                    error_message = 'One or more selected workers are invalid for this zone.'
                elif set(worker.id for worker in workers) & _busy_horticulture_worker_ids(selected_zone, today):
                    error_message = 'One or more selected workers are already assigned to an unfinished task.'
                else:
                    assignment = HorticultureDailyAssignment.objects.create(
                        worker=worker,
                        date=today,
                        session=session,
                        area=selected_area,
                        task_type=task_type,
                        assigned_by=request.user,
                        status=HorticultureDailyAssignment.Status.PENDING,
                        note=request.POST.get('note', '').strip(),
                    )
                    HorticultureTaskWorkerAssignment.objects.bulk_create([
                        HorticultureTaskWorkerAssignment(
                            daily_assignment=assignment,
                            worker=item,
                            assigned_by=request.user,
                        )
                        for item in workers
                    ])
                    if len(workers) > 1:
                        messages.success(request, f'{len(workers)} workers assigned to {task_type.name}.')
                    else:
                        messages.success(request, f'{worker.name} assigned to {task_type.name}.')
                    return redirect(f'/horticulture/mark-task/?{query}')
            elif action == 'start':
                if assignment is None:
                    error_message = 'Task assignment not found.'
                elif assignment.status != HorticultureDailyAssignment.Status.PENDING:
                    error_message = 'Only pending tasks can be started.'
                else:
                    assignment.status = HorticultureDailyAssignment.Status.IN_PROGRESS
                    assignment.started_at = timezone.now()
                    update_fields = ['status', 'started_at']
                    if request.FILES.get('photo_before'):
                        assignment.photo_before = request.FILES['photo_before']
                        assignment.photo_before_uploaded_at = timezone.now()
                        update_fields.extend(['photo_before', 'photo_before_uploaded_at'])
                    assignment.save(update_fields=update_fields)
                    if assignment.photo_before:
                        log_image_event(
                            'horticulture_start_saved',
                            request,
                            assignment_id=assignment.id,
                            field='photo_before',
                            debug=image_debug_payload(request, assignment.photo_before),
                        )
                    return redirect(f'/horticulture/mark-task/?{query}')
            elif action == 'undo':
                if assignment is None:
                    error_message = 'Task assignment not found.'
                elif assignment.status != HorticultureDailyAssignment.Status.IN_PROGRESS:
                    error_message = 'Only in-progress tasks can move back to pending.'
                else:
                    assignment.status = HorticultureDailyAssignment.Status.PENDING
                    assignment.started_at = None
                    assignment.photo_before = None
                    assignment.photo_before_uploaded_at = None
                    assignment.save(update_fields=['status', 'started_at', 'photo_before', 'photo_before_uploaded_at'])
                    return redirect(f'/horticulture/mark-task/?{query}')
            elif action == 'done':
                if assignment is None:
                    error_message = 'Task assignment not found.'
                elif assignment.status != HorticultureDailyAssignment.Status.IN_PROGRESS:
                    error_message = 'Start work before marking completed.'
                elif TaskLog.objects.filter(zone=selected_zone, area=selected_area, task_type=assignment.task_type, done_date=today).exists():
                    error_message = 'This task is already submitted for today.'
                else:
                    task_log = TaskLog.objects.create(
                        zone=selected_zone,
                        area=selected_area,
                        task_type=assignment.task_type,
                        done_by=request.user,
                        done_date=today,
                        notes=request.POST.get('note', '').strip(),
                    )
                    if request.FILES.get('photo'):
                        assignment.photo = request.FILES['photo']
                        assignment.photo_uploaded_at = timezone.now()
                        assignment.photo_after = request.FILES['photo']
                        assignment.photo_after_uploaded_at = timezone.now()
                    if request.FILES.get('photo_after'):
                        assignment.photo_after = request.FILES['photo_after']
                        assignment.photo_after_uploaded_at = timezone.now()
                    assignment.status = HorticultureDailyAssignment.Status.DONE
                    assignment.completed_by = request.user
                    assignment.completed_at = timezone.now()
                    assignment.note = request.POST.get('note', '').strip()
                    assignment.save(update_fields=[
                        'photo', 'photo_uploaded_at', 'photo_after', 'photo_after_uploaded_at',
                        'status', 'completed_by', 'completed_at', 'note',
                    ])
                    log_image_event(
                        'horticulture_complete_saved',
                        request,
                        assignment_id=assignment.id,
                        legacy=image_debug_payload(request, assignment.photo),
                        after=image_debug_payload(request, assignment.photo_after),
                    )
                    messages.success(
                        request,
                        f'{task_log.task_type.name} completed for {selected_area.name}.',
                    )
                    return redirect(f'/horticulture/mark-task/?{query}')
            else:
                error_message = 'Select a valid task action.'

    selected_area_payload = None
    for area in dashboard_payload['areas']:
        if selected_area and area['id'] == selected_area.id:
            selected_area_payload = area
            break
    all_assignments = list(
        HorticultureDailyAssignment.objects
        .filter(area=selected_area, date=today)
        .select_related('worker', 'task_type', 'assigned_by', 'completed_by')
        .prefetch_related('worker_assignments__worker')
        .order_by('-assigned_at')
    ) if selected_area else []
    for assignment in all_assignments:
        assignment.photo_before_display_url = image_field_url(request, assignment.photo_before)
        assignment.photo_after_display_url = image_field_url(request, assignment.photo_after)
        assignment.photo_legacy_display_url = image_field_url(request, assignment.photo)
    completed_assignments = [
        assignment for assignment in all_assignments
        if assignment.status == HorticultureDailyAssignment.Status.DONE
    ]
    completed_task_ids = {assignment.task_type_id for assignment in completed_assignments}
    completed_task_ids.update(
        task['task_type_id']
        for task in (selected_area_payload['tasks'] if selected_area_payload else [])
        if task.get('last_done_date') == today
    )
    assignment_by_task = {}
    for assignment in all_assignments:
        assignment_by_task.setdefault(assignment.task_type_id, assignment)
    task_rows = []
    for task in (selected_area_payload['tasks'] if selected_area_payload else []):
        enriched = dict(task)
        enriched['assignment'] = assignment_by_task.get(task['task_type_id'])
        task_rows.append(enriched)
    task_rows = sorted(task_rows, key=lambda task: horticulture_task_done_rank(task, completed_task_ids))
    pending_task_count = sum(
        1
        for task in task_rows
        if task['task_type_id'] not in completed_task_ids
    )
    workers = list(_workers_for_zone(selected_zone))
    _mark_horticulture_busy_workers(workers, _busy_horticulture_worker_ids(selected_zone, today))

    return render(
        request,
        'horticulture/mobile/mark_task.html',
        {
            'today': today,
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'task_rows': task_rows,
            'workers': workers,
            'completed_task_ids': completed_task_ids,
            'completed_assignments': completed_assignments,
            'pending_task_count': pending_task_count,
            'sessions': HorticultureDailyAssignment.Session.choices,
            'season': dashboard_payload['season'],
            'error_message': error_message,
            'zone_count': len(zones),
        },
    )


@horticulture_supervisor_required
def horticulture_attendance(request):
    today = timezone.localdate()
    selected_zone, zones, dashboard_payload = _mobile_zone_context(
        request.user,
        request.GET.get('zone') or request.POST.get('zone'),
    )
    selected_area = _selected_area_for_zone(selected_zone, request.GET.get('area') or request.POST.get('area_id'))
    workers = list(_workers_for_zone(selected_zone))
    error_message = ''
    cur_half = _current_half()
    is_today = True

    if request.method == 'POST':
        action = request.POST.get('action') or 'bulk'
        half = request.POST.get('half', cur_half)
        if half not in {'first', 'second'}:
            error_message = 'Select first or second half.'
        elif not selected_zone:
            error_message = 'Select a valid zone before marking attendance.'
        elif action == 'submit_half':
            if half == 'second':
                _auto_create_horti_second_half_from_first(workers, today, request.user)
            HorticultureAttendanceRecord.objects.filter(
                worker__in=workers,
                date=today,
                half=half,
                is_submitted=False,
            ).update(is_submitted=True, submitted_at=timezone.now())
            messages.success(request, f'{half.title()} half attendance submitted.')
            query = _query_string(zone=selected_zone.id if selected_zone else None)
            return redirect(f'/horticulture/attendance/?{query}' if query else '/horticulture/attendance/')
        elif action == 'mark':
            worker = HorticultureWorker.objects.filter(
                pk=request.POST.get('worker_id'),
                is_active=True,
                area_assignments__area__zone=selected_zone,
                area_assignments__is_active=True,
            ).first()
            status_value = request.POST.get('status', 'present')
            if worker is None:
                error_message = 'Select a valid worker for this zone.'
            elif status_value not in {'present', 'absent', 'late', 'leave'}:
                error_message = 'Select a valid attendance status.'
            else:
                existing = HorticultureAttendanceRecord.objects.filter(worker=worker, date=today, half=half).first()
                if not (existing and existing.is_submitted):
                    record, _created = HorticultureAttendanceRecord.objects.get_or_create(
                        worker=worker,
                        date=today,
                        half=half,
                        defaults={'marked_by': request.user},
                    )
                    record.status = status_value
                    record.marked_by = request.user
                    record.submitted_at = timezone.now()
                    record.save(update_fields=['status', 'marked_by', 'submitted_at'])
                if request.headers.get('HX-Request'):
                    return render(
                        request,
                        'horticulture/mobile/partials_attendance_worker_card.html',
                        {
                            'row': {
                                'worker': worker,
                                'first_att': HorticultureAttendanceRecord.objects.filter(worker=worker, date=today, half='first').first(),
                                'second_att': HorticultureAttendanceRecord.objects.filter(worker=worker, date=today, half='second').first(),
                            },
                            'selected_zone': selected_zone,
                            'cur_half': cur_half,
                            'is_today': is_today,
                            'attn_choices': _horticulture_attendance_choices(),
                        },
                    )
                query = _query_string(zone=selected_zone.id if selected_zone else None)
                return redirect(f'/horticulture/attendance/?{query}' if query else '/horticulture/attendance/')
        else:
            valid_statuses = {'present', 'absent', 'late', 'leave'}
            for worker in workers:
                status_value = request.POST.get(f'worker_{worker.id}', 'present')
                if status_value not in valid_statuses:
                    status_value = 'present'
                HorticultureAttendanceRecord.objects.update_or_create(
                    worker=worker,
                    date=today,
                    half=half,
                    defaults={
                        'status': status_value,
                        'marked_by': request.user,
                        'submitted_at': timezone.now(),
                    },
                )
            messages.success(request, f'{half.title()} half attendance submitted for {len(workers)} workers.')
            query = _query_string(zone=selected_zone.id if selected_zone else None)
            return redirect(f'/horticulture/attendance/?{query}' if query else '/horticulture/attendance/')

    att_map = {
        (record.worker_id, record.half): record
        for record in HorticultureAttendanceRecord.objects.filter(worker__in=workers, date=today)
    }

    worker_rows = [
        {
            'worker': worker,
            'first_att': att_map.get((worker.id, 'first')),
            'second_att': att_map.get((worker.id, 'second')),
        }
        for worker in workers
    ]

    def all_submitted(half):
        return bool(workers) and all(
            att_map.get((worker.id, half)) and att_map[(worker.id, half)].is_submitted
            for worker in workers
        )

    return render(
        request,
        'horticulture/mobile/attendance.html',
        {
            'today': today,
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'workers': workers,
            'worker_rows': worker_rows,
            'present_first': sum(1 for row in worker_rows if row['first_att'] and row['first_att'].status in ['present', 'late']),
            'present_second': sum(1 for row in worker_rows if row['second_att'] and row['second_att'].status in ['present', 'late']),
            'total_count': len(worker_rows),
            'first_submitted': all_submitted('first'),
            'second_submitted': all_submitted('second'),
            'cur_half': cur_half,
            'is_today': is_today,
            'attn_choices': _horticulture_attendance_choices(),
            'error_message': error_message,
            'zone_count': len(zones),
        },
    )


@horticulture_supervisor_required
def horticulture_schedule(request):
    selected_zone, zones, dashboard_payload = _mobile_zone_context(request.user, request.GET.get('zone'))
    selected_area = _selected_area_for_zone(selected_zone, request.GET.get('area'))
    task_types = list(TaskType.objects.filter(is_active=True).order_by('name'))
    area_task_assignments = (
        HorticultureAreaTaskAssignment.objects
        .filter(area=selected_area, date=timezone.localdate(), is_active=True)
        .select_related('task_type', 'assigned_by')
        .order_by('session', 'task_type__name')
    ) if selected_area else []
    assignments = (
        HorticultureDailyAssignment.objects
        .filter(area=selected_area, date=timezone.localdate())
        .select_related('worker', 'task_type')
        .order_by('session', 'worker__name')
    ) if selected_area else []
    for assignment in assignments:
        assignment.photo_before_display_url = image_field_url(request, assignment.photo_before)
        assignment.photo_after_display_url = image_field_url(request, assignment.photo_after)
        assignment.photo_legacy_display_url = image_field_url(request, assignment.photo)
    return render(
        request,
        'horticulture/mobile/schedule.html',
        {
            'today': timezone.localdate(),
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'task_types': task_types,
            'area_task_assignments': area_task_assignments,
            'assignments': assignments,
            'season': dashboard_payload['season'],
            'zone_count': len(zones),
        },
    )


@horticulture_manager_required
def horticulture_manager_zones(request):
    today = timezone.localdate()
    zones = []
    for zone in get_horticulture_zones():
        payload = build_zone_dashboard_payload(zone, today=today)
        area_ids = [area['id'] for area in payload['areas']]
        workers = (
            HorticultureWorker.objects
            .filter(is_active=True, area_assignments__area__zone=zone, area_assignments__is_active=True)
            .distinct()
            .order_by('name')
        )
        zones.append(
            {
                'zone': zone,
                'payload': payload,
                'areas': payload['areas'],
                'workers_count': workers.count(),
                'workers': list(workers),
                'done_today': HorticultureDailyAssignment.objects.filter(
                    area_id__in=area_ids,
                    date=today,
                    status=HorticultureDailyAssignment.Status.DONE,
                ).count(),
                'assigned_today': HorticultureAreaTaskAssignment.objects.filter(area_id__in=area_ids, date=today, is_active=True).count(),
            }
        )
    return render(
        request,
        'horticulture/mobile/manager_zones.html',
        {
            'today': today,
            'zones': zones,
            'is_horti_manager': True,
        },
    )


@horticulture_manager_required
@transaction.atomic
def horticulture_manager_requests(request):
    if request.method == 'POST':
        stock_request = get_object_or_404(
            HorticultureStockRequest.objects.select_for_update().select_related(
                'inventory_request',
                'inventory_request__item',
            ),
            pk=request.POST.get('request_id'),
        )
        action = request.POST.get('action')
        if action == 'approve' and stock_request.status == HorticultureStockRequest.Status.PENDING:
            if stock_request.inventory_request_id:
                from apps.inventory.models import Item, ItemRequest as InvItemRequest

                inv_req = stock_request.inventory_request
                item = inv_req.item
                should_mark_inventory_approved = inv_req.status == InvItemRequest.Status.PENDING
                if inv_req.status == InvItemRequest.Status.PENDING:
                    available_to_reserve = item.available_quantity - item.reserved_quantity
                    if inv_req.quantity_requested > available_to_reserve:
                        messages.error(
                            request,
                            f'Cannot approve: only {available_to_reserve} {item.unit} available for inventory issue.',
                        )
                        return redirect('/horticulture/requests/')

                    Item.objects.filter(pk=item.pk).update(
                        reserved_quantity=models.F('reserved_quantity') + inv_req.quantity_requested
                    )
                    item.refresh_from_db(fields=['available_quantity', 'reserved_quantity'])
                elif inv_req.status != InvItemRequest.Status.APPROVED:
                    messages.error(
                        request,
                        f'Cannot approve: linked inventory request is already {inv_req.status}.',
                    )
                    return redirect('/horticulture/requests/')

                if should_mark_inventory_approved:
                    inv_req.status = InvItemRequest.Status.APPROVED
                    inv_req.approved_by = request.user
                    inv_req.reviewed_at = timezone.now()
                    inv_req.units_remaining = max(item.available_quantity - item.reserved_quantity, 0)
                    inv_req.save(update_fields=['status', 'approved_by', 'reviewed_at', 'units_remaining'])

            stock_request.status = HorticultureStockRequest.Status.APPROVED
            stock_request.save(update_fields=['status'])
            messages.success(request, 'Horticulture request approved and sent to inventory for issue.')
        elif action == 'reject' and stock_request.status == HorticultureStockRequest.Status.PENDING:
            stock_request.status = HorticultureStockRequest.Status.REJECTED
            stock_request.save(update_fields=['status'])
            if stock_request.inventory_request_id:
                inv_req = stock_request.inventory_request
                inv_req.status = 'rejected'
                inv_req.approved_by = request.user
                inv_req.reviewed_at = timezone.now()
                inv_req.rejection_reason = request.POST.get('reason', '').strip()
                inv_req.save(update_fields=['status', 'approved_by', 'reviewed_at', 'rejection_reason'])
            messages.success(request, 'Horticulture request rejected.')
        return redirect('/horticulture/requests/')

    status_filter = (request.GET.get('status') or 'pending').strip().lower()
    if status_filter not in {'all', 'pending', 'approved', 'rejected', 'issued'}:
        status_filter = 'pending'
    requests_qs = (
        HorticultureStockRequest.objects
        .select_related('requested_by', 'area__zone', 'item', 'inventory_request')
        .order_by('-is_urgent', '-created_at')
    )
    if status_filter != 'all':
        requests_qs = requests_qs.filter(status=status_filter)
    paginator = Paginator(requests_qs, 10)
    page_obj = paginator.get_page(request.GET.get('page', 1))
    counts = {
        'pending': HorticultureStockRequest.objects.filter(status='pending').count(),
        'approved': HorticultureStockRequest.objects.filter(status='approved').count(),
        'issued': HorticultureStockRequest.objects.filter(status='issued').count(),
        'rejected': HorticultureStockRequest.objects.filter(status='rejected').count(),
        'all': HorticultureStockRequest.objects.count(),
    }
    return render(
        request,
        'horticulture/mobile/manager_requests.html',
        {
            'requests': page_obj,
            'page_obj': page_obj,
            'status_filter': status_filter,
            'counts': counts,
            'is_horti_manager': True,
        },
    )


@horticulture_manager_required
def horticulture_manager_reports(request):
    today = timezone.localdate()
    start_date = parse_date(request.GET.get('start') or '') or (today - timedelta(days=6))
    end_date = parse_date(request.GET.get('end') or '') or today
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    zone_reports = []
    for zone in get_horticulture_zones():
        area_ids = list(zone.areas.values_list('id', flat=True))
        done = HorticultureDailyAssignment.objects.filter(
            area_id__in=area_ids,
            date__range=(start_date, end_date),
            status=HorticultureDailyAssignment.Status.DONE,
        ).count()
        assigned = HorticultureAreaTaskAssignment.objects.filter(area_id__in=area_ids, date__range=(start_date, end_date), is_active=True).count()
        worker_ids = list(
            HorticultureWorker.objects
            .filter(is_active=True, area_assignments__area__zone=zone, area_assignments__is_active=True)
            .distinct()
            .values_list('id', flat=True)
        )
        attendance = HorticultureAttendanceRecord.objects.filter(worker_id__in=worker_ids, date__range=(start_date, end_date))
        total_halves = attendance.count()
        present_halves = attendance.filter(status__in=['present', 'late']).count()
        request_count = HorticultureStockRequest.objects.filter(area__zone=zone, created_at__date__range=(start_date, end_date)).count()
        zone_reports.append(
            {
                'zone': zone,
                'done': done,
                'assigned': assigned,
                'completion_pct': round((done / (done + assigned)) * 100, 1) if (done + assigned) else 0,
                'attendance_pct': round((present_halves / total_halves) * 100, 1) if total_halves else 0,
                'requests': request_count,
                'workers': len(worker_ids),
                'areas': len(area_ids),
            }
        )

    recent_done = (
        HorticultureDailyAssignment.objects
        .filter(date__range=(start_date, end_date), status=HorticultureDailyAssignment.Status.DONE)
        .select_related('worker', 'area__zone', 'task_type', 'assigned_by')
        .order_by('-date', '-assigned_at')[:12]
    )
    return render(
        request,
        'horticulture/mobile/manager_reports.html',
        {
            'start_date': start_date,
            'end_date': end_date,
            'zone_reports': zone_reports,
            'recent_done': recent_done,
            'is_horti_manager': True,
        },
    )


def _horticulture_usage_issues(user, limit=10):
    from apps.inventory.models import ItemIssue, ItemUsageLog

    usage_logs_qs = ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
    issues = (
        ItemIssue.objects
        .select_related('request__item', 'request__requested_by')
        .prefetch_related(Prefetch('usage_logs', queryset=usage_logs_qs))
        .filter(request__requested_by=user)
        .order_by('-issued_at')[:limit]
    )
    out = []
    for issue in issues:
        total_used = sum((log.quantity_used for log in issue.usage_logs.all()), Decimal('0'))
        remaining = Decimal(issue.issued_quantity) - total_used
        issue.total_consumed = total_used
        issue.remaining_quantity = remaining
        issue.has_remaining = remaining > 0
        issue.consumption_percent = min(100, int((total_used / Decimal(issue.issued_quantity)) * 100)) if issue.issued_quantity else 0
        out.append(issue)
    return out


@horticulture_supervisor_required
def horticulture_stock(request):
    selected_zone, zones, dashboard_payload = _mobile_zone_context(request.user, request.GET.get('zone'))
    selected_area = _selected_area_for_zone(selected_zone, request.GET.get('area'))
    area_stocks = HorticultureAreaStock.objects.filter(area=selected_area).order_by('item_name') if selected_area else []
    return render(
        request,
        'horticulture/mobile/stock.html',
        {
            'today': timezone.localdate(),
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'area_stocks': area_stocks,
            'low_stocks': [stock for stock in area_stocks if stock.is_low],
            'issued_items': _horticulture_usage_issues(request.user),
            'requested': request.GET.get('requested'),
            'zone_count': len(zones),
        },
    )


@horticulture_supervisor_required
def horticulture_stock_request(request):
    from apps.inventory.models import Item, ItemRequest as InvItemRequest
    from apps.inventory.request_permissions import (
        EXCESSIVE_QUANTITY_MESSAGE,
        UNAUTHORIZED_ITEM_REQUEST_MESSAGE,
        filter_requestable_items,
        user_can_request_item,
    )

    selected_zone, zones, dashboard_payload = _mobile_zone_context(request.user, request.GET.get('zone') or request.POST.get('zone'))
    selected_area = _selected_area_for_zone(selected_zone, request.GET.get('area') or request.POST.get('area_id'))
    inv_items = filter_requestable_items(
        Item.objects
        .filter(category__name__in=['Garden & Horticulture Equipment', 'Tools & Equipment', 'Consumables'])
        .select_related('category')
        .order_by('name'),
        request.user,
    )

    if request.method == 'POST':
        inv_item = Item.objects.filter(pk=request.POST.get('inventory_item_id')).first() if request.POST.get('inventory_item_id') else None
        item_name = (request.POST.get('item_name') or (inv_item.name if inv_item else '')).strip()
        if not item_name:
            messages.error(request, 'Item name is required.')
        elif inv_item and not user_can_request_item(request.user, inv_item):
            messages.error(request, UNAUTHORIZED_ITEM_REQUEST_MESSAGE)
        else:
            try:
                qty = int(request.POST.get('quantity') or 1)
            except (TypeError, ValueError):
                qty = 0
            if qty <= 0:
                messages.error(request, 'Quantity must be greater than 0.')
                return render(
                    request,
                    'horticulture/mobile/stock_request.html',
                    {
                        'inv_items': inv_items,
                        'zones': dashboard_payload['zones'],
                        'selected_zone': selected_zone,
                        'selected_area': selected_area,
                        'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
                        'pre_item': request.GET.get('item', ''),
                        'zone_count': len(zones),
                    },
                )
            if inv_item and qty > inv_item.available_quantity:
                messages.error(request, EXCESSIVE_QUANTITY_MESSAGE)
                return render(
                    request,
                    'horticulture/mobile/stock_request.html',
                    {
                        'inv_items': inv_items,
                        'zones': dashboard_payload['zones'],
                        'selected_zone': selected_zone,
                        'selected_area': selected_area,
                        'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
                        'pre_item': request.GET.get('item', ''),
                        'zone_count': len(zones),
                    },
                )
            stock_req = HorticultureStockRequest.objects.create(
                requested_by=request.user,
                area=selected_area,
                item_name=item_name,
                item=inv_item,
                quantity=qty,
                unit=request.POST.get('unit', '').strip(),
                reason=request.POST.get('reason', '').strip(),
                is_urgent=request.POST.get('is_urgent') == 'on',
            )
            if inv_item:
                inv_req = InvItemRequest.objects.create(
                    item=inv_item,
                    requested_by=request.user,
                    quantity_requested=qty,
                    purpose=f"[Horticulture - {selected_area.name if selected_area else 'General'}] {stock_req.reason}",
                    notes=f"Urgent: {'Yes' if stock_req.is_urgent else 'No'}",
                    is_urgent=stock_req.is_urgent,
                )
                stock_req.inventory_request = inv_req
                stock_req.save(update_fields=['inventory_request'])
            query = _query_string(zone=selected_zone.id if selected_zone else None, area=selected_area.id if selected_area else None, requested=1)
            return redirect(f'/horticulture/stock/?{query}')

    return render(
        request,
        'horticulture/mobile/stock_request.html',
        {
            'inv_items': inv_items,
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': stable_horticulture_area_nav_rows(dashboard_payload['areas']),
            'pre_item': request.GET.get('item', ''),
            'zone_count': len(zones),
        },
    )


@horticulture_supervisor_required
def horticulture_log_usage(request, pk):
    from apps.inventory.models import ItemIssue, ItemUsageLog

    if request.method != 'POST':
        return redirect('/horticulture/stock/')
    issue = get_object_or_404(ItemIssue.objects.select_related('request__item'), pk=pk, request__requested_by=request.user)
    raw_qty = (request.POST.get('quantity_used') or '').strip()
    purpose = (request.POST.get('purpose') or '').strip()
    try:
        quantity_used = Decimal(raw_qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        quantity_used = Decimal('0')
    if quantity_used > 0 and purpose:
        with transaction.atomic():
            total_used = ItemUsageLog.objects.filter(issue=issue).aggregate(
                total=Coalesce(Sum('quantity_used'), Value(0), output_field=DecimalField(max_digits=10, decimal_places=2))
            )['total']
            remaining = Decimal(issue.issued_quantity) - total_used
            if quantity_used <= remaining:
                ItemUsageLog.objects.create(issue=issue, quantity_used=quantity_used, purpose=purpose, logged_by=request.user)
    area_id = request.POST.get('area_id')
    zone_id = request.POST.get('zone')
    query = _query_string(zone=zone_id, area=area_id)
    return redirect(f'/horticulture/stock/?{query}' if query else '/horticulture/stock/')


