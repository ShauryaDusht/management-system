"""
Stock reconciliation service for housekeeping inventory requests.

Calculates outstanding stock (actual issued quantity minus accepted usage)
and unallocated outstanding stock to safely fulfill new requests from existing
stock without creating unnecessary manager approvals or deducting warehouse inventory.
"""
from decimal import Decimal
import math
from django.db import transaction
from django.db.models import DecimalField, F, Prefetch, Q, Sum, Value
from django.db.models.functions import Coalesce

from apps.inventory.models import Item, ItemIssue, ItemRequest, ItemRequestBatch, ItemUsageLog, RequisitionItem


def get_area_issue_filter(area):
    """
    Matches ItemIssue records belonging to the given area either via
    request.hkstockrequest.area or via purpose prefix convention [HK - <AreaName>].
    """
    area_filter = Q(request__hkstockrequest__area=area)
    if hasattr(area, 'name') and area.name:
        area_filter |= (
            Q(request__hkstockrequest__isnull=True) &
            Q(request__purpose__startswith=f"[HK - {area.name}]")
        )
    return area_filter


def get_requester_area_issues_qs(user, area, item):
    """
    Returns the queryset of non-returned ItemIssues for this user, area, and item.
    """
    qs = ItemIssue.objects.filter(
        Q(request__requested_by=user) &
        get_area_issue_filter(area) &
        (Q(request__item=item) | Q(request__requisition_items__inventory_item=item))
    ).exclude(
        Q(request__item__item_type=Item.ItemType.ASSET) & Q(returned_at__isnull=False)
    ).exclude(
        is_reversed=True
    ).distinct()
    return qs


