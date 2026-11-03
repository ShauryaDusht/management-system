import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.housekeeping.htmx_views import (
    HOSTEL_COMMON_AREA_NAME,
    auto_absent_cutoff_passed,
    auto_absent_unmarked_workers,
)
from apps.housekeeping.models import HKArea


class Command(BaseCommand):
    help = (
        "Record Absent (both halves) for Hostel Common Area staff that nobody marked by the 10PM end of the "
        "second shift. Run daily from cron shortly after 10PM IST. Anything already marked is left alone, so "
        "it is safe to run again."
    )

    def add_arguments(self, parser):
        parser.add_argument('--date', help='YYYY-MM-DD to process (default: today).')

    def handle(self, *args, **options):
        if options.get('date'):
            try:
                date = datetime.date.fromisoformat(options['date'])
            except ValueError:
                raise CommandError('--date must look like 2026-11-03.')
        else:
            date = timezone.localdate()

        if not auto_absent_cutoff_passed(date):
            self.stdout.write(f'{date}: the 10PM cutoff has not passed yet, nothing to do.')
            return

        area = HKArea.objects.filter(name=HOSTEL_COMMON_AREA_NAME).first()
        if not area:
            self.stdout.write(f'No "{HOSTEL_COMMON_AREA_NAME}" area found.')
            return

        created = auto_absent_unmarked_workers(area, date)
        self.stdout.write(self.style.SUCCESS(f'{date}: recorded {created} absent entr{"y" if created == 1 else "ies"}.'))
