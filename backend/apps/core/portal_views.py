"""
Unified entry point login for all non-admin staff.
GET  /portal/login/  -> renders the login form
POST /portal/login/  -> authenticates and redirects to role-specific dashboard
GET  /portal/        -> if authenticated, redirect to role dashboard; else to login
"""

from pathlib import Path

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST

from apps.users.models import normalize_username_value


def _is_hostel_office_login(user):
    return getattr(user, 'username', '') == 'hostel.office' or getattr(user, 'role', '') == 'hostel_office'


def _repair_hostel_office_user(user):
    if getattr(user, 'username', '') == 'hostel.office' and getattr(user, 'role', '') != 'hostel_office':
        user.role = 'hostel_office'
        user.is_active = True
        user.is_staff = True
        user.is_superuser = False
        user.save(update_fields=['role', 'is_active', 'is_staff', 'is_superuser'])
    return user


def get_react_admin_url(request):
    if settings.DEBUG:
        host = request.get_host().split(':')[0]
        return f'http://{host}:5173/admin/'
    return '/admin/'


def get_portal_redirect(user):
    if _is_hostel_office_login(user):
        return '/admin/login/'
    role = getattr(user, 'role', '')
    if role == 'horticulture_manager':
        return '/horticulture/dashboard/'
    if role in ['plant_engineer', 'electrical_supervisor', 'electrical_operator']:
        return '/substation/dashboard/'
    if role in ['wtp_supervisor', 'wtp_operator']:
        return '/wtp/dashboard/'
    if role in ['hvac_engineer', 'hvac_supervisor', 'hvac_operator']:
        return '/hvac/dashboard/'
    if role == 'engineer':
        return '/admin/lifts'
    if role in ['inventory_manager', 'hk_inventory_manager', 'hostel_office', 'estate_office', 'civil_team', 'electrical_team']:
        return '/admin/login/'
    if role == 'supervisor':
        has_horticulture_zone = user.horticulture_supervised_zones.exists()
        has_housekeeping_area = user.hk_areas.exists()
        if has_horticulture_zone and not has_housekeeping_area:
            return '/horticulture/dashboard/'
        return '/housekeeping/dashboard/'
    if role == 'caretaker':
        return '/housekeeping/dashboard/'
    if role == 'admin':
        return '/portal/login/'
    return '/portal/login/'


def portal_root(request):
    if request.user.is_authenticated and request.user.is_active:
        return redirect('/portal/dashboard/')
    return redirect('/portal/login/')


@login_required(login_url='/portal/login/')
@never_cache
def portal_dashboard(request):
    """
    Unified Staff Portal Mobile Dashboard.
    Provides a touch-friendly operational overview of Substation, WTP, HVAC,
    Housekeeping, Horticulture, and Lifts for on-field staff.
    """
    user = request.user
    role = getattr(user, 'role', '')
    now_local = timezone.localtime()
    today_date = now_local.date()

    t_hour = now_local.hour
    if 6 <= t_hour < 14:
        shift_slot = 'R1'
        shift_label = 'Shift 1 (06:00 - 14:00)'
    elif 14 <= t_hour < 22:
        shift_slot = 'R2'
        shift_label = 'Shift 2 (14:00 - 22:00)'
    else:
        shift_slot = 'R3'
        shift_label = 'Shift 3 (22:00 - 06:00)'

    sub_sheets_count = 0
    sub_completed_count = 0
    try:
        from apps.substation.models import SubstationSheet, SubstationReading
        sub_sheets_count = SubstationSheet.objects.filter(is_active=True).count()
        sub_completed_count = SubstationReading.objects.filter(date=today_date, slot=shift_slot, filled__gt=0).count()
    except Exception:
        pass
    sub_pct = int((sub_completed_count / sub_sheets_count * 100)) if sub_sheets_count > 0 else 0

    wtp_logged = False
    try:
        from apps.wtp_stp.models import WtpReading
        wtp_logged = WtpReading.objects.filter(date=today_date, slot=shift_slot).exists()
    except Exception:
        pass

    hvac_logged = False
    try:
        from apps.hvac.models import HvacReading
        hvac_logged = HvacReading.objects.filter(date=today_date).exists()
    except Exception:
        pass

    context = {
        'user': user,
        'role': role,
        'role_display': user.get_role_display() if hasattr(user, 'get_role_display') else role.replace('_', ' ').title(),
        'today_str': today_date.strftime('%a, %d %b %Y'),
        'shift_slot': shift_slot,
        'shift_label': shift_label,
        'time_str': now_local.strftime('%H:%M'),
        'sub_sheets_count': sub_sheets_count,
        'sub_completed_count': sub_completed_count,
        'sub_pct': sub_pct,
        'wtp_logged': wtp_logged,
        'hvac_logged': hvac_logged,
    }
    return render(request, 'core/portal_dashboard.html', context)


def portal_logo(_request):
    logo_path = (
        Path(settings.BASE_DIR)
        / 'apps'
        / 'housekeeping'
        / 'static'
        / 'branding'
        / 'campus-sanchalika-logo.png'
    )
    if not logo_path.exists():
        raise Http404('Logo not found.')
    return FileResponse(open(logo_path, 'rb'), content_type='image/png')


def portal_login(request):
    if request.user.is_authenticated and request.user.is_active:
        return redirect('/portal/dashboard/')

    error = ''
    if request.method == 'POST':
        raw_user = normalize_username_value(request.POST.get('username', ''))
        from apps.users.models import User
        if not User.objects.filter(username=raw_user).exists():
            matched = User.objects.filter(email__iexact=raw_user).first()
            if not matched and '@' in raw_user:
                from django.conf import settings
                civil_emails = [e.strip().lower() for e in getattr(settings, 'CIVIL_ALERT_EMAIL', '').split(',') if e.strip()]
                elec_emails = [e.strip().lower() for e in getattr(settings, 'ELECTRICAL_ALERT_EMAIL', '').split(',') if e.strip()]
                if raw_user.lower() in civil_emails:
                    matched = User.objects.filter(username='civil.team').first()
                elif raw_user.lower() in elec_emails:
                    matched = User.objects.filter(username='electrical.team').first()
            if matched:
                raw_user = matched.username
        user = authenticate(
            request,
            username=raw_user,
            password=request.POST.get('password', ''),
        )
        if user and user.is_active:
            user = _repair_hostel_office_user(user)
            if user.role in ['admin', 'inventory_manager', 'hk_inventory_manager', 'hostel_office', 'engineer']:
                return redirect(get_portal_redirect(user) if user.role == 'engineer' else get_react_admin_url(request))
            auth_login(request, user)
            return redirect('/portal/dashboard/')
        else:
            error = 'Invalid username or password.'

    return render(request, 'core/portal_login.html', {'error': error})


@require_POST
def portal_logout(request):
    auth_logout(request)
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'redirect_url': '/portal/login/'})
    return redirect('/portal/login/')
