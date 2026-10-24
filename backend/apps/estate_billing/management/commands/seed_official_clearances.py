import os
import django
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.estate_billing.models import HousingUnit, HousingClearance, HousingAllotment

OFFICIAL_CLEARANCES = [
    {
        'sr_no': 1,
        'house_type': 'Type B',
        'house_no': '27/103',
        'allottee_name': 'Dr Ajay',
        'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026',
        'priority': '',
        'civil_key_received_date': '6-Jul-2026',
        'civil_status': 'completed',
        'civil_completed_date': '7-Jul-2026',
        'electrical_key_received_date': '7-Jul-2026',
        'electrical_status': 'Completed',
        'electrical_completed_date': '7-Jul-2026',
        'hk_handover_date': '13/07/2026 at 10:00 hrs',
        'hk_status': 'Complted',
        'hk_completed_date': '14/07/2026 at 14:55 hrs',
        'estate_date_1': '14-Jul-26',
        'estate_date_2': '16-Jul-26',
        'estate_date_3': '16-Jul-26',
        'estate_date_4': '21-Jul-26',
        'remarks': 'The allotment of HB-27/103 was approved with effect from 26 June 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 2,
        'house_type': 'Type A',
        'house_no': '02/303',
        'allottee_name': 'Dr. Pratik',
        'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026',
        'priority': '',
        'civil_key_received_date': '6-Jul-2026',
        'civil_status': 'completed',
        'civil_completed_date': '7-Jul-2026',
        'electrical_key_received_date': '7-Jul-2026',
        'electrical_status': 'Completed',
        'electrical_completed_date': '7-Jul-2026',
        'hk_handover_date': '17/07/2026 at 15:05 hrs',
        'hk_status': 'Complted',
        'hk_completed_date': '21/07/2026 at 17: 20 hrs',
        'estate_date_1': '22-Jul-26',
        'estate_date_2': '22-Jul-26',
        'estate_date_3': '27-Jul-26',
        'estate_date_4': '30-Jul-26',
        'remarks': 'The allotment of HB-02/303 was approved with effect from 13 July 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 3,
        'house_type': 'Type C',
        'house_no': '13/301',
        'allottee_name': '',
        'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026',
        'priority': '',
        'civil_key_received_date': '6-Jul-2026',
        'civil_status': 'completed',
        'civil_completed_date': '15-Jul-2026',
        'electrical_key_received_date': '15-Jul-2026',
        'electrical_status': 'Completed',
        'electrical_completed_date': '15-Jul-2026',
        'hk_handover_date': '21/07/2026 at 15:35 hrs',
        'hk_status': 'Complted',
        'hk_completed_date': '23/07/2026 at 17:30 hrs',
        'estate_date_1': '',
        'estate_date_2': '',
        'estate_date_3': '',
        'estate_date_4': '',
        'remarks': '',
        'status': 'in_progress',
        'is_allotted': False,
    },
    {
        'sr_no': 4,
        'house_type': 'Type C',
        'house_no': '20/203',
        'allottee_name': 'Dr. Soumendu',
        'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026',
        'priority': '',
        'civil_key_received_date': '3-Aug-2026',
        'civil_status': 'completed',
        'civil_completed_date': '9-Aug-2026',
        'electrical_key_received_date': '9-Aug-2026',
        'electrical_status': 'Completed',
        'electrical_completed_date': '9-Aug-2026',
        'hk_handover_date': '10/08/2026 at 12:40 hrs',
        'hk_status': 'Complted',
        'hk_completed_date': '12/08/2026 at 14:30 hrs',
        'estate_date_1': '12-Aug-26',
        'estate_date_2': '14-Aug-26',
        'estate_date_3': '14-Aug-26',
        'estate_date_4': '19-Aug-26',
        'remarks': 'The allotment of RB-20/203 was approved with effect from 10th August 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 5,
        'house_type': 'Type C',
        'house_no': '19/101',
        'allottee_name': 'HMC office',
        'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026',
        'priority': '',
        'civil_key_received_date': '3-Aug-2026',
        'civil_status': 'completed',
        'civil_completed_date': '5-Aug-2026',
        'electrical_key_received_date': '5-Aug-2026',
        'electrical_status': 'Completed',
        'electrical_completed_date': '5-Aug-2026',
        'hk_handover_date': '07/08/2026 at 10:00 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '10/08/2026 at 09:55 hrs',
        'estate_date_1': '5-Aug-26',
        'estate_date_2': '11-Aug-26',
        'estate_date_3': '11-Aug-26',
        'estate_date_4': '12-Aug-26',
        'remarks': 'NA',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 6,
        'house_type': 'Type A',
        'house_no': '30/103',
        'allottee_name': 'Prof. Sivpriya',
        'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026',
        'priority': '',
        'civil_key_received_date': '3-Aug-2026',
        'civil_status': 'completed',
        'civil_completed_date': '9-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '12/09/2026 at 11:00 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '15/09/2026 at 14:00 hrs',
        'estate_date_1': '19-Aug-26',
        'estate_date_2': '21-Aug-26',
        'estate_date_3': '21-Aug-26',
        'estate_date_4': '25-Aug-26',
        'remarks': 'The allotment of RB-30/103 was approved with effect from 19th August 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 7,
        'house_type': 'Type B',
        'house_no': '25/201',
        'allottee_name': 'Dr Praharsh',
        'time_stamp': '17/08/26',
        'key_handed_over_date': '17/08/26',
        'priority': '',
        'civil_key_received_date': '17/08/26',
        'civil_status': 'completed',
        'civil_completed_date': '21-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '24/09/2026 at 17:00 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '28/09/2026 at 10:40 hrs',
        'estate_date_1': '29-Sep-26',
        'estate_date_2': '1-Oct-26',
        'estate_date_3': '1-Oct-26',
        'estate_date_4': '7-Oct-26',
        'remarks': 'The allotment of RB-25/201 was approved with effect from 25th August 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 8,
        'house_type': 'Type B',
        'house_no': '23/301',
        'allottee_name': 'Dr Aditya',
        'time_stamp': '25/08/26',
        'key_handed_over_date': '25/08/26',
        'priority': '',
        'civil_key_received_date': '25/08/26',
        'civil_status': 'completed',
        'civil_completed_date': '9-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '08/09/2026 at 17:30 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '10/09/2026 at 17:55 hrs',
        'estate_date_1': '11-Sep-26',
        'estate_date_2': '11-Sep-26',
        'estate_date_3': '11-Sep-26',
        'estate_date_4': '17-Sep-26',
        'remarks': 'The allotment of RB-23/302 was approved with effect from 25th August 2026',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 9,
        'house_type': 'Type D',
        'house_no': '33/405',
        'allottee_name': 'Pranav',
        'time_stamp': '01/09/26',
        'key_handed_over_date': '01/09/26',
        'priority': '',
        'civil_key_received_date': '01/09/26',
        'civil_status': 'completed',
        'civil_completed_date': '12-Sep-2026',
        'electrical_key_received_date': '12-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '12-Sep-2026',
        'hk_handover_date': '15/09/2026 at 14:10 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '17/09/2026 at 17:35 hrs',
        'estate_date_1': '18-Sep-26',
        'estate_date_2': '18-Sep-26',
        'estate_date_3': '18-Sep-26',
        'estate_date_4': '25-Sep-26',
        'remarks': '',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 10,
        'house_type': 'Type B',
        'house_no': '08/301',
        'allottee_name': 'Dr Hasan',
        'time_stamp': '10/09/2026',
        'key_handed_over_date': '10/09/2026',
        'priority': '2',
        'civil_key_received_date': '10/09/2026',
        'civil_status': 'completed',
        'civil_completed_date': '7-Oct-2026',
        'electrical_key_received_date': '21-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '21-Sep-2026',
        'hk_handover_date': '08/10/2026 at 10:40 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '12/10/2026 at 10:00 hrs',
        'estate_date_1': '12-Oct-26',
        'estate_date_2': '15-Oct-26',
        'estate_date_3': '15-Oct-26',
        'estate_date_4': '19-Oct-26',
        'remarks': '',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 11,
        'house_type': 'Type B',
        'house_no': '05/302',
        'allottee_name': 'Manuj Kumar Singh',
        'time_stamp': '09/25/2026',
        'key_handed_over_date': '09/25/2026',
        'priority': '',
        'civil_key_received_date': '09/25/2026',
        'civil_status': 'completed',
        'civil_completed_date': '19-Oct-2026',
        'electrical_key_received_date': '10-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '10-Sep-2026',
        'hk_handover_date': '21/10/2026 at 11:15 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '21/10/2026 at 17:30 hrs',
        'estate_date_1': '21-Oct-26',
        'estate_date_2': '21-Oct-26',
        'estate_date_3': '22-Oct-26',
        'estate_date_4': '22-Oct-26',
        'remarks': '',
        'status': 'completed',
        'is_allotted': True,
    },
    {
        'sr_no': 12,
        'house_type': 'Type B',
        'house_no': '06/301',
        'allottee_name': 'Vinod Ramakrishnan',
        'time_stamp': '09/26/2026',
        'key_handed_over_date': '09/26/2026',
        'priority': '',
        'civil_key_received_date': '09/26/2026',
        'civil_status': 'completed',
        'civil_completed_date': '19-Oct-2026',
        'electrical_key_received_date': '10-Sep-2026',
        'electrical_status': 'completed',
        'electrical_completed_date': '10-Sep-2026',
        'hk_handover_date': '21/10/2026 at 11:15 hrs',
        'hk_status': 'Completed',
        'hk_completed_date': '21/10/2026 at 17:45 hrs',
        'estate_date_1': '21-Oct-26',
        'estate_date_2': '21-Oct-26',
        'estate_date_3': '22-Oct-26',
        'estate_date_4': '22-Oct-26',
        'remarks': '',
        'status': 'completed',
        'is_allotted': True,
    },
]


