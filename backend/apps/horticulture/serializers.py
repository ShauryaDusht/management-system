from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.core.image_urls import image_debug_payload, image_field_url

from .models import (
    HorticultureArea,
    HorticultureAreaTaskAssignment,
    HorticultureAttendanceRecord,
    HorticultureDailyAssignment,
    HorticultureAttendance,
    HorticultureRoad,
    HorticultureWorker,
    HorticultureWorkerArea,
    HorticultureZone,
    SeasonSetting,
    TaskLog,
    TaskType,
    WorkerAttendance,
)
from .services import get_supervisor_worker_queryset, get_supervisor_zones

User = get_user_model()


def _request_has_param(request, name):
    params = getattr(request, 'query_params', None) or getattr(request, 'GET', None) or {}
    return bool(params.get(name))


def _assignment_half_for_session(session):
    if session == HorticultureDailyAssignment.Session.AFTERNOON:
        return HorticultureAttendanceRecord.Half.SECOND
    return HorticultureAttendanceRecord.Half.FIRST


def _worker_unavailable_for_assignment(worker, assignment_date, session):
    if not worker or not assignment_date:
        return None
    return (
        HorticultureAttendanceRecord.objects
        .filter(
            worker=worker,
            date=assignment_date,
            half=_assignment_half_for_session(session),
            status__in=[
                HorticultureAttendanceRecord.Status.ABSENT,
                HorticultureAttendanceRecord.Status.LEAVE,
            ],
        )
        .values_list('status', flat=True)
        .first()
    )


class SupervisorZoneOptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    color = serializers.CharField()


class SupervisorTaskStatusSerializer(serializers.Serializer):
    task_type_id = serializers.IntegerField()
    task_type_name = serializers.CharField()
    last_done_date = serializers.DateField(allow_null=True)
    days_since_done = serializers.IntegerField(allow_null=True)
    threshold = serializers.IntegerField()
    is_overdue = serializers.BooleanField()
    is_due_soon = serializers.BooleanField()
    urgency = serializers.CharField()


class SupervisorAreaDashboardSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    area_number = serializers.IntegerField()
    name = serializers.CharField()
    urgency = serializers.CharField()
    overdue_task_count = serializers.IntegerField()
    due_soon_task_count = serializers.IntegerField()
    tasks = SupervisorTaskStatusSerializer(many=True)


class SupervisorDashboardSerializer(serializers.Serializer):
    zone_id = serializers.IntegerField(allow_null=True)
    zone_name = serializers.CharField(allow_blank=True)
    zone_color = serializers.CharField(allow_blank=True)
    season = serializers.CharField()
    zones = SupervisorZoneOptionSerializer(many=True)
    areas = SupervisorAreaDashboardSerializer(many=True)


class AdminZoneStatusSerializer(serializers.Serializer):
    zone_id = serializers.IntegerField()
    zone_name = serializers.CharField()
    zone_color = serializers.CharField()
    supervisor_id = serializers.IntegerField(allow_null=True)
    supervisor_name = serializers.CharField(allow_blank=True)
    tasks_on_track_pct = serializers.IntegerField()
    attendance_submitted_today = serializers.BooleanField()
    attendance_status = serializers.CharField()
    present_count = serializers.IntegerField()
    absent_count = serializers.IntegerField()
    half_day_count = serializers.IntegerField()
    total_workers = serializers.IntegerField()


class AdminOverdueTaskSerializer(serializers.Serializer):
    area_id = serializers.IntegerField()
    area_name = serializers.CharField()
    zone_id = serializers.IntegerField()
    zone_name = serializers.CharField()
    task_type_id = serializers.IntegerField()
    task_type_name = serializers.CharField()
    last_done_date = serializers.DateField(allow_null=True)
    days_since_done = serializers.IntegerField(allow_null=True)
    threshold = serializers.IntegerField()
    days_overdue = serializers.IntegerField()


class AdminTaskStatusCountsSerializer(serializers.Serializer):
    on_track = serializers.IntegerField()
    due_soon = serializers.IntegerField()
    overdue = serializers.IntegerField()
    total = serializers.IntegerField()


