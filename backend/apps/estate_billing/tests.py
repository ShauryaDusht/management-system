from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    EstateSettings,
    BillingCycle,
    Shop,
    ShopDemandNote,
    Contractor,
    ContractorDemandNote,
    HousingUnit,
    HousingAllotment,
)
from .views import (
    calculate_shop_total,
    calculate_contractor_total,
    ensure_cycle_notes,
)

User = get_user_model()


class EstateBillingTestCase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin.test',
            email='admin@test.com',
            password='Password@123',
            role='admin',
        )
        self.estate_user = User.objects.create_user(
            username='estate.test',
            email='estate@test.com',
            password='Password@123',
            role='estate_office',
        )
        self.normal_user = User.objects.create_user(
            username='normal.test',
            email='normal@test.com',
            password='Password@123',
            role='supervisor',
        )

        self.client = APIClient()

        # Seed 1 shop and 1 contractor
        self.shop = Shop.objects.create(
            sl=1,
            name='Test Cafe',
            fixed=False,
            default_rate=Decimal('9.55'),
            default_water=Decimal('320.00'),
        )
        self.contractor = Contractor.objects.create(
            sl=1,
            name='Test Contractor Ltd',
            to_line='CPWD (Test)',
        )

        self.cycle_month = '2026-10'
        ensure_cycle_notes(self.cycle_month)

    def test_calculations(self):
        # 1678 units * 9.55 + 320 = 16024.90 -> round half up = 16025 + 320 = 16345
        tot = calculate_shop_total('1678', Decimal('9.55'), Decimal('320'), False)
        self.assertEqual(tot, Decimal('16345'))

        # Fixed shop
        tot_fixed = calculate_shop_total('', Decimal('9.55'), Decimal('500'), True)
        self.assertEqual(tot_fixed, Decimal('500'))

        # Contractor meters: 1200 - 1000 = 200 * 9.55 = 1910
        meters = [{'current': '1200', 'previous': '1000', 'rate': 9.55}]
        c_tot = calculate_contractor_total(meters)
        self.assertEqual(c_tot, Decimal('1910'))

    def test_permission_denied_for_unauthorized_role(self):
        self.client.force_authenticate(user=self.normal_user)
        res = self.client.get('/api/estate/shops/')
        self.assertEqual(res.status_code, 403)

    def test_admin_access_and_patch(self):
        # Admin can view
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/estate/shops/?cycle={self.cycle_month}')
        self.assertEqual(res.status_code, 200)

        # Admin can patch shop when editing
        note_id = res.data[0]['id']
        patch_res = self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'units': '100'},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)

        # Admin can update settings
        put_res = self.client.put(
            '/api/estate/settings/',
            {'headline': 'Office Demand Note'},
            format='json',
        )
        self.assertEqual(put_res.status_code, 200)

    def test_estate_office_access_and_patch(self):
        self.client.force_authenticate(user=self.estate_user)
        res = self.client.get(f'/api/estate/shops/?cycle={self.cycle_month}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

        note_id = res.data[0]['id']
        patch_res = self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'units': '100', 'rate': 10, 'water': 200},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['units'], '100')
        # 100 * 10 + 200 = 1200
        self.assertEqual(Decimal(str(patch_res.data['total_amount'])), Decimal('1200'))

    def test_shop_demand_note_cycle_independent_expiry(self):
        self.client.force_authenticate(user=self.estate_user)
        # 1. Patch cycle 2026-10 with expiryDate
        res = self.client.get(f'/api/estate/shops/?cycle={self.cycle_month}')
        note_id_1 = res.data[0]['id']
        patch_res = self.client.patch(
            f'/api/estate/shops/{note_id_1}/',
            {'expiryDate': '2026-10-31'},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['expiryDate'], '2026-10-31')

        # 2. Open new cycle 2026-11
        ensure_cycle_notes('2026-11')
        res_new = self.client.get('/api/estate/shops/?cycle=2026-11')
        note_id_2 = res_new.data[0]['id']
        self.assertNotEqual(note_id_1, note_id_2)
        # New cycle should start blank, not inheriting 2026-10's expiry date
        self.assertEqual(res_new.data[0]['expiryDate'], '')

        # 3. Patch cycle 2026-11 with a different expiry date
        patch_res_2 = self.client.patch(
            f'/api/estate/shops/{note_id_2}/',
            {'expiryDate': '2026-11-30'},
            format='json',
        )
        self.assertEqual(patch_res_2.status_code, 200)
        self.assertEqual(patch_res_2.data['expiryDate'], '2026-11-30')

        # 4. Check cycle 2026-10 still has original 2026-10-31 date
        note_1 = ShopDemandNote.objects.get(id=note_id_1)
        self.assertEqual(note_1.expiry_date, '2026-10-31')

    def test_contractors_patch(self):
        self.client.force_authenticate(user=self.estate_user)
        res = self.client.get(f'/api/estate/contractors/?cycle={self.cycle_month}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

        note_id = res.data[0]['id']
        patch_res = self.client.patch(
            f'/api/estate/contractors/{note_id}/',
            {
                'meters': [
                    {'label': 'M1', 'current': '250', 'previous': '150', 'rate': 10.0}
                ]
            },
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        # (250 - 150) * 10 = 1000
        self.assertEqual(Decimal(str(patch_res.data['total_amount'])), Decimal('1000'))

    def test_settings_get_and_put(self):
        # Admin can get
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/estate/settings/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['headline'], 'Demand Note')

        # Estate office can put
        self.client.force_authenticate(user=self.estate_user)
        put_res = self.client.put(
            '/api/estate/settings/',
            {'headline': 'Office Demand Note', 'firstNoteNo': 300},
            format='json',
        )
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.data['headline'], 'Office Demand Note')
        self.assertEqual(put_res.data['firstNoteNo'], 300)

    def test_housing_allotments(self):
        # Admin can view housing allotments (auto-seeds 13 records and 435 master units)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/estate/housing/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 418)
        self.assertEqual(res.data[0]['occupantName'], 'Gaurav Srivastava')
        self.assertEqual(res.data[0]['houseNo'], '01/101')

        # Check master units
        units_res = self.client.get('/api/estate/housing/units/')
        self.assertEqual(units_res.status_code, 200)
        self.assertEqual(len(units_res.data), 435)

        # 1. Validation Rule: Cannot allot an already OCCUPIED house!
        self.client.force_authenticate(user=self.estate_user)
        dup_res = self.client.post(
            '/api/estate/housing/',
            {
                'houseType': 'A',
                'houseNo': '01/101',  # already occupied by Gaurav Srivastava!
                'occupantName': 'Dr. Duplicate',
                'emplCode': '9999',
            },
            format='json',
        )
        self.assertEqual(dup_res.status_code, 400)
        self.assertIn('OCCUPIED', dup_res.data['error'])

        # 2. Setup allotment for Dr. Test Faculty in vacant house 07/301
        unit_101 = HousingUnit.objects.get(house_type='B', house_no='07/301')
        allotment = HousingAllotment.objects.create(
            unit=unit_101,
            sl=999,
            house_type='B',
            house_no='07/301',
            occupant_name='Dr. Test Faculty',
            empl_code='0999',
            designation='Assistant Professor',
            email='faculty@iitgn.ac.in',
            date_of_occupation='01-Nov-26',
            date_of_expiry='PoE/Relocation, whichever is earlier',
            is_current=True,
            status=HousingAllotment.Status.OCCUPIED,
        )
        unit_101.status = HousingUnit.Status.OCCUPIED
        unit_101.save(update_fields=['status'])
        new_id = allotment.id

        # 3. Relocate Dr. Test Faculty from 07/301 to vacant 09/303
        reloc_res = self.client.post(
            f'/api/estate/housing/{new_id}/relocate/',
            {
                'targetHouseType': 'B',
                'targetHouseNo': '09/303',
                'relocationDate': '15-Dec-26',
                'remarks': 'Upgraded unit',
            },
            format='json',
        )
        self.assertEqual(reloc_res.status_code, 200)
        self.assertTrue(reloc_res.data['success'])

        # 4. History check for employee 0999: should have 2 records and 1 room change!
        hist_res = self.client.get('/api/estate/housing/history/?empl_code=0999')
        self.assertEqual(hist_res.status_code, 200)
        self.assertEqual(hist_res.data['totalAllotments'], 2)
        self.assertEqual(hist_res.data['roomChangesCount'], 1)
        self.assertEqual(hist_res.data['currentHouse']['houseNo'], '09/303')

        # 5. Vacate the current house 09/303
        curr_id = hist_res.data['currentHouse']['id']
        vacate_res = self.client.post(
            f'/api/estate/housing/{curr_id}/vacate/',
            {
                'dateOfVacation': '31-Jan-27',
                'vacationReason': 'Contract completed',
            },
            format='json',
        )
        self.assertEqual(vacate_res.status_code, 200)
        self.assertTrue(vacate_res.data['success'])

    def test_continuous_note_numbers_across_cycles(self):
        self.client.force_authenticate(user=self.estate_user)
        # Add a second shop to test sequencing
        Shop.objects.create(
            sl=2,
            name='Second Shop',
            address='IITGN',
            default_rate=Decimal('9.55'),
            default_water=Decimal('320.00'),
            is_active=True,
        )
        ensure_cycle_notes('2026-10')
        notes_10 = list(ShopDemandNote.objects.filter(cycle_month='2026-10', shop__is_active=True).order_by('shop__sl'))
        self.assertEqual(len(notes_10), 2)
        # In test DB, default first_note_no is 259
        self.assertEqual(notes_10[0].note_no, 'IWD/26-27/259')
        self.assertEqual(notes_10[1].note_no, 'IWD/26-27/260')

        # Next cycle 2026-11 must start at 261
        ensure_cycle_notes('2026-11')
        notes_11 = list(ShopDemandNote.objects.filter(cycle_month='2026-11', shop__is_active=True).order_by('shop__sl'))
        self.assertEqual(len(notes_11), 2)
        self.assertEqual(notes_11[0].note_no, 'IWD/26-27/261')
        self.assertEqual(notes_11[1].note_no, 'IWD/26-27/262')

    def test_cancel_shop_demand_note_resequencing(self):
        self.client.force_authenticate(user=self.estate_user)
        Shop.objects.create(
            sl=2,
            name='Second Shop',
            address='IITGN',
            default_rate=Decimal('9.55'),
            default_water=Decimal('320.00'),
            is_active=True,
        )
        ensure_cycle_notes('2026-10')
        notes_10 = list(ShopDemandNote.objects.filter(cycle_month='2026-10', shop__is_active=True).order_by('shop__sl'))
        first_note_id = notes_10[0].id

        # Cancel shop 1: note_no becomes 'CANCELLED', amount becomes 0, shop 2 gets 259
        patch_res = self.client.patch(
            f'/api/estate/shops/{first_note_id}/',
            {'isCancelled': True},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertTrue(patch_res.data['isCancelled'])
        self.assertEqual(patch_res.data['noteNo'], 'CANCELLED')
        self.assertEqual(Decimal(str(patch_res.data['total_amount'])), Decimal('0'))

        # Shop 2 note should now take note number 259
        shop_2_note = ShopDemandNote.objects.get(id=notes_10[1].id)
        self.assertEqual(shop_2_note.note_no, 'IWD/26-27/259')



