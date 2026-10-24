import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from apps.estate_billing.models import (
    EstateSettings,
    BillingCycle,
    Shop,
    Contractor,
)
from apps.estate_billing.views import ensure_cycle_notes

User = get_user_model()
from apps.estate_billing.billing_master_data import (
    DEFAULT_PASSWORD,
    DEFAULT_ADDRESS,
    CONTRACTOR_ADDRESS,
    CONTRACTOR_INTRO,
    CPWD_INTRO,
    SEED_SHOPS,
    SEED_CONTRACTORS,
    CONTRACTOR_DEFAULT_METERS,
    ensure_master_shops_and_contractors,
)



class Command(BaseCommand):
    help = 'Seed initial master data for Estate Billing (shops, contractors, settings, portal account).'

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

        # 1. Run master reconciliation and data population
        ensure_master_shops_and_contractors(force=True)
        self.stdout.write(f'  [OK] Shops reconciled: {Shop.objects.count()}')
        self.stdout.write(f'  [OK] Contractors reconciled: {Contractor.objects.count()}')

        # 2. Ensure current cycle notes
        current_cycle = datetime.date.today().strftime('%Y-%m')
        ensure_cycle_notes(current_cycle)
        self.stdout.write(f'  [OK] Demand notes ensured for cycle {current_cycle}')

        self.stdout.write(self.style.SUCCESS('\n[SUCCESS] Estate Billing seed completed successfully!'))
