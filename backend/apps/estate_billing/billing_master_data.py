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

BASELINE_SHOP_NOTE_NOS = {
    1: 230,
    2: 231,
    3: 232,
    4: 234,
    5: 235,
    6: 236,
    7: 237,
    8: 238,
    9: 239,
    10: 240,
    11: 241,
    12: 242,
    13: 243,
    14: 244,
    15: 245,
    16: 246,
    17: 247,
    18: 248,
    19: 249,
    20: 250,
    21: 251,
    22: 252,
    23: 253,
    24: 254,
    25: 255,
    26: 256,
    27: 257,
    28: 258,
    29: 259,
}

BASELINE_CONTRACTOR_NOTE_NOS = {
    1: 228,
    2: 229,
    3: 233,
    4: 260,
    5: 261,
    6: 262,
}

for s_data in MASTER_SHOPS_DATA:
    if s_data['sl'] in BASELINE_SHOP_NOTE_NOS:
        s_data['note_no'] = f"IWD/26-27/{BASELINE_SHOP_NOTE_NOS[s_data['sl']]}"

for c_data in MASTER_CONTRACTORS_DATA:
    if c_data['sl'] in BASELINE_CONTRACTOR_NOTE_NOS:
        c_data['note_no'] = f"IWD/26-27/{BASELINE_CONTRACTOR_NOTE_NOS[c_data['sl']]}"

SEED_SHOPS = MASTER_SHOPS_DATA
SEED_CONTRACTORS = MASTER_CONTRACTORS_DATA

CONTRACTOR_DEFAULT_METERS = {
    c['sl']: c.get('meters', [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}])
    for c in MASTER_CONTRACTORS_DATA
}


def _seed_user_and_settings():
    from .models import EstateSettings

    EstateSettings.get_settings()

    # Portal user estate.office (password is only set when the user is first created)
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


def _create_master_shop(data):
    from django.db.models import Max
    from .models import Shop

    sl = data['sl']
    # `sl` is re-sequenced when shops are deleted and is not unique, so never reuse one that is taken.
    if Shop.objects.filter(is_active=True, sl=sl).exists():
        sl = (Shop.objects.aggregate(m=Max('sl'))['m'] or 0) + 1
    return Shop.objects.create(
        sl=sl,
        name=data['name'],
        address=data.get('address', DEFAULT_ADDRESS),
        fixed=data.get('fixed', False),
        default_rate=data.get('rate', Decimal('9.55')),
        default_water=data.get('water', Decimal('320.00')),
        is_active=True,
    )


def _create_master_contractor(data):
    from django.db.models import Max
    from .models import Contractor

    sl = data['sl']
    if Contractor.objects.filter(is_active=True, sl=sl).exists():
        sl = (Contractor.objects.aggregate(m=Max('sl'))['m'] or 0) + 1
    return Contractor.objects.create(
        sl=sl,
        name=data['name'],
        to_line=data.get('to_line', ''),
        address=data.get('address', CONTRACTOR_ADDRESS),
        intro=data.get('intro', CONTRACTOR_INTRO),
        is_active=True,
    )


def ensure_master_shops_and_contractors():
    """
    Safe first-run seed. It is called from the estate pages, so it must never change data the
    estate office has already worked on.

    - The 29 official shops are created only while the shop table is completely EMPTY, and the 6
      official contractors only while the contractor table is completely EMPTY.
    - Once any row exists (active or deleted) nothing is edited, deleted or re-created, so deleting
      or renaming a shop sticks.
    - Rows are matched by NAME, never by `sl` (`sl` is re-sequenced on delete and can repeat).
    - Demand notes / bills are never touched here.
    """
    from django.db import transaction
    from .models import Shop, Contractor

    _seed_user_and_settings()

    if not Shop.objects.exists():
        with transaction.atomic():
            existing = set(Shop.objects.values_list('name', flat=True))
            for data in MASTER_SHOPS_DATA:
                if data['name'] not in existing:
                    _create_master_shop(data)

    if not Contractor.objects.exists():
        with transaction.atomic():
            existing = set(Contractor.objects.values_list('name', flat=True))
            for data in MASTER_CONTRACTORS_DATA:
                if data['name'] not in existing:
                    _create_master_contractor(data)


