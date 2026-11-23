from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.core.models import Notification


class Command(BaseCommand):
    help = (
        'Permanently deletes expired notifications from the database '
        'based on notification classification (IMPORTANT vs ROUTINE), read status, '
        'and operational action resolution.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Check eligible expired notifications without modifying the database.',
        )
        parser.add_argument(
            '--user',
            type=str,
            help='Filter expiry processing to a specific username or user ID.',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print detailed notification IDs and titles being permanently deleted.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        user_param = options.get('user')
        verbose = options.get('verbose', False)

        now = timezone.now()
        now_local = timezone.localtime(now)
        self.stdout.write(f"Executing notification permanent deletion cleanup at {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}...")

        user = None
        if user_param:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            if str(user_param).isdigit():
                user = User.objects.filter(pk=int(user_param)).first()
            else:
                user = User.objects.filter(username=user_param).first()
            if not user:
                self.stderr.write(self.style.ERROR(f"User '{user_param}' not found."))
                return

        # Query all eligible notifications
        eligible_qs = Notification.objects.filter(
            expires_at__isnull=False,
            expires_at__lte=now,
        ).exclude(
            requires_action=True,
            action_completed=False,
        )

        if user:
            eligible_qs = eligible_qs.filter(user=user)

        total_eligible = eligible_qs.count()
        important_count = eligible_qs.filter(category=Notification.Category.IMPORTANT).count()
        routine_count = eligible_qs.filter(category=Notification.Category.ROUTINE).count()

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] {total_eligible} notification(s) eligible for permanent deletion: "
                f"{important_count} Important, {routine_count} Routine."
            ))
            if verbose and total_eligible:
                for notif in eligible_qs[:50]:
                    self.stdout.write(f"  - [{notif.category}] ID {notif.id}: '{notif.title}' (user: {notif.user.username}, expires_at: {notif.expires_at})")
            return

        deleted_count = Notification.delete_expired_notifications(now=now, user=user)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully purged expired notifications from database. Permanently deleted: {deleted_count} record(s) "
            f"({important_count} Important, {routine_count} Routine). "
            f"Unresolved operational actions and unread important alerts preserved."
        ))
