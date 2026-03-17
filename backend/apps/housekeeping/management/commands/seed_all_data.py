from io import StringIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKArea, HKScheduleTemplate, HKUserArea, HKWorker


class Command(BaseCommand):
    help = (
        'Bootstrap complete shared dataset for teammates: '
        'inventory fixtures + housekeeping seed (+ optional fixture dump).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dump-fixtures',
            action='store_true',
            help='Also refresh backend/fixtures/users_hk.json and backend/fixtures/housekeeping.json in UTF-8.',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting full data bootstrap...'))

        call_command('loaddata', 'apps/inventory/fixtures/inventory.json', verbosity=0)
        self.stdout.write(self.style.SUCCESS('  [OK] Inventory fixture loaded'))

        call_command('seed_housekeeping', verbosity=0)
        self.stdout.write(self.style.SUCCESS('  [OK] Housekeeping/users seeded'))

        call_command('update_inventory_items', verbosity=0)
        self.stdout.write(self.style.SUCCESS('  [OK] Inventory item codes/costs updated'))

        call_command('sync_real_inventory_stock', quiet=True)
        self.stdout.write(self.style.SUCCESS('  [OK] Real inventory stock baseline synced'))

        call_command('sync_monthly_purchase_plans', quiet=True)
        self.stdout.write(self.style.SUCCESS('  [OK] Monthly purchase plans synced'))

        if options.get('dump_fixtures'):
            self._dump_fixtures()
            self.stdout.write(self.style.SUCCESS('  [OK] UTF-8 fixtures refreshed'))

        User = get_user_model()
        self.stdout.write(self.style.SUCCESS(
            '\n'.join([
                'BOOTSTRAP COMPLETE',
                f'  Users:           {User.objects.count()}',
                f'  HK Areas:        {HKArea.objects.count()}',
                f'  HK User-Areas:   {HKUserArea.objects.count()}',
                f'  HK Workers:      {HKWorker.objects.count()}',
                f'  HK Templates:    {HKScheduleTemplate.objects.count()}',
            ])
        ))

    def _dump_fixtures(self):
        fixtures_dir = settings.BASE_DIR / 'fixtures'
        fixtures_dir.mkdir(parents=True, exist_ok=True)

        hk_buffer = StringIO()
        call_command('dumpdata', 'housekeeping', indent=2, stdout=hk_buffer)
        (fixtures_dir / 'housekeeping.json').write_text(hk_buffer.getvalue(), encoding='utf-8')

        users_buffer = StringIO()
        call_command('dumpdata', 'users', indent=2, stdout=users_buffer)
        (fixtures_dir / 'users_hk.json').write_text(users_buffer.getvalue(), encoding='utf-8')

