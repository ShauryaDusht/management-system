from django.utils import timezone
from django.db.models import Sum, Count, Q

from apps.inventory.models import Category, Item, ItemRequest, ItemIssue, StockEntry


def generate_inventory_report(date_from=None, date_to=None):
    items = Item.objects.all().select_related('category')
    data = []

    for item in items:
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
            'location': item.location or '',
            'description': item.description or '',
            'status': 'out_of_stock' if item.available_quantity == 0
                      else 'low_stock' if item.available_quantity <= item.threshold_quantity
                      else 'in_stock',
        })

    category_breakdown = []
    for cat in Category.objects.all():
        cat_items = [d for d in data if d['category'] == cat.name]
        if cat_items:
            category_breakdown.append({
                'category': cat.name,
                'item_count': len(cat_items),
                'total_value': sum(d['total_value'] for d in cat_items),
                'available_qty': sum(d['available_quantity'] for d in cat_items),
                'low_stock_count': sum(1 for d in cat_items if d['status'] == 'low_stock'),
                'out_of_stock_count': sum(1 for d in cat_items if d['status'] == 'out_of_stock'),
            })

    return {
        'report_type': 'inventory',
        'generated_at': str(timezone.now()),
        'total_items': len(data),
        'total_value': sum(d['total_value'] for d in data),
        'low_stock_count': sum(1 for d in data if d['status'] == 'low_stock'),
        'out_of_stock_count': sum(1 for d in data if d['status'] == 'out_of_stock'),
        'in_stock_count': sum(1 for d in data if d['status'] == 'in_stock'),
        'consumable_count': sum(1 for d in data if d['type'] == 'consumable'),
        'asset_count': sum(1 for d in data if d['type'] == 'asset'),
        'category_breakdown': category_breakdown,
        'items': data,
    }


