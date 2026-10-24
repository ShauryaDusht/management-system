import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.users.models import User


class Command(BaseCommand):
    help = 'Provisions real HVAC operator and engineer users without dummy readings.'

    def handle(self, *args, **options):
        self.stdout.write("Provisioning HVAC operational staff accounts...")

        # 1. Create HVAC Staff Accounts
        staff_accounts = [
            # Real HVAC Engineer
            {
                'username': 'rajesh.mangwani',
                'first_name': 'Rajesh Kumar',
                'last_name': 'Mangwani',
                'email': 'rajesh.mangwani@iitgn.ac.in',
                'phone': '9644945675',
                'role': 'hvac_engineer',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            # Real HVAC Supervisors
            {
                'username': 'kushal.patel',
                'first_name': 'Kushal',
                'last_name': 'Patel',
                'email': 'kushal.patel@iitgn.ac.in',
                'phone': '7622059360',
                'role': 'hvac_supervisor',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'umesh.khetani',
                'first_name': 'Umesh',
                'last_name': 'Khetani',
                'email': 'umesh.khetani@iitgn.ac.in',
                'phone': '8485932077',
                'role': 'hvac_supervisor',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            # Real HVAC Operators / Technicians
            {
                'username': 'sunil.makwana',
                'first_name': 'Sunil',
                'last_name': 'Makwana',
                'email': 'sunil.makwana@iitgn.ac.in',
                'phone': '8347927646',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'kuldeep.patel',
                'first_name': 'Kuldeep',
                'last_name': 'Patel',
                'email': 'kuldeep.patel@iitgn.ac.in',
                'phone': '8980668066',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'manoj.dantani',
                'first_name': 'Manoj',
                'last_name': 'Dantani',
                'email': 'manoj.dantani@iitgn.ac.in',
                'phone': '9724156013',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'arun.bariya',
                'first_name': 'Arun',
                'last_name': 'Bariya',
                'email': 'arun.bariya@iitgn.ac.in',
                'phone': '8155070543',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'mitesh.sharma',
                'first_name': 'Mitesh',
                'last_name': 'Sharma',
                'email': 'mitesh.sharma@iitgn.ac.in',
                'phone': '9909234092',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'pankaj.chauhan',
                'first_name': 'Pankaj',
                'last_name': 'Chauhan',
                'email': 'pankaj.chauhan@iitgn.ac.in',
                'phone': '9898808661',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'vishal.makwana',
                'first_name': 'Vishal',
                'last_name': 'Makwana',
                'email': 'vishal.makwana@iitgn.ac.in',
                'phone': '8141662948',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'vipul.parmar',
                'first_name': 'Vipul',
                'last_name': 'Parmar',
                'email': 'vipul.parmar@iitgn.ac.in',
                'phone': '9510465497',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'kiran.dabhi',
                'first_name': 'Kiran',
                'last_name': 'Dabhi',
                'email': 'kiran.dabhi@iitgn.ac.in',
                'phone': '7041147485',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
            },
            {
                'username': 'maruf.shekh',
                'first_name': 'Maruf',
                'last_name': 'Shekh',
                'email': 'maruf.shekh@iitgn.ac.in',
                'phone': '7574008870',
                'role': 'hvac_operator',
                'is_staff': False,
                'passwords': ['IITGN@2025'],
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
            user.role = acc['role']
            user.is_active = True
            user.set_password(acc['passwords'][0])
            user.save()
            action = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{action} HVAC user: {uname} (role: {acc['role']})"))
