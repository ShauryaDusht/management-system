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


class IsAdminOrManagerOrSupervisor(BasePermission):
    """Any authenticated user with a recognised role."""

    def has_permission(self, request, view):

        return request.user.is_authenticated and (
            request.user.is_admin
            or request.user.is_any_manager
            or request.user.is_supervisor
        )


from rest_framework.permissions import SAFE_METHODS

class IsAdminOrInventoryManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(user, 'role', '') == 'technical_assistant':
            return request.method in SAFE_METHODS or bool(getattr(user, 'can_edit', False))
        return (
            user.is_admin
            or user.is_inventory_manager
            or getattr(user, 'is_hk_inventory_manager', False)
            or getattr(user, 'is_horticulture_manager', False)
        )
