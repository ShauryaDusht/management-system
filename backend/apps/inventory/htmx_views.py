from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone

from .models import Category, Item, ItemIssue, ItemRequest, StockEntry, PurchaseRequest


# ─────────────────────────────────────────────────
# AUTH VIEWS
# ─────────────────────────────────────────────────

def mobile_login(request):
    if request.user.is_authenticated:
        if getattr(request.user, 'role', '') in ['admin', 'inventory_manager']:
            return redirect('/inventory/mobile/')
        return redirect('/portal/login/')

    allowed_roles = ['admin', 'inventory_manager']
    error = ''
    next_url = '/inventory/mobile/'

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        raw_next = request.POST.get('next', '').strip()

        user = authenticate(request, username=username, password=password)
        if user is not None and user.is_active and getattr(user, 'role', '') in allowed_roles:
            auth_login(request, user)
            if raw_next and url_has_allowed_host_and_scheme(
                url=raw_next,
                allowed_hosts={request.get_host()},
                require_https=request.is_secure(),
            ):
                return redirect(raw_next)
            return redirect('/inventory/mobile/')
        error = 'You do not have inventory portal access.' if user and user.is_active else 'Invalid username or password.'
    else:
        raw_next = request.GET.get('next', '').strip()
        if raw_next and url_has_allowed_host_and_scheme(
            url=raw_next,
            allowed_hosts={request.get_host()},
            require_https=request.is_secure(),
        ):
            next_url = raw_next

    return render(request, 'inventory/mobile/login.html', {
        'error': error,
        'next': next_url,
    })


def mobile_logout(request):
    if request.method == 'POST':
        auth_logout(request)
    return redirect('/portal/login/')


# ─────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────

@login_required
def mobile_dashboard(request):
    items = Item.objects.all()
    low_stock = items.filter(
        available_quantity__gt=0,
        available_quantity__lte=F('threshold_quantity'),
    )
    pending = ItemRequest.objects.filter(status='pending')

    context = {
        'total_items': items.count(),
        'low_stock_items': low_stock[:3],
        'low_stock_count': low_stock.count(),
        'out_of_stock_count': items.filter(available_quantity=0).count(),
        'pending_requests': pending.select_related('requested_by', 'item')[:10],
        'pending_count': pending.count(),
        'role': getattr(request.user, 'role', ''),
        'purchase_pending_count': PurchaseRequest.objects.filter(
            requested_by=request.user, status='pending'
        ).count(),
    }
    return render(request, 'inventory/mobile/dashboard.html', context)


# ─────────────────────────────────────────────────
# INVENTORY LIST  (paginated + search + low_stock filter)
# ─────────────────────────────────────────────────

@login_required
def mobile_inventory_list(request):
    category_id = request.GET.get('category', '')
    search_query = request.GET.get('search', '').strip()
    low_stock_filter = request.GET.get('low_stock') == 'true'
    out_of_stock_filter = request.GET.get('out_of_stock') == 'true'

    categories = Category.objects.all()
    items_qs = Item.objects.select_related('category').all()

    if category_id:
        items_qs = items_qs.filter(category_id=category_id)

    if search_query:
        items_qs = items_qs.filter(name__icontains=search_query)

    if low_stock_filter:
        items_qs = items_qs.filter(
            available_quantity__gt=0,
            available_quantity__lte=F('threshold_quantity'),
        )
    elif out_of_stock_filter:
        items_qs = items_qs.filter(available_quantity=0)

    # Pagination — 15 items per page
    paginator = Paginator(items_qs, 15)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/list.html', {
        'items': page_obj,
        'page_obj': page_obj,
        'categories': categories,
        'selected_category': category_id,
        'total_count': Item.objects.count(),
        'search_query': search_query,
        'low_stock_filter': low_stock_filter,
        'out_of_stock_filter': out_of_stock_filter,
        'highlight_id': request.GET.get('highlight', ''),
    })


# ─────────────────────────────────────────────────
# REQUEST FORM
# ─────────────────────────────────────────────────

