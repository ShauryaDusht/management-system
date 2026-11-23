import logging
from decimal import Decimal
from django.conf import settings
from django.db import models, transaction
from django.db.models import Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone

logger = logging.getLogger(__name__)


def determine_category(notification_type='general', title='', message='', category=None):
    """
    Classifies a notification into IMPORTANT or ROUTINE.
    - IMPORTANT: Requires attention or action (approvals, rejections, assignments, emergencies, alerts).
    - ROUTINE: Reminders, general updates, non-critical status reports.
    """
    from apps.core.models import Notification

    # Explicit category override
    if category:
        cat_str = str(category).strip().upper()
        if cat_str in (Notification.Category.IMPORTANT, Notification.Category.ROUTINE):
            return cat_str

    # Type string passed as category
    if str(notification_type).strip().upper() in (Notification.Category.IMPORTANT, Notification.Category.ROUTINE):
        return str(notification_type).strip().upper()

    important_types = {
        Notification.NotificationType.INVENTORY_APPROVED,
        Notification.NotificationType.INVENTORY_REJECTED,
        Notification.NotificationType.LEAVE_APPROVED,
        Notification.NotificationType.LEAVE_REJECTED,
        'inventory_approved',
        'inventory_rejected',
        'leave_approved',
        'leave_rejected',
    }
    if str(notification_type).lower() in important_types:
        return Notification.Category.IMPORTANT

    if str(notification_type).lower() in (Notification.NotificationType.USAGE_REMINDER, 'usage_reminder'):
        return Notification.Category.ROUTINE

    text = f"{title} {message}".lower()
    important_keywords = (
        'approval',
        'approved',
        'rejected',
        'emergency',
        'urgent',
        'alert',
        'failure',
        'security',
        'critical',
        'assigned',
        'action required',
    )
    if any(kw in text for kw in important_keywords):
        return Notification.Category.IMPORTANT

    return Notification.Category.ROUTINE


def create_notification(
    user,
    title,
    message,
    notification_type='general',
    status_label='',
    link='',
    dedup_key=None,
    category=None,
    requires_action=False,
    action_completed=False,
    expires_at=None,
):
    """
    Creates a user-isolated in-app notification with classification, expiry, and optional deduplication.
    If dedup_key is provided and a notification with that key already exists,
    returns the existing notification without creating a duplicate.
    """
    if not user:
        return None

    from apps.core.models import Notification

    cat = determine_category(
        notification_type=notification_type,
        title=title,
        message=message,
        category=category,
    )

    clean_type = notification_type
    if str(notification_type).upper() in (Notification.Category.IMPORTANT, Notification.Category.ROUTINE):
        clean_type = Notification.NotificationType.GENERAL

    defaults = {
        'user': user,
        'title': title,
        'message': message,
        'notification_type': clean_type,
        'category': cat,
        'status_label': status_label,
        'link': link,
        'requires_action': requires_action,
        'action_completed': action_completed,
    }
    if expires_at is not None:
        defaults['expires_at'] = expires_at

    if dedup_key:
        notification, created = Notification.objects.get_or_create(
            dedup_key=dedup_key,
            defaults=defaults,
        )
        return notification

    return Notification.objects.create(**defaults)


def notify_inventory_approved(item_request):
    """
    Notifies supervisor or caretaker when their inventory request is approved.
    Category: IMPORTANT.
    """
    if not item_request or not item_request.requested_by:
        return None

    user = item_request.requested_by
    item = item_request.item
    item_name = item.name if item else 'Requested Item'
    unit = item.unit if item else 'units'
    qty = item_request.quantity_requested

    # Determine deep link for Staff Portal
    link = '/housekeeping/stock/'
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req and hk_req.area_id:
            link = f'/housekeeping/stock/?area={hk_req.area_id}'
        else:
            from apps.horticulture.models import HorticultureStockRequest
            horti_req = HorticultureStockRequest.objects.filter(inventory_request=item_request).first()
            if horti_req and horti_req.zone_id:
                link = f'/horticulture/stock/?zone={horti_req.zone_id}'
            elif getattr(user, 'role', '') == 'supervisor' and hasattr(user, 'horticulture_supervised_zones') and user.horticulture_supervised_zones.exists():
                link = '/horticulture/stock/'
    except Exception as e:
        logger.debug("Failed resolving deep link for inventory approval: %s", e)

    title = "Inventory Request Issued"
    message = f"Your request for {qty} {unit} of {item_name} has been issued by the manager."
    status_label = "Issued"
    dedup_key = f"user:{user.id}:inv_issued:{item_request.id}"

    from apps.core.models import Notification
    return create_notification(
        user=user,
        title=title,
        message=message,
        notification_type=Notification.NotificationType.INVENTORY_APPROVED,
        category=Notification.Category.IMPORTANT,
        status_label=status_label,
        link=link,
        dedup_key=dedup_key,
    )


