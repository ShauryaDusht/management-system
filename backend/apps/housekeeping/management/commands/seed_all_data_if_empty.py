from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.inventory.models import Item


class Command(BaseCommand):
    help = "Run seed_all_data only if inventory is empty."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dump-fixtures',
            action='store_true',
            help='Also refresh backend/fixtures/users_hk.json and backend/fixtures/housekeeping.json in UTF-8.',
        )

    def handle(self, *args, **options):
        if Item.objects.exists():
            self.stdout.write(self.style.WARNING(
                'Seed skipped: inventory data already exists.'
            ))
            return

        self.stdout.write(self.style.SUCCESS(
            'Inventory is empty. Running seed_all_data...'
        ))
        call_command('seed_all_data', dump_fixtures=options.get('dump_fixtures', False))
