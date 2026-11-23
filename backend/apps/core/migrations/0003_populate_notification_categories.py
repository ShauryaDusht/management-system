# Data step of the notification expiry change (the schema is in 0002). Idempotent: it only derives category and
# expiry from each notification's type, title and read state, so running it again gives the same result.

from datetime import timedelta

from django.db import migrations
from django.utils import timezone


def populate_legacy_notification_categories(apps, schema_editor):
    Notification = apps.get_model('core', 'Notification')
    now = timezone.now()

    important_types = {
        'inventory_approved',
        'inventory_rejected',
        'leave_approved',
        'leave_rejected',
    }

    important_keywords = (
        'approval',
        'approved',
        'rejected',
        'emergency',
        'urgent',
        'alert',
        'failure',
        'security',
        'critical',
        'assigned',
    )

    for notif in Notification.objects.all():
        n_type = (notif.notification_type or '').strip().lower()
        title_lower = (notif.title or '').strip().lower()

        if n_type in important_types or any(kw in title_lower for kw in important_keywords):
            notif.category = 'IMPORTANT'
            if not notif.is_read:
                notif.expires_at = None
                notif.is_expired = False
            else:
                ref = notif.read_at or notif.created_at or now
                notif.expires_at = ref + timedelta(days=30)
                notif.is_expired = notif.expires_at <= now
        else:
            notif.category = 'ROUTINE'
            if not notif.is_read:
                ref = notif.created_at or now
                notif.expires_at = ref + timedelta(days=7)
                notif.is_expired = notif.expires_at <= now
            else:
                ref = notif.read_at or notif.created_at or now
                notif.expires_at = ref + timedelta(days=3)
                notif.is_expired = notif.expires_at <= now

        notif.save(update_fields=['category', 'expires_at', 'is_expired'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_remove_notification_core_notifi_user_id_cb8f07_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(
            populate_legacy_notification_categories,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
