from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from apps.horticulture.models import (
    HorticultureArea,
    HorticultureRoad,
    HorticultureWorker,
    HorticultureWorkerArea,
    HorticultureZone,
    SeasonSetting,
    TaskType,
)
from apps.users.models import build_username_from_names, unique_standard_username

User = get_user_model()
DEFAULT_PASSWORD = 'IITGN@2025'

MANAGER_SPEC = {
    'username': 'mahesh.prajapati',
    'full_name': 'Maheshbhai Prajapati',
    'role': User.Role.HORTICULTURE_MANAGER,
    'phone': '9723889424',
    'pay_code': '474',
    'is_staff': True,
    'is_superuser': False,
}

SUPERVISOR_SPECS = [
    {
        'username': 'jayanti.thakor',
        'full_name': 'Jayanti Bhai Thakor',
        'role': User.Role.SUPERVISOR,
        'phone': '9662133181',
        'pay_code': '159',
        'is_staff': False,
        'is_superuser': False,
    },
    {
        'username': 'rajesh.thakor',
        'full_name': 'Rajesh Bhai Thakor',
        'role': User.Role.SUPERVISOR,
        'phone': '7383662356',
        'pay_code': '440',
        'is_staff': False,
        'is_superuser': False,
    },
    {
        'username': 'mukesh.solanki',
        'full_name': 'Mukesh Bhai Solanki',
        'role': User.Role.SUPERVISOR,
        'phone': '8140776096',
        'pay_code': '285',
        'is_staff': False,
        'is_superuser': False,
    },
]

WORKER_TEAMS = {
    'jayanti.thakor': [
        ('Vikram Thakor', '174', '9574871515'),
        ('Somiben Thakor', '193', '9723010853'),
        ('Mafaji A Thakor', '167', '8488911915'),
        ('Lalaji N Thakor', '160', '6356546614'),
        ('Ajmel Thakor', '161', '9687868614'),
        ('Bhulaji Thakor', '285', '9586603513'),
        ('Mafaji G Thakor', '177', '7567683152'),
        ('Yogesh Bhati', '180', '6351567416'),
        ('Amrat Rathod', '323', '7383157690'),
        ('Gabhaji Solanki', '162', '7041451388'),
        ('Pawanben Dabhi', '175', '9274404670'),
        ('Melaji Solanki', '164', '9316568556'),
        ('Raiji Thakor', '200', '9904089545'),
        ('Suresh J Raval', '170', '6356542205'),
        ('Mukesh Jadav', '185', '7490821928'),
        ('Ashawin Bhati', '184', '8153835957'),
        ('Raiji Raval', '321', '7485907060'),
        ('Harshad Thakor', '325', '9016098494'),
        ('Karan Thakor', '351', '6352854763'),
        ('Ranjit Thakor', '327', '9664603628'),
        ('Kanti Yadav', '171', '9727488591'),
        ('Lalaji D Thakor', '182', '6355298895'),
    ],
    'rajesh.thakor': [
        ('Pankaj solanki', '225', '6351213549'),
        ('Jalam K Bihola', '201', '8401039214'),
        ('Ajay P Thakor', '213', '7203907287'),
        ('Jayesh Vagela', '344', '9624488044'),
        ('Rajendra Bihola', '215', '9978913158'),
        ('Mahesh Solanki', '228', '7016007109'),
        ('Govind Thakor', '299', '8511066362'),
        ('Kanaji Jadav', '209', '9558938718'),
        ('Mahendra Thakor', '205', '8140746463'),
        ('Kiran Bihola', '172', '9638935200'),
        ('Sunil V Thakor', '195', '7567010836'),
        ('Jagadish Jadav', '190', '7698176714'),
        ('Ajay K Thakor', '302', '8734953124'),
        ('Ganshyam Thakor', '173', '9974950380'),
        ('Babubhai Raval', '441', '9558360234'),
        ('suresh M Raval', '366', '9913956012'),
        ('Shailesh Rathod', '169', '9924226169'),
        ('Tushar Thakor', '168', '8401415602'),
    ],
    'mukesh.solanki': [
        ('Vijay Thakor', '369', '9328149914'),
        ('Kishan Thakor', '188', '6355027361'),
        ('Chetan Thakor', '286', '9737011918'),
        ('Suresh S raval', '359', '6353500714'),
        ('Vishal Thakor', '296', '8347912070'),
        ('Ajay M Thakor', '368', '8320437904'),
        ('Pintu Bhati', '181', '9737119891'),
        ('Mahesh Thakor', '183', '8140101961'),
        ('Sunil Jadav', '198', '9724017520'),
        ('Samir Solanki', '467', '8980412045'),
        ('karan Chouhan', '468', '6355791426'),
        ('Vanraj Rathod', '203', '8490084462'),
    ],
}

