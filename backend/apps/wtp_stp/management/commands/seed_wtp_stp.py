import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.wtp_stp.models import BlockMeter, BlockReading
from apps.users.models import User


class Command(BaseCommand):
    help = 'Seeds WTP / STP meter app: 84 block meters, sample block readings, and staff accounts.'

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

        # 3. Seed Default WTP Staff Accounts
            {
                'username': 'wtp.engineer',
                'first_name': 'WTP Shift',
                'last_name': 'Engineer',
                'email': 'wtp.engineer@iitgn.ac.in',
                'phone': '9876543302',
                'role': 'wtp_supervisor',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'engineer',
                'first_name': 'Shift',
                'last_name': 'Engineer',
                'email': 'engineer.wtp@iitgn.ac.in',
                'phone': '9876543302',
                'role': 'wtp_supervisor',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'wtp_engineer',
                'first_name': 'WTP Shift',
                'last_name': 'Engineer',
                'email': 'wtp_engineer@iitgn.ac.in',
                'phone': '9876543302',
                'role': 'wtp_supervisor',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'wtp.supervisor',
                'first_name': 'WTP',
                'last_name': 'Supervisor',
                'email': 'wtp.supervisor@iitgn.ac.in',
                'phone': '9876543302',
                'role': 'wtp_supervisor',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'wtp_supervisor',
                'first_name': 'WTP',
                'last_name': 'Supervisor',
                'email': 'wtp_supervisor@iitgn.ac.in',
                'phone': '9876543302',
                'role': 'wtp_supervisor',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'wtp.operator',
                'first_name': 'WTP',
                'last_name': 'Operator',
                'email': 'wtp.operator@iitgn.ac.in',
                'phone': '9876543301',
                'role': 'wtp_operator',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'wtp_operator',
                'first_name': 'WTP',
                'last_name': 'Operator',
                'email': 'wtp_operator@iitgn.ac.in',
                'phone': '9876543301',
                'role': 'wtp_operator',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
        ]

        for acc in staff_accounts:
            uname = acc['username']
            user, created = User.objects.get_or_create(
                username=uname,
                defaults={
                    'first_name': acc['first_name'],
                    'last_name': acc['last_name'],
                    'email': acc['email'],
                    'phone': acc['phone'],
                    'role': acc['role'],
                    'is_staff': acc['is_staff'],
                    'is_active': True,
                }
            )
            if created:
                user.set_password(acc['password'])
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Created user: {uname} (role: {acc['role']})"))
            else:
                user.role = acc['role']
                user.is_active = True
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Verified user: {uname}"))
