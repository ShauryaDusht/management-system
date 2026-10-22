import json
import random
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.wtp_stp.models import BlockMeter, BlockReading, WtpReading, SupervisorLog, GwssbBill
from apps.users.models import User


class Command(BaseCommand):
    help = 'Seeds WTP / STP meter app: 84 block meters, historical block readings, station logs, and staff accounts.'

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

        # 3. Seed Station Readings if empty
        if not WtpReading.objects.exists():
            self.stdout.write("Generating baseline WTP/STP station readings...")
            dates = [
                '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
                '2026-10-12', '2026-10-13', '2026-10-14'
            ]
            base_c = 100000
            base_f = 95000
            base_g = 42000
            base_h = 20000
            base_i = 1200.0
            base_j = 800.0
            base_m = 15000
            base_n = 12000
            base_o = 18000
            base_p = 16000
            base_q = 8000
            base_r = 5000
            base_s = 4000
            base_k = 25000
            base_l = 14000
            base_t = 6500
            base_jm1_m = 32000
            base_jm2_m = 31000
            base_jm3_m = 29000
            base_jm4_m = 15000
            base_jm5_m = 28000

            station_count = 0
            for d_str in dates:
                d = datetime.strptime(d_str, '%Y-%m-%d').date()
                for shift in [1, 2, 3]:
                    # WTP
                    base_c += 350 + random.randint(0, 50)
                    base_f += 320 + random.randint(0, 40)
                    base_g += 110 + random.randint(0, 20)
                    base_h += 80 + random.randint(0, 15)
                    WtpReading.objects.update_or_create(
                        date=d, shift=shift, station='wtp',
                        defaults={
                            'by': f'Operator S{shift}',
                            'status': 'verified',
                            'values': {
                                'b': round(14.2 + random.uniform(0, 0.8), 2),
                                'c': base_c,
                                'd': round(7.2 + random.uniform(0, 0.4), 2),
                                'e': round(1.1 + random.uniform(0, 0.4), 3),
                                'f': base_f,
                                'g': base_g,
                                'h': base_h,
                                'cl_wtp': round(10 + random.uniform(0, 4), 1),
                                'alum': round(35 + random.uniform(0, 10), 1),
                                'cl_wsc2': round(200 + random.uniform(0, 60)),
                            }
                        }
                    )

                    # STP
                    base_i += round(1.5 + random.uniform(0, 0.5), 2)
                    base_j += round(1.0 + random.uniform(0, 0.4), 2)
                    base_m += 60 + random.randint(0, 15)
                    base_n += 55 + random.randint(0, 12)
                    base_o += 90 + random.randint(0, 20)
                    base_p += 85 + random.randint(0, 18)
                    base_q += 40 + random.randint(0, 10)
                    base_r += 30 + random.randint(0, 8)
                    base_s += 25 + random.randint(0, 8)
                    WtpReading.objects.update_or_create(
                        date=d, shift=shift, station='stp',
                        defaults={
                            'by': f'Operator S{shift}',
                            'status': 'verified',
                            'values': {
                                'i': round(base_i, 2),
                                'j': round(base_j, 2),
                                'm': base_m,
                                'n': base_n,
                                'o': base_o,
                                'p': base_p,
                                'q': base_q,
                                'r': base_r,
                                's': base_s,
                                'cl_stp': round(6 + random.uniform(0, 3), 1),
                                'cl_wsc1': round(180 + random.uniform(0, 40)),
                            }
                        }
                    )

                    # WSC-III
                    base_k += 80 + random.randint(0, 15)
                    base_l += 50 + random.randint(0, 12)
                    base_t += 30 + random.randint(0, 8)
                    WtpReading.objects.update_or_create(
                        date=d, shift=shift, station='wsc3',
                        defaults={
                            'by': f'Operator S{shift}',
                            'status': 'verified',
                            'values': {
                                'k': base_k,
                                'l': base_l,
                                't': base_t,
                                'cl_wsc3': round(150 + random.uniform(0, 30)),
                            }
                        }
                    )

                    # Jalmandapam
                    base_jm1_m += 120 + random.randint(0, 30)
                    base_jm2_m += 115 + random.randint(0, 25)
                    base_jm3_m += 110 + random.randint(0, 25)
                    base_jm4_m += 60 + random.randint(0, 15)
                    base_jm5_m += 105 + random.randint(0, 20)
                    WtpReading.objects.update_or_create(
                        date=d, shift=shift, station='jm',
                        defaults={
                            'by': f'Operator S{shift}',
                            'status': 'verified',
                            'values': {
                                'jm1': round(2.4 + random.uniform(0, 0.6), 2),
                                'jm2': round(2.3 + random.uniform(0, 0.7), 2),
                                'jm3': round(2.2 + random.uniform(0, 0.8), 2),
                                'jm4': round(2.1 + random.uniform(0, 0.7), 2),
                                'jm5': round(2.3 + random.uniform(0, 0.7), 2),
                                'jm1_m': base_jm1_m,
                                'jm2_m': base_jm2_m,
                                'jm3_m': base_jm3_m,
                                'jm4_m': base_jm4_m,
                                'jm5_m': base_jm5_m,
                            }
                        }
                    )
                    station_count += 4

                # Also create a sample supervisor log for each date
                SupervisorLog.objects.update_or_create(
                    date=d, shift=1,
                    defaults={
                        'supervisor_name': 'Shift Engineer',
                        'status': 'Normal',
                        'notes': f"All water treatment systems operating normally for {d_str}.",
                        'handover_notes': "Pumping schedule active. Chlorine stocks sufficient.",
                        'checklist': {
                            'wtpChecked': True,
                            'stpChecked': True,
                            'chlorineChecked': True,
                            'jmTanksChecked': True,
                        }
                    }
                )

            self.stdout.write(self.style.SUCCESS(f"Seeded {station_count} station readings & supervisor logs."))

        # 4. Seed Default WTP Staff Accounts
        # 5. Seed GWSSB Water Bills
        gwssb_samples = [
            {'month': '2026-07', 'date': '2026-07-31', 'initial': 102.350, 'final': 114.850, 'actual_bill': 125000.0, 'bill_no': 'GWSSB/2026/07-441', 'status': 'Paid'},
            {'month': '2026-08', 'date': '2026-08-31', 'initial': 114.850, 'final': 128.250, 'actual_bill': 134000.0, 'bill_no': 'GWSSB/2026/08-512', 'status': 'Paid'},
            {'month': '2026-09', 'date': '2026-09-30', 'initial': 128.250, 'final': 141.950, 'actual_bill': 137000.0, 'bill_no': 'GWSSB/2026/09-623', 'status': 'Paid'},
            {'month': '2026-10', 'date': '2026-10-22', 'initial': 141.950, 'final': 156.450, 'actual_bill': 145000.0, 'bill_no': 'GWSSB/2026/10-705', 'status': 'Verified'},
        ]
        for b in gwssb_samples:
            GwssbBill.objects.update_or_create(
                month=b['month'],
                defaults={
                    'date': b['date'],
                    'initial_reading': b['initial'],
                    'final_reading': b['final'],
                    'rate_per_unit': 10.0,
                    'actual_bill': b['actual_bill'],
                    'bill_no': b['bill_no'],
                    'status': b['status'],
                    'by': 'Vikash Kumar Yadav',
                    'remarks': 'Narmada bulk line monthly meter reading',
                }
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(gwssb_samples)} GWSSB Water Bills."))

        staff_accounts = [
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
