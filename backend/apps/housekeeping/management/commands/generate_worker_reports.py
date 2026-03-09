from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.text import slugify

from apps.housekeeping.models import HKWorker
from apps.reports.exporters import export_worker_report_csv
from apps.reports.generators import generate_worker_report
from apps.reports.models import WorkerMonthlyReport


def _previous_completed_month(today):
    first_of_current = today.replace(day=1)
    prev_month_date = first_of_current - timedelta(days=1)
    return prev_month_date.month, prev_month_date.year


class Command(BaseCommand):
    help = 'Generate worker attendance/task CSV reports for a completed month.'

    def add_arguments(self, parser):
        parser.add_argument('--month', type=int, help='Month number (1-12)')
        parser.add_argument('--year', type=int, help='Four digit year (e.g. 2025)')

    def handle(self, *args, **options):
        month_opt = options.get('month')
        year_opt = options.get('year')
        today = timezone.localdate()

        if (month_opt is None) ^ (year_opt is None):
            raise CommandError('Both --month and --year must be provided together.')

        if month_opt is not None and year_opt is not None:
            month = int(month_opt)
            year = int(year_opt)
        else:
            month, year = _previous_completed_month(today)

        if not (1 <= month <= 12):
            raise CommandError('--month must be between 1 and 12.')
        if year < 2000 or year > 2100:
            raise CommandError('--year must be a valid 4-digit year.')

        # Reports are cached snapshots for completed months only.
        if (year, month) >= (today.year, today.month):
            raise CommandError('Only completed past months can be generated/cached.')

        workers = HKWorker.objects.filter(is_active=True).order_by('name')
        generated = 0
        skipped = 0

        for worker in workers:
            if WorkerMonthlyReport.objects.filter(worker=worker, month=month, year=year).exists():
                skipped += 1
                self.stdout.write(f"Skipped (cached): {worker.name}")
                continue

            snapshot = generate_worker_report(worker.id, month, year)
            csv_bytes = export_worker_report_csv(snapshot)

            report = WorkerMonthlyReport(
                worker=worker,
                month=month,
                year=year,
                generated_at=timezone.now(),
                snapshot=snapshot,
            )
            safe_name = slugify(worker.name) or str(worker.id)
            filename = f"worker_{safe_name}_{month:02d}_{year}.csv"
            report.csv_file.save(filename, ContentFile(csv_bytes), save=False)
            report.save()

            generated += 1
            self.stdout.write(f"Generated: {worker.name}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done for {month:02d}/{year}. Generated={generated}, Skipped={skipped}."
            )
        )
