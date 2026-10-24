import datetime
from decimal import Decimal
from django.contrib.auth import get_user_model

DEFAULT_PASSWORD = 'IITGN@2025'
DEFAULT_ADDRESS = 'Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'
CONTRACTOR_ADDRESS = 'IITGN Project Circle, Palaj\nGandhinagar-382355'
CONTRACTOR_INTRO = 'Reimbursement of power consumption charges borne by the Institute for utilization of the premises:'
CPWD_INTRO = 'Reimbursement of power consumption charges borne by the Institute for utilization of the premises occupied by the contractor working under CPWD:'

# 29 Pure Commercial Campus Shops (Zero overlap with Contractors)
MASTER_SHOPS_DATA = [
    {
        'sl': 1,
        'name': '2 Degree Café (Hybred Energy Solution Pvt. Ltd)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('640.00'),
        'address': 'Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355',
        'units': '1678',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('16665.00'),
    },
    {
        'sl': 2,
        'name': 'Brahmani Veg Solutions',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar',
        'units': '125',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('1194.00'),
    },
    {
        'sl': 3,
        'name': 'The Branch Manager Canara Bank',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'IIT Gandhinagar Branch\nCentral Arcade Building\nIIT Gandhinagar Campus\nPalaj – 382 355, Gandhinagar',
        'units': '2065',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('20041.00'),
    },
    {
        'sl': 4,
        'name': 'Go Insta Cafe',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No.103, Hiqom Hostel\nIIT Gandhinagar\nPalaj - 382 355, Gandhinagar',
        'units': '655',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('6575.00'),
    },
    {
        'sl': 5,
        'name': 'Indus Towers',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Sports Complex',
        'units': '3654',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('34896.00'),
    },
    {
        'sl': 6,
        'name': 'Just Chill',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No-101, Beaukii Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '371',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('3863.00'),
    },
    {
        'sl': 7,
        'name': 'Krupa Generals (Provisional Store)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Shop No-111, Duven Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '63',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('602.00'),
    },
    {
        'sl': 8,
        'name': 'Mahavir Healthy Foods',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No-101, Emiet Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '558',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('5649.00'),
    },
    {
        'sl': 9,
        'name': 'Maruti Xerox & Stationery',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Ground Floor, Academic Block- 03\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '72',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('688.00'),
    },
    {
        'sl': 10,
        'name': 'Midas Touch - Family Salon',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No-153, Aibban Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '364',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('3796.00'),
    },
    {
        'sl': 11,
        'name': 'N Root Enterprise',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Shop No-103, Chimair Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '1041',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('9942.00'),
    },
    {
        'sl': 12,
        'name': 'Pooja Stationery',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar',
        'units': '90',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('860.00'),
    },
    {
        'sl': 13,
        'name': 'Post Office',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Gandhinagar Division, Gandhinagar - 382 010',
        'units': '131',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('1251.00'),
    },
    {
        'sl': 14,
        'name': 'Post Office (WC)',
        'fixed': True,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Gandhinagar Division, Gandhinagar - 382 010',
        'units': '',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('320.00'),
    },
    {
        'sl': 15,
        'name': 'Safety Laundry',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar',
        'units': '17',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('162.00'),
    },
    {
        'sl': 16,
        'name': 'Tea Post Pvt. Ltd.',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No-103, Emiet Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '277',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('2965.00'),
    },
    {
        'sl': 17,
        'name': 'South Point',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shop No-103, Chimair Hostel Block\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'units': '60',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('893.00'),
    },
    {
        'sl': 18,
        'name': 'Short Circuit',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Central Arcade Building\nIIT Gandhinagar Campus\nPalaj, Gandhinagar',
        'units': '47',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('449.00'),
    },
    {
        'sl': 19,
        'name': 'Vendooz',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': 'Hostel and Academic Block\nIIT Gandhinagar',
        'units': '1707',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('16302.00'),
    },
    {
        'sl': 20,
        'name': 'JRV Hospitality Services LLP (Hunger Games)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Academic Block No-8,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355',
        'units': '1203',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('11809.00'),
    },
    {
        'sl': 21,
        'name': 'Jay Ambe Supermarkets Limited',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Hall No 1 & 2, Central Arcade\nIIT Gandhinagar',
        'units': '1391',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('13604.00'),
    },
    {
        'sl': 22,
        'name': 'Apollo Pharmacies Limited',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('0.00'),
        'address': '23,24 Shayona Silver Estate, Nr Silver Oak Club,Opp.BPC Mixer Plant,Gota, Ahmedabad, Ahmedabad, Gujarat, 382481',
        'units': '728',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('6952.00'),
    },
    {
        'sl': 23,
        'name': 'Priyanshi Corporation (Mr. Sandwhich- Hostel)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'A/2 Om Society, Near Bharat Party Polt, NH-08, Rabari Colony, Amraiwadi, Ahmedabad-380026.',
        'units': '63',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('922.00'),
    },
    {
        'sl': 24,
        'name': 'Mystique Aroma - Nescafe (Hostel area and Academics)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('640.00'),
        'address': 'Omakar Colony, Lane No 2, 60 ft Ring Road, Pimpal, Gurav,, Pune, PCMC, Ward No 29, Maharashtra-411061',
        'units': '1944',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('19205.00'),
    },
    {
        'sl': 25,
        'name': 'Naira Hospitality LLP',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'LABDHI IND ESTATE, 7, TEJAB MILL COMPUND VDR, ,, VADODARA, Vadodara, Gujarat, 391760',
        'units': '10',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('416.00'),
    },
    {
        'sl': 26,
        'name': 'Regent Hospitalities Services LLP (Mahi Food Junction)',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('1120.00'),
        'address': 'E1-704, Angan, S G Highway, Adani Shantigram, Ahmedabad-382421',
        'units': '1971',
        'date': '2026-11-03',
        'month': '2026-06',
        'month_to': '2026-10',
        'total_amount': Decimal('19943.00'),
    },
    {
        'sl': 27,
        'name': 'Zayka-e-Adda',
        'fixed': False,
        'rate': Decimal('9.55'),
        'water': Decimal('227.50'),
        'address': 'RB-19/103, IIT Gandhinagar',
        'units': '90',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('1087.00'),
    },
    {
        'sl': 28,
        'name': 'Coffee Day Global Limited (Cafe Coffee Day)',
        'fixed': True,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'No 165, R.V. Road (Near Minerva Circle), Bangalore 560004',
        'units': '',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('320.00'),
    },
    {
        'sl': 29,
        'name': 'Go Amrut Dairy and Food Products LLP',
        'fixed': True,
        'rate': Decimal('9.55'),
        'water': Decimal('320.00'),
        'address': 'Shed No. 43, Akshat Industrial Park, Nr. Naroda Railway Crossing, Naroda, Ahmedabad, Ahmedabad, Gujarat, 382330',
        'units': '',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'total_amount': Decimal('320.00'),
    },
]