class AdminSummarySerializer(serializers.Serializer):
    current_season = serializers.CharField()
    total_areas = serializers.IntegerField()
    total_workers = serializers.IntegerField()
    tasks_due_today = serializers.IntegerField()
    tasks_overdue = serializers.IntegerField()
    task_status_counts = AdminTaskStatusCountsSerializer()
    zones = SupervisorZoneOptionSerializer(many=True)
    zone_status = AdminZoneStatusSerializer(many=True)
    overdue_tasks = AdminOverdueTaskSerializer(many=True)


class AdminZoneTaskTypeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    threshold = serializers.IntegerField()


class AdminZoneDetailSerializer(serializers.Serializer):
    zone_id = serializers.IntegerField()
    zone_name = serializers.CharField()
    zone_color = serializers.CharField()
    supervisor_id = serializers.IntegerField(allow_null=True)
    supervisor_name = serializers.CharField(allow_blank=True)
    season = serializers.CharField()
    task_types = AdminZoneTaskTypeSerializer(many=True)
    areas = SupervisorAreaDashboardSerializer(many=True)


class AdminAttendanceWorkerSerializer(serializers.Serializer):
    worker_id = serializers.IntegerField()
    worker_name = serializers.CharField()
    pay_code = serializers.CharField(allow_blank=True)
    status = serializers.CharField()


class AdminAttendanceSupervisorSerializer(serializers.Serializer):
    supervisor_id = serializers.IntegerField()
    supervisor_name = serializers.CharField()
    pay_code = serializers.CharField(allow_blank=True)
    role = serializers.CharField(allow_blank=True)
    zone_names = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    submitted = serializers.BooleanField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    total_workers = serializers.IntegerField()
    present_count = serializers.IntegerField()
    absent_count = serializers.IntegerField()
    half_day_count = serializers.IntegerField()
    workers = AdminAttendanceWorkerSerializer(many=True)


class AdminAttendanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    supervisors = AdminAttendanceSupervisorSerializer(many=True)


class AdminSupervisorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    supervisor_id = serializers.IntegerField()
    supervisor_name = serializers.CharField()
    full_name = serializers.CharField(allow_blank=True)
    first_name = serializers.CharField(allow_blank=True)
    last_name = serializers.CharField(allow_blank=True)
    email = serializers.EmailField(allow_blank=True)
    username = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    pay_code = serializers.CharField(allow_blank=True)
    role = serializers.CharField()
    is_active = serializers.BooleanField()
    zone_names = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    area_names = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    workers_count = serializers.IntegerField()
    last_login = serializers.DateTimeField(allow_null=True)
    tasks_logged_this_week = serializers.IntegerField()


class AdminSupervisorsSerializer(serializers.Serializer):
    supervisors = AdminSupervisorSerializer(many=True)


