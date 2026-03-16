from django.contrib.admin import AdminSite


class RestrictedAdminSite(AdminSite):
    def has_permission(self, request):
        return (
            request.user.is_active
            and request.user.is_superuser
            and request.user.is_staff
        )


admin_site = RestrictedAdminSite(name='restricted_admin')
