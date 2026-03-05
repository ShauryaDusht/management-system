"""
Mobile (HTMX/Django template) views for the Inventory mobile app.
No API contracts changed — only the template context is enriched.
"""
from django.contrib.auth import (
    authenticate, login as auth_login,
    logout as auth_logout, update_session_auth_hash,
)
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone

from .models import Category, Item, ItemIssue, ItemRequest, StockEntry


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pending_count():
    """Returns global pending request count for the nav badge."""
    return ItemRequest.objects.filter(status='pending').count()


def _base_context(request):
    """Common context injected into every view so the nav badge is current."""
    role = getattr(request.user, 'role', '')
    ctx = {'pending_count': _pending_count(), 'role': role}
    return ctx


# ─── Auth ──────────────────────────────────────────────────────────────────────

def mobile_login(request):
    if request.user.is_authenticated:
        return redirect('/inventory/mobile/')

    error = ''
    next_url = '/inventory/mobile/'

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        raw_next = request.POST.get('next', '').strip()

        user = authenticate(request, username=username, password=password)
        if user is not None:
            auth_login(request, user)
            if raw_next and url_has_allowed_host_and_scheme(
                url=raw_next,
                allowed_hosts={request.get_host()},
                require_https=request.is_secure(),
            ):
                return redirect(raw_next)
            return redirect('/inventory/mobile/')
        error = 'Invalid username or password.'
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


# ─── Dashboard ─────────────────────────────────────────────────────────────────

@login_required
def mobile_dashboard(request):
    items = Item.objects.all()
    low_stock = items.filter(available_quantity__lt=F('threshold_quantity'))
    pending = ItemRequest.objects.filter(status='pending')

    ctx = _base_context(request)
    ctx.update({
        'total_items': items.count(),
        'low_stock_items': low_stock.select_related('category')[:3],
        'low_stock_count': low_stock.count(),
        'out_of_stock_count': items.filter(available_quantity=0).count(),
        'pending_requests': pending.select_related('requested_by', 'item')[:5],
        'pending_count': pending.count(),  # override for accuracy
        'role': getattr(request.user, 'role', ''),
    })
    return render(request, 'inventory/mobile/dashboard.html', ctx)


# ─── Reports ───────────────────────────────────────────────────────────────────

@login_required
def mobile_reports(request):
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager', 'manager']:
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

    ctx = _base_context(request)
    ctx.update({
        'report_type': report_type,
        'inventory_data': inventory_data,
        'requests_data': requests_data,
        'status_filter': status_filter or 'all',
        'date_from': date_from,
        'date_to': date_to,
    })
    return render(request, 'inventory/mobile/reports.html', ctx)


# ─── Inventory List (with pagination + highlight) ──────────────────────────────

@login_required
def mobile_inventory_list(request):
    category_id = request.GET.get('category', '')
    search_query = request.GET.get('search', '').strip()
    low_stock_only = request.GET.get('low_stock', '') == 'true'
    highlight_id = request.GET.get('highlight', '')

    categories = Category.objects.all()
    items_qs = Item.objects.select_related('category').all()

    out_of_stock_only = request.GET.get('out_of_stock', '') == 'true'

    if category_id:
        items_qs = items_qs.filter(category_id=category_id)
    if search_query:
        items_qs = items_qs.filter(name__icontains=search_query)
    if low_stock_only:
        items_qs = items_qs.filter(available_quantity__lt=F('threshold_quantity'))
    if out_of_stock_only:
        items_qs = items_qs.filter(available_quantity=0)

    # Annotate is_low_stock on queryset items
    for item in items_qs:
        item.is_low_stock = item.available_quantity < item.threshold_quantity

    # Pagination: 15 items per page
    paginator = Paginator(items_qs, 15)
    page_number = request.GET.get('page', 1)
    page_obj = paginator.get_page(page_number)

    # Re-annotate page items
    for item in page_obj:
        item.is_low_stock = item.available_quantity < item.threshold_quantity

    # Highlighted item (from notification click)
    highlighted_item = None
    if highlight_id:
        try:
            highlighted_item = Item.objects.select_related('category').get(pk=int(highlight_id))
        except (Item.DoesNotExist, ValueError):
            pass

    ctx = _base_context(request)
    ctx.update({
        'page_obj': page_obj,
        'items': page_obj,  # backward compat alias
        'categories': categories,
        'selected_category': category_id,
        'search_query': search_query,
        'total_count': Item.objects.count(),
        'highlighted_item': highlighted_item,
    })
    return render(request, 'inventory/mobile/list.html', ctx)


# ─── Request Form ──────────────────────────────────────────────────────────────

