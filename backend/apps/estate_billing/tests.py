from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from unittest.mock import patch
from .models import (
    EstateSettings,
    BillingCycle,
    Shop,
    ShopDemandNote,
    Contractor,
    ContractorDemandNote,
    HousingUnit,
    HousingAllotment,
    HousingClearance,
)
from .notifications import (
    send_handover_alert,
    EVENT_ESTATE_TO_CIVIL,
    EVENT_CIVIL_TO_ELECTRICAL,
    EVENT_ELECTRICAL_TO_HK,
    EVENT_HK_TO_ESTATE,
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
        self.civil_user = User.objects.create_user(
            username='civil.test',
            email='civil@test.com',
            password='Password@123',
            role='civil_team',
        )
        self.electrical_user = User.objects.create_user(
            username='elec.test',
            email='elec@test.com',
            password='Password@123',
            role='electrical_team',
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
        # In test DB, default first_note_no is 230
        self.assertEqual(notes_10[0].note_no, 'IWD/26-27/230')
        self.assertEqual(notes_10[1].note_no, 'IWD/26-27/231')

        # Next cycle 2026-11 must start at 232
        ensure_cycle_notes('2026-11')
        notes_11 = list(ShopDemandNote.objects.filter(cycle_month='2026-11', shop__is_active=True).order_by('shop__sl'))
        self.assertEqual(len(notes_11), 2)
        self.assertEqual(notes_11[0].note_no, 'IWD/26-27/232')
        self.assertEqual(notes_11[1].note_no, 'IWD/26-27/233')

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

        # Cancel shop 1: note_no becomes 'CANCELLED', amount becomes 0, shop 2 gets 230
        patch_res = self.client.patch(
            f'/api/estate/shops/{first_note_id}/',
            {'isCancelled': True},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertTrue(patch_res.data['isCancelled'])
        self.assertEqual(patch_res.data['noteNo'], 'CANCELLED')
        self.assertEqual(Decimal(str(patch_res.data['total_amount'])), Decimal('0'))

        # Shop 2 note should now take note number 230
        shop_2_note = ShopDemandNote.objects.get(id=notes_10[1].id)
        self.assertEqual(shop_2_note.note_no, 'IWD/26-27/230')

    def test_independent_contractor_note_numbers_across_cycles(self):
        self.client.force_authenticate(user=self.estate_user)
        # Add a second contractor
        Contractor.objects.create(
            sl=2,
            name='Second Contractor Ltd',
            to_line='CPWD 2',
            is_active=True,
        )
        ensure_cycle_notes('2026-10')
        c_notes_10 = list(ContractorDemandNote.objects.filter(cycle_month='2026-10', contractor__is_active=True).order_by('contractor__sl'))
        self.assertEqual(len(c_notes_10), 2)
        # Contractor starts at default first_contractor_note_no (228)
        self.assertEqual(c_notes_10[0].note_no, 'IWD/26-27/228')
        self.assertEqual(c_notes_10[1].note_no, 'IWD/26-27/229')

        # Next cycle 2026-11 must continue from max (229) + 1 = 230
        ensure_cycle_notes('2026-11')
        c_notes_11 = list(ContractorDemandNote.objects.filter(cycle_month='2026-11', contractor__is_active=True).order_by('contractor__sl'))
        self.assertEqual(len(c_notes_11), 2)
        self.assertEqual(c_notes_11[0].note_no, 'IWD/26-27/230')
        self.assertEqual(c_notes_11[1].note_no, 'IWD/26-27/231')

    def test_department_specific_clearance_email_toggle(self):
        # 1. Civil user can access toggle endpoint and gets their department metadata
        self.client.force_authenticate(user=self.civil_user)
        res = self.client.get('/api/estate/housing/clearances/toggle-alerts/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['userDept'], 'civil')
        self.assertFalse(res.data['isMaster'])
        self.assertTrue(res.data['civil'])

        # 2. Civil user cannot toggle other department alerts (e.g. electrical)
        res_forbidden = self.client.post(
            '/api/estate/housing/clearances/toggle-alerts/',
            {'department': 'electrical', 'enabled': False},
            format='json',
        )
        self.assertEqual(res_forbidden.status_code, 403)

        # 3. Civil user CAN toggle their own department alert
        res_toggle_civil = self.client.post(
            '/api/estate/housing/clearances/toggle-alerts/',
            {'department': 'civil', 'enabled': False},
            format='json',
        )
        self.assertEqual(res_toggle_civil.status_code, 200)
        self.assertFalse(res_toggle_civil.data['civil'])

        # Verify DB: Only civil alerts are disabled; other departments remain enabled
        settings = EstateSettings.get_settings()
        self.assertFalse(settings.enable_civil_alerts)
        self.assertTrue(settings.enable_electrical_alerts)
        self.assertTrue(settings.enable_hk_alerts)
        self.assertTrue(settings.enable_estate_alerts)

        # 4. Master (Estate Office) can toggle any department and master switch
        self.client.force_authenticate(user=self.estate_user)
        res_estate_get = self.client.get('/api/estate/housing/clearances/toggle-alerts/')
        self.assertEqual(res_estate_get.status_code, 200)
        self.assertTrue(res_estate_get.data['isMaster'])

        # Estate office turns global alerts ON
        res_global = self.client.post(
            '/api/estate/housing/clearances/toggle-alerts/',
            {'department': 'all', 'enabled': True},
            format='json',
        )
        self.assertEqual(res_global.status_code, 200)
        self.assertTrue(res_global.data['enabled'])

        # 5. Check send_handover_alert behavior:
        # Since enable_civil_alerts is False, EVENT_ESTATE_TO_CIVIL should skip sending email!
        clearance = HousingClearance.objects.create(
            house_no='01/101',
            house_type='A',
        )

        with patch('apps.estate_billing.notifications.threading.Thread') as mock_thread:
            send_handover_alert(clearance, EVENT_ESTATE_TO_CIVIL)
            # Civil alerts are OFF, so no Thread is started for Civil
            mock_thread.assert_not_called()

            # But Electrical alerts are ON, so Thread is initialized and started
            send_handover_alert(clearance, EVENT_CIVIL_TO_ELECTRICAL)
            self.assertEqual(mock_thread.call_count, 1)

            # Now disable Electrical alerts too
            settings.enable_electrical_alerts = False
            settings.save()

            mock_thread.reset_mock()
            send_handover_alert(clearance, EVENT_CIVIL_TO_ELECTRICAL)
            # Now Electrical is also OFF, so no Thread is started
            mock_thread.assert_not_called()

    def test_partial_installment_payments_tracking(self):
        self.client.force_authenticate(user=self.estate_user)
        res = self.client.get(f'/api/estate/shops/?cycle={self.cycle_month}')
        self.assertEqual(res.status_code, 200)
        note_id = res.data[0]['id']

        # Set shop total to 10,000 (1000 units * 10 rate)
        self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'units': '1000', 'rate': '10.00', 'water': '0.00'},
            format='json',
        )
        shop_note = ShopDemandNote.objects.get(id=note_id)
        self.assertEqual(shop_note.total_amount, Decimal('10000.00'))
        self.assertEqual(shop_note.payment_status, 'unpaid')
        self.assertEqual(shop_note.total_paid, Decimal('0.00'))
        self.assertEqual(shop_note.balance_due, Decimal('10000.00'))

        # 1st installment: 5,000
        p1 = [{'amount': '5000', 'date': '2026-10-27', 'mode': 'Online', 'receipt_no': 'SBI1001'}]
        p_res_1 = self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'payments': p1},
            format='json',
        )
        self.assertEqual(p_res_1.status_code, 200)
        self.assertEqual(Decimal(str(p_res_1.data['totalPaid'])), Decimal('5000.00'))
        self.assertEqual(Decimal(str(p_res_1.data['balanceDue'])), Decimal('5000.00'))
        self.assertEqual(p_res_1.data['paymentStatus'], 'partially_paid')

        # 2nd installment: 2,000 more (total paid 7,000, due 3,000)
        p2 = p1 + [{'amount': '2000', 'date': '2026-10-28', 'mode': 'Cheque', 'receipt_no': 'CHQ2002'}]
        p_res_2 = self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'payments': p2},
            format='json',
        )
        self.assertEqual(p_res_2.status_code, 200)
        self.assertEqual(Decimal(str(p_res_2.data['totalPaid'])), Decimal('7000.00'))
        self.assertEqual(Decimal(str(p_res_2.data['balanceDue'])), Decimal('3000.00'))
        self.assertEqual(p_res_2.data['paymentStatus'], 'partially_paid')

        # 3rd installment: remaining 3,000 (total paid 10,000, due 0)
        p3 = p2 + [{'amount': '3000', 'date': '2026-10-29', 'mode': 'Cash', 'receipt_no': 'CSH3003'}]
        p_res_3 = self.client.patch(
            f'/api/estate/shops/{note_id}/',
            {'payments': p3},
            format='json',
        )
        self.assertEqual(p_res_3.status_code, 200)
        self.assertEqual(Decimal(str(p_res_3.data['totalPaid'])), Decimal('10000.00'))
        self.assertEqual(Decimal(str(p_res_3.data['balanceDue'])), Decimal('0.00'))
        self.assertEqual(p_res_3.data['paymentStatus'], 'paid')

        # Contractor partial payment test
        c_res = self.client.get(f'/api/estate/contractors/?cycle={self.cycle_month}')
        c_note_id = c_res.data[0]['id']
        c_patch = self.client.patch(
            f'/api/estate/contractors/{c_note_id}/',
            {'payments': [{'amount': '1500', 'date': '2026-10-27', 'mode': 'UPI'}]},
            format='json',
        )
        self.assertEqual(c_patch.status_code, 200)
        self.assertEqual(Decimal(str(c_patch.data['totalPaid'])), Decimal('1500.00'))

    def test_housing_clearance_delete_history_and_recovery(self):
        # Create completed clearances
        c1 = HousingClearance.objects.create(
            sr_no=101,
            house_type='Type A',
            house_no='01/101',
            allottee_name='User One',
            status='completed',
            is_allotted=True,
            estate_date_1='2026-01-15',
        )
        c2 = HousingClearance.objects.create(
            sr_no=102,
            house_type='Type B',
            house_no='02/202',
            allottee_name='User Two',
            status='completed',
            is_allotted=True,
            estate_date_1='2026-03-20',
        )
        c3 = HousingClearance.objects.create(
            sr_no=103,
            house_type='Type C',
            house_no='03/303',
            allottee_name='Active User',
            status='in_progress',
            is_allotted=False,
            estate_date_1='2026-03-22',
        )

        self.client.force_authenticate(user=self.estate_user)

        # 1. Non-master user cannot delete
        self.client.force_authenticate(user=self.civil_user)
        forbid_res = self.client.post('/api/estate/housing/clearances/delete-history/', {'delete_type': 'all'})
        self.assertEqual(forbid_res.status_code, 403)

        # 2. Master user deletes date range Jan 2026 (should only match c1, not c2, and never c3)
        self.client.force_authenticate(user=self.estate_user)
        del_res = self.client.post(
            '/api/estate/housing/clearances/delete-history/',
            {'delete_type': 'date_range', 'from_date': '2026-01-01', 'to_date': '2026-01-31'},
            format='json',
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.data['deleted_count'], 1)
        self.assertEqual(del_res.data['deleted_ids'], [c1.id])

        c1.refresh_from_db()
        self.assertTrue(c1.is_deleted)
        self.assertIsNotNone(c1.deleted_at)
        self.assertEqual(c1.deleted_by, self.estate_user)

        # Verify c1 is now excluded from active GET
        list_res = self.client.get('/api/estate/housing/clearances/')
        active_ids = [c['id'] for c in list_res.data]
        self.assertNotIn(c1.id, active_ids)
        self.assertIn(c2.id, active_ids)
        self.assertIn(c3.id, active_ids)

        # 3. View Trash
        trash_res = self.client.get('/api/estate/housing/clearances/trash/')
        self.assertEqual(trash_res.status_code, 200)
        self.assertEqual(trash_res.data['total_in_trash'], 1)
        self.assertEqual(trash_res.data['trash'][0]['id'], c1.id)

        # 4. Restore c1 from Trash
        restore_res = self.client.post(
            '/api/estate/housing/clearances/trash/restore/',
            {'ids': [c1.id]},
            format='json',
        )
        self.assertEqual(restore_res.status_code, 200)
        self.assertEqual(restore_res.data['restored_count'], 1)

        c1.refresh_from_db()
        self.assertFalse(c1.is_deleted)
        self.assertIsNone(c1.deleted_at)

        # 5. Delete c2 and purge permanently
        del_c2 = self.client.post(
            '/api/estate/housing/clearances/delete-history/',
            {'delete_type': 'all', 'ids': [c2.id]},
            format='json',
        )
        self.assertEqual(del_c2.status_code, 200)

        purge_res = self.client.post(
            '/api/estate/housing/clearances/trash/purge/',
            {'ids': [c2.id]},
            format='json',
        )
        self.assertEqual(purge_res.status_code, 200)
        self.assertEqual(purge_res.data['purged_count'], 1)
        self.assertFalse(HousingClearance.objects.filter(id=c2.id).exists())