class AdminWorkerSerializer(serializers.ModelSerializer):
    area_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    assigned_areas = serializers.SerializerMethodField()
    area_names = serializers.SerializerMethodField()
    zone_names = serializers.SerializerMethodField()
    supervisor_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = HorticultureWorker
        fields = [
            'id',
            'name',
            'phone',
            'pay_code',
            'photo',
            'photo_url',
            'is_active',
            'area_ids',
            'assigned_areas',
            'area_names',
            'zone_names',
            'supervisor_name',
        ]

    def get_assigned_areas(self, obj):
        return [
            {
                'id': link.area_id,
                'name': link.area.name,
                'zone_id': link.area.zone_id,
                'zone_name': link.area.zone.name if link.area.zone else '',
            }
            for link in obj.area_assignments.all()
            if link.is_active and link.area
        ]

    def get_area_names(self, obj):
        return [area['name'] for area in self.get_assigned_areas(obj)]

    def get_zone_names(self, obj):
        names = []
        seen = set()
        for area in self.get_assigned_areas(obj):
            zone_name = area['zone_name']
            if zone_name and zone_name not in seen:
                seen.add(zone_name)
                names.append(zone_name)
        return names

    def get_supervisor_name(self, obj):
        names = []
        seen = set()
        for link in obj.area_assignments.all():
            supervisor = getattr(getattr(link.area, 'zone', None), 'supervisor', None)
            if not supervisor:
                continue
            name = supervisor.get_full_name() or supervisor.username
            if name not in seen:
                seen.add(name)
                names.append(name)
        return ', '.join(names)

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        elif isinstance(data, dict):
            data = dict(data)

        if 'area_ids' in data:
            if hasattr(data, 'getlist'):
                raw = data.getlist('area_ids')
                parsed = []
                for item in raw:
                    if isinstance(item, str) and (',' in item or item.startswith('[')):
                        try:
                            import json
                            loaded = json.loads(item)
                            if isinstance(loaded, list):
                                parsed.extend(loaded)
                            else:
                                parsed.append(loaded)
                        except Exception:
                            parsed.extend([s.strip() for s in item.strip('[]').split(',') if s.strip()])
                    elif item:
                        parsed.append(item)
                data.setlist('area_ids', parsed)
            else:
                raw = data['area_ids']
                if isinstance(raw, str):
                    raw = raw.strip()
                    if raw.startswith('[') and raw.endswith(']'):
                        try:
                            import json
                            raw = json.loads(raw)
                        except Exception:
                            raw = [s.strip() for s in raw[1:-1].split(',') if s.strip()]
                    elif ',' in raw:
                        raw = [s.strip() for s in raw.split(',') if s.strip()]
                    elif raw:
                        raw = [raw]
                    else:
                        raw = []
                elif isinstance(raw, int):
                    raw = [raw]
                elif raw is None:
                    raw = []
                data['area_ids'] = raw

        return super().to_internal_value(data)

    def get_photo_url(self, obj):
        return image_field_url(self.context.get('request'), obj.photo)

    def _apply_area_assignments(self, worker, area_ids):
        if area_ids is None:
            return
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None

        area_ids = [int(x) for x in area_ids if str(x).isdigit()]
        existing_ids = set(HorticultureArea.objects.filter(id__in=area_ids).values_list('id', flat=True))
        missing = sorted(set(area_ids) - existing_ids)
        if missing:
            raise serializers.ValidationError({'area_ids': [f'Invalid area ids: {missing}']})

        new_area_ids = list(dict.fromkeys(area_ids))
        current_area_ids = list(
            HorticultureWorkerArea.objects.filter(worker=worker, is_active=True).values_list('area_id', flat=True)
        )

        added_area_ids = [aid for aid in new_area_ids if aid not in current_area_ids]
        removed_area_ids = [aid for aid in current_area_ids if aid not in new_area_ids]

        # For any newly added areas, if another worker is already assigned, swap areas
        for target_area_id in added_area_ids:
            other_assignments = list(
                HorticultureWorkerArea.objects.filter(
                    area_id=target_area_id,
                    is_active=True,
                ).exclude(worker=worker).select_related('worker')
            )
            for other_assignment in other_assignments:
                other_worker = other_assignment.worker
                if removed_area_ids:
                    swap_area_id = removed_area_ids.pop(0)
                elif current_area_ids:
                    swap_area_id = current_area_ids[0]
                    if swap_area_id in new_area_ids:
                        new_area_ids.remove(swap_area_id)
                else:
                    swap_area_id = None

                if swap_area_id:
                    swapped_link, created = HorticultureWorkerArea.objects.get_or_create(
                        worker=other_worker,
                        area_id=swap_area_id,
                        defaults={'assigned_by': user, 'is_active': True},
                    )
                    if not created and not swapped_link.is_active:
                        swapped_link.is_active = True
                        swapped_link.assigned_by = user
                        swapped_link.save(update_fields=['is_active', 'assigned_by', 'assigned_at'])
                # Deactivate other_worker's assignment to target_area_id
                other_assignment.is_active = False
                other_assignment.save(update_fields=['is_active'])

        # Deactivate any remaining removed areas for worker
        if removed_area_ids:
            HorticultureWorkerArea.objects.filter(
                worker=worker,
                area_id__in=removed_area_ids,
            ).update(is_active=False)

        # Deactivate any areas worker currently has that are not in new_area_ids
        HorticultureWorkerArea.objects.filter(worker=worker).exclude(area_id__in=new_area_ids).update(is_active=False)

        # Ensure all new_area_ids are active for worker
        for area_id in new_area_ids:
            link, created = HorticultureWorkerArea.objects.get_or_create(
                worker=worker,
                area_id=area_id,
                defaults={'assigned_by': user, 'is_active': True},
            )
            if not created and not link.is_active:
                link.is_active = True
                link.assigned_by = user
                link.save(update_fields=['is_active', 'assigned_by', 'assigned_at'])

    def create(self, validated_data):
        area_ids = validated_data.pop('area_ids', [])
        worker = HorticultureWorker.objects.create(**validated_data)
        self._apply_area_assignments(worker, area_ids)
        return worker

    def update(self, instance, validated_data):
        area_ids = validated_data.pop('area_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        self._apply_area_assignments(instance, area_ids)
        return instance


class AdminWorkerReportDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    status = serializers.CharField()
    supervisor_name = serializers.CharField(allow_blank=True)


class AdminWorkerReportTaskSerializer(serializers.Serializer):
    date = serializers.DateField()
    area_name = serializers.CharField(allow_blank=True)
    task_name = serializers.CharField(allow_blank=True)
    session = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    assigned_at = serializers.DateTimeField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    supervisor_name = serializers.CharField(allow_blank=True)
    remarks = serializers.CharField(allow_blank=True)
    photo_submitted = serializers.BooleanField()


class AdminWorkerReportSerializer(serializers.Serializer):
    worker = serializers.DictField()
    month = serializers.IntegerField()
    year = serializers.IntegerField()
    days_present = serializers.IntegerField()
    days_absent = serializers.IntegerField()
    half_days = serializers.IntegerField()
    marked_days = serializers.IntegerField()
    attendance_pct = serializers.FloatField()
    tasks_assigned = serializers.IntegerField()
    tasks_completed = serializers.IntegerField()
    tasks_pending = serializers.IntegerField()
    task_completion_pct = serializers.FloatField()
    daily_breakdown = AdminWorkerReportDaySerializer(many=True)
    task_details = AdminWorkerReportTaskSerializer(many=True)


class AdminHorticultureAreaSerializer(serializers.ModelSerializer):
    zone_id = serializers.PrimaryKeyRelatedField(source='zone', queryset=HorticultureZone.objects.all())
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    supervisor_name = serializers.SerializerMethodField()

    class Meta:
        model = HorticultureArea
        fields = ['id', 'area_number', 'name', 'zone_id', 'zone_name', 'supervisor_name']

    def get_supervisor_name(self, obj):
        supervisor = obj.zone.supervisor if obj.zone_id else None
        if not supervisor:
            return ''
        return supervisor.get_full_name() or supervisor.username


class AdminTaskTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskType
        fields = [
            'id',
            'name',
            'threshold_days_default',
            'threshold_days_summer',
            'threshold_days_winter',
            'threshold_days_rainy',
            'is_active',
        ]


class AdminAttendanceRecordSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.name', read_only=True)
    marked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HorticultureAttendanceRecord
        fields = ['id', 'worker', 'worker_name', 'date', 'half', 'status', 'marked_by', 'marked_by_name', 'submitted_at', 'is_submitted']
        read_only_fields = ['marked_by', 'marked_by_name', 'submitted_at']

    def get_marked_by_name(self, obj):
        if obj.marked_by:
            return obj.marked_by.get_full_name() or obj.marked_by.username
        return ''


class AdminDailyAssignmentSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.name', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    task_type_name = serializers.CharField(source='task_type.name', read_only=True)
    assigned_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    photo_before_url = serializers.SerializerMethodField()
    photo_after_url = serializers.SerializerMethodField()

    class Meta:
        model = HorticultureDailyAssignment
        fields = [
            'id',
            'worker',
            'worker_name',
            'area',
            'area_name',
            'date',
            'session',
            'task_type',
            'task_type_name',
            'assigned_by',
            'assigned_by_name',
            'assigned_at',
            'status',
            'started_at',
            'completed_by',
            'completed_by_name',
            'completed_at',
            'photo_before',
            'photo_before_url',
            'photo_before_uploaded_at',
            'photo',
            'photo_url',
            'photo_uploaded_at',
            'photo_after',
            'photo_after_url',
            'photo_after_uploaded_at',
            'note',
        ]
        read_only_fields = ['assigned_by', 'assigned_by_name', 'assigned_at', 'started_at', 'completed_by', 'completed_by_name', 'completed_at', 'photo_uploaded_at', 'photo_before_uploaded_at', 'photo_after_uploaded_at']

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return ''

    def get_completed_by_name(self, obj):
        if obj.completed_by:
            return obj.completed_by.get_full_name() or obj.completed_by.username
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return ''

    def get_photo_url(self, obj):
        return self._file_url(obj.photo_after or obj.photo)

    def get_photo_before_url(self, obj):
        return self._file_url(obj.photo_before)

    def get_photo_after_url(self, obj):
        return self._file_url(obj.photo_after or obj.photo)

    def _file_url(self, file_field):
        return image_field_url(self.context.get('request'), file_field)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and _request_has_param(request, 'debugImages'):
            data['debugImage'] = {
                'before': image_debug_payload(request, instance.photo_before),
                'legacy': image_debug_payload(request, instance.photo),
                'after': image_debug_payload(request, instance.photo_after),
            }
        return data

    def validate(self, attrs):
        worker = attrs.get('worker') or getattr(self.instance, 'worker', None)
        area = attrs.get('area') or getattr(self.instance, 'area', None)
        task_type = attrs.get('task_type') or getattr(self.instance, 'task_type', None)
        assignment_date = attrs.get('date') or getattr(self.instance, 'date', None)
        session = attrs.get('session') or getattr(self.instance, 'session', HorticultureDailyAssignment.Session.MORNING)
        if worker and area and not HorticultureWorkerArea.objects.filter(
            worker=worker,
            area__zone=area.zone,
            is_active=True,
        ).exists():
            raise serializers.ValidationError({'area': 'Selected worker is not assigned to this zone.'})
        unavailable_status = _worker_unavailable_for_assignment(worker, assignment_date, session)
        if unavailable_status:
            label = 'on leave' if unavailable_status == HorticultureAttendanceRecord.Status.LEAVE else 'absent'
            raise serializers.ValidationError({'worker': f'Selected worker is {label} for this assignment session.'})
        if task_type and not task_type.is_active:
            raise serializers.ValidationError({'task_type': 'Selected task is inactive.'})
        return attrs

    def create(self, validated_data):
        return HorticultureDailyAssignment.objects.create(**validated_data)


class AdminAreaTaskAssignmentSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True)
    zone_name = serializers.CharField(source='area.zone.name', read_only=True)
    task_type_name = serializers.CharField(source='task_type.name', read_only=True)
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HorticultureAreaTaskAssignment
        fields = [
            'id',
            'area',
            'area_name',
            'zone_name',
            'date',
            'session',
            'task_type',
            'task_type_name',
            'assigned_by',
            'assigned_by_name',
            'assigned_at',
            'note',
            'is_active',
        ]
        read_only_fields = ['assigned_by', 'assigned_by_name', 'assigned_at']

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return ''

    def validate(self, attrs):
        task_type = attrs.get('task_type') or getattr(self.instance, 'task_type', None)
        if task_type and not task_type.is_active:
            raise serializers.ValidationError({'task_type': 'Selected task is inactive.'})
        return attrs

    def create(self, validated_data):
        assignment, _created = HorticultureAreaTaskAssignment.objects.update_or_create(
            area=validated_data['area'],
            task_type=validated_data['task_type'],
            date=validated_data['date'],
            session=validated_data.get('session', HorticultureAreaTaskAssignment.Session.ANY),
            defaults={
                'note': validated_data.get('note', ''),
                'is_active': validated_data.get('is_active', True),
                'assigned_by': validated_data.get('assigned_by'),
            },
        )
        return assignment


