import datetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog

User = get_user_model()


class HousekeepingAreaIssuedStockTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Users
        self.supervisor = User.objects.create_user(
            username="supervisor_a",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="A",
        )
        self.caretaker = User.objects.create_user(
            username="caretaker_b",
            password="password123",
            role=User.Role.CARETAKER,
            first_name="Caretaker",
            last_name="B",
        )
        self.other_supervisor = User.objects.create_user(
            username="supervisor_c",
            password="password123",
            role=User.Role.SUPERVISOR,
            first_name="Supervisor",
            last_name="C",
        )
        self.inv_manager = User.objects.create_user(
            username="inv_manager",
            password="password123",
            role=User.Role.INVENTORY_MANAGER,
        )

        # Areas
        self.central_arcade = HKArea.objects.create(
            name="Central Arcade", area_type="academic", is_active=True
        )
        self.sports_complex = HKArea.objects.create(
            name="Sports Complex", area_type="academic", is_active=True
        )
        self.hostel_c = HKArea.objects.create(
            name="Hostel Beauki", area_type="hostel", is_active=True
        )
        self.hostel_d = HKArea.objects.create(
            name="Hostel Chimair", area_type="hostel", is_active=True
        )
        self.restricted_area = HKArea.objects.create(
            name="Research Park", area_type="academic", is_active=True
        )

        # Assignments
        HKUserArea.objects.create(user=self.supervisor, area=self.central_arcade)
        HKUserArea.objects.create(user=self.supervisor, area=self.sports_complex)

        HKUserArea.objects.create(user=self.caretaker, area=self.hostel_c)
        HKUserArea.objects.create(user=self.caretaker, area=self.hostel_d)

        HKUserArea.objects.create(user=self.other_supervisor, area=self.restricted_area)

        # Inventory Items
        self.category = Category.objects.create(name="Housekeeping Chemicals")
        self.air_freshener = Item.objects.create(
            name="Air Freshener (R5)",
            item_code="AF-R5",
            category=self.category,
            unit="liters",
            item_type=Item.ItemType.CONSUMABLE,
            available_quantity=200,
            total_quantity=200,
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

    def _create_approved_and_issued_request(self, user, area, item, quantity):
        """Helper to create a housekeeping request and corresponding inventory issue."""
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
        return hk_req, inv_req, issue

    def test_supervisor_issued_items_isolated_by_area(self):
        """
        Supervisor A requests 3 Ltr Air Freshener for Central Arcade and 2 Ltr for Sports Complex.
        Both are approved and issued.
        Central Arcade must display ONLY the 3 Ltr request.
        Sports Complex must display ONLY the 2 Ltr request.
        """
        self.client.force_login(self.supervisor)

        hk_req1, inv_req1, issue1 = self._create_approved_and_issued_request(
            user=self.supervisor,
            area=self.central_arcade,
            item=self.air_freshener,
            quantity=3,
        )
        hk_req2, inv_req2, issue2 = self._create_approved_and_issued_request(
            user=self.supervisor,
            area=self.sports_complex,
            item=self.air_freshener,
            quantity=2,
        )

        # 1. View Central Arcade
        resp_ca = self.client.get(f"/housekeeping/stock/?area={self.central_arcade.id}")
        self.assertEqual(resp_ca.status_code, 200)
        ca_issues = list(resp_ca.context["issued_items"])
        self.assertEqual(len(ca_issues), 1)
        self.assertEqual(ca_issues[0].id, issue1.id)
        self.assertEqual(ca_issues[0].issued_quantity, 3)
        self.assertEqual(ca_issues[0].request.hkstockrequest.area_id, self.central_arcade.id)
        self.assertContains(resp_ca, "3 liters")
        self.assertNotContains(resp_ca, "2 liters")

        # 2. View Sports Complex
        resp_sc = self.client.get(f"/housekeeping/stock/?area={self.sports_complex.id}")
        self.assertEqual(resp_sc.status_code, 200)
        sc_issues = list(resp_sc.context["issued_items"])
        self.assertEqual(len(sc_issues), 1)
        self.assertEqual(sc_issues[0].id, issue2.id)
        self.assertEqual(sc_issues[0].issued_quantity, 2)
        self.assertEqual(sc_issues[0].request.hkstockrequest.area_id, self.sports_complex.id)
        self.assertContains(resp_sc, "2 liters")
        self.assertNotContains(resp_sc, "3 liters")

    def test_area_switching_does_not_mix_records(self):
        """
        Alternating between assigned areas consistently returns only the current area's issued items.
        """
        self.client.force_login(self.supervisor)

        self._create_approved_and_issued_request(
            self.supervisor, self.central_arcade, self.air_freshener, 3
        )
        self._create_approved_and_issued_request(
            self.supervisor, self.sports_complex, self.air_freshener, 2
        )

        # Check CA -> SC -> CA -> SC
        resp1 = self.client.get(f"/housekeeping/stock/?area={self.central_arcade.id}")
        self.assertEqual([i.issued_quantity for i in resp1.context["issued_items"]], [3])

        resp2 = self.client.get(f"/housekeeping/stock/?area={self.sports_complex.id}")
        self.assertEqual([i.issued_quantity for i in resp2.context["issued_items"]], [2])

        resp3 = self.client.get(f"/housekeeping/stock/?area={self.central_arcade.id}")
        self.assertEqual([i.issued_quantity for i in resp3.context["issued_items"]], [3])

        resp4 = self.client.get(f"/housekeeping/stock/?area={self.sports_complex.id}")
        self.assertEqual([i.issued_quantity for i in resp4.context["issued_items"]], [2])

    def test_caretaker_assigned_multiple_areas_isolation(self):
        """
        The same area-based isolation must apply to caretakers assigned to multiple areas.
        """
        self.client.force_login(self.caretaker)

        _, _, issue_c = self._create_approved_and_issued_request(
            self.caretaker, self.hostel_c, self.liquid_soap, 5
        )
        _, _, issue_d = self._create_approved_and_issued_request(
            self.caretaker, self.hostel_d, self.air_freshener, 4
        )

        # Hostel Beauki
        resp_c = self.client.get(f"/housekeeping/stock/?area={self.hostel_c.id}")
        self.assertEqual(resp_c.status_code, 200)
        c_issues = list(resp_c.context["issued_items"])
        self.assertEqual(len(c_issues), 1)
        self.assertEqual(c_issues[0].id, issue_c.id)
        self.assertEqual(c_issues[0].request.item.name, "Liquid Soap")
        self.assertEqual(c_issues[0].issued_quantity, 5)

        # Hostel Chimair
        resp_d = self.client.get(f"/housekeeping/stock/?area={self.hostel_d.id}")
        self.assertEqual(resp_d.status_code, 200)
        d_issues = list(resp_d.context["issued_items"])
        self.assertEqual(len(d_issues), 1)
        self.assertEqual(d_issues[0].id, issue_d.id)
        self.assertEqual(d_issues[0].request.item.name, "Air Freshener (R5)")
        self.assertEqual(d_issues[0].issued_quantity, 4)

    def test_repeated_requests_for_same_item_in_different_areas(self):
        """
        Repeated requests for the exact same item in different areas remain separated.
        """
        self.client.force_login(self.supervisor)

        # 2 requests for Central Arcade
        self._create_approved_and_issued_request(
            self.supervisor, self.central_arcade, self.air_freshener, 1
        )
        self._create_approved_and_issued_request(
            self.supervisor, self.central_arcade, self.air_freshener, 4
        )

        # 1 request for Sports Complex
        self._create_approved_and_issued_request(
            self.supervisor, self.sports_complex, self.air_freshener, 7
        )

        resp_ca = self.client.get(f"/housekeeping/stock/?area={self.central_arcade.id}")
        ca_quantities = sorted([i.issued_quantity for i in resp_ca.context["issued_items"]])
        self.assertEqual(ca_quantities, [1, 4])

        resp_sc = self.client.get(f"/housekeeping/stock/?area={self.sports_complex.id}")
        sc_quantities = [i.issued_quantity for i in resp_sc.context["issued_items"]]
        self.assertEqual(sc_quantities, [7])

    def test_usage_reporting_updates_only_intended_request_and_preserves_area(self):
        """
        Logging usage on an issued item updates only that item and preserves area association.
        """
        self.client.force_login(self.supervisor)

        hk_ca, _, issue_ca = self._create_approved_and_issued_request(
            self.supervisor, self.central_arcade, self.air_freshener, 3
        )
        hk_sc, _, issue_sc = self._create_approved_and_issued_request(
            self.supervisor, self.sports_complex, self.air_freshener, 2
        )

        # Log 1.25 Ltr used on Central Arcade's issue
        post_resp = self.client.post(
            f"/housekeeping/stock/usage/{issue_ca.id}/",
            data={
                "area_id": self.central_arcade.id,
                "quantity_used": "1.25",
                "purpose": "Corridor deodorizing",
            },
        )
        self.assertRedirects(post_resp, f"/housekeeping/stock/?area={self.central_arcade.id}")

        # Follow redirect and verify
        follow_resp = self.client.get(f"/housekeeping/stock/?area={self.central_arcade.id}")
        self.assertEqual(follow_resp.status_code, 200)
        ca_issues = list(follow_resp.context["issued_items"])
        self.assertEqual(len(ca_issues), 1)
        self.assertEqual(ca_issues[0].id, issue_ca.id)
        self.assertEqual(ca_issues[0].remaining_quantity, Decimal("1.75"))
        self.assertEqual(ca_issues[0].total_consumed, Decimal("1.25"))

        # Verify Sports Complex issue is completely untouched
        resp_sc = self.client.get(f"/housekeeping/stock/?area={self.sports_complex.id}")
        sc_issues = list(resp_sc.context["issued_items"])
        self.assertEqual(len(sc_issues), 1)
        self.assertEqual(sc_issues[0].id, issue_sc.id)
        self.assertEqual(sc_issues[0].remaining_quantity, Decimal("2.00"))
        self.assertEqual(sc_issues[0].total_consumed, Decimal("0.00"))

        # Verify HKStockRequest area in DB is preserved
        hk_ca.refresh_from_db()
        hk_sc.refresh_from_db()
        self.assertEqual(hk_ca.area_id, self.central_arcade.id)
        self.assertEqual(hk_sc.area_id, self.sports_complex.id)

    def test_unauthorized_area_id_cannot_bypass_permissions(self):
        """
        Passing an unauthorized area parameter falls back to authorized area and does not leak data.
        """
        self.client.force_login(self.supervisor)

        # Create an issued item for other_supervisor in restricted_area
        self._create_approved_and_issued_request(
            self.other_supervisor, self.restricted_area, self.air_freshener, 10
        )

        # Supervisor A attempts to view restricted_area
        resp = self.client.get(f"/housekeeping/stock/?area={self.restricted_area.id}")
        self.assertEqual(resp.status_code, 200)

        # The selected area should fall back to an authorized area (e.g. central_arcade)
        selected = resp.context["selected_area"]
        self.assertIn(selected.id, [self.central_arcade.id, self.sports_complex.id])
        self.assertNotEqual(selected.id, self.restricted_area.id)

        # Issued items must not contain the restricted item
        issued_items = list(resp.context["issued_items"])
        self.assertFalse(any(i.request.hkstockrequest.area_id == self.restricted_area.id for i in issued_items))

    def test_unauthorized_usage_submission_rejected(self):
        """
        Submitting usage for another user's issue or an unassigned area is rejected.
        """
        # Create an issue for other_supervisor
        _, _, other_issue = self._create_approved_and_issued_request(
            self.other_supervisor, self.restricted_area, self.air_freshener, 10
        )

        self.client.force_login(self.supervisor)

        # Attempt to log usage on other_supervisor's issue
        resp = self.client.post(
            f"/housekeeping/stock/usage/{other_issue.id}/",
            data={
                "area_id": self.restricted_area.id,
                "quantity_used": "1",
                "purpose": "Unauthorized usage attempt",
            },
        )
        # Should be 404 (get_object_or_404 filters by request__requested_by=user)
        self.assertEqual(resp.status_code, 404)

        # No usage logs should have been created
        self.assertEqual(ItemUsageLog.objects.filter(issue=other_issue).count(), 0)

    def test_usage_reporting_validation_error_preserves_area_scoping(self):
        """
        When usage validation fails, re-rendered page only contains items for selected area.
        """
        self.client.force_login(self.supervisor)

        _, _, issue_ca = self._create_approved_and_issued_request(
            self.supervisor, self.central_arcade, self.air_freshener, 3
        )
        _, _, issue_sc = self._create_approved_and_issued_request(
            self.supervisor, self.sports_complex, self.air_freshener, 2
        )

        # Post invalid usage exceeding remaining quantity
        resp = self.client.post(
            f"/housekeeping/stock/usage/{issue_ca.id}/",
            data={
                "area_id": self.central_arcade.id,
                "quantity_used": "999",
                "purpose": "Invalid usage",
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.context.get("form_error"))

        # Re-rendered issued_items must only have Central Arcade
        rendered_issues = list(resp.context["issued_items"])
        self.assertEqual(len(rendered_issues), 1)
        self.assertEqual(rendered_issues[0].id, issue_ca.id)
        self.assertNotEqual(rendered_issues[0].id, issue_sc.id)
