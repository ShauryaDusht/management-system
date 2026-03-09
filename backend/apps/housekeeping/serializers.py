from rest_framework import serializers

from .models import (
    HKAlert,
    HKArea,
    HKDailyRecord,
    HKScheduleTemplate,
    HKStockRequest,
    HKWorkerSelectionRequest,
    HKWorker,
)


class HKAreaSerializer(serializers.ModelSerializer):
    worker_count = serializers.SerializerMethodField()
    caretakers = serializers.SerializerMethodField()
    # stable integer IDs for the frontend to key area mapping on.
    caretaker_ids = serializers.SerializerMethodField()

    class Meta:
        model = HKArea
        fields = ['id', 'name', 'area_type', 'is_active', 'worker_count', 'caretakers', 'caretaker_ids']

    def get_worker_count(self, obj):
        if hasattr(obj, '_worker_count_cache'):
            return obj._worker_count_cache
        return obj.workers.filter(is_active=True).count()

    def get_caretakers(self, obj):
        # reads from prefetch cache; no per-area query.
        return [
            link.user.get_full_name() or link.user.username
            for link in obj.assigned_users.all()
        ]

    def get_caretaker_ids(self, obj):
        return [link.user_id for link in obj.assigned_users.all()]


class HKWorkerSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    supervisor_name = serializers.SerializerMethodField()

    class Meta:
        model = HKWorker
        fields = [
            'id',
            'name',
            'phone',
            'punching_no',
            'worker_type',
            'shift',
            'area',
            'area_name',
            'supervisor',
            'supervisor_name',
            'is_active',
            'is_reliever',
        ]

    def get_supervisor_name(self, obj):
        if obj.supervisor:
            return obj.supervisor.get_full_name() or obj.supervisor.username
        return ''

    def validate_supervisor(self, value):
        if value and value.role not in ['supervisor', 'caretaker']:
            raise serializers.ValidationError(
                'Supervisor must have role "supervisor" or "caretaker".'
            )
        return value


class HKDailyRecordSerializer(serializers.ModelSerializer):
    task_name = serializers.CharField(source='schedule.task_name', read_only=True)
    worker_tag = serializers.CharField(source='schedule.worker_tag', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    assigned_worker_name = serializers.CharField(source='assigned_worker.name', read_only=True, default='')
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HKDailyRecord
        fields = [
            'id',
            'area',
            'area_name',
            'date',
            'status',
            'task_name',
            'worker_tag',
            'assigned_worker',
            'assigned_worker_name',
            'assigned_by_name',
            'assigned_at',
            'started_at',
            'completed_at',
            'note',
        ]

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return ''


class HKScheduleTemplateSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True)

    class Meta:
        model = HKScheduleTemplate
        fields = [
            'id',
            'area',
            'area_name',
            'order',
            'start_time',
            'end_time',
            'task_name',
            'worker_tag',
            'requires_photo',
            'frequency',
            'is_active',
        ]


class HKStockRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    area_name = serializers.CharField(source='area.name', read_only=True, default='')

    class Meta:
        model = HKStockRequest
        fields = [
            'id',
            'requested_by',
            'requested_by_name',
            'area',
            'area_name',
            'item_name',
            'quantity',
            'unit',
            'reason',
            'is_urgent',
            'status',
            'created_at',
        ]

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username


class HKStockRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = HKStockRequest
        fields = ['status']


class HKAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = HKAlert
        fields = ['id', 'title', 'message', 'priority', 'is_active', 'created_at', 'expires_at']


class HKWorkerSelectionRequestSerializer(serializers.ModelSerializer):
    source_area_name = serializers.CharField(source='source_area.name', read_only=True, default='')
    target_area_name = serializers.CharField(source='target_area.name', read_only=True, default='')
    target_supervisor_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    worker_count = serializers.SerializerMethodField()
    workers_preview = serializers.SerializerMethodField()

    class Meta:
        model = HKWorkerSelectionRequest
        fields = [
            'id',
            'selection_type',
            'section_filter',
            'target_group',
            'source_area',
            'source_area_name',
            'target_area',
            'target_area_name',
            'target_supervisor',
            'target_supervisor_name',
            'note',
            'status',
            'requested_by',
            'requested_by_name',
            'approved_by',
            'approved_by_name',
            'decision_note',
            'worker_count',
            'workers_preview',
            'created_at',
            'decided_at',
        ]

    def get_target_supervisor_name(self, obj):
        if obj.target_supervisor:
            return obj.target_supervisor.get_full_name() or obj.target_supervisor.username
        return ''

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return ''

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return ''

    def get_worker_count(self, obj):
        return obj.workers.count()

    def get_workers_preview(self, obj):
        return list(obj.workers.values_list('name', flat=True)[:6])
