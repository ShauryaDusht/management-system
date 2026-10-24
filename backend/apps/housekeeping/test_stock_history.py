from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.utils import timezone

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog

User = get_user_model()


class StockHistoryTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Users
        self.supervisor = User.objects.create_user(
            username='test.supervisor',
            password='password123',
            role='supervisor',
            first_name='Test',
            last_name='Supervisor',
        )
        self.other_supervisor = User.objects.create_user(
            username='other.supervisor',
            password='password123',
            role='supervisor',
            first_name='Other',
            last_name='Supervisor',
        )
        self.manager = User.objects.create_user(
            username='test.manager',
            password='password123',
            role='inventory_manager',
            first_name='Inventory',
            last_name='Manager',
        )

        # Areas
        self.area_arcade = HKArea.objects.create(name='Central Arcade', area_type='central_arcade')
        self.area_sports = HKArea.objects.create(name='Sports Complex', area_type='sports')
        self.area_other = HKArea.objects.create(name='Academic Block 1', area_type='academic')

        HKUserArea.objects.create(user=self.supervisor, area=self.area_arcade)
        HKUserArea.objects.create(user=self.supervisor, area=self.area_sports)
        HKUserArea.objects.create(user=self.other_supervisor, area=self.area_other)

        # Inventory Items
        self.cat = Category.objects.create(name='Cleaning Supplies')
        self.cleaner_item = Item.objects.create(
            name='Floor Cleaner',
            category=self.cat,
            unit='L',
            total_quantity=100,
            available_quantity=100,
        )
        self.disinfectant_item = Item.objects.create(
            name='Disinfectant',
            category=self.cat,
            unit='L',
            total_quantity=100,
            available_quantity=100,
        )

    def test_history_icon_in_stock_tab_only(self):
        self.client.force_login(self.supervisor)

        # Stock page should have the history button
        stock_resp = self.client.get('/housekeeping/stock/')
        self.assertEqual(stock_resp.status_code, 200)
        self.assertContains(stock_resp, 'stock-history-btn')
        self.assertContains(stock_resp, '/housekeeping/stock/history/')
        self.assertContains(stock_resp, 'History')

        # Other pages (dashboard, schedule, attendance) must NOT contain the stock-history-btn
        dash_resp = self.client.get('/housekeeping/dashboard/')
        self.assertEqual(dash_resp.status_code, 200)
        self.assertNotContains(dash_resp, 'stock-history-btn')

        sched_resp = self.client.get('/housekeeping/schedule/')
        self.assertEqual(sched_resp.status_code, 200)
        self.assertNotContains(sched_resp, 'stock-history-btn')

        att_resp = self.client.get('/housekeeping/attendance/')
        self.assertEqual(att_resp.status_code, 200)
        self.assertNotContains(att_resp, 'stock-history-btn')

    def test_stock_history_navigation_and_no_item_icons(self):
        self.client.force_login(self.supervisor)
        resp = self.client.get('/housekeeping/stock/history/')
        self.assertEqual(resp.status_code, 200)

        # Header and title
        self.assertContains(resp, 'Issue &amp; Usage History')
        self.assertContains(resp, 'STOCK HISTORY')

        # Back button returns to /housekeeping/stock/
        self.assertContains(resp, 'href="/housekeeping/stock/')

        # Stock bottom nav tab remains active (class contains 'nav on' for stock)
        self.assertContains(resp, '📦<span>Stock</span>')

        # Notification bell is preserved
        self.assertContains(resp, 'notif-bell-btn')

        # Search placeholder
        self.assertContains(resp, 'placeholder="Search item name..."')

        # Status filter tabs
        self.assertContains(resp, 'data-status="all"')
        self.assertContains(resp, 'data-status="issued"')
        self.assertContains(resp, 'data-status="pending"')
        self.assertContains(resp, 'data-status="rejected"')

        # Verify NO item icons or img tags inside transaction list
        content_str = resp.content.decode('utf-8')
        # Only brand-logo or profile avatar can be img, transaction cards must have no item images
        tx_container_start = content_str.find('id="transaction-list-container"')
        tx_container_end = content_str.find('id="history-modal-overlay"')
        tx_html = content_str[tx_container_start:tx_container_end]
        self.assertNotIn('<img', tx_html)

    def test_history_shows_fully_consumed_and_rejected_items(self):
        self.client.force_login(self.supervisor)

        # 1. Transaction 1: Floor Cleaner for Central Arcade (Issued, Fully Consumed)
        inv_req1 = ItemRequest.objects.create(
            item=self.cleaner_item,
            requested_by=self.supervisor,
            quantity_requested=5,
            purpose='[HK - Central Arcade] Deep clean lobby',
            status=ItemRequest.Status.ISSUED,
            approved_by=self.manager,
            reviewed_at=timezone.now(),
        )
        hk_req1 = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_arcade,
            item_name=self.cleaner_item.name,
            item=self.cleaner_item,
            quantity=5,
            unit=self.cleaner_item.unit,
            reason='Deep clean lobby',
            status='issued',
            inventory_request=inv_req1,
        )
        issue1 = ItemIssue.objects.create(
            request=inv_req1,
            issued_by=self.manager,
            issued_quantity=5,
        )
        ItemUsageLog.objects.create(
            issue=issue1,
            quantity_used=Decimal('5.00'),
            purpose='Cleaned Central Arcade floor',
            logged_by=self.supervisor,
        )

        # 2. Transaction 2: Disinfectant for Sports Complex (Issued, Usage Pending)
        inv_req2 = ItemRequest.objects.create(
            item=self.disinfectant_item,
            requested_by=self.supervisor,
            quantity_requested=3,
            purpose='[HK - Sports Complex] Gym sanitization',
            status=ItemRequest.Status.ISSUED,
            approved_by=self.manager,
            reviewed_at=timezone.now(),
        )
        hk_req2 = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_sports,
            item_name=self.disinfectant_item.name,
            item=self.disinfectant_item,
            quantity=3,
            unit=self.disinfectant_item.unit,
            reason='Gym sanitization',
            status='issued',
            inventory_request=inv_req2,
        )
        issue2 = ItemIssue.objects.create(
            request=inv_req2,
            issued_by=self.manager,
            issued_quantity=3,
        )

        # 3. Transaction 3: Disinfectant for Central Arcade (Rejected)
        inv_req3 = ItemRequest.objects.create(
            item=self.disinfectant_item,
            requested_by=self.supervisor,
            quantity_requested=2,
            purpose='[HK - Central Arcade] Extra stock',
            status=ItemRequest.Status.REJECTED,
            approved_by=self.manager,
            reviewed_at=timezone.now(),
            rejection_reason='Sufficient stock already available in area.',
        )
        hk_req3 = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_arcade,
            item_name=self.disinfectant_item.name,
            item=self.disinfectant_item,
            quantity=2,
            unit=self.disinfectant_item.unit,
            reason='Extra stock',
            status='rejected',
            inventory_request=inv_req3,
        )

        # On the regular stock dashboard, Floor Cleaner (fully consumed) and Rejected request are NOT visible
        stock_resp = self.client.get(f'/housekeeping/stock/?area={self.area_arcade.id}')
        self.assertNotContains(stock_resp, 'Deep clean lobby')

        # BUT on the History page, ALL 3 transactions ARE visible with correct persisted records!
        hist_resp = self.client.get('/housekeeping/stock/history/')
        self.assertEqual(hist_resp.status_code, 200)

        # Floor cleaner
        self.assertContains(hist_resp, 'Floor Cleaner')
        self.assertContains(hist_resp, 'Central Arcade')
        self.assertContains(hist_resp, 'Issued: 5 L &bull; Used: 5 L')
        self.assertContains(hist_resp, 'Usage Submitted')

        # Disinfectant
        self.assertContains(hist_resp, 'Disinfectant')
        self.assertContains(hist_resp, 'Sports Complex')
        self.assertContains(hist_resp, 'Issued: 3 L &bull; Used: 0 L')
        self.assertContains(hist_resp, 'Usage Pending')

        # Rejected Disinfectant
        self.assertContains(hist_resp, 'Rejected')

        # Summary cards: Total Requests = 3, Usage Pending = 1
        self.assertContains(hist_resp, 'Total Requests')
        self.assertEqual(hist_resp.context['summary']['total_requests'], 3)
        self.assertEqual(hist_resp.context['summary']['usage_pending'], 1)

    def test_campus_area_association_preserved(self):
        self.client.force_login(self.supervisor)

        # Request 1 in Central Arcade
        hk_req1 = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_arcade,
            item_name='Floor Cleaner',
            item=self.cleaner_item,
            quantity=5,
            unit='L',
            reason='Arcade cleaning',
            status='issued',
            covered_quantity=5,
        )

        # Request 2 in Sports Complex
        hk_req2 = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_sports,
            item_name='Disinfectant',
            item=self.disinfectant_item,
            quantity=3,
            unit='L',
            reason='Sports sanitization',
            status='pending',
        )

        # Viewing all history
        resp_all = self.client.get('/housekeeping/stock/history/')
        self.assertContains(resp_all, 'Central Arcade')
        self.assertContains(resp_all, 'Sports Complex')

        # Filtering by Central Arcade area
        resp_ca = self.client.get(f'/housekeeping/stock/history/?area={self.area_arcade.id}')
        self.assertContains(resp_ca, 'Floor Cleaner')
        self.assertContains(resp_ca, 'Central Arcade')
        self.assertNotContains(resp_ca, 'Sports sanitization')

        # Filtering by Sports Complex area
        resp_sc = self.client.get(f'/housekeeping/stock/history/?area={self.area_sports.id}')
        self.assertContains(resp_sc, 'Disinfectant')
        self.assertContains(resp_sc, 'Sports Complex')
        self.assertNotContains(resp_sc, 'Arcade cleaning')

    def test_status_and_search_filters(self):
        self.client.force_login(self.supervisor)

        # Issued transaction
        HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_arcade,
            item_name='Floor Cleaner',
            item=self.cleaner_item,
            quantity=5,
            unit='L',
            reason='Mop floors',
            status='issued',
            covered_quantity=5,
        )

        # Pending transaction
        HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_sports,
            item_name='Disinfectant',
            item=self.disinfectant_item,
            quantity=2,
            unit='L',
            reason='Gym clean',
            status='pending',
        )

        # Filter: status=issued
        resp_issued = self.client.get('/housekeeping/stock/history/?status=issued')
        self.assertEqual(len(resp_issued.context['transactions']), 1)
        self.assertEqual(resp_issued.context['transactions'][0]['item_name'], 'Floor Cleaner')

        # Filter: status=pending
        resp_pending = self.client.get('/housekeeping/stock/history/?status=pending')
        self.assertEqual(len(resp_pending.context['transactions']), 1)
        self.assertEqual(resp_pending.context['transactions'][0]['item_name'], 'Disinfectant')

        # Search by item name
        resp_search = self.client.get('/housekeeping/stock/history/?q=Disinfectant')
        self.assertEqual(len(resp_search.context['transactions']), 1)
        self.assertEqual(resp_search.context['transactions'][0]['item_name'], 'Disinfectant')

    def test_unauthorized_user_access_protection(self):
        # Create request belonging to other_supervisor
        other_req = HKStockRequest.objects.create(
            requested_by=self.other_supervisor,
            area=self.area_other,
            item_name='Secret Cleaner',
            item=self.cleaner_item,
            quantity=10,
            unit='L',
            reason='Confidential cleaning',
            status='pending',
        )

        # Log in as test.supervisor
        self.client.force_login(self.supervisor)

        # History list must NOT include other_supervisor's request
        resp = self.client.get('/housekeeping/stock/history/')
        self.assertNotContains(resp, 'Secret Cleaner')
        self.assertNotContains(resp, 'Confidential cleaning')

        # Direct detail endpoint must return 404 for other_supervisor's request
        detail_resp = self.client.get(f'/housekeeping/stock/history/{other_req.id}/')
        self.assertEqual(detail_resp.status_code, 404)

    def test_transaction_detail_endpoint_and_lifecycle(self):
        self.client.force_login(self.supervisor)

        inv_req = ItemRequest.objects.create(
            item=self.cleaner_item,
            requested_by=self.supervisor,
            quantity_requested=4,
            purpose='[HK - Central Arcade] Lifecycle test',
            status=ItemRequest.Status.ISSUED,
            approved_by=self.manager,
            reviewed_at=timezone.now(),
        )
        hk_req = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area_arcade,
            item_name=self.cleaner_item.name,
            item=self.cleaner_item,
            quantity=4,
            unit=self.cleaner_item.unit,
            reason='Lifecycle test',
            status='issued',
            inventory_request=inv_req,
        )
        issue = ItemIssue.objects.create(
            request=inv_req,
            issued_by=self.manager,
            issued_quantity=4,
            notes='Handle with gloves',
        )
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal('1.50'),
            purpose='Corridor mop',
            logged_by=self.supervisor,
        )

        # Fetch detail as JSON
        detail_resp = self.client.get(f'/housekeeping/stock/history/{hk_req.id}/')
        self.assertEqual(detail_resp.status_code, 200)
        data = detail_resp.json()
        self.assertEqual(data['item_name'], 'Floor Cleaner')
        self.assertEqual(data['area_name'], 'Central Arcade')
        self.assertEqual(data['quantity_requested'], 4)
        self.assertEqual(data['quantity_issued'], 4.0)
        self.assertEqual(data['quantity_used'], 1.5)
        self.assertEqual(data['outstanding_quantity'], 2.5)
        self.assertEqual(data['status_label'], 'Usage Submitted')
        self.assertEqual(len(data['usage_logs']), 1)
        self.assertEqual(data['usage_logs'][0]['purpose'], 'Corridor mop')

        # Fetch detail as HTML partial
        html_resp = self.client.get(f'/housekeeping/stock/history/{hk_req.id}/?format=html')
        self.assertEqual(html_resp.status_code, 200)
        self.assertContains(html_resp, 'Corridor mop')
        self.assertContains(html_resp, 'Floor Cleaner')
        self.assertContains(html_resp, 'Handle with gloves')
