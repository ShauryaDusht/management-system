from django.conf import settings
from django.db import models


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        INVENTORY_APPROVED = 'inventory_approved', 'Inventory Request Approved'
        INVENTORY_REJECTED = 'inventory_rejected', 'Inventory Request Rejected'
        LEAVE_APPROVED = 'leave_approved', 'Leave Request Approved'
        LEAVE_REJECTED = 'leave_rejected', 'Leave Request Rejected'
        USAGE_REMINDER = 'usage_reminder', 'Usage Report Reminder'
        GENERAL = 'general', 'General Notification'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=50,
        choices=NotificationType.choices,
        default=NotificationType.GENERAL,
        db_index=True,
    )
    status_label = models.CharField(max_length=50, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    link = models.CharField(max_length=255, blank=True)
    dedup_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        unique=True,
        db_index=True,
        help_text='Unique key to prevent duplicate notifications for the same event.',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        read_flag = 'Read' if self.is_read else 'Unread'
        return f"[{read_flag}] {self.user.username} - {self.title} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"
