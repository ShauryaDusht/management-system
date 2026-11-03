import datetime
import json
import os
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F, Value
from django.db.models.functions import Greatest
from django.utils import timezone

from django.contrib.auth import get_user_model

from apps.housekeeping.models import HKStockRequest
from apps.inventory.models import Item, ItemIssue, ItemRequest

Status = ItemRequest.Status
ISSUE_NOTE = 'Completed from an old request: issued as of the request date, stock count not changed.'


class Command(BaseCommand):
    help = (
        'Complete old housekeeping inventory requests that were never issued (an earlier version of the app '
        'approved them but could not issue them). Pending or approved requests made before --before become '
        'Issued, dated the day they were requested, with a normal issue record so staff can report usage. '
        'Stock counts are NOT changed and nobody is notified; the stock an approval had held back (reserved) is '
        'released. Lists only; pass --apply to change anything. A snapshot file is written first and --undo FILE '
        'restores from it (issue records that already have usage logged are kept).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--before', help='Complete requests made before this date (YYYY-MM-DD).')
        parser.add_argument('--apply', action='store_true', help='Write the changes instead of only listing them.')
        parser.add_argument('--snapshot', help='Where to write the snapshot (default: /app/backups/completed_requests_<time>.json).')
        parser.add_argument('--undo', metavar='SNAPSHOT_FILE', help='Restore the requests listed in a snapshot file.')

    def handle(self, *args, **options):
        if options['undo']:
            return self.undo(options['undo'])
        if not options['before']:
            raise CommandError('Give --before YYYY-MM-DD.')

        requests = self.select(options['before'])
        self.report(requests)
        if not requests:
            return
        if not options['apply']:
            self.stdout.write('\nNothing changed. Re-run with --apply to complete these requests.')
            return

        path = options['snapshot'] or os.path.join(
            '/app/backups', f'completed_requests_{timezone.localtime().strftime("%Y-%m-%d_%H-%M-%S")}.json')
        done = self.apply(requests, path)
        self.stdout.write(self.style.SUCCESS(f'\nCompleted {done} request(s). Snapshot: {path}'))
        self.stdout.write(f'To put them back: --undo {path}')

    def select(self, before):
        try:
            cutoff = timezone.make_aware(datetime.datetime.combine(
                datetime.date.fromisoformat(before), datetime.time.min))
        except ValueError:
            raise CommandError('--before must look like 2026-10-01.')
        return list(
            ItemRequest.objects
            .filter(purpose__startswith='[HK', status__in=[Status.PENDING, Status.APPROVED], requested_at__lt=cutoff)
            .select_related('item', 'requested_by').order_by('requested_at', 'id')
        )

    def report(self, requests):
        self.stdout.write(f'{len(requests)} housekeeping request(s) would be completed.')
        if not requests:
            return
        for (month, status), count in sorted(Counter((r.requested_at.strftime('%Y-%m'), r.status) for r in requests).items()):
            self.stdout.write(f'  {month}  {status:<9} {count}')
        people = Counter((r.requested_by.get_full_name() or r.requested_by.username) for r in requests)
        self.stdout.write('  most affected: ' + ', '.join(f'{name} {n}' for name, n in people.most_common(6)))
        released = defaultdict(int)
        for r in requests:
            if r.status == Status.APPROVED:
                for line in r.requisition_lines():
                    released[line.inventory_item.name] += line.quantity
        if released:
            top = sorted(released.items(), key=lambda kv: -kv[1])[:6]
            self.stdout.write(f'  held-back stock released: {sum(released.values())} units, e.g. ' +
                              ', '.join(f'{name} {qty}' for name, qty in top))
        self.stdout.write('  stock counts: unchanged')

    def apply(self, requests, path):
        entries = []
        for r in requests:
            hk = HKStockRequest.objects.filter(inventory_request=r).first()
            entries.append({
                'id': r.id,
                'status': r.status,
                'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None,
                'released': [[line.inventory_item_id, line.quantity] for line in r.requisition_lines()]
                if r.status == Status.APPROVED else [],
                'hk_status': hk.status if hk else None,
            })
        # the snapshot goes to disk before anything is changed
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump({'created': timezone.now().isoformat(), 'requests': entries}, handle)

        User = get_user_model()
        fallback_issuer = (
            User.objects.filter(role='hk_inventory_manager', is_active=True).order_by('id').first()
            or User.objects.filter(role='admin', is_active=True).order_by('id').first()
        )
        if not fallback_issuer:
            raise CommandError('No active HK inventory manager or admin to record as the issuer.')

        ids = [e['id'] for e in entries]
        with transaction.atomic():
            for entry in entries:
                for item_id, quantity in entry['released']:
                    Item.objects.filter(pk=item_id).update(
                        reserved_quantity=Greatest(F('reserved_quantity') - quantity, Value(0)))
            for request in requests:
                issue = ItemIssue.objects.create(
                    request=request,
                    issued_by=request.approved_by or fallback_issuer,
                    issued_quantity=request.quantity_requested,
                    original_quantity=request.quantity_requested,
                    notes=ISSUE_NOTE,
                )
                # issued_at is stamped on creation: put it back to the day the request was made
                ItemIssue.objects.filter(pk=issue.pk).update(issued_at=request.requested_at)
            ItemRequest.objects.filter(pk__in=ids).update(status=Status.ISSUED, reviewed_at=F('requested_at'))
            HKStockRequest.objects.filter(inventory_request_id__in=ids).update(status='issued')
        return len(ids)

    def undo(self, path):
        with open(path, encoding='utf-8') as handle:
            entries = json.load(handle)['requests']
        restored = skipped = 0
        with transaction.atomic():
            for entry in entries:
                request = ItemRequest.objects.select_for_update().filter(pk=entry['id']).first()
                issue = getattr(request, 'issue', None) if request else None
                # only our own record, and only while nobody has reported usage on it
                if (not request or request.status != Status.ISSUED or not issue
                        or issue.notes != ISSUE_NOTE or issue.usage_logs.exists()):
                    skipped += 1
                    continue
                issue.delete()
                request = ItemRequest.objects.get(pk=entry['id'])
                request.status = entry['status']
                request.reviewed_at = (
                    datetime.datetime.fromisoformat(entry['reviewed_at']) if entry['reviewed_at'] else None)
                request.save(update_fields=['status', 'reviewed_at'])
                for item_id, quantity in entry['released']:
                    Item.objects.filter(pk=item_id).update(reserved_quantity=F('reserved_quantity') + quantity)
                if entry['hk_status']:
                    HKStockRequest.objects.filter(inventory_request=request).update(status=entry['hk_status'])
                restored += 1
        self.stdout.write(self.style.SUCCESS(f'Restored {restored} request(s); skipped {skipped} (changed since).'))
