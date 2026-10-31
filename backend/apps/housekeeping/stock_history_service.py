import datetime
import json
from decimal import Decimal
from django.db.models import Prefetch, Q
from django.utils import timezone

from apps.housekeeping.models import HKStockRequest, HKArea
from apps.inventory.models import ItemRequest, ItemIssue, ItemUsageLog


def get_available_history_months(user):
    """
    Returns a sorted list of unique year-month dicts available for the user's history,
    e.g. [{'value': '2026-10', 'label': 'October 2026'}, ...]
    Always ensures the current month is included.
    """
    months_set = set()
    now_local = timezone.localtime(timezone.now())
    months_set.add(now_local.strftime('%Y-%m'))

    # HKStockRequests dates
    for dt in HKStockRequest.objects.filter(requested_by=user).values_list('created_at', flat=True):
        if dt:
            months_set.add(timezone.localtime(dt).strftime('%Y-%m'))

    # ItemIssue dates
    for dt in ItemIssue.objects.filter(request__requested_by=user).values_list('issued_at', flat=True):
        if dt:
            months_set.add(timezone.localtime(dt).strftime('%Y-%m'))

    # Sort descending (newest first)
    sorted_months = sorted(months_set, reverse=True)
    month_options = []
    for ym in sorted_months:
        try:
            parts = ym.split('-')
            d = datetime.date(int(parts[0]), int(parts[1]), 1)
            label = d.strftime('%B %Y')
        except Exception:
            label = ym
        month_options.append({'value': ym, 'label': label})

    return month_options


