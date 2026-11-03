from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.housekeeping.models import HKStockRequest
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest

User = get_user_model()
Status = ItemRequest.Status


class ApprovedRequestTests(APITestCase):
    """A request that was approved but never issued (old two-step flow) must be completable by the manager."""

    def setUp(self):
        self.manager = User.objects.create_user(username='appr_manager', password='x', role='hk_inventory_manager')
        self.caretaker = User.objects.create_user(username='appr_caretaker', password='x', role='caretaker')
        category = Category.objects.create(name='Cleaning Supplies')
        # 10 units are held back by the approval below
        self.item = Item.objects.create(
            name='Odonil', category=category, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=100, available_quantity=100, reserved_quantity=10, unit='Each')
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def make(self, status):
        request = ItemRequest.objects.create(
            item=self.item, requested_by=self.caretaker, quantity_requested=10, units_remaining=90,
            purpose='[HK - Aibaan] stock', status=status)
        HKStockRequest.objects.create(
            requested_by=self.caretaker, item_name='Odonil', item=self.item, quantity=10, unit='Each',
            reason='stock', status=status, inventory_request=request)
        return request

    def reject(self, request, reason='duplicate'):
        return self.client.post(
            f'/api/inventory/api/requests/{request.id}/reject/', {'rejection_reason': reason}, format='json')

    def test_rejecting_an_approved_request_returns_its_reserved_stock(self):
        request = self.make(Status.APPROVED)

        response = self.reject(request)

        self.assertEqual(response.status_code, 200, response.data)
        request.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(request.status, Status.REJECTED)
        self.assertEqual(self.item.reserved_quantity, 0)
        self.assertEqual(self.item.available_quantity, 100)
        self.assertEqual(HKStockRequest.objects.get(inventory_request=request).status, 'rejected')

    def test_rejecting_a_pending_request_does_not_touch_reserved_stock(self):
        request = self.make(Status.PENDING)

        self.assertEqual(self.reject(request).status_code, 200)

        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved_quantity, 10)

    def test_an_issued_or_rejected_request_cannot_be_rejected_again(self):
        for status in (Status.ISSUED, Status.REJECTED):
            self.assertEqual(self.reject(self.make(status)).status_code, 400, status)
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved_quantity, 10)

    def test_an_approved_request_can_be_issued_with_one_click(self):
        request = self.make(Status.APPROVED)

        response = self.client.post(
            f'/api/inventory/requests/{request.id}/issue/', {'issued_quantity': 10, 'notes': ''}, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        request.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(request.status, Status.ISSUED)
        self.assertEqual(self.item.available_quantity, 90)
        self.assertEqual(self.item.reserved_quantity, 0)
        self.assertEqual(HKStockRequest.objects.get(inventory_request=request).status, 'issued')
        self.assertTrue(ItemIssue.objects.filter(request=request, issued_quantity=10).exists())

    def test_approved_requests_are_listed_for_the_manager(self):
        request = self.make(Status.APPROVED)
        self.make(Status.PENDING)

        data = self.client.get('/api/inventory/requests/', {'status': 'approved'}).data
        self.assertEqual({row['id'] for row in data['results']}, {request.id})
