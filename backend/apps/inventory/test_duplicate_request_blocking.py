from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client, TestCase
from rest_framework.test import APIClient

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog
from apps.inventory.request_permissions import get_unaccounted_item_quantity

User = get_user_model()


class DuplicateInventoryRequestBlockingTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_client = APIClient()

        # Users
        self.supervisor = User.objects.create_user(
            username="test_supervisor",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="User",
        )
        self.caretaker = User.objects.create_user(
            username="test_caretaker",
            password="password123",
            role=User.Role.CARETAKER,
            first_name="Caretaker",
            last_name="User",
        )
        self.inv_manager = User.objects.create_user(
            username="test_inv_manager",
            password="password123",
            role=User.Role.INVENTORY_MANAGER,
            first_name="Manager",
            last_name="User",
        )

        # Area
        self.area = HKArea.objects.create(name="Hostel Block A", area_type="hostel", is_active=True)
        HKUserArea.objects.create(user=self.supervisor, area=self.area)
        HKUserArea.objects.create(user=self.caretaker, area=self.area)

        # Category and Items
        self.category = Category.objects.create(name="Cleaning Supplies")
        self.floor_cleaner = Item.objects.create(
            name="Floor Cleaner",
            item_code="FC-01",
            category=self.category,
            unit="liters",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=100,
            total_quantity=100,
        )
        self.liquid_soap = Item.objects.create(
            name="Liquid Soap",
            item_code="LS-01",
            category=self.category,
            unit="liters",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=100,
            total_quantity=100,
        )

    def _create_approved_and_issued(self, user, item, quantity, area=None):
        """Helper to create an approved and issued request with an ItemIssue."""
        inv_req = ItemRequest.objects.create(
            item=item,
            requested_by=user,
            quantity_requested=quantity,
            purpose=f"[HK - {area.name if area else 'General'}] Regular cleaning",
            status=ItemRequest.Status.ISSUED,
        )
        hk_req = HKStockRequest.objects.create(
            requested_by=user,
            area=area,
            item_name=item.name,
            item=item,
            quantity=quantity,
            unit=item.unit,
            status="issued",
            inventory_request=inv_req,
            reason="Regular cleaning",
        )
        issue = ItemIssue.objects.create(
            request=inv_req,
            issued_by=self.inv_manager,
            issued_quantity=quantity,
        )
        return hk_req, inv_req, issue

    def test_request_qty_5_blocks_repeat_request_until_fully_reported(self):
        """
        Example workflow:
        1. Supervisor requests 5 litres of floor cleaner; approved and issued.
        2. Repeat request for floor cleaner is blocked.
        3. Report usage of 3 litres; remaining 2 litres still blocks new request.
        4. Report remaining 2 litres; request unlocks.
        """
        # Step 1: Issue 5 litres of floor cleaner
        _, _, issue = self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 5, area=self.area
        )

        # Check outstanding quantity is 5.00
        outstanding = get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area)
        self.assertEqual(outstanding, Decimal("5.00"))

        # Step 2: Repeat request is blocked via direct API
        self.api_client.force_authenticate(user=self.supervisor)
        api_resp = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 2, "purpose": "Need more"},
            format="json",
        )
        self.assertEqual(api_resp.status_code, 400)
        self.assertIn("Previous item's usage report must be completed", str(api_resp.data))

        # Repeat request blocked via batch API
        batch_resp = self.api_client.post(
            "/api/inventory/requests/batch/",
            {
                "items": [{"item": self.floor_cleaner.id, "quantity_requested": 1}],
                "purpose": "Need more batch",
            },
            format="json",
        )
        self.assertEqual(batch_resp.status_code, 400)
        self.assertIn("Previous item's usage report must be completed", str(batch_resp.data))

        # Repeat request blocked via mobile HTMX view
        self.client.force_login(self.supervisor)
        hk_resp = self.client.post(
            "/housekeeping/stock/request/",
            {
                "area_id": self.area.id,
                "inventory_item_id": self.floor_cleaner.id,
                "quantity": 2,
                "reason": "Need more cleaner",
            },
        )
        self.assertEqual(hk_resp.status_code, 200)
        self.assertIn("previous item's usage report must be completed", hk_resp.context["form_error"])

        # Step 3: Report partial usage of 3 litres
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal("3.00"),
            purpose="Cleaned 1st floor",
            logged_by=self.supervisor,
        )

        outstanding = get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area)
        self.assertEqual(outstanding, Decimal("2.00"))

        # Still blocked via API
        api_resp_partial = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 1, "purpose": "Trying again"},
            format="json",
        )
        self.assertEqual(api_resp_partial.status_code, 400)
        self.assertIn("Previous item's usage report must be completed", str(api_resp_partial.data))

        # Still blocked via mobile HTMX
        hk_resp_partial = self.client.post(
            "/housekeeping/stock/request/",
            {
                "area_id": self.area.id,
                "inventory_item_id": self.floor_cleaner.id,
                "quantity": 1,
                "reason": "Trying again",
            },
        )
        self.assertEqual(hk_resp_partial.status_code, 200)
        self.assertIn("previous item's usage report must be completed", hk_resp_partial.context["form_error"])

        # Step 4: Report remaining 2 litres
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal("2.00"),
            purpose="Cleaned 2nd floor",
            logged_by=self.supervisor,
        )

        outstanding = get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area)
        self.assertEqual(outstanding, Decimal("0.00"))

        # Now UNLOCKED! API request succeeds
        api_resp_unlocked = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 2, "purpose": "Now allowed"},
            format="json",
        )
        self.assertEqual(api_resp_unlocked.status_code, 201)

    def test_restriction_works_for_both_supervisors_and_caretakers(self):
        """Verify caretaker is also restricted until previous usage is fully accounted for."""
        _, _, issue = self._create_approved_and_issued(
            self.caretaker, self.liquid_soap, 4, area=self.area
        )

        self.api_client.force_authenticate(user=self.caretaker)
        api_resp = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.liquid_soap.id, "quantity_requested": 1, "purpose": "Caretaker request"},
            format="json",
        )
        self.assertEqual(api_resp.status_code, 400)
        self.assertIn("Previous item's usage report must be completed", str(api_resp.data))

        # Log all 4 litres used
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal("4.00"),
            purpose="Filled soap dispensers",
            logged_by=self.caretaker,
        )

        # Unlocked for caretaker
        api_resp_after = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.liquid_soap.id, "quantity_requested": 1, "purpose": "Caretaker request 2"},
            format="json",
        )
        self.assertEqual(api_resp_after.status_code, 201)

    def test_multiple_outstanding_requests_handled_correctly(self):
        """
        If multiple approved/issued requests for the same item exist, all outstanding
        quantities must be accounted for before allowing another request.
        """
        # Issue 1: 3 litres
        _, _, issue1 = self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 3, area=self.area
        )
        # Issue 2: 2 litres
        _, _, issue2 = self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 2, area=self.area
        )

        self.assertEqual(
            get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area),
            Decimal("5.00"),
        )

        # Fully log issue 1 (3 litres)
        ItemUsageLog.objects.create(
            issue=issue1,
            quantity_used=Decimal("3.00"),
            purpose="Block A common areas",
            logged_by=self.supervisor,
        )

        # Issue 2 is still outstanding (2 litres) -> still blocked!
        self.assertEqual(
            get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area),
            Decimal("2.00"),
        )
        self.api_client.force_authenticate(user=self.supervisor)
        api_resp = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 1, "purpose": "Trying before issue2 done"},
            format="json",
        )
        self.assertEqual(api_resp.status_code, 400)

        # Fully log issue 2 (2 litres)
        ItemUsageLog.objects.create(
            issue=issue2,
            quantity_used=Decimal("2.00"),
            purpose="Block A stairs",
            logged_by=self.supervisor,
        )

        # Now all issues are accounted for -> unlocked!
        self.assertEqual(
            get_unaccounted_item_quantity(self.supervisor, self.floor_cleaner, area=self.area),
            Decimal("0.00"),
        )
        api_resp_success = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 1, "purpose": "All done, requesting again"},
            format="json",
        )
        self.assertEqual(api_resp_success.status_code, 201)

    def test_other_inventory_items_remain_requestable(self):
        """Blocking one item does not affect other inventory items."""
        # Issue 5 litres of floor cleaner
        self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 5, area=self.area
        )

        self.api_client.force_authenticate(user=self.supervisor)

        # Floor cleaner is blocked
        fc_resp = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.floor_cleaner.id, "quantity_requested": 1, "purpose": "Floor cleaner"},
            format="json",
        )
        self.assertEqual(fc_resp.status_code, 400)

        # Liquid Soap is NOT blocked
        soap_resp = self.api_client.post(
            "/api/inventory/requests/",
            {"item": self.liquid_soap.id, "quantity_requested": 3, "purpose": "Soap needed"},
            format="json",
        )
        self.assertEqual(soap_resp.status_code, 201)

    def test_usage_quantity_validation_rejects_negative_or_excessive_quantities(self):
        """Users cannot report negative quantities or more usage than the outstanding quantity."""
        _, _, issue = self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 5, area=self.area
        )

        # Test model-level validation: negative quantity
        with self.assertRaises(ValidationError):
            ItemUsageLog.objects.create(
                issue=issue,
                quantity_used=Decimal("-1.00"),
                purpose="Invalid negative",
                logged_by=self.supervisor,
            )

        # Test model-level validation: zero quantity
        with self.assertRaises(ValidationError):
            ItemUsageLog.objects.create(
                issue=issue,
                quantity_used=Decimal("0.00"),
                purpose="Invalid zero",
                logged_by=self.supervisor,
            )

        # Test model-level validation: exceeding remaining quantity (issued 5, report 6)
        with self.assertRaises(ValidationError):
            ItemUsageLog.objects.create(
                issue=issue,
                quantity_used=Decimal("6.00"),
                purpose="Excessive usage",
                logged_by=self.supervisor,
            )

        # Test HTMX hk_log_usage view rejects exceeding remaining
        self.client.force_login(self.supervisor)
        hk_log_resp = self.client.post(
            f"/housekeeping/stock/usage/{issue.id}/",
            {"quantity_used": "10.00", "purpose": "Too much", "area_id": self.area.id},
        )
        self.assertEqual(hk_log_resp.status_code, 200)
        self.assertContains(hk_log_resp, "Cannot exceed remaining quantity")

        # Test API IssueUsageLogsView rejects exceeding remaining
        self.api_client.force_authenticate(user=self.supervisor)
        api_log_resp = self.api_client.post(
            f"/api/inventory/issues/{issue.id}/log-usage/",
            {"quantity_used": "7.00", "purpose": "Too much"},
            format="json",
        )
        self.assertEqual(api_log_resp.status_code, 400)
        self.assertIn("Cannot exceed remaining quantity", str(api_log_resp.data))

    def test_mobile_stock_page_displays_blocked_button_and_message(self):
        """Mobile stock page shows 'Blocked' button and clear explanation for blocked items."""
        from apps.housekeeping.models import HKAreaStock

        # Set up area stock below threshold so it appears in low_stocks
        area_stock = HKAreaStock.objects.create(
            area=self.area,
            item_name=self.floor_cleaner.name,
            quantity=1,
            unit="liters",
            low_stock_threshold=5,
        )

        # Issue 5 litres of floor cleaner
        self._create_approved_and_issued(
            self.supervisor, self.floor_cleaner, 5, area=self.area
        )

        self.client.force_login(self.supervisor)
        resp = self.client.get(f"/housekeeping/stock/?area={self.area.id}")
        self.assertEqual(resp.status_code, 200)

        # Verify page displays "Blocked" button and explanatory message
        self.assertContains(resp, "Blocked")
        self.assertContains(resp, "Previous item's usage report must be completed before requesting again")
        self.assertContains(resp, "5.00 liters pending")
