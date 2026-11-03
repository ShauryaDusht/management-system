from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.inventory.models import Category, Item, ItemIssue, ItemRequest

User = get_user_model()

GARDEN = 'Garden & Horticulture Equipment'


class HousekeepingDashboardScopeTests(APITestCase):
    """The housekeeping inventory pages hide the horticulture side (exclude_category) but must still show the
    requests raised by housekeeping staff, even for an item that sits in the garden category."""

    def setUp(self):
        self.admin = User.objects.create_user(username='scope_admin', password='x', role='admin')
        self.hk_manager = User.objects.create_user(username='scope_hkm', password='x', role='hk_inventory_manager')
        self.caretaker = User.objects.create_user(username='scope_caretaker', password='x', role='caretaker')
        self.horti = User.objects.create_user(username='scope_horti', password='x', role='horticulture_manager')

        cleaning = Category.objects.create(name='Cleaning Supplies')
        garden = Category.objects.create(name=GARDEN)
        self.cleaner = Item.objects.create(
            name='Floor Cleaner', category=cleaning, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=50, available_quantity=50, unit='bottles')
        self.hose = Item.objects.create(
            name='Garden Hose', category=garden, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=50, available_quantity=50, unit='pieces')

        def request(item, user, purpose):
            return ItemRequest.objects.create(
                item=item, requested_by=user, quantity_requested=2, units_remaining=item.available_quantity,
                purpose=purpose, status=ItemRequest.Status.PENDING)

        self.hk_cleaner = request(self.cleaner, self.caretaker, '[HK - Aibaan] floors')
        self.hk_hose = request(self.hose, self.caretaker, '[HK - Beauki] hostel garden')
        self.horti_hose = request(self.hose, self.horti, '[Horticulture - Zone A] lawn')

    def listed_ids(self, user, path, **params):
        client = APIClient()
        client.force_authenticate(user)
        data = client.get(path, params).data
        rows = data if isinstance(data, list) else data.get('results', data)
        return {row['id'] for row in rows}

    def test_housekeeping_request_for_a_garden_item_shows_on_the_housekeeping_page(self):
        for user in (self.admin, self.hk_manager):
            ids = self.listed_ids(user, '/api/inventory/requests/', exclude_category=GARDEN)
            self.assertEqual(ids, {self.hk_cleaner.id, self.hk_hose.id}, user.username)

    def test_horticulture_own_request_stays_off_the_housekeeping_page(self):
        ids = self.listed_ids(self.admin, '/api/inventory/requests/', exclude_category=GARDEN)
        self.assertNotIn(self.horti_hose.id, ids)

    def test_horticulture_page_is_unchanged(self):
        ids = self.listed_ids(self.admin, '/api/inventory/requests/', category=GARDEN)
        self.assertEqual(ids, {self.hk_hose.id, self.horti_hose.id})

    def test_issued_items_follow_the_same_rule(self):
        issues = {}
        for name, req in (('hk_hose', self.hk_hose), ('horti_hose', self.horti_hose), ('hk_cleaner', self.hk_cleaner)):
            req.status = ItemRequest.Status.ISSUED
            req.save(update_fields=['status'])
            issues[name] = ItemIssue.objects.create(
                request=req, issued_by=self.hk_manager, issued_quantity=2, original_quantity=2)

        ids = self.listed_ids(self.admin, '/api/inventory/issues/', exclude_category=GARDEN)
        self.assertEqual(ids, {issues['hk_hose'].id, issues['hk_cleaner'].id})


class PendingRequestFilterTests(APITestCase):
    """The pages ask for ?status=pending. The endpoint used to ignore it, so the pending badge counted requests
    of every status and an old pending request fell off the newest page and never reached the Pending tab."""

    def setUp(self):
        self.manager = User.objects.create_user(username='pend_hkm', password='x', role='hk_inventory_manager')
        self.caretaker = User.objects.create_user(username='pend_caretaker', password='x', role='caretaker')
        category = Category.objects.create(name='Cleaning Supplies')
        self.item = Item.objects.create(
            name='Mop', category=category, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=500, available_quantity=500, unit='pieces')

    def make(self, status):
        return ItemRequest.objects.create(
            item=self.item, requested_by=self.caretaker, quantity_requested=1, units_remaining=500,
            purpose='[HK - Aibaan] test', status=status)

    def get(self, **params):
        client = APIClient()
        client.force_authenticate(self.manager)
        return client.get('/api/inventory/requests/', params).data

    def test_status_filter_returns_only_that_status(self):
        pending = self.make(ItemRequest.Status.PENDING)
        self.make(ItemRequest.Status.ISSUED)
        self.make(ItemRequest.Status.REJECTED)

        data = self.get(status='pending')
        self.assertEqual({row['id'] for row in data['results']}, {pending.id})
        self.assertEqual(data['count'], 1)

    def test_unknown_status_is_ignored_rather_than_hiding_everything(self):
        self.make(ItemRequest.Status.PENDING)
        self.make(ItemRequest.Status.ISSUED)
        self.assertEqual(self.get(status='nonsense')['count'], 2)

    def test_old_pending_request_is_found_even_when_newer_ones_fill_the_first_page(self):
        old_pending = self.make(ItemRequest.Status.PENDING)
        for _ in range(30):
            self.make(ItemRequest.Status.ISSUED)

        newest_page = {row['id'] for row in self.get()['results']}
        self.assertNotIn(old_pending.id, newest_page)   # why the Pending tab was empty

        self.assertEqual({row['id'] for row in self.get(status='pending')['results']}, {old_pending.id})