def _format_hk_request_tx(hk_req):
    inv_req = hk_req.inventory_request
    issue = getattr(inv_req, 'issue', None) if inv_req else None

    item_name = hk_req.item_name or (hk_req.item.name if hk_req.item else 'Unknown Item')
    unit = hk_req.unit or (hk_req.item.unit if hk_req.item else 'units')
    area_name = hk_req.area.name if hk_req.area else 'General Area'
    area_id = hk_req.area_id

    req_created_local = timezone.localtime(hk_req.created_at)

    inv_status = inv_req.status if inv_req else None
    reviewed_at_local = timezone.localtime(inv_req.reviewed_at) if (inv_req and inv_req.reviewed_at) else None
    reviewed_by_name = (
        inv_req.approved_by.get_full_name() or inv_req.approved_by.username
        if (inv_req and inv_req.approved_by) else None
    )
    rejection_reason = inv_req.rejection_reason if inv_req else ''

    usage_logs_list = []
    total_used = Decimal('0.00')

    if issue:
        issued_qty = Decimal(issue.issued_quantity)
        issued_at_local = timezone.localtime(issue.issued_at)
        issued_by_name = (
            issue.issued_by.get_full_name() or issue.issued_by.username
            if issue.issued_by else 'Store Manager'
        )
        issue_id = issue.id
        issue_notes = issue.notes or ''
        expected_return_date = issue.expected_return_date.strftime('%d %b %Y') if issue.expected_return_date else None
        returned_quantity = issue.returned_quantity
        returned_at_local = timezone.localtime(issue.returned_at) if issue.returned_at else None
        condition_on_return = issue.condition_on_return or ''

        for log in issue.usage_logs.all():
            qty_used = Decimal(log.quantity_used)
            total_used += qty_used
            usage_logs_list.append({
                'id': log.id,
                'quantity_used': float(qty_used),
                'quantity_used_display': f"{qty_used:.2f}".rstrip('0').rstrip('.'),
                'purpose': log.purpose or '',
                'notes': log.notes or '',
                'logged_at_date': timezone.localtime(log.logged_at).strftime('%d %b %Y'),
                'logged_at_time': timezone.localtime(log.logged_at).strftime('%I:%M %p'),
                'logged_by': log.logged_by.get_full_name() or log.logged_by.username if log.logged_by else '',
            })
        outstanding_qty = max(Decimal('0.00'), issued_qty - total_used)
        has_issue = True
    elif hk_req.is_fully_covered:
        issued_qty = Decimal(hk_req.covered_quantity)
        issued_at_local = req_created_local
        issued_by_name = 'Existing Outstanding Stock'
        issue_id = None
        issue_notes = 'Fulfilled from outstanding stock'
        expected_return_date = None
        returned_quantity = None
        returned_at_local = None
        condition_on_return = ''
        outstanding_qty = issued_qty
        has_issue = True
    else:
        issued_qty = Decimal('0')
        issued_at_local = None
        issued_by_name = None
        issue_id = None
        issue_notes = ''
        expected_return_date = None
        returned_quantity = None
        returned_at_local = None
        condition_on_return = ''
        outstanding_qty = Decimal('0')
        has_issue = False

    # Determine status_category and status_label
    if hk_req.status == 'rejected' or inv_status == 'rejected' or (issue and issue.is_reversed):
        status_category = 'rejected'
        status_label = 'Rejected'
        badge_class = 'bdg r'
        outstanding_qty = Decimal('0.00')
        relevant_dt_local = reviewed_at_local or (timezone.localtime(issue.reversed_at) if (issue and issue.reversed_at) else None) or req_created_local
    elif has_issue or hk_req.status == 'issued':
        status_category = 'issued'
        if total_used > Decimal('0'):
            status_label = 'Usage Submitted'
            badge_class = 'bdg g'
            if usage_logs_list:
                relevant_dt_local = timezone.localtime(issue.usage_logs.all()[0].logged_at) if issue else req_created_local
            else:
                relevant_dt_local = issued_at_local or req_created_local
        else:
            status_label = 'Usage Pending'
            badge_class = 'bdg y'
            relevant_dt_local = issued_at_local or req_created_local
    else:
        status_category = 'pending'
        if hk_req.status == 'approved' or inv_status == 'approved':
            status_label = 'Pending Issuance'
            badge_class = 'bdg y'
            relevant_dt_local = reviewed_at_local or req_created_local
        else:
            status_label = 'Pending Approval'
            badge_class = 'bdg y'
            relevant_dt_local = req_created_local

    qty_requested = hk_req.quantity
    qty_issued_num = float(issued_qty)
    qty_used_num = float(total_used)
    qty_outstanding_num = float(outstanding_qty)

    tx_dict = {
        'id': hk_req.id,
        'request_id': hk_req.id,
        'request_code': f"REQ-#{hk_req.id}",
        'issue_id': issue_id,
        'issue_code': f"ISSUE-#{issue_id}" if issue_id else None,
        'item_name': item_name,
        'unit': unit,
        'area_id': area_id,
        'area_name': area_name,
        'quantity_requested': qty_requested,
        'covered_quantity': hk_req.covered_quantity,
        'quantity_issued': qty_issued_num,
        'quantity_issued_display': f"{issued_qty:.2f}".rstrip('0').rstrip('.') if issued_qty else '0',
        'quantity_used': qty_used_num,
        'quantity_used_display': f"{total_used:.2f}".rstrip('0').rstrip('.') if total_used else '0',
        'outstanding_quantity': qty_outstanding_num,
        'outstanding_quantity_display': f"{outstanding_qty:.2f}".rstrip('0').rstrip('.') if outstanding_qty else '0',
        'reason': hk_req.reason or '',
        'is_urgent': hk_req.is_urgent,
        'status_category': status_category,
        'status_label': status_label,
        'badge_class': badge_class,
        'has_issue': has_issue,
        'created_at_date': req_created_local.strftime('%d %b %Y'),
        'created_at_time': req_created_local.strftime('%I:%M %p'),
        'reviewed_at_date': reviewed_at_local.strftime('%d %b %Y') if reviewed_at_local else None,
        'reviewed_at_time': reviewed_at_local.strftime('%I:%M %p') if reviewed_at_local else None,
        'reviewed_by': reviewed_by_name,
        'rejection_reason': rejection_reason,
        'issued_at_date': issued_at_local.strftime('%d %b %Y') if issued_at_local else None,
        'issued_at_time': issued_at_local.strftime('%I:%M %p') if issued_at_local else None,
        'issued_by': issued_by_name,
        'issue_notes': issue_notes,
        'expected_return_date': expected_return_date,
        'returned_quantity': returned_quantity,
        'returned_at_date': returned_at_local.strftime('%d %b %Y') if returned_at_local else None,
        'condition_on_return': condition_on_return,
        'usage_logs': usage_logs_list,
        'usage_count': len(usage_logs_list),
        'relevant_dt': relevant_dt_local,
        'date_key': relevant_dt_local.date(),
        'date_display': relevant_dt_local.strftime('%d %b %Y'),
        'time_display': relevant_dt_local.strftime('%I:%M %p'),
    }

    # Add JSON serialization for seamless client-side modal rendering
    json_safe = dict(tx_dict)
    del json_safe['relevant_dt']
    del json_safe['date_key']
    tx_dict['json_data'] = json.dumps(json_safe)

    return tx_dict


