import functools
from datetime import timedelta
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsSupervisor

from .models import HorticultureAttendance, HorticultureZone, SeasonSetting, TaskLog, TaskType, WorkerAttendance
from .serializers import (
    AdminAttendanceSerializer,
    AdminSummarySerializer,
    AdminSupervisorsSerializer,
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
    get_supervisor_worker_queryset,
    get_task_threshold,
    get_zone_choices_payload,
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


def _attendance_for_date(supervisor, date):
    return (
        HorticultureAttendance.objects.filter(supervisor=supervisor, date=date)
        .prefetch_related('worker_attendances__worker')
        .first()
    )


def _query_string(**params):
    clean = {key: value for key, value in params.items() if value not in (None, '', [])}
    return urlencode(clean)


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
        'Zone Purple': 3,
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
        team_map[supervisor.id] = list(get_supervisor_worker_queryset(supervisor))
    return team_map


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
                'supervisor_id': supervisor.id,
                'supervisor_name': _display_name(supervisor),
                'zone_names': zone_map.get(supervisor.id, []),
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


class ManagerSeasonAPIView(APIView):
    permission_classes = [IsHorticultureManager]

    def patch(self, request):
        serializer = ManagerSeasonUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        season_setting = get_current_season_setting()
        if season_setting is None:
            season_setting = SeasonSetting(updated_by=request.user)

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


@login_required
def horticulture_root(request):
    return redirect('/horticulture/dashboard/')


@login_required
def horticulture_dashboard(request):
    if not request.user.is_active:
        return redirect('/portal/login/')

    if request.user.role in ['admin', 'horticulture_manager']:
        return render(request, 'horticulture/dashboard.html', {})

    if request.user.role != 'supervisor':
        return HttpResponseForbidden()

    selected_zone, zones, dashboard_payload = _mobile_zone_context(
        request.user,
        request.GET.get('zone'),
    )
    selected_area = _selected_area_for_zone(selected_zone)

    return render(
        request,
        'horticulture/mobile/dashboard.html',
        {
            'today': timezone.localdate(),
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': dashboard_payload['areas'],
            'season': dashboard_payload['season'],
            'zone_count': len(zones),
        },
    )


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

    if request.method == 'POST':
        if selected_zone is None:
            error_message = 'No horticulture zone is assigned to this supervisor.'
        elif selected_area is None:
            error_message = 'Select a valid area before marking a task.'
        else:
            serializer = SupervisorTaskLogSerializer(
                data={
                    'zone_id': selected_zone.id,
                    'area_id': selected_area.id,
                    'task_type_id': request.POST.get('task_type_id'),
                    'done_date': timezone.localdate(),
                    'notes': '',
                },
                context={'request': request},
            )
            if serializer.is_valid():
                task_log = serializer.save()
                messages.success(
                    request,
                    f'{task_log.task_type.name} marked done for {selected_area.name}.',
                )
                query = _query_string(zone=selected_zone.id, area=selected_area.id)
                return redirect(f'/horticulture/mark-task/?{query}')
            error_message = _flatten_errors(serializer.errors)

    selected_area_payload = None
    for area in dashboard_payload['areas']:
        if selected_area and area['id'] == selected_area.id:
            selected_area_payload = area
            break

    return render(
        request,
        'horticulture/mobile/mark_task.html',
        {
            'today': timezone.localdate(),
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'areas': dashboard_payload['areas'],
            'task_rows': selected_area_payload['tasks'] if selected_area_payload else [],
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
    selected_area = _selected_area_for_zone(selected_zone)
    workers = list(get_supervisor_worker_queryset(request.user))
    today_attendance = _attendance_for_date(request.user, today)
    error_message = ''

    if request.method == 'POST':
        if today_attendance is not None:
            error_message = 'Attendance for today has already been submitted.'
        else:
            worker_rows = [
                {
                    'worker_id': worker.id,
                    'status': request.POST.get(
                        f'worker_{worker.id}',
                        WorkerAttendance.Status.PRESENT,
                    ),
                }
                for worker in workers
            ]
            serializer = SupervisorAttendanceCreateSerializer(
                data={
                    'date': today,
                    'workers': worker_rows,
                },
                context={'request': request},
            )
            if serializer.is_valid():
                serializer.save()
                messages.success(
                    request,
                    f"Today's attendance submitted for {len(workers)} workers.",
                )
                query = _query_string(zone=selected_zone.id if selected_zone else None)
                return redirect(f'/horticulture/attendance/?{query}' if query else '/horticulture/attendance/')
            error_message = _flatten_errors(serializer.errors)

    submitted_entries = {}
    if today_attendance is not None:
        submitted_entries = {
            entry.worker_id: entry
            for entry in today_attendance.worker_attendances.all()
        }

    selected_statuses = {}
    for worker in workers:
        if today_attendance is not None and worker.id in submitted_entries:
            selected_statuses[worker.id] = submitted_entries[worker.id].status
        elif request.method == 'POST':
            selected_statuses[worker.id] = request.POST.get(
                f'worker_{worker.id}',
                WorkerAttendance.Status.PRESENT,
            )
        else:
            selected_statuses[worker.id] = WorkerAttendance.Status.PRESENT

    worker_rows = [
        {
            'worker': worker,
            'selected_status': selected_statuses[worker.id],
            'submitted_entry': submitted_entries.get(worker.id),
        }
        for worker in workers
    ]

    return render(
        request,
        'horticulture/mobile/attendance.html',
        {
            'today': today,
            'zones': dashboard_payload['zones'],
            'selected_zone': selected_zone,
            'selected_area': selected_area,
            'workers': workers,
            'worker_rows': worker_rows,
            'today_attendance': today_attendance,
            'submitted_entries': submitted_entries,
            'error_message': error_message,
            'zone_count': len(zones),
        },
    )
