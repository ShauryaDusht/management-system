import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.substation.models import SubstationSheet


class Command(BaseCommand):
    help = 'Seeds Substation Log sheets and definitions from sheets.json fixture.'

    def handle(self, *args, **options):
        fixture_dir = Path(__file__).resolve().parent.parent.parent / 'fixtures'
        sheets_file = fixture_dir / 'sheets.json'

        # 1. Seed SubstationSheets
        if sheets_file.exists():
            with open(sheets_file, 'r', encoding='utf-8') as f:
                sheets_data = json.load(f)

            count = 0
            for idx, item in enumerate(sheets_data):
                sheet_id = item.get('id')
                if not sheet_id:
                    continue
                SubstationSheet.objects.update_or_create(
                    id=sheet_id,
                    defaults={
                        'name': item.get('name', sheet_id),
                        'section': item.get('section', 'LT'),
                        'full_title': item.get('full', ''),
                        'mode': item.get('mode', 'snapshot'),
                        'slots': item.get('slots', ['R1', 'R2', 'R3']),
                        'tables': item.get('tables', []),
                        'display_order': idx,
                        'is_active': True,
                    }
                )
                count += 1
            self.stdout.write(self.style.SUCCESS(f"Seeded {count} Substation Sheets."))
        else:
            self.stdout.write(self.style.WARNING(f"sheets.json not found at {sheets_file}"))