def _format_standalone_issue_tx(issue):
    inv_req = issue.request
    item_name = inv_req.item.name if inv_req.item else 'Unknown Item'
    unit = inv_req.item.unit if inv_req.item else 'units'

    # Extract area name from purpose if available: e.g. [HK - Central Arcade]
    area_name = 'Campus Area'
    if inv_req.purpose and '[HK - ' in inv_req.purpose:
        try:
            start = inv_req.purpose.index('[HK - ') + len('[HK - ')
            end = inv_req.purpose.index(']', start)
            area_name = inv_req.purpose[start:end].strip()
        except Exception:
            pass

    req_created_local = timezone.localtime(inv_req.requested_at)
    issued_at_local = timezone.localtime(issue.issued_at)
    issued_by_name = issue.issued_by.get_full_name() or issue.issued_by.username if issue.issued_by else 'Store Manager'
    issued_qty = Decimal(issue.issued_quantity)

    usage_logs_list = []
    total_used = Decimal('0.00')

    for log in issue.usage_logs.all():
        qty_used = Decimal(log.quantity_used)
        total_used += qty_used
        usage_logs_list.append({
            'id': log.id,
            'quantity_used': float(qty_used),
            'quantity_used_display': f"{qty_used:.2f}".rstrip('0').rstrip('.'),
            'purpose': log.purpose or '',
            'notes': log.notes or '',
            'logged_at_date': timezone.localtime(log.logged_at).strftime('%d %b %Y'),
            'logged_at_time': timezone.localtime(log.logged_at).strftime('%I:%M %p'),
            'logged_by': log.logged_by.get_full_name() or log.logged_by.username if log.logged_by else '',
        })

    if issue.is_reversed or inv_req.status == 'rejected':
        status_category = 'rejected'
        status_label = 'Rejected'
        badge_class = 'bdg r'
        outstanding_qty = Decimal('0.00')
        relevant_dt_local = timezone.localtime(issue.reversed_at) if issue.reversed_at else issued_at_local
    elif total_used > Decimal('0'):
        status_category = 'issued'
        status_label = 'Usage Submitted'
        badge_class = 'bdg g'
        relevant_dt_local = timezone.localtime(issue.usage_logs.all()[0].logged_at) if issue.usage_logs.exists() else issued_at_local
    else:
        status_category = 'issued'
        status_label = 'Usage Pending'
        badge_class = 'bdg y'
        relevant_dt_local = issued_at_local

    tx_dict = {
        'id': f"issue-{issue.id}",
        'request_id': inv_req.id,
        'request_code': f"REQ-#{inv_req.id}",
        'issue_id': issue.id,
        'issue_code': f"ISSUE-#{issue.id}",
        'item_name': item_name,
        'unit': unit,
        'area_id': None,
        'area_name': area_name,
        'quantity_requested': inv_req.quantity_requested,
        'covered_quantity': 0,
        'quantity_issued': float(issued_qty),
        'quantity_issued_display': f"{issued_qty:.2f}".rstrip('0').rstrip('.'),
        'quantity_used': float(total_used),
        'quantity_used_display': f"{total_used:.2f}".rstrip('0').rstrip('.') if total_used else '0',
        'outstanding_quantity': float(outstanding_qty),
        'outstanding_quantity_display': f"{outstanding_qty:.2f}".rstrip('0').rstrip('.') if outstanding_qty else '0',
        'reason': inv_req.purpose or '',
        'is_urgent': inv_req.is_urgent,
        'status_category': status_category,
        'status_label': status_label,
        'badge_class': badge_class,
        'has_issue': True,
        'created_at_date': req_created_local.strftime('%d %b %Y'),
        'created_at_time': req_created_local.strftime('%I:%M %p'),
        'reviewed_at_date': issued_at_local.strftime('%d %b %Y'),
        'reviewed_at_time': issued_at_local.strftime('%I:%M %p'),
        'reviewed_by': issued_by_name,
        'rejection_reason': '',
        'issued_at_date': issued_at_local.strftime('%d %b %Y'),
        'issued_at_time': issued_at_local.strftime('%I:%M %p'),
        'issued_by': issued_by_name,
        'issue_notes': issue.notes or '',
        'expected_return_date': issue.expected_return_date.strftime('%d %b %Y') if issue.expected_return_date else None,
        'returned_quantity': issue.returned_quantity,
        'returned_at_date': timezone.localtime(issue.returned_at).strftime('%d %b %Y') if issue.returned_at else None,
        'condition_on_return': issue.condition_on_return or '',
        'usage_logs': usage_logs_list,
        'usage_count': len(usage_logs_list),
        'relevant_dt': relevant_dt_local,
        'date_key': relevant_dt_local.date(),
        'date_display': relevant_dt_local.strftime('%d %b %Y'),
        'time_display': relevant_dt_local.strftime('%I:%M %p'),
    }

    json_safe = dict(tx_dict)
    del json_safe['relevant_dt']
    del json_safe['date_key']
    tx_dict['json_data'] = json.dumps(json_safe)

    return tx_dict


