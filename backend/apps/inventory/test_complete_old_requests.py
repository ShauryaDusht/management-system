import datetime
import json
import os
import tempfile
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.housekeeping.models import HKStockRequest
from apps.inventory.management.commands.complete_old_requests import ISSUE_NOTE
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog
from apps.inventory.request_permissions import get_unaccounted_item_quantity

User = get_user_model()
Status = ItemRequest.Status


def when(year, month, day):
    return timezone.make_aware(datetime.datetime(year, month, day, 12, 0))


class CompleteOldRequestsTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='old_manager', password='x', role='hk_inventory_manager')
        self.caretaker = User.objects.create_user(username='old_caretaker', password='x', role='caretaker')
        category = Category.objects.create(name='Cleaning Supplies')
        self.phenyl = Item.objects.create(
            name='Phenyl', category=category, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=100, available_quantity=100, reserved_quantity=30, unit='Ltr')

        def make(status, day, quantity=10, purpose='[HK - Aibaan] stock', with_hk=True):
            request = ItemRequest.objects.create(
                item=self.phenyl, requested_by=self.caretaker, quantity_requested=quantity,
                units_remaining=100, purpose=purpose, status=status)
            ItemRequest.objects.filter(pk=request.pk).update(requested_at=day)
            if with_hk:
                HKStockRequest.objects.create(
                    requested_by=self.caretaker, item_name='Phenyl', item=self.phenyl, quantity=quantity,
                    unit='Ltr', reason='stock', status=status, inventory_request=request)
            return request

        self.old_pending = make(Status.PENDING, when(2026, 6, 24))
        self.old_approved = make(Status.APPROVED, when(2026, 8, 24), quantity=20)
        self.october_pending = make(Status.PENDING, when(2026, 10, 23))
        self.october_approved = make(Status.APPROVED, when(2026, 10, 23), quantity=5)
        self.horticulture_old = make(Status.PENDING, when(2026, 6, 24), purpose='[Horticulture - Zone A] lawn', with_hk=False)
        self.snapshot = os.path.join(tempfile.mkdtemp(), 'snapshot.json')

    def run_command(self, *args):
        out = StringIO()
        call_command('complete_old_requests', *args, stdout=out)
        return out.getvalue()

    def apply(self):
        return self.run_command('--before', '2026-10-01', '--apply', '--snapshot', self.snapshot)

    def issuer(self):
        # the first active HK inventory manager (the database already holds the portal's own manager account)
        return User.objects.filter(role='hk_inventory_manager', is_active=True).order_by('id').first()

    def refreshed(self, request):
        request.refresh_from_db()
        return request

    def test_a_dry_run_changes_nothing(self):
        output = self.run_command('--before', '2026-10-01')

        self.assertIn('2 housekeeping request(s) would be completed', output)
        self.assertIn('Nothing changed', output)
        self.assertEqual(self.refreshed(self.old_pending).status, Status.PENDING)
        self.assertEqual(self.refreshed(self.old_approved).status, Status.APPROVED)
        self.assertEqual(ItemIssue.objects.count(), 0)

    def test_old_requests_become_issued_on_the_day_they_were_requested(self):
        self.apply()

        for request in (self.old_pending, self.old_approved):
            request = self.refreshed(request)
            self.assertEqual(request.status, Status.ISSUED)
            self.assertEqual(request.reviewed_at, request.requested_at)
            issue = request.issue
            self.assertEqual(issue.issued_at, request.requested_at)          # not today
            self.assertEqual(issue.issued_quantity, request.quantity_requested)
            self.assertEqual(issue.original_quantity, request.quantity_requested)
            self.assertEqual(issue.issued_by, self.issuer())
            self.assertEqual(issue.notes, ISSUE_NOTE)

    def test_october_and_horticulture_are_left_alone(self):
        self.apply()

        self.assertEqual(self.refreshed(self.october_pending).status, Status.PENDING)
        self.assertEqual(self.refreshed(self.october_approved).status, Status.APPROVED)
        self.assertEqual(self.refreshed(self.horticulture_old).status, Status.PENDING)
        self.assertEqual(ItemIssue.objects.count(), 2)

    def test_stock_counts_do_not_change_and_the_held_back_stock_is_released(self):
        self.apply()

        self.phenyl.refresh_from_db()
        self.assertEqual(self.phenyl.available_quantity, 100)
        self.assertEqual(self.phenyl.total_quantity, 100)
        self.assertEqual(self.phenyl.reserved_quantity, 10)    # 30 held back - 20 held by the August approval

    def test_staff_side_follows_and_nobody_is_notified(self):
        from apps.core.models import Notification
        before = Notification.objects.count()

        self.apply()

        for request in (self.old_pending, self.old_approved):
            self.assertEqual(HKStockRequest.objects.get(inventory_request=request).status, 'issued')
        self.assertEqual(HKStockRequest.objects.get(inventory_request=self.october_pending).status, 'pending')
        self.assertEqual(Notification.objects.count(), before)

    def test_staff_can_clear_the_block_by_reporting_usage(self):
        # approved-but-never-issued requests block a new request for the item, and staff cannot clear that
        self.assertGreater(get_unaccounted_item_quantity(self.caretaker, self.phenyl), 0)

        self.apply()

        outstanding = get_unaccounted_item_quantity(self.caretaker, self.phenyl)
        self.assertGreater(outstanding, 0)       # still to be reported (and the October approval still counts)...
        for request in (self.old_pending, self.old_approved):
            issue = self.refreshed(request).issue
            ItemUsageLog.objects.create(
                issue=issue, quantity_used=Decimal(issue.issued_quantity), purpose='used', logged_by=self.caretaker)
        # ...and reporting usage on the old issues takes exactly those quantities off
        self.assertEqual(get_unaccounted_item_quantity(self.caretaker, self.phenyl), outstanding - 30)

    def test_running_it_twice_finds_nothing_more(self):
        self.apply()
        self.assertIn('0 housekeeping request(s)', self.run_command('--before', '2026-10-01'))
        self.assertEqual(ItemIssue.objects.count(), 2)

    def test_undo_puts_everything_back(self):
        self.apply()
        with open(self.snapshot, encoding='utf-8') as handle:
            self.assertEqual(len(json.load(handle)['requests']), 2)

        output = self.run_command('--undo', self.snapshot)

        self.assertIn('Restored 2 request(s)', output)
        self.assertEqual(self.refreshed(self.old_pending).status, Status.PENDING)
        self.assertEqual(self.refreshed(self.old_approved).status, Status.APPROVED)
        self.assertEqual(ItemIssue.objects.count(), 0)
        self.phenyl.refresh_from_db()
        self.assertEqual(self.phenyl.reserved_quantity, 30)
        self.assertEqual(HKStockRequest.objects.get(inventory_request=self.old_approved).status, 'approved')

    def test_undo_keeps_an_issue_that_staff_have_already_reported_usage_on(self):
        self.apply()
        issue = self.refreshed(self.old_pending).issue
        ItemUsageLog.objects.create(issue=issue, quantity_used=Decimal(3), purpose='used', logged_by=self.caretaker)

        output = self.run_command('--undo', self.snapshot)

        self.assertIn('Restored 1 request(s); skipped 1', output)
        self.assertEqual(self.refreshed(self.old_pending).status, Status.ISSUED)
        self.assertEqual(self.refreshed(self.old_approved).status, Status.APPROVED)

    def test_it_needs_a_cutoff_and_an_issuer(self):
        with self.assertRaises(CommandError):
            self.run_command()
        User.objects.filter(role__in=['hk_inventory_manager', 'admin']).update(is_active=False)
        with self.assertRaises(CommandError):
            self.apply()
        self.assertEqual(self.refreshed(self.old_pending).status, Status.PENDING)
