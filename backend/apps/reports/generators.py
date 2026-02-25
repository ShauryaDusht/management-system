from django.utils import timezone

from apps.inventory.models import Category, Item, ItemRequest


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
            'status': 'out_of_stock' if item.available_quantity == 0
                      else 'low_stock' if item.available_quantity <= item.threshold_quantity
                      else 'in_stock',
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


def generate_requests_report(date_from=None, date_to=None):
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
        'rejected': sum(1 for d in data if d['status'] == 'rejected'),
        'requests': data,
    }