# Contractors that an old commit (21b3e6a) saved into the Shop table by mistake.
ROGUE_CONTRACTOR_NAME_FRAGMENTS = [
    'Globe Civil Projects',
    'ADANI NEW INDUSTRIES',
    'New Age Education',
    'Summit Digital',
    'Haier Smart Solution',
]


def reconcile_master_data():
    """
    Explicit repair, run by an operator: `seed_estate_billing --reconcile`. Never runs automatically.

    - Removes contractors that were mistakenly saved as shops.
    - Adds any official shop / contractor that is missing (matched by name). A shop or contractor
      that was deleted on purpose exists as an inactive row with the same name, so it is NOT brought back.
    - Does not edit existing rows and does not touch demand notes.

    Returns a summary dict.
    """
    from .models import Shop, Contractor

    summary = {'removed_rogue_shops': [], 'created_shops': [], 'created_contractors': []}

    for fragment in ROGUE_CONTRACTOR_NAME_FRAGMENTS:
        for shop in Shop.objects.filter(name__icontains=fragment):
            summary['removed_rogue_shops'].append(shop.name)
            shop.delete()

    for data in MASTER_SHOPS_DATA:
        if not Shop.objects.filter(name=data['name']).exists():
            summary['created_shops'].append(_create_master_shop(data).name)

    for data in MASTER_CONTRACTORS_DATA:
        if not Contractor.objects.filter(name=data['name']).exists():
            summary['created_contractors'].append(_create_master_contractor(data).name)

    return summary


def populate_baseline_bills(cycle_month='2026-10'):
    """
    OPT-IN: `seed_estate_billing --with-baseline-bills`. Never runs automatically.

    Copies the baseline figures in MASTER_SHOPS_DATA / MASTER_CONTRACTORS_DATA into the demand notes
    of one cycle. Only notes that are still EMPTY are filled; a note that already has units, meter
    readings or a total is never modified, and note numbers are left as the app assigned them.
    The notes must already exist (run ensure_cycle_notes first).

    Returns a summary dict.
    """
    from .models import Shop, Contractor, ShopDemandNote, ContractorDemandNote

    summary = {'shop_notes_filled': 0, 'shop_notes_skipped': 0,
               'contractor_notes_filled': 0, 'contractor_notes_skipped': 0}

    for data in MASTER_SHOPS_DATA:
        shop = Shop.objects.filter(name=data['name'], is_active=True).first()
        note = ShopDemandNote.objects.filter(shop=shop, cycle_month=cycle_month).first() if shop else None
        if not note:
            summary['shop_notes_skipped'] += 1
            continue
        if not note.note_no and data.get('note_no'):
            note.note_no = data['note_no']
            note.save(update_fields=['note_no'])
        if note.units or note.fixed or note.total_amount:
            summary['shop_notes_skipped'] += 1
            continue
        note.units = data.get('units', '')
        note.date = data.get('date', '')
        note.month = data.get('month', cycle_month)
        note.month_to = data.get('month_to', '')
        note.rate = data.get('rate', Decimal('9.55'))
        note.water = data.get('water', Decimal('320.00'))
        note.fixed = data.get('fixed', False)
        note.total_amount = data.get('total_amount', Decimal('0.00'))
        note.save()
        summary['shop_notes_filled'] += 1

    for data in MASTER_CONTRACTORS_DATA:
        contractor = Contractor.objects.filter(name=data['name'], is_active=True).first()
        note = ContractorDemandNote.objects.filter(contractor=contractor, cycle_month=cycle_month).first() if contractor else None
        if not note:
            summary['contractor_notes_skipped'] += 1
            continue
        if not note.note_no and data.get('note_no'):
            note.note_no = data['note_no']
            note.save(update_fields=['note_no'])
        has_readings = any((m.get('current') or m.get('previous')) for m in (note.meters or []))
        if has_readings or note.total_amount:
            summary['contractor_notes_skipped'] += 1
            continue
        note.date = data.get('date', '')
        note.month = data.get('month', cycle_month)
        note.month_to = data.get('month_to', '')
        note.period_type = data.get('period_type', 'month')
        note.meters = data.get('meters', [])
        note.total_amount = data.get('total_amount', Decimal('0.00'))
        note.save()
        summary['contractor_notes_filled'] += 1

    return summary
