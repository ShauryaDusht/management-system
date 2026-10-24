from django.contrib import admin
from config.admin import admin_site
from apps.core.models import Notification


@admin.register(Notification, site=admin_site)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'title', 'notification_type', 'status_label', 'is_read', 'created_at']
    list_filter = ['notification_type', 'is_read', 'created_at']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'title', 'message', 'dedup_key']
    readonly_fields = ['created_at', 'updated_at']