def get_outstanding_stock(user, area, item):
    """
    Calculates actual physical outstanding stock currently held by the user for this area and item.
    Outstanding quantity = Actual issued quantity - Accepted usage quantity.
    Returns Decimal with 2 decimal places.
    """
    if not user or not area or not item:
        return Decimal('0.00')

    issues = get_requester_area_issues_qs(user, area, item)
    total_remaining = Decimal('0.00')

    for issue in issues:
        total_consumed = ItemUsageLog.objects.filter(issue=issue).aggregate(
            total=Coalesce(
                Sum('quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )['total']
        issued_qty = Decimal(issue.issued_quantity)
        rem = max(Decimal('0.00'), issued_qty - (total_consumed or Decimal('0.00')))
        total_remaining += rem

    return total_remaining.quantize(Decimal('0.01'))


def get_unallocated_outstanding_stock(user, area, item):
    """
    Calculates the portion of outstanding stock not already allocated to an active request.
    Accounts for previous issues, usage reports, and overlapping active requests in FIFO order.
    Returns Decimal with 2 decimal places.
    """
    from apps.housekeeping.models import HKStockRequest

    physical_outstanding = get_outstanding_stock(user, area, item)
    if physical_outstanding <= Decimal('0.00'):
        return Decimal('0.00')

    # Find all active requests for this user, area, and item that received a covered quantity
    allocated_requests = HKStockRequest.objects.filter(
        requested_by=user,
        area=area,
        item=item,
        covered_quantity__gt=0,
    ).exclude(
        status__in=['rejected', 'cancelled']
    ).order_by('created_at', 'id')

    if not allocated_requests.exists():
        return physical_outstanding

    earliest_req = allocated_requests.first()
    issues = get_requester_area_issues_qs(user, area, item)

    # Usage logged on or before earliest_req.created_at was already factored in
    # when earliest_req was calculated. Usage logged AFTER earliest_req.created_at
    # represents consumption of the allocated stock.
    usage_after_earliest = ItemUsageLog.objects.filter(
        issue__in=issues,
        logged_at__gt=earliest_req.created_at,
    ).aggregate(
        total=Coalesce(
            Sum('quantity_used'),
            Value(0),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
    )['total']

    consumed_pool = usage_after_earliest or Decimal('0.00')
    remaining_allocated = Decimal('0.00')

    for req in allocated_requests:
        cov = Decimal(req.covered_quantity)
        unconsumed = max(Decimal('0.00'), cov - consumed_pool)
        consumed_pool = max(Decimal('0.00'), consumed_pool - cov)
        remaining_allocated += unconsumed

    unallocated = max(Decimal('0.00'), physical_outstanding - remaining_allocated)
    return min(physical_outstanding, unallocated).quantize(Decimal('0.01'))


def get_area_unreported_stock_items(user, area, items_qs=None):
    """
    Returns a list of dicts describing items that have outstanding issued stock
    with unreported usage for the specified requester and area.
    """
    if not user or not area:
        return []

    if items_qs is None:
        from apps.inventory.models import Item
        hk_cats = [
            "Cleaning Supplies", "Housekeeping Supplies", "Consumables",
            "Tools & Equipment", "Garden & Horticulture Equipment",
        ]
        items_qs = Item.objects.filter(category__name__in=hk_cats).order_by('name')

    from apps.inventory.request_permissions import get_unaccounted_item_quantity

    unreported = []
    for it in items_qs:
        out = get_unaccounted_item_quantity(user, it, area=area)
        if out > Decimal('0.00'):
            unalloc = get_unallocated_outstanding_stock(user, area, it)
            unreported.append({
                'item_id': it.id,
                'item_name': it.name,
                'item_code': it.item_code,
                'unit': it.unit,
                'outstanding_quantity': out,
                'unallocated_quantity': unalloc,
            })
    return unreported


def reconcile_and_create_stock_request(
    user, area, item, quantity, reason, is_urgent=False, batch=None
):
    """
    Reconciles a single-item request against unallocated outstanding stock.
    Returns tuple: (hk_request, inv_request, covered_quantity, approval_required_quantity)
    Must be called within transaction.atomic().
    """
    from apps.housekeeping.models import HKStockRequest

    # Lock inventory Item row for update to ensure safe concurrent operations
    locked_item = Item.objects.select_for_update().get(pk=item.pk)

    unallocated = get_unallocated_outstanding_stock(user, area, locked_item)
    available_whole_units = int(math.floor(unallocated))
    covered_quantity = min(quantity, max(0, available_whole_units))
    approval_required_quantity = quantity - covered_quantity

    inv_req = None

    if approval_required_quantity > 0:
        # Check warehouse stock availability for the uncovered portion
        if approval_required_quantity > locked_item.available_quantity:
            raise ValueError(
                f"Requested uncovered quantity ({approval_required_quantity}) exceeds available warehouse stock ({locked_item.available_quantity})."
            )

        notes_parts = [f"Urgent: {'Yes' if is_urgent else 'No'}"]
        if covered_quantity > 0:
            notes_parts.append(
                f"Covered from outstanding stock: {covered_quantity} {locked_item.unit}. Approval required: {approval_required_quantity} {locked_item.unit}."
            )

        inv_req = ItemRequest.objects.create(
            batch=batch,
            item=locked_item,
            requested_by=user,
            quantity_requested=approval_required_quantity,
            units_remaining=locked_item.available_quantity,
            purpose=f"[HK - {area.name if area else 'General'}] {reason}",
            notes=". ".join(notes_parts),
            is_urgent=is_urgent,
            status=ItemRequest.Status.PENDING,
        )
        RequisitionItem.objects.create(
            requisition=inv_req,
            inventory_item=locked_item,
            quantity=approval_required_quantity,
            unit=locked_item.unit,
        )

        hk_req = HKStockRequest.objects.create(
            requested_by=user,
            area=area,
            item_name=locked_item.name,
            item=locked_item,
            quantity=quantity,
            covered_quantity=covered_quantity,
            unit=locked_item.unit,
            reason=reason,
            is_urgent=is_urgent,
            status='pending',
            inventory_request=inv_req,
        )
    else:
        # Fully covered from existing outstanding stock:
        # No manager approval task created, no warehouse deduction, status is 'issued'
        hk_req = HKStockRequest.objects.create(
            requested_by=user,
            area=area,
            item_name=locked_item.name,
            item=locked_item,
            quantity=quantity,
            covered_quantity=quantity,
            unit=locked_item.unit,
            reason=reason,
            is_urgent=is_urgent,
            status='issued',
            inventory_request=None,
        )

    return hk_req, inv_req, covered_quantity, approval_required_quantity


def reconcile_and_create_batch_stock_requests(
    user, area, item_quantities, reason, is_urgent=False
):
    """
    Reconciles a batch of items against unallocated outstanding stock.
    Only creates ItemRequestBatch and ItemRequests for items that require manager approval.
    Fully covered items are fulfilled directly without manager approval.
    Returns dict: {
        'hk_requests': list,
        'batch': ItemRequestBatch or None,
        'fully_covered_count': int,
        'partially_covered_count': int,
        'uncovered_count': int,
    }
    Must be called within transaction.atomic().
    """
    from apps.housekeeping.models import HKStockRequest

    locked_items = {
        item.id: item
        for item in Item.objects.select_for_update().filter(pk__in=item_quantities.keys())
    }

    # First pass: determine covered and approval_required quantities for each item
    plan = []
    has_approval_needed = False

    for item_id, quantity in item_quantities.items():
        item = locked_items[item_id]
        unallocated = get_unallocated_outstanding_stock(user, area, item)
        available_whole_units = int(math.floor(unallocated))
        covered_qty = min(quantity, max(0, available_whole_units))
        approval_qty = quantity - covered_qty

        if approval_qty > 0:
            has_approval_needed = True
            if approval_qty > item.available_quantity:
                raise ValueError(
                    f"Requested uncovered quantity ({approval_qty}) for {item.name} exceeds available warehouse stock ({item.available_quantity})."
                )

        plan.append({
            'item': item,
            'quantity': quantity,
            'covered_quantity': covered_qty,
            'approval_quantity': approval_qty,
        })

    batch = None
    if has_approval_needed:
        batch = ItemRequestBatch.objects.create(
            requested_by=user,
            purpose=f"[HK - {area.name if area else 'General'}] {reason}",
            notes=f"Urgent: {'Yes' if is_urgent else 'No'}",
            is_urgent=is_urgent,
        )

    hk_requests = []
    fully_covered_count = 0
    partially_covered_count = 0
    uncovered_count = 0

    for line in plan:
        item = line['item']
        quantity = line['quantity']
        covered_qty = line['covered_quantity']
        approval_qty = line['approval_quantity']

        if approval_qty == 0:
            fully_covered_count += 1
            hk_req = HKStockRequest.objects.create(
                requested_by=user,
                area=area,
                item_name=item.name,
                item=item,
                quantity=quantity,
                covered_quantity=quantity,
                unit=item.unit,
                reason=reason,
                is_urgent=is_urgent,
                status='issued',
                inventory_request=None,
            )
            hk_requests.append(hk_req)
        else:
            if covered_qty > 0:
                partially_covered_count += 1
            else:
                uncovered_count += 1

            notes_parts = [f"Urgent: {'Yes' if is_urgent else 'No'}"]
            if covered_qty > 0:
                notes_parts.append(
                    f"Covered from outstanding stock: {covered_qty} {item.unit}. Approval required: {approval_qty} {item.unit}."
                )

            inv_req = ItemRequest.objects.create(
                batch=batch,
                item=item,
                requested_by=user,
                quantity_requested=approval_qty,
                units_remaining=item.available_quantity,
                purpose=f"[HK - {area.name if area else 'General'}] {reason}",
                notes=". ".join(notes_parts),
                is_urgent=is_urgent,
                status=ItemRequest.Status.PENDING,
            )
            RequisitionItem.objects.create(
                requisition=inv_req,
                inventory_item=item,
                quantity=approval_qty,
                unit=item.unit,
            )
            hk_req = HKStockRequest.objects.create(
                requested_by=user,
                area=area,
                item_name=item.name,
                item=item,
                quantity=quantity,
                covered_quantity=covered_qty,
                unit=item.unit,
                reason=reason,
                is_urgent=is_urgent,
                status='pending',
                inventory_request=inv_req,
            )
            hk_requests.append(hk_req)

    return {
        'hk_requests': hk_requests,
        'batch': batch,
        'fully_covered_count': fully_covered_count,
        'partially_covered_count': partially_covered_count,
        'uncovered_count': uncovered_count,
    }


def revalidate_request_for_issue(item_request, requested_issue_qty=None):
    """
    Revalidates an ItemRequest before manager approval or issuance.
    Checks whether the requester's outstanding balance has changed.
    Returns:
        (allowed_issue_qty, newly_covered_qty)
    """
    from apps.housekeeping.models import HKStockRequest

    hk_req = getattr(item_request, 'hkstockrequest', None)
    if not hk_req:
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()

    base_qty = requested_issue_qty if requested_issue_qty is not None else item_request.quantity_requested
    if not hk_req or not hk_req.area:
        return base_qty, 0

    # Check if new unallocated stock has appeared that could cover part of this request
    unallocated = get_unallocated_outstanding_stock(
        item_request.requested_by, hk_req.area, item_request.item
    )
    available_whole = int(math.floor(unallocated))

    if available_whole > 0 and base_qty > 0:
        newly_covered = min(base_qty, available_whole)
        adjusted_issue_qty = base_qty - newly_covered
        # Update HKStockRequest covered quantity
        hk_req.covered_quantity += newly_covered
        hk_req.save(update_fields=['covered_quantity'])
        return adjusted_issue_qty, newly_covered

    return base_qty, 0
