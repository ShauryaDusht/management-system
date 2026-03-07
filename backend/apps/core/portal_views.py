"""
Unified entry point login for all non-admin staff.
GET  /portal/login/  -> renders the login form
POST /portal/login/  -> authenticates and redirects to role-specific dashboard
GET  /portal/        -> if authenticated, redirect to role dashboard; else to login
"""

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST


ROLE_REDIRECT_MAP = {
    'inventory_manager': '/inventory/mobile/',
    'housekeeping_manager': '/housekeeping/dashboard/',
    'horticulture_manager': '/horticulture/dashboard/',
    'supervisor': '/housekeeping/dashboard/',
    'caretaker': '/housekeeping/dashboard/',
    # admin should never reach portal login, but handle gracefully
    'admin': '/admin-portal/',
}


def portal_root(request):
    if request.user.is_authenticated and request.user.is_active:
        dest = ROLE_REDIRECT_MAP.get(request.user.role, '/portal/login/')
        return redirect(dest)
    return redirect('/portal/login/')


def portal_login(request):
    if request.user.is_authenticated and request.user.is_active:
        dest = ROLE_REDIRECT_MAP.get(request.user.role, '/portal/login/')
        return redirect(dest)

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
                dest = ROLE_REDIRECT_MAP.get(user.role, '/portal/login/')
                return redirect(dest)
        else:
            error = 'Invalid username or password.'

    return render(request, 'core/portal_login.html', {'error': error})


@require_POST
def portal_logout(request):
    auth_logout(request)
    return redirect('/portal/login/')
