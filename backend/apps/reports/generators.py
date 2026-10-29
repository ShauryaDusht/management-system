"""
Report generators.
Consumption logic:
  - Consumable : sum of actual_quantity_used from *finalized* issues whose
                 issued_at falls in the target month.
  - Asset      : sum of issued_quantity from issues whose issued_at falls in
                 the target month.
Recommended order:
  - If consumption > 0  →  ceil(consumption x 1.10)
  - If consumption == 0 →  max(0, threshold - available)   (threshold-gap fallback)
"""

import calendar
import math
from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone

from apps.housekeeping.models import (
    HKAttendanceRecord,
    HKDailyRecord,
    HKExtraWork,
    HKRelieverSubstitution,
    HKStockRequest,
    HKTaskWorkerAssignment,
    HKUserArea,
    HKWorker,
    HKWorkerSelectionRequest,
)
from apps.inventory.models import Item, ItemIssue, ItemRequest, StockEntry


# ── Inventory report ──────────────────────────────────────────────────────────

def _exclude_break_tasks(qs):
    return qs.exclude(schedule__task_name__icontains='Tea Break').exclude(
        schedule__task_name__icontains='Lunch Break'
    )


def generate_inventory_report(status_filter=None, item_type_filter=None, category_filter=None):
    qs = Item.objects.all().select_related('category')

    if category_filter:
        if str(category_filter).isdigit():
            qs = qs.filter(category_id=category_filter)
        else:
            qs = qs.filter(category__name__iexact=category_filter)

    if item_type_filter in {'asset', 'consumable'}:
        qs = qs.filter(item_type=item_type_filter)

    if status_filter == 'out_of_stock':
        qs = qs.filter(available_quantity=0)
    elif status_filter == 'low_stock':
        # available > 0 AND available <= threshold  (mirrors Item.status property)
        from django.db.models import F
        qs = qs.filter(available_quantity__gt=0, available_quantity__lte=F('threshold_quantity'))
    elif status_filter == 'in_stock':
        from django.db.models import F
        qs = qs.filter(available_quantity__gt=F('threshold_quantity'))

    data = []
    for item in qs:
        unit_cost = float(item.unit_cost or 0)
        available_quantity = item.available_quantity or 0
        total_value = unit_cost * available_quantity

        data.append({
            'id': item.id,
            'item_code': item.item_code,
            'name': item.name,
            'category': item.category.name,
            'type': item.item_type,
            'unit': item.unit,
            'total_quantity': item.total_quantity,
            'available_quantity': item.available_quantity,
            'threshold_quantity': item.threshold_quantity,
            'unit_cost': unit_cost,
            'total_value': total_value,
            'status': (
                'out_of_stock' if item.available_quantity == 0
                else 'low_stock' if 0 < item.available_quantity <= item.threshold_quantity
                else 'in_stock'
            ),
        })

    return {
        'report_type': 'inventory',
        'generated_at': str(timezone.now()),
        'total_items': len(data),
        'total_value': sum(d['total_value'] for d in data),
        'low_stock_count': sum(1 for d in data if d['status'] == 'low_stock'),
        'out_of_stock_count': sum(1 for d in data if d['status'] == 'out_of_stock'),
        'items': data,
    }


# ── Requests report ───────────────────────────────────────────────────────────