@login_required
def mobile_request_form(request):
    if request.method == 'POST':
        item_id = request.POST.get('item')

        try:
            quantity = int(request.POST.get('quantity_requested', 1))
        except (ValueError, TypeError):
            items = Item.objects.all().order_by('name')
            ctx = _base_context(request)
            ctx.update({'items': items, 'error': 'Quantity must be a whole number.'})
            return render(request, 'inventory/mobile/request_form.html', ctx)

        if quantity < 1:
            items = Item.objects.all().order_by('name')
            ctx = _base_context(request)
            ctx.update({'items': items, 'error': 'Quantity must be at least 1.'})
            return render(request, 'inventory/mobile/request_form.html', ctx)

        reason = request.POST.get('reason', '')
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
        return redirect('mobile_dashboard')

    items = Item.objects.all().order_by('name')
    ctx = _base_context(request)
    ctx['items'] = items
    return render(request, 'inventory/mobile/request_form.html', ctx)


# ─── My Requests ───────────────────────────────────────────────────────────────

@login_required
def mobile_my_requests(request):
    requests_qs = ItemRequest.objects.filter(
        requested_by=request.user
    ).select_related('item').order_by('-requested_at')

    ctx = _base_context(request)
    ctx['requests'] = requests_qs
    return render(request, 'inventory/mobile/my_requests.html', ctx)


# ─── Manager Requests ──────────────────────────────────────────────────────────

@login_required
def mobile_manager_requests(request):
    user = request.user
    if getattr(user, 'role', '') not in ['admin', 'inventory_manager', 'manager']:
        return redirect('mobile_dashboard')

    all_pending = ItemRequest.objects.filter(
        status='pending'
    ).select_related('requested_by', 'item', 'item__category').order_by('-requested_at')

    paginator = Paginator(all_pending, 5)
    page_num = request.GET.get('page', 1)
    page_obj = paginator.get_page(page_num)
    total_pending = all_pending.count()

    ctx = _base_context(request)
    ctx.update({
        'requests': page_obj,
        'page_obj': page_obj,
        'total_pending': total_pending,
        'pending_count': total_pending,  # override for nav badge accuracy
    })
    return render(request, 'inventory/mobile/manager_requests.html', ctx)


# ─── Issued Items ──────────────────────────────────────────────────────────────

@login_required
def mobile_issued_items(request):
    role = getattr(request.user, 'role', '')
    is_manager = role in ['admin', 'inventory_manager', 'manager']

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

    ctx = _base_context(request)
    ctx.update({
        'issues': page_obj,
        'page_obj': page_obj,
        'is_manager': is_manager,
    })
    return render(request, 'inventory/mobile/issued_items.html', ctx)


# ─── Stock Log ─────────────────────────────────────────────────────────────────

@login_required
def mobile_stock_log(request):
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager', 'manager']:
        return redirect('mobile_dashboard')

    entries = StockEntry.objects.select_related('item', 'item__category', 'added_by').order_by('-added_at')[:50]

    ctx = _base_context(request)
    ctx['entries'] = entries
    return render(request, 'inventory/mobile/stock_log.html', ctx)


# ─── Approve / Reject / Issue ──────────────────────────────────────────────────

@login_required
@transaction.atomic
def mobile_approve_request(request, pk):
    if request.method == 'POST':
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
    if request.method == 'POST':
        item_request = get_object_or_404(ItemRequest, pk=pk)
        if item_request.status == 'pending':
            item_request.status = 'rejected'
            item_request.approved_by = request.user
            item_request.rejection_reason = request.POST.get('rejection_reason', '')
            item_request.reviewed_at = timezone.now()
            item_request.save(update_fields=[
                'status', 'approved_by', 'rejection_reason', 'reviewed_at'
            ])
    return redirect('mobile_manager_requests')


@login_required
@transaction.atomic
def mobile_issue_request(request, pk):
    if request.method == 'POST':
        item_request = get_object_or_404(
            ItemRequest.objects.select_related('item').select_for_update(), pk=pk
        )

        if item_request.status != 'approved':
            return redirect('mobile_manager_requests')

        item = item_request.item

        try:
            qty = int(request.POST.get('quantity', item_request.quantity_requested))
        except (ValueError, TypeError):
            qty = item_request.quantity_requested

        if qty < 1 or item.available_quantity < qty:
            return redirect('mobile_manager_requests')

        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - qty
        )

        item_request.status = 'issued'
        item_request.save(update_fields=['status'])

        ItemIssue.objects.update_or_create(
            request=item_request,
            defaults={
                'issued_by': request.user,
                'issued_quantity': qty,
                'notes': request.POST.get('notes', ''),
            },
        )
    return redirect('mobile_manager_requests')


# ─── Profile & Password ────────────────────────────────────────────────────────

@login_required
def mobile_profile(request):
    ctx = _base_context(request)
    ctx['user'] = request.user
    return render(request, 'inventory/mobile/profile.html', ctx)


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

        ctx = _base_context(request)
        ctx['user'] = request.user

        if error:
            ctx['error'] = error
            ctx['show_password_form'] = True
            return render(request, 'inventory/mobile/profile.html', ctx)

        request.user.set_password(new_pass)
        request.user.save()
        update_session_auth_hash(request, request.user)
        ctx['success'] = 'Password changed successfully.'
        return render(request, 'inventory/mobile/profile.html', ctx)

    return redirect('mobile_profile')


def mobile_logout(request):
    if request.method == 'POST':
        auth_logout(request)
    return redirect('mobile_login')
