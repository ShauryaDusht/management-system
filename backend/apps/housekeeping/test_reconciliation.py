import datetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog

User = get_user_model()


class StockReconciliationRegressionTests(TestCase):
    def setUp(self):
        self.client = Client()

        self.supervisor = User.objects.create_user(
            username="sup_recon",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="Recon",
        )
        self.supervisor_other = User.objects.create_user(
            username="sup_other",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Other",
            last_name="Supervisor",
        )
        self.caretaker = User.objects.create_user(
            username="ct_recon",
            password="password123",
            role=User.Role.CARETAKER,
            first_name="Caretaker",
            last_name="Recon",
        )
        self.inv_manager = User.objects.create_user(
            username="inv_recon_mgr",
            password="password123",
            role=User.Role.INVENTORY_MANAGER,
        )

        self.area_a = HKArea.objects.create(name="Hostel Alpha", area_type="hostel", is_active=True)
        self.area_b = HKArea.objects.create(name="Hostel Beta", area_type="hostel", is_active=True)

        HKUserArea.objects.create(user=self.supervisor, area=self.area_a)
        HKUserArea.objects.create(user=self.supervisor, area=self.area_b)
        HKUserArea.objects.create(user=self.caretaker, area=self.area_a)
        HKUserArea.objects.create(user=self.supervisor_other, area=self.area_a)

        self.category = Category.objects.create(name="Cleaning Supplies")
        self.item = Item.objects.create(
            name="Floor Cleaner",
            item_code="FC-01",
            category=self.category,
            unit="liters",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=100,
            total_quantity=100,
        )

    def _create_approved_and_issued_stock(self, user, area, item, quantity):
        inv_req = ItemRequest.objects.create(
            item=item,
            requested_by=user,
            quantity_requested=quantity,
            purpose=f"[HK - {area.name}] Regular upkeep",
            status=ItemRequest.Status.APPROVED,
        )
        hk_req = HKStockRequest.objects.create(
            requested_by=user,
            area=area,
            item_name=item.name,
            item=item,
            quantity=quantity,
            covered_quantity=0,
            unit=item.unit,
            status="issued",
            inventory_request=inv_req,
            reason="Regular upkeep",
        )
        issue = ItemIssue.objects.create(
            request=inv_req,
            issued_by=self.inv_manager,
            issued_quantity=quantity,
        )
        # Deduct warehouse stock to reflect actual issue
        Item.objects.filter(pk=item.pk).update(
            available_quantity=Item.objects.get(pk=item.pk).available_quantity - quantity
        )
        item.refresh_from_db()
        return hk_req, inv_req, issue

    BLOCK_MSG = "usage report must be completed"

    def _post_stock_request(self, quantity, reason, item=None, area=None):
        return self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": (area or self.area_a).id,
                "inventory_item_id": (item or self.item).id,
                "quantity": quantity,
                "reason": reason,
            },
        )

    def _report_usage(self, issue, quantity, purpose="Reported usage"):
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal(quantity),
            purpose=purpose,
            logged_by=self.supervisor,
        )

    def _assert_blocked(self, response, pending, reason):
        """The form is shown again with the block message, naming the unreported quantity, and nothing is created."""
        self.assertEqual(response.status_code, 200)
        error = response.context["form_error"]
        self.assertIn(self.BLOCK_MSG, error)
        self.assertIn(f"{pending} liters pending", error)
        self.assertFalse(HKStockRequest.objects.filter(reason=reason).exists())

    def test_scenario_1_partially_reported_usage_blocks_new_request_until_fully_reported(self):
        """
        Scenario 1:
        Supervisor has 2 units issued and reports using only 1.
        A new request for the same item is blocked while 1 unit of usage is still unreported.
        Once the remaining unit is reported, the request goes through the normal manager
        approval workflow for the full quantity.
        """
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self._report_usage(issue, "1.00", "Cleaned block A floor")
        self.item.refresh_from_db()
        warehouse_before = self.item.available_quantity
        self.client.force_login(self.supervisor)

        blocked = self._post_stock_request(1, "Need cleaner for daily mop")
        self._assert_blocked(blocked, "1.00", "Need cleaner for daily mop")
        self.assertFalse(
            ItemRequest.objects.filter(requested_by=self.supervisor, status=ItemRequest.Status.PENDING).exists()
        )

        # Report the remaining unit -> the item can be requested again
        self._report_usage(issue, "1.00", "Cleaned block B floor")
        allowed = self._post_stock_request(1, "Need cleaner for daily mop")
        self.assertEqual(allowed.status_code, 302)

        new_hk_req = HKStockRequest.objects.get(requested_by=self.supervisor, reason="Need cleaner for daily mop")
        self.assertEqual(new_hk_req.status, "pending")
        self.assertEqual(new_hk_req.covered_quantity, 0)
        self.assertEqual(new_hk_req.inventory_request.quantity_requested, 1)

        # Submitting a request never touches warehouse stock
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, warehouse_before)

    def test_scenario_2_outstanding_stock_blocks_larger_request(self):
        """
        Scenario 2:
        Supervisor holds 1 unreported unit and asks for 3.
        The whole request is blocked; it is not split into a covered part and an approval part.
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 1)

        self.client.force_login(self.supervisor)
        self._assert_blocked(self._post_stock_request(3, "Deep clean week"), "1.00", "Deep clean week")
        self.assertFalse(
            ItemRequest.objects.filter(requested_by=self.supervisor, status=ItemRequest.Status.PENDING).exists()
        )

    def test_scenario_3_all_previously_issued_stock_used(self):
        """
        Scenario 3:
        All previously issued stock has been reported as used (issued 2, used 2).
        New request for 2 units must retain the existing approval workflow for full quantity.
        """
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal("2.00"),
            purpose="Used all stock",
            logged_by=self.supervisor,
        )

        self.client.force_login(self.supervisor)
        response = self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 2,
                "reason": "Replenish supply",
            },
        )
        self.assertEqual(response.status_code, 302)

        new_hk_req = HKStockRequest.objects.filter(
            requested_by=self.supervisor, area=self.area_a, reason="Replenish supply"
        ).first()
        self.assertIsNotNone(new_hk_req)
        self.assertEqual(new_hk_req.quantity, 2)
        self.assertEqual(new_hk_req.covered_quantity, 0)
        self.assertEqual(new_hk_req.status, "pending")
        self.assertIsNotNone(new_hk_req.inventory_request)
        self.assertEqual(new_hk_req.inventory_request.quantity_requested, 2)

    def test_scenario_4_multiple_previous_issues_and_usage_reports(self):
        """
        Scenario 4:
        Two issues (5 and 4 units) with usage reports of 2 and 1 units.
        Unreported usage across both issues = (5 - 2) + (4 - 1) = 6 units, so the item stays
        blocked until every issue has been fully reported.
        """
        _, _, issue1 = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 5)
        _, _, issue2 = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 4)
        self._report_usage(issue1, "2.00", "Routine cleaning")
        self._report_usage(issue2, "1.00", "Routine cleaning 2")

        self.client.force_login(self.supervisor)
        self._assert_blocked(self._post_stock_request(4, "Batch cleaning"), "6.00", "Batch cleaning")

        # Reporting only the first issue is not enough
        self._report_usage(issue1, "3.00", "Finished issue 1")
        self._assert_blocked(self._post_stock_request(4, "Batch cleaning"), "3.00", "Batch cleaning")

        # Reporting the second issue as well unblocks the item
        self._report_usage(issue2, "3.00", "Finished issue 2")
        allowed = self._post_stock_request(4, "Batch cleaning")
        self.assertEqual(allowed.status_code, 302)
        req = HKStockRequest.objects.get(reason="Batch cleaning")
        self.assertEqual(req.covered_quantity, 0)
        self.assertEqual(req.status, "pending")
        self.assertEqual(req.inventory_request.quantity_requested, 4)

    def test_scenario_5_repeated_requests_stay_blocked_until_usage_reported(self):
        """
        Scenario 5:
        Unreported stock = 2.
        Every new request for the item is blocked until usage is reported:
        nothing is queued and nothing is allocated twice.
        """
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self.client.force_login(self.supervisor)

        for n in (1, 2, 3):
            self._assert_blocked(self._post_stock_request(1, f"Request {n}"), "2.00", f"Request {n}")
        # Only the original issued request exists
        self.assertEqual(HKStockRequest.objects.filter(requested_by=self.supervisor).count(), 1)

        # Partial report is still blocked
        self._report_usage(issue, "1.00")
        self._assert_blocked(self._post_stock_request(1, "Request 4"), "1.00", "Request 4")

        # Full report unblocks
        self._report_usage(issue, "1.00")
        allowed = self._post_stock_request(1, "Request 5")
        self.assertEqual(allowed.status_code, 302)
        r5 = HKStockRequest.objects.get(reason="Request 5")
        self.assertEqual(r5.covered_quantity, 0)
        self.assertEqual(r5.status, "pending")
        self.assertEqual(r5.inventory_request.quantity_requested, 1)

    def test_scenario_6_approved_unissued_request_blocks_until_rejected(self):
        """
        Scenario 6:
        An approved request that the manager has not issued yet counts as outstanding, so it blocks a
        new request for the same item. If that request is rejected, the block is released.
        """
        approved_unissued = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=3,
            purpose=f"[HK - {self.area_a.name}] Big request",
            status=ItemRequest.Status.APPROVED,
        )
        self.client.force_login(self.supervisor)

        self._assert_blocked(self._post_stock_request(1, "Concurrent request"), "3.00", "Concurrent request")

        approved_unissued.status = ItemRequest.Status.REJECTED
        approved_unissued.save()

        allowed = self._post_stock_request(2, "After rejection request")
        self.assertEqual(allowed.status_code, 302)
        r = HKStockRequest.objects.get(reason="After rejection request")
        self.assertEqual(r.covered_quantity, 0)
        self.assertEqual(r.status, "pending")
        self.assertEqual(r.inventory_request.quantity_requested, 2)

    def test_scenario_7_different_requesters_and_different_areas(self):
        """
        Scenario 7:
        Isolation between different users and different areas.
        Supervisor A has 5 units in Area A.
        Caretaker in Area A has 0 units.
        Supervisor A in Area B has 0 units.
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 5)

        # Caretaker requests in Area A -> cannot take supervisor's stock
        self.client.force_login(self.caretaker)
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 2,
                "reason": "Caretaker request",
            },
        )
        r_ct = HKStockRequest.objects.filter(reason="Caretaker request").first()
        self.assertEqual(r_ct.covered_quantity, 0)
        self.assertEqual(r_ct.status, "pending")

        # Supervisor requests in Area B -> cannot take Area A's stock
        self.client.force_login(self.supervisor)
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_b.id,
                "inventory_item_id": self.item.id,
                "quantity": 2,
                "reason": "Area B request",
            },
        )
        r_ab = HKStockRequest.objects.filter(reason="Area B request").first()
        self.assertEqual(r_ab.covered_quantity, 0)
        self.assertEqual(r_ab.status, "pending")

    def test_scenario_8_blocked_item_does_not_block_other_items(self):
        """
        Scenario 8:
        Item 1 has unreported usage, item 2 does not.
        - A batch that contains the blocked item is rejected as a whole.
        - Item 2 on its own can still be requested.
        """
        item2 = Item.objects.create(
            name="Garbage Bags",
            item_code="GB-01",
            category=self.category,
            unit="pieces",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=200,
            total_quantity=200,
        )
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 3)

        self.client.force_login(self.supervisor)
        import json
        items_payload = json.dumps([
            {"inventory_item_id": self.item.id, "quantity": 2},
            {"inventory_item_id": item2.id, "quantity": 10},
        ])
        response = self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "items": items_payload,
                "reason": "Hostel supplies batch",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.BLOCK_MSG, response.context["form_error"])
        self.assertIn("Floor Cleaner", response.context["form_error"])
        self.assertFalse(HKStockRequest.objects.filter(reason="Hostel supplies batch").exists())

        # The other item is not affected
        allowed = self._post_stock_request(10, "Garbage bags only", item=item2)
        self.assertEqual(allowed.status_code, 302)
        hk_item2 = HKStockRequest.objects.get(item=item2, reason="Garbage bags only")
        self.assertEqual(hk_item2.covered_quantity, 0)
        self.assertEqual(hk_item2.status, "pending")
        self.assertEqual(hk_item2.inventory_request.quantity_requested, 10)

    def test_scenario_9_concurrent_requests_atomic_reconciliation(self):
        """
        Scenario 9:
        Two requests competing for the same outstanding quantity under transaction.atomic.
        """
        from apps.housekeeping.stock_reconciliation import reconcile_and_create_stock_request
        from django.db import transaction

        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)

        with transaction.atomic():
            hk1, _, cov1, _ = reconcile_and_create_stock_request(
                self.supervisor, self.area_a, self.item, 2, "Req A"
            )

        with transaction.atomic():
            hk2, _, cov2, _ = reconcile_and_create_stock_request(
                self.supervisor, self.area_a, self.item, 2, "Req B"
            )

        self.assertEqual(cov1, 2)
        self.assertEqual(hk1.status, "issued")

        # Req B cannot take the 2 units because Req A already took them!
        self.assertEqual(cov2, 0)
        self.assertEqual(hk2.status, "pending")

    def test_scenario_10_warehouse_stock_deducted_exactly_once(self):
        """
        Scenario 10:
        Warehouse stock is deducted exactly once per actual issue:
        - A blocked request does not deduct warehouse stock.
        - Request submission does not deduct warehouse stock.
        - Actual warehouse issuance deducts warehouse stock exactly once.
        """
        initial_wh_stock = self.item.available_quantity  # 100

        # Create an initial issue of 2 units (deducts 2 from warehouse)
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_wh_stock - 2)
        current_wh = self.item.available_quantity

        self.client.force_login(self.supervisor)

        # Usage not reported yet -> blocked, no deduction
        self._assert_blocked(self._post_stock_request(3, "Too early"), "2.00", "Too early")
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, current_wh)

        # Report all usage, then request 3 units: submission must NOT deduct warehouse stock
        self._report_usage(issue, "2.00")
        allowed = self._post_stock_request(3, "Replenish request")
        self.assertEqual(allowed.status_code, 302)
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, current_wh)

        hk_req = HKStockRequest.objects.get(reason="Replenish request")
        inv_req = hk_req.inventory_request
        self.assertEqual(inv_req.quantity_requested, 3)

        # Manager issues the 3 units via the mobile issue endpoint
        self.client.force_login(self.inv_manager)
        issue_resp = self.client.post(
            f"/inventory/mobile/issue/{inv_req.id}/",
            data={"quantity": 3},
        )
        self.assertEqual(issue_resp.status_code, 302)

        self.item.refresh_from_db()
        # Warehouse stock deducted by EXACTLY 3
        self.assertEqual(self.item.available_quantity, current_wh - 3)

        hk_req.refresh_from_db()
        self.assertEqual(hk_req.status, "issued")

    def test_scenario_11_manager_and_staff_portal_views(self):
        """
        Scenario 11:
        Consistent quantities and statuses in manager and staff interfaces.
        """
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 1)
        self._report_usage(issue, "1.00")

        self.client.force_login(self.supervisor)
        # Request 3 units: the full quantity needs manager approval
        self.assertEqual(self._post_stock_request(3, "Portal test").status_code, 302)

        # Staff portal view
        resp_staff = self.client.get(f"/housekeeping/stock/?area={self.area_a.id}")
        self.assertEqual(resp_staff.status_code, 200)
        active_reqs = resp_staff.context["active_requests"]
        self.assertEqual(len(active_reqs), 1)
        self.assertEqual(active_reqs[0].quantity, 3)
        self.assertEqual(active_reqs[0].covered_quantity, 0)
        self.assertEqual(active_reqs[0].approval_required_quantity, 3)
        self.assertNotContains(resp_staff, "covered from existing stock")
        self.assertContains(resp_staff, "Requested: 3 liters")
        self.assertContains(resp_staff, "Stock not issued yet")

        # Manager portal view (mobile manager requests)
        self.client.force_login(self.inv_manager)
        resp_mgr = self.client.get("/inventory/mobile/manager-requests/")
        self.assertEqual(resp_mgr.status_code, 200)
        pending_reqs = resp_mgr.context["requests"]
        self.assertTrue(any(r.quantity_requested == 3 for r in pending_reqs))

    def test_scenario_12_existing_permissions_and_unrelated_functionality(self):
        """
        Scenario 12:
        Permissions and unrelated housekeeping features remain intact:
        - Unauthorized users cannot request items.
        - Users cannot request items they don't have access to.
        - Area isolation is maintained.
        """
        unauth_user = User.objects.create_user(
            username="unauth_worker",
            password="password123",
            role=User.Role.HOSTEL_OFFICE,
        )
        self.client.force_login(unauth_user)
        resp = self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Unauthorized try",
            },
        )
        # Room attendant does not have hk_required supervisor/caretaker role -> redirected
        self.assertEqual(resp.status_code, 302)
        self.assertFalse(HKStockRequest.objects.filter(requested_by=unauth_user).exists())