ZONE_SPECS = [
    {'name': 'Zone Red', 'color_code': 'red', 'supervisor_username': 'jayanti.thakor'},
    {'name': 'Zone Blue', 'color_code': 'blue', 'supervisor_username': 'mukesh.solanki'},
    {'name': 'Zone Black', 'color_code': 'black', 'supervisor_username': 'rajesh.thakor'},
]

AREA_ZONE_MAP = {
    22: 'Zone Red',
    23: 'Zone Red',
    24: 'Zone Red',
    29: 'Zone Red',
    30: 'Zone Black',
    33: 'Zone Black',
    35: 'Zone Red',
    36: 'Zone Blue',
    15: 'Zone Black',
    17: 'Zone Black',
    21: 'Zone Black',
    34: 'Zone Red',
    25: 'Zone Red',
    5: 'Zone Red',
    1: 'Zone Blue',
    2: 'Zone Red',
    16: 'Zone Black',
    18: 'Zone Blue',
    19: 'Zone Black',
    20: 'Zone Blue',
    3: 'Zone Red',
    4: 'Zone Blue',
    6: 'Zone Black',
    7: 'Zone Black',
    8: 'Zone Blue',
    9: 'Zone Blue',
    10: 'Zone Blue',
    11: 'Zone Blue',
    12: 'Zone Blue',
    13: 'Zone Blue',
    14: 'Zone Black',
    26: 'Zone Blue',
    27: 'Zone Blue',
    28: 'Zone Blue',
    31: 'Zone Blue',
    32: 'Zone Red',
    37: 'Zone Black',
    38: 'Zone Red',
    39: 'Zone Black',
    40: 'Zone Blue',
    41: 'Zone Black',
    42: 'Zone Black',
}

AREA_SPECS = [
    (1, 'Gate No.2 to A1 Road start (E2 Road)'),
    (2, 'A1 Road + roadside opp Sports Complex'),
    (3, 'B1 Road + roadside'),
    (4, 'Housing Blocks 1-14 front (F1 Road)'),
    (5, "Director's Residence to Temp Gate (F1)"),
    (6, 'Temp Gate to Fire Building (F1)'),
    (7, 'Fire Building to Triangular Lawn near RP (F1)'),
    (8, 'Housing Blocks 31-34 front (F2 Road)'),
    (9, 'Housing Blocks 17-30 front (H2 Road)'),
    (10, 'Housing Blocks 14-17 front (H3 Road)'),
    (11, 'Jalmandap to Tennis Court (J2)'),
    (12, 'Hostel Lawn Tennis to SPS (C3D1)'),
    (13, 'New Housing to Sabarmati Cycle Track (C2)'),
    (14, 'River Promenade Road (C2)'),
    (15, 'Triangular Lawn near Research Park'),
    (16, 'Scenic Drive Road (G1)'),
    (17, 'Triangular Junction to Research Park'),
    (18, 'Gate No.2'),
    (19, 'Gate No.1 And Outer Lawn'),
    (20, 'Gate No.3'),
    (21, 'Gate No.1 to Triangular Lawn (E1 Road)'),
    (22, 'Academic Blocks all floor planters'),
    (23, 'Central Vista Lawn'),
    (24, 'Lawn near AB-11,12,13 opp Library'),
    (25, 'Guest House Lawn'),
    (26, 'Housing Jalmandap Lawn'),
    (27, 'Old Mess Lawn Side of Tennis Court'),
    (28, 'Hostel Area'),
    (29, 'Academic Lawn AB-9 to AB-3'),
    (30, 'Rang Manch Lawn Hedges Planters'),
    (31, 'Sports Complex Lawn'),
    (32, 'Temporary Sports Field Lawn'),
    (33, 'Open Parking near 2-degree cafe'),
    (34, 'Directors Residence Rectangular Area'),
    (35, 'Between Guest House and E2 Road'),
    (36, 'Between AB-9 and Solar Parking to Gate 5'),
    (37, 'Biogas plan'),
    (38, '2-degree cafe'),
    (39, 'U-shape'),
    (40, 'Gate 2 To gate 3 boundary'),
    (41, 'Boundary fromResearch park to  north Building'),
    (42, 'Nursery near fire building'),
]