# 6 Official Contractors (Zero overlap with Shops)
MASTER_CONTRACTORS_DATA = [
    {
        'sl': 1,
        'name': 'M/s. Globe Civil Projects Pvt Ltd.',
        'to_line': 'CPWD (M/s. Globe Civil Projects Pvt Ltd.)',
        'intro': CPWD_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'period_type': 'month',
        'meters': [{'label': 'Old Borewell', 'current': '15934', 'previous': '15912', 'rate': 9.6364}],
        'total_amount': Decimal('212.00'),
    },
    {
        'sl': 2,
        'name': 'M/s. ADANI NEW INDUSTRIES LIMITED',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'date': '2026-11-03',
        'month': '2026-06',
        'month_to': '2026-10',
        'period_type': 'range',
        'meters': [{'label': '', 'current': '12521', 'previous': '1847', 'rate': 9.55}],
        'total_amount': Decimal('101938.00'),
    },
    {
        'sl': 3,
        'name': 'Gujarat Co-operative Milk Marketing Federation Limited. (Unit - Amulfed Dairy, Gandhinagar)',
        'to_line': 'The Incharge, Amul Parlour',
        'intro': CONTRACTOR_INTRO,
        'address': 'Shop No.109, Hostel Block Duven\nIIT Gandhinagar Campus\nPalaj - 382 355\nGandhinagar',
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'period_type': 'month',
        'meters': [{'label': 'Shop No.109, Hostel Block Duven', 'current': '749', 'previous': '0', 'rate': 9.55}],
        'total_amount': Decimal('7153.00'),
    },
    {
        'sl': 4,
        'name': 'M/s. New Age Education and Skills Foundation',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'period_type': 'month',
        'meters': [{'label': 'VRV connection - Research Park', 'current': '', 'previous': '165652', 'rate': 9.55}],
        'total_amount': Decimal('0.00'),
    },
    {
        'sl': 5,
        'name': 'M/s. Summit Digital',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'date': '2026-11-03',
        'month': '2026-10',
        'month_to': '',
        'period_type': 'month',
        'meters': [{'label': 'Jio Mobile Tower', 'current': '', 'previous': '101047', 'rate': 9.55}],
        'total_amount': Decimal('0.00'),
    },
    {
        'sl': 6,
        'name': 'Haier Smart Solution Private Limited',
        'to_line': '',
        'intro': CONTRACTOR_INTRO,
        'address': CONTRACTOR_ADDRESS,
        'date': '2026-11-03',
        'month': '2026-08',
        'month_to': '2026-10',
        'period_type': 'range',
        'meters': [
            {'label': 'Student Lounge meter', 'current': '182', 'previous': '182', 'rate': 20.0},
            {'label': 'Student Lounge (Meter 2)', 'current': '716', 'previous': '0', 'rate': 9.55},
        ],
        'total_amount': Decimal('6838.00'),
    },
]

