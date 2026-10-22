from decimal import Decimal
import datetime
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.utils import timezone
from apps.housekeeping.models import HKArea, HKUserArea, HKStockRequest
from apps.inventory.models import Category, Item, ItemRequest, ItemIssue, ItemUsageLog

User = get_user_model()


class HousekeepingStockLimitTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.supervisor = User.objects.create_user(
            username="sup1",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="One",
        )
        self.supervisor2 = User.objects.create_user(
            username="sup2",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="Two",
        )
        self.inv_manager = User.objects.create_user(
            username="inv_mgr",
            password="password123",
            role=User.Role.INVENTORY_MANAGER,
        )

        self.area1 = HKArea.objects.create(name="Hostel Block A", area_type="hostel", is_active=True)
        self.area2 = HKArea.objects.create(name="Hostel Block B", area_type="hostel", is_active=True)
        HKUserArea.objects.create(user=self.supervisor, area=self.area1)
        HKUserArea.objects.create(user=self.supervisor, area=self.area2)
        HKUserArea.objects.create(user=self.supervisor2, area=self.area2)

        self.category = Category.objects.create(name="Cleaning Supplies")
        self.item = Item.objects.create(
            name="Floor Cleaner",
            category=self.category,
            unit="liters",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=500,
            total_quantity=500,
        )

    def test_supervisor_sees_5_and_10_and_more_than_10_requests_in_order(self):
        """Scenarios 1, 2, 3, 5: 5, 10, and 12+ requests all appear, newest first."""
        self.client.force_login(self.supervisor)

        # Create 15 stock requests with sequential created_at timestamps
        base_time = timezone.now() - datetime.timedelta(days=20)
        requests = []
        for i in range(15):
            req = HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area1,
                item_name=f"Item {i+1}",
                quantity=i + 1,
                unit="liters",
                status="pending",
                reason=f"Need cleaner {i+1}",
            )
            # update created_at explicitly
            HKStockRequest.objects.filter(pk=req.pk).update(
                created_at=base_time + datetime.timedelta(hours=i)
            )
            requests.append(req)

        # GET stock page for area1
        response = self.client.get(f"/housekeeping/stock/?area={self.area1.id}")
        self.assertEqual(response.status_code, 200)

        active_requests = list(response.context["active_requests"])
        self.assertEqual(len(active_requests), 15)

        # Verify newest request is first
        self.assertEqual(active_requests[0].item_name, "Item 15")
        self.assertEqual(active_requests[-1].item_name, "Item 1")

    def test_more_than_10_issued_items_accessible(self):
        """Scenario 4: More than 10 issued items are visible and accessible."""
        self.client.force_login(self.supervisor)

        # Create 12 issued items for supervisor
        base_time = timezone.now() - datetime.timedelta(days=15)
        for i in range(12):
            inv_req = ItemRequest.objects.create(
                item=self.item,
                requested_by=self.supervisor,
                quantity_requested=10,
                purpose=f"Cleaning batch {i+1}",
                status=ItemRequest.Status.APPROVED,
            )
            HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area1,
                item_name=self.item.name,
                item=self.item,
                quantity=10,
                unit=self.item.unit,
                status="issued",
                inventory_request=inv_req,
            )
            issue = ItemIssue.objects.create(
                request=inv_req,
                issued_by=self.inv_manager,
                issued_quantity=10,
            )
            ItemIssue.objects.filter(pk=issue.pk).update(
                issued_at=base_time + datetime.timedelta(hours=i)
            )

        response = self.client.get(f"/housekeeping/stock/?area={self.area1.id}")
        self.assertEqual(response.status_code, 200)

        issued_items = list(response.context["issued_items"])
        self.assertEqual(len(issued_items), 12)

    def test_area_scoping_and_cross_supervisor_isolation(self):
        """Scenarios 6, 7: Changing area displays only that area, other supervisor requests hidden."""
        self.client.force_login(self.supervisor)

        # Create 3 requests for area1, 4 requests for area2
        for i in range(3):
            HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area1,
                item_name=f"Area1 Item {i+1}",
                quantity=1,
                status="pending",
            )
        for i in range(4):
            HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area2,
                item_name=f"Area2 Item {i+1}",
                quantity=1,
                status="pending",
            )
        # Create request for supervisor2 in area1
        HKStockRequest.objects.create(
            requested_by=self.supervisor2,
            area=self.area1,
            item_name="Other Supervisor Item",
            quantity=5,
            status="pending",
        )

        # Query area1 for supervisor1
        resp_a1 = self.client.get(f"/housekeeping/stock/?area={self.area1.id}")
        reqs_a1 = list(resp_a1.context["active_requests"])
        self.assertEqual(len(reqs_a1), 3)
        self.assertTrue(all(r.area_id == self.area1.id for r in reqs_a1))
        self.assertFalse(any(r.item_name == "Other Supervisor Item" for r in reqs_a1))

        # Query area2 for supervisor1
        resp_a2 = self.client.get(f"/housekeeping/stock/?area={self.area2.id}")
        reqs_a2 = list(resp_a2.context["active_requests"])
        self.assertEqual(len(reqs_a2), 4)
        self.assertTrue(all(r.area_id == self.area2.id for r in reqs_a2))

    def test_validation_errors_do_not_revert_lists_to_10_items(self):
        """Scenarios 8, 9: Validation error on usage logging preserves full >10 lists."""
        self.client.force_login(self.supervisor)

        # Create 14 requests
        for i in range(14):
            HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area1,
                item_name=f"Request {i+1}",
                quantity=1,
                status="pending",
            )

        # Create 13 issued items
        first_issue = None
        for i in range(13):
            inv_req = ItemRequest.objects.create(
                item=self.item,
                requested_by=self.supervisor,
                quantity_requested=5,
                purpose=f"Batch {i+1}",
                status=ItemRequest.Status.APPROVED,
            )
            HKStockRequest.objects.create(
                requested_by=self.supervisor,
                area=self.area1,
                item_name=self.item.name,
                item=self.item,
                quantity=5,
                unit=self.item.unit,
                status="issued",
                inventory_request=inv_req,
            )
            issue = ItemIssue.objects.create(
                request=inv_req,
                issued_by=self.inv_manager,
                issued_quantity=5,
            )
            if first_issue is None:
                first_issue = issue

        # Post invalid usage (exceeds remaining quantity)
        response = self.client.post(
            f"/housekeeping/stock/usage/{first_issue.id}/",
            data={
                "area_id": self.area1.id,
                "quantity_used": "999",  # Invalid: exceeds remaining 5
                "purpose": "Test invalid",
            },
        )
        self.assertEqual(response.status_code, 200)  # Re-renders stock.html with form_error
        self.assertIsNotNone(response.context.get("form_error"))

        active_requests = list(response.context["active_requests"])
        issued_items = list(response.context["issued_items"])
        self.assertEqual(len(active_requests), 14)
        self.assertEqual(len(issued_items), 13)

    def test_successful_usage_logging_redirects_and_refreshes(self):
        """Scenario 8: Successful usage logging redirects to stock page."""
        self.client.force_login(self.supervisor)

        inv_req = ItemRequest.objects.create(
            item=self.item,
            requested_by=self.supervisor,
            quantity_requested=10,
            purpose="Daily cleaning",
            status=ItemRequest.Status.APPROVED,
        )
        HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area1,
            item_name=self.item.name,
            item=self.item,
            quantity=10,
            unit=self.item.unit,
            status="issued",
            inventory_request=inv_req,
        )
        issue = ItemIssue.objects.create(
            request=inv_req,
            issued_by=self.inv_manager,
            issued_quantity=10,
        )

        response = self.client.post(
            f"/housekeeping/stock/usage/{issue.id}/",
            data={
                "area_id": self.area1.id,
                "quantity_used": "2.5",
                "purpose": "Cleaned floor corridors",
            },
        )
        self.assertRedirects(response, f"/housekeeping/stock/?area={self.area1.id}")

        # Follow redirect and verify updated usage
        follow_resp = self.client.get(f"/housekeeping/stock/?area={self.area1.id}")
        self.assertEqual(follow_resp.status_code, 200)
        issued_items = list(follow_resp.context["issued_items"])
        self.assertEqual(len(issued_items), 1)
        self.assertEqual(issued_items[0].remaining_quantity, Decimal("7.50"))
