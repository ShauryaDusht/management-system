from django.contrib.admin import AdminSite


class RestrictedAdminSite(AdminSite):
    site_header = 'Campus Sanchalika Admin'
    site_title = 'Campus Sanchalika'
    index_title = 'IITGN campus operations administration'

    def has_permission(self, request):
        return (
            request.user.is_active
            and request.user.is_superuser
            and request.user.is_staff
        )


admin_site = RestrictedAdminSite(name='restricted_admin')
