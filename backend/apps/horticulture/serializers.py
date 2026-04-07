from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import (
    HorticultureArea,
    HorticultureAttendance,
    HorticultureRoad,
    HorticultureZone,
    SeasonSetting,
    TaskLog,
    TaskType,
    WorkerAttendance,
)
from .services import get_supervisor_worker_queryset, get_supervisor_zones

User = get_user_model()


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
    area_sqm = serializers.DecimalField(max_digits=12, decimal_places=2)
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
    supervisor_id = serializers.IntegerField()
    supervisor_name = serializers.CharField()
    zone_names = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    workers_count = serializers.IntegerField()
    last_login = serializers.DateTimeField(allow_null=True)
    tasks_logged_this_week = serializers.IntegerField()


class AdminSupervisorsSerializer(serializers.Serializer):
    supervisors = AdminSupervisorSerializer(many=True)


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