@login_required
def mobile_request_form(request):
    if request.method == 'POST':
        item_id = request.POST.get('item')
        items = Item.objects.all().order_by('name')

        try:
            quantity = int(request.POST.get('quantity_requested', 1))
        except (ValueError, TypeError):
            return render(request, 'inventory/mobile/request_form.html', {
                'items': items,
                'error': 'Quantity must be a whole number.',
            })

        if quantity < 1:
            return render(request, 'inventory/mobile/request_form.html', {
                'items': items,
                'error': 'Quantity must be at least 1.',
            })

        reason = request.POST.get('reason', '').strip()
        if not reason:
            return render(request, 'inventory/mobile/request_form.html', {
                'items': items,
                'error': 'Please provide a reason for your request.',
            })

        notes = request.POST.get('notes', '')
        item = get_object_or_404(Item, id=item_id)

        ItemRequest.objects.create(
            requested_by=request.user,
            item=item,
            quantity_requested=quantity,
            units_remaining=item.available_quantity,
            purpose=reason,
            notes=notes,
            status='pending',
        )
        return redirect('mobile_my_requests')

    items = Item.objects.select_related('category').all().order_by('name')
    return render(request, 'inventory/mobile/request_form.html', {
        'items': items,
        'preselected_item': request.GET.get('item', ''),
    })


# ─────────────────────────────────────────────────
# MY REQUESTS
# ─────────────────────────────────────────────────

@login_required
def mobile_my_requests(request):
    requests_qs = ItemRequest.objects.filter(
        requested_by=request.user
    ).select_related('item').order_by('-requested_at')

    paginator = Paginator(requests_qs, 15)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/my_requests.html', {
        'requests': page_obj,
        'page_obj': page_obj,
    })


# ─────────────────────────────────────────────────
# MANAGER REQUESTS
# ─────────────────────────────────────────────────

@login_required
def mobile_manager_requests(request):
    user = request.user
    if getattr(user, 'role', '') not in ['admin', 'inventory_manager']:
        return redirect('mobile_dashboard')

    role = getattr(user, 'role', '')
    active_tab = request.GET.get('tab', 'requests')

    # Inventory managers see only pending requests (their queue to approve)
    # Admins see pending AND manager_approved requests
    if role == 'admin':
        pending_qs = ItemRequest.objects.filter(
            status__in=['pending', 'manager_approved']
        ).select_related('requested_by', 'item', 'item__category', 'manager_approved_by').order_by('-requested_at')
    else:
        # inventory_manager sees only truly pending requests
        pending_qs = ItemRequest.objects.filter(
            status='pending'
        ).select_related('requested_by', 'item', 'item__category').order_by('-requested_at')

    total_pending = ItemRequest.objects.filter(status='pending').count()
    total_manager_approved = ItemRequest.objects.filter(status='manager_approved').count()

    # Fully approved requests ready to be issued (admin-approved)
    approved_for_issue = ItemRequest.objects.filter(
        status='approved'
    ).select_related('requested_by', 'item').order_by('-reviewed_at')[:10]

    paginator = Paginator(pending_qs, 5)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    # Purchase requests for embedded tab
    purchase_qs = PurchaseRequest.objects.filter(
        requested_by=user
    ).select_related('reviewed_by').order_by('-requested_at')
    purchase_status_filter = request.GET.get('pr_status', 'all')
    if purchase_status_filter != 'all':
        purchase_qs = purchase_qs.filter(status=purchase_status_filter)
    purchase_paginator = Paginator(purchase_qs, 8)
    purchase_page_obj = purchase_paginator.get_page(request.GET.get('pr_page', 1))
    purchase_pending_count = PurchaseRequest.objects.filter(
        requested_by=user, status='pending'
    ).count()

    return render(request, 'inventory/mobile/manager_requests.html', {
        'requests': page_obj,
        'page_obj': page_obj,
        'total_pending': total_pending,
        'total_manager_approved': total_manager_approved,
        'approved_for_issue': approved_for_issue,
        'user_role': role,
        'active_tab': active_tab,
        'purchase_requests': purchase_page_obj,
        'purchase_page_obj': purchase_page_obj,
        'purchase_status_filter': purchase_status_filter,
        'purchase_pending_count': purchase_pending_count,
    })


# ─────────────────────────────────────────────────
# ISSUED ITEMS
# ─────────────────────────────────────────────────

@login_required
def mobile_issued_items(request):
    role = getattr(request.user, 'role', '')
    is_manager = role in ['admin', 'inventory_manager']

    issues_qs = ItemIssue.objects.select_related(
        'request',
        'request__item',
        'request__item__category',
        'request__requested_by',
        'issued_by',
    ).order_by('-issued_at')

    if not is_manager:
        issues_qs = issues_qs.filter(request__requested_by=request.user)

    paginator = Paginator(issues_qs, 10)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/issued_items.html', {
        'issues': page_obj,
        'page_obj': page_obj,
        'is_manager': is_manager,
    })


# ─────────────────────────────────────────────────
# STOCK LOG
# ─────────────────────────────────────────────────

