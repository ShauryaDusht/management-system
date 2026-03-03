from django.utils import timezone
from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    HKAlert,
    HKArea,
    HKAttendanceRecord,
    HKDailyRecord,
    HKScheduleTemplate,
    HKStockRequest,
    HKWorker,
)


class HKAreaSerializer(serializers.ModelSerializer):
    worker_count = serializers.SerializerMethodField()
    caretakers = serializers.SerializerMethodField()

    class Meta:
        model = HKArea
        fields = ['id', 'name', 'area_type', 'is_active', 'worker_count', 'caretakers']

    def get_worker_count(self, obj):
        return obj.workers.filter(is_active=True).count()

    def get_caretakers(self, obj):
        names = []
        for link in obj.assigned_users.select_related('user').all():
            names.append(link.user.get_full_name() or link.user.username)
        return names


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


class HKDailyRecordSerializer(serializers.ModelSerializer):
    task_name = serializers.CharField(source='schedule.task_name', read_only=True)
    worker_tag = serializers.CharField(source='schedule.worker_tag', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)

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
            'completed_at',
            'note',
        ]


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


class HKAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = HKAlert
        fields = ['id', 'title', 'message', 'priority', 'is_active', 'created_at', 'expires_at']


class HKAreaListView(ListAPIView):
    serializer_class = HKAreaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKArea.objects.filter(is_active=True)


class HKWorkerListView(ListAPIView):
    serializer_class = HKWorkerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKWorker.objects.select_related('area', 'supervisor').filter(is_active=True)
        area = self.request.query_params.get('area')
        if area:
            qs = qs.filter(area_id=area)
        return qs


class HKDailyRecordListView(ListAPIView):
    serializer_class = HKDailyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKDailyRecord.objects.select_related('schedule', 'area')
        area = self.request.query_params.get('area')
        date = self.request.query_params.get('date', str(timezone.localdate()))
        if area:
            qs = qs.filter(area_id=area)
        return qs.filter(date=date)


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
        areas = HKArea.objects.filter(is_active=True)
        summary = []
        for area in areas:
            workers = HKWorker.objects.filter(area=area, is_active=True, is_reliever=False)
            total = workers.count()
            present = HKAttendanceRecord.objects.filter(
                worker__in=workers, date=date, status__in=['present', 'late']
            ).values('worker').distinct().count()
            summary.append({
                'area_id': area.id,
                'area_name': area.name,
                'total_workers': total,
                'present': present,
                'absent': max(total - present, 0),
            })
        return Response(summary)


class HKStockRequestListView(ListAPIView):
    serializer_class = HKStockRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKStockRequest.objects.select_related('requested_by', 'area').order_by('-created_at')[:50]


class HKStockRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = HKStockRequest
        fields = ['status']


class HKStockRequestStatusUpdateView(RetrieveUpdateAPIView):
    queryset = HKStockRequest.objects.all()
    serializer_class = HKStockRequestStatusSerializer
    permission_classes = [IsAuthenticated]

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in ['admin', 'manager', 'inventory_manager']:
            return Response({'detail': 'Only admin/manager can update request status.'}, status=403)
        return super().update(request, *args, **kwargs)


class HKAlertListView(ListAPIView):
    serializer_class = HKAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKAlert.objects.filter(is_active=True).order_by('-created_at')[:20]


class HKDashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        total_records = HKDailyRecord.objects.filter(date=today).count()
        done = HKDailyRecord.objects.filter(date=today, status='done').count()
        pending = HKDailyRecord.objects.filter(date=today, status='pending').count()
        total_workers = HKWorker.objects.filter(is_active=True, is_reliever=False).count()
        present_today = HKAttendanceRecord.objects.filter(
            date=today, status__in=['present', 'late']
        ).values('worker').distinct().count()
        pending_stock = HKStockRequest.objects.filter(status='pending').count()
        return Response({
            'total_tasks': total_records,
            'done_tasks': done,
            'pending_tasks': pending,
            'completion_pct': int((done / total_records * 100) if total_records else 0),
            'total_workers': total_workers,
            'present_today': present_today,
            'pending_stock_requests': pending_stock,
            'total_areas': HKArea.objects.filter(is_active=True).count(),
        })
