from rest_framework.test import APIClient, APITestCase
from django.contrib.auth import get_user_model
from apps.inventory.models import Item, Category, ItemRequest, ItemIssue
from apps.housekeeping.models import HKStockRequest

User = get_user_model()


class ItemIssuanceWorkflowTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='manager1',
            email='manager@test.com',
            role='hk_inventory_manager',
            password='password123'
        )
        self.requester = User.objects.create_user(
            username='supervisor1',
            email='sup@test.com',
            role='supervisor',
            password='password123'
        )
        self.category = Category.objects.create(name='Cleaning Supplies')
        self.item = Item.objects.create(
            name='Floor Cleaner 5L',
            category=self.category,
            item_type=Item.ItemType.CONSUMABLE,
            total_quantity=20,
            available_quantity=20,
            reserved_quantity=0,
            unit='bottles'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

    def test_direct_issue_from_pending_request(self):
        """Directly issuing a pending item request without confirmation modal"""
        req = ItemRequest.objects.create(
            item=self.item,
            quantity_requested=5,
            requested_by=self.requester,
            status=ItemRequest.Status.PENDING,
            purpose='Daily cleaning'
        )
        hk_req = HKStockRequest.objects.create(
            item_name=self.item.name,
            quantity=5,
            requested_by=self.requester,
            inventory_request=req,
            status='pending'
        )

        # Manager directly issues the requested quantity
        payload = {
            'issued_quantity': req.quantity_requested,
            'notes': ''
        }
        response = self.client.post(f'/api/inventory/requests/{req.id}/issue/', payload, format='json')
        self.assertEqual(response.status_code, 201)

        req.refresh_from_db()
        self.assertEqual(req.status, ItemRequest.Status.ISSUED)
        self.assertEqual(req.approved_by, self.manager)

        hk_req.refresh_from_db()
        self.assertEqual(hk_req.status, 'issued')

        # Stock deducted
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, 15)

        # Issue record created
        self.assertTrue(ItemIssue.objects.filter(request=req, issued_quantity=5).exists())

    def test_direct_issue_insufficient_stock(self):
        """Issuing more than available stock should fail with validation error"""
        req = ItemRequest.objects.create(
            item=self.item,
            quantity_requested=25,
            requested_by=self.requester,
            status=ItemRequest.Status.PENDING,
            purpose='Bulk cleaning'
        )
        payload = {
            'issued_quantity': req.quantity_requested,
            'notes': ''
        }
        response = self.client.post(f'/api/inventory/requests/{req.id}/issue/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Insufficient stock', response.json().get('detail', ''))

    def test_reject_with_reason(self):
        """Rejecting request with mandatory rejection reason"""
        req = ItemRequest.objects.create(
            item=self.item,
            quantity_requested=2,
            requested_by=self.requester,
            status=ItemRequest.Status.PENDING
        )
        res_ok = self.client.post(f'/api/inventory/api/requests/{req.id}/reject/', {'rejection_reason': 'Out of budget'}, format='json')
        self.assertEqual(res_ok.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, ItemRequest.Status.REJECTED)
        self.assertEqual(req.rejection_reason, 'Out of budget')

    def test_toggle_urgent(self):
        """Urgency toggle continues working correctly"""
        req = ItemRequest.objects.create(
            item=self.item,
            quantity_requested=2,
            requested_by=self.requester,
            status=ItemRequest.Status.PENDING,
            is_urgent=False
        )
        res = self.client.post(f'/api/inventory/api/requests/{req.id}/mark-urgent/', {'is_urgent': True}, format='json')
        self.assertEqual(res.status_code, 200)
        req.refresh_from_db()
        self.assertTrue(req.is_urgent)