ROAD_SPECS = [
    ('A1', 'Zone Red', 'A1 Road'),
    ('A2', 'Zone Blue', 'A2 Road'),
    ('B1', 'Zone Red', 'B1 Road'),
    ('C1', 'Zone Black', 'C1 Road'),
    ('C2', 'Zone Blue', 'C2 Road'),
    ('C3', 'Zone Blue', 'C3 Road'),
    ('D1', 'Zone Blue', 'D1 Road'),
    ('E1', 'Zone Black', 'E1 Road'),
    ('E2', 'Zone Black', 'E2 Road'),
    ('F1', 'Zone Blue', 'F1 Road'),
    ('F1a', 'Zone Black', 'F1a Road'),
    ('F2', 'Zone Blue', 'F2 Road'),
    ('G1', 'Zone Black', 'G1 Road'),
    ('H1', 'Zone Red', 'H1 Road'),
    ('H2', 'Zone Blue', 'H2 Road'),
    ('I1', 'Zone Black', 'I1 Road'),
    ('I2', 'Zone Red', 'I2 Road'),
    ('I3', 'Zone Red', 'I3 Road'),
    ('I4', 'Zone Blue', 'I4 Road'),
    ('J1', 'Zone Red', 'J1 Road'),
    ('J2', 'Zone Blue', 'J2 Road'),
    ('K', 'Zone Black', 'K Road'),
]

