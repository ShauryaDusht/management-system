from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Category, Item, ItemRequest, ItemIssue, ItemIssueAdjustment, ItemUsageLog
from apps.housekeeping.models import HKStockRequest

User = get_user_model()


class IssueUndoAdjustTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.manager = User.objects.create_user(
            username='hk_manager',
            password='password123',
            role='hk_inventory_manager',
        )
        self.supervisor = User.objects.create_user(
            username='hk_supervisor',
            password='password123',
            role='supervisor',
        )
        self.other_supervisor = User.objects.create_user(
            username='other_supervisor',
            password='password123',
            role='supervisor',
        )

        # Inventory Item
        self.category = Category.objects.create(name='Cleaning Supplies')
        self.item = Item.objects.create(
            name='Broom',
            category=self.category,
            item_type=Item.ItemType.CONSUMABLE,
            total_quantity=Decimal('50'),
            available_quantity=Decimal('50'),
            reserved_quantity=Decimal('0'),
            unit='pcs',
        )

    def _create_and_issue_request(self, requested_qty=Decimal('5'), issued_qty=Decimal('5')):
        item_request = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=requested_qty,
            status=ItemRequest.Status.PENDING,
            purpose='Cleaning block A',
        )
        hk_req = HKStockRequest.objects.create(
            inventory_request=item_request,
            requested_by=self.supervisor,
            item_name=self.item.name,
            quantity=int(requested_qty),
            reason='Cleaning block A',
            status='pending',
        )

        # Issue item as manager
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post(f'/api/inventory/requests/{item_request.pk}/issue/', {
            'issued_quantity': str(issued_qty),
            'notes': 'Initial issue',
        })
        self.assertEqual(resp.status_code, 201)

        item_request.refresh_from_db()
        self.item.refresh_from_db()
        hk_req.refresh_from_db()

        self.assertEqual(item_request.status, ItemRequest.Status.ISSUED)
        self.assertEqual(self.item.available_quantity, Decimal('50') - issued_qty)
        self.assertEqual(hk_req.status, 'issued')

        issue = ItemIssue.objects.get(request=item_request)
        self.assertEqual(issue.issued_quantity, issued_qty)
        self.assertEqual(issue.original_quantity, issued_qty)
        return item_request, issue, hk_req

    def test_undo_entire_approval_restores_pending_state_and_stock(self):
        """Acceptance test: supervisor requests 5, manager issues 5. Manager undos entire approval."""
        item_request, issue, hk_req = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Issued by mistake to wrong section',
        })
        self.assertEqual(response.status_code, 200)

        # 1. Stock restored exactly once
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('50'))

        # 2. Workflow status becomes REJECTED
        item_request.refresh_from_db()
        self.assertEqual(item_request.status, ItemRequest.Status.REJECTED)
        self.assertEqual(item_request.approved_by, self.manager)
        self.assertIsNotNone(item_request.reviewed_at)
        self.assertEqual(item_request.rejection_reason, 'Issued by mistake to wrong section')

        # 3. HKStockRequest status becomes rejected
        hk_req.refresh_from_db()
        self.assertEqual(hk_req.status, 'rejected')

        # 4. Issue record marked as reversed
        issue.refresh_from_db()
        self.assertTrue(issue.is_reversed)
        self.assertEqual(issue.reversed_by, self.manager)
        self.assertEqual(issue.reversal_reason, 'Issued by mistake to wrong section')

        # 5. Audit history in ItemIssueAdjustment
        adj = ItemIssueAdjustment.objects.filter(issue=issue).first()
        self.assertIsNotNone(adj)
        self.assertEqual(adj.action_type, ItemIssueAdjustment.ActionType.REVERSAL)
        self.assertEqual(adj.previous_quantity, Decimal('5'))
        self.assertEqual(adj.new_quantity, 0)
        self.assertEqual(adj.quantity_returned_to_stock, Decimal('5'))
        self.assertEqual(adj.reason, 'Issued by mistake to wrong section')
        self.assertEqual(adj.adjusted_by, self.manager)

        # 6. Does not show in active issues list
        issues_resp = self.client.get('/api/inventory/issues/')
        self.assertEqual(issues_resp.status_code, 200)
        issue_ids = [i['id'] for i in issues_resp.data.get('results', [])]
        self.assertNotIn(issue.pk, issue_ids)

        # 7. Only 1 undo/adjust operation permitted
        second_resp = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Trying again',
        })
        self.assertEqual(second_resp.status_code, 400)

    def test_prevent_duplicate_undo(self):
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.client.force_authenticate(user=self.manager)
        # First undo
        resp1 = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo 1',
        })
        self.assertEqual(resp1.status_code, 200)

        # Second undo must be blocked
        resp2 = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo 2 duplicate',
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn('already been undone', resp2.data.get('detail', ''))

        # Stock must still be 50, not 55
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('50'))

    def test_downstream_usage_blocks_undo_to_pending(self):
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        # Supervisor logs usage of 2 units
        ItemUsageLog.objects.create(
            issue=issue,
            logged_by=self.supervisor,
            quantity_used=Decimal('2'),
            purpose='Daily cleaning',
            notes='Used in morning cleaning',
        )

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Trying to undo with usage',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('already been reported as used', response.data.get('detail', ''))

        # Status must still be ISSUED, stock untouched
        item_request.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(item_request.status, ItemRequest.Status.ISSUED)
        self.assertEqual(self.item.available_quantity, Decimal('45'))

    def test_adjust_issued_quantity(self):
        item_request, issue, hk_req = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '3',
            'reason': 'Supervisor only needed 3 brooms',
        })
        self.assertEqual(response.status_code, 200)

        # 1. Stock returned difference (5 - 3 = 2)
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('47'))

        # 2. Issue remains active with updated quantity
        issue.refresh_from_db()
        self.assertFalse(issue.is_reversed)
        self.assertEqual(issue.issued_quantity, Decimal('3'))
        self.assertEqual(issue.original_quantity, Decimal('5'))

        # 3. Request remains ISSUED with updated quantity
        item_request.refresh_from_db()
        self.assertEqual(item_request.status, ItemRequest.Status.ISSUED)
        self.assertEqual(item_request.quantity_requested, Decimal('3'))

        # 4. HKStockRequest updated
        hk_req.refresh_from_db()
        self.assertEqual(hk_req.quantity, Decimal('3'))

        # 5. Audit record created
        adj = ItemIssueAdjustment.objects.filter(issue=issue).first()
        self.assertIsNotNone(adj)
        self.assertEqual(adj.action_type, ItemIssueAdjustment.ActionType.ADJUSTMENT)
        self.assertEqual(adj.previous_quantity, Decimal('5'))
        self.assertEqual(adj.new_quantity, Decimal('3'))
        self.assertEqual(adj.quantity_returned_to_stock, Decimal('2'))

    def test_adjustment_cannot_exceed_original_or_go_below_consumed(self):
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        ItemUsageLog.objects.create(
            issue=issue,
            logged_by=self.supervisor,
            quantity_used=Decimal('2'),
            purpose='Daily cleaning',
        )

        self.client.force_authenticate(user=self.manager)

        # Increasing beyond available stock fails (available is 45, trying to increase by 50 to 55)
        resp_too_high = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '100',
            'reason': 'Way more than available stock',
        })
        self.assertEqual(resp_too_high.status_code, 400)

        # Cannot go below consumed 2
        resp_too_low = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '1',
            'reason': 'Less than consumed',
        })
        self.assertEqual(resp_too_low.status_code, 400)

    def test_non_manager_cannot_adjust_or_undo(self):
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        # Supervisor cannot perform adjustment/undo
        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Supervisor attempting undo',
        })
        self.assertEqual(resp.status_code, 403)
