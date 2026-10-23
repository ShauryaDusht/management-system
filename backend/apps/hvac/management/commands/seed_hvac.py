import json
import math
from datetime import datetime, date
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.hvac.models import HvacLog, HvacSupervisorLog, CHILLERS, derive_values
from apps.users.models import User


class Command(BaseCommand):
    help = 'Seeds HVAC Plant Log demo data from Excel/JSON fixtures and provisions HVAC operator/engineer users.'

    def handle(self, *args, **options):
        fixture_dir = Path(__file__).resolve().parent.parent.parent / 'fixtures' / 'seed'
        if not fixture_dir.exists():
            self.stdout.write(self.style.ERROR(f"Seed directory not found at {fixture_dir}"))
            return

        json_files = sorted(fixture_dir.glob('s*.json'))
        if not json_files:
            self.stdout.write(self.style.ERROR(f"No s*.json files found in {fixture_dir}"))
            return

        base_slots = []
        for jf in json_files:
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    base_slots.append(json.load(f))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Could not load {jf}: {e}"))

        base_slots.sort(key=lambda x: x.get('slot', 0))
        self.stdout.write(self.style.SUCCESS(f"Loaded {len(base_slots)} base hourly slot templates."))

        def r2(val):
            return round(val, 2)

        total_seeded = 0

        # We will seed two sets of dates:
        # 1. Historical Excel dataset: 2024-09-01, 2024-09-02, 2024-09-03
        # 2. Current operational dataset: 2026-10-17, 2026-10-18, 2026-10-19, 2026-10-20, 2026-10-21
        date_groups = [
            ('2024-09-01', '2024-09-02', '2024-09-03'),
            ('2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'),
        ]

        operator_names = [
            'Ramesh Varma', 'Kailash Solanki', 'Mohan Prajapati',
            'Sanjay Patel', 'Dinesh Chavda', 'Amit Sharma'
        ]

        for g_idx, dates in enumerate(date_groups):
            base_mwh1 = 6946.45 if g_idx == 0 else 8420.15
            base_mwh2 = 6987.77 if g_idx == 0 else 8512.40
            base_wm1 = 15200.0 if g_idx == 0 else 18450.0
            base_wm2 = 9800.0 if g_idx == 0 else 11240.0
            base_wm3 = 4500.0 if g_idx == 0 else 6200.0

            for d_idx, d_str in enumerate(dates):
                for b in base_slots:
                    slot = b.get('slot', 0)
                    time_str = b.get('time', f"{slot:02d}:30")
                    shift_str = str(b.get('shift') or ((slot // 8) + 1))
                    op_name = operator_names[(slot // 4 + d_idx) % len(operator_names)]

                    v = dict(b.get('v', {}))
                    # Apply sinusoidal variation for days > 0
                    if d_idx > 0:
                        for k, val in list(v.items()):
                            if isinstance(val, (int, float)) and not k.endswith('_mwh') and not k.endswith('_kl'):
                                factor = 1.0 + 0.02 * math.sin(slot * 1.7 + d_idx * 3 + len(k))
                                v[k] = r2(val * factor)

                    # Progressive cumulative meters
                    v['pn1_mwh'] = r2(base_mwh1 + d_idx * 92.5 + slot * 3.85)
                    v['pn2_mwh'] = r2(base_mwh2 + d_idx * 118.2 + slot * 4.92)
                    v['wm1_kl'] = r2(base_wm1 + d_idx * 210.0 + slot * 8.75)
                    v['wm2_kl'] = r2(base_wm2 + d_idx * 95.0 + slot * 3.42)
                    v['wm3_kl'] = r2(base_wm3 + d_idx * 45.0 + slot * 1.85)
                    v['wm_chilled_kl'] = v['wm3_kl']

                    # Ensure chiller running status is clean
                    if v.get('c5_evapIn') is not None and v.get('c5_evapOut') is not None:
                        v['c5_st'] = 'on'
                    if slot >= 8 and slot <= 20:
                        v['c6_st'] = 'on'
                        v['c6_evapIn'] = r2(11.2 + 0.5 * math.sin(slot))
                        v['c6_evapOut'] = r2(7.8 + 0.3 * math.cos(slot))
                        v['c6_rla'] = r2(52.0 + slot % 5)

                    log_id = f"{d_str}_{time_str.replace(':', '')}"

                    HvacLog.objects.update_or_create(
                        id=log_id,
                        defaults={
                            'date': d_str,
                            'time': time_str,
                            'slot': slot,
                            'shift': shift_str,
                            'operator': op_name,
                            'setpoint': 7.0 if slot % 2 == 0 else 7.5,
                            'values': v,
                            'ts': int(timezone.now().timestamp() * 1000) - (len(dates) - d_idx) * 86400000 + slot * 3600000,
                        }
                    )
                    total_seeded += 1

                # Seed Supervisor Handover for each shift
                for s in ['1', '2', '3']:
                    HvacSupervisorLog.objects.update_or_create(
                        date=d_str,
                        shift=s,
                        defaults={
                            'status': 'Normal' if (d_idx + int(s)) % 3 != 0 else 'Attention Needed',
                            'chillers_checked': True,
                            'pumps_checked': True,
                            'towers_checked': True,
                            'panels_checked': True,
                            'water_checked': True,
                            'notes': f"Shift {s} on {d_str}: Chiller 5 & 6 operating normally within ΔT parameters. Daily routine filter check completed.",
                            'supervisor_name': 'R. K. Verma (HVAC Engineer)',
                        }
                    )

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {total_seeded} HVAC log entries!"))

        # 3. Create HVAC Staff Accounts
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