def generate_requests_report(date_from=None, date_to=None, category_filter=None, exclude_category_filter=None):
    from apps.inventory.models import ItemRequest
    from django.db.models import Q
    qs = ItemRequest.objects.all().select_related('requested_by', 'item__category', 'approved_by', 'issue')
    if category_filter:
        if str(category_filter).isdigit():
            qs = qs.filter(item__category_id=category_filter)
        else:
            qs = qs.filter(
                Q(item__category__name__iexact=category_filter)
                | Q(item__category__name__icontains='Horticulture')
                | Q(purpose__icontains='[Horticulture')
            )
    if exclude_category_filter:
        if str(exclude_category_filter).isdigit():
            qs = qs.exclude(item__category_id=exclude_category_filter)
        else:
            qs = qs.exclude(
                Q(item__category__name__iexact=exclude_category_filter)
                | Q(item__category__name__icontains='Horticulture')
                | Q(purpose__icontains='[Horticulture')
            )
    if date_from:
        qs = qs.filter(requested_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(requested_at__date__lte=date_to)

    data = []
    for req in qs:
        issue = getattr(req, 'issue', None)
        data.append({
            'id': req.id,
            'requester': req.requested_by.get_full_name() or req.requested_by.username,
            'item_code': req.item.item_code,
            'item': req.item.name,
            'category': req.item.category.name if req.item and req.item.category else '',
            'quantity': req.quantity_requested,
            'status': req.status,
            'is_urgent': req.is_urgent,
            'reason': req.purpose,
            'created_at': str(req.requested_at),
            'reviewed_by': req.approved_by.get_full_name() if req.approved_by else None,
            'reviewed_at': str(req.reviewed_at) if req.reviewed_at else None,
            'issued_at': str(issue.issued_at) if issue else None,
        })

    return {
        'report_type': 'requests',
        'generated_at': str(timezone.now()),
        'total': len(data),
        'pending': sum(1 for d in data if d['status'] == 'pending'),
        'approved': sum(1 for d in data if d['status'] == 'approved'),
        # add issued count
        'issued': sum(1 for d in data if d['status'] == 'issued'),
        'rejected': sum(1 for d in data if d['status'] == 'rejected'),
        'requests': data,
    }


# ── Monthly procurement snapshot ──────────────────────────────────────────────

def _recommended_order(consumption: int, threshold: int, available: int) -> int:
    """Return the recommended procurement quantity."""
    if consumption > 0:
        return math.ceil(consumption * 1.10)
    gap = threshold - available
    return max(0, gap)


def generate_monthly_report(month: int, year: int) -> dict:
    """
    Build the full monthly procurement snapshot for the given month/year.
    Returns a plain dict (suitable for JSON storage in MonthlyReport.snapshot).
    """
    last_day = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)

    issues_in_period = ItemIssue.objects.filter(
        issued_at__date__gte=period_start,
        issued_at__date__lte=period_end,
    ).select_related('request__item__category')

    consumption_map: dict = {}

    for issue in issues_in_period:
        item = issue.request.item
        entry = consumption_map.setdefault(item.id, {
            'item': item,
            'consumable_used': 0,
            'asset_issued': 0,
        })

        if item.item_type == 'consumable':
            if issue.usage_finalized and issue.actual_quantity_used is not None:
                entry['consumable_used'] += issue.actual_quantity_used
        else:
            entry['asset_issued'] += issue.issued_quantity

    items = Item.objects.select_related('category').order_by('category__name', 'name').iterator(chunk_size=200)

    rows = []
    total_estimated_cost = 0.0

    for item in items:
        entry = consumption_map.get(item.id, {})
        unit_cost = float(item.unit_cost or 0)

        if item.item_type == 'consumable':
            consumption = entry.get('consumable_used', 0)
        else:
            consumption = entry.get('asset_issued', 0)

        recommended = _recommended_order(
            consumption=consumption,
            threshold=item.threshold_quantity,
            available=item.available_quantity,
        )
        estimated_cost = recommended * unit_cost
        total_estimated_cost += estimated_cost

        rows.append({
            'item_id': item.id,
            'item_code': item.item_code,
            'item_name': item.name,
            'category': item.category.name,
            'item_type': item.item_type,
            'unit': item.unit,
            'consumption': consumption,
            'current_stock': item.available_quantity,
            'threshold': item.threshold_quantity,
            'recommended_order': recommended,
            'unit_cost': unit_cost,
            'estimated_cost': round(estimated_cost, 2),
            'status': item.status,
        })

    return {
        'report_type': 'monthly_procurement',
        'month': month,
        'year': year,
        'period_label': f"{calendar.month_name[month]} {year}",
        'generated_at': str(timezone.now()),
        'total_items': len(rows),
        'items_needing_reorder': sum(1 for r in rows if r['recommended_order'] > 0),
        'total_estimated_cost': round(total_estimated_cost, 2),
        'items': rows,
    }


