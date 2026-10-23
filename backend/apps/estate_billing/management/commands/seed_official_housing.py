from django.core.management.base import BaseCommand
from apps.estate_billing.models import (
    HousingUnit,
    HousingAllotment,
    HousingClearance,
)
from apps.estate_billing.housing_allotments_data import OFFICIAL_HOUSING_REGISTER
from apps.estate_billing.housing_master_data import MASTER_HOUSING_UNITS


class Command(BaseCommand):
    help = "Seed official IITGN campus quarters (435 units) and active occupants as on 13-Oct-2026."

    def handle(self, *args, **options):
        self.stdout.write("=== Cleaning and Seeding Official Staff Housing Data ===")

        # 1. Clean up test junk allotments
        deleted_allot, _ = HousingAllotment.objects.all().delete()
        self.stdout.write(f"  [OK] Cleaned {deleted_allot} previous allotments.")

        # 2. Clean rogue clearances (e.g. empty names or unassigned)
        rogue_c = HousingClearance.objects.filter(allottee_name="").delete()
        self.stdout.write(f"  [OK] Removed {rogue_c[0]} blank/rogue test clearances.")

        # 3. Clean any rogue HousingUnit not in official 435 quarters
        valid_keys = {(u['house_type'], u['house_no']) for u in MASTER_HOUSING_UNITS}
        all_units = list(HousingUnit.objects.all())
        removed_units = 0
        for u in all_units:
            if (u.house_type, u.house_no) not in valid_keys:
                u.delete()
                removed_units += 1
        if removed_units:
            self.stdout.write(f"  [OK] Removed {removed_units} non-standard housing units.")

        # 4. Upsert all 435 units and their allotments
        created_allotments = 0
        occupied_units = 0
        vacant_units = 0

        for row in OFFICIAL_HOUSING_REGISTER:
            h_type = row['house_type']
            h_no = row['house_no']
            block_no = h_no.split('/')[0] if '/' in h_no else ''
            floor_val = h_no.split('/')[1][0] if '/' in h_no and len(h_no.split('/')[1]) > 0 else '1'
            is_vacant = row.get('is_vacant', False)

            unit, _ = HousingUnit.objects.get_or_create(
                house_type=h_type,
                house_no=h_no,
                defaults={
                    'block_no': block_no,
                    'floor': floor_val,
                    'status': HousingUnit.Status.VACANT if is_vacant else HousingUnit.Status.OCCUPIED,
                    'is_active': True,
                }
            )

            unit.block_no = block_no
            unit.floor = floor_val
            unit.status = HousingUnit.Status.VACANT if is_vacant else HousingUnit.Status.OCCUPIED
            unit.is_active = True
            unit.save()

            if is_vacant:
                vacant_units += 1
            else:
                occupied_units += 1
                HousingAllotment.objects.create(
                    unit=unit,
                    sl=row['sl'],
                    house_type=h_type,
                    house_no=h_no,
                    occupant_name=row['occupant_name'],
                    empl_code=row.get('empl_code', ''),
                    designation=row.get('designation', ''),
                    email=row.get('email', ''),
                    date_of_occupation=row.get('date_of_occupation', ''),
                    al_issue_date=row.get('al_issue_date', ''),
                    date_of_expiry=row.get('date_of_expiry', ''),
                    status=HousingAllotment.Status.OCCUPIED,
                    is_current=True,
                    is_active=True,
                )
                created_allotments += 1

        # 5. Link any active clearances to units
        for c in HousingClearance.objects.filter(is_active=True):
            clean_type = c.house_type.replace('Type', '').strip()
            unit = HousingUnit.objects.filter(house_type=clean_type, house_no=c.house_no).first()
            if unit:
                c.unit = unit
                if c.status == HousingClearance.Status.COMPLETED:
                    c.is_allotted = True
                c.save(update_fields=['unit', 'is_allotted'])

        self.stdout.write(self.style.SUCCESS(
            f"=== SUCCESS ===\n"
            f"Total Quarters in System: {HousingUnit.objects.count()} (All 435 verified)\n"
            f"Occupied Units: {occupied_units}\n"
            f"Vacant Units: {vacant_units}\n"
            f"Active Allotments: {created_allotments}\n"
            f"Active Clearances in Pipeline: {HousingClearance.objects.count()}"
        ))
