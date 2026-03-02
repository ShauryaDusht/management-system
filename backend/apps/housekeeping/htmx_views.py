import datetime
from django.contrib.auth import (
    authenticate, login as auth_login, logout as auth_logout, update_session_auth_hash
)
from django.db import models as dm
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import (
    HKArea, HKUserArea, HKWorker, HKScheduleTemplate,
    HKDailyRecord, HKExtraWork, HKAttendanceRecord, HKSundayIncharge,
    HKAreaStock, HKStockRequest, HKAlert,
)

ATTENDANCE_CHOICES = [
    ('present', '✅ Present', '#d1fae5', '#065f46'),
    ('absent',  '❌ Absent',  '#fee2e2', '#991b1b'),
    ('late',    '🕐 Late',    '#fef3c7', '#92400e'),
    ('leave',   '🏖 Leave',   '#dbeafe', '#1d4ed8'),
]

WORKER_TAG_LABELS = {
    'room':     ('🛏', 'Room Staff'),
    'floor':    ('🧹', 'Floor Staff'),
    'washroom': ('🚿', 'Washroom Staff'),
    'all':      ('📋', 'All Staff'),
    'general':  ('📋', 'General'),
}


# ── HELPERS ──────────────────────────────────────────────────────────────────

def get_user_areas(user):
    if user.role in ['admin', 'manager']:
        return HKArea.objects.filter(is_active=True)
    return HKArea.objects.filter(assigned_users__user=user, is_active=True)


def hk_required(fn):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f'/housekeeping/login/?next={request.path}')
        if request.user.role not in ['admin', 'manager', 'supervisor', 'caretaker']:
            return redirect('/housekeeping/login/')
        return fn(request, *args, **kwargs)
    wrapper.__name__ = fn.__name__
    return wrapper


def selected_area(request, user_areas):
    aid = request.GET.get('area') or request.POST.get('area')
    if aid:
        a = user_areas.filter(pk=aid).first()
        if a:
            return a
    return user_areas.first()


def get_today_records(area, date):
    """
    Generate HKDailyRecord for every applicable template for this area/date.
    Caretaker hostels: daily templates run every day (Mon–Sun).
    sunday_extra templates run only on Sunday.
    """
    dow = date.weekday()  # 0=Mon, 6=Sun
    templates = HKScheduleTemplate.objects.filter(area=area, is_active=True, frequency='daily')
    if dow == 6:
        # On Sunday, also include the sunday_extra tasks
        sunday_qs = HKScheduleTemplate.objects.filter(area=area, is_active=True, frequency='sunday_extra')
        templates = (templates | sunday_qs).distinct()

    for tmpl in templates.order_by('worker_tag', 'order', 'start_time'):
        HKDailyRecord.objects.get_or_create(schedule=tmpl, area=area, date=date)

    return HKDailyRecord.objects.filter(area=area, date=date).select_related(
        'schedule', 'completed_by'
    ).order_by('schedule__worker_tag', 'schedule__order', 'schedule__start_time')


def current_half():
    h = timezone.localtime(timezone.now()).hour
    return 'first' if h < 13 else 'second'


def get_active_alerts(user, user_areas):
    now = timezone.now()
    return HKAlert.objects.filter(is_active=True).filter(
        dm.Q(expires_at__isnull=True) | dm.Q(expires_at__gt=now)
    ).filter(
        dm.Q(target_areas__isnull=True) | dm.Q(target_areas__in=user_areas)
    ).distinct()


# ── AUTH ─────────────────────────────────────────────────────────────────────

def hk_login(request):
    if request.user.is_authenticated and request.user.role in ['supervisor', 'caretaker', 'admin', 'manager']:
        return redirect('/housekeeping/dashboard/')
    next_url = request.GET.get('next', '/housekeeping/dashboard/')
    error = ''
    if request.method == 'POST':
        next_url = request.POST.get('next', '/housekeeping/dashboard/')
        user = authenticate(request,
            username=request.POST.get('username', '').strip(),
            password=request.POST.get('password', ''),
        )
        if user and user.is_active and user.role in ['supervisor', 'caretaker', 'admin', 'manager']:
            auth_login(request, user)
            return redirect(next_url)
        error = 'You do not have housekeeping access.' if (user and user.is_active) else 'Invalid username or password.'
    return render(request, 'housekeeping/mobile/login.html', {'error': error, 'next': next_url})


def hk_logout(request):
    auth_logout(request)
    return redirect('/housekeeping/login/')


# ── DASHBOARD ────────────────────────────────────────────────────────────────