def generate_consumption_report(month: int, year: int) -> dict:
    last_day = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)

    issues_in_period = list(
        ItemIssue.objects
        .filter(
            issued_at__date__gte=period_start,
            issued_at__date__lte=period_end,
        )
        .select_related('request__item__category', 'request__requested_by')
    )
    stock_entries_in_period = list(
        StockEntry.objects
        .filter(
            added_at__date__gte=period_start,
            added_at__date__lte=period_end,
        )
        .select_related('item__category')
    )
    returned_asset_issues_in_period = list(
        ItemIssue.objects
        .filter(
            returned_at__date__gte=period_start,
            returned_at__date__lte=period_end,
            request__item__item_type='asset',
        )
        .select_related('request__item')
    )

    item_ids_with_activity = set()
    for issue in issues_in_period:
        item_ids_with_activity.add(issue.request.item_id)
    for entry in stock_entries_in_period:
        item_ids_with_activity.add(entry.item_id)
    for issue in returned_asset_issues_in_period:
        item_ids_with_activity.add(issue.request.item_id)

    active_items = {
        item.id: item
        for item in Item.objects
        .filter(id__in=item_ids_with_activity)
        .select_related('category')
    }

    item_metrics = defaultdict(
        lambda: {
            'stock_added': 0,
            'total_issued': 0,
            'actual_consumed_finalized_sum': 0,
            'has_finalized_usage': False,
            'unfinalized_count': 0,
            'pending_return': 0,
            'request_count': 0,
            'assets_returned': 0,
        }
    )

    for entry in stock_entries_in_period:
        item_metrics[entry.item_id]['stock_added'] += entry.quantity_added

    requester_issue_buckets = defaultdict(list)
    for issue in issues_in_period:
        item = issue.request.item
        metrics = item_metrics[item.id]
        metrics['total_issued'] += issue.issued_quantity
        metrics['request_count'] += 1

        if item.item_type == 'consumable':
            if issue.usage_finalized and issue.actual_quantity_used is not None:
                metrics['actual_consumed_finalized_sum'] += issue.actual_quantity_used
                metrics['has_finalized_usage'] = True
            if not issue.usage_finalized:
                metrics['unfinalized_count'] += 1
        else:
            if issue.returned_at is None:
                metrics['pending_return'] += 1

        requester_issue_buckets[issue.request.requested_by_id].append(issue)

    for issue in returned_asset_issues_in_period:
        metrics = item_metrics[issue.request.item_id]
        metrics['assets_returned'] += issue.returned_quantity or 0

    item_rows = []
    for item_id in sorted(item_ids_with_activity):
        item = active_items.get(item_id)
        if not item:
            continue
        metrics = item_metrics[item_id]
        unit_cost = float(item.unit_cost or 0)
        total_issued = metrics['total_issued']

        if item.item_type == 'consumable':
            if metrics['has_finalized_usage']:
                actual_consumed = metrics['actual_consumed_finalized_sum']
            else:
                actual_consumed = total_issued
            estimated_cost = actual_consumed * unit_cost
        else:
            actual_consumed = total_issued
            estimated_cost = total_issued * unit_cost

        item_rows.append(
            {
                'item_id': item.id,
                'item_name': item.name,
                'category_name': item.category.name if item.category else '',
                'item_type': item.item_type,
                'unit': item.unit,
                'unit_cost': unit_cost,
                'stock_added': metrics['stock_added'],
                'total_issued': total_issued,
                'actual_consumed': actual_consumed,
                'assets_returned': metrics['assets_returned'] if item.item_type == 'asset' else 0,
                'pending_return': metrics['pending_return'] if item.item_type == 'asset' else 0,
                'unfinalized_count': metrics['unfinalized_count'] if item.item_type == 'consumable' else 0,
                'estimated_cost': round(estimated_cost, 2),
                'current_stock': item.available_quantity,
                'status': item.status,
                'request_count': metrics['request_count'],
            }
        )

    requester_request_rows = list(
        ItemRequest.objects
        .filter(
            requested_at__date__gte=period_start,
            requested_at__date__lte=period_end,
        )
        .select_related('requested_by')
    )
    requester_counts = defaultdict(
        lambda: {
            'total_requests': 0,
            'issued_requests': 0,
            'rejected_requests': 0,
            'urgent_requests': 0,
        }
    )
    for req in requester_request_rows:
        counts = requester_counts[req.requested_by_id]
        counts['total_requests'] += 1
        if req.status == ItemRequest.Status.ISSUED:
            counts['issued_requests'] += 1
        if req.status == ItemRequest.Status.REJECTED:
            counts['rejected_requests'] += 1
        if req.is_urgent:
            counts['urgent_requests'] += 1

    requester_rows = []
    requester_ids = set(requester_counts.keys()) | set(requester_issue_buckets.keys())
    for requester_id in requester_ids:
        issues = requester_issue_buckets.get(requester_id, [])
        request_counts = requester_counts.get(requester_id, {})

        requester_obj = None
        for issue in issues:
            requester_obj = issue.request.requested_by
            break
        if requester_obj is None:
            for req in requester_request_rows:
                if req.requested_by_id == requester_id:
                    requester_obj = req.requested_by
                    break
        if requester_obj is None:
            continue

        items_received = []
        total_estimated_cost = 0.0
        for issue in issues:
            item = issue.request.item
            unit_cost = float(item.unit_cost or 0)
            if item.item_type == 'consumable':
                if issue.usage_finalized and issue.actual_quantity_used is not None:
                    actual_used = issue.actual_quantity_used
                else:
                    actual_used = issue.issued_quantity
                line_cost = actual_used * unit_cost
            else:
                actual_used = issue.issued_quantity
                line_cost = issue.issued_quantity * unit_cost

            total_estimated_cost += line_cost
            items_received.append(
                {
                    'item_name': item.name,
                    'category': item.category.name if item.category else '',
                    'unit': item.unit,
                    'quantity_issued': issue.issued_quantity,
                    'actual_used': actual_used,
                    'usage_finalized': issue.usage_finalized,
                }
            )

        requester_rows.append(
            {
                'requester_id': requester_obj.id,
                'requester_name': requester_obj.get_full_name() or requester_obj.username,
                'role': requester_obj.role,
                'username': requester_obj.username,
                'pay_code': requester_obj.pay_code,
                'email': requester_obj.email,
                'total_requests': request_counts.get('total_requests', 0),
                'issued_requests': request_counts.get('issued_requests', 0),
                'rejected_requests': request_counts.get('rejected_requests', 0),
                'urgent_requests': request_counts.get('urgent_requests', 0),
                'items_received': items_received,
                'total_estimated_cost': round(total_estimated_cost, 2),
            }
        )

    total_stock_added = sum(row['stock_added'] for row in item_rows)
    total_estimated_cost = round(sum(row['estimated_cost'] for row in item_rows), 2)
    summary = {
        'total_items_active': len(item_rows),
        'total_issued_transactions': len(issues_in_period),
        'total_stock_added': total_stock_added,
        'total_estimated_cost': total_estimated_cost,
        'unfinalized_consumables': sum(row['unfinalized_count'] for row in item_rows),
        'pending_asset_returns': sum(row['pending_return'] for row in item_rows),
        'top_consumed_items': sorted(item_rows, key=lambda row: row['actual_consumed'], reverse=True)[:5],
    }

    return {
        'report_type': 'item_consumption',
        'month': month,
        'year': year,
        'period_label': f"{calendar.month_name[month]} {year}",
        'generated_at': str(timezone.now()),
        'summary': summary,
        'item_rows': item_rows,
        'requester_rows': requester_rows,
    }


