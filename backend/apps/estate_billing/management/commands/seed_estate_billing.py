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
DEFAULT_PASSWORD = 'IITGN@2025'

DEFAULT_ADDRESS = 'Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'
CONTRACTOR_ADDRESS = 'IITGN Project Circle, Palaj\nGandhinagar-382355'
CONTRACTOR_INTRO = 'Reimbursement of power consumption charges borne by the Institute for utilization of the premises:'
CPWD_INTRO = 'Reimbursement of power consumption charges borne by the Institute for utilization of the premises occupied by the contractor working under CPWD:'

SEED_SHOPS = [
    {'sl': 1, 'name': '2 Degree Café (Hybred Energy Solution Pvt. Ltd)'},
    {'sl': 2, 'name': 'Brahmani Veg Solutions'},
    {'sl': 3, 'name': 'The Branch Manager Canara Bank'},
    {'sl': 4, 'name': 'Gujarat Co-operative Milk Marketing Federation Limited.'},
    {'sl': 5, 'name': 'Go Insta Cafe'},
    {'sl': 6, 'name': 'Indus Towers'},
    {'sl': 7, 'name': 'Just Chill'},
    {'sl': 8, 'name': 'Krupa Generals (Provisional Store)'},
    {'sl': 9, 'name': 'Mahavir Healthy Foods'},
    {'sl': 10, 'name': 'Maruti Xerox & Stationery'},
    {'sl': 11, 'name': 'Midas Touch - Family Salon'},
    {'sl': 12, 'name': 'N Root Enterprise'},
    {'sl': 13, 'name': 'Pooja Stationery'},
    {'sl': 14, 'name': 'Post Office'},
    {'sl': 15, 'name': 'Post Office (WC)', 'fixed': True},
    {'sl': 16, 'name': 'Safety Laundry'},
    {'sl': 17, 'name': 'Tea Post Pvt. Ltd.'},
    {'sl': 18, 'name': 'South Point'},
    {'sl': 19, 'name': 'Short Circuit'},
    {'sl': 20, 'name': 'Vendooz'},
    {'sl': 21, 'name': 'JRV Hospitality Services LLP (Hunger Games)'},
    {'sl': 22, 'name': 'Jay Ambe Supermarkets Limited'},
    {'sl': 23, 'name': 'Apollo Pharmacies Limited'},
    {'sl': 24, 'name': 'Priyanshi Corporation (Mr. Sandwhich- Hostel)'},
    {'sl': 25, 'name': 'Mystique Aroma - Nescafe (Hostel area and Academics)'},
    {'sl': 26, 'name': 'Naira Hospitality LLP'},
    {'sl': 27, 'name': 'Regent Hospitalities Services LLP (Mahi Food Junction)'},
    {'sl': 28, 'name': 'Zayka-e-Adda'},
    {'sl': 29, 'name': 'Coffee Day Global Limited (Cafe Coffee Day)', 'fixed': True},
]

SEED_CONTRACTORS = [
    {
        'sl': 1,
        'name': 'M/s. Globe Civil Projects Pvt Ltd.',
        'to_line': 'CPWD (M/s. Globe Civil Projects Pvt Ltd.)',
        'intro': CPWD_INTRO,
        'meters': [{'label': 'Old borewell', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 2,
        'name': 'M/s. ADANI NEW INDUSTRIES LIMITED',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'meters': [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 3,
        'name': 'M/s. New Age Education and Skills Foundation',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'meters': [{'label': 'VRV connection - Research Park', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 4,
        'name': 'M/s. Summit Digital',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'meters': [{'label': 'Jio Mobile Tower', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 5,
        'name': 'Haier Smart Solution Private Limited',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'meters': [
            {'label': 'Student Lounge (Meter 1)', 'current': '', 'previous': '', 'rate': 20.0},
            {'label': 'Student Lounge (Meter 2)', 'current': '', 'previous': '', 'rate': 9.55},
        ],
    },
]


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
                    'default_water': Decimal('320.00'),
                    'is_active': True,
                }
            )
            if was_created:
                shops_created += 1
            else:
                shop.name = data['name']
                shop.fixed = data.get('fixed', False)
                shop.save(update_fields=['name', 'fixed'])

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
