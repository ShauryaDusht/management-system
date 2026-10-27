from rest_framework.permissions import BasePermission


class IsLiftLicenseUser(BasePermission):
    """
    Grants access to Super Admin and Lift Engineers.
    Explicitly denies access to Housekeeping Manager and housekeeping roles.
    """
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Explicitly forbid housekeeping roles
        role = getattr(user, 'role', '')
        if role in ('hk_inventory_manager', 'housekeeping_manager', 'supervisor', 'caretaker', 'hostel_office'):
            return False
        if getattr(user, 'is_hk_inventory_manager', False):
            return False

        # Super admin / admin or lift engineer
        if user.is_superuser or getattr(user, 'is_admin', False) or role in ('admin', 'engineer'):
            return True

        return False


class IsLiftLicenseAdmin(BasePermission):
    """
    Restricted to Super Admin / Admin only.
    Housekeeping managers and engineers are denied.
    """
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        role = getattr(user, 'role', '')
        if role in ('hk_inventory_manager', 'housekeeping_manager', 'supervisor', 'caretaker', 'hostel_office'):
            return False
        if getattr(user, 'is_hk_inventory_manager', False):
            return False

        return user.is_superuser or getattr(user, 'is_admin', False) or role == 'admin'