def _month_dates(month: int, year: int):
    last_day = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)
    days = [
        period_start + timedelta(days=offset)
        for offset in range((period_end - period_start).days + 1)
    ]
    return period_start, period_end, days


def generate_worker_report(worker_id: int, month: int, year: int) -> dict:
    worker = HKWorker.objects.select_related('area').get(pk=worker_id)

    period_start, period_end, month_days = _month_dates(month, year)
    month_label = f"{calendar.month_name[month]} {year}"
    working_days_in_month = sum(1 for day in month_days if day.weekday() != 6)

    attendance_rows = list(
        HKAttendanceRecord.objects
        .filter(worker=worker, date__gte=period_start, date__lte=period_end)
        .values('date', 'half', 'status', 'marked_by__first_name', 'marked_by__last_name', 'marked_by__username')
    )

    attendance_by_date = {}
    supervisor_by_date = {}  # date → supervisor name from first-half marker
    attendance_status_dates = {
        'present': set(),
        'absent': set(),
        'late': set(),
        'leave': set(),
    }

    for row in attendance_rows:
        att_date = row['date']
        half = row['half']
        status = row['status']

        day_data = attendance_by_date.setdefault(att_date, {'first': None, 'second': None})
        day_data[half] = status

        if status in attendance_status_dates:
            attendance_status_dates[status].add(att_date)

        # capture supervisor name from whoever marked first-half (or any half)
        if half == 'first' or att_date not in supervisor_by_date:
            fn = row.get('marked_by__first_name') or ''
            ln = row.get('marked_by__last_name') or ''
            un = row.get('marked_by__username') or ''
            full = f"{fn} {ln}".strip() or un
            if full:
                supervisor_by_date[att_date] = full

    days_present = len(attendance_status_dates['present'])
    days_absent = len(attendance_status_dates['absent'])
    days_late = len(attendance_status_dates['late'])
    days_on_leave = len(attendance_status_dates['leave'])
    attendance_pct = round((days_present / working_days_in_month * 100), 2) if working_days_in_month else 0.0

    direct_task_ids = set(
        HKDailyRecord.objects
        .filter(
            assigned_worker=worker,
            date__gte=period_start,
            date__lte=period_end,
        )
        .values_list('id', flat=True)
    )
    multi_task_ids = set(
        HKTaskWorkerAssignment.objects
        .filter(
            worker=worker,
            daily_record__date__gte=period_start,
            daily_record__date__lte=period_end,
        )
        .values_list('daily_record_id', flat=True)
    )
    all_task_ids = direct_task_ids | multi_task_ids

    task_records = list(
        _exclude_break_tasks(HKDailyRecord.objects.filter(id__in=all_task_ids))
        .select_related('schedule', 'area', 'assigned_by', 'completed_by')
        .order_by('date', 'schedule__start_time', 'id')
    )
    multi_assigned_at = {
        row['daily_record_id']: row['assigned_at']
        for row in (
            HKTaskWorkerAssignment.objects
            .filter(worker=worker, daily_record_id__in=all_task_ids)
            .values('daily_record_id', 'assigned_at')
        )
    }

    daily_task_counts = {}
    total_completed = 0
    total_skipped = 0
    task_details = []
    for record in task_records:
        task_date = record.date
        status = record.status
        day_data = daily_task_counts.setdefault(task_date, {'assigned': 0, 'completed': 0})
        day_data['assigned'] += 1
        if status == 'done':
            day_data['completed'] += 1
            total_completed += 1
        if status == 'skipped':
            total_skipped += 1

        assigned_by_name = ''
        if record.assigned_by:
            assigned_by_name = record.assigned_by.get_full_name() or record.assigned_by.username
        completed_by_name = ''
        if record.completed_by:
            completed_by_name = record.completed_by.get_full_name() or record.completed_by.username
        task_details.append({
            'date': task_date.isoformat(),
            'area_name': record.area.name if record.area else '',
            'task_name': record.schedule.task_name if record.schedule else '',
            'status': status,
            'assigned_at': (
                record.assigned_at or multi_assigned_at.get(record.id)
            ).isoformat() if (record.assigned_at or multi_assigned_at.get(record.id)) else '',
            'started_at': record.started_at.isoformat() if record.started_at else '',
            'completed_at': record.completed_at.isoformat() if record.completed_at else '',
            'assigned_by': assigned_by_name,
            'completed_by': completed_by_name,
            'remarks': record.note or '',
            'photo_submitted': bool(record.photo_after),
        })

    total_assigned = len(task_records)
    completion_pct = round((total_completed / total_assigned * 100), 2) if total_assigned else 0.0

    extra_work_rows = list(
        HKExtraWork.objects
        .filter(
            Q(assigned_workers=worker)
            | Q(assigned_workers__isnull=True, worker_name__iexact=worker.name),
            date__gte=period_start,
            date__lte=period_end,
        )
        .values('date')
        .annotate(total=Count('id', distinct=True))
    )
    extra_work_by_date = {row['date']: row['total'] for row in extra_work_rows}
    extra_work_count = sum(extra_work_by_date.values())

    reliever_dates = list(
        HKRelieverSubstitution.objects
        .filter(
            reliever=worker,
            date__gte=period_start,
            date__lte=period_end,
        )
        .values_list('date', flat=True)
        .distinct()
        .order_by('date')
    )
    reliever_days = [rel_date.isoformat() for rel_date in reliever_dates]

    daily_breakdown = []
    for day in month_days:
        attendance_data = attendance_by_date.get(day, {})
        task_data = daily_task_counts.get(day, {})
        daily_breakdown.append({
            'date': day.isoformat(),
            'attendance_first_half': attendance_data.get('first') or 'unmarked',
            'attendance_second_half': attendance_data.get('second') or 'unmarked',
            'tasks_assigned': task_data.get('assigned', 0),
            'tasks_completed': task_data.get('completed', 0),
            'extra_work': extra_work_by_date.get(day, 0),
            'supervisor_name': supervisor_by_date.get(day, ''),
        })

    return {
        'report_type': 'worker_monthly',
        'worker_id': worker.id,
        'worker': {
            'name': worker.name,
            'area_name': worker.area.name if worker.area else '',
            'worker_type': worker.worker_type,
            'shift': worker.shift,
            'pay_code': worker.pay_code,
        },
        'month': month,
        'year': year,
        'month_label': month_label,
        'generated_at': timezone.now().isoformat(),
        'working_days_in_month': working_days_in_month,
        'attendance': {
            'days_present': days_present,
            'days_absent': days_absent,
            'days_late': days_late,
            'days_on_leave': days_on_leave,
        },
        'attendance_pct': attendance_pct,
        'tasks': {
            'total_assigned': total_assigned,
            'total_completed': total_completed,
            'total_pending': sum(1 for record in task_records if record.status == 'pending'),
            'total_in_progress': sum(1 for record in task_records if record.status == 'in_progress'),
            'total_skipped': total_skipped,
            'completion_pct': completion_pct,
        },
        'task_details': task_details,
        'extra_work_count': extra_work_count,
        'reliever_days': reliever_days,
        'daily_breakdown': daily_breakdown,
    }