class ManagerSeasonStatusSerializer(serializers.Serializer):
    season = serializers.ChoiceField(choices=SeasonSetting.Season.choices)
    updated_by_name = serializers.CharField(allow_blank=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class ManagerSeasonUpdateSerializer(serializers.Serializer):
    season = serializers.ChoiceField(choices=SeasonSetting.Season.choices)


class ManagerWeeklyTaskCountSerializer(serializers.Serializer):
    task_type_id = serializers.IntegerField()
    task_type_name = serializers.CharField()
    completed_count = serializers.IntegerField()


class ManagerCriticalTaskSerializer(serializers.Serializer):
    task_type_id = serializers.IntegerField()
    task_type_name = serializers.CharField()
    last_done_date = serializers.DateField(allow_null=True)
    days_since_done = serializers.IntegerField(allow_null=True)
    threshold = serializers.IntegerField()
    days_overdue = serializers.IntegerField()


class ManagerCriticalAreaSerializer(serializers.Serializer):
    area_id = serializers.IntegerField()
    area_name = serializers.CharField()
    critical_tasks = ManagerCriticalTaskSerializer(many=True)


class ManagerWeeklyZoneSerializer(serializers.Serializer):
    zone_id = serializers.IntegerField()
    zone_name = serializers.CharField()
    zone_color = serializers.CharField()
    supervisor_id = serializers.IntegerField(allow_null=True)
    supervisor_name = serializers.CharField(allow_blank=True)
    tasks_completed_total = serializers.IntegerField()
    task_totals = ManagerWeeklyTaskCountSerializer(many=True)
    attendance_days_submitted = serializers.IntegerField()
    attendance_expected_days = serializers.IntegerField()
    attendance_compliance_pct = serializers.IntegerField()
    critical_overdue_count = serializers.IntegerField()
    critical_areas = ManagerCriticalAreaSerializer(many=True)


class ManagerWeeklyReportRowSerializer(serializers.Serializer):
    zone_name = serializers.CharField()
    area_name = serializers.CharField()
    task_name = serializers.CharField()
    last_done_date = serializers.DateField(allow_null=True)
    days_overdue = serializers.IntegerField()


class ManagerWeeklySummarySerializer(serializers.Serializer):
    week_start = serializers.DateField()
    week_end = serializers.DateField()
    season_setting = ManagerSeasonStatusSerializer()
    zones = ManagerWeeklyZoneSerializer(many=True)
    report_rows = ManagerWeeklyReportRowSerializer(many=True)


class SupervisorWorkerSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'phone', 'pay_code']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class SupervisorTaskLogSerializer(serializers.ModelSerializer):
    zone_id = serializers.PrimaryKeyRelatedField(
        source='zone',
        queryset=HorticultureZone.objects.all(),
    )
    area_id = serializers.PrimaryKeyRelatedField(
        source='area',
        queryset=HorticultureArea.objects.select_related('zone').all(),
        required=False,
        allow_null=True,
    )
    road_id = serializers.PrimaryKeyRelatedField(
        source='road',
        queryset=HorticultureRoad.objects.select_related('zone').all(),
        required=False,
        allow_null=True,
    )
    task_type_id = serializers.PrimaryKeyRelatedField(
        source='task_type',
        queryset=TaskType.objects.all(),
    )
    task_type_name = serializers.CharField(source='task_type.name', read_only=True)

    class Meta:
        model = TaskLog
        fields = [
            'id',
            'zone_id',
            'area_id',
            'road_id',
            'task_type_id',
            'task_type_name',
            'done_date',
            'notes',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'task_type_name']

    def validate_done_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('Done date cannot be in the future.')
        return value

    def validate(self, attrs):
        request = self.context['request']
        supervisor = request.user
        zone = attrs['zone']
        area = attrs.get('area')
        road = attrs.get('road')
        task_type = attrs['task_type']

        if not get_supervisor_zones(supervisor).filter(pk=zone.pk).exists():
            raise serializers.ValidationError({'zone_id': 'This zone is not assigned to the current supervisor.'})

        if area and road:
            raise serializers.ValidationError({'road_id': 'Select either an area or a road, not both.'})

        if area and area.zone_id != zone.id:
            raise serializers.ValidationError({'area_id': 'Selected area must belong to the selected zone.'})

        if road and road.zone_id != zone.id:
            raise serializers.ValidationError({'road_id': 'Selected road must belong to the selected zone.'})

        if not task_type.is_active:
            raise serializers.ValidationError({'task_type_id': 'Selected task type is inactive.'})

        return attrs

    def create(self, validated_data):
        task_log = TaskLog(done_by=self.context['request'].user, **validated_data)
        task_log.full_clean()
        task_log.save()
        return task_log


