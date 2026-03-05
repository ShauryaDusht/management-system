from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminOrManager
from .models import (
    HKAlert,
    HKArea,
    HKAttendanceRecord,
    HKDailyRecord,
    HKScheduleTemplate,
    HKStockRequest,
    HKWorker,
)
from .serializers import (
    HKAlertSerializer,
    HKAreaSerializer,
    HKDailyRecordSerializer,
    HKScheduleTemplateSerializer,
    HKStockRequestSerializer,
    HKStockRequestStatusSerializer,
    HKWorkerSerializer,
)


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


class HKDailyRecordListView(ListAPIView):
    serializer_class = HKDailyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HKDailyRecord.objects.select_related('schedule', 'area', 'assigned_worker', 'assigned_by')
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
            full_day = len(first & second)
            partial = len(first ^ second)
            summary.append({
                'area_id': area.id,
                'area_name': area.name,
                'total_workers': total,
                'present': full_day,
                'partial': partial,
                'absent': max(total - full_day - partial, 0),
            })

        return Response(summary)


class HKStockRequestListView(ListAPIView):
    serializer_class = HKStockRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKStockRequest.objects.select_related('requested_by', 'area').order_by('-created_at')[:50]


class HKStockRequestStatusUpdateView(RetrieveUpdateAPIView):
    """permission applied in get_permissions(), not update()."""
    queryset = HKStockRequest.objects.all()
    serializer_class = HKStockRequestStatusSerializer

    def get_permissions(self):
        return [IsAdminOrManager()]


class HKAlertListView(ListAPIView):
    serializer_class = HKAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HKAlert.objects.filter(is_active=True).order_by('-created_at')[:20]


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
        present_today = HKAttendanceRecord.objects.filter(
            date=today, status__in=['present', 'late']
        ).values('worker').distinct().count()
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
            'pending_stock_requests': pending_stock,
            'total_areas': HKArea.objects.filter(is_active=True).count(),
        })
