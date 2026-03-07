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


class IsAdminOrInventoryManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin or request.user.is_inventory_manager
        )