def generate_supervisor_report(supervisor_id: int, month: int, year: int) -> dict:
    User = get_user_model()
    supervisor = User.objects.filter(
        pk=supervisor_id,
        role__in=['supervisor', 'caretaker'],
    ).first()
    if not supervisor:
        raise User.DoesNotExist('Supervisor/Caretaker not found.')

    period_start, period_end, month_days = _month_dates(month, year)
    month_label = f"{calendar.month_name[month]} {year}"
    working_days_in_month = sum(1 for day in month_days if day.weekday() != 6)

    areas = list(
        HKUserArea.objects
        .filter(user=supervisor)
        .select_related('area')
        .order_by('area__name')
        .values_list('area__name', flat=True)
    )
    supervisor_area_ids = list(
        HKUserArea.objects
        .filter(user=supervisor)
        .values_list('area_id', flat=True)
    )
    workers_under = HKWorker.objects.filter(supervisor=supervisor, is_active=True).count()

    area_tasks_qs = _exclude_break_tasks(HKDailyRecord.objects.filter(
        area_id__in=supervisor_area_ids,
        date__gte=period_start,
        date__lte=period_end,
    ))
    assigned_qs = _exclude_break_tasks(HKDailyRecord.objects.filter(
        assigned_by=supervisor,
        date__gte=period_start,
        date__lte=period_end,
    ))
    total_tasks_assigned = area_tasks_qs.count()
    tasks_completed = area_tasks_qs.filter(status='done').count()
    tasks_skipped = area_tasks_qs.filter(status='skipped').count()
    tasks_pending = area_tasks_qs.filter(status__in=['pending', 'in_progress']).count()
    completion_rate_pct = round((tasks_completed / total_tasks_assigned * 100), 2) if total_tasks_assigned else 0.0

    completion_minutes = []
    for started_at, completed_at in (
        area_tasks_qs
        .filter(started_at__isnull=False, completed_at__isnull=False)
        .values_list('started_at', 'completed_at')
    ):
        delta_minutes = (completed_at - started_at).total_seconds() / 60
        if delta_minutes >= 0:
            completion_minutes.append(delta_minutes)
    avg_completion_time_minutes = round(
        sum(completion_minutes) / len(completion_minutes),
        2,
    ) if completion_minutes else 0.0

    marking_qs = _exclude_break_tasks(HKDailyRecord.objects.filter(
        completed_by=supervisor,
        status='done',
        date__gte=period_start,
        date__lte=period_end,
    ))
    total_tasks_personally_marked_done = marking_qs.count()
    unique_workers_covered = (
        marking_qs
        .exclude(assigned_worker__isnull=True)
        .values('assigned_worker')
        .distinct()
        .count()
    )

    attendance_qs = HKAttendanceRecord.objects.filter(
        marked_by=supervisor,
        date__gte=period_start,
        date__lte=period_end,
    )
    submitted_qs = attendance_qs.filter(is_submitted=True)
    total_submissions = submitted_qs.count()
    unique_days_submitted = submitted_qs.values('date').distinct().count()
    submission_rate_pct = round((unique_days_submitted / working_days_in_month * 100), 2) if working_days_in_month else 0.0
    workers_marked_absent = attendance_qs.filter(status='absent').values('worker').distinct().count()
    workers_marked_late = attendance_qs.filter(status='late').values('worker').distinct().count()

    extra_work_qs = (
        HKExtraWork.objects
        .filter(
            logged_by=supervisor,
            date__gte=period_start,
            date__lte=period_end,
        )
        .select_related('area')
        .prefetch_related('assigned_workers')
        .order_by('date', 'id')
    )
    extra_work_list = [
        {
            'date': row.date.isoformat(),
            'task_name': row.task_name,
            'area_name': row.area.name if row.area else '',
            'worker_names': ', '.join(worker.name for worker in row.assigned_workers.all()) or row.worker_name,
            'is_verified': row.is_verified,
        }
        for row in extra_work_qs
    ]

    reliever_qs = (
        HKRelieverSubstitution.objects
        .filter(
            assigned_by=supervisor,
            date__gte=period_start,
            date__lte=period_end,
        )
        .select_related('original_worker', 'reliever', 'area')
        .order_by('date', 'id')
    )
    reliever_list = [
        {
            'date': row.date.isoformat(),
            'original_worker_name': row.original_worker.name,
            'reliever_name': row.reliever.name,
            'area_name': row.area.name if row.area else '',
        }
        for row in reliever_qs
    ]

    stock_qs = (
        HKStockRequest.objects
        .filter(
            requested_by=supervisor,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )
        .order_by('created_at', 'id')
    )
    stock_list = [
        {
            'item_name': row.item_name,
            'quantity': row.quantity,
            'status': row.status,
            'is_urgent': row.is_urgent,
            'created_at': row.created_at.isoformat(),
        }
        for row in stock_qs
    ]

    worker_selection_qs = HKWorkerSelectionRequest.objects.filter(
        requested_by=supervisor,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )

    tasks_assigned_by_day = dict(
        area_tasks_qs
        .values('date')
        .annotate(total=Count('id'))
        .values_list('date', 'total')
    )
    tasks_completed_by_day = dict(
        area_tasks_qs
        .filter(status='done')
        .values('date')
        .annotate(total=Count('id'))
        .values_list('date', 'total')
    )
    attendance_submissions_by_day = dict(
        submitted_qs
        .values('date')
        .annotate(total=Count('id'))
        .values_list('date', 'total')
    )
    extra_work_by_day = dict(
        extra_work_qs
        .values('date')
        .annotate(total=Count('id'))
        .values_list('date', 'total')
    )
    daily_activity_breakdown = []
    for day in month_days:
        daily_activity_breakdown.append(
            {
                'date': day.isoformat(),
                'tasks_assigned': tasks_assigned_by_day.get(day, 0),
                'tasks_completed': tasks_completed_by_day.get(day, 0),
                'attendance_submissions': attendance_submissions_by_day.get(day, 0),
                'extra_work_logged': extra_work_by_day.get(day, 0),
            }
        )

    return {
        'report_type': 'supervisor_monthly',
        'supervisor_id': supervisor.id,
        'month': month,
        'year': year,
        'month_label': month_label,
        'generated_at': timezone.now().isoformat(),
        'supervisor_info': {
            'full_name': supervisor.get_full_name() or supervisor.username,
            'username': supervisor.username,
            'role': supervisor.role,
            'phone': supervisor.phone,
            'pay_code': supervisor.pay_code,
            'email': supervisor.email,
            'areas': areas,
            'workers_under': workers_under,
        },
        'task_oversight': {
            'total_tasks_assigned': total_tasks_assigned,
            'tasks_completed': tasks_completed,
            'tasks_skipped': tasks_skipped,
            'tasks_pending': tasks_pending,
            'completion_rate_pct': completion_rate_pct,
            'avg_completion_time_minutes': avg_completion_time_minutes,
            'tasks_personally_dispatched': assigned_qs.count(),
        },
        'task_marking': {
            'total_tasks_personally_marked_done': total_tasks_personally_marked_done,
            'unique_workers_covered': unique_workers_covered,
        },
        'attendance_management': {
            'total_submissions': total_submissions,
            'unique_days_submitted': unique_days_submitted,
            'working_days_in_month': working_days_in_month,
            'submission_rate_pct': submission_rate_pct,
            'workers_marked_absent': workers_marked_absent,
            'workers_marked_late': workers_marked_late,
        },
        'extra_work': {
            'total_extra_tasks_logged': len(extra_work_list),
            'verified_count': sum(1 for row in extra_work_list if row['is_verified']),
            'list': extra_work_list,
        },
        'reliever_management': {
            'total_substitutions_arranged': len(reliever_list),
            'list': reliever_list,
        },
        'stock_requests': {
            'total_raised': len(stock_list),
            'approved': sum(1 for row in stock_list if row['status'] == 'approved'),
            'rejected': sum(1 for row in stock_list if row['status'] == 'rejected'),
            'pending': sum(1 for row in stock_list if row['status'] == 'pending'),
            'issued': sum(1 for row in stock_list if row['status'] == 'issued'),
            'urgent_count': sum(1 for row in stock_list if row['is_urgent']),
            'list': stock_list,
        },
        'worker_selection_requests': {
            'total_raised': worker_selection_qs.count(),
            'approved': worker_selection_qs.filter(status='approved').count(),
            'rejected': worker_selection_qs.filter(status='rejected').count(),
            'pending': worker_selection_qs.filter(status='pending').count(),
        },
        'daily_activity_breakdown': daily_activity_breakdown,
    }


