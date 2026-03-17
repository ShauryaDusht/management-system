from collections import defaultdict
from datetime import timedelta
import csv
import io
from statistics import median

from django.http import FileResponse, HttpResponse
from django.core.files.base import ContentFile
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdmin as IsAdminUser
from .exporters import (
    export_consumption_item_csv,
    export_consumption_requester_csv,
    generate_csv,
    generate_pdf,
)
from .generators import (
    generate_consumption_report,
    generate_area_issues_report,
    generate_inventory_report,
    generate_monthly_report,
    generate_requests_report,
)
from .models import ItemConsumptionReport, MonthlyReport
from .serializers import MonthlyReportListSerializer, MonthlyReportDetailSerializer


# ── Existing report views ─────────────────────────────────────────────────────

class InventoryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = (request.query_params.get('status') or '').strip().lower() or None
        item_type_filter = (request.query_params.get('item_type') or '').strip().lower() or None
        data = generate_inventory_report(status_filter=status_filter, item_type_filter=item_type_filter)
        return Response(data)


class RequestsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_requests_report(date_from, date_to)
        return Response(data)


class ActivityTrendView(APIView):
    """
    GET /api/reports/activity-trend/?range=today|weekly|monthly
    Returns cross-module activity trend rows for admin dashboard charts.
    """
    permission_classes = [IsAdminUser]

    @staticmethod
    def _resolve_range(range_key):
        key = (range_key or 'weekly').strip().lower()
        if key not in {'today', 'weekly', 'monthly'}:
            key = 'weekly'
        days = 1 if key == 'today' else (30 if key == 'monthly' else 7)
        end_date = timezone.localdate()
        start_date = end_date - timedelta(days=days - 1)
        dates = [start_date + timedelta(days=i) for i in range(days)]
        return key, start_date, end_date, dates

    @staticmethod
    def _annotated_day_map(qs, datetime_field):
        return dict(
            qs.annotate(day=TruncDate(datetime_field))
            .values('day')
            .annotate(c=Count('id'))
            .values_list('day', 'c')
        )

    def get(self, request):
        range_key, start_date, end_date, dates = self._resolve_range(request.query_params.get('range'))

        from apps.inventory.models import ItemIssue, ItemRequest, PurchaseRequest, StockEntry
        from apps.housekeeping.models import HKArea, HKDailyRecord

        if end_date == timezone.localdate():
            from apps.housekeeping.htmx_views import get_today_records

            for area in HKArea.objects.filter(is_active=True):
                get_today_records(area, end_date)

        inv_requests_map = self._annotated_day_map(
            ItemRequest.objects.filter(requested_at__date__range=(start_date, end_date)),
            'requested_at',
        )
        inv_issues_map = self._annotated_day_map(
            ItemIssue.objects.filter(issued_at__date__range=(start_date, end_date)),
            'issued_at',
        )
        inv_stock_map = self._annotated_day_map(
            StockEntry.objects.filter(added_at__date__range=(start_date, end_date)),
            'added_at',
        )
        inv_purchase_map = self._annotated_day_map(
            PurchaseRequest.objects.filter(created_at__date__range=(start_date, end_date)),
            'created_at',
        )

        hk_rows = (
            HKDailyRecord.objects.filter(date__range=(start_date, end_date))
            .values('date')
            .annotate(
                total=Count('id'),
                done=Count('id', filter=Q(status='done')),
                pending=Count('id', filter=Q(status='pending')),
                in_progress=Count('id', filter=Q(status='in_progress')),
                skipped=Count('id', filter=Q(status='skipped')),
            )
        )
        hk_map = {
            row['date']: {
                'total': row['total'],
                'done': row['done'],
                'pending': row['pending'],
                'in_progress': row['in_progress'],
                'skipped': row['skipped'],
            }
            for row in hk_rows
        }

        series = []
        totals = {
            'inventory': 0,
            'housekeeping': 0,
            'horticulture': 0,
            'inventory_requests': 0,
            'inventory_issues': 0,
            'inventory_stock_additions': 0,
            'inventory_purchase_requests': 0,
            'hk_done': 0,
            'hk_pending': 0,
            'hk_in_progress': 0,
            'hk_skipped': 0,
        }

        for dt in dates:
            inv_requests = int(inv_requests_map.get(dt, 0) or 0)
            inv_issues = int(inv_issues_map.get(dt, 0) or 0)
            inv_stock = int(inv_stock_map.get(dt, 0) or 0)
            inv_purchase = int(inv_purchase_map.get(dt, 0) or 0)
            inventory_total = inv_requests + inv_issues + inv_stock + inv_purchase

            hk = hk_map.get(dt, {})
            hk_total = int(hk.get('total', 0) or 0)
            hk_done = int(hk.get('done', 0) or 0)
            hk_pending = int(hk.get('pending', 0) or 0)
            hk_in_progress = int(hk.get('in_progress', 0) or 0)
            hk_skipped = int(hk.get('skipped', 0) or 0)

            horticulture_total = 0
            total = inventory_total + hk_total + horticulture_total
            label = 'Today' if range_key == 'today' else dt.strftime('%d %b')

            row = {
                'date': dt.isoformat(),
                'label': label,
                'inventory': inventory_total,
                'housekeeping': hk_total,
                'horticulture': horticulture_total,
                'total': total,
                'inventory_requests': inv_requests,
                'inventory_issues': inv_issues,
                'inventory_stock_additions': inv_stock,
                'inventory_purchase_requests': inv_purchase,
                'hk_done': hk_done,
                'hk_pending': hk_pending,
                'hk_in_progress': hk_in_progress,
                'hk_skipped': hk_skipped,
            }
            series.append(row)

            totals['inventory'] += inventory_total
            totals['housekeeping'] += hk_total
            totals['horticulture'] += horticulture_total
            totals['inventory_requests'] += inv_requests
            totals['inventory_issues'] += inv_issues
            totals['inventory_stock_additions'] += inv_stock
            totals['inventory_purchase_requests'] += inv_purchase
            totals['hk_done'] += hk_done
            totals['hk_pending'] += hk_pending
            totals['hk_in_progress'] += hk_in_progress
            totals['hk_skipped'] += hk_skipped

        return Response(
            {
                'range': range_key,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'series': series,
                'totals': totals,
            }
        )