SEED_SHOPS = MASTER_SHOPS_DATA
SEED_CONTRACTORS = MASTER_CONTRACTORS_DATA

CONTRACTOR_DEFAULT_METERS = {
    c['sl']: c.get('meters', [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}])
    for c in MASTER_CONTRACTORS_DATA
}


def ensure_master_shops_and_contractors(force=False):
    """
    Auto-seeds and reconciles master shops and contractors:
    1. Removes any rogue contractor records mistakenly put in the Shop table from old commits.
    2. Ensures exactly the 29 official campus shops exist.
    3. Ensures exactly the 6 official contractors exist.
    4. Populates real baseline billing readings for cycle 2026-10 if notes are empty or 0.
    """
    from .models import Shop, Contractor, EstateSettings, BillingCycle, ShopDemandNote, ContractorDemandNote

    # Ensure EstateSettings exist
    settings = EstateSettings.get_settings()
    if force and settings.first_note_no == 259:
        settings.first_note_no = 230
        settings.save(update_fields=['first_note_no'])

    # Detect and clean up only rogue contractors mistakenly saved into the Shop table in commit 21b3e6a
    CONTRACTOR_NAMES_IN_SHOPS = [
        'Globe Civil Projects',
        'ADANI NEW INDUSTRIES',
        'New Age Education',
        'Summit Digital',
        'Haier Smart Solution',
    ]
    for cname in CONTRACTOR_NAMES_IN_SHOPS:
        Shop.objects.filter(name__icontains=cname).delete()

    # 1. Reconcile / Seed Shops (never deleting new shops created with sl > 29)
    for data in MASTER_SHOPS_DATA:
        shop, created = Shop.objects.get_or_create(
            sl=data['sl'],
            defaults={
                'name': data['name'],
                'address': data.get('address', DEFAULT_ADDRESS),
                'fixed': data.get('fixed', False),
                'default_rate': data.get('rate', Decimal('9.55')),
                'default_water': data.get('water', Decimal('320.00')),
                'is_active': True,
            }
        )
        if not created and force:
            shop.name = data['name']
            shop.address = data.get('address', DEFAULT_ADDRESS)
            shop.fixed = data.get('fixed', False)
            shop.default_rate = data.get('rate', Decimal('9.55'))
            shop.default_water = data.get('water', Decimal('320.00'))
            shop.is_active = True
            shop.save()

    # 2. Reconcile / Seed Contractors (never deleting new contractors created with sl > 6)
    for data in MASTER_CONTRACTORS_DATA:
        c, created = Contractor.objects.get_or_create(
            sl=data['sl'],
            defaults={
                'name': data['name'],
                'to_line': data.get('to_line', ''),
                'address': data.get('address', CONTRACTOR_ADDRESS),
                'intro': data.get('intro', CONTRACTOR_INTRO),
                'is_active': True,
            }
        )
        if not created and force:
            c.name = data['name']
            c.to_line = data.get('to_line', '')
            c.address = data.get('address', CONTRACTOR_ADDRESS)
            c.intro = data.get('intro', CONTRACTOR_INTRO)
            c.is_active = True
            c.save()

    # 3. Ensure portal user estate.office exists
    try:
        User = get_user_model()
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
    except Exception:
        pass

    # 4. Populate baseline demand note data for cycle 2026-10 so users don't see empty 0s
    primary_cycle = '2026-10'
    BillingCycle.objects.get_or_create(month=primary_cycle, defaults={'label': primary_cycle, 'is_active': True})

    prefix = settings.get_effective_prefix(primary_cycle)
    first_no = settings.first_note_no

    # Populate shops demand notes
    for data in MASTER_SHOPS_DATA:
        shop = Shop.objects.filter(sl=data['sl']).first()
        if not shop:
            continue
        note_no = f"{prefix}{first_no + shop.sl - 1}"
        note, created = ShopDemandNote.objects.get_or_create(
            shop=shop,
            cycle_month=primary_cycle,
            defaults={
                'note_no': note_no,
                'date': data.get('date', '2026-11-03'),
                'month': data.get('month', '2026-10'),
                'month_to': data.get('month_to', ''),
                'units': data.get('units', ''),
                'rate': data.get('rate', Decimal('9.55')),
                'water': data.get('water', Decimal('320.00')),
                'fixed': data.get('fixed', False),
                'extras': [],
                'total_amount': data.get('total_amount', Decimal('0.00')),
                'expiry_date': '',
            }
        )
        if not created and (force or not note.units and not note.fixed or note.total_amount == Decimal('0.00')):
            # If note was created empty, populate with real numbers
            note.units = data.get('units', '')
            note.date = data.get('date', '2026-11-03')
            note.month = data.get('month', '2026-10')
            note.month_to = data.get('month_to', '')
            note.rate = data.get('rate', Decimal('9.55'))
            note.water = data.get('water', Decimal('320.00'))
            note.fixed = data.get('fixed', False)
            note.total_amount = data.get('total_amount', Decimal('0.00'))
            note.save()

    # Populate contractors demand notes
    contractor_note_nos = {
        1: f"{prefix}228",
        2: f"{prefix}229",
        3: f"{prefix}233",
        4: f"{prefix}260",
        5: f"{prefix}261",
        6: f"{prefix}262",
    }
    for data in MASTER_CONTRACTORS_DATA:
        contractor = Contractor.objects.filter(sl=data['sl']).first()
        if not contractor:
            continue
        c_note_no = contractor_note_nos.get(data['sl'], '')
        cnote, created = ContractorDemandNote.objects.get_or_create(
            contractor=contractor,
            cycle_month=primary_cycle,
            defaults={
                'note_no': c_note_no,
                'date': data.get('date', '2026-11-03'),
                'month': data.get('month', '2026-10'),
                'month_to': data.get('month_to', ''),
                'period_type': data.get('period_type', 'month'),
                'meters': data.get('meters', []),
                'total_amount': data.get('total_amount', Decimal('0.00')),
            }
        )
        if not created and (force or not cnote.total_amount or not cnote.note_no or not cnote.meters):
            cnote.note_no = c_note_no
            cnote.date = data.get('date', '2026-11-03')
            cnote.month = data.get('month', '2026-10')
            cnote.month_to = data.get('month_to', '')
            cnote.period_type = data.get('period_type', 'month')
            cnote.meters = data.get('meters', [])
            cnote.total_amount = data.get('total_amount', Decimal('0.00'))
            cnote.save()
