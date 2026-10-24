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

        # 3. Seed Shops
        shops_created = 0
        for data in SEED_SHOPS:
            shop, was_created = Shop.objects.get_or_create(
                sl=data['sl'],
                defaults={
                    'name': data['name'],
                    'address': DEFAULT_ADDRESS,
                    'fixed': data.get('fixed', False),
                    'default_rate': Decimal('9.55'),
                    'default_water': data.get('water', Decimal('320.00')),
                    'is_active': True,
                }
            )
            if was_created:
                shops_created += 1
            else:
                shop.name = data['name']
                shop.fixed = data.get('fixed', False)
                shop.default_water = data.get('water', Decimal('320.00'))
                shop.save(update_fields=['name', 'fixed', 'default_water'])

        self.stdout.write(f'  [OK] Shops: {Shop.objects.count()} (created: {shops_created})')

        # 4. Seed Contractors
        contractors_created = 0
        for data in SEED_CONTRACTORS:
            contractor, was_created = Contractor.objects.get_or_create(
                sl=data['sl'],
                defaults={
                    'name': data['name'],
                    'to_line': data.get('to_line', ''),
                    'address': CONTRACTOR_ADDRESS,
                    'intro': data.get('intro', CONTRACTOR_INTRO),
                    'is_active': True,
                }
            )
            if was_created:
                contractors_created += 1

        self.stdout.write(f'  [OK] Contractors: {Contractor.objects.count()} (created: {contractors_created})')

        # 5. Initialize current billing cycle notes
        current_cycle = datetime.date.today().strftime('%Y-%m')
        ensure_cycle_notes(current_cycle)
        self.stdout.write(f'  [OK] Demand notes ensured for cycle {current_cycle}')

        self.stdout.write(self.style.SUCCESS('\n[SUCCESS] Estate Billing seed completed successfully!'))
