import datetime
import os
import tempfile
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone

from apps.inventory.management.commands.mark_old_usage_complete import USAGE_PURPOSE
from apps.inventory.models import Category, Item, ItemIssue, ItemRequest, ItemUsageLog
from apps.inventory.request_permissions import get_unaccounted_item_quantity

User = get_user_model()


def when(year, month, day):
    return timezone.make_aware(datetime.datetime(year, month, day, 12, 0))


class MarkOldUsageCompleteTests(TestCase):
    def setUp(self):
        self.caretaker = User.objects.create_user(username='usage_caretaker', password='x', role='caretaker')
        category = Category.objects.create(name='Cleaning Supplies')
        self.phenyl = Item.objects.create(
            name='Phenyl', category=category, item_type=Item.ItemType.CONSUMABLE,
            total_quantity=100, available_quantity=80, unit='Ltr')
        self.mop = Item.objects.create(
            name='Dry Mop Set', category=category, item_type=Item.ItemType.ASSET,
            total_quantity=10, available_quantity=8, unit='Each')

        def issue(item, day, quantity=10, status=ItemRequest.Status.ISSUED, purpose='[HK - Aibaan] stock'):
            request = ItemRequest.objects.create(
                item=item, requested_by=self.caretaker, quantity_requested=quantity, units_remaining=50,
                purpose=purpose, status=status)
            ItemRequest.objects.filter(pk=request.pk).update(requested_at=day)
            record = ItemIssue.objects.create(
                request=request, issued_by=self.caretaker, issued_quantity=quantity, original_quantity=quantity)
            ItemIssue.objects.filter(pk=record.pk).update(issued_at=day)
            record.refresh_from_db()
            return record

        self.june = issue(self.phenyl, when(2026, 6, 24), quantity=10)
        self.partly_used = issue(self.phenyl, when(2026, 7, 5), quantity=8)
        ItemUsageLog.objects.create(issue=self.partly_used, quantity_used=Decimal(3), purpose='cleaning', logged_by=self.caretaker)
        self.october = issue(self.phenyl, when(2026, 10, 23), quantity=6)
        self.asset = issue(self.mop, when(2026, 8, 1), quantity=1)
        self.rejected = issue(self.phenyl, when(2026, 8, 2), quantity=4, status=ItemRequest.Status.REJECTED)
        self.horticulture = issue(self.phenyl, when(2026, 8, 3), quantity=4, purpose='[Horticulture - Zone A] lawn')
        self.snapshot = os.path.join(tempfile.mkdtemp(), 'snapshot.json')

    def run_command(self, *args):
        out = StringIO()
        call_command('mark_old_usage_complete', *args, stdout=out)
        return out.getvalue()

    def apply(self):
        return self.run_command('--before', '2026-10-01', '--apply', '--snapshot', self.snapshot)

    def used(self, issue):
        return ItemUsageLog.objects.filter(issue=issue).aggregate(t=Sum('quantity_used'))['t']

    def test_a_dry_run_changes_nothing(self):
        output = self.run_command('--before', '2026-10-01')

        self.assertIn('2 issue(s) with unreported usage would be marked as fully used', output)
        self.assertIn('Nothing changed', output)
        self.assertEqual(ItemUsageLog.objects.count(), 1)

    def test_the_remaining_quantity_is_recorded_on_the_day_the_stock_was_issued(self):
        self.apply()

        self.assertEqual(self.used(self.june), Decimal('10'))
        self.assertEqual(self.used(self.partly_used), Decimal('8'))          # 3 already reported + 5 recorded
        log = ItemUsageLog.objects.get(issue=self.june)
        self.assertEqual(log.quantity_used, Decimal('10'))
        self.assertEqual(log.logged_at, self.june.issued_at)                  # not today
        self.assertEqual(log.purpose, USAGE_PURPOSE)

    def test_only_old_housekeeping_consumables_are_touched(self):
        self.apply()

        self.assertIsNone(self.used(self.october))
        self.assertIsNone(self.used(self.asset))
        self.assertIsNone(self.used(self.rejected))
        self.assertIsNone(self.used(self.horticulture))

    def test_staff_are_no_longer_blocked_by_the_old_stock_but_october_still_counts(self):
        # 10 + 5 (old), 6 (October) and 4 (a horticulture issue, which this tool leaves alone)
        self.assertEqual(get_unaccounted_item_quantity(self.caretaker, self.phenyl), Decimal('25'))

        self.apply()

        self.assertEqual(get_unaccounted_item_quantity(self.caretaker, self.phenyl), Decimal('10'))   # October + horticulture

    def test_stock_counts_do_not_change(self):
        self.apply()

        self.phenyl.refresh_from_db()
        self.assertEqual((self.phenyl.total_quantity, self.phenyl.available_quantity), (100, 80))

    def test_running_it_twice_finds_nothing_more(self):
        self.apply()
        self.assertIn('0 issue(s)', self.run_command('--before', '2026-10-01'))

    def test_undo_removes_only_the_entries_it_made(self):
        self.apply()

        output = self.run_command('--undo', self.snapshot)

        self.assertIn('Removed 2 usage entries', output)
        self.assertEqual(ItemUsageLog.objects.count(), 1)                     # the staff member's own entry stays
        self.assertEqual(self.used(self.partly_used), Decimal('3'))

    def test_it_needs_a_cutoff(self):
        with self.assertRaises(CommandError):
            self.run_command()
