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
    {'sl': 1, 'name': '2 Degree Café (Hybred Energy Solution Pvt. Ltd)', 'water': Decimal('640.00'), 'address': 'Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'},
    {'sl': 2, 'name': 'Brahmani Veg Solutions', 'water': Decimal('0.00'), 'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar'},
    {'sl': 3, 'name': 'The Branch Manager Canara Bank', 'water': Decimal('320.00'), 'address': 'IIT Gandhinagar Branch\nCentral Arcade Building\nIIT Gandhinagar Campus\nPalaj – 382 355, Gandhinagar'},
    {'sl': 4, 'name': 'Go Insta Cafe', 'water': Decimal('320.00'), 'address': 'Shop No.103, Hiqom Hostel\nIIT Gandhinagar\nPalaj - 382 355, Gandhinagar'},
    {'sl': 5, 'name': 'Indus Towers', 'water': Decimal('0.00'), 'address': 'Sports Complex'},
    {'sl': 6, 'name': 'Just Chill', 'water': Decimal('320.00'), 'address': 'Shop No-101, Beaukii Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 7, 'name': 'Krupa Generals (Provisional Store)', 'water': Decimal('0.00'), 'address': 'Shop No-111, Duven Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 8, 'name': 'Mahavir Healthy Foods', 'water': Decimal('320.00'), 'address': 'Shop No-101, Emiet Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 9, 'name': 'Maruti Xerox & Stationery', 'water': Decimal('0.00'), 'address': 'Ground Floor, Academic Block- 03\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 10, 'name': 'Midas Touch - Family Salon', 'water': Decimal('320.00'), 'address': 'Shop No-153, Aibban Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 11, 'name': 'N Root Enterprise', 'water': Decimal('0.00'), 'address': 'Shop No-103, Chimair Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 12, 'name': 'Pooja Stationery', 'water': Decimal('0.00'), 'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar'},
    {'sl': 13, 'name': 'Post Office', 'water': Decimal('0.00'), 'address': 'Gandhinagar Division, Gandhinagar - 382 010'},
    {'sl': 14, 'name': 'Post Office (WC)', 'fixed': True, 'water': Decimal('320.00'), 'address': 'Gandhinagar Division, Gandhinagar - 382 010'},
    {'sl': 15, 'name': 'Safety Laundry', 'water': Decimal('0.00'), 'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar'},
    {'sl': 16, 'name': 'Tea Post Pvt. Ltd.', 'water': Decimal('320.00'), 'address': 'Shop No-103, Emiet Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 17, 'name': 'South Point', 'water': Decimal('320.00'), 'address': 'Shop No-103, Chimair Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar'},
    {'sl': 18, 'name': 'Short Circuit', 'water': Decimal('0.00'), 'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar'},
    {'sl': 19, 'name': 'Vendooz', 'water': Decimal('0.00'), 'address': 'Hostel and Academic Block\nIIT Gandhinagar'},
    {'sl': 20, 'name': 'JRV Hospitality Services LLP (Hunger Games)', 'water': Decimal('320.00'), 'address': 'Academic Block No-8,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'},
    {'sl': 21, 'name': 'Jay Ambe Supermarkets Limited', 'water': Decimal('320.00'), 'address': 'Hall No 1 & 2, Central Arcade\nIIT Gandhinagar'},
    {'sl': 22, 'name': 'Apollo Pharmacies Limited', 'water': Decimal('0.00'), 'address': '23,24 Shayona Silver Estate, Nr Silver Oak Club,Opp.BPC Mixer Plant,Gota, Ahmedabad, Ahmedabad, Gujarat, 382481'},
    {'sl': 23, 'name': 'Priyanshi Corporation (Mr. Sandwhich- Hostel)', 'water': Decimal('320.00'), 'address': 'A/2 Om Society, Near Bharat Party Polt, NH-08, Rabari Colony, Amraiwadi, Ahmedabad-380026.'},
    {'sl': 24, 'name': 'Mystique Aroma - Nescafe (Hostel area and Academics)', 'water': Decimal('640.00'), 'address': 'Omakar Colony, Lane No 2, 60 ft Ring Road, Pimpal, Gurav,, Pune, PCMC, Ward No 29, Maharashtra-411061'},
    {'sl': 25, 'name': 'Naira Hospitality LLP', 'water': Decimal('320.00'), 'address': 'LABDHI IND ESTATE, 7, TEJAB MILL COMPUND VDR, ,, VADODARA, Vadodara, Gujarat, 391760'},
    {'sl': 26, 'name': 'Regent Hospitalities Services LLP (Mahi Food Junction)', 'water': Decimal('1120.00'), 'address': 'E1-704, Angan, S G Highway, Adani Shantigram, Ahmedabad-382421'},
    {'sl': 27, 'name': 'Zayka-e-Adda', 'water': Decimal('227.50'), 'address': 'RB-19/103, IIT Gandhinagar'},
    {'sl': 28, 'name': 'Coffee Day Global Limited (Cafe Coffee Day)', 'fixed': True, 'water': Decimal('320.00'), 'address': 'No 165, R.V. Road (Near Minerva Circle), Bangalore 560004'},
    {'sl': 29, 'name': 'Go Amrut Dairy and Food Products LLP', 'fixed': True, 'water': Decimal('320.00'), 'address': 'Shed No. 43, Akshat Industrial Park, Nr. Naroda Railway Crossing, Naroda, Ahmedabad, Ahmedabad, Gujarat, 382330'},
]

SEED_CONTRACTORS = [
    {
        'sl': 1,
        'name': 'M/s. Globe Civil Projects Pvt Ltd.',
        'to_line': 'CPWD (M/s. Globe Civil Projects Pvt Ltd.)',
        'intro': CPWD_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'meters': [{'label': 'Old borewell', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 2,
        'name': 'M/s. ADANI NEW INDUSTRIES LIMITED',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'meters': [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 3,
        'name': 'Gujarat Co-operative Milk Marketing Federation Limited. (Unit - Amulfed Dairy, Gandhinagar)',
        'to_line': 'The Incharge, Amul Parlour',
        'intro': CONTRACTOR_INTRO,
        'address': 'Shop No.109, Hostel Block Duven\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'meters': [{'label': 'Shop No.109, Hostel Block Duven', 'current': '749', 'previous': '0', 'rate': 9.55}],
    },
    {
        'sl': 4,
        'name': 'M/s. New Age Education and Skills Foundation',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'meters': [{'label': 'VRV connection - Research Park', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 5,
        'name': 'M/s. Summit Digital',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'meters': [{'label': 'Jio Mobile Tower', 'current': '', 'previous': '', 'rate': 9.55}],
    },
    {
        'sl': 6,
        'name': 'Haier Smart Solution Private Limited',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
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
