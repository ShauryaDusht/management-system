import datetime
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.inventory.models import Category, Item, ItemRequest

User = get_user_model()


class DuplicateStockSubmissionTests(TestCase):
    """The same stock request sent twice (a second tap, a retry) must only be created once."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='dup_caretaker', password='x', role=User.Role.CARETAKER)
        self.area = HKArea.objects.create(name='Hostel Dup', area_type='hostel', is_active=True)
        HKUserArea.objects.create(user=self.user, area=self.area)
        category = Category.objects.create(name='Cleaning Supplies')
        self.mop = Item.objects.create(
            name='Wet Mop Refill Clip', item_code='WM-1', category=category, unit='Each',
            item_type=Item.ItemType.CONSUMABLE, available_quantity=100, total_quantity=100)
        self.broom = Item.objects.create(
            name='Broom Soft', item_code='BR-1', category=category, unit='Each',
            item_type=Item.ItemType.CONSUMABLE, available_quantity=100, total_quantity=100)
        self.client.force_login(self.user)

    def send(self, lines, reason='Ijokha hostel'):
        payload = json.dumps([{'inventory_item_id': item.id, 'quantity': qty} for item, qty in lines])
        return self.client.post('/housekeeping/stock/request/', {
            'area_id': self.area.id, 'items': payload, 'reason': reason})

    def test_sending_the_same_request_twice_creates_it_once(self):
        first = self.send([(self.mop, 5)])
        second = self.send([(self.mop, 5)])

        self.assertEqual(first.status_code, 302)
        self.assertEqual(second.status_code, 302)          # the second tap still lands on the success page
        self.assertEqual(HKStockRequest.objects.count(), 1)
        self.assertEqual(ItemRequest.objects.count(), 1)

    def test_a_different_quantity_or_item_or_wording_is_a_new_request(self):
        self.send([(self.mop, 5)])
        self.send([(self.mop, 6)])
        self.send([(self.broom, 5)])
        self.send([(self.mop, 5)], reason='Another reason')

        self.assertEqual(HKStockRequest.objects.count(), 4)

    def test_a_request_with_an_extra_item_is_not_swallowed(self):
        self.send([(self.mop, 5)])
        self.send([(self.mop, 5), (self.broom, 2)])

        self.assertEqual(HKStockRequest.objects.count(), 3)

    def test_the_same_request_a_while_later_is_allowed(self):
        self.send([(self.mop, 5)])
        HKStockRequest.objects.update(created_at=timezone.now() - datetime.timedelta(minutes=5))

        self.send([(self.mop, 5)])

        self.assertEqual(HKStockRequest.objects.count(), 2)

    def test_a_rejected_request_can_be_sent_again_straight_away(self):
        self.send([(self.mop, 5)])
        HKStockRequest.objects.update(status='rejected')

        self.send([(self.mop, 5)])

        self.assertEqual(HKStockRequest.objects.count(), 2)

    def test_the_form_locks_its_button_after_the_first_tap(self):
        content = self.client.get(f'/housekeeping/stock/request/?area={self.area.id}').content.decode()
        self.assertIn("submitButton.disabled = true", content)
