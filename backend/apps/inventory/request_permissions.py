from decimal import Decimal
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from .models import Item


UNAUTHORIZED_ITEM_REQUEST_MESSAGE = "You do not have permission to request this item."
EXCESSIVE_QUANTITY_MESSAGE = "Requested quantity exceeds available stock."
REPEAT_REQUEST_BLOCKED_MESSAGE = "Previous item's usage report must be completed before requesting it again."


def can_request_assets(user):
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "can_manage_inventory", False):
        return True
    if getattr(user, "is_hk_staff", False) or getattr(user, "role", "") in {"supervisor", "caretaker"}:
        return True

    try:
        from apps.horticulture.services import get_supervisor_zones
    except ImportError:
        return False

    return get_supervisor_zones(user).exists()


def filter_requestable_items(queryset, user):
    if can_request_assets(user):
        return queryset
    return queryset.filter(item_type=Item.ItemType.CONSUMABLE)


def user_can_request_item(user, item):
    return item.item_type != Item.ItemType.ASSET or can_request_assets(user)


def get_unaccounted_item_quantity(user, item, area=None):
    """
    Calculates the total outstanding quantity for a user and item that has
    not yet been accounted for in usage reports or is approved awaiting issue.

    Returns Decimal(0.00) if fully accounted for, or the positive outstanding Decimal.
    """
    if not user or not item or not getattr(user, "is_authenticated", False):
        return Decimal("0.00")

    role = getattr(user, "role", None)
    if role not in ["supervisor", "caretaker"]:
        return Decimal("0.00")

    from .models import ItemIssue, ItemRequest, ItemUsageLog

    # 1. Outstanding from ItemIssue
    issue_filter = Q(request__requested_by=user) & (
        Q(request__item=item) | Q(request__requisition_items__inventory_item=item)
    )
    if area:
        try:
            from apps.housekeeping.stock_reconciliation import get_area_issue_filter
            issue_filter &= get_area_issue_filter(area)
        except ImportError:
            pass

    issues = ItemIssue.objects.filter(issue_filter).exclude(
        Q(request__item__item_type=Item.ItemType.ASSET) & Q(returned_at__isnull=False)
    ).distinct()

    total_outstanding = Decimal("0.00")

    for issue in issues:
        total_consumed = ItemUsageLog.objects.filter(issue=issue).aggregate(
            total=Coalesce(
                Sum("quantity_used"),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )["total"] or Decimal("0.00")
        issued_qty = Decimal(issue.issued_quantity)
        remaining = max(Decimal("0.00"), issued_qty - total_consumed)
        total_outstanding += remaining

    # 2. Approved requests awaiting issue (not yet converted into ItemIssue)
    req_filter = (
        Q(requested_by=user)
        & (Q(item=item) | Q(requisition_items__inventory_item=item))
        & Q(status=ItemRequest.Status.APPROVED)
        & Q(issue__isnull=True)
    )

    if area:
        req_filter &= (
            Q(hkstockrequest__area=area)
            | (Q(hkstockrequest__isnull=True) & Q(purpose__startswith=f"[HK - {area.name}]"))
        )

    approved_unissued_reqs = ItemRequest.objects.filter(req_filter).distinct()
    for req in approved_unissued_reqs:
        lines = req.requisition_items.filter(inventory_item=item)
        if lines.exists():
            for line in lines:
                total_outstanding += Decimal(line.quantity)
        else:
            total_outstanding += Decimal(req.quantity_requested)

    return total_outstanding.quantize(Decimal("0.01"))
