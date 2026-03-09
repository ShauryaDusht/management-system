from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.reports.exporters import export_consumption_item_csv, export_consumption_requester_csv
from apps.reports.generators import generate_consumption_report
from apps.reports.models import ItemConsumptionReport


def _previous_completed_month(today):
    first_of_current = today.replace(day=1)
    previous_month_date = first_of_current - timedelta(days=1)
    return previous_month_date.month, previous_month_date.year


class Command(BaseCommand):
    help = 'Generate cached item consumption CSV reports for a completed month.'

    def add_arguments(self, parser):
        parser.add_argument('--month', type=int, help='Month number (1-12)')
        parser.add_argument('--year', type=int, help='Four digit year (e.g. 2026)')

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
            raise CommandError('--year must be between 2000 and 2100.')
        if (year, month) >= (today.year, today.month):
            raise CommandError('Only completed past months can be generated/cached.')

        existing = ItemConsumptionReport.objects.filter(month=month, year=year).first()
        if existing:
            self.stdout.write(f"Skipped (cached): {existing.period_label}")
            return

        snapshot = generate_consumption_report(month=month, year=year)
        item_csv_bytes = export_consumption_item_csv(snapshot)
        requester_csv_bytes = export_consumption_requester_csv(snapshot)

        report = ItemConsumptionReport(
            month=month,
            year=year,
            generated_at=timezone.now(),
            snapshot=snapshot,
        )
        report.csv_item_file.save(
            f"consumption_items_{year}_{month:02d}.csv",
            ContentFile(item_csv_bytes),
            save=False,
        )
        report.csv_requester_file.save(
            f"consumption_requesters_{year}_{month:02d}.csv",
            ContentFile(requester_csv_bytes),
            save=False,
        )
        report.save()

        self.stdout.write(f"Generated consumption report for {report.period_label}")