def get_user_history_transactions(
    user,
    area=None,
    month=None,
    from_date=None,
    to_date=None,
    status_filter='all',
    search_query=None,
):
    """
    Retrieves and filters all historical stock transactions for the user.
    Preserves exact campus area associations from original requests.
    """
    hk_requests_qs = (
        HKStockRequest.objects.filter(requested_by=user)
        .select_related(
            'area',
            'item',
            'item__category',
            'inventory_request',
            'inventory_request__approved_by',
            'inventory_request__issue',
            'inventory_request__issue__issued_by',
            'inventory_request__issue__return_recorded_by',
        )
        .prefetch_related(
            Prefetch(
                'inventory_request__issue__usage_logs',
                queryset=ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
            )
        )
        .order_by('-created_at')
    )

    if area:
        hk_requests_qs = hk_requests_qs.filter(area=area)

    all_txs = []
    seen_inv_req_ids = set()

    for hk_req in hk_requests_qs:
        tx = _format_hk_request_tx(hk_req)
        all_txs.append(tx)
        if hk_req.inventory_request_id:
            seen_inv_req_ids.add(hk_req.inventory_request_id)

    # Check for any standalone ItemIssues for this user that were not created via HKStockRequest
    standalone_issues = (
        ItemIssue.objects.filter(
            request__requested_by=user
        )
        .exclude(request_id__in=seen_inv_req_ids)
        .select_related(
            'request',
            'request__item',
            'request__item__category',
            'request__approved_by',
            'issued_by',
            'return_recorded_by',
        )
        .prefetch_related(
            Prefetch(
                'usage_logs',
                queryset=ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
            )
        )
        .order_by('-issued_at')
    )

    for issue in standalone_issues:
        # Check area match if area filter applied
        tx = _format_standalone_issue_tx(issue)
        if area and hasattr(area, 'name') and area.name:
            if f"[HK - {area.name}]" not in (issue.request.purpose or ''):
                continue
        all_txs.append(tx)

    # Sort all transactions by relevant_dt descending
    all_txs.sort(key=lambda t: t['relevant_dt'], reverse=True)

    # Apply date/month filter
    filtered_by_date = []
    for tx in all_txs:
        tx_date = tx['date_key']
        if from_date and to_date:
            if not (from_date <= tx_date <= to_date):
                continue
        elif from_date:
            if tx_date < from_date:
                continue
        elif to_date:
            if tx_date > to_date:
                continue
        elif month and month != 'all':
            if tx_date.strftime('%Y-%m') != month:
                continue
        filtered_by_date.append(tx)

    # Calculate summary cards counts based on filtered_by_date BEFORE status/search filtering!
    total_requests_count = len(filtered_by_date)
    usage_pending_count = sum(
        1 for tx in filtered_by_date
        if tx['status_category'] == 'issued' and tx['quantity_used'] == 0
    )

    # Now apply status filter
    filtered_by_status = []
    for tx in filtered_by_date:
        if status_filter and status_filter != 'all':
            if tx['status_category'] != status_filter:
                continue
        filtered_by_status.append(tx)

    # Now apply search query
    final_txs = []
    if search_query:
        q = search_query.strip().lower()
        for tx in filtered_by_status:
            match = False
            if q in tx['item_name'].lower():
                match = True
            elif q in str(tx['request_id']):
                match = True
            elif tx['issue_id'] and q in str(tx['issue_id']):
                match = True
            elif q in tx['area_name'].lower():
                match = True
            if match:
                final_txs.append(tx)
    else:
        final_txs = filtered_by_status

    return {
        'transactions': final_txs,
        'total_period_transactions': len(filtered_by_date),
        'summary': {
            'total_requests': total_requests_count,
            'usage_pending': usage_pending_count,
        }
    }