@hk_required
def hk_dashboard(request):
    user = request.user
    today = timezone.localdate()
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)

    records = list(get_today_records(sel_area, today)) if sel_area else []

    # Group by worker_tag
    grouped = {}
    for r in records:
        tag = r.schedule.worker_tag or 'general'
        grouped.setdefault(tag, []).append(r)

    total = len(records)
    done = sum(1 for r in records if r.status == 'done')
    pct = int((done / total) * 100) if total else 0

    today_dow = today.weekday()
    sunday_incharge = None
    upcoming_sunday = None
    area_workers = []
    if today_dow == 5 and sel_area:  # Saturday only
        upcoming_sunday = today + datetime.timedelta(days=1)
        sunday_incharge = HKSundayIncharge.objects.filter(
            area=sel_area, for_sunday=upcoming_sunday
        ).first()
        area_workers = list(HKWorker.objects.filter(area=sel_area, is_active=True).order_by('name'))

    extra_works = HKExtraWork.objects.filter(area=sel_area, date=today).order_by('-logged_at') if sel_area else []

    return render(request, 'housekeeping/mobile/dashboard.html', {
        'today': today, 'today_dow': today_dow,
        'user_areas': user_areas, 'selected_area': sel_area,
        'records': records, 'grouped': grouped,
        'tag_labels': WORKER_TAG_LABELS,
        'total_tasks': total, 'done_tasks': done, 'percent_done': pct,
        'alerts': get_active_alerts(user, user_areas),
        'sunday_incharge': sunday_incharge, 'upcoming_sunday': upcoming_sunday,
        'area_workers': area_workers, 'extra_works': extra_works,
    })


# ── MARK TASK ────────────────────────────────────────────────────────────────

@hk_required
def hk_mark_task(request, record_id):
    if request.method != 'POST':
        return HttpResponseForbidden()
    record = get_object_or_404(HKDailyRecord, pk=record_id)
    user = request.user
    if record.area not in get_user_areas(user):
        return HttpResponseForbidden('Not your area.')

    if request.POST.get('action') == 'undo':
        record.status = 'pending'
        record.completed_by = None
        record.completed_at = None
        record.save(update_fields=['status', 'completed_by', 'completed_at'])
    else:
        record.status = 'done'
        record.completed_by = user
        record.completed_at = timezone.now()
        record.note = request.POST.get('note', '')
        if 'photo_before' in request.FILES:
            record.photo_before = request.FILES['photo_before']
        if 'photo_after' in request.FILES:
            record.photo_after = request.FILES['photo_after']
        lat, lng = request.POST.get('latitude'), request.POST.get('longitude')
        if lat and lng:
            try:
                record.latitude, record.longitude = float(lat), float(lng)
            except (ValueError, TypeError):
                pass
        record.save()

    return render(request, 'housekeeping/mobile/partials/task_card.html', {
        'record': record, 'tag_labels': WORKER_TAG_LABELS,
    })


# ── LOG EXTRA WORK ────────────────────────────────────────────────────────────

@hk_required
def hk_log_extra_work(request):
    if request.method != 'POST':
        return redirect('/housekeeping/dashboard/')
    user = request.user
    user_areas = get_user_areas(user)
    area_id = request.POST.get('area_id')
    area = user_areas.filter(pk=area_id).first() or user_areas.first()
    extra = HKExtraWork(
        area=area, date=timezone.localdate(),
        task_name=request.POST.get('task_name', '').strip(),
        description=request.POST.get('description', '').strip(),
        worker_name=request.POST.get('worker_name', '').strip(),
        logged_by=user,
    )
    if 'photo' in request.FILES:
        extra.photo = request.FILES['photo']
    extra.save()
    param = f'?area={area.id}' if area else ''
    return redirect(f'/housekeeping/dashboard/{param}')


# ── SCHEDULE ─────────────────────────────────────────────────────────────────

@hk_required
def hk_schedule(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)

    DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    weekly = []
    if sel_area:
        daily = list(HKScheduleTemplate.objects.filter(
            area=sel_area, is_active=True, frequency='daily'
        ).order_by('worker_tag', 'order', 'start_time'))
        sunday_extra = list(HKScheduleTemplate.objects.filter(
            area=sel_area, is_active=True, frequency='sunday_extra'
        ).order_by('order', 'start_time'))
        for i, day in enumerate(DAYS):
            tasks = daily + sunday_extra if i == 6 else daily
            weekly.append({'day': day, 'day_idx': i, 'tasks': tasks})

    return render(request, 'housekeeping/mobile/schedule.html', {
        'user_areas': user_areas, 'selected_area': sel_area,
        'weekly': weekly, 'today_dow': timezone.localdate().weekday(),
        'tag_labels': WORKER_TAG_LABELS,
    })


