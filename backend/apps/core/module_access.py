"""
Who may use the plant modules (Substation, WTP/STP, HVAC) on the mobile portal.

These are the same role sets the JSON APIs already enforce (see IsSubstationStaff, IsWtpStaff and
IsHvacStaff), so a page and the API behind it always agree. Anyone else (housekeeping and horticulture
supervisors, caretakers, hostel office, ...) is sent back to their own home instead of being treated as
an "operator" of a plant they have nothing to do with.
"""
from functools import wraps

from django.contrib import messages
from django.shortcuts import redirect

MODULE_ROLES = {
    'substation': {'plant_engineer', 'electrical_supervisor', 'electrical_operator'},
    'wtp': {'plant_engineer', 'wtp_supervisor', 'wtp_operator'},
    'hvac': {'plant_engineer', 'hvac_engineer', 'hvac_supervisor', 'hvac_operator'},
}

MODULE_LABELS = {
    'substation': 'Substation Log',
    'wtp': 'WTP / STP Meters',
    'hvac': 'HVAC Plant Log',
}


def is_admin_user(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, 'is_admin', False) or getattr(user, 'role', '') == 'admin')
    )


def can_use_module(user, module):
    if not (user and user.is_authenticated and user.is_active):
        return False
    return is_admin_user(user) or getattr(user, 'role', '') in MODULE_ROLES[module]


def module_required(module):
    """Use below @login_required: people without access go to their own home, nothing is processed."""

    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if not can_use_module(request.user, module):
                from apps.core.portal_views import landing_url  # imported late: portal_views imports this module

                messages.error(request, f'You do not have access to the {MODULE_LABELS[module]} module.')
                return redirect(landing_url(request.user, request))
            return view(request, *args, **kwargs)

        return wrapper

    return decorator
