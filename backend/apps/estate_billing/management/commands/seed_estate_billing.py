import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.estate_billing.billing_master_data import (
    DEFAULT_PASSWORD,
    ensure_master_shops_and_contractors,
    populate_baseline_bills,
    reconcile_master_data,
)
from apps.estate_billing.models import Contractor, EstateSettings, Shop
from apps.estate_billing.views import ensure_cycle_notes

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Seed initial master data for Estate Billing (shops, contractors, settings, portal account). '
        'By default this is safe to re-run: it only fills EMPTY tables and never edits or deletes data. '
        'Use --reconcile and --with-baseline-bills for the explicit, opt-in actions.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--reconcile',
            action='store_true',
            help='Remove contractors that were saved as shops by mistake and add any missing official '
                 'shop/contractor (matched by name). Does not edit existing rows or touch bills.',
        )
        parser.add_argument(
            '--with-baseline-bills',
            action='store_true',
            help='Fill the still-EMPTY demand notes of --cycle with the baseline figures in '
                 'billing_master_data.py. Notes that already have data are never changed.',
        )
        parser.add_argument(
            '--cycle',
            default='2026-10',
            help='Cycle (YYYY-MM) used by --with-baseline-bills. Default: 2026-10.',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Estate Billing seed...'))

        # 1. Settings
        settings = EstateSettings.get_settings()
        self.stdout.write(f'  [OK] Estate settings initialized (Prefix: {settings.get_effective_prefix()})')

        # 2. Portal User: estate.office
        estate_user, created = User.objects.get_or_create(
            username='estate.office',
            defaults={
                'first_name': 'Estate',
                'last_name': 'Office',
                'email': 'estateoffice@iitgn.ac.in',
                'phone': '07923951150',
                'role': 'estate_office',
            }
        )
        if created:
            estate_user.set_password(DEFAULT_PASSWORD)
            estate_user.is_staff = True
            estate_user.save()
            self.stdout.write(f'  [OK] Created login: estate.office / {DEFAULT_PASSWORD}')
        else:
            if estate_user.role != 'estate_office':
                estate_user.role = 'estate_office'
                estate_user.save(update_fields=['role'])
            self.stdout.write('  [OK] Login estate.office exists.')

        # 3. Master shops / contractors (only fills empty tables)
        ensure_master_shops_and_contractors()
        self.stdout.write(f'  [OK] Shops: {Shop.objects.count()} | Contractors: {Contractor.objects.count()}')

        # 4. Optional, explicit repair
        if options['reconcile']:
            summary = reconcile_master_data()
            self.stdout.write(
                f"  [RECONCILE] removed rogue shops: {summary['removed_rogue_shops'] or 'none'} | "
                f"added shops: {summary['created_shops'] or 'none'} | "
                f"added contractors: {summary['created_contractors'] or 'none'}"
            )

        # 5. Current cycle notes
        current_cycle = datetime.date.today().strftime('%Y-%m')
        ensure_cycle_notes(current_cycle)
        self.stdout.write(f'  [OK] Demand notes ensured for cycle {current_cycle}')

        # 6. Optional, explicit baseline bills (never overwrites a note that has data)
        if options['with_baseline_bills']:
            cycle = options['cycle']
            ensure_cycle_notes(cycle)
            summary = populate_baseline_bills(cycle)
            self.stdout.write(f'  [BASELINE {cycle}] {summary}')
        else:
            self.stdout.write('  [INFO] Baseline bills not applied (use --with-baseline-bills to apply them).')

        self.stdout.write(self.style.SUCCESS('\n[SUCCESS] Estate Billing seed completed successfully!'))
