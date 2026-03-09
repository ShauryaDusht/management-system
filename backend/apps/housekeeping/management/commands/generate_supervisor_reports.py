from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.text import slugify

from apps.reports.exporters import export_supervisor_report_csv
from apps.reports.generators import generate_supervisor_report
from apps.reports.models import SupervisorMonthlyReport


def _previous_completed_month(today):
    first_of_current = today.replace(day=1)
    prev_month_date = first_of_current - timedelta(days=1)
    return prev_month_date.month, prev_month_date.year


def _supervisor_report_filename(supervisor, month, year):
    safe_username = slugify(supervisor.username) or str(supervisor.id)
    return f"supervisor_{safe_username}_{month:02d}_{year}.csv"


class Command(BaseCommand):
    help = 'Generate supervisor/caretaker monthly task completion CSV reports for a completed month.'

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
        if (year, month) >= (today.year, today.month):
            raise CommandError('Only completed past months can be generated/cached.')

        User = get_user_model()
        supervisors = User.objects.filter(
            is_active=True,
            role__in=['supervisor', 'caretaker'],
        ).order_by('first_name', 'last_name', 'username')

        generated = 0
        skipped = 0

        for supervisor in supervisors:
            display_name = supervisor.get_full_name() or supervisor.username
            if SupervisorMonthlyReport.objects.filter(
                supervisor=supervisor,
                month=month,
                year=year,
            ).exists():
                skipped += 1
                self.stdout.write(f"Skipped (cached): {display_name}")
                continue

            snapshot = generate_supervisor_report(supervisor.id, month, year)
            csv_bytes = export_supervisor_report_csv(snapshot)

            report = SupervisorMonthlyReport(
                supervisor=supervisor,
                month=month,
                year=year,
                generated_at=timezone.now(),
                snapshot=snapshot,
            )
            filename = _supervisor_report_filename(supervisor, month, year)
            report.csv_file.save(filename, ContentFile(csv_bytes), save=False)
            report.save()

            generated += 1
            self.stdout.write(f"Generated: {display_name}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done for {month:02d}/{year}. Generated={generated}, Skipped={skipped}."
            )
        )