@login_required
def mobile_stock_log(request):
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager']:
        return redirect('mobile_dashboard')

    entries = StockEntry.objects.select_related('item', 'item__category', 'added_by').order_by('-added_at')
    paginator = Paginator(entries, 20)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/stock_log.html', {
        'entries': page_obj,
        'page_obj': page_obj,
    })


# ─────────────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────────────

@login_required
def mobile_reports(request):
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager']:
        return redirect('mobile_dashboard')

    from apps.reports.generators import generate_inventory_report, generate_requests_report

    report_type = request.GET.get('type', 'inventory')
    status_filter = request.GET.get('filter', 'all')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    page_num = request.GET.get('page', 1)

    PAGE_SIZE = 15

    inventory_data = None
    requests_data = None
    inv_page_obj = None
    req_page_obj = None

    if report_type == 'requests':
        raw = generate_requests_report(date_from or None, date_to or None)
        paginator = Paginator(raw.get('requests', []), PAGE_SIZE)
        req_page_obj = paginator.get_page(page_num)
        requests_data = {
            **raw,
            'requests': list(req_page_obj),
        }
    else:
        raw = generate_inventory_report(
            status_filter=status_filter if status_filter and status_filter != 'all' else None
        )
        paginator = Paginator(raw.get('items', []), PAGE_SIZE)
        inv_page_obj = paginator.get_page(page_num)
        inventory_data = {
            **raw,
            'items': list(inv_page_obj),
        }

    return render(request, 'inventory/mobile/reports.html', {
        'report_type': report_type,
        'inventory_data': inventory_data,
        'requests_data': requests_data,
        'status_filter': status_filter or 'all',
        'date_from': date_from,
        'date_to': date_to,
        'inv_page_obj': inv_page_obj,
        'req_page_obj': req_page_obj,
    })


# ─────────────────────────────────────────────────
# PROFILE
# ─────────────────────────────────────────────────

@login_required
def mobile_profile(request):
    return render(request, 'inventory/mobile/profile.html', {
        'user': request.user,
    })


@login_required
def mobile_change_password(request):
    if request.method == 'POST':
        current = request.POST.get('current_password')
        new_pass = request.POST.get('new_password')
        confirm = request.POST.get('confirm_password')
        error = None

        if not request.user.check_password(current):
            error = 'Current password is incorrect.'
        elif new_pass != confirm:
            error = 'New passwords do not match.'
        elif len(new_pass) < 8:
            error = 'Password must be at least 8 characters.'

        if error:
            return render(request, 'inventory/mobile/profile.html', {
                'user': request.user,
                'error': error,
            })

        request.user.set_password(new_pass)
        request.user.save()
        update_session_auth_hash(request, request.user)
        return render(request, 'inventory/mobile/profile.html', {
            'user': request.user,
            'success': 'Password changed successfully.',
        })

    return redirect('mobile_profile')


# ─────────────────────────────────────────────────
# REQUEST ACTIONS
# ─────────────────────────────────────────────────

@login_required
@transaction.atomic
def mobile_approve_request(request, pk):
    """
    Two-level approval:
    - inventory_manager: pending → manager_approved
    - admin: pending → manager_approved → approved (admin does final approval)
    """
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(
            ItemRequest.objects.select_for_update(), pk=pk
        )

        if role == 'inventory_manager' and item_request.status == 'pending':
            # Manager gives first-level approval
            item_request.status = 'manager_approved'
            item_request.manager_approved_by = request.user
            item_request.manager_approved_at = timezone.now()
            item_request.save(update_fields=[
                'status', 'manager_approved_by', 'manager_approved_at'
            ])
        elif role == 'admin' and item_request.status == 'pending':
            # Admin can also do first-level approval (skips manager step)
            item_request.status = 'manager_approved'
            item_request.manager_approved_by = request.user
            item_request.manager_approved_at = timezone.now()
            item_request.save(update_fields=[
                'status', 'manager_approved_by', 'manager_approved_at'
            ])
        elif role == 'admin' and item_request.status == 'manager_approved':
            # Admin gives final approval
            item = item_request.item
            item_request.units_remaining = item.available_quantity
            item_request.status = 'approved'
            item_request.approved_by = request.user
            item_request.reviewed_at = timezone.now()
            item_request.save(update_fields=[
                'status', 'approved_by', 'reviewed_at', 'units_remaining'
            ])

    return redirect('mobile_manager_requests')


