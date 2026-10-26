from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.models import User

from .billing_master_data import (
    MASTER_CONTRACTORS_DATA,
    MASTER_SHOPS_DATA,
    ensure_master_shops_and_contractors,
    populate_baseline_bills,
    reconcile_master_data,
)
from .models import Contractor, ContractorDemandNote, Shop, ShopDemandNote
from .views import ensure_cycle_notes

CYCLE = '2026-10'


class EnsureMasterDataTests(TestCase):
    """The auto-seed runs on estate page loads, so it must be safe and idempotent."""

    def test_seeds_official_data_into_empty_tables_once(self):
        ensure_master_shops_and_contractors()
        self.assertEqual(Shop.objects.count(), len(MASTER_SHOPS_DATA))
        self.assertEqual(Contractor.objects.count(), len(MASTER_CONTRACTORS_DATA))
        self.assertTrue(User.objects.filter(username='estate.office', role='estate_office').exists())

        ensure_master_shops_and_contractors()
        self.assertEqual(Shop.objects.count(), len(MASTER_SHOPS_DATA))
        self.assertEqual(Contractor.objects.count(), len(MASTER_CONTRACTORS_DATA))

    def test_existing_rows_are_left_alone(self):
        Shop.objects.create(sl=1, name='Test Cafe')
        Contractor.objects.create(sl=1, name='Test Contractor Ltd')
        ensure_master_shops_and_contractors()
        self.assertEqual(Shop.objects.count(), 1)
        self.assertEqual(Contractor.objects.count(), 1)

    def test_deleted_shop_is_not_brought_back_and_duplicate_sl_does_not_crash(self):
        ensure_master_shops_and_contractors()
        shop = Shop.objects.get(sl=5)
        shop.is_active = False  # what the API delete does
        shop.save()
        # the API then shifts the other shops down, so two rows now share sl=5
        Shop.objects.filter(is_active=True, sl__gt=5).update(sl=4)
        Shop.objects.filter(is_active=True, sl=4).update(sl=5)

        ensure_master_shops_and_contractors()  # must not raise MultipleObjectsReturned
        self.assertEqual(Shop.objects.count(), len(MASTER_SHOPS_DATA))
        self.assertEqual(Shop.objects.filter(is_active=False).count(), 1)

    def test_deleting_every_shop_does_not_reseed(self):
        ensure_master_shops_and_contractors()
        Shop.objects.update(is_active=False)
        ensure_master_shops_and_contractors()
        self.assertEqual(Shop.objects.filter(is_active=True).count(), 0)
        self.assertEqual(Shop.objects.count(), len(MASTER_SHOPS_DATA))


class EstatePagesKeepUserChangesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='estate.regression', password='Str0ng#Pass-xyz', role='estate_office'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        r = self.client.get(f'/api/estate/shops/?cycle={CYCLE}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), len(MASTER_SHOPS_DATA))

    def test_deleting_a_shop_keeps_every_estate_page_working(self):
        note = ShopDemandNote.objects.get(shop__sl=5, cycle_month=CYCLE)
        self.assertEqual(self.client.delete(f'/api/estate/shops/{note.id}/').status_code, 200)

        for path in (f'/api/estate/shops/?cycle={CYCLE}', f'/api/estate/contractors/?cycle={CYCLE}', '/api/estate/cycles/'):
            self.assertEqual(self.client.get(path).status_code, 200, path)
        shops = self.client.get(f'/api/estate/shops/?cycle={CYCLE}')
        self.assertEqual(len(shops.data), len(MASTER_SHOPS_DATA) - 1)  # stays deleted

    def test_cleared_or_zero_bill_is_not_refilled_on_next_load(self):
        note = ShopDemandNote.objects.get(shop__sl=1, cycle_month=CYCLE)
        self.assertEqual(self.client.patch(f'/api/estate/shops/{note.id}/', {'units': '250'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(f'/api/estate/shops/{note.id}/', {'units': ''}, format='json').status_code, 200)

        self.client.get(f'/api/estate/shops/?cycle={CYCLE}')
        self.client.get('/api/estate/cycles/')
        note.refresh_from_db()
        self.assertEqual(note.units, '')


class SeedCommandTests(TestCase):
    def run_seed(self, *args):
        out = StringIO()
        call_command('seed_estate_billing', *args, stdout=out)
        return out.getvalue()

    def shop_note(self, sl):
        return ShopDemandNote.objects.get(shop__sl=sl, cycle_month=CYCLE)

    def test_default_run_does_not_apply_baseline_bills(self):
        self.run_seed()
        self.assertEqual(Shop.objects.count(), len(MASTER_SHOPS_DATA))
        ensure_cycle_notes(CYCLE)
        self.assertEqual(self.shop_note(1).units, '')
        self.assertEqual(self.shop_note(1).total_amount, Decimal('0'))

    def test_baseline_bills_fill_only_empty_notes(self):
        self.run_seed()
        ensure_cycle_notes(CYCLE)
        edited = self.shop_note(2)
        edited.units = '7'
        edited.save()

        summary = populate_baseline_bills(CYCLE)

        filled = self.shop_note(1)
        self.assertEqual(filled.units, '1678')
        self.assertEqual(filled.total_amount, Decimal('16665.00'))
        edited.refresh_from_db()
        self.assertEqual(edited.units, '7')  # a note with data is never overwritten
        self.assertGreaterEqual(summary['shop_notes_skipped'], 1)

        # running it again changes nothing
        again = populate_baseline_bills(CYCLE)
        self.assertEqual(again['shop_notes_filled'], 0)
        self.assertEqual(again['contractor_notes_filled'], 0)

    def test_baseline_flag_on_the_command(self):
        out = self.run_seed('--with-baseline-bills', '--cycle', CYCLE)
        self.assertIn('BASELINE', out)
        self.assertEqual(self.shop_note(1).units, '1678')
        self.assertTrue(ContractorDemandNote.objects.filter(cycle_month=CYCLE, total_amount__gt=0).exists())

    def test_reconcile_removes_rogue_shop_and_keeps_deleted_ones_deleted(self):
        ensure_master_shops_and_contractors()
        Shop.objects.create(sl=90, name='Haier Smart Solution Private Limited')  # contractor saved as a shop
        deleted = Shop.objects.get(sl=3)
        deleted.is_active = False
        deleted.save()
        missing = Shop.objects.get(sl=4)
        missing_name = missing.name
        missing.delete()

        summary = reconcile_master_data()

        self.assertIn('Haier Smart Solution Private Limited', summary['removed_rogue_shops'])
        self.assertEqual(summary['created_shops'], [missing_name])
        deleted.refresh_from_db()
        self.assertFalse(deleted.is_active)  # deleted on purpose -> stays deleted