def group_transactions_by_date(transactions):
    """
    Groups transactions by date in descending order.
    Returns a list of dicts:
    [
        {
            'date': date_obj,
            'date_display': '21 Oct 2026',
            'count': 2,
            'header': '21 Oct 2026 — 2 transactions',
            'transactions': [...]
        },
        ...
    ]
    """
    groups_dict = {}
    for tx in transactions:
        date_key = tx['date_key']
        if date_key not in groups_dict:
            groups_dict[date_key] = []
        groups_dict[date_key].append(tx)

    # Sort groups by date descending
    sorted_dates = sorted(groups_dict.keys(), reverse=True)
    groups = []
    for d in sorted_dates:
        txs = groups_dict[d]
        # Sort within group by relevant_dt descending
        txs.sort(key=lambda t: t['relevant_dt'], reverse=True)
        count = len(txs)
        cnt_label = "1 transaction" if count == 1 else f"{count} transactions"
        display_str = txs[0]['date_display']
        groups.append({
            'date': d,
            'date_display': display_str,
            'count': count,
            'header': f"{display_str} — {cnt_label}",
            'transactions': txs,
        })

    return groups


def get_transaction_detail(user, pk):
    """
    Returns full transaction detail dictionary for a given request or issue ID,
    strictly validating ownership by the user.
    """
    # Try HKStockRequest first
    try:
        hk_req = (
            HKStockRequest.objects.filter(pk=pk, requested_by=user)
            .select_related(
                'area',
                'item',
                'item__category',
                'inventory_request',
                'inventory_request__approved_by',
                'inventory_request__issue',
                'inventory_request__issue__issued_by',
                'inventory_request__issue__return_recorded_by',
            )
            .prefetch_related(
                Prefetch(
                    'inventory_request__issue__usage_logs',
                    queryset=ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
                )
            )
            .first()
        )
        if hk_req:
            return _format_hk_request_tx(hk_req)
    except Exception:
        pass

    # Try ItemIssue
    try:
        issue = (
            ItemIssue.objects.filter(pk=pk, request__requested_by=user)
            .select_related(
                'request',
                'request__item',
                'request__item__category',
                'request__approved_by',
                'issued_by',
                'return_recorded_by',
            )
            .prefetch_related(
                Prefetch(
                    'usage_logs',
                    queryset=ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
                )
            )
            .first()
        )
        if issue:
            return _format_standalone_issue_tx(issue)
    except Exception:
        pass

    return None