@login_required
def mobile_reject_request(request, pk):
    """Reject a pending or manager_approved request with an optional reason."""
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(ItemRequest, pk=pk)
        if item_request.status in ['pending', 'manager_approved']:
            item_request.status = 'rejected'
            item_request.approved_by = request.user
            item_request.rejection_reason = request.POST.get('rejection_reason', '').strip()
            item_request.reviewed_at = timezone.now()
            item_request.units_remaining = item_request.item.available_quantity
            item_request.save(update_fields=[
                'status', 'approved_by', 'rejection_reason', 'reviewed_at', 'units_remaining'
            ])
    return redirect('mobile_manager_requests')


@login_required
@transaction.atomic
def mobile_issue_request(request, pk):
    """Issue a fully-approved request: deduct stock and create ItemIssue record.
    Requires status == 'approved' (admin has given final approval).
    """
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(
            ItemRequest.objects.select_related('item').select_for_update(), pk=pk
        )

        # Only issue requests that have been fully approved by admin
        if item_request.status != 'approved':
            return redirect('mobile_manager_requests')

        item = item_request.item

        try:
            qty = int(request.POST.get('quantity', item_request.quantity_requested))
        except (ValueError, TypeError):
            qty = item_request.quantity_requested

        qty = max(1, qty)

        if item.available_quantity < qty:
            return redirect('mobile_manager_requests')

        # Deduct stock atomically — available + total both decrease on issue so
        # returning the asset later can safely restore both without violating the
        # available_lte_total DB constraint.
        reserved_to_release = min(item.reserved_quantity, item_request.quantity_requested)
        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - qty,
            total_quantity=F('total_quantity') - qty,
            reserved_quantity=F('reserved_quantity') - reserved_to_release,
        )

        item_request.status = 'issued'
        item_request.save()

        ItemIssue.objects.update_or_create(
            request=item_request,
            defaults={
                'issued_by': request.user,
                'issued_quantity': qty,
                'notes': request.POST.get('notes', ''),
            },
        )
    return redirect('mobile_manager_requests')


# ─────────────────────────────────────────────────
# PURCHASE REQUESTS — MOBILE
# ─────────────────────────────────────────────────

@login_required
def mobile_purchase_requests(request):
    """List purchase requests submitted by this manager."""
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager']:
        return redirect('mobile_dashboard')

    status_filter = request.GET.get('status', 'all')

    qs = PurchaseRequest.objects.filter(
        requested_by=request.user
    ).select_related('reviewed_by').order_by('-requested_at')

    if status_filter != 'all':
        qs = qs.filter(status=status_filter)

    paginator = Paginator(qs, 10)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/purchase_requests.html', {
        'purchase_requests': page_obj,
        'page_obj': page_obj,
        'status_filter': status_filter,
        'total_pending': PurchaseRequest.objects.filter(
            requested_by=request.user, status='pending'
        ).count(),
    })


@login_required
def mobile_purchase_request_form(request):
    """Form to submit a new purchase request."""
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager']:
        return redirect('mobile_dashboard')

    # All inventory items for the autocomplete dropdown
    all_items = list(
        Item.objects.values('name', 'unit', 'available_quantity').order_by('name')
    )

    priority_opts = PurchaseRequest.Priority.choices

    if request.method == 'POST':
        item_name = request.POST.get('item_name', '').strip()
        quantity_str = request.POST.get('quantity_required', '1')
        unit = request.POST.get('unit', '').strip()
        description = request.POST.get('description', '').strip()
        priority = request.POST.get('priority', 'medium')
        estimated_cost_str = request.POST.get('estimated_cost', '').strip()

        errors = []

        if not item_name:
            errors.append('Item name is required.')

        try:
            quantity = int(quantity_str)
            if quantity < 1:
                raise ValueError
        except (ValueError, TypeError):
            errors.append('Quantity must be a positive whole number.')
            quantity = 1

        if priority not in ['low', 'medium', 'high', 'urgent']:
            priority = 'medium'

        estimated_cost = None
        if estimated_cost_str:
            try:
                estimated_cost = float(estimated_cost_str)
                if estimated_cost < 0:
                    raise ValueError
            except (ValueError, TypeError):
                errors.append('Estimated cost must be a valid positive number.')

        if errors:
            return render(request, 'inventory/mobile/purchase_request_form.html', {
                'errors': errors,
                'form_data': request.POST,
                'all_items': all_items,
                'priority_opts': priority_opts,
            })

        PurchaseRequest.objects.create(
            item_name=item_name,
            quantity_required=quantity,
            unit=unit,
            description=description,
            priority=priority,
            estimated_cost=estimated_cost,
            requested_by=request.user,
            status='pending',
        )
        return redirect('mobile_purchase_requests')

    return render(request, 'inventory/mobile/purchase_request_form.html', {
        'errors': [],
        'form_data': {},
        'all_items': all_items,
        'priority_opts': priority_opts,
    })
