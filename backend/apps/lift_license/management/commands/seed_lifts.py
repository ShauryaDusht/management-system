import json
from pathlib import Path
from datetime import datetime
from django.core.management.base import BaseCommand
from apps.lift_license.models import LiftLicense


def parse_date(date_str):
    if not date_str:
        return None
    val = str(date_str).strip()
    if not val:
        return None
    try:
        return datetime.strptime(val, '%d.%m.%Y').date()
    except ValueError:
        pass
    try:
        return datetime.strptime(val, '%Y-%m-%d').date()
    except ValueError:
        pass
    return None


class Command(BaseCommand):
    help = 'Seed initial 46 lift licenses from lifts.json fixture'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing lift licenses before seeding',
        )

    def handle(self, *args, **options):
        fixture_path = Path(__file__).resolve().parent.parent.parent / 'fixtures' / 'lifts.json'
        if not fixture_path.exists():
            self.stderr.write(self.style.ERROR(f'Fixture not found at {fixture_path}'))
            return

        if options.get('clear'):
            count, _ = LiftLicense.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Cleared {count} existing lift licenses.'))

        with open(fixture_path, 'r', encoding='utf-8') as f:
            records = json.load(f)

        created_count = 0
        updated_count = 0

        for idx, item in enumerate(records, start=1):
            no = (item.get('no') or '').strip()
            if not no:
                continue

            frm_date = parse_date(item.get('frm'))
            till_date = parse_date(item.get('till'))

            defaults = {
                'loc': (item.get('loc') or '').strip(),
                'lift': (item.get('lift') or '').strip(),
                'prov': (item.get('prov') or '').strip() or None,
                'frm': frm_date,
                'till': till_date,
                'eng': (item.get('eng') or '').strip() or 'Mr. Naveen Rai',
                'rem': (item.get('rem') or '').strip() or None,
                'order': idx,
            }

            obj, created = LiftLicense.objects.update_or_create(
                no=no,
                defaults=defaults
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Successfully seeded lift licenses: {created_count} created, {updated_count} updated. Total: {LiftLicense.objects.count()}'
        ))
