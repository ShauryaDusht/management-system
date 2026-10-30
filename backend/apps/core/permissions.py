from rest_framework.permissions import BasePermission

from apps.users.permissions import IsAdmin


from rest_framework.permissions import SAFE_METHODS


class IsAdminOnly(IsAdmin):
    """Alias of users.permissions.IsAdmin for admin-only access."""

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(user, 'role', '') == 'technical_assistant':
            return request.method in SAFE_METHODS or bool(getattr(user, 'can_edit', False))
        return user.is_admin or getattr(user, 'is_hk_inventory_manager', False)


class IsAdminOrHousekeepingManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(user, 'role', '') == 'technical_assistant':
            return request.method in SAFE_METHODS or bool(getattr(user, 'can_edit', False))
        return (
            user.is_admin
            or getattr(user, 'is_hk_inventory_manager', False)
        )


class IsHousekeepingTaskAssigner(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(user, 'role', '') == 'technical_assistant':
            return request.method in SAFE_METHODS or bool(getattr(user, 'can_edit', False))
        return (
            user.is_admin
            or getattr(user, 'is_hk_inventory_manager', False)
            or getattr(user, 'is_hostel_office', False)
        )
