from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone

from .models import Category, Item, ItemIssue, ItemRequest, StockEntry


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

    all_pending = ItemRequest.objects.filter(
        status='pending'
    ).select_related('requested_by', 'item', 'item__category').order_by('-requested_at')

    paginator = Paginator(all_pending, 5)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/manager_requests.html', {
        'requests': page_obj,
        'page_obj': page_obj,
        'total_pending': all_pending.count(),
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

    inventory_data = None
    requests_data = None

    if report_type == 'requests':
        requests_data = generate_requests_report(date_from or None, date_to or None)
    else:
        inventory_data = generate_inventory_report(
            status_filter=status_filter if status_filter and status_filter != 'all' else None
        )

    return render(request, 'inventory/mobile/reports.html', {
        'report_type': report_type,
        'inventory_data': inventory_data,
        'requests_data': requests_data,
        'status_filter': status_filter or 'all',
        'date_from': date_from,
        'date_to': date_to,
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
    """Approve a pending request (manager/admin only)."""
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(
            ItemRequest.objects.select_for_update(), pk=pk
        )
        if item_request.status == 'pending':
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
    """Reject a pending request with an optional reason."""
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(ItemRequest, pk=pk)
        if item_request.status == 'pending':
            item_request.status = 'rejected'
            item_request.approved_by = request.user
            item_request.rejection_reason = request.POST.get('rejection_reason', '').strip()
            item_request.reviewed_at = timezone.now()
            item_request.units_remaining = item_request.item.available_quantity
            item_request.save(update_fields=[
                'status', 'approved_by', 'rejection_reason', 'reviewed_at', 'units_remaining'
            ])
            try:
                from apps.housekeeping.models import HKStockRequest
                hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
                if hk_req:
                    hk_req.status = 'rejected'
                    hk_req.save(update_fields=['status'])
            except Exception:
                pass
    return redirect('mobile_manager_requests')


@login_required
@transaction.atomic
def mobile_issue_request(request, pk):
    """Issue an approved request: deduct stock and create ItemIssue record."""
    if request.method == 'POST':
        role = getattr(request.user, 'role', '')
        if role not in ['admin', 'inventory_manager']:
            return redirect('mobile_dashboard')

        item_request = get_object_or_404(
            ItemRequest.objects.select_related('item').select_for_update(), pk=pk
        )

        # Allow issuing directly from pending (auto-approve + issue in one step)
        if item_request.status not in ['pending', 'approved']:
            return redirect('mobile_manager_requests')

        item = item_request.item

        try:
            qty = int(request.POST.get('quantity', item_request.quantity_requested))
        except (ValueError, TypeError):
            qty = item_request.quantity_requested

        qty = max(1, qty)

        if item.available_quantity < qty:
            # Not enough stock — redirect back without issuing
            return redirect('mobile_manager_requests')

        # Deduct stock atomically
        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - qty
        )

        # If still pending, mark it approved first
        if item_request.status == 'pending':
            item_request.approved_by = request.user
            item_request.reviewed_at = timezone.now()
            item_request.units_remaining = item.available_quantity

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
