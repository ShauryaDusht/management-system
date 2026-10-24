import json
import os
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.substation.models import SubstationSheet, SubstationReading, SubstationConfigDoc
from apps.users.models import User


class Command(BaseCommand):
    help = 'Seeds Substation Log sheets, initial configs, and historical readings from baseline fixtures.'

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

        # 3. Seed Default Electrical Staff Users
        staff_accounts = [
            {
                'username': 'operator',
                'first_name': 'Substation',
                'last_name': 'Operator',
                'email': 'operator@iitgn.ac.in',
                'phone': '9876543201',
                'role': 'electrical_operator',
                'is_staff': False,
                'password': 'operator123',
            },
            {
                'username': 'supervisor',
                'first_name': 'Substation',
                'last_name': 'Supervisor',
                'email': 'supervisor@iitgn.ac.in',
                'phone': '9876543202',
                'role': 'electrical_supervisor',
                'is_staff': True,
                'password': 'supervisor123',
            },
            {
                'username': 'admin',
                'first_name': 'Substation',
                'last_name': 'Admin',
                'email': 'admin@iitgn.ac.in',
                'phone': '9876543203',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'password': 'IITGN@2025',
            },
            {
                'username': 'ravi.patel',
                'first_name': 'Ravi',
                'last_name': 'Patel',
                'email': 'ravi.patel@iitgn.ac.in',
                'phone': '9876543210',
                'role': 'electrical_operator',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
            {
                'username': 'suresh.kumar',
                'first_name': 'Suresh',
                'last_name': 'Kumar',
                'email': 'suresh.kumar@iitgn.ac.in',
                'phone': '9876543211',
                'role': 'electrical_supervisor',
                'is_staff': True,
                'password': 'IITGN@2025',
            },
            {
                'username': 'operator.electrical',
                'first_name': 'Electrical',
                'last_name': 'Operator',
                'email': 'operator.electrical@iitgn.ac.in',
                'phone': '9876543212',
                'role': 'electrical_operator',
                'is_staff': False,
                'password': 'IITGN@2025',
            },
        ]
        for acc in staff_accounts:
            user, created = User.objects.get_or_create(
                username=acc['username'],
                defaults={
                    'first_name': acc['first_name'],
                    'last_name': acc['last_name'],
                    'email': acc['email'],
                    'phone': acc['phone'],
                    'role': acc['role'],
                    'is_staff': acc.get('is_staff', False),
                    'is_superuser': acc.get('is_superuser', False),
                    'is_active': True,
                }
            )
            user.role = acc['role']
            user.is_staff = acc.get('is_staff', False)
            if acc.get('is_superuser'):
                user.is_superuser = True
            user.is_active = True
            user.set_password(acc.get('password', 'IITGN@2025'))
            user.save()
            action = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{action} staff user {acc['username']} (role: {acc['role']}, password: {acc.get('password')})."))


