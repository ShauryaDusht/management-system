from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone

from .models import Category, Item, ItemIssue, ItemRequest, StockEntry


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


@login_required
def mobile_dashboard(request):
    items = Item.objects.all()
    low_stock = items.filter(available_quantity__lte=F('threshold_quantity'))
    pending = ItemRequest.objects.filter(status='pending')

    context = {
        'total_items': items.count(),
        'low_stock_items': low_stock[:3],
        'low_stock_count': low_stock.count(),
        'out_of_stock_count': items.filter(available_quantity=0).count(),
        'pending_requests': pending.select_related('requested_by', 'item')[:5],
        'pending_count': pending.count(),
        'role': getattr(request.user, 'role', ''),
    }
    return render(request, 'inventory/mobile/dashboard.html', context)


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

    return render(request, 'inventory/mobile/reports.html', {
        'report_type': report_type,
        'inventory_data': inventory_data,
        'requests_data': requests_data,
        'status_filter': status_filter or 'all',
        'date_from': date_from,
        'date_to': date_to,
    })


@login_required
def mobile_inventory_list(request):
    category_id = request.GET.get('category', '')
    categories = Category.objects.all()
    items = Item.objects.select_related('category').all()
    if category_id:
        items = items.filter(category_id=category_id)

    for item in items:
        item.is_low_stock = item.available_quantity <= item.threshold_quantity

    return render(request, 'inventory/mobile/list.html', {
        'items': items,
        'categories': categories,
        'selected_category': category_id,
        'total_count': Item.objects.count(),
    })


@login_required
def mobile_request_form(request):
    if request.method == 'POST':
        item_id = request.POST.get('item')

        try:
            quantity = int(request.POST.get('quantity_requested', 1))
        except (ValueError, TypeError):
            items = Item.objects.all().order_by('name')
            return render(request, 'inventory/mobile/request_form.html', {
                'items': items,
                'error': 'Quantity must be a whole number.',
            })
        if quantity < 1:
            items = Item.objects.all().order_by('name')
            return render(request, 'inventory/mobile/request_form.html', {
                'items': items,
                'error': 'Quantity must be at least 1.',
            })

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
    return render(request, 'inventory/mobile/request_form.html', {'items': items})


@login_required
def mobile_my_requests(request):
    requests = ItemRequest.objects.filter(
        requested_by=request.user
    ).select_related('item').order_by('-requested_at')
    return render(request, 'inventory/mobile/my_requests.html', {'requests': requests})


@login_required
def mobile_manager_requests(request):
    user = request.user
    if getattr(user, 'role', '') not in ['admin', 'inventory_manager', 'manager']:
        return redirect('mobile_dashboard')

    from django.core.paginator import Paginator

    all_pending = ItemRequest.objects.filter(
        status='pending'
    ).select_related('requested_by', 'item').order_by('-requested_at')
    paginator = Paginator(all_pending, 5)
    page_num = request.GET.get('page', 1)
    page_obj = paginator.get_page(page_num)

    return render(request, 'inventory/mobile/manager_requests.html', {
        'requests': page_obj,
        'page_obj': page_obj,
        'total_pending': all_pending.count(),
    })


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

    from django.core.paginator import Paginator
    paginator = Paginator(issues_qs, 10)
    page_obj = paginator.get_page(request.GET.get('page', 1))

    return render(request, 'inventory/mobile/issued_items.html', {
        'issues': page_obj,
        'page_obj': page_obj,
        'is_manager': is_manager,
    })


@login_required
def mobile_stock_log(request):
    role = getattr(request.user, 'role', '')
    if role not in ['admin', 'inventory_manager', 'manager']:
        return redirect('mobile_dashboard')

    entries = StockEntry.objects.select_related('item', 'added_by').order_by('-added_at')[:50]
    return render(request, 'inventory/mobile/stock_log.html', {
        'entries': entries,
    })


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
            item_request.save(update_fields=['status', 'approved_by', 'rejection_reason', 'reviewed_at'])
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
                'show_password_form': True,
            })

        request.user.set_password(new_pass)
        request.user.save()
        update_session_auth_hash(request, request.user)
        return render(request, 'inventory/mobile/profile.html', {
            'user': request.user,
            'success': 'Password changed successfully.',
        })

    return redirect('mobile_profile')


def mobile_logout(request):
    if request.method == 'POST':
        auth_logout(request)
    return redirect('mobile_login')