# ── ATTENDANCE ────────────────────────────────────────────────────────────────

@hk_required
def hk_attendance(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)

    date_str = request.GET.get('date', '')
    try:
        sel_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        sel_date = timezone.localdate()

    workers = HKWorker.objects.filter(
        area=sel_area, is_active=True
    ).order_by('worker_type', 'name') if sel_area else HKWorker.objects.none()

    cur_half = current_half()
    is_today = (sel_date == timezone.localdate())
    area_param = f'&area={sel_area.id}' if sel_area else ''

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'submit_half':
            half = request.POST.get('half', cur_half)
            HKAttendanceRecord.objects.filter(
                worker__in=workers, date=sel_date,
                half=half, is_submitted=False
            ).update(is_submitted=True, submitted_at=timezone.now())
            return redirect(f'/housekeeping/attendance/?date={sel_date}{area_param}')

        elif action == 'mark':
            half = request.POST.get('half', cur_half)
            worker_id = request.POST.get('worker_id')
            status = request.POST.get('status', 'present')
            worker = get_object_or_404(HKWorker, pk=worker_id)
            existing = HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half=half).first()
            if not (existing and existing.is_submitted):
                att, _ = HKAttendanceRecord.objects.get_or_create(
                    worker=worker, date=sel_date, half=half,
                    defaults={'marked_by': user}
                )
                att.status = status
                att.marked_by = user
                att.save(update_fields=['status', 'marked_by'])

            if request.headers.get('HX-Request'):
                first_att = HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half='first').first()
                second_att = HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half='second').first()
                return render(request, 'housekeeping/mobile/partials/attendance_row.html', {
                    'worker': worker,
                    'half_data': [
                        ('first',  'First Half (8AM–1PM)',  first_att),
                        ('second', 'Second Half (1PM–5PM)', second_att),
                    ],
                    'sel_date': sel_date, 'sel_area': sel_area,
                    'cur_half': cur_half, 'is_today': is_today,
                    'attn_choices': ATTENDANCE_CHOICES,
                })
            return redirect(f'/housekeeping/attendance/?date={sel_date}{area_param}')

    att_map = {(a.worker_id, a.half): a
               for a in HKAttendanceRecord.objects.filter(worker__in=workers, date=sel_date)}

    worker_rows = [{
        'worker': w,
        'first_att':  att_map.get((w.id, 'first')),
        'second_att': att_map.get((w.id, 'second')),
    } for w in workers]

    def all_submitted(half):
        return workers.exists() and all(
            att_map.get((w.id, half)) and att_map[(w.id, half)].is_submitted
            for w in workers
        )

    # Group worker rows by type for display
    type_groups = {}
    for row in worker_rows:
        wt = row['worker'].worker_type
        type_groups.setdefault(wt, []).append(row)

    return render(request, 'housekeeping/mobile/attendance.html', {
        'worker_rows': worker_rows, 'type_groups': type_groups,
        'sel_date': sel_date, 'sel_area': sel_area, 'user_areas': user_areas,
        'today': timezone.localdate(), 'is_today': is_today, 'cur_half': cur_half,
        'present_first':  sum(1 for r in worker_rows if r['first_att']  and r['first_att'].status  in ['present','late']),
        'present_second': sum(1 for r in worker_rows if r['second_att'] and r['second_att'].status in ['present','late']),
        'total_count': len(worker_rows),
        'first_submitted': all_submitted('first'),
        'second_submitted': all_submitted('second'),
        'attn_choices': ATTENDANCE_CHOICES,
        'tag_labels': WORKER_TAG_LABELS,
    })


# ── SUNDAY INCHARGE ───────────────────────────────────────────────────────────

@hk_required
def hk_sunday_incharge(request):
    if request.method != 'POST':
        return redirect('/housekeeping/dashboard/')
    user = request.user
    user_areas = get_user_areas(user)
    today = timezone.localdate()
    upcoming = today + datetime.timedelta(days=(6 - today.weekday()) % 7 or 7)
    area_id = request.POST.get('area_id')
    area = user_areas.filter(pk=area_id).first()
    worker = get_object_or_404(HKWorker, pk=request.POST.get('worker_id'))
    if area:
        HKSundayIncharge.objects.update_or_create(
            area=area, for_sunday=upcoming,
            defaults={'worker': worker, 'set_by': user, 'notes': request.POST.get('notes', '')}
        )
    return redirect(f'/housekeeping/dashboard/?area={area_id}' if area_id else '/housekeeping/dashboard/')


# ── STOCK ─────────────────────────────────────────────────────────────────────

