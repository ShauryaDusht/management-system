import datetime
import json
import os
from collections import Counter, defaultdict
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.inventory.models import Item, ItemIssue, ItemRequest, ItemUsageLog

USAGE_PURPOSE = 'Marked complete: stock issued before the cut-off, no longer tracked'
USAGE_NOTE = 'Cleared in a clean-up. Stock counts were not changed.'


class Command(BaseCommand):
    help = (
        'Mark the usage of old housekeeping consumable stock as complete, so staff are not blocked from requesting '
        'an item again by usage they never reported. For every issue made before --before that still has unreported '
        'quantity, one usage entry for the remaining quantity is recorded, dated the day it was issued. Stock counts '
        'are not changed. Lists only; pass --apply to change anything. --undo FILE removes exactly those entries.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--before', help='Complete issues made before this date (YYYY-MM-DD).')
        parser.add_argument('--apply', action='store_true', help='Write the changes instead of only listing them.')
        parser.add_argument('--snapshot', help='Where to write the snapshot (default: /app/backups/usage_completed_<time>.json).')
        parser.add_argument('--undo', metavar='SNAPSHOT_FILE', help='Remove the usage entries listed in a snapshot file.')

    def handle(self, *args, **options):
        if options['undo']:
            return self.undo(options['undo'])
        if not options['before']:
            raise CommandError('Give --before YYYY-MM-DD.')

        pending = self.select(options['before'])
        self.report(pending)
        if not pending:
            return
        if not options['apply']:
            self.stdout.write('\nNothing changed. Re-run with --apply to mark these as used.')
            return

        path = options['snapshot'] or os.path.join(
            '/app/backups', f'usage_completed_{timezone.localtime().strftime("%Y-%m-%d_%H-%M-%S")}.json')
        done = self.apply(pending, path)
        self.stdout.write(self.style.SUCCESS(f'\nMarked {done} issue(s) as fully used. Snapshot: {path}'))
        self.stdout.write(f'To remove those entries again: --undo {path}')

    def select(self, before):
        try:
            cutoff = timezone.make_aware(datetime.datetime.combine(
                datetime.date.fromisoformat(before), datetime.time.min))
        except ValueError:
            raise CommandError('--before must look like 2026-10-01.')
        used = {row['issue']: row['total'] for row in ItemUsageLog.objects.values('issue').annotate(total=Sum('quantity_used'))}
        issues = (
            ItemIssue.objects
            .filter(issued_at__lt=cutoff, is_reversed=False, request__purpose__startswith='[HK',
                    request__item__item_type=Item.ItemType.CONSUMABLE)
            .exclude(request__status=ItemRequest.Status.REJECTED)
            .select_related('request__item', 'request__requested_by')
            .order_by('issued_at', 'id')
        )
        result = []
        for issue in issues:
            remaining = Decimal(issue.issued_quantity) - (used.get(issue.id) or Decimal(0))
            if remaining > 0:
                result.append((issue, remaining))
        return result

    def report(self, pending):
        self.stdout.write(f'{len(pending)} issue(s) with unreported usage would be marked as fully used.')
        if not pending:
            return
        for month, count in sorted(Counter(i.issued_at.strftime('%Y-%m') for i, _ in pending).items()):
            self.stdout.write(f'  {month}  {count}')
        people = Counter((i.request.requested_by.get_full_name() or i.request.requested_by.username) for i, _ in pending)
        self.stdout.write('  most affected: ' + ', '.join(f'{name} {n}' for name, n in people.most_common(6)))
        pairs = {(i.request.requested_by_id, i.request.item_id) for i, _ in pending}
        self.stdout.write(f'  staff-and-item pairs this can unblock: {len(pairs)}')
        self.stdout.write('  stock counts: unchanged')

    def apply(self, pending, path):
        User = get_user_model()
        logger = (
            User.objects.filter(role='hk_inventory_manager', is_active=True).order_by('id').first()
            or User.objects.filter(role='admin', is_active=True).order_by('id').first()
        )
        if not logger:
            raise CommandError('No active HK inventory manager or admin to record the entries under.')

        entries = [{'issue_id': issue.id, 'quantity': str(remaining)} for issue, remaining in pending]
        # the snapshot goes to disk before anything is changed
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump({'created': timezone.now().isoformat(), 'issues': entries}, handle)

        with transaction.atomic():
            for issue, remaining in pending:
                log = ItemUsageLog.objects.create(
                    issue=issue, quantity_used=remaining, purpose=USAGE_PURPOSE, notes=USAGE_NOTE, logged_by=logger)
                # logged_at is stamped on creation: put it on the day the stock was issued
                ItemUsageLog.objects.filter(pk=log.pk).update(logged_at=issue.issued_at)
        return len(pending)

    def undo(self, path):
        with open(path, encoding='utf-8') as handle:
            issue_ids = [entry['issue_id'] for entry in json.load(handle)['issues']]
        with transaction.atomic():
            removed, _ = ItemUsageLog.objects.filter(issue_id__in=issue_ids, purpose=USAGE_PURPOSE).delete()
        self.stdout.write(self.style.SUCCESS(f'Removed {removed} usage entr{"y" if removed == 1 else "ies"}.'))
