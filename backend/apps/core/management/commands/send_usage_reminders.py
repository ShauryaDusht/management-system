from datetime import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.core.notifications import check_and_send_usage_reminders


class Command(BaseCommand):
    help = 'Check for issued items with incomplete usage reports after 5:00 PM and send notifications to responsible staff.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force check and notification creation even if current local time is before 5:00 PM.',
        )
        parser.add_argument(
            '--date',
            type=str,
            help='Target date in YYYY-MM-DD format for evaluation and deduplication key.',
        )

    def handle(self, *args, **options):
        force_time = options.get('force', False)
        target_date_str = options.get('date')
        target_date = None
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid date format '{target_date_str}', expected YYYY-MM-DD."))
                return

        now_local = timezone.localtime(timezone.now())
        self.stdout.write(f"Current local time: {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")

        count = check_and_send_usage_reminders(force_time=force_time, target_date=target_date)
        self.stdout.write(self.style.SUCCESS(f"Successfully processed usage report reminders. Sent: {count} notification(s)."))