TASK_TYPE_SPECS = [
    {
        'name': 'Cleaning',
        'threshold_days_default': 1,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Watering',
        'threshold_days_default': 7,
        'threshold_days_summer': 7,
        'threshold_days_winter': 14,
        'threshold_days_rainy': 30,
        'is_active': True,
    },
    {
        'name': 'Hedge Cutting',
        'threshold_days_default': 15,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Lawn Mowing',
        'threshold_days_default': 15,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Edge Cutting',
        'threshold_days_default': 15,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Big Tree Trimming',
        'threshold_days_default': 365,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Fertilizer / Manuring',
        'threshold_days_default': 180,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Weeding & Tilling',
        'threshold_days_default': 15,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Insecticide / Fungicide Spray',
        'threshold_days_default': 30,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
    {
        'name': 'Indoor Plants (Dhoop Dikhana)',
        'threshold_days_default': 7,
        'threshold_days_summer': None,
        'threshold_days_winter': None,
        'threshold_days_rainy': None,
        'is_active': True,
    },
]


class Command(BaseCommand):
    help = 'Seed IITGN horticulture master data.'

    def handle(self, *args, **options):
        verbosity = options.get('verbosity', 1)

        self.stats = {
            'manager_created': 0,
            'manager_updated': 0,
            'supervisors_created': 0,
            'supervisors_updated': 0,
            'workers_created': 0,
            'workers_updated': 0,
            'zones_created': 0,
            'zones_updated': 0,
            'areas_created': 0,
            'areas_updated': 0,
            'roads_created': 0,
            'roads_updated': 0,
            'task_types_created': 0,
            'task_types_updated': 0,
            'season_created': 0,
            'season_updated': 0,
        }

        admin_user = self._get_existing_admin()

        with transaction.atomic():
            manager = self._seed_manager()
            supervisors = self._seed_supervisors()
            zones = self._seed_zones(supervisors)
            self._seed_areas(zones)
            self._seed_workers(zones)
            self._seed_roads(zones)
            self._seed_task_types()
            season = self._seed_season(admin_user)

        self.stdout.write(self.style.SUCCESS('Horticulture seed complete.'))
        self.stdout.write('')
        self.stdout.write(f"Reused admin: {admin_user.username}")
        self.stdout.write(f"Manager: {manager.username}")
        self.stdout.write(f"Season: {season.season}")
        self.stdout.write('')
        self.stdout.write('Created/updated summary:')
        self.stdout.write(f"  Manager users: {self.stats['manager_created']} created, {self.stats['manager_updated']} updated")
        self.stdout.write(f"  Supervisors: {self.stats['supervisors_created']} created, {self.stats['supervisors_updated']} updated")
        self.stdout.write(f"  Workers: {self.stats['workers_created']} created, {self.stats['workers_updated']} updated")
        self.stdout.write(f"  Zones: {self.stats['zones_created']} created, {self.stats['zones_updated']} updated")
        self.stdout.write(f"  Areas: {self.stats['areas_created']} created, {self.stats['areas_updated']} updated")
        self.stdout.write(f"  Roads: {self.stats['roads_created']} created, {self.stats['roads_updated']} updated")
        self.stdout.write(f"  Task types: {self.stats['task_types_created']} created, {self.stats['task_types_updated']} updated")
        self.stdout.write(f"  Season settings: {self.stats['season_created']} created, {self.stats['season_updated']} updated")
        self.stdout.write('')
        self.stdout.write('Current horticulture totals:')
        self.stdout.write(f"  Users seeded by this command: 1 manager, {len(SUPERVISOR_SPECS)} supervisors, {self._worker_count()} workers")
        self.stdout.write(f"  Zone count: {HorticultureZone.objects.count()}")
        self.stdout.write(f"  Area count: {HorticultureArea.objects.count()}")
        self.stdout.write(f"  Road count: {HorticultureRoad.objects.count()}")
        self.stdout.write(f"  Task type count: {TaskType.objects.count()}")
        self.stdout.write('')
        self.stdout.write(
            'Roster note: the provided team lists contain 52 worker names; combined with 3 supervisors this yields 55 field users.'
        )
        self.stdout.write(f'Default password for newly created accounts: {DEFAULT_PASSWORD}')
        self.stdout.write('Existing account passwords were preserved.')

    def _get_existing_admin(self):
        admin_user = (
            User.objects.filter(username='super.admin').first()
        )
        if admin_user is None:
            raise CommandError(
                'No existing admin user was found. Load the previous user fixture first so this command can reuse that admin.'
            )
        return admin_user

    def _seed_manager(self):
        manager, created, updated = self._get_or_sync_user(**MANAGER_SPEC)
        self.stats['manager_created'] += int(created)
        self.stats['manager_updated'] += int(updated)
        return manager

    def _seed_supervisors(self):
        supervisors = {}
        for spec in SUPERVISOR_SPECS:
            supervisor, created, updated = self._get_or_sync_user(**spec)
            self.stats['supervisors_created'] += int(created)
            self.stats['supervisors_updated'] += int(updated)
            supervisors[spec['username']] = supervisor
        return supervisors

    def _seed_workers(self, zones):
        for supervisor_username, workers in WORKER_TEAMS.items():
            zone_names = [
                spec['name']
                for spec in ZONE_SPECS
                if spec['supervisor_username'] == supervisor_username
            ]
            area_ids = list(
                HorticultureArea.objects
                .filter(zone__name__in=zone_names)
                .order_by('area_number')
                .values_list('id', flat=True)
            )
            for index, (full_name, pay_code, phone) in enumerate(workers):
                worker, created = HorticultureWorker.objects.get_or_create(
                    pay_code=pay_code,
                    defaults={
                        'name': full_name,
                        'phone': phone,
                        'is_active': True,
                    },
                )
                changed = False
                if worker.name != full_name:
                    worker.name = full_name
                    changed = True
                if worker.phone != phone:
                    worker.phone = phone
                    changed = True
                if not worker.is_active:
                    worker.is_active = True
                    changed = True
                if changed:
                    worker.save(update_fields=['name', 'phone', 'is_active', 'updated_at'])

                if area_ids:
                    primary_area_id = area_ids[index % len(area_ids)]
                    HorticultureWorkerArea.objects.update_or_create(
                        worker=worker,
                        area_id=primary_area_id,
                        defaults={'is_active': True},
                    )

                self.stats['workers_created'] += int(created)
                self.stats['workers_updated'] += int(not created and changed)

    def _seed_zones(self, supervisors):
        zones = {}
        for spec in ZONE_SPECS:
            zone, created = HorticultureZone.objects.get_or_create(
                name=spec['name'],
                defaults={
                    'color_code': spec['color_code'],
                    'supervisor': supervisors[spec['supervisor_username']],
                    'notes': '',
                },
            )
            changed = False
            if zone.color_code != spec['color_code']:
                zone.color_code = spec['color_code']
                changed = True
            if zone.supervisor_id != supervisors[spec['supervisor_username']].id:
                zone.supervisor = supervisors[spec['supervisor_username']]
                changed = True
            if zone.notes != '':
                zone.notes = ''
                changed = True
            if changed:
                zone.save(update_fields=['color_code', 'supervisor', 'notes'])

            self.stats['zones_created'] += int(created)
            self.stats['zones_updated'] += int(not created and changed)
            zones[spec['name']] = zone
        return zones

    def _seed_areas(self, zones):
        for area_number, name in AREA_SPECS:
            zone_name = AREA_ZONE_MAP[area_number]
            area, created = HorticultureArea.objects.get_or_create(
                area_number=area_number,
                defaults={
                    'name': name,
                    'zone': zones[zone_name],
                },
            )
            changed = False
            if area.name != name:
                area.name = name
                changed = True
            if area.zone_id != zones[zone_name].id:
                area.zone = zones[zone_name]
                changed = True
            if changed:
                area.save(update_fields=['name', 'zone'])

            self.stats['areas_created'] += int(created)
            self.stats['areas_updated'] += int(not created and changed)

    def _seed_roads(self, zones):
        for road_code, zone_name, name in ROAD_SPECS:
            road, created = HorticultureRoad.objects.get_or_create(
                zone=zones[zone_name],
                road_code=road_code,
                defaults={
                    'name': name,
                },
            )
            changed = False
            if road.name != name:
                road.name = name
                changed = True
            if changed:
                road.save(update_fields=['name'])

            self.stats['roads_created'] += int(created)
            self.stats['roads_updated'] += int(not created and changed)

    def _seed_task_types(self):
        for spec in TASK_TYPE_SPECS:
            task_type, created = TaskType.objects.get_or_create(
                name=spec['name'],
                defaults={
                    'threshold_days_default': spec['threshold_days_default'],
                    'threshold_days_summer': spec['threshold_days_summer'],
                    'threshold_days_winter': spec['threshold_days_winter'],
                    'threshold_days_rainy': spec['threshold_days_rainy'],
                    'is_active': spec['is_active'],
                },
            )
            changed = False
            for field in (
                'threshold_days_default',
                'threshold_days_summer',
                'threshold_days_winter',
                'threshold_days_rainy',
                'is_active',
            ):
                if getattr(task_type, field) != spec[field]:
                    setattr(task_type, field, spec[field])
                    changed = True
            if changed:
                task_type.save(
                    update_fields=[
                        'threshold_days_default',
                        'threshold_days_summer',
                        'threshold_days_winter',
                        'threshold_days_rainy',
                        'is_active',
                    ]
                )

            self.stats['task_types_created'] += int(created)
            self.stats['task_types_updated'] += int(not created and changed)

    def _seed_season(self, admin_user):
        season_setting, created = SeasonSetting.objects.get_or_create(
            pk=1,
            defaults={
                'season': SeasonSetting.Season.SUMMER,
                'updated_by': admin_user,
            },
        )
        changed = False
        if season_setting.season != SeasonSetting.Season.SUMMER:
            season_setting.season = SeasonSetting.Season.SUMMER
            changed = True
        if season_setting.updated_by_id != admin_user.id:
            season_setting.updated_by = admin_user
            changed = True
        if changed:
            season_setting.save(update_fields=['season', 'updated_by', 'updated_at'])

        self.stats['season_created'] += int(created)
        self.stats['season_updated'] += int(not created and changed)
        return season_setting

    def _get_or_sync_user(
        self,
        username,
        full_name,
        role,
        phone='',
        pay_code='',
        is_staff=False,
        is_superuser=False,
    ):
        first_name, last_name = self._split_name(full_name)
        base_username = build_username_from_names(first_name, last_name)
        user = User.objects.filter(username__in=[base_username, username]).first()
        if user is None and pay_code:
            user = User.objects.filter(role=role, pay_code=pay_code).first()
        canonical_username = unique_standard_username(
            first_name,
            last_name,
            model=User,
            exclude_pk=getattr(user, 'pk', None),
        )
        username_changed = False
        if user is None:
            user = User(
                username=canonical_username,
                first_name=first_name,
                last_name=last_name,
                role=role,
                phone=phone,
                pay_code=pay_code,
                is_active=True,
                is_staff=is_staff,
                is_superuser=is_superuser,
            )
            created = True
        else:
            created = False
            if user.username != canonical_username:
                user.username = canonical_username
                username_changed = True

        changed = bool(created or username_changed)
        for field, value in (
            ('first_name', first_name),
            ('last_name', last_name),
            ('role', role),
            ('phone', phone),
            ('pay_code', pay_code),
            ('is_active', True),
            ('is_staff', is_staff),
            ('is_superuser', is_superuser),
        ):
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed = True

        if created:
            user.set_password(DEFAULT_PASSWORD)
            changed = True

        if changed:
            update_fields = [
                'first_name',
                'last_name',
                'role',
                'phone',
                'pay_code',
                'is_active',
                'is_staff',
                'is_superuser',
                'username',
            ]
            if created:
                user.save()
            else:
                user.save(update_fields=update_fields)

        return user, created, (not created and changed)

    def _split_name(self, full_name):
        parts = (full_name or '').strip().split()
        if not parts:
            return '', ''
        if len(parts) == 1:
            return parts[0], ''
        return ' '.join(parts[:-1]), parts[-1]

    def _build_worker_username(self, full_name, pay_code, supervisor_username):
        base = slugify(full_name).replace('-', '.')
        if not base:
            base = f'horti.worker.{supervisor_username}'
        return f'{base}.{pay_code}'

    def _worker_count(self):
        return sum(len(team) for team in WORKER_TEAMS.values())