notify_inventory_issued = notify_inventory_approved


def notify_inventory_rejected(item_request, rejection_reason=''):
    """
    Notifies supervisor or caretaker when their inventory request is rejected.
    Category: IMPORTANT.
    """
    if not item_request or not item_request.requested_by:
        return None

    user = item_request.requested_by
    item = item_request.item
    item_name = item.name if item else 'Requested Item'
    unit = item.unit if item else 'units'
    qty = item_request.quantity_requested

    link = '/housekeeping/stock/'
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req and hk_req.area_id:
            link = f'/housekeeping/stock/?area={hk_req.area_id}'
    except Exception:
        pass

    reason_str = f" Reason: {rejection_reason.strip()}" if rejection_reason and rejection_reason.strip() else ""
    title = "Inventory Request Rejected"
    message = f"Your request for {qty} {unit} of {item_name} was rejected.{reason_str}"
    status_label = "Rejected"
    dedup_key = f"user:{user.id}:inv_rejected:{item_request.id}"

    from apps.core.models import Notification
    return create_notification(
        user=user,
        title=title,
        message=message,
        notification_type=Notification.NotificationType.INVENTORY_REJECTED,
        category=Notification.Category.IMPORTANT,
        status_label=status_label,
        link=link,
        dedup_key=dedup_key,
    )


def notify_inventory_approval_undone(item_request, reason='', manager=None):
    """
    Notifies supervisor or caretaker when their inventory approval is undone
    and the request is restored to Pending status.
    Category: IMPORTANT.
    """
    if not item_request or not item_request.requested_by:
        return None

    user = item_request.requested_by
    item = item_request.item
    item_name = item.name if item else 'Requested Item'
    unit = item.unit if item else 'units'
    qty = item_request.quantity_requested

    link = '/housekeeping/stock/'
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req and hk_req.area_id:
            link = f'/housekeeping/stock/?area={hk_req.area_id}'
    except Exception:
        pass

    manager_name = (manager.get_full_name() or manager.username) if manager else 'Manager'
    reason_str = f" Reason: {reason.strip()}" if reason and reason.strip() else ""
    title = "Inventory Approval Undone"
    message = (
        f"Previous approval for {qty} {unit} of {item_name} was undone by {manager_name}. "
        f"The request has been restored to Pending status.{reason_str}"
    )
    status_label = "Pending"
    import time
    dedup_key = f"user:{user.id}:inv_undone:{item_request.id}:{int(time.time())}"

    from apps.core.models import Notification
    return create_notification(
        user=user,
        title=title,
        message=message,
        notification_type=Notification.NotificationType.INVENTORY_REJECTED,
        category=Notification.Category.IMPORTANT,
        status_label=status_label,
        link=link,
        dedup_key=dedup_key,
    )


def notify_inventory_quantity_adjusted(item_request, old_qty, new_qty, reason='', manager=None, orig_requested_qty=None):
    """
    Notifies supervisor or caretaker when the issued quantity of their request is adjusted.
    Category: IMPORTANT.
    """
    if not item_request or not item_request.requested_by:
        return None

    user = item_request.requested_by
    item = item_request.item
    item_name = item.name if item else 'Requested Item'
    unit = item.unit if item else 'units'

    link = '/housekeeping/stock/'
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req and hk_req.area_id:
            link = f'/housekeeping/stock/?area={hk_req.area_id}'
        else:
            from apps.horticulture.models import HorticultureStockRequest
            horti_req = HorticultureStockRequest.objects.filter(inventory_request=item_request).first()
            if horti_req and horti_req.zone_id:
                link = f'/horticulture/stock/?zone={horti_req.zone_id}'
            elif getattr(user, 'role', '') == 'supervisor' and hasattr(user, 'horticulture_supervised_zones') and user.horticulture_supervised_zones.exists():
                link = '/horticulture/stock/'
    except Exception:
        pass

    manager_name = (manager.get_full_name() or manager.username) if manager else 'Manager'
    reason_str = f" Reason: {reason.strip()}" if reason and reason.strip() else ""
    title = "Issued Inventory Quantity Adjusted"

    base_qty = orig_requested_qty if orig_requested_qty is not None else old_qty
    try:
        diff = Decimal(str(new_qty)) - Decimal(str(base_qty))
        if diff > 0:
            diff_str = f"+{diff}"
        elif diff < 0:
            diff_str = f"{diff}"
        else:
            diff_str = "0"
    except Exception:
        diff_str = "0"

    message = (
        f"Requested item: {item_name}, Requested qty: {base_qty} {unit}, "
        f"Given item qty: {new_qty} {unit} ({diff_str} {unit}) by {manager_name}.{reason_str}"
    )
    status_label = "Adjusted"
    import time
    dedup_key = f"user:{user.id}:inv_adjusted:{item_request.id}:{int(time.time())}"

    from apps.core.models import Notification
    return create_notification(
        user=user,
        title=title,
        message=message,
        notification_type=Notification.NotificationType.INVENTORY_APPROVED,
        category=Notification.Category.IMPORTANT,
        status_label=status_label,
        link=link,
        dedup_key=dedup_key,
    )


