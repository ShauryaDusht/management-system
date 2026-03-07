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
from datetime import date

from django.utils import timezone

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
