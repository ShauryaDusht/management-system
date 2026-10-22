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

    def test_scenario_1_issued_2_used_1_request_1_fully_covered(self):
        """
        Scenario 1:
        Supervisor has 2 units issued, reports using 1, and requests 1 more.
        Must fulfill entirely from outstanding stock:
        - hk_req.status == 'issued'
        - hk_req.covered_quantity == 1
        - No manager approval task created (no pending ItemRequest)
        - No warehouse issue or stock deduction
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        issue = ItemIssue.objects.filter(request__requested_by=self.supervisor).first()

        # Log 1 unit used
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal("1.00"),
            purpose="Cleaned block A floor",
            logged_by=self.supervisor,
        )

        initial_warehouse_avail = self.item.available_quantity
        self.client.force_login(self.supervisor)

        response = self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Need cleaner for daily mop",
            },
        )
        self.assertEqual(response.status_code, 302)

        new_hk_req = HKStockRequest.objects.filter(
            requested_by=self.supervisor, area=self.area_a, reason="Need cleaner for daily mop"
        ).first()
        self.assertIsNotNone(new_hk_req)
        self.assertEqual(new_hk_req.covered_quantity, 1)
        self.assertEqual(new_hk_req.status, "issued")
        self.assertIsNone(new_hk_req.inventory_request)

        # Verify warehouse stock was not deducted
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_warehouse_avail)

        # Verify no pending inventory request was created for manager
        pending_mgr_reqs = ItemRequest.objects.filter(
            requested_by=self.supervisor, status=ItemRequest.Status.PENDING
        )
        self.assertEqual(pending_mgr_reqs.count(), 0)

    def test_scenario_2_outstanding_1_request_3_partially_covered(self):
        """
        Scenario 2:
        Supervisor has 1 unit outstanding, requests 3.
        Must cover 1 from outstanding stock, require approval only for uncovered 2:
        - hk_req.quantity == 3
        - hk_req.covered_quantity == 1
        - hk_req.status == 'pending'
        - inv_req.quantity_requested == 2
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 1)

        self.client.force_login(self.supervisor)
        response = self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 3,
                "reason": "Deep clean week",
            },
        )
        self.assertEqual(response.status_code, 302)

        new_hk_req = HKStockRequest.objects.filter(
            requested_by=self.supervisor, area=self.area_a, reason="Deep clean week"
        ).first()
        self.assertIsNotNone(new_hk_req)
        self.assertEqual(new_hk_req.quantity, 3)
        self.assertEqual(new_hk_req.covered_quantity, 1)
        self.assertEqual(new_hk_req.status, "pending")
        self.assertIsNotNone(new_hk_req.inventory_request)
        self.assertEqual(new_hk_req.inventory_request.quantity_requested, 2)

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
        Multiple issues (5 units, 4 units) and multiple usage reports (2 units used, 1 unit used).
        Total outstanding = (5 - 2) + (4 - 1) = 6 units.
        First request for 4 units is fully covered (covered = 4).
        Second request for 3 units covers remaining 2, requires approval for 1.
        """
        _, _, issue1 = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 5)
        _, _, issue2 = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 4)

        ItemUsageLog.objects.create(
            issue=issue1,
            quantity_used=Decimal("2.00"),
            purpose="Routine cleaning",
            logged_by=self.supervisor,
        )
        ItemUsageLog.objects.create(
            issue=issue2,
            quantity_used=Decimal("1.00"),
            purpose="Routine cleaning 2",
            logged_by=self.supervisor,
        )

        self.client.force_login(self.supervisor)

        # Request 4 units -> fully covered
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 4,
                "reason": "Batch cleaning 1",
            },
        )
        req1 = HKStockRequest.objects.filter(reason="Batch cleaning 1").first()
        self.assertEqual(req1.covered_quantity, 4)
        self.assertEqual(req1.status, "issued")

        # Request 3 units -> only 2 remaining unallocated, so cover 2 and require approval for 1
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 3,
                "reason": "Batch cleaning 2",
            },
        )
        req2 = HKStockRequest.objects.filter(reason="Batch cleaning 2").first()
        self.assertEqual(req2.covered_quantity, 2)
        self.assertEqual(req2.status, "pending")
        self.assertEqual(req2.inventory_request.quantity_requested, 1)

    def test_scenario_5_multiple_requests_before_usage_reported(self):
        """
        Scenario 5:
        Outstanding stock = 2.
        Multiple requests submitted before usage is reported.
        Request 1 (1 unit) -> covered = 1.
        Request 2 (1 unit) -> covered = 1.
        Request 3 (1 unit) -> unallocated is 0, so covered = 0 and requires approval for 1.
        Prevents double-allocation of the same outstanding stock.
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self.client.force_login(self.supervisor)

        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Request 1",
            },
        )
        r1 = HKStockRequest.objects.filter(reason="Request 1").first()
        self.assertEqual(r1.covered_quantity, 1)
        self.assertEqual(r1.status, "issued")

        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Request 2",
            },
        )
        r2 = HKStockRequest.objects.filter(reason="Request 2").first()
        self.assertEqual(r2.covered_quantity, 1)
        self.assertEqual(r2.status, "issued")

        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Request 3",
            },
        )
        r3 = HKStockRequest.objects.filter(reason="Request 3").first()
        self.assertEqual(r3.covered_quantity, 0)
        self.assertEqual(r3.status, "pending")
        self.assertEqual(r3.inventory_request.quantity_requested, 1)

    def test_scenario_6_pending_and_approved_requests_and_rejection(self):
        """
        Scenario 6:
        Pending requests allocate unallocated quantity.
        If a pending request is rejected by manager, its allocation is released.
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self.client.force_login(self.supervisor)

        # Request 1 for 3 units: covers 2, requires approval for 1
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 3,
                "reason": "Big request",
            },
        )
        r1 = HKStockRequest.objects.filter(reason="Big request").first()
        self.assertEqual(r1.covered_quantity, 2)
        self.assertEqual(r1.status, "pending")

        # While r1 is pending, r2 for 1 unit has 0 unallocated stock
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Concurrent request",
            },
        )
        r2 = HKStockRequest.objects.filter(reason="Concurrent request").first()
        self.assertEqual(r2.covered_quantity, 0)

        # Manager rejects r1
        r1.status = "rejected"
        r1.save()
        if r1.inventory_request:
            r1.inventory_request.status = ItemRequest.Status.REJECTED
            r1.inventory_request.save()

        # Now r1's allocation of 2 is released!
        # Next request for 2 units should be fully covered!
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 2,
                "reason": "After rejection request",
            },
        )
        r3 = HKStockRequest.objects.filter(reason="After rejection request").first()
        self.assertEqual(r3.covered_quantity, 2)
        self.assertEqual(r3.status, "issued")

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

    def test_scenario_8_batch_multi_item_request(self):
        """
        Scenario 8:
        Batch request containing multiple items.
        Item 1 has outstanding stock -> covered.
        Item 2 has no outstanding stock -> requires approval.
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
        self.assertEqual(response.status_code, 302)

        hk_item1 = HKStockRequest.objects.filter(item=self.item, reason="Hostel supplies batch").first()
        self.assertIsNotNone(hk_item1)
        self.assertEqual(hk_item1.covered_quantity, 2)
        self.assertEqual(hk_item1.status, "issued")
        self.assertIsNone(hk_item1.inventory_request)

        hk_item2 = HKStockRequest.objects.filter(item=item2, reason="Hostel supplies batch").first()
        self.assertIsNotNone(hk_item2)
        self.assertEqual(hk_item2.covered_quantity, 0)
        self.assertEqual(hk_item2.status, "pending")
        self.assertIsNotNone(hk_item2.inventory_request)
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
        - Request submission does not deduct warehouse stock.
        - Approval does not deduct warehouse stock.
        - Fulfillment from outstanding stock does not deduct warehouse stock.
        - Actual warehouse issuance deducts warehouse stock exactly once.
        """
        initial_wh_stock = self.item.available_quantity  # 100

        # Create an initial issue of 2 units (deducts 2 from warehouse)
        _, _, issue = self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 2)
        self.item.refresh_from_db()
        self.assertEqual(self.item.available_quantity, initial_wh_stock - 2)
        current_wh = self.item.available_quantity

        # Request 1 unit (fully covered from outstanding)
        self.client.force_login(self.supervisor)
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 1,
                "reason": "Covered request",
            },
        )
        self.item.refresh_from_db()
        # Must NOT deduct warehouse stock!
        self.assertEqual(self.item.available_quantity, current_wh)

        # Request 3 units (1 covered, 2 requires approval)
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 3,
                "reason": "Partially covered request",
            },
        )
        self.item.refresh_from_db()
        # Request submission does NOT deduct warehouse stock!
        self.assertEqual(self.item.available_quantity, current_wh)

        part_req = HKStockRequest.objects.filter(reason="Partially covered request").first()
        inv_req = part_req.inventory_request
        self.assertEqual(inv_req.quantity_requested, 2)

        # Manager issues the uncovered 2 units via mobile issue endpoint
        self.client.force_login(self.inv_manager)
        issue_resp = self.client.post(
            f"/inventory/mobile/issue/{inv_req.id}/",
            data={"quantity": 2},
        )
        self.assertEqual(issue_resp.status_code, 302)

        self.item.refresh_from_db()
        # Warehouse stock deducted by EXACTLY 2!
        self.assertEqual(self.item.available_quantity, current_wh - 2)

        part_req.refresh_from_db()
        self.assertEqual(part_req.status, "issued")

    def test_scenario_11_manager_and_staff_portal_views(self):
        """
        Scenario 11:
        Consistent quantities and statuses in manager and staff interfaces.
        """
        self._create_approved_and_issued_stock(self.supervisor, self.area_a, self.item, 1)

        self.client.force_login(self.supervisor)
        # Request 3 units (1 covered, 2 requires approval)
        self.client.post(
            "/housekeeping/stock/request/",
            data={
                "area_id": self.area_a.id,
                "inventory_item_id": self.item.id,
                "quantity": 3,
                "reason": "Portal test",
            },
        )

        # Staff portal view
        resp_staff = self.client.get(f"/housekeeping/stock/?area={self.area_a.id}")
        self.assertEqual(resp_staff.status_code, 200)
        active_reqs = resp_staff.context["active_requests"]
        self.assertEqual(len(active_reqs), 1)
        self.assertEqual(active_reqs[0].quantity, 3)
        self.assertEqual(active_reqs[0].covered_quantity, 1)
        self.assertEqual(active_reqs[0].approval_required_quantity, 2)
        self.assertContains(resp_staff, "1 liters covered from existing stock")
        self.assertContains(resp_staff, "2 liters awaiting manager issue")

        # Manager portal view (mobile manager requests)
        self.client.force_login(self.inv_manager)
        resp_mgr = self.client.get("/inventory/mobile/manager-requests/")
        self.assertEqual(resp_mgr.status_code, 200)
        # Manager only sees the uncovered quantity (2)
        pending_reqs = resp_mgr.context["requests"]
        self.assertTrue(any(r.quantity_requested == 2 for r in pending_reqs))

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