class Command(BaseCommand):
    help = "Seeds official Housing Clearance / Allotment Pipeline records (12 rows)"

    def handle(self, *args, **options):
        self.stdout.write("Purging existing clearances and seeding official 12 pipeline records...")
        with transaction.atomic():
            HousingClearance.objects.all().delete()

            for item in OFFICIAL_CLEARANCES:
                raw_type = item['house_type'].replace('Type', '').strip()
                unit = HousingUnit.objects.filter(house_type__iexact=raw_type, house_no__iexact=item['house_no']).first()
                if not unit:
                    unit = HousingUnit.objects.filter(house_no__iexact=item['house_no']).first()

                # Fetch allottee profile from HousingAllotment if matching
                empl_code = ''
                designation = ''
                email = ''
                date_of_expiry = ''

                if unit and unit.current_allotment:
                    occ = unit.current_allotment
                    empl_code = occ.empl_code
                    designation = occ.designation
                    email = occ.email
                    date_of_expiry = occ.date_of_expiry
                elif item['allottee_name']:
                    match_allot = HousingAllotment.objects.filter(
                        occupant_name__icontains=item['allottee_name'].replace('Dr.', '').replace('Dr', '').replace('Prof.', '').strip()
                    ).first()
                    if match_allot:
                        empl_code = match_allot.empl_code
                        designation = match_allot.designation
                        email = match_allot.email
                        date_of_expiry = match_allot.date_of_expiry

                c = HousingClearance.objects.create(
                    unit=unit,
                    sr_no=item['sr_no'],
                    house_type=item['house_type'],
                    house_no=item['house_no'],
                    allottee_name=item['allottee_name'],
                    empl_code=empl_code,
                    designation=designation,
                    email=email,
                    date_of_expiry=date_of_expiry,
                    time_stamp=item['time_stamp'],
                    key_handed_over_date=item['key_handed_over_date'],
                    priority=item['priority'],
                    civil_key_received_date=item.get('civil_key_received_date', ''),
                    civil_status=item['civil_status'],
                    civil_completed_date=item['civil_completed_date'],
                    electrical_key_received_date=item.get('electrical_key_received_date', ''),
                    electrical_status=item['electrical_status'],
                    electrical_completed_date=item['electrical_completed_date'],
                    hk_handover_date=item['hk_handover_date'],
                    hk_status=item['hk_status'],
                    hk_completed_date=item['hk_completed_date'],
                    estate_date_1=item['estate_date_1'],
                    estate_date_2=item['estate_date_2'],
                    estate_date_3=item['estate_date_3'],
                    estate_date_4=item['estate_date_4'],
                    remarks=item['remarks'],
                    status=item['status'],
                    is_allotted=item['is_allotted'],
                    civil_is_locked=bool(item.get('civil_completed_date') or (item.get('civil_status') or '').lower() == 'completed'),
                    electrical_is_locked=bool(item.get('electrical_completed_date') or (item.get('electrical_status') or '').lower() == 'completed'),
                    hk_is_locked=bool(item.get('hk_completed_date') or (item.get('hk_status') or '').lower() in ['completed', 'complted']),
                )

                # Set unit status if under clearance
                if unit:
                    if not item['is_allotted'] and item['status'] == 'in_progress' and unit.status == HousingUnit.Status.VACANT:
                        unit.status = HousingUnit.Status.UNDER_CLEARANCE
                        unit.save(update_fields=['status'])

                self.stdout.write(f"  + Seeded Sr {c.sr_no}: {c.house_type} {c.house_no} - {c.allottee_name or '(Unassigned)'} [{c.status}]")

            # Update occupation and AL issue dates in HousingAllotment for settled faculty
            allot_updates = {
                '30/103': ('19-Aug-26', '19-Aug-26'),
                '05/302': ('21-Oct-26', '21-Oct-26'),
                '06/301': ('21-Oct-26', '21-Oct-26'),
            }
            for h_no, (occ_date, al_date) in allot_updates.items():
                a = HousingAllotment.objects.filter(house_no=h_no, is_current=True).first()
                if a:
                    a.date_of_occupation = occ_date
                    a.al_issue_date = al_date
                    a.save(update_fields=['date_of_occupation', 'al_issue_date'])
                    self.stdout.write(f"  + Updated Allotment {h_no} ({a.occupant_name}): OccDate={occ_date}, ALDate={al_date}")

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {HousingClearance.objects.count()} official clearances!"))
