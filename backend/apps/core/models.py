from datetime import timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone


def get_notification_retention_days():
    return {
        'important_read': getattr(settings, 'NOTIFICATION_RETENTION_IMPORTANT_READ_DAYS', 30),
        'routine_unread': getattr(settings, 'NOTIFICATION_RETENTION_ROUTINE_UNREAD_DAYS', 7),
        'routine_read': getattr(settings, 'NOTIFICATION_RETENTION_ROUTINE_READ_DAYS', 3),
    }


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        INVENTORY_APPROVED = 'inventory_approved', 'Inventory Request Approved'
        INVENTORY_REJECTED = 'inventory_rejected', 'Inventory Request Rejected'
        LEAVE_APPROVED = 'leave_approved', 'Leave Request Approved'
        LEAVE_REJECTED = 'leave_rejected', 'Leave Request Rejected'
        USAGE_REMINDER = 'usage_reminder', 'Usage Report Reminder'
        GENERAL = 'general', 'General Notification'

    class Category(models.TextChoices):
        IMPORTANT = 'IMPORTANT', 'Important'
        ROUTINE = 'ROUTINE', 'Routine'

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
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.ROUTINE,
        db_index=True,
        help_text='Classification: IMPORTANT (actionable/critical) or ROUTINE (informational/reminder).',
    )
    status_label = models.CharField(max_length=50, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Calculated expiration timestamp. None for unread important or pinned notifications.',
    )
    is_expired = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Soft expiry flag. Expired notifications are excluded from active list and unread count.',
    )
    requires_action = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True if notification requires an unresolved operational action.',
    )
    action_completed = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True once the required operational action has been completed.',
    )
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
            models.Index(fields=['user', 'is_read', 'is_expired']),
            models.Index(fields=['user', 'category', 'is_expired']),
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['is_expired', 'expires_at']),
        ]

    def __str__(self):
        read_flag = 'Read' if self.is_read else 'Unread'
        cat_flag = self.category
        exp_flag = ' [EXPIRED]' if self.is_expired else ''
        return f"[{read_flag} | {cat_flag}{exp_flag}] {self.user.username} - {self.title} ({self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else 'pending'})"

    def has_unresolved_action(self):
        """
        Returns True if this notification is connected to an unresolved operational action.
        Unresolved operational notifications must remain active even after their normal retention period.
        """
        return bool(self.requires_action and not self.action_completed)

    def calculate_expires_at(self, from_time=None):
        """
        Calculates the expiry timestamp based on classification and read state:
        - IMPORTANT unread: None (never automatically expires while unread)
        - IMPORTANT read: read_at + 30 days (configurable)
        - ROUTINE unread: created_at + 7 days (configurable)
        - ROUTINE read: (read_at or created_at) + 3 days (configurable)
        """
        now = from_time or timezone.now()
        retention = get_notification_retention_days()
        ref_created = self.created_at or now
        ref_read = self.read_at or now

        if self.category == self.Category.IMPORTANT:
            if not self.is_read:
                return None
            return ref_read + timedelta(days=retention['important_read'])
        else:
            if not self.is_read:
                return ref_created + timedelta(days=retention['routine_unread'])
            return ref_read + timedelta(days=retention['routine_read'])

    def is_currently_expired(self, now=None):
        """
        Checks whether the notification is considered expired in real-time.
        Preserves notifications linked to unresolved operational actions.
        """
        if self.has_unresolved_action():
            return False
        if self.is_expired:
            return True
        if self.expires_at is None:
            return False
        now = now or timezone.now()
        return self.expires_at <= now

    def mark_read(self, now=None, save=True):
        """
        Marks notification as read, sets read_at, and recalculates expires_at.
        - Routine read notifications receive the shorter 3-day retention.
        - Important read notifications receive the 30-day retention.
        """
        now = now or timezone.now()
        if not self.is_read:
            self.is_read = True
            self.read_at = now
            self.expires_at = self.calculate_expires_at(from_time=now)
            if save:
                self.save(update_fields=['is_read', 'read_at', 'expires_at', 'updated_at'])

    def mark_action_completed(self, now=None, save=True):
        """
        Marks required operational action as completed and updates expiry timestamp.
        Retention period starts from action completion timestamp.
        """
        now = now or timezone.now()
        self.action_completed = True
        retention = get_notification_retention_days()
        if self.category == self.Category.IMPORTANT:
            if not self.is_read:
                self.expires_at = None
            else:
                self.expires_at = now + timedelta(days=retention['important_read'])
        else:
            if not self.is_read:
                self.expires_at = now + timedelta(days=retention['routine_unread'])
            else:
                self.expires_at = now + timedelta(days=retention['routine_read'])
        if save:
            self.save(update_fields=['action_completed', 'expires_at', 'updated_at'])

    def save(self, *args, **kwargs):
        # Auto-compute expires_at if not explicitly provided
        if not self.created_at:
            self.created_at = timezone.now()

        if self.is_read and not self.read_at:
            self.read_at = timezone.now()

        # If expires_at is not set and notification should have an expiry
        if self.expires_at is None:
            if self.category == self.Category.ROUTINE or self.is_read:
                self.expires_at = self.calculate_expires_at()

        super().save(*args, **kwargs)

    @classmethod
    def delete_expired_notifications(cls, now=None, user=None):
        """
        Permanently deletes expired notification records from the database using Django ORM.
        Safeguards:
        - Never deletes unread important notifications (expires_at is None).
        - Never deletes notifications linked to unresolved actions (requires_action=True, action_completed=False).
        - Deletes read routine notifications after 3 days.
        - Deletes unread routine notifications after 7 days.
        - Deletes read important notifications after 30 days.
        - Does NOT delete underlying users, business models, or audit trails.
        Returns the number of deleted notification rows.
        """
        now = now or timezone.now()
        qs = cls.objects.filter(
            expires_at__isnull=False,
            expires_at__lte=now,
        ).exclude(
            requires_action=True,
            action_completed=False,
        )
        if user:
            qs = qs.filter(user=user)
        from django.db import transaction
        with transaction.atomic():
            deleted_count, _ = qs.delete()
        return deleted_count

    # Backwards-compatible alias
    expire_eligible_notifications = delete_expired_notifications
