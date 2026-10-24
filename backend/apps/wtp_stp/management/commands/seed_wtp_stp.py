import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.wtp_stp.models import BlockMeter, BlockReading


class Command(BaseCommand):
    help = 'Seeds WTP / STP meter app: 84 block meters and sample block readings.'

    def handle(self, *args, **options):
        fixture_dir = Path(__file__).resolve().parent.parent.parent / 'fixtures'
        blocks_file = fixture_dir / 'blocks.json'
        sample_file = fixture_dir / 'sample-block-readings.json'

        # 1. Seed Block Meters
        if blocks_file.exists():
            with open(blocks_file, 'r', encoding='utf-8') as f:
                blocks_data = json.load(f)

            b_count = 0
            for item in blocks_data:
                sr = item.get('sr')
                if sr is None:
                    continue
                BlockMeter.objects.update_or_create(
                    sr=int(sr),
                    defaults={
                        'block': item.get('block', f"Block #{sr}"),
                        'meter_no': item.get('meterNo', f"MTR-{sr}"),
                    }
                )
                b_count += 1
            self.stdout.write(self.style.SUCCESS(f"Seeded {b_count} Block Meters."))
        else:
            self.stdout.write(self.style.WARNING(f"blocks.json not found at {blocks_file}"))

        # 2. Seed Sample Block Readings
        if sample_file.exists():
            with open(sample_file, 'r', encoding='utf-8') as f:
                samples_data = json.load(f)

            s_count = 0
            for item in samples_data:
                month = item.get('month')
                if not month:
                    continue
                BlockReading.objects.update_or_create(
                    month=month,
                    defaults={
                        'date': item.get('date', f"{month}-01"),
                        'by': item.get('by', 'Imported from Excel'),
                        'readings': item.get('readings', {}),
                    }
                )
                s_count += 1
            self.stdout.write(self.style.SUCCESS(f"Seeded {s_count} monthly Block Readings."))
        else:
            self.stdout.write(self.style.WARNING(f"sample-block-readings.json not found at {sample_file}"))