@hk_required
def hk_stock(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by('item_name') if sel_area else []
    my_requests = HKStockRequest.objects.filter(requested_by=user).order_by('-created_at')[:10]
    return render(request, 'housekeeping/mobile/stock.html', {
        'area_stocks': area_stocks, 'low_stocks': [s for s in area_stocks if s.is_low],
        'my_requests': my_requests, 'user_areas': user_areas, 'selected_area': sel_area,
        'requested': request.GET.get('requested'),
    })


@hk_required
def hk_stock_request(request):
    from apps.inventory.models import Item, ItemRequest as InvItemRequest

    user = request.user
    user_areas = get_user_areas(user)
    hk_cats = ['Cleaning Supplies', 'Housekeeping Supplies', 'Consumables',
               'Tools & Equipment', 'Garden & Horticulture Equipment']
    inv_items = Item.objects.filter(category__name__in=hk_cats).select_related('category').order_by('name')

    if request.method == 'POST':
        item_name = request.POST.get('item_name', '').strip()
        inv_item = None
        inv_id = request.POST.get('inventory_item_id')
        if inv_id:
            inv_item = Item.objects.filter(pk=inv_id).first()
            if inv_item:
                item_name = inv_item.name

        area_id = request.POST.get('area_id')
        area = user_areas.filter(pk=area_id).first() if area_id else user_areas.first()
        qty = max(1, int(request.POST.get('quantity', 1) or 1))

        hk_req = HKStockRequest.objects.create(
            requested_by=user, area=area,
            item_name=item_name, item=inv_item,
            quantity=qty, unit=request.POST.get('unit', '').strip(),
            reason=request.POST.get('reason', '').strip(),
            is_urgent=request.POST.get('is_urgent') == 'on',
        )
        # Mirror into inventory system so manager sees it
        if inv_item:
            try:
                inv_req = InvItemRequest.objects.create(
                    item=inv_item, requested_by=user,
                    quantity_requested=qty,
                    purpose=f"[HK – {area.name if area else 'General'}] {hk_req.reason}",
                    notes=f"Urgent: {'Yes' if hk_req.is_urgent else 'No'}",
                    is_urgent=hk_req.is_urgent,
                )
                hk_req.inventory_request = inv_req
                hk_req.save(update_fields=['inventory_request'])
            except Exception:
                pass

        return redirect(f'/housekeeping/stock/?requested=1&area={area.id if area else ""}')

    sel_area = selected_area(request, user_areas)
    return render(request, 'housekeeping/mobile/stock_request.html', {
        'inv_items': inv_items, 'user_areas': user_areas, 'selected_area': sel_area,
        'pre_item': request.GET.get('item', ''),
    })


# ── PROFILE ───────────────────────────────────────────────────────────────────

@hk_required
def hk_profile(request):
    user = request.user
    user_areas = get_user_areas(user)
    success = error = ''
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'change_password':
            cur = request.POST.get('current_password', '')
            new = request.POST.get('new_password', '')
            conf = request.POST.get('confirm_password', '')
            if not user.check_password(cur):
                error = 'Current password is incorrect.'
            elif new != conf:
                error = 'Passwords do not match.'
            elif len(new) < 6:
                error = 'Minimum 6 characters required.'
            else:
                user.set_password(new)
                user.save()
                update_session_auth_hash(request, user)
                success = 'Password updated successfully.'
        elif action == 'upload_photo' and 'profile_photo' in request.FILES:
            user.profile_photo = request.FILES['profile_photo']
            user.save(update_fields=['profile_photo'])
            success = 'Photo updated.'
    return render(request, 'housekeeping/mobile/profile.html', {
        'user': user, 'user_areas': user_areas, 'success': success, 'error': error,
    })


# ── ALERTS ────────────────────────────────────────────────────────────────────

@hk_required
def hk_alerts_manage(request):
    if request.user.role not in ['admin', 'manager']:
        return redirect('/housekeeping/dashboard/')
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create':
            alert = HKAlert.objects.create(
                title=request.POST.get('title', ''),
                message=request.POST.get('message', ''),
                priority=request.POST.get('priority', 'info'),
                created_by=request.user, is_active=True,
            )
            ids = request.POST.getlist('areas')
            if ids:
                alert.target_areas.set(ids)
        elif action == 'deactivate':
            HKAlert.objects.filter(pk=request.POST.get('alert_id')).update(is_active=False)
        return redirect('/housekeeping/alerts/')
    return render(request, 'housekeeping/mobile/alerts_manage.html', {
        'alerts': HKAlert.objects.order_by('-created_at')[:20],
        'all_areas': HKArea.objects.filter(is_active=True),
    })
