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
from datetime import date, timedelta

from django.db.models import Count
from django.utils import timezone

from apps.housekeeping.models import (
    HKAttendanceRecord,
    HKDailyRecord,
    HKExtraWork,
    HKRelieverSubstitution,
    HKTaskWorkerAssignment,
    HKWorker,
)
from apps.inventory.models import Item, ItemIssue


# ── Inventory report ──────────────────────────────────────────────────────────

def generate_inventory_report(status_filter=None):
    qs = Item.objects.all().select_related('category')

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

def generate_requests_report(date_from=None, date_to=None):
    from apps.inventory.models import ItemRequest
    qs = ItemRequest.objects.all().select_related('requested_by', 'item', 'approved_by')
    if date_from:
        qs = qs.filter(requested_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(requested_at__date__lte=date_to)

    data = []
    for req in qs:
        data.append({
            'id': req.id,
            'requester': req.requested_by.get_full_name() or req.requested_by.username,
            'item': req.item.name,
            'quantity': req.quantity_requested,
            'status': req.status,
            'is_urgent': req.is_urgent,
            'reason': req.purpose,
            'created_at': str(req.requested_at),
            'reviewed_by': req.approved_by.get_full_name() if req.approved_by else None,
            'reviewed_at': str(req.reviewed_at) if req.reviewed_at else None,
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
        .values('date', 'half', 'status')
    )

    attendance_by_date = {}
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

    task_rows = list(
        HKDailyRecord.objects
        .filter(id__in=all_task_ids)
        .values('id', 'date', 'status')
    )

    daily_task_counts = {}
    total_completed = 0
    total_skipped = 0
    for row in task_rows:
        task_date = row['date']
        status = row['status']
        day_data = daily_task_counts.setdefault(task_date, {'assigned': 0, 'completed': 0})
        day_data['assigned'] += 1
        if status == 'done':
            day_data['completed'] += 1
            total_completed += 1
        if status == 'skipped':
            total_skipped += 1

    total_assigned = len(all_task_ids)
    completion_pct = round((total_completed / total_assigned * 100), 2) if total_assigned else 0.0

    extra_work_rows = list(
        HKExtraWork.objects
        .filter(
            worker_name__iexact=worker.name,
            date__gte=period_start,
            date__lte=period_end,
        )
        .values('date')
        .annotate(total=Count('id'))
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
        })

    return {
        'report_type': 'worker_monthly',
        'worker_id': worker.id,
        'worker': {
            'name': worker.name,
            'area_name': worker.area.name if worker.area else '',
            'worker_type': worker.worker_type,
            'shift': worker.shift,
            'punching_no': worker.punching_no,
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
            'total_skipped': total_skipped,
            'completion_pct': completion_pct,
        },
        'extra_work_count': extra_work_count,
        'reliever_days': reliever_days,
        'daily_breakdown': daily_breakdown,
    }
