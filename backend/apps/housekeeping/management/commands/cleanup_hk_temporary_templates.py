from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Count, Max
from django.utils import timezone

from apps.housekeeping.models import HKScheduleTemplate


class Command(BaseCommand):
    help = (
        "Delete inactive temporary HKScheduleTemplate rows whose only linked "
        "HKDailyRecord is older than N days."
    )

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        days = max(1, int(options['days']))
        cutoff = timezone.localdate() - timedelta(days=days)

        stale_qs = (
            HKScheduleTemplate.objects
            .filter(is_active=False)
            .annotate(
                linked_record_count=Count('originated_daily_records', distinct=True),
                latest_record_date=Max('originated_daily_records__date'),
            )
            .filter(linked_record_count=1, latest_record_date__lt=cutoff)
        )

        stale_count = stale_qs.count()
        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] {stale_count} temporary templates eligible for cleanup."
                )
            )
            return

        deleted_count, _ = stale_qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted_count} rows (templates and cascaded related rows)."
            )
        )
