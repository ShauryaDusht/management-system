from django.contrib import admin
from config.admin import admin_site
from apps.core.models import Notification


@admin.register(Notification, site=admin_site)
class NotificationAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'user',
        'title',
        'category',
        'notification_type',
        'status_label',
        'is_read',
        'is_expired',
        'expires_at',
        'requires_action',
        'created_at',
    ]
    list_filter = ['category', 'is_expired', 'is_read', 'requires_action', 'notification_type', 'created_at']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'title', 'message', 'dedup_key']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['delete_selected_notifications', 'mark_as_read']

    @admin.action(description="Permanently delete selected notifications from database")
    def delete_selected_notifications(self, request, queryset):
        deleted_count, _ = queryset.delete()
        self.message_user(request, f"{deleted_count} notification(s) permanently deleted from database.")

    @admin.action(description="Mark selected notifications as read")
    def mark_as_read(self, request, queryset):
        for notif in queryset.filter(is_read=False):
            notif.mark_read(save=True)
        self.message_user(request, "Selected notifications marked as read.")
