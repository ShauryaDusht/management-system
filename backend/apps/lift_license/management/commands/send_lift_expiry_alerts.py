from django.core.management.base import BaseCommand
from apps.lift_license.email_service import send_lift_expiry_alert


class Command(BaseCommand):
    help = 'Automatically checks for lift licenses expiring within notice window and sends email alert.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--window',
            type=int,
            default=90,
            help='Notice window in days (default: 90 for 30, 60 & 90 days multi-tier schedule)'
        )
        parser.add_argument(
            '--to',
            type=str,
            default=None,
            help='Recipient email address (defaults to LIFT_ALERT_EMAIL in settings)'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force sending email even if already sent today'
        )

    def handle(self, *args, **options):
        window = options['window']
        recipient = options['to']
        force = options['force']

        self.stdout.write(f"Checking lift license expirations for window: {window} days...")
        result = send_lift_expiry_alert(window_days=window, recipient=recipient, force=force)

        if result.get('sent'):
            self.stdout.write(
                self.style.SUCCESS(
                    f"[SUCCESS] Alert email sent to {result['recipient']}! "
                    f"({result['count']} urgent lifts detected)"
                )
            )
        elif result.get('already_sent'):
            self.stdout.write(
                self.style.WARNING(
                    f"[INFO] Alert was already sent today for this window. "
                    f"Use --force to send again."
                )
            )
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"[FAILED/NOTICE] {result.get('message', 'No email sent')}"
                )
            )
            if result.get('error'):
                self.stdout.write(self.style.ERROR(f"Error details: {result['error']}"))