def notify_leave_decision(user, leave_date, decision, area_name='', note='', leave_id=None):
    """
    Notifies requester when manager approves or rejects their leave request.
    decision: 'approved' or 'rejected'
    Category: IMPORTANT.
    """
    if not user:
        return None

    is_approved = str(decision).strip().lower() in {'approved', 'approve', 'accepted'}
    date_display = leave_date.strftime('%d %b %Y') if hasattr(leave_date, 'strftime') else str(leave_date)
    area_text = f" for {area_name}" if area_name else ""

    link = '/housekeeping/schedule/'
    if getattr(user, 'role', '') == 'supervisor' and hasattr(user, 'horticulture_supervised_zones') and user.horticulture_supervised_zones.exists() and not user.hk_areas.exists():
        link = '/horticulture/schedule/'

    from apps.core.models import Notification
    if is_approved:
        title = "Leave Request Approved"
        note_text = f" Note: {note}" if note and note.strip() else ""
        message = f"Your leave request for {date_display}{area_text} has been approved.{note_text}"
        status_label = "Approved"
        notif_type = Notification.NotificationType.LEAVE_APPROVED
        dedup_key = f"user:{user.id}:leave_approved:{leave_id or date_display}:{date_display}"
    else:
        title = "Leave Request Rejected"
        reason_text = f" Reason: {note}" if note and note.strip() else ""
        message = f"Your leave request for {date_display}{area_text} was rejected.{reason_text}"
        status_label = "Rejected"
        notif_type = Notification.NotificationType.LEAVE_REJECTED
        dedup_key = f"user:{user.id}:leave_rejected:{leave_id or date_display}:{date_display}"

    return create_notification(
        user=user,
        title=title,
        message=message,
        notification_type=notif_type,
        category=Notification.Category.IMPORTANT,
        status_label=status_label,
        link=link,
        dedup_key=dedup_key,
    )


def notify_new_inventory_request(item_request):
    """
    Notifies inventory managers when a supervisor or caretaker submits an item request
    requiring review and approval.
    Category: IMPORTANT.
    requires_action: True (unresolved until reviewed).
    """
    if not item_request or not item_request.requested_by:
        return []

    from django.contrib.auth import get_user_model
    from apps.core.models import Notification

    User = get_user_model()
    requester = item_request.requested_by
    item = item_request.item
    item_name = item.name if item else 'Requested Item'
    unit = item.unit if item else 'units'
    qty = item_request.quantity_requested
    requester_name = requester.get_full_name() or requester.username

    # Find managers responsible for inventory approval
    managers_qs = User.objects.filter(
        role__in=['inventory_manager', 'admin', 'hk_inventory_manager', 'horticulture_manager'],
        is_active=True,
    ).distinct()

    title = "New Inventory Request Requiring Approval"
    message = f"{requester_name} has requested {qty} {unit} of {item_name} requiring manager approval."
    status_label = "Action Required"
    link = '/inventory'

    notifications = []
    for manager in managers_qs:
        dedup_key = f"user:{manager.id}:inv_req_pending:{item_request.id}"
        notif = create_notification(
            user=manager,
            title=title,
            message=message,
            notification_type=Notification.NotificationType.GENERAL,
            category=Notification.Category.IMPORTANT,
            status_label=status_label,
            link=link,
            dedup_key=dedup_key,
            requires_action=True,
            action_completed=False,
        )
        if notif:
            notifications.append(notif)
    return notifications


