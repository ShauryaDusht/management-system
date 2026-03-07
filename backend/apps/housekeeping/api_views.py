from datetime import timedelta

from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

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


class IsAdminOrHousekeepingManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and (
            user.is_admin or user.is_housekeeping_manager
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
