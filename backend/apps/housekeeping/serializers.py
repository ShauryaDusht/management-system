from rest_framework import serializers

from .models import (
    HKAlert,
    HKArea,
    HKDailyRecord,
    HKInchargeAssignment,
    HKInchargeNotification,
    HKLeaveRequest,
    HKScheduleTemplate,
    HKStaffAttendanceRecord,
    HKStockRequest,
    HKUserArea,
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
            'photo_before',
            'photo_after',
            'photo_after_thumbnail',
            'photo_after_captured_at',
            'photo_after_capture_method',
            'photo_after_original_size',
            'photo_after_saved_size',
            'photo_after_thumb_size',
            'photo_after_compression_ratio',
            'photo_after_format',
            'note',
        ]

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return ''


class HKStaffAttendanceRecordSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    staff_role = serializers.SerializerMethodField()

    class Meta:
        model = HKStaffAttendanceRecord
        fields = [
            'id',
            'staff',
            'staff_name',
            'staff_role',
            'date',
            'status',
            'source',
            'note',
            'marked_at',
            'leave_request',
        ]

    def get_staff_name(self, obj):
        if obj.staff:
            return obj.staff.get_full_name() or obj.staff.username
        return ''

    def get_staff_role(self, obj):
        if obj.staff:
            return getattr(obj.staff, 'role', '') or ''
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


class HKLeaveRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    all_areas = serializers.SerializerMethodField()

    class Meta:
        model = HKLeaveRequest
        fields = [
            'id',
            'staff',
            'staff_name',
            'area',
            'area_name',
            'leave_date',
            'reason',
            'all_areas',
            'status',
            'created_at',
            'updated_at',
        ]

    def get_staff_name(self, obj):
        return obj.staff.get_full_name() or obj.staff.username

    def get_all_areas(self, obj):
        return getattr(obj, 'all_areas', False)


class HKInchargeAssignmentSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    area_label = serializers.SerializerMethodField()
    coverage_area_names = serializers.SerializerMethodField()
    leave_staff_username = serializers.CharField(source='leave_staff.username', read_only=True, default='')
    assigned_staff_username = serializers.CharField(source='assigned_staff.username', read_only=True, default='')
    admin_action_by_name = serializers.SerializerMethodField()
    leave_request = HKLeaveRequestSerializer(read_only=True)

    class Meta:
        model = HKInchargeAssignment
        fields = [
            'id',
            'leave_request',
            'leave_staff',
            'leave_staff_name',
            'leave_staff_username',
            'leave_staff_area',
            'leave_date',
            'area',
            'area_name',
            'area_label',
            'coverage_area_names',
            'assigned_staff',
            'assigned_staff_name',
            'assigned_staff_username',
            'cover_all_areas',
            'status',
            'created_at',
            'updated_at',
            'admin_action_by',
            'admin_action_by_name',
            'admin_action_at',
            'admin_action_note',
            'staff_action_at',
            'staff_action_note',
        ]

    def get_admin_action_by_name(self, obj):
        if obj.admin_action_by:
            return obj.admin_action_by.get_full_name() or obj.admin_action_by.username
        return ''

    def get_coverage_area_names(self, obj):
        try:
            cover_all = getattr(obj, 'cover_all_areas', False)
            leave_staff_id = getattr(obj, 'leave_staff_id', None)
            if not cover_all or not leave_staff_id:
                return []
            names = []
            seen = set()
            links = (
                HKUserArea.objects
                .select_related('area')
                .filter(user_id=leave_staff_id, area__is_active=True)
                .order_by('area__name')
            )
            for link in links:
                area = getattr(link, 'area', None)
                if not area:
                    continue
                n = (area.name or '').strip()
                if not n or n in seen:
                    continue
                seen.add(n)
                names.append(n)
            return names
        except Exception:
            return []

    def get_area_label(self, obj):
        if getattr(obj, 'cover_all_areas', False):
            names = self.get_coverage_area_names(obj)
            if names:
                return f"All Assigned Areas: {', '.join(names)}"
            return 'All Assigned Areas'
        area = getattr(obj, 'area', None)
        return ((getattr(area, 'name', '') or '').strip())


class HKInchargeNotificationSerializer(serializers.ModelSerializer):
    assignment_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = HKInchargeNotification
        fields = ['id', 'assignment_id', 'message', 'level', 'is_seen', 'created_at']
