from rest_framework.permissions import BasePermission

from apps.users.permissions import IsAdmin


class IsAdminOnly(IsAdmin):
    """Alias of users.permissions.IsAdmin for admin-only access."""


class IsAdminOrHousekeepingManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and (
            user.is_admin or user.is_housekeeping_manager
        )
