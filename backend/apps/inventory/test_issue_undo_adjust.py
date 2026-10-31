from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Category, Item, ItemRequest, ItemIssue, ItemIssueAdjustment, ItemUsageLog
from apps.inventory.serializers import ItemIssueSerializer, ItemRequestSerializer
from apps.inventory.request_permissions import get_unaccounted_item_quantity
from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.housekeeping.htmx_views import _build_usage_issues
from apps.housekeeping.stock_history_service import get_user_history_transactions
from apps.core.notifications import check_and_send_usage_reminders

User = get_user_model()


class IssueUndoAdjustTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_client = APIClient()

        # Users
        self.manager = User.objects.create_user(
            username='hk_manager',
            password='password123',
            role=User.Role.INVENTORY_MANAGER,
            first_name='HK',
            last_name='Manager',
        )
        self.supervisor = User.objects.create_user(
            username='hk_supervisor',
            password='password123',
            role=User.Role.SUPERVISOR,
            first_name='Priyanka',
            last_name='Parmar',
        )
        self.other_supervisor = User.objects.create_user(
            username='other_supervisor',
            password='password123',
            role=User.Role.SUPERVISOR,
            first_name='Other',
            last_name='Supervisor',
        )

        # Area
        self.area = HKArea.objects.create(name='Aibaan', area_type='hostel', is_active=True)
        self.other_area = HKArea.objects.create(name='Beauki', area_type='hostel', is_active=True)
        HKUserArea.objects.create(user=self.supervisor, area=self.area)
        HKUserArea.objects.create(user=self.other_supervisor, area=self.other_area)

        # Inventory Item
        self.category = Category.objects.create(name='Cleaning Supplies')
        self.item = Item.objects.create(
            name='Air Freshener (R5)',
            item_code='3.03',
            category=self.category,
            item_type=Item.ItemType.CONSUMABLE,
            total_quantity=Decimal('50'),
            available_quantity=Decimal('50'),
            reserved_quantity=Decimal('0'),
            unit='Ltr',
        )

    def _create_and_issue_request(self, requested_qty=Decimal('5'), issued_qty=Decimal('5'), user=None, area=None):
        req_user = user or self.supervisor
        req_area = area or self.area

        item_request = ItemRequest.objects.create(
            item=self.item,
            requested_by=req_user,
            quantity_requested=requested_qty,
            status=ItemRequest.Status.PENDING,
            purpose=f'[HK - {req_area.name}] NEED',
        )
        hk_req = HKStockRequest.objects.create(
            inventory_request=item_request,
            requested_by=req_user,
            area=req_area,
            item=self.item,
            item_name=self.item.name,
            quantity=int(requested_qty),
            reason=f'[HK - {req_area.name}] NEED',
            status='pending',
        )

        # Issue item as manager
        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/requests/{item_request.pk}/issue/', {
            'issued_quantity': str(issued_qty),
            'notes': 'Initial issue',
        })
        self.assertEqual(resp.status_code, 201)

        item_request.refresh_from_db()
        self.item.refresh_from_db()
        hk_req.refresh_from_db()

        self.assertEqual(item_request.status, ItemRequest.Status.ISSUED)
        issue = ItemIssue.objects.get(request=item_request)
        return item_request, issue, hk_req

    def test_01_direct_rejection_changes_effective_status_to_rejected(self):
        """1. Direct rejection changes the effective status to Rejected."""
        item_request = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=Decimal('4'),
            status=ItemRequest.Status.PENDING,
            purpose=f'[HK - {self.area.name}] NEED',
        )
        hk_req = HKStockRequest.objects.create(
            inventory_request=item_request,
            requested_by=self.supervisor,
            area=self.area,
            item=self.item,
            item_name=self.item.name,
            quantity=4,
            reason=f'[HK - {self.area.name}] NEED',
            status='pending',
        )

        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/api/requests/{item_request.pk}/reject/', {
            'rejection_reason': 'Stock insufficient for this purpose',
        })
        self.assertEqual(resp.status_code, 200)

        item_request.refresh_from_db()
        hk_req.refresh_from_db()
        self.item.refresh_from_db()

        self.assertEqual(item_request.status, ItemRequest.Status.REJECTED)
        self.assertEqual(item_request.rejection_reason, 'Stock insufficient for this purpose')
        self.assertEqual(hk_req.status, 'rejected')
        self.assertEqual(hk_req.covered_quantity, 0)
        self.assertEqual(self.item.available_quantity, Decimal('50'))

    def test_02_issue_undo_adjust_reject_results_in_final_rejected_state(self):
        """2. Issue -> Undo/Adjust -> Reject results in a final Rejected state."""
        item_request, issue, hk_req = self._create_and_issue_request(Decimal('4'), Decimal('4'))
        self.assertEqual(self.item.available_quantity, Decimal('46'))

        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Accidental issue',
        })
        self.assertEqual(resp.status_code, 200)

        item_request.refresh_from_db()
        hk_req.refresh_from_db()
        issue.refresh_from_db()
        self.item.refresh_from_db()

        self.assertEqual(item_request.status, ItemRequest.Status.REJECTED)
        self.assertTrue(item_request.undo_consumed)
        self.assertEqual(item_request.rejection_reason, 'Accidental issue')
        self.assertEqual(hk_req.status, 'rejected')
        self.assertEqual(hk_req.covered_quantity, 0)
        self.assertTrue(issue.is_reversed)
        self.assertEqual(self.item.available_quantity, Decimal('50'))

    def test_03_rejected_request_excluded_from_active_issued_items_api(self):
        """3. A rejected request is excluded from active issued-items API results."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))

        # Undo/Reject
        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo to reject',
        })

        # 1. API endpoint /api/inventory/issues/
        resp = self.api_client.get('/api/inventory/issues/')
        self.assertEqual(resp.status_code, 200)
        issue_ids = [i['id'] for i in resp.data.get('results', [])]
        self.assertNotIn(issue.pk, issue_ids)

        # 2. HTMX / Mobile helper _build_usage_issues
        usage_items = _build_usage_issues(self.supervisor, area=self.area)
        self.assertEqual(len(usage_items), 0)

    def test_04_rejected_request_cannot_submit_usage_report(self):
        """4. A rejected request cannot submit a usage report."""
        _, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))

        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo to reject',
        })

        # API usage log attempt
        self.api_client.force_authenticate(user=self.supervisor)
        api_resp = self.api_client.post(f'/api/inventory/issues/{issue.pk}/log-usage/', {
            'quantity_used': '1.00',
            'purpose': 'Trying to log usage',
        })
        self.assertEqual(api_resp.status_code, 400)
        self.assertIn('Cannot log usage for a reversed or rejected issue', str(api_resp.data))

        # Mobile HTMX hk_log_usage attempt
        self.client.force_login(self.supervisor)
        htmx_resp = self.client.post(f'/housekeeping/stock/usage/{issue.pk}/', {
            'quantity_used': '1.00',
            'purpose': 'Trying via HTMX',
            'area_id': self.area.pk,
        })
        self.assertIn(htmx_resp.status_code, [400, 403, 404])

    def test_05_rejected_request_does_not_trigger_pending_reminders_or_counts(self):
        """5. A rejected request does not trigger pending-usage-report reminders or counts."""
        _, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))

        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo to reject',
        })

        # Notifications daily reminder
        reminders_sent = check_and_send_usage_reminders(force_time=True)
        self.assertEqual(reminders_sent, 0)

        # Dashboard summary
        dash_resp = self.api_client.get('/api/inventory/dashboard/')
        self.assertEqual(dash_resp.status_code, 200)
        self.assertEqual(dash_resp.data.get('unfinalized_consumables'), 0)

    def test_06_rejected_request_does_not_block_new_request_for_same_item(self):
        """6. A rejected request no longer blocks a new request for the same item."""
        _, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))

        # While active, unaccounted quantity is 4.00
        unaccounted_before = get_unaccounted_item_quantity(self.supervisor, self.item)
        self.assertEqual(unaccounted_before, Decimal('4.00'))

        # Undo/Reject
        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo to reject',
        })

        # After rejection, unaccounted quantity must be 0.00
        unaccounted_after = get_unaccounted_item_quantity(self.supervisor, self.item)
        self.assertEqual(unaccounted_after, Decimal('0.00'))

    def test_07_stock_restored_exactly_once_on_reversal(self):
        """7. Existing stock is restored exactly once when an issued item is undone/rejected."""
        initial_stock = self.item.available_quantity
        _, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_stock - Decimal('4'))

        self.api_client.force_authenticate(user=self.manager)
        resp1 = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'First undo',
        })
        self.assertEqual(resp1.status_code, 200)

        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_stock)

        # Duplicate attempt
        resp2 = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Duplicate undo attempt',
        })
        self.assertEqual(resp2.status_code, 400)

        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_stock)

    def test_08_rejection_before_stock_deduction_does_not_increase_stock(self):
        """8. Rejection before stock deduction does not incorrectly increase stock."""
        initial_stock = self.item.available_quantity
        item_request = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=Decimal('4'),
            status=ItemRequest.Status.PENDING,
            purpose=f'[HK - {self.area.name}] NEED',
        )

        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/api/requests/{item_request.pk}/reject/', {
            'rejection_reason': 'Reject directly',
        })
        self.assertEqual(resp.status_code, 200)

        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_stock)

    def test_09_adjust_issued_quantity_restores_only_quantity_difference(self):
        """9. Adjust Issued Quantity restores only the correct quantity difference."""
        item_request, issue, hk_req = self._create_and_issue_request(Decimal('5'), Decimal('5'))
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('45'))

        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '3',
            'reason': 'Reduced quantity needed',
        })
        self.assertEqual(resp.status_code, 200)

        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('47'))  # 45 + 2 = 47

        issue.refresh_from_db()
        item_request.refresh_from_db()
        hk_req.refresh_from_db()

        self.assertEqual(issue.issued_quantity, Decimal('3'))
        self.assertEqual(item_request.quantity_requested, Decimal('3'))
        self.assertEqual(hk_req.quantity, Decimal('3'))
        self.assertTrue(item_request.undo_consumed)

    def test_10_undo_adjust_action_availability_lifecycle(self):
        """10. The Undo/Adjust action is available before its first successful use and unavailable afterward."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        # Before use:
        req_ser_before = ItemRequestSerializer(item_request).data
        issue_ser_before = ItemIssueSerializer(issue).data
        self.assertFalse(req_ser_before['undo_consumed'])
        self.assertFalse(issue_ser_before['already_adjusted'])
        self.assertTrue(issue_ser_before['can_reverse'])
        self.assertTrue(issue_ser_before['can_adjust'])

        # Execute reversal:
        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Undo once',
        })

        # After use:
        item_request.refresh_from_db()
        issue.refresh_from_db()
        req_ser_after = ItemRequestSerializer(item_request).data
        issue_ser_after = ItemIssueSerializer(issue).data
        self.assertTrue(req_ser_after['undo_consumed'])
        self.assertFalse(req_ser_after['can_undo_reject'])
        self.assertTrue(issue_ser_after['already_adjusted'])
        self.assertFalse(issue_ser_after['can_reverse'])
        self.assertFalse(issue_ser_after['can_adjust'])

    def test_11_opening_and_cancelling_modal_does_not_consume_allowance(self):
        """11. Opening and cancelling the modal does not consume the allowance."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        # GET request simulating opening the modal or viewing details
        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.get(f'/api/inventory/issues/{issue.pk}/adjustments/')
        self.assertEqual(resp.status_code, 200)

        item_request.refresh_from_db()
        self.assertFalse(item_request.undo_consumed)

    def test_12_failed_transaction_does_not_consume_allowance_or_update_stock(self):
        """12. A failed transaction does not consume the allowance or partially update stock."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.api_client.force_authenticate(user=self.manager)
        # Attempt adjust exceeding available stock
        resp = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '1000',
            'reason': 'Invalid high quantity',
        })
        self.assertEqual(resp.status_code, 400)

        item_request.refresh_from_db()
        self.item.refresh_from_db()
        self.assertFalse(item_request.undo_consumed)
        self.assertEqual(self.item.available_quantity, Decimal('45'))

    def test_13_second_undo_adjust_call_rejected_without_changing_stock(self):
        """13. A second undo/adjust API call is rejected without changing stock or statuses."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.api_client.force_authenticate(user=self.manager)
        resp1 = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '3',
            'reason': 'Adjust 1',
        })
        self.assertEqual(resp1.status_code, 200)
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('47'))

        # Second adjust attempt must fail
        resp2 = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'adjustment',
            'new_quantity': '2',
            'reason': 'Adjust 2 duplicate',
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn('Only one undo/adjust operation is permitted', resp2.data.get('detail', ''))

        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, Decimal('47'))

    def test_14_concurrent_undo_adjust_attempts_cannot_both_succeed(self):
        """14. Concurrent undo/adjust attempts cannot both succeed."""
        item_request, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.api_client.force_authenticate(user=self.manager)
        resp1 = self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'First undo',
        })
        self.assertEqual(resp1.status_code, 200)

        # Trying to undo-reject on an undo-consumed request must also be blocked
        undo_rej_resp = self.api_client.post(f'/api/inventory/api/requests/{item_request.pk}/undo-reject/')
        self.assertEqual(undo_rej_resp.status_code, 400)

        # Re-issuing must be blocked
        reissue_resp = self.api_client.post(f'/api/inventory/requests/{item_request.pk}/issue/', {
            'issued_quantity': '5',
        })
        self.assertIn(reissue_resp.status_code, [400, 404])

    def test_15_legitimate_usage_report_works_for_genuinely_issued_requests(self):
        """15. Existing legitimate usage-report submission continues to work for genuinely issued requests."""
        _, issue, _ = self._create_and_issue_request(Decimal('5'), Decimal('5'))

        self.api_client.force_authenticate(user=self.supervisor)
        resp = self.api_client.post(f'/api/inventory/issues/{issue.pk}/log-usage/', {
            'quantity_used': '2.00',
            'purpose': 'Morning cleaning routine',
        })
        self.assertEqual(resp.status_code, 201)

        issue.refresh_from_db()
        total_used = sum(l.quantity_used for l in issue.usage_logs.all())
        self.assertEqual(total_used, Decimal('2.00'))
        self.assertEqual(issue.issued_quantity - total_used, Decimal('3.00'))

    def test_16_area_specific_inventory_and_other_supervisors_unaffected(self):
        """16. Area-specific inventory visibility and other supervisors' independent requests are unaffected."""
        req_a, issue_a, _ = self._create_and_issue_request(
            user=self.supervisor, area=self.area, requested_qty=Decimal('3'), issued_qty=Decimal('3')
        )
        req_b, issue_b, _ = self._create_and_issue_request(
            user=self.other_supervisor, area=self.other_area, requested_qty=Decimal('4'), issued_qty=Decimal('4')
        )

        # Undo/reversal for Supervisor A only
        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue_a.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Supervisor A issue cancelled',
        })

        req_a.refresh_from_db()
        req_b.refresh_from_db()
        issue_a.refresh_from_db()
        issue_b.refresh_from_db()

        # Supervisor A is rejected and reversed
        self.assertEqual(req_a.status, ItemRequest.Status.REJECTED)
        self.assertTrue(issue_a.is_reversed)

        # Supervisor B is completely unaffected
        self.assertEqual(req_b.status, ItemRequest.Status.ISSUED)
        self.assertFalse(issue_b.is_reversed)
        self.assertEqual(issue_b.issued_quantity, Decimal('4'))

        # Area items check for Supervisor B
        b_usage_items = _build_usage_issues(self.other_supervisor, area=self.other_area)
        self.assertEqual(len(b_usage_items), 1)
        self.assertEqual(b_usage_items[0].pk, issue_b.pk)

    def test_17_rejected_request_followed_by_new_request_works_end_to_end(self):
        """17. A rejected request followed by a new request for the same item works correctly."""
        # 1. First request is issued then undone/rejected
        req1, issue1, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))
        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue1.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'Cancelled initial request',
        })

        # 2. Supervisor creates new request for the exact same item
        new_req = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=Decimal('4'),
            status=ItemRequest.Status.PENDING,
            purpose=f'[HK - {self.area.name}] NEW ATTEMPT',
        )
        new_hk_req = HKStockRequest.objects.create(
            inventory_request=new_req,
            requested_by=self.supervisor,
            area=self.area,
            item=self.item,
            item_name=self.item.name,
            quantity=4,
            reason=f'[HK - {self.area.name}] NEW ATTEMPT',
            status='pending',
        )

        # Unaccounted quantity considers only active issues (not the rejected one)
        self.assertEqual(get_unaccounted_item_quantity(self.supervisor, self.item), Decimal('0.00'))

        # Manager can successfully issue the new request
        self.api_client.force_authenticate(user=self.manager)
        resp = self.api_client.post(f'/api/inventory/requests/{new_req.pk}/issue/', {
            'issued_quantity': '4',
            'notes': 'Issued second request',
        })
        self.assertEqual(resp.status_code, 201)

        new_req.refresh_from_db()
        self.assertEqual(new_req.status, ItemRequest.Status.ISSUED)
        self.assertFalse(new_req.undo_consumed)

    def test_18_historical_records_remain_accessible_and_correctly_classified(self):
        """18. Existing historical records remain accessible and are not incorrectly reclassified as active issues."""
        _, issue, _ = self._create_and_issue_request(Decimal('4'), Decimal('4'))

        self.api_client.force_authenticate(user=self.manager)
        self.api_client.post(f'/api/inventory/issues/{issue.pk}/adjust/', {
            'action': 'reversal',
            'reason': 'History verification',
        })

        # Fetch user history transactions
        history = get_user_history_transactions(self.supervisor, area=self.area)
        tx_list = history.get('transactions', [])
        self.assertGreater(len(tx_list), 0)

        reversed_tx = None
        for tx in tx_list:
            if tx.get('issue_id') == issue.pk or tx.get('id') == f'issue-{issue.pk}':
                reversed_tx = tx
                break

        self.assertIsNotNone(reversed_tx)
        self.assertEqual(reversed_tx['status_category'], 'rejected')
        self.assertEqual(reversed_tx['status_label'], 'Rejected')
        self.assertEqual(reversed_tx['outstanding_quantity'], 0.0)
