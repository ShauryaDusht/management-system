from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Contractor, ContractorDemandNote, Shop, ShopDemandNote

User = get_user_model()


def make_shop(sl):
    return Shop.objects.create(
        sl=sl, name=f'Shop {sl}', address='IITGN', default_rate=Decimal('9.55'),
        default_water=Decimal('320.00'), is_active=True)


class NoteNumberPersistenceTests(TestCase):
    """A note number typed by hand has to stay: it used to be renumbered back on the next page load."""

    CYCLE = '2026-11'

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='estate.persist', password='x', role='estate_office'))
        for sl in (1, 2, 3):
            make_shop(sl)
        Contractor.objects.create(sl=1, name='Contractor One', to_line='CPWD 1', is_active=True)
        Contractor.objects.create(sl=2, name='Contractor Two', to_line='CPWD 2', is_active=True)

    def shops(self):
        rows = self.client.get(f'/api/estate/shops/?cycle={self.CYCLE}').data
        rows = rows if isinstance(rows, list) else rows.get('results', rows)
        return {row['sl']: row for row in rows}

    def contractors(self):
        rows = self.client.get(f'/api/estate/contractors/?cycle={self.CYCLE}').data
        rows = rows if isinstance(rows, list) else rows.get('results', rows)
        return {row['sl']: row for row in rows}

    def patch_shop(self, sl, **data):
        response = self.client.patch(f'/api/estate/shops/{self.shops()[sl]["id"]}/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def numbers(self):
        return [self.shops()[sl]['noteNo'] for sl in (1, 2, 3)]

    def test_a_typed_shop_note_number_survives_reloads_and_logins(self):
        before = self.numbers()
        self.assertEqual(before, ['IWD/26-27/230', 'IWD/26-27/231', 'IWD/26-27/232'])

        self.patch_shop(1, noteNo='IWD/26-27/250')

        for _ in range(3):   # refresh, log out and in again: every load asks the server again
            self.assertEqual(self.shops()[1]['noteNo'], 'IWD/26-27/250')
        self.assertEqual(ShopDemandNote.objects.get(shop__sl=1, cycle_month=self.CYCLE).note_no, 'IWD/26-27/250')

    def test_typing_one_number_does_not_shift_the_others(self):
        self.patch_shop(1, noteNo='IWD/26-27/250')

        self.assertEqual([self.shops()[2]['noteNo'], self.shops()[3]['noteNo']], ['IWD/26-27/231', 'IWD/26-27/232'])

    def test_a_plain_page_load_never_renumbers(self):
        self.numbers()
        # something else changed the stored numbers (a manual fix in the database): a load must leave them alone
        ShopDemandNote.objects.filter(shop__sl=2, cycle_month=self.CYCLE).update(note_no='IWD/26-27/777')

        self.assertEqual(self.shops()[2]['noteNo'], 'IWD/26-27/777')

    def test_cancelling_a_note_still_hands_its_number_to_the_next_shop(self):
        self.numbers()
        self.patch_shop(1, isCancelled=True)

        self.assertEqual(self.shops()[1]['noteNo'], 'CANCELLED')
        self.assertEqual([self.shops()[2]['noteNo'], self.shops()[3]['noteNo']], ['IWD/26-27/230', 'IWD/26-27/231'])

    def test_a_cancel_leaves_a_typed_number_alone_and_the_numbering_skips_it(self):
        self.numbers()
        self.patch_shop(2, noteNo='IWD/26-27/230')    # typed by hand: it now uses the number shop 1 is about to free
        self.patch_shop(1, isCancelled=True)

        self.assertEqual(self.shops()[2]['noteNo'], 'IWD/26-27/230')
        self.assertEqual(self.shops()[3]['noteNo'], 'IWD/26-27/231')   # the automatic numbering skips the typed 230

    def test_saving_the_same_number_again_is_not_a_hand_edit(self):
        self.numbers()
        self.patch_shop(1, noteNo='IWD/26-27/230')    # unchanged

        self.assertFalse(ShopDemandNote.objects.get(shop__sl=1, cycle_month=self.CYCLE).note_no_locked)

    def test_clearing_the_field_hands_the_note_back_to_the_automatic_numbering(self):
        self.patch_shop(1, noteNo='IWD/26-27/250')
        self.patch_shop(1, noteNo='')

        self.assertEqual(self.numbers(), ['IWD/26-27/230', 'IWD/26-27/231', 'IWD/26-27/232'])
        self.assertFalse(ShopDemandNote.objects.get(shop__sl=1, cycle_month=self.CYCLE).note_no_locked)

    def test_cancelling_a_note_with_a_typed_number_and_restoring_it_gives_it_an_automatic_number(self):
        self.patch_shop(1, noteNo='IWD/26-27/250')
        self.patch_shop(1, isCancelled=True)
        self.assertFalse(ShopDemandNote.objects.get(shop__sl=1, cycle_month=self.CYCLE).note_no_locked)

        self.patch_shop(1, isCancelled=False)

        self.assertEqual(self.numbers(), ['IWD/26-27/230', 'IWD/26-27/231', 'IWD/26-27/232'])

    def test_a_typed_contractor_note_number_survives_reloads(self):
        self.assertEqual(self.contractors()[1]['noteNo'], 'IWD/26-27/228')
        note_id = self.contractors()[1]['id']

        response = self.client.patch(f'/api/estate/contractors/{note_id}/', {'noteNo': 'IWD/26-27/300'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        for _ in range(3):
            self.assertEqual(self.contractors()[1]['noteNo'], 'IWD/26-27/300')
        self.assertTrue(ContractorDemandNote.objects.get(contractor__sl=1, cycle_month=self.CYCLE).note_no_locked)

    def test_the_next_cycle_is_still_numbered_in_sequence(self):
        self.numbers()
        rows = self.client.get('/api/estate/shops/?cycle=2026-12').data
        rows = rows if isinstance(rows, list) else rows.get('results', rows)

        self.assertEqual([r['noteNo'] for r in sorted(rows, key=lambda r: r['sl'])],
                         ['IWD/26-27/233', 'IWD/26-27/234', 'IWD/26-27/235'])


class BaselineCycleNoteNumberTests(TestCase):
    """The October baseline cycle (the 29 official shops) is the one in the screenshot: its numbers were forced back
    to the official values on every load, so editing 230 always came back as 230."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='estate.baseline', password='x', role='estate_office'))

    def shops(self):
        rows = self.client.get('/api/estate/shops/?cycle=2026-10').data
        rows = rows if isinstance(rows, list) else rows.get('results', rows)
        return {row['sl']: row for row in rows}

    def test_the_first_shops_number_can_be_changed_and_stays(self):
        first = self.shops()
        self.assertEqual(len(first), 29)
        self.assertEqual(first[1]['noteNo'], 'IWD/26-27/230')
        official = {sl: row['noteNo'] for sl, row in first.items()}

        response = self.client.patch(f'/api/estate/shops/{first[1]["id"]}/', {'noteNo': 'IWD/26-27/1230'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        for _ in range(3):
            after = self.shops()
            self.assertEqual(after[1]['noteNo'], 'IWD/26-27/1230')
            for sl in range(2, 30):                       # everything else keeps its official number
                self.assertEqual(after[sl]['noteNo'], official[sl], sl)
