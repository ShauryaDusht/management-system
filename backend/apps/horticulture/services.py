from django.contrib.auth import get_user_model
from django.db.models import Case, IntegerField, When
from django.utils import timezone
from django.utils.text import slugify

from apps.horticulture.management.commands.seed_horticulture import WORKER_TEAMS

from .models import HorticultureZone, SeasonSetting, TaskLog, TaskType

User = get_user_model()
VISIBLE_HORTICULTURE_ZONE_NAMES = {'Zone Red', 'Zone Blue', 'Zone Black'}


def _visible_zone_queryset():
    return HorticultureZone.objects.filter(name__in=VISIBLE_HORTICULTURE_ZONE_NAMES)


def build_seed_worker_username(full_name, pay_code):
    """
    Keep worker lookup aligned with the seeded horticulture roster.
    """
    base = slugify(full_name).replace('-', '.')
    if not base:
        base = 'horti.worker'
    return f'{base}.{pay_code}'


def get_supervisor_zones(supervisor):
    return _visible_zone_queryset().filter(supervisor=supervisor).order_by('name', 'id')


def get_horticulture_zones():
    return (
        _visible_zone_queryset()
        .select_related('supervisor')
        .prefetch_related('areas')
        .order_by('name', 'id')
    )


def get_horticulture_supervisors():
    supervisor_ids = (
        _visible_zone_queryset()
        .exclude(supervisor__isnull=True)
        .values_list('supervisor_id', flat=True)
        .distinct()
    )
    return User.objects.filter(id__in=supervisor_ids, is_active=True).order_by(
        'first_name',
        'last_name',
        'username',
    )


def get_selected_supervisor_zone(supervisor, zone_id=None):
    zones = get_supervisor_zones(supervisor)
    if zone_id:
        selected = zones.filter(pk=zone_id).first()
        if selected:
            return selected, zones
    return zones.first(), zones


def get_supervisor_worker_queryset(supervisor):
    specs = WORKER_TEAMS.get(getattr(supervisor, 'username', ''), [])
    if not specs:
        return User.objects.none()

    usernames = [
        build_seed_worker_username(full_name, pay_code)
        for full_name, pay_code, _phone in specs
    ]
    ordering = [
        When(username=username, then=index)
        for index, username in enumerate(usernames)
    ]
    queryset = (
        User.objects.filter(
            role=User.Role.CARETAKER,
            is_active=True,
            username__in=usernames,
        )
        .annotate(
            _team_order=Case(
                *ordering,
                default=len(usernames),
                output_field=IntegerField(),
            )
        )
        .order_by('_team_order', 'first_name', 'last_name', 'username')
    )
    if not queryset.exists():
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"get_supervisor_worker_queryset: empty result for supervisor {supervisor.username!r}. Check WORKER_TEAMS mapping in seed data.")
    return queryset


def _get_default_season_updated_by():
    return (
        User.objects.filter(
            is_active=True,
            role__in=[User.Role.ADMIN, User.Role.HORTICULTURE_MANAGER],
        )
        .order_by('id')
        .first()
        or User.objects.filter(is_active=True).order_by('id').first()
        or User.objects.order_by('id').first()
    )


def get_current_season():
    season_setting = get_current_season_setting()
    return season_setting.season if season_setting is not None else SeasonSetting.Season.SUMMER


def get_current_season_setting():
    default_user = _get_default_season_updated_by()
    if default_user is None:
        return None
    season_setting, _created = SeasonSetting.objects.select_related('updated_by').get_or_create(
        pk=1,
        defaults={
            'season': SeasonSetting.Season.SUMMER,
            'updated_by': default_user,
        },
    )
    return season_setting


def get_task_threshold(task_type, season=None):
    season = season or get_current_season()
    season_field_map = {
        SeasonSetting.Season.SUMMER: 'threshold_days_summer',
        SeasonSetting.Season.WINTER: 'threshold_days_winter',
        SeasonSetting.Season.RAINY: 'threshold_days_rainy',
    }
    season_field = season_field_map.get(season)
    season_value = getattr(task_type, season_field, None) if season_field else None
    return season_value or task_type.threshold_days_default


def get_zone_choices_payload(zones):
    return [
        {
            'id': zone.id,
            'name': zone.name,
            'color': zone.color_code,
        }
        for zone in zones
    ]


def _latest_area_task_logs(zone):
    latest = {}
    if zone is None:
        return latest

    qs = (
        TaskLog.objects.filter(zone=zone, area__isnull=False)
        .select_related('area', 'task_type')
        .order_by('area_id', 'task_type_id', '-done_date', '-created_at')
    )
    for log in qs:
        latest.setdefault((log.area_id, log.task_type_id), log)
    return latest


def _task_urgency(days_since_done, threshold):
    if days_since_done is None:
        return 'overdue'
    if days_since_done > threshold:
        return 'overdue'
    if (threshold - days_since_done) <= 3:
        return 'due_soon'
    return 'ok'


def build_zone_dashboard_payload(zone, today=None):
    today = today or timezone.localdate()
    season = get_current_season()
    zone_choices = []
    if zone is None:
        return {
            'zone_id': None,
            'zone_name': '',
            'zone_color': '',
            'season': season,
            'zones': zone_choices,
            'areas': [],
        }

    task_types = list(TaskType.objects.filter(is_active=True).order_by('name'))
    latest_logs = _latest_area_task_logs(zone)
    areas = []

    for area in zone.areas.all().order_by('area_number'):
        tasks = []
        overdue_count = 0
        due_soon_count = 0

        for task_type in task_types:
            latest_log = latest_logs.get((area.id, task_type.id))
            threshold = get_task_threshold(task_type, season=season)
            days_since_done = None
            last_done_date = None
            if latest_log:
                last_done_date = latest_log.done_date
                days_since_done = (today - latest_log.done_date).days

            urgency = _task_urgency(days_since_done, threshold)
            is_overdue = urgency == 'overdue'
            is_due_soon = urgency == 'due_soon'

            if is_overdue:
                overdue_count += 1
            elif is_due_soon:
                due_soon_count += 1

            tasks.append(
                {
                    'task_type_id': task_type.id,
                    'task_type_name': task_type.name,
                    'last_done_date': last_done_date,
                    'days_since_done': days_since_done,
                    'threshold': threshold,
                    'is_overdue': is_overdue,
                    'is_due_soon': is_due_soon,
                    'urgency': urgency,
                    'urgency_rank': 0 if is_overdue else 1 if is_due_soon else 2,
                    'sort_days': 10**9 if days_since_done is None else days_since_done,
                }
            )

        tasks.sort(
            key=lambda item: (
                item['urgency_rank'],
                -item['sort_days'],
                item['task_type_name'],
            )
        )

        area_urgency = 'overdue' if overdue_count else 'due_soon' if due_soon_count else 'ok'
        areas.append(
            {
                'id': area.id,
                'area_number': area.area_number,
                'name': area.name,
                'area_sqm': area.area_sqm,
                'urgency': area_urgency,
                'urgency_rank': 0 if area_urgency == 'overdue' else 1 if area_urgency == 'due_soon' else 2,
                'overdue_task_count': overdue_count,
                'due_soon_task_count': due_soon_count,
                'tasks': tasks,
            }
        )

    areas.sort(
        key=lambda item: (
            item['urgency_rank'],
            -item['overdue_task_count'],
            -item['due_soon_task_count'],
            item['area_number'],
            item['name'],
        )
    )

    return {
        'zone_id': zone.id,
        'zone_name': zone.name,
        'zone_color': zone.color_code,
        'season': season,
        'zones': zone_choices,
        'areas': areas,
    }