def _area_class_label(area_type: str, area_name: str) -> str:
    name = (area_name or '').strip()
    type_value = (area_type or '').strip().lower()
    if type_value == 'hostel':
        return 'hostels'
    if name.startswith('Academic Block') or name in ['Old Academic Common Area', 'New AB U-Shape', 'New Academic Common Area', 'Old Academic Reliever', 'New Academic Reliever']:
        return 'academic'
    if name.lower() in ['hostel common area', 'common area', 'hostels reliever']:
        return 'hostels'
    if type_value == 'academic':
        return 'academic'
    return 'others'


def generate_area_issues_report(month=None, year=None, area_class='all', area_name=None, category=None, exclude_category=None):
    """
    Generate area-wise issued items report.
    If month/year given, filter by that period. Otherwise all time.
    """
    from apps.inventory.models import ItemIssue, ItemRequest
    from apps.housekeeping.models import HKStockRequest
    from django.db import models as dm

    qs = ItemIssue.objects.select_related(
        'request', 'request__item', 'request__item__category', 'request__requested_by',
        'issued_by'
    ).order_by('-issued_at')

    if category:
        if str(category).isdigit():
            qs = qs.filter(request__item__category_id=category)
        else:
            qs = qs.filter(
                dm.Q(request__item__category__name__iexact=category)
                | dm.Q(request__item__category__name__icontains='Horticulture')
                | dm.Q(request__purpose__icontains='[Horticulture')
            )

    if exclude_category:
        if str(exclude_category).isdigit():
            qs = qs.exclude(request__item__category_id=exclude_category)
        else:
            qs = qs.exclude(
                dm.Q(request__item__category__name__iexact=exclude_category)
                | dm.Q(request__item__category__name__icontains='Horticulture')
                | dm.Q(request__purpose__icontains='[Horticulture')
            )

    if month and year:
        last_day = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)
        qs = qs.filter(issued_at__date__gte=start_date, issued_at__date__lte=end_date)

    target_area_name = area_name
    rows = []
    for issue in qs:
        # Get area from HKStockRequest or HorticultureStockRequest
        issue_area_name = None
        issue_area_type = None
        try:
            hk_req = HKStockRequest.objects.filter(
                inventory_request=issue.request
            ).select_related('area').first()
            if hk_req and hk_req.area:
                issue_area_name = hk_req.area.name
                issue_area_type = hk_req.area.area_type
        except Exception:
            pass

        if not issue_area_name:
            try:
                from apps.horticulture.models import HorticultureStockRequest
                horti_req = HorticultureStockRequest.objects.filter(
                    inventory_request=issue.request
                ).select_related('area').first()
                if horti_req and horti_req.area:
                    issue_area_name = horti_req.area.name
                    issue_area_type = 'horticulture'
            except Exception:
                pass

        if not issue_area_name:
            purpose = getattr(issue.request, 'purpose', '') or ''
            if purpose.startswith('[HK - '):
                end = purpose.find(']')
                if end > 6:
                    issue_area_name = purpose[6:end]
            elif purpose.startswith('[Horticulture - '):
                end = purpose.find(']')
                if end > 16:
                    issue_area_name = purpose[16:end]
                    issue_area_type = 'horticulture'

        rows.append({
            'issue_id': issue.id,
            'area_name': issue_area_name or 'Direct Request',
            'area_type': issue_area_type or 'other',
            'item_name': issue.request.item.name,
            'item_type': issue.request.item.item_type,
            'item_unit': issue.request.item.unit,
            'requested_by': issue.request.requested_by.get_full_name() or issue.request.requested_by.username,
            'quantity_requested': issue.request.quantity_requested,
            'quantity_issued': issue.issued_quantity,
            'issued_at': str(issue.issued_at.date()),
            'issued_by': issue.issued_by.get_full_name() or issue.issued_by.username,
            'status': issue.request.status,
            'returned': bool(issue.returned_at),
            'usage_finalized': issue.usage_finalized,
        })

    normalized_area_class = (area_class or 'all').strip().lower()
    normalized_area_name = (target_area_name or '').strip()

    if normalized_area_class != 'all':
        rows = [
            row for row in rows
            if _area_class_label(row.get('area_type', ''), row.get('area_name', '')) == normalized_area_class
        ]

    if normalized_area_name and normalized_area_name.lower() != 'all':
        rows = [row for row in rows if str(row.get('area_name', '')).strip() == normalized_area_name]

    # Build area summary
    area_summary = {}
    for row in rows:
        key = row['area_name']
        if key not in area_summary:
            area_summary[key] = {
                'area_name': key,
                'area_type': row['area_type'],
                'total_issued': 0,
                'total_qty_issued': 0,
                'assets_out': 0,
                'consumables_used': 0,
                'returned': 0,
            }
        area_summary[key]['total_issued'] += 1
        area_summary[key]['total_qty_issued'] += row['quantity_issued']
        if row['item_type'] == 'asset':
            if not row['returned']:
                area_summary[key]['assets_out'] += 1
            else:
                area_summary[key]['returned'] += 1
        else:
            if row['usage_finalized']:
                area_summary[key]['consumables_used'] += 1

    return {
        'report_type': 'area_issues',
        'month': month,
        'year': year,
        'area_class': normalized_area_class,
        'area_name': normalized_area_name or None,
        'generated_at': str(timezone.now()),
        'total_issues': len(rows),
        'area_summary': sorted(area_summary.values(), key=lambda x: x['total_issued'], reverse=True),
        'rows': rows,
    }
