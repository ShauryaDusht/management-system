from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from config.admin import admin_site
from .models import User, unique_standard_username


@admin.register(User, site=admin_site)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'get_full_name', 'role', 'phone', 'is_active']
    list_filter = ['role', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Role & Contact', {'fields': ('role', 'phone')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Role & Contact', {'fields': ('role', 'phone', 'first_name', 'last_name', 'email')}),
    )

    def save_model(self, request, obj, form, change):
        generated = unique_standard_username(
            obj.first_name,
            obj.last_name,
            model=User,
            exclude_pk=obj.pk,
        )
        if generated:
            obj.username = generated
        super().save_model(request, obj, form, change)
