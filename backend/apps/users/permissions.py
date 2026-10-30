from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_any_manager


class IsSupervisor(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_supervisor


class IsAdminOrManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin or request.user.is_any_manager
        )


from rest_framework.permissions import SAFE_METHODS

class IsAdminOrHKInventoryManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(user, 'role', '') == 'technical_assistant':
            return request.method in SAFE_METHODS or bool(getattr(user, 'can_edit', False))
        return (
            request.user.is_admin
            or getattr(request.user, 'is_hk_inventory_manager', False)
            or getattr(request.user, 'is_horticulture_manager', False)
        )


class IsAdminOrHousekeepingUserManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin
            or getattr(request.user, 'is_hk_inventory_manager', False)
            or getattr(request.user, 'role', '') == 'technical_assistant'
        )


class IsAdminOrHKInventoryOrHorticultureManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin
            or getattr(request.user, 'is_hk_inventory_manager', False)
            or getattr(request.user, 'is_horticulture_manager', False)
            or getattr(request.user, 'is_hostel_office', False)
            or getattr(request.user, 'role', '') == 'technical_assistant'
        )


class IsAdminOrManagerOrSupervisor(BasePermission):
    """Essentially any logged-in user."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin
            or request.user.is_any_manager
            or request.user.is_supervisor
        )