# ── Monthly report views ──────────────────────────────────────────────────────

class DashboardInsightsView(APIView):
    """
    GET /api/reports/dashboard-insights/?range=today|weekly|monthly&area_class=all|hostels|academic|others

    Returns:
      - cross-module activity trend
      - housekeeping area-wise performance
      - housekeeping worker-wise performance
      - inventory area-wise consumption + top consumed items
    """
    permission_classes = [IsAdminUser]

    @staticmethod
    def _resolve_range(range_key):
        key = (range_key or 'weekly').strip().lower()
        if key not in {'today', 'weekly', 'monthly'}:
            key = 'weekly'
        days = 1 if key == 'today' else (30 if key == 'monthly' else 7)
        end_date = timezone.localdate()
        start_date = end_date - timedelta(days=days - 1)
        dates = [start_date + timedelta(days=i) for i in range(days)]
        return key, start_date, end_date, dates

    @staticmethod
    def _normalize_area_class(area_class):
        normalized = (area_class or 'all').strip().lower()
        return normalized if normalized in {'all', 'hostels', 'academic', 'others'} else 'all'

    @staticmethod
    def _area_class_label(area_type, area_name):
        name = (area_name or '').strip()
        type_value = (area_type or '').strip().lower()
        if type_value == 'hostel':
            return 'hostels'
        if name.startswith('Academic Block') or name in {'Academic Common Area', 'New AB U-Shape', 'New Academy'}:
            return 'academic'
        if name.lower() in {'hostel common area', 'common area', 'hostels reliever'}:
            return 'hostels'
        if type_value == 'academic':
            return 'academic'
        return 'others'

    @staticmethod
    def _apply_fair_scoring(rows):
        """
        Fair score balances completion percentage with:
        - sample confidence (enough task volume)
        - workload intensity (tasks handled per worker)
        - attendance reliability
        """
        if not rows:
            return rows

        task_values = [float(r.get('total', 0) or 0) for r in rows if float(r.get('total', 0) or 0) > 0]
        load_values = [
            float(r.get('tasks_per_worker', 0) or 0)
            for r in rows
            if float(r.get('tasks_per_worker', 0) or 0) > 0
        ]
        baseline_tasks = max(8.0, float(median(task_values))) if task_values else 8.0
        baseline_load = max(0.1, float(median(load_values))) if load_values else 1.0

        for row in rows:
            total = float(row.get('total', 0) or 0)
            completion_pct = float(row.get('completion_pct', 0) or 0)
            attendance_pct = max(0.0, min(100.0, float(row.get('attendance_pct', 0) or 0)))
            tasks_per_worker = float(row.get('tasks_per_worker', 0) or 0)

            confidence = min(1.0, (total / baseline_tasks)) if total > 0 else 0.0
            load_ratio = (tasks_per_worker / baseline_load) if tasks_per_worker > 0 else 1.0
            load_ratio = max(0.85, min(1.15, load_ratio))
            attendance_factor = 0.9 + (0.1 * (attendance_pct / 100.0))

            fair_score = completion_pct * (0.6 + 0.4 * confidence) * load_ratio * attendance_factor

            row['confidence_pct'] = round(confidence * 100, 1)
            row['load_index'] = round(load_ratio, 2)
            row['fair_score'] = round(fair_score, 2)

        return rows

    def get(self, request):
        range_key, start_date, end_date, dates = self._resolve_range(request.query_params.get('range'))
        area_class = self._normalize_area_class(request.query_params.get('area_class'))

        from apps.inventory.models import ItemIssue, ItemRequest, PurchaseRequest, StockEntry
        from apps.housekeeping.htmx_views import get_today_records
        from apps.housekeeping.models import HKArea, HKDailyRecord, HKStockRequest, HKUserArea

        # Ensure same-day records exist before analytics.
        if end_date == timezone.localdate():
            for area in HKArea.objects.filter(is_active=True):
                get_today_records(area, end_date)

        # 1) Cross-module activity trend.
        inv_requests_map = ActivityTrendView._annotated_day_map(
            ItemRequest.objects.filter(requested_at__date__range=(start_date, end_date)),
            'requested_at',
        )
        inv_issues_map = ActivityTrendView._annotated_day_map(
            ItemIssue.objects.filter(issued_at__date__range=(start_date, end_date)),
            'issued_at',
        )
        inv_stock_map = ActivityTrendView._annotated_day_map(
            StockEntry.objects.filter(added_at__date__range=(start_date, end_date)),
            'added_at',
        )
        inv_purchase_map = ActivityTrendView._annotated_day_map(
            PurchaseRequest.objects.filter(created_at__date__range=(start_date, end_date)),
            'created_at',
        )

        hk_rows = (
            HKDailyRecord.objects.filter(date__range=(start_date, end_date))
            .values('date')
            .annotate(
                total=Count('id'),
                done=Count('id', filter=Q(status='done')),
                pending=Count('id', filter=Q(status='pending')),
                in_progress=Count('id', filter=Q(status='in_progress')),
                skipped=Count('id', filter=Q(status='skipped')),
            )
        )
        hk_map = {
            row['date']: {
                'total': row['total'],
                'done': row['done'],
                'pending': row['pending'],
                'in_progress': row['in_progress'],
                'skipped': row['skipped'],
            }
            for row in hk_rows
        }

        trend_series = []
        trend_totals = {
            'inventory': 0,
            'housekeeping': 0,
            'horticulture': 0,
            'inventory_requests': 0,
            'inventory_issues': 0,
            'inventory_stock_additions': 0,
            'inventory_purchase_requests': 0,
            'hk_done': 0,
            'hk_pending': 0,
            'hk_in_progress': 0,
            'hk_skipped': 0,
        }

        for dt in dates:
            inv_requests = int(inv_requests_map.get(dt, 0) or 0)
            inv_issues = int(inv_issues_map.get(dt, 0) or 0)
            inv_stock = int(inv_stock_map.get(dt, 0) or 0)
            inv_purchase = int(inv_purchase_map.get(dt, 0) or 0)
            inventory_total = inv_requests + inv_issues + inv_stock + inv_purchase

            hk = hk_map.get(dt, {})
            hk_total = int(hk.get('total', 0) or 0)
            hk_done = int(hk.get('done', 0) or 0)
            hk_pending = int(hk.get('pending', 0) or 0)
            hk_in_progress = int(hk.get('in_progress', 0) or 0)
            hk_skipped = int(hk.get('skipped', 0) or 0)

            horticulture_total = 0
            total = inventory_total + hk_total + horticulture_total
            label = 'Today' if range_key == 'today' else dt.strftime('%d %b')

            trend_series.append(
                {
                    'date': dt.isoformat(),
                    'label': label,
                    'inventory': inventory_total,
                    'housekeeping': hk_total,
                    'horticulture': horticulture_total,
                    'total': total,
                    'inventory_requests': inv_requests,
                    'inventory_issues': inv_issues,
                    'inventory_stock_additions': inv_stock,
                    'inventory_purchase_requests': inv_purchase,
                    'hk_done': hk_done,
                    'hk_pending': hk_pending,
                    'hk_in_progress': hk_in_progress,
                    'hk_skipped': hk_skipped,
                }
            )

            trend_totals['inventory'] += inventory_total
            trend_totals['housekeeping'] += hk_total
            trend_totals['horticulture'] += horticulture_total
            trend_totals['inventory_requests'] += inv_requests
            trend_totals['inventory_issues'] += inv_issues
            trend_totals['inventory_stock_additions'] += inv_stock
            trend_totals['inventory_purchase_requests'] += inv_purchase
            trend_totals['hk_done'] += hk_done
            trend_totals['hk_pending'] += hk_pending
            trend_totals['hk_in_progress'] += hk_in_progress
            trend_totals['hk_skipped'] += hk_skipped

        # 2) Housekeeping area + worker performance (fair comparison + attendance aware).
        from apps.housekeeping.models import HKAttendanceRecord, HKWorker

        active_workers = list(
            HKWorker.objects.select_related('area').filter(is_active=True, is_reliever=False).order_by('name')
        )
        area_worker_ids_map = defaultdict(set)
        staff_worker_ids_map = defaultdict(set)
        active_worker_ids = set()

        for wk in active_workers:
            area_obj = wk.area
            area_name = area_obj.name if area_obj else ''
            area_label = self._area_class_label(area_obj.area_type if area_obj else 'other', area_name)
            if area_class != 'all' and area_label != area_class:
                continue
            active_worker_ids.add(wk.id)
            if area_obj:
                area_worker_ids_map[area_obj.id].add(wk.id)
            if wk.supervisor_id:
                staff_worker_ids_map[wk.supervisor_id].add(wk.id)

        attendance_by_worker_id = defaultdict(
            lambda: {
                'total_halves': 0,
                'present_halves': 0,
                'late_halves': 0,
                'absent_halves': 0,
                'leave_halves': 0,
            }
        )
        if active_worker_ids:
            attendance_rows = (
                HKAttendanceRecord.objects.filter(
                    date__range=(start_date, end_date),
                    worker_id__in=active_worker_ids,
                )
                .values('worker_id')
                .annotate(
                    total_halves=Count('id'),
                    present_halves=Count('id', filter=Q(status__in=['present', 'late'])),
                    late_halves=Count('id', filter=Q(status='late')),
                    absent_halves=Count('id', filter=Q(status='absent')),
                    leave_halves=Count('id', filter=Q(status='leave')),
                )
            )
            for row in attendance_rows:
                attendance_by_worker_id[row['worker_id']] = {
                    'total_halves': int(row.get('total_halves', 0) or 0),
                    'present_halves': int(row.get('present_halves', 0) or 0),
                    'late_halves': int(row.get('late_halves', 0) or 0),
                    'absent_halves': int(row.get('absent_halves', 0) or 0),
                    'leave_halves': int(row.get('leave_halves', 0) or 0),
                }

        def aggregate_attendance(worker_ids):
            total_halves = 0
            present_halves = 0
            late_halves = 0
            absent_halves = 0
            leave_halves = 0
            for worker_id in worker_ids:
                att = attendance_by_worker_id.get(worker_id)
                if not att:
                    continue
                total_halves += int(att.get('total_halves', 0) or 0)
                present_halves += int(att.get('present_halves', 0) or 0)
                late_halves += int(att.get('late_halves', 0) or 0)
                absent_halves += int(att.get('absent_halves', 0) or 0)
                leave_halves += int(att.get('leave_halves', 0) or 0)
            attendance_pct = round((present_halves / total_halves) * 100, 1) if total_halves else 0.0
            return {
                'total_halves': total_halves,
                'present_halves': present_halves,
                'late_halves': late_halves,
                'absent_halves': absent_halves,
                'leave_halves': leave_halves,
                'attendance_pct': attendance_pct,
            }

        area_owner_by_area_id = {}
        area_links = (
            HKUserArea.objects.select_related('user')
            .filter(
                area__is_active=True,
                user__is_active=True,
                user__role__in=['caretaker', 'supervisor'],
            )
            .order_by('area_id', 'user_id')
        )
        for link in area_links:
            existing = area_owner_by_area_id.get(link.area_id)
            if existing is None:
                area_owner_by_area_id[link.area_id] = link.user
            elif existing.role != 'caretaker' and link.user.role == 'caretaker':
                area_owner_by_area_id[link.area_id] = link.user
            worker_ids = area_worker_ids_map.get(link.area_id, set())
            if worker_ids:
                staff_worker_ids_map[link.user_id].update(worker_ids)

        hk_records = (
            HKDailyRecord.objects.filter(date__range=(start_date, end_date))
            .select_related('area', 'assigned_worker', 'completed_by', 'assigned_by')
            .order_by('area__name', 'date')
        )

        area_stats = {}
        caretaker_stats = {}
        worker_stats = {}

        for rec in hk_records:
            area = rec.area
            if not area:
                continue
            area_label = self._area_class_label(area.area_type, area.name)
            if area_class != 'all' and area_label != area_class:
                continue

            area_row = area_stats.setdefault(
                area.id,
                {
                    'area_id': area.id,
                    'area_name': area.name,
                    'area_type': area.area_type,
                    'area_class': area_label,
                    'total': 0,
                    'done': 0,
                    'pending': 0,
                    'in_progress': 0,
                    'skipped': 0,
                },
            )
            area_row['total'] += 1
            if rec.status in {'done', 'pending', 'in_progress', 'skipped'}:
                area_row[rec.status] += 1

            if rec.assigned_worker:
                worker_key = f"worker-{rec.assigned_worker.id}"
                worker_row = worker_stats.setdefault(
                    worker_key,
                    {
                        'worker_pk': rec.assigned_worker.id,
                        'worker_id': worker_key,
                        'worker_name': rec.assigned_worker.name,
                        'pay_code': rec.assigned_worker.pay_code,
                        'area_class': area_label,
                        'areas': set(),
                        'total': 0,
                        'done': 0,
                        'pending': 0,
                        'in_progress': 0,
                        'skipped': 0,
                    },
                )
                worker_row['areas'].add(area.name)
                worker_row['total'] += 1
                if rec.status in {'done', 'pending', 'in_progress', 'skipped'}:
                    worker_row[rec.status] += 1

            owner_user = None
            if rec.completed_by and rec.completed_by.role in {'caretaker', 'supervisor'}:
                owner_user = rec.completed_by
            elif rec.assigned_by and rec.assigned_by.role in {'caretaker', 'supervisor'}:
                owner_user = rec.assigned_by
            elif area.id in area_owner_by_area_id:
                owner_user = area_owner_by_area_id[area.id]

            if not owner_user:
                continue

            owner_key = f"user-{owner_user.id}"
            owner_name = owner_user.get_full_name() or owner_user.username
            caretaker_row = caretaker_stats.setdefault(
                owner_key,
                {
                    'staff_pk': owner_user.id,
                    'staff_id': owner_key,
                    'staff_name': owner_name,
                    'pay_code': owner_user.pay_code,
                    'role': owner_user.role,
                    'area_class': area_label,
                    'areas': set(),
                    'total': 0,
                    'done': 0,
                    'pending': 0,
                    'in_progress': 0,
                    'skipped': 0,
                },
            )
            caretaker_row['areas'].add(area.name)
            caretaker_row['total'] += 1
            if rec.status in {'done', 'pending', 'in_progress', 'skipped'}:
                caretaker_row[rec.status] += 1

        area_rows = []
        for row in area_stats.values():
            total = int(row['total'] or 0)
            done = int(row['done'] or 0)
            worker_ids = area_worker_ids_map.get(row['area_id'], set())
            attendance = aggregate_attendance(worker_ids)

            row['worker_count'] = len(worker_ids)
            row['tasks_per_worker'] = round((total / row['worker_count']), 2) if row['worker_count'] else 0.0
            row['completion_pct'] = round((done / total * 100), 1) if total else 0.0
            row['pending_total'] = int(row['pending'] or 0) + int(row['in_progress'] or 0)
            row.update(attendance)
            area_rows.append(row)

        self._apply_fair_scoring(area_rows)
        area_rows.sort(
            key=lambda r: (
                -float(r.get('fair_score', 0)),
                -float(r.get('completion_pct', 0)),
                -float(r.get('attendance_pct', 0)),
                -int(r.get('done', 0)),
                -int(r.get('total', 0)),
                str(r.get('area_name', '')),
            )
        )
        area_winner = next((row for row in area_rows if row.get('total', 0) > 0), None)

        caretaker_rows = []
        for row in caretaker_stats.values():
            total = int(row['total'] or 0)
            done = int(row['done'] or 0)
            worker_ids = staff_worker_ids_map.get(row['staff_pk'], set())
            attendance = aggregate_attendance(worker_ids)

            row['worker_count'] = len(worker_ids)
            row['tasks_per_worker'] = round((total / row['worker_count']), 2) if row['worker_count'] else 0.0
            row['completion_pct'] = round((done / total * 100), 1) if total else 0.0
            row['pending_total'] = int(row['pending'] or 0) + int(row['in_progress'] or 0)
            row['areas_count'] = len(row['areas'])
            row['areas'] = sorted(list(row['areas']))
            row.update(attendance)
            caretaker_rows.append(row)

        self._apply_fair_scoring(caretaker_rows)
        caretaker_rows.sort(
            key=lambda r: (
                -float(r.get('fair_score', 0)),
                -float(r.get('completion_pct', 0)),
                -float(r.get('attendance_pct', 0)),
                -int(r.get('done', 0)),
                -int(r.get('total', 0)),
                str(r.get('staff_name', '')),
            )
        )
        caretaker_winner = next((row for row in caretaker_rows if row.get('total', 0) > 0), None)

        worker_rows = []
        for row in worker_stats.values():
            total = int(row['total'] or 0)
            done = int(row['done'] or 0)
            worker_id = row.get('worker_pk')
            attendance = aggregate_attendance({worker_id} if worker_id else set())

            row['worker_count'] = 1
            row['tasks_per_worker'] = float(total)
            row['completion_pct'] = round((done / total * 100), 1) if total else 0.0
            row['pending_total'] = int(row['pending'] or 0) + int(row['in_progress'] or 0)
            row['areas_count'] = len(row['areas'])
            row['areas'] = sorted(list(row['areas']))
            row.update(attendance)
            worker_rows.append(row)

        if not worker_rows:
            for wk in active_workers:
                area_name = wk.area.name if wk.area else ''
                area_label = self._area_class_label(wk.area.area_type if wk.area else 'other', area_name)
                if area_class != 'all' and area_label != area_class:
                    continue
                attendance = aggregate_attendance({wk.id})
                worker_rows.append(
                    {
                        'worker_pk': wk.id,
                        'worker_id': f"worker-{wk.id}",
                        'worker_name': wk.name,
                        'pay_code': wk.pay_code,
                        'area_class': area_label,
                        'areas': [area_name] if area_name else [],
                        'areas_count': 1 if area_name else 0,
                        'worker_count': 1,
                        'total': 0,
                        'done': 0,
                        'pending': 0,
                        'in_progress': 0,
                        'skipped': 0,
                        'pending_total': 0,
                        'completion_pct': 0.0,
                        'tasks_per_worker': 0.0,
                        **attendance,
                    }
                )

        self._apply_fair_scoring(worker_rows)
        worker_rows.sort(
            key=lambda r: (
                -float(r.get('fair_score', 0)),
                -float(r.get('completion_pct', 0)),
                -float(r.get('attendance_pct', 0)),
                -int(r.get('done', 0)),
                -int(r.get('total', 0)),
                str(r.get('worker_name', '')),
            )
        )
        worker_winner = next((row for row in worker_rows if row.get('total', 0) > 0), None)

        # 3) Inventory consumption analytics.
        areas_by_id = {
            area.id: area
            for area in HKArea.objects.filter(is_active=True).only('id', 'name', 'area_type')
        }

        user_primary_area = {}
        for link in (
            HKUserArea.objects.select_related('area')
            .filter(area__is_active=True)
            .order_by('user_id', 'id')
        ):
            if link.user_id not in user_primary_area and link.area_id:
                user_primary_area[link.user_id] = link.area_id

        issues = list(
            ItemIssue.objects.filter(issued_at__date__range=(start_date, end_date))
            .select_related('request__item', 'request__requested_by')
            .order_by('-issued_at')
        )
        request_ids = [issue.request_id for issue in issues]
        hk_req_area_map = dict(
            HKStockRequest.objects.filter(inventory_request_id__in=request_ids, area_id__isnull=False)
            .values_list('inventory_request_id', 'area_id')
        )

        area_consumption = defaultdict(
            lambda: {
                'area_name': '',
                'area_class': 'others',
                'transactions': 0,
                'consumable_qty': 0,
                'asset_qty': 0,
                'total_qty': 0,
            }
        )
        top_items = defaultdict(
            lambda: {
                'item_name': '',
                'item_type': '',
                'quantity': 0,
                'transactions': 0,
                'areas': set(),
            }
        )

        for issue in issues:
            area_obj = None
            area_id = hk_req_area_map.get(issue.request_id)
            if area_id:
                area_obj = areas_by_id.get(area_id)
            if not area_obj:
                fallback_area_id = user_primary_area.get(issue.request.requested_by_id)
                if fallback_area_id:
                    area_obj = areas_by_id.get(fallback_area_id)

            if area_obj:
                issue_area_name = area_obj.name
                issue_area_class = self._area_class_label(area_obj.area_type, area_obj.name)
            else:
                issue_area_name = 'Direct Request'
                issue_area_class = 'others'

            if area_class != 'all' and issue_area_class != area_class:
                continue

            item = issue.request.item
            item_name = item.name if item else f'Item #{issue.request.item_id}'
            item_type = (item.item_type if item else '').strip().lower()

            if item_type == 'consumable':
                quantity = issue.actual_quantity_used if issue.actual_quantity_used is not None else issue.issued_quantity
            else:
                quantity = issue.issued_quantity
            quantity = int(quantity or 0)

            area_key = issue_area_name
            area_row = area_consumption[area_key]
            area_row['area_name'] = issue_area_name
            area_row['area_class'] = issue_area_class
            area_row['transactions'] += 1
            area_row['total_qty'] += quantity
            if item_type == 'asset':
                area_row['asset_qty'] += quantity
            else:
                area_row['consumable_qty'] += quantity

            item_row = top_items[item_name]
            item_row['item_name'] = item_name
            item_row['item_type'] = item_type or 'consumable'
            item_row['quantity'] += quantity
            item_row['transactions'] += 1
            item_row['areas'].add(issue_area_name)

        area_consumption_rows = list(area_consumption.values())
        area_consumption_rows.sort(
            key=lambda r: (
                -int(r.get('total_qty', 0)),
                -int(r.get('transactions', 0)),
                str(r.get('area_name', '')),
            )
        )

        top_item_rows = []
        for row in top_items.values():
            row['areas_count'] = len(row['areas'])
            row['areas'] = sorted(list(row['areas']))
            top_item_rows.append(row)
        top_item_rows.sort(
            key=lambda r: (
                -int(r.get('quantity', 0)),
                -int(r.get('transactions', 0)),
                str(r.get('item_name', '')),
            )
        )

        consumption_totals = {
            'transactions': sum(int(r.get('transactions', 0)) for r in area_consumption_rows),
            'consumable_qty': sum(int(r.get('consumable_qty', 0)) for r in area_consumption_rows),
            'asset_qty': sum(int(r.get('asset_qty', 0)) for r in area_consumption_rows),
            'total_qty': sum(int(r.get('total_qty', 0)) for r in area_consumption_rows),
        }

        return Response(
            {
                'range': range_key,
                'area_class': area_class,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'module_trend': {
                    'series': trend_series,
                    'totals': trend_totals,
                },
                'area_performance': {
                    'ranking_metric': 'fair_score',
                    'winner': area_winner,
                    'rows': area_rows,
                },
                'caretaker_supervisor_performance': {
                    'ranking_metric': 'fair_score',
                    'winner': caretaker_winner,
                    'rows': caretaker_rows,
                },
                'worker_performance': {
                    'ranking_metric': 'fair_score',
                    'winner': worker_winner,
                    'rows': worker_rows,
                },
                'inventory_consumption': {
                    'totals': consumption_totals,
                    'areas': area_consumption_rows,
                    'top_items': top_item_rows,
                },
            }
        )