def generate_requests_report(date_from=None, date_to=None):
    qs = ItemRequest.objects.all().select_related('requested_by', 'item', 'approved_by', 'item__category')
    if date_from:
        qs = qs.filter(requested_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(requested_at__date__lte=date_to)

    data = []
    for req in qs:
        data.append({
            'id': req.id,
            'requester': req.requested_by.get_full_name() or req.requested_by.username,
            'requester_role': req.requested_by.role,
            'item': req.item.name,
            'category': req.item.category.name,
            'item_type': req.item.item_type,
            'quantity': req.quantity_requested,
            'unit': req.item.unit,
            'status': req.status,
            'is_urgent': req.is_urgent,
            'reason': req.purpose,
            'notes': req.notes or '',
            'rejection_reason': req.rejection_reason or '',
            'created_at': str(req.requested_at),
            'reviewed_by': req.approved_by.get_full_name() if req.approved_by else None,
            'reviewed_at': str(req.reviewed_at) if req.reviewed_at else None,
        })

    requester_counts = {}
    for d in data:
        r = d['requester']
        requester_counts[r] = requester_counts.get(r, 0) + 1
    top_requesters = sorted(requester_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    item_counts = {}
    for d in data:
        item_counts[d['item']] = item_counts.get(d['item'], 0) + 1
    top_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        'report_type': 'requests',
        'generated_at': str(timezone.now()),
        'date_from': str(date_from) if date_from else None,
        'date_to': str(date_to) if date_to else None,
        'total': len(data),
        'pending': sum(1 for d in data if d['status'] == 'pending'),
        'approved': sum(1 for d in data if d['status'] == 'approved'),
        'rejected': sum(1 for d in data if d['status'] == 'rejected'),
        'issued': sum(1 for d in data if d['status'] == 'issued'),
        'urgent': sum(1 for d in data if d['is_urgent']),
        'top_requesters': [{'name': name, 'count': count} for name, count in top_requesters],
        'top_items': [{'name': name, 'count': count} for name, count in top_items],
        'requests': data,
    }


def generate_issues_report(date_from=None, date_to=None):
    qs = ItemIssue.objects.all().select_related(
        'request', 'request__item', 'request__item__category',
        'request__requested_by', 'issued_by', 'return_recorded_by'
    )
    if date_from:
        qs = qs.filter(issued_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(issued_at__date__lte=date_to)

    data = []
    total_value_issued = 0

    for issue in qs:
        item = issue.request.item
        unit_cost = float(item.unit_cost or 0)
        issued_value = unit_cost * issue.issued_quantity
        total_value_issued += issued_value

        entry = {
            'id': issue.id,
            'item': item.name,
            'category': item.category.name,
            'item_type': item.item_type,
            'unit': item.unit,
            'issued_to': issue.request.requested_by.get_full_name() or issue.request.requested_by.username,
            'issued_by': issue.issued_by.get_full_name() or issue.issued_by.username,
            'issued_quantity': issue.issued_quantity,
            'unit_cost': unit_cost,
            'issued_value': issued_value,
            'issued_at': str(issue.issued_at),
            'notes': issue.notes or '',
        }

        if item.item_type == 'asset':
            entry.update({
                'expected_return_date': str(issue.expected_return_date) if issue.expected_return_date else None,
                'returned_quantity': issue.returned_quantity,
                'returned_at': str(issue.returned_at) if issue.returned_at else None,
                'condition_on_return': issue.condition_on_return or '',
                'return_status': 'returned' if issue.returned_at else 'pending_return',
            })
        else:
            entry.update({
                'actual_quantity_used': issue.actual_quantity_used,
                'usage_finalized': issue.usage_finalized,
                'quantity_returned_to_stock': (issue.issued_quantity - issue.actual_quantity_used)
                    if (issue.usage_finalized and issue.actual_quantity_used is not None) else 0,
                'usage_status': 'finalized' if issue.usage_finalized else 'pending_finalization',
            })

        data.append(entry)

    item_summary = {}
    for d in data:
        name = d['item']
        if name not in item_summary:
            item_summary[name] = {'item': name, 'category': d['category'], 'total_issued': 0, 'total_value': 0, 'count': 0}
        item_summary[name]['total_issued'] += d['issued_quantity']
        item_summary[name]['total_value'] += d['issued_value']
        item_summary[name]['count'] += 1

    top_issued_items = sorted(item_summary.values(), key=lambda x: x['total_issued'], reverse=True)[:5]
    assets = [d for d in data if d['item_type'] == 'asset']
    consumables = [d for d in data if d['item_type'] == 'consumable']

    return {
        'report_type': 'issues',
        'generated_at': str(timezone.now()),
        'date_from': str(date_from) if date_from else None,
        'date_to': str(date_to) if date_to else None,
        'total_issues': len(data),
        'total_quantity_issued': sum(d['issued_quantity'] for d in data),
        'total_value_issued': round(total_value_issued, 2),
        'asset_issues': len(assets),
        'consumable_issues': len(consumables),
        'assets_pending_return': sum(1 for d in assets if d.get('return_status') == 'pending_return'),
        'consumables_pending_finalization': sum(1 for d in consumables if d.get('usage_status') == 'pending_finalization'),
        'top_issued_items': top_issued_items,
        'issues': data,
    }


def generate_stock_movement_report(date_from=None, date_to=None):
    qs = StockEntry.objects.all().select_related('item', 'item__category', 'added_by')
    if date_from:
        qs = qs.filter(added_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(added_at__date__lte=date_to)

    data = []
    for entry in qs:
        unit_cost = float(entry.item.unit_cost or 0)
        data.append({
            'id': entry.id,
            'item': entry.item.name,
            'category': entry.item.category.name,
            'unit': entry.item.unit,
            'quantity_added': entry.quantity_added,
            'unit_cost': unit_cost,
            'total_cost': round(unit_cost * entry.quantity_added, 2),
            'added_by': entry.added_by.get_full_name() or entry.added_by.username,
            'added_at': str(entry.added_at),
            'notes': entry.notes or '',
        })

    return {
        'report_type': 'stock_movement',
        'generated_at': str(timezone.now()),
        'date_from': str(date_from) if date_from else None,
        'date_to': str(date_to) if date_to else None,
        'total_entries': len(data),
        'total_quantity_added': sum(d['quantity_added'] for d in data),
        'total_cost': round(sum(d['total_cost'] for d in data), 2),
        'entries': data,
    }