def resolve_inventory_request_notifications(item_request):
    """
    Marks actionable notifications for an inventory request as resolved.
    """
    if not item_request:
        return 0
    from apps.core.models import Notification
    now = timezone.now()
    prefix = f":inv_req_pending:{item_request.id}"
    count = 0
    for notif in Notification.objects.filter(dedup_key__contains=prefix, action_completed=False):
        notif.mark_action_completed(now=now, save=True)
        count += 1
    return count


def check_and_send_usage_reminders(force_time=False, target_date=None):
    """
    Checks for issued items whose required usage reports remain incomplete after 5:00 PM.
    Notifies responsible supervisor or caretaker with item name and outstanding quantity.
    Avoids duplicate reminders on the same day for the same outstanding item.
    Category: ROUTINE.
    """
    now_local = timezone.localtime(timezone.now())

    # Only trigger after 5:00 PM (17:00 IST) unless explicitly forced (e.g. for testing or cron flag)
    if not force_time and now_local.hour < 17:
        logger.debug("Skipping usage reminder check: current local time is %02d:%02d (before 17:00).", now_local.hour, now_local.minute)
        return 0

    from apps.inventory.models import ItemIssue, Item
    from apps.core.models import Notification

    today = target_date or now_local.date()
    today_str = today.isoformat()

    issues_qs = (
        ItemIssue.objects.select_related(
            'request',
            'request__item',
            'request__requested_by',
        )
        .annotate(
            total_consumed=Coalesce(
                Sum('usage_logs__quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )
        .filter(is_reversed=False)
        .exclude(request__status='rejected')
    )

    created_count = 0

    for issue in issues_qs:
        req = getattr(issue, 'request', None)
        if not req or not req.requested_by or not req.requested_by.is_active:
            continue
        if issue.is_reversed or req.status == 'rejected':
            continue

        item = req.item
        if not item:
            continue

        responsible_user = req.requested_by
        issued_qty = Decimal(issue.issued_quantity or 0)
        total_used = Decimal(issue.total_consumed or 0)
        unit = item.unit or 'units'

        # Determine outstanding quantity and completion status
        if item.item_type == Item.ItemType.ASSET:
            if issue.returned_at is not None:
                continue
            ret_qty = Decimal(issue.returned_quantity or 0)
            outstanding = issued_qty - ret_qty
            if outstanding <= Decimal('0'):
                continue
            prompt_type = "usage / return report"
        else:
            if issue.usage_finalized:
                continue
            remaining = issued_qty - total_used
            if remaining <= Decimal('0'):
                continue
            outstanding = remaining
            prompt_type = "usage report"

        # Format outstanding quantity display
        if outstanding == outstanding.to_integral_value():
            outstanding_display = str(int(outstanding))
        else:
            outstanding_display = f"{outstanding:.2f}".rstrip('0').rstrip('.')

        # Resolve link
        link = '/housekeeping/stock/'
        try:
            from apps.housekeeping.models import HKStockRequest
            hk_req = HKStockRequest.objects.filter(inventory_request=req).first()
            if hk_req and hk_req.area_id:
                link = f'/housekeeping/stock/?area={hk_req.area_id}'
            else:
                from apps.horticulture.models import HorticultureStockRequest
                horti_req = HorticultureStockRequest.objects.filter(inventory_request=req).first()
                if horti_req and horti_req.zone_id:
                    link = f'/horticulture/stock/?zone={horti_req.zone_id}'
        except Exception:
            pass

        dedup_key = f"user:{responsible_user.id}:usage_reminder:{issue.id}:{today_str}"
        if Notification.objects.filter(dedup_key=dedup_key).exists():
            continue

        title = "Usage Report Reminder"
        message = (
            f"Please submit the {prompt_type} for {item.name}. "
            f"Outstanding quantity: {outstanding_display} {unit}."
        )

        notif = create_notification(
            user=responsible_user,
            title=title,
            message=message,
            notification_type=Notification.NotificationType.USAGE_REMINDER,
            category=Notification.Category.ROUTINE,
            status_label="Pending Usage",
            link=link,
            dedup_key=dedup_key,
        )
        if notif:
            created_count += 1

    logger.info("Usage reminder check completed for %s: %d notification(s) created.", today_str, created_count)
    return created_count