class MonthlyReportListView(APIView):
    """
    GET  /api/reports/monthly/  → list all saved monthly reports (admin only)
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        reports = MonthlyReport.objects.all()
        serializer = MonthlyReportListSerializer(reports, many=True, context={'request': request})
        return Response(serializer.data)


class MonthlyReportGenerateView(APIView):
    """
    POST /api/reports/monthly/generate/
    Body: { "month": 1-12, "year": 2024, "overwrite": false }

    Generates the procurement snapshot and persists it.
    If a report for that month/year already exists, returns 409 unless
    overwrite=true is passed.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        month = request.data.get('month')
        year = request.data.get('year')
        overwrite = request.data.get('overwrite', False)

        errors = {}
        if not month:
            errors['month'] = 'This field is required.'
        if not year:
            errors['year'] = 'This field is required.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            month = int(month)
            year = int(year)
        except (ValueError, TypeError):
            return Response({'detail': 'month and year must be integers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12):
            return Response({'month': 'Must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)

        if year < 2000 or year > 2100:
            return Response({'year': 'Must be a valid 4-digit year.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = MonthlyReport.objects.filter(month=month, year=year).first()
        if existing and not overwrite:
            return Response(
                {
                    'detail': f'A report for {existing.period_label} already exists. '
                               'Pass overwrite=true to regenerate.',
                    'existing_id': existing.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        snapshot = generate_monthly_report(month=month, year=year)

        if existing and overwrite:
            # generated_at is now a plain DateTimeField (not auto_now_add),
            # so we can update it properly on regeneration via .update().
            MonthlyReport.objects.filter(pk=existing.pk).update(
                snapshot=snapshot,
                generated_by=request.user,
                generated_at=timezone.now(),  # reset timestamp on regeneration
                csv_file=None,
                pdf_file=None,
            )
            existing.refresh_from_db()
            report = existing
            # return 200 OK for an update, not 201 Created
            response_status = status.HTTP_200_OK
        else:
            report = MonthlyReport.objects.create(
                month=month,
                year=year,
                snapshot=snapshot,
                generated_by=request.user,
            )
            response_status = status.HTTP_201_CREATED

        serializer = MonthlyReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data, status=response_status)


class MonthlyReportDetailView(APIView):
    """
    GET    /api/reports/monthly/<id>/  → full report including snapshot rows
    DELETE /api/reports/monthly/<id>/  → remove saved report
    """
    permission_classes = [IsAdminUser]

    def _get_object(self, pk):
        try:
            return MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return None

    def get(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MonthlyReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MonthlyReportCSVView(APIView):
    """
    GET /api/reports/monthly/<id>/csv/
    Generates (or re-uses cached) CSV and streams it as a download.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not report.csv_file:
            generate_csv(report)

        file_handle = report.csv_file.open('rb')
        response = FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=f"procurement_{report.year}_{report.month:02d}.csv",
        )
        return response


class MonthlyReportPDFView(APIView):
    """
    GET /api/reports/monthly/<id>/pdf/
    Generates (or re-uses cached) PDF and streams it as a download.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = MonthlyReport.objects.get(pk=pk)
        except MonthlyReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not report.pdf_file:
            generate_pdf(report)

        file_handle = report.pdf_file.open('rb')
        response = FileResponse(
            file_handle,
            content_type='application/pdf',
            as_attachment=True,
            filename=f"procurement_{report.year}_{report.month:02d}.pdf",
        )
        return response


def _serialize_consumption_report_list_row(report):
    return {
        'id': report.id,
        'month': report.month,
        'year': report.year,
        'period_label': report.period_label,
        'generated_at': report.generated_at,
        'generated_by_name': (
            report.generated_by.get_full_name() or report.generated_by.username
            if report.generated_by else None
        ),
        'has_item_csv': bool(report.csv_item_file),
        'has_requester_csv': bool(report.csv_requester_file),
    }


def _consumption_report_filename(prefix: str, year: int, month: int) -> str:
    return f"{prefix}_{year}_{month:02d}.csv"


class ConsumptionReportListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        reports = ItemConsumptionReport.objects.all().order_by('-year', '-month')
        data = [_serialize_consumption_report_list_row(report) for report in reports]
        return Response(data)


class ConsumptionReportGenerateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        month = request.data.get('month')
        year = request.data.get('year')
        overwrite_raw = request.data.get('overwrite', False)
        overwrite = overwrite_raw in [True, 'true', 'True', 1, '1', 'yes', 'on']

        errors = {}
        if month is None:
            errors['month'] = 'This field is required.'
        if year is None:
            errors['year'] = 'This field is required.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            month = int(month)
            year = int(year)
        except (TypeError, ValueError):
            return Response({'detail': 'month and year must be integers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12):
            return Response({'month': 'Must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)
        if year < 2000 or year > 2100:
            return Response({'year': 'Must be between 2000 and 2100.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = ItemConsumptionReport.objects.filter(month=month, year=year).first()
        if existing and not overwrite:
            return Response(
                {
                    'detail': f'A consumption report for {existing.period_label} already exists. '
                              'Pass overwrite=true to regenerate.',
                    'existing_id': existing.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        snapshot = generate_consumption_report(month=month, year=year)
        item_csv_bytes = export_consumption_item_csv(snapshot)
        requester_csv_bytes = export_consumption_requester_csv(snapshot)
        now = timezone.now()
        item_filename = _consumption_report_filename('consumption_items', year, month)
        requester_filename = _consumption_report_filename('consumption_requesters', year, month)

        if existing and overwrite:
            if existing.csv_item_file:
                existing.csv_item_file.delete(save=False)
            if existing.csv_requester_file:
                existing.csv_requester_file.delete(save=False)

            existing.snapshot = snapshot
            existing.generated_by = request.user
            existing.generated_at = now
            existing.csv_item_file.save(item_filename, ContentFile(item_csv_bytes), save=False)
            existing.csv_requester_file.save(requester_filename, ContentFile(requester_csv_bytes), save=False)
            existing.save()
            report = existing
            response_status = status.HTTP_200_OK
        else:
            report = ItemConsumptionReport(
                month=month,
                year=year,
                generated_by=request.user,
                generated_at=now,
                snapshot=snapshot,
            )
            report.csv_item_file.save(item_filename, ContentFile(item_csv_bytes), save=False)
            report.csv_requester_file.save(requester_filename, ContentFile(requester_csv_bytes), save=False)
            report.save()
            response_status = status.HTTP_201_CREATED

        return Response(
            {
                'id': report.id,
                'month': report.month,
                'year': report.year,
                'period_label': report.period_label,
                'generated_at': report.generated_at,
            },
            status=response_status,
        )


class ConsumptionReportDetailView(APIView):
    permission_classes = [IsAdminUser]

    def _get_object(self, pk):
        try:
            return ItemConsumptionReport.objects.select_related('generated_by').get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return None

    def get(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'id': report.id,
                'month': report.month,
                'year': report.year,
                'period_label': report.period_label,
                'generated_at': report.generated_at,
                'generated_by_name': (
                    report.generated_by.get_full_name() or report.generated_by.username
                    if report.generated_by else None
                ),
                'has_item_csv': bool(report.csv_item_file),
                'has_requester_csv': bool(report.csv_requester_file),
                'snapshot': report.snapshot or {},
            }
        )

    def delete(self, request, pk):
        report = self._get_object(pk)
        if not report:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConsumptionReportItemCSVView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = ItemConsumptionReport.objects.get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        filename = _consumption_report_filename('consumption_items', report.year, report.month)
        if not report.csv_item_file:
            snapshot = report.snapshot or generate_consumption_report(report.month, report.year)
            report.snapshot = snapshot
            item_csv_bytes = export_consumption_item_csv(snapshot)
            report.csv_item_file.save(filename, ContentFile(item_csv_bytes), save=False)
            report.save()

        file_handle = report.csv_item_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )


class ConsumptionReportRequesterCSVView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            report = ItemConsumptionReport.objects.get(pk=pk)
        except ItemConsumptionReport.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        filename = _consumption_report_filename('consumption_requesters', report.year, report.month)
        if not report.csv_requester_file:
            snapshot = report.snapshot or generate_consumption_report(report.month, report.year)
            report.snapshot = snapshot
            requester_csv_bytes = export_consumption_requester_csv(snapshot)
            report.csv_requester_file.save(filename, ContentFile(requester_csv_bytes), save=False)
            report.save()

        file_handle = report.csv_requester_file.open('rb')
        return FileResponse(
            file_handle,
            content_type='text/csv',
            as_attachment=True,
            filename=filename,
        )


def _build_tracked_stock_register(year: int):
    from apps.inventory.models import Item, StockEntry
    from apps.inventory.stock_baseline import BASELINE_RECEIVED_DATE, TRACKED_STOCK_ITEMS

    tracked_names = [row['db_name'] for row in TRACKED_STOCK_ITEMS]
    items = Item.objects.filter(name__in=tracked_names).select_related('category')
    item_map = {item.name: item for item in items}

    received_qty_by_item = defaultdict(int)
    last_received_by_item = {}
    for entry in (
        StockEntry.objects.filter(item__name__in=tracked_names, added_at__year=year)
        .select_related('item')
        .order_by('added_at')
    ):
        received_qty_by_item[entry.item_id] += int(entry.quantity_added or 0)
        last_received_by_item[entry.item_id] = timezone.localtime(entry.added_at).date()

    rows = []
    tracked_current_stock_value = 0.0
    tracked_receipt_value_year = 0.0
    tracked_current_quantity = 0
    tracked_received_quantity_year = 0
    out_of_stock_count = 0
    low_stock_count = 0

    for row in TRACKED_STOCK_ITEMS:
        item = item_map.get(row['db_name'])
        if not item:
            continue

        current_quantity = int(item.available_quantity or 0)
        received_quantity_year = int(received_qty_by_item.get(item.id, 0) or 0)
        unit_cost = float(item.unit_cost or 0)
        current_value = round(current_quantity * unit_cost, 2)
        received_value_year = round(received_quantity_year * unit_cost, 2)
        balance_pct = round((current_quantity / received_quantity_year) * 100, 1) if received_quantity_year else None

        tracked_current_stock_value += current_value
        tracked_receipt_value_year += received_value_year
        tracked_current_quantity += current_quantity
        tracked_received_quantity_year += received_quantity_year

        if current_quantity == 0:
            out_of_stock_count += 1
        elif current_quantity <= int(item.threshold_quantity or 0):
            low_stock_count += 1

        rows.append(
            {
                'item_id': item.id,
                'item_code': item.item_code,
                'item_name': row['label'],
                'db_name': item.name,
                'category': item.category.name if item.category else '',
                'unit': row['unit'],
                'current_quantity': current_quantity,
                'current_value': current_value,
                'received_quantity_year': received_quantity_year,
                'received_value_year': received_value_year,
                'unit_cost': unit_cost,
                'threshold': int(item.threshold_quantity or 0),
                'status': item.status,
                'balance_pct_of_year_receipts': balance_pct,
                'last_received_on': (
                    last_received_by_item[item.id].isoformat()
                    if item.id in last_received_by_item else None
                ),
            }
        )

    latest_receipt_date = max(last_received_by_item.values()) if last_received_by_item else BASELINE_RECEIVED_DATE

    return {
        'rows': rows,
        'summary': {
            'tracked_items_count': len(rows),
            'tracked_current_stock_value': round(tracked_current_stock_value, 2),
            'tracked_receipt_value_year': round(tracked_receipt_value_year, 2),
            'tracked_current_quantity': tracked_current_quantity,
            'tracked_received_quantity_year': tracked_received_quantity_year,
            'out_of_stock_count': out_of_stock_count,
            'low_stock_count': low_stock_count,
            'latest_receipt_date': latest_receipt_date.isoformat() if latest_receipt_date else None,
            'baseline_received_date': BASELINE_RECEIVED_DATE.isoformat(),
        },
    }


class AnnualBudgetView(APIView):
    """
    GET /api/reports/annual-budget/?year=2026
    Returns:
      - monthly_spending: list of {month, month_label, spent} for each month of the year
      - category_breakdown: list of {category, spent, item_count}
      - top_consumed_items: top 10 most consumed items this year
      - total_spent_year: sum of all stock entries cost this year
      - total_procurement_value: sum of all stock entries cost (all time)
      - reorder_priority: items needing reorder sorted by urgency
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        import calendar as cal_module
        from django.db.models import F
        from apps.inventory.models import Item, StockEntry, ItemIssue

        try:
            year = int(request.query_params.get('year', timezone.localdate().year))
        except (ValueError, TypeError):
            year = timezone.localdate().year
        download = (request.query_params.get('download') or '').strip().lower()

        # ── Monthly spending via StockEntry × unit_cost ──────────────────────
        # StockEntry.quantity_added * item.unit_cost gives "value added to stock"
        monthly_spending = []
        for m in range(1, 13):
            entries = StockEntry.objects.filter(
                added_at__year=year, added_at__month=m
            ).select_related('item')
            spent = sum(
                float(e.quantity_added or 0) * float(e.item.unit_cost or 0)
                for e in entries
            )
            monthly_spending.append({
                'month': m,
                'month_label': cal_module.month_abbr[m],
                'spent': round(spent, 2),
            })

        total_spent_year = sum(r['spent'] for r in monthly_spending)

        # ── Category breakdown for the year ──────────────────────────────────
        cat_map = {}
        all_entries_year = StockEntry.objects.filter(
            added_at__year=year
        ).select_related('item__category')
        for e in all_entries_year:
            cat = e.item.category.name if e.item.category else 'Uncategorized'
            cost = float(e.quantity_added or 0) * float(e.item.unit_cost or 0)
            if cat not in cat_map:
                cat_map[cat] = {'category': cat, 'spent': 0.0, 'item_ids': set()}
            cat_map[cat]['spent'] += cost
            cat_map[cat]['item_ids'].add(e.item_id)

        category_breakdown = sorted(
            [{'category': v['category'], 'spent': round(v['spent'], 2), 'item_count': len(v['item_ids'])}
             for v in cat_map.values()],
            key=lambda x: -x['spent']
        )

        # ── Top consumed items (by issues this year) ─────────────────────────
        issues_year = ItemIssue.objects.filter(
            issued_at__year=year
        ).select_related('request__item__category')

        item_consumption = {}
        for issue in issues_year:
            item = issue.request.item
            if item.id not in item_consumption:
                item_consumption[item.id] = {
                    'item_id': item.id,
                    'item_code': item.item_code,
                    'item_name': item.name,
                    'category': item.category.name if item.category else '',
                    'unit': item.unit,
                    'unit_cost': float(item.unit_cost or 0),
                    'total_consumed': 0,
                    'total_value': 0.0,
                }
            qty = 0
            if item.item_type == 'consumable':
                if issue.usage_finalized and issue.actual_quantity_used is not None:
                    qty = issue.actual_quantity_used
            else:
                qty = issue.issued_quantity
            cost = qty * float(item.unit_cost or 0)
            item_consumption[item.id]['total_consumed'] += qty
            item_consumption[item.id]['total_value'] += cost

        top_consumed = sorted(
            item_consumption.values(),
            key=lambda x: -x['total_value']
        )[:10]
        for t in top_consumed:
            t['total_value'] = round(t['total_value'], 2)

        # ── Reorder priority list (items low/out of stock) ────────────────────
        low_items = Item.objects.filter(
            available_quantity__lte=F('threshold_quantity')
        ).select_related('category').order_by('available_quantity')[:20]

        reorder_priority = []
        for item in low_items:
            uc = float(item.unit_cost or 0)
            gap = max(0, item.threshold_quantity - item.available_quantity)
            recommended = gap + int(gap * 0.10) + 1  # 10% buffer
            reorder_priority.append({
                'item_id': item.id,
                'item_code': item.item_code,
                'item_name': item.name,
                'category': item.category.name if item.category else '',
                'current_stock': item.available_quantity,
                'threshold': item.threshold_quantity,
                'unit_cost': uc,
                'recommended_qty': recommended,
                'estimated_cost': round(recommended * uc, 2),
                'status': 'out_of_stock' if item.available_quantity == 0 else 'low_stock',
            })

        # ── All-time total procurement ────────────────────────────────────────
        all_entries = StockEntry.objects.all().select_related('item')
        total_procurement_value = round(sum(
            float(e.quantity_added or 0) * float(e.item.unit_cost or 0)
            for e in all_entries
        ), 2)

        current_stock_value = round(sum(
            float(item.available_quantity or 0) * float(item.unit_cost or 0)
            for item in Item.objects.all().only('available_quantity', 'unit_cost')
        ), 2)
        stock_register = _build_tracked_stock_register(year)

        if download == 'stock_register_csv':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Item Code',
                'Material',
                'Category',
                'Unit',
                'Current Quantity',
                'Current Value',
                f'Received Quantity ({year})',
                f'Received Value ({year})',
                'Unit Cost',
                'Threshold',
                'Status',
                'Balance % of Year Receipts',
                'Last Received On',
            ])
            for row in stock_register['rows']:
                writer.writerow([
                    row['item_code'] or '',
                    row['item_name'],
                    row['category'],
                    row['unit'],
                    row['current_quantity'],
                    row['current_value'],
                    row['received_quantity_year'],
                    row['received_value_year'],
                    row['unit_cost'],
                    row['threshold'],
                    row['status'],
                    row['balance_pct_of_year_receipts'] if row['balance_pct_of_year_receipts'] is not None else '',
                    row['last_received_on'] or '',
                ])

            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = (
                f'attachment; filename=\"inventory_stock_register_{year}.csv\"'
            )
            return response

        return Response({
            'year': year,
            'monthly_spending': monthly_spending,
            'total_spent_year': round(total_spent_year, 2),
            'total_procurement_value': total_procurement_value,
            'current_stock_value': current_stock_value,
            'category_breakdown': category_breakdown,
            'top_consumed_items': top_consumed,
            'reorder_priority': reorder_priority,
            'current_stock_register': stock_register['rows'],
            'current_stock_register_summary': stock_register['summary'],
        })


class AreaIssuesReportView(APIView):
    """
    GET /api/reports/area-issues/
    Optional params: ?month=3&year=2026
    Returns area-wise issued items report.
    Also supports ?download=csv to get a CSV file.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        area_class = request.query_params.get('area_class', 'all')
        area_name = request.query_params.get('area_name', '')
        download = request.query_params.get('download', '')

        try:
            month = int(month) if month else None
            year = int(year) if year else None
        except (ValueError, TypeError):
            month = year = None

        data = generate_area_issues_report(
            month=month,
            year=year,
            area_class=area_class,
            area_name=area_name,
        )

        if download == 'csv':
            import csv
            import io
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Area', 'Area Type', 'Item', 'Item Type', 'Unit',
                'Requested By', 'Qty Requested', 'Qty Issued',
                'Issued At', 'Issued By', 'Status', 'Returned/Finalized'
            ])
            for row in data['rows']:
                writer.writerow([
                    row['area_name'], row['area_type'], row['item_name'],
                    row['item_type'], row['item_unit'], row['requested_by'],
                    row['quantity_requested'], row['quantity_issued'],
                    row['issued_at'], row['issued_by'], row['status'],
                    'Yes' if (row['returned'] or row['usage_finalized']) else 'No'
                ])
            output.seek(0)
            from django.http import HttpResponse
            period = f"_{year}_{month:02d}" if month and year else "_all"
            if data.get('area_class') and data.get('area_class') != 'all':
                period += f"_{data['area_class']}"
            if data.get('area_name'):
                safe_area = ''.join(ch if ch.isalnum() else '_' for ch in data['area_name']).strip('_')
                if safe_area:
                    period += f"_{safe_area.lower()}"
            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="area_issues{period}.csv"'
            return response

        return Response(data)
