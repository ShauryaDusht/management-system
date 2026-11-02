from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKWorker
from apps.housekeeping.supervision import other_area_supervisor_id, stale_supervisor_workers


class Command(BaseCommand):
    help = (
        "Find workers whose supervisor is no longer assigned to the worker's area (left behind when a "
        "supervisor was moved to another area) and point them at the area's current supervisor, or clear "
        "it. Lists only; pass --apply to change anything."
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the changes instead of only listing them.')

    def handle(self, *args, **options):
        rows = list(stale_supervisor_workers().select_related('area', 'supervisor').order_by('area__name', 'name'))
        if not rows:
            self.stdout.write(self.style.SUCCESS('No workers with a stale supervisor.'))
            return

        for worker in rows:
            replacement_id = other_area_supervisor_id(worker.area_id, exclude_user_id=worker.supervisor_id)
            worker.replacement_id = replacement_id
            old_name = worker.supervisor.get_full_name() or worker.supervisor.username
            self.stdout.write(
                f'{worker.area.name:<28} {worker.name:<34} pay={worker.pay_code or "-":<6} '
                f'supervisor {old_name!r} -> {"user #" + str(replacement_id) if replacement_id else "(none)"}'
            )

        if not options['apply']:
            self.stdout.write(f'\n{len(rows)} worker(s) would change. Re-run with --apply to update them.')
            return

        for worker in rows:
            HKWorker.objects.filter(pk=worker.pk).update(supervisor_id=worker.replacement_id)
        self.stdout.write(self.style.SUCCESS(f'\nUpdated {len(rows)} worker(s).'))
