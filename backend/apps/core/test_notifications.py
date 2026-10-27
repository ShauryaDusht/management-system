from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.utils import timezone

from apps.core.models import Notification
from apps.core.notifications import (
    create_notification,
    notify_inventory_approved,
    notify_inventory_rejected,
    notify_leave_decision,
    check_and_send_usage_reminders,
)
from apps.inventory.models import Category, Item, ItemRequest, ItemIssue, ItemUsageLog
from apps.housekeeping.models import HKArea, HKUserArea, HKStockRequest, HKLeaveRequest, HKInchargeAssignment

User = get_user_model()


class InAppNotificationSystemTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Users
        self.supervisor = User.objects.create_user(
            username='ashok.rathod',
            password='password123',
            first_name='Ashok',
            last_name='Rathod',
            role='supervisor',
        )
        self.caretaker = User.objects.create_user(
            username='jaimin.patel',
            password='password123',
            first_name='Jaimin',
            last_name='Patel',
            role='caretaker',
        )
        self.other_supervisor = User.objects.create_user(
            username='ram.singh',
            password='password123',
            first_name='Ram',
            last_name='Singh',
            role='supervisor',
        )
        self.manager = User.objects.create_user(
            username='hk.manager',
            password='password123',
            first_name='HK',
            last_name='Manager',
            role='hk_inventory_manager',
        )

        # HK Area
        self.area = HKArea.objects.create(name='Hostel 4', area_type='hostel')
        HKUserArea.objects.create(user=self.supervisor, area=self.area)
        HKUserArea.objects.create(user=self.caretaker, area=self.area)

        # Inventory Items
        self.category = Category.objects.create(name='Cleaning Supplies')
        self.soap = Item.objects.create(
            name='Hand Soap Liquid',
            category=self.category,
            item_type=Item.ItemType.CONSUMABLE,
            unit=Item.Unit.LITRES,
            total_quantity=100,
            available_quantity=100,
            threshold_quantity=10,
        )
        self.mop = Item.objects.create(
            name='Floor Mop',
            category=self.category,
            item_type=Item.ItemType.ASSET,
            unit=Item.Unit.PIECES,
            total_quantity=20,
            available_quantity=20,
            threshold_quantity=2,
        )

    def test_create_notification_and_deduplication(self):
        """Verify notifications can be created and duplicate dedup_key prevents re-creation."""
        n1 = create_notification(
            user=self.supervisor,
            title='Test Title',
            message='Test Message',
            notification_type='general',
            dedup_key='test_unique_key_1',
        )
        self.assertIsNotNone(n1)
        self.assertEqual(Notification.objects.filter(user=self.supervisor).count(), 1)

        # Attempt to create duplicate with identical key
        n2 = create_notification(
            user=self.supervisor,
            title='Test Title Duplicate',
            message='Different text',
            notification_type='general',
            dedup_key='test_unique_key_1',
        )
        self.assertEqual(n1.id, n2.id)
        self.assertEqual(Notification.objects.filter(user=self.supervisor).count(), 1)

    def test_inventory_request_approved_notification(self):
        """Verify notification on inventory request approval includes item, quantity, status, and link."""
        req = ItemRequest.objects.create(
            requested_by=self.supervisor,
            item=self.soap,
            quantity_requested=5,
            purpose='Hostel cleaning',
            status=ItemRequest.Status.PENDING,
        )
        hk_req = HKStockRequest.objects.create(
            requested_by=self.supervisor,
            area=self.area,
            item_name=self.soap.name,
            item=self.soap,
            quantity=5,
            unit=self.soap.unit,
            inventory_request=req,
            status='pending',
        )

        notif = notify_inventory_approved(req)
        self.assertIsNotNone(notif)
        self.assertEqual(notif.user, self.supervisor)
        self.assertEqual(notif.status_label, 'Issued')
        self.assertIn('Hand Soap Liquid', notif.message)
        self.assertIn('5', notif.message)
        self.assertIn(f'area={self.area.id}', notif.link)
        self.assertFalse(notif.is_read)

        # Duplicate approval trigger does not create a duplicate
        notif_dup = notify_inventory_approved(req)
        self.assertEqual(notif.id, notif_dup.id)
        self.assertEqual(Notification.objects.filter(user=self.supervisor).count(), 1)

    def test_inventory_request_rejected_notification(self):
        """Verify notification on inventory request rejection includes reason."""
        req = ItemRequest.objects.create(
            requested_by=self.caretaker,
            item=self.mop,
            quantity_requested=2,
            purpose='Urgent replacement',
            status=ItemRequest.Status.PENDING,
        )

        notif = notify_inventory_rejected(req, rejection_reason='Out of stock in main store')
        self.assertIsNotNone(notif)
        self.assertEqual(notif.user, self.caretaker)
        self.assertEqual(notif.status_label, 'Rejected')
        self.assertIn('Floor Mop', notif.message)
        self.assertIn('Out of stock in main store', notif.message)

    def test_leave_request_approved_and_rejected_notifications(self):
        """Verify leave decision notification for requester."""
        leave_date = date.today() + timedelta(days=2)

        # Approved
        notif_app = notify_leave_decision(
            user=self.supervisor,
            leave_date=leave_date,
            decision='approved',
            area_name=self.area.name,
            note='All good',
            leave_id=101,
        )
        self.assertIsNotNone(notif_app)
        self.assertEqual(notif_app.status_label, 'Approved')
        self.assertIn('approved', notif_app.message.lower())

        # Rejected
        notif_rej = notify_leave_decision(
            user=self.caretaker,
            leave_date=leave_date,
            decision='rejected',
            area_name=self.area.name,
            note='Coverage not available',
            leave_id=102,
        )
        self.assertIsNotNone(notif_rej)
        self.assertEqual(notif_rej.status_label, 'Rejected')
        self.assertIn('rejected', notif_rej.message.lower())
        self.assertIn('Coverage not available', notif_rej.message)

    def test_usage_report_reminder_after_5pm(self):
        """Verify usage report reminders after 5 PM for incomplete issued items."""
        req = ItemRequest.objects.create(
            requested_by=self.supervisor,
            item=self.soap,
            quantity_requested=10,
            purpose='Hostel cleaning',
            status=ItemRequest.Status.ISSUED,
        )
        issue = ItemIssue.objects.create(
            request=req,
            issued_by=self.manager,
            issued_quantity=10,
        )
        # 4 litres logged used, 6 litres remaining
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal('4.00'),
            purpose='Lobby cleaning',
            logged_by=self.supervisor,
        )

        # The clock is pinned (IST) so this test gives the same result at any time of day.
        today = date(2031, 3, 10)

        def at_ist(hour):
            return mock.patch(
                'apps.core.notifications.timezone.now',
                return_value=datetime(2031, 3, 10, hour, 0, tzinfo=ZoneInfo('Asia/Kolkata')),
            )

        # 1. Before 5 PM without force: no reminders sent
        with at_ist(10):
            created = check_and_send_usage_reminders(force_time=False, target_date=today)
        self.assertEqual(created, 0)

        # 2. After 5 PM, without force: creates the reminder
        with at_ist(18):
            count = check_and_send_usage_reminders(force_time=False, target_date=today)
        self.assertGreaterEqual(count, 1)

        notif = Notification.objects.filter(
            user=self.supervisor,
            notification_type=Notification.NotificationType.USAGE_REMINDER,
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn('Hand Soap Liquid', notif.message)
        self.assertIn('6', notif.message)
        self.assertEqual(notif.status_label, 'Pending Usage')

        # 3. Repeated check on the same day: no duplicate created
        count_repeat = check_and_send_usage_reminders(force_time=True, target_date=today)
        self.assertEqual(count_repeat, 0)
        self.assertEqual(
            Notification.objects.filter(
                user=self.supervisor,
                notification_type=Notification.NotificationType.USAGE_REMINDER,
            ).count(),
            1,
        )

        # 4. If report is finalized or all used up, no reminders on subsequent days
        ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=Decimal('6.00'),
            purpose='Washroom cleaning completion',
            logged_by=self.supervisor,
        )
        tomorrow = today + timedelta(days=1)
        count_tomorrow = check_and_send_usage_reminders(force_time=True, target_date=tomorrow)
        # Should not create reminder for this issue because outstanding is now 0
        reminders_tomorrow = Notification.objects.filter(
            user=self.supervisor,
            dedup_key__contains=f":{issue.id}:{tomorrow.isoformat()}",
        )
        self.assertEqual(reminders_tomorrow.count(), 0)

    def test_user_isolation(self):
        """Verify each user only sees their own notifications, never another user's."""
        create_notification(
            user=self.supervisor,
            title='Supervisor Private Notif',
            message='Private leave information for supervisor',
        )
        create_notification(
            user=self.other_supervisor,
            title='Other Private Notif',
            message='Private information for other user',
        )

        # Supervisor queries notifications
        self.client.force_login(self.supervisor)
        res = self.client.get('/api/notifications/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data['notifications']), 1)
        self.assertEqual(data['notifications'][0]['title'], 'Supervisor Private Notif')
        self.assertNotIn('Other Private Notif', str(data))

        # Other supervisor queries
        self.client.force_login(self.other_supervisor)
        res2 = self.client.get('/api/notifications/')
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(len(data2['notifications']), 1)
        self.assertEqual(data2['notifications'][0]['title'], 'Other Private Notif')
        self.assertNotIn('Supervisor Private Notif', str(data2))

    def test_notification_mark_read_and_mark_all_read(self):
        """Verify marking single and all notifications as read updates unread count immediately."""
        n1 = create_notification(user=self.supervisor, title='N1', message='M1')
        n2 = create_notification(user=self.supervisor, title='N2', message='M2')

        self.client.force_login(self.supervisor)
        # Check initial unread count
        res = self.client.get('/api/notifications/')
        self.assertEqual(res.json()['unread_count'], 2)

        # Mark N1 read
        res_read = self.client.post(f'/api/notifications/{n1.id}/read/')
        self.assertEqual(res_read.status_code, 200)
        self.assertEqual(res_read.json()['unread_count'], 1)

        n1.refresh_from_db()
        self.assertTrue(n1.is_read)
        self.assertIsNotNone(n1.read_at)

        # Mark all read
        res_all = self.client.post('/api/notifications/mark-all-read/')
        self.assertEqual(res_all.status_code, 200)
        self.assertEqual(res_all.json()['unread_count'], 0)

        n2.refresh_from_db()
        self.assertTrue(n2.is_read)

    def test_unauthorized_access_prevented(self):
        """Verify unauthenticated requests cannot access notification endpoints."""
        res = self.client.get('/api/notifications/')
        self.assertEqual(res.status_code, 401)

        res_read = self.client.post('/api/notifications/1/read/')
        self.assertEqual(res_read.status_code, 401)

    def test_inventory_approval_api_integration(self):
        """Verify approving an inventory request via API triggers requester notification."""
        from rest_framework_simplejwt.tokens import RefreshToken
        req = ItemRequest.objects.create(
            requested_by=self.supervisor,
            item=self.soap,
            quantity_requested=3,
            purpose='Hostel cleaning',
            status=ItemRequest.Status.PENDING,
        )

        token = str(RefreshToken.for_user(self.manager).access_token)
        res = self.client.post(
            f'/api/inventory/requests/{req.id}/issue/',
            {'issued_quantity': 3},
            HTTP_AUTHORIZATION=f'Bearer {token}',
        )
        self.assertEqual(res.status_code, 201)

        # Verify supervisor received notification
        notif = Notification.objects.filter(
            user=self.supervisor,
            notification_type=Notification.NotificationType.INVENTORY_APPROVED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn('Hand Soap Liquid', notif.message)
        self.assertIn('3', notif.message)
        self.assertEqual(notif.status_label, 'Issued')

    def test_leave_approval_api_integration(self):
        """Verify admin decision on HKInchargeAssignment triggers notification for leave staff."""
        from rest_framework_simplejwt.tokens import RefreshToken
        leave_req = HKLeaveRequest.objects.create(
            staff=self.supervisor,
            area=self.area,
            leave_date=date.today() + timedelta(days=3),
            status='pending_admin_approval',
        )
        assignment = HKInchargeAssignment.objects.create(
            leave_request=leave_req,
            area=self.area,
            leave_staff=self.supervisor,
            leave_staff_name=self.supervisor.get_full_name() or self.supervisor.username,
            leave_staff_area='hostels',
            leave_date=leave_req.leave_date,
            assigned_staff=self.caretaker,
            assigned_staff_name=self.caretaker.get_full_name() or self.caretaker.username,
            status='pending_admin_approval',
        )

        token = str(RefreshToken.for_user(self.manager).access_token)
        res = self.client.post(
            f'/api/housekeeping/incharge-assignments/{assignment.id}/decision/',
            data={'decision': 'approved', 'decision_note': 'Approved by manager'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}',
        )
        self.assertEqual(res.status_code, 200)

        notif = Notification.objects.filter(
            user=self.supervisor,
            notification_type=Notification.NotificationType.LEAVE_APPROVED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status_label, 'Approved')
        self.assertIn(leave_req.leave_date.strftime('%d %b %Y'), notif.message)

    def test_send_usage_reminders_command(self):
        """Verify the send_usage_reminders management command executes cleanly."""
        from django.core.management import call_command
        from io import StringIO

        req = ItemRequest.objects.create(
            requested_by=self.caretaker,
            item=self.soap,
            quantity_requested=8,
            purpose='Hostel cleaning',
            status=ItemRequest.Status.ISSUED,
        )
        ItemIssue.objects.create(
            request=req,
            issued_by=self.manager,
            issued_quantity=8,
        )

        out = StringIO()
        call_command('send_usage_reminders', force=True, stdout=out)
        output = out.getvalue()
        self.assertIn('Successfully processed usage report reminders', output)

        notif = Notification.objects.filter(
            user=self.caretaker,
            notification_type=Notification.NotificationType.USAGE_REMINDER,
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn('8', notif.message)

    def test_portal_notifications_page(self):
        """Verify /portal/notifications/ renders notification page for authenticated staff."""
        create_notification(
            user=self.supervisor,
            title='Test Page Notif',
            message='Message on page',
        )
        self.client.force_login(self.supervisor)
        res = self.client.get('/portal/notifications/')
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'Test Page Notif')
        self.assertContains(res, 'Message on page')