class SupervisorAttendanceWorkerInputSerializer(serializers.Serializer):
    worker_id = serializers.IntegerField(min_value=1)
    status = serializers.ChoiceField(choices=WorkerAttendance.Status.choices)


class SupervisorAttendanceWorkerSerializer(serializers.ModelSerializer):
    worker_id = serializers.IntegerField(source='worker.id')
    worker_name = serializers.SerializerMethodField()
    pay_code = serializers.CharField(source='worker.pay_code', default='', read_only=True)

    class Meta:
        model = WorkerAttendance
        fields = ['worker_id', 'worker_name', 'pay_code', 'status']

    def get_worker_name(self, obj):
        return obj.worker.get_full_name() or obj.worker.username


class SupervisorAttendanceSerializer(serializers.ModelSerializer):
    workers = SupervisorAttendanceWorkerSerializer(
        source='worker_attendances',
        many=True,
        read_only=True,
    )

    class Meta:
        model = HorticultureAttendance
        fields = ['id', 'date', 'submitted_at', 'workers']


class SupervisorAttendanceCreateSerializer(serializers.Serializer):
    date = serializers.DateField()
    workers = SupervisorAttendanceWorkerInputSerializer(many=True, allow_empty=False)

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('Attendance date cannot be in the future.')
        return value

    def validate(self, attrs):
        supervisor = self.context['request'].user
        date = attrs['date']
        workers = attrs['workers']

        if HorticultureAttendance.objects.filter(supervisor=supervisor, date=date).exists():
            raise serializers.ValidationError({'date': 'Attendance has already been submitted for this date.'})

        worker_map = {
            worker.id: worker
            for worker in get_supervisor_worker_queryset(supervisor)
        }
        if not worker_map:
            raise serializers.ValidationError({'workers': 'No horticulture workers are assigned to this supervisor.'})

        seen_ids = set()
        invalid_ids = []
        duplicate_ids = []
        resolved_workers = []

        for item in workers:
            worker_id = item['worker_id']
            if worker_id in seen_ids:
                duplicate_ids.append(worker_id)
                continue
            seen_ids.add(worker_id)

            worker = worker_map.get(worker_id)
            if worker is None:
                invalid_ids.append(worker_id)
                continue

            resolved_workers.append(
                {
                    'worker': worker,
                    'status': item['status'],
                }
            )

        errors = {}
        if duplicate_ids:
            errors['workers'] = [f'Duplicate worker ids are not allowed: {sorted(set(duplicate_ids))}.']
        if invalid_ids:
            errors.setdefault('workers', [])
            errors['workers'].append(
                f'Workers are outside the supervisor roster: {sorted(set(invalid_ids))}.'
            )
        if not resolved_workers:
            errors.setdefault('workers', [])
            errors['workers'].append('At least one valid worker attendance entry is required.')

        if errors:
            raise serializers.ValidationError(errors)

        attrs['resolved_workers'] = resolved_workers
        return attrs

    def create(self, validated_data):
        supervisor = self.context['request'].user
        resolved_workers = validated_data.pop('resolved_workers', [])

        with transaction.atomic():
            attendance = HorticultureAttendance.objects.create(
                supervisor=supervisor,
                date=validated_data['date'],
            )
            WorkerAttendance.objects.bulk_create(
                [
                    WorkerAttendance(
                        attendance=attendance,
                        worker=item['worker'],
                        status=item['status'],
                    )
                    for item in resolved_workers
                ]
            )

        return attendance