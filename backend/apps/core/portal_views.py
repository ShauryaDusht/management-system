"""
Unified entry point login for all non-admin staff.
GET  /portal/login/  -> renders the login form
POST /portal/login/  -> authenticates and redirects to role-specific dashboard
GET  /portal/        -> if authenticated, redirect to role dashboard; else to login
"""

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST


def get_portal_redirect(user):
    role = getattr(user, 'role', '')
    if role == 'inventory_manager':
        return '/inventory/mobile/'
    if role == 'housekeeping_manager':
        return '/housekeeping/dashboard/'
    if role == 'horticulture_manager':
        return '/horticulture/dashboard/'
    if role == 'supervisor':
        has_horticulture_zone = user.horticulture_supervised_zones.exists()
        has_housekeeping_area = user.hk_areas.exists()
        if has_horticulture_zone and not has_housekeeping_area:
            return '/horticulture/dashboard/'
        return '/housekeeping/dashboard/'
    if role == 'caretaker':
        return '/housekeeping/dashboard/'
    # admin should never reach portal login, but handle gracefully
    if role == 'admin':
        return '/admin-portal/'
    return '/portal/login/'


def portal_root(request):
    if request.user.is_authenticated and request.user.is_active:
        return redirect(get_portal_redirect(request.user))
    return redirect('/portal/login/')


def portal_login(request):
    if request.user.is_authenticated and request.user.is_active:
        return redirect(get_portal_redirect(request.user))

    error = ''
    if request.method == 'POST':
        user = authenticate(
            request,
            username=request.POST.get('username', '').strip(),
            password=request.POST.get('password', ''),
        )
        if user and user.is_active:
            if user.role == 'admin':
                error = 'Please use the admin portal to log in.'
            else:
                auth_login(request, user)
                return redirect(get_portal_redirect(user))
        else:
            error = 'Invalid username or password.'

    return render(request, 'core/portal_login.html', {'error': error})


@require_POST
def portal_logout(request):
    auth_logout(request)
    return redirect('/portal/login/')
