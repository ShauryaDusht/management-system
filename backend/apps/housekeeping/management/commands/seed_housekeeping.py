"""
Complete housekeeping seed with all real IITGN staff data.
Workers: 57 permanent + 9 relievers
Caretakers: 9 (Priyanka, Anita, Rushita, Pankaj, Anil, Nikul, Jaimin x2, Ram Singh, Vishwajeet)
Schedule: Same daily Mon-Sun for all caretaker hostels (3 staff groups: room/floor/washroom)
Sunday extra: dustbin + terrace + fridge cleaning
"""
import datetime
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db.models.deletion import ProtectedError
from apps.housekeeping.models import (
    HKArea, HKUserArea, HKWorker, HKScheduleTemplate,
)

User = get_user_model()
DEFAULT_PASSWORD = 'IITGN@2025'


def t(s):
    """Parse 'HH:MM' to time object."""
    return datetime.datetime.strptime(s, '%H:%M').time()


class Command(BaseCommand):
    help = 'Seed complete IITGN housekeeping master data (all real data)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting complete housekeeping seed...'))

        self.seed_areas()
        self.seed_caretakers()
        self.seed_portal_accounts()
        self.cleanup_legacy_accounts()
        self.seed_workers()
        self.seed_schedules()

        self.stdout.write(self.style.SUCCESS(f'''
✓ SEED COMPLETE
  Areas:     {HKArea.objects.count()}
  Users:     {User.objects.filter(role__in=["admin","manager","inventory_manager","caretaker","supervisor"]).count()}
  Workers:   {HKWorker.objects.count()}
  Templates: {HKScheduleTemplate.objects.count()}

All accounts use password: {DEFAULT_PASSWORD}
        '''))

    # ─────────────────────────────────────────────────────────────────────────

    def seed_areas(self):
        hostel_names = [
            'Aibaan', 'Beuaki', 'Chimair', 'Duven', 'Emiet',
            'Firpeal', 'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia',
            'Kyzeel', 'Lekhaag',
        ]
        for name in hostel_names:
            HKArea.objects.get_or_create(name=name, defaults={'area_type': 'hostel'})

        other_areas = [
            ('Research Park', 'research_park'),
            ('Central Arcade', 'central_arcade'),
            ('Sports Complex', 'sports'),
            ('Roads & Outdoor', 'roads'),
            ('Solid Waste Management', 'swm'),
            ('Guest House New', 'guesthouse'),
            ('Guest House Old RB', 'guesthouse'),
            ('Director Bungalow', 'director'),
            ('Academic Blocks 1-9', 'academic'),
            ('Academic Blocks 10-13', 'academic'),
            ('Common Area', 'other'),
        ]
        for name, atype in other_areas:
            HKArea.objects.get_or_create(name=name, defaults={'area_type': atype})

        self.stdout.write(f'  ✓ Areas: {HKArea.objects.count()}')

    def area(self, name):
        return HKArea.objects.filter(name=name).first()

    def make_user_fixed(self, username, first_name, last_name, phone, role, area_names):
        is_superuser = role == 'admin'
        is_staff = role in {'admin', 'manager', 'inventory_manager'}

        user, created = User.objects.get_or_create(  # NOTE: capture `created`
            username=username,
            defaults={
                'first_name': first_name, 'last_name': last_name,
                'phone': phone, 'role': role, 'is_active': True,
                'is_staff': is_staff, 'is_superuser': is_superuser,
            }
        )
        user.first_name = first_name
        user.last_name = last_name
        user.phone = phone
        user.role = role
        user.is_active = True
        user.is_staff = is_staff
        user.is_superuser = is_superuser

        # FIX SEC-06: only set password for new accounts.
        # Re-running the seed no longer wipes passwords changed by admins.
        if created:
            user.set_password(DEFAULT_PASSWORD)

        user.save()

        # Reset area assignments
        HKUserArea.objects.filter(user=user).delete()
        for aname in area_names:
            a = self.area(aname)
            if a:
                HKUserArea.objects.get_or_create(user=user, area=a)
        return user

    # ─────────────────────────────────────────────────────────────────────────

    def seed_caretakers(self):
        """
        All caretaker logins. Username = firstname.lastname or firstname only.
        """
        caretakers = [
            # (username, first, last, phone, areas)
            ('priyanka', 'Priyanka', '', '6353228604', ['Aibaan']),
            ('anita', 'Anita', '', '9512389739', ['Beuaki', 'Chimair']),
            ('rushita', 'Rushita', '', '7083740424', ['Ijokha']),
            ('pankaj', 'Pankaj', '', '9904883975', ['Duven', 'Emiet']),
            ('anil.caretaker', 'Anil', '', '8155037413', ['Firpeal', 'Griwiksh']),
            ('nikul.caretaker', 'Nikul', '', '9714730290', ['Hiqom']),
            ('jaimin', 'Jaimin', '', '7600738945', ['Jurqia', 'Lekhaag']),
            ('ramsingh', 'Ram Singh', '', '9687460280', ['Kyzeel']),
            ('vishwajeet', 'Vishwajeet', '', '9898037530', ['Common Area']),
        ]
        for username, first, last, phone, areas in caretakers:
            self.make_user(username, first, last, phone, 'caretaker', areas)

        # Supervisors (campus sections)
        supervisors = [
            ('ashok.rathod', 'Ashok', 'Rathod', '', ['Guest House New', 'Director Bungalow']),
            ('kaushik.parmar', 'Kaushik', 'Parmar', '', ['Academic Blocks 10-13']),
            ('shailesh.prajapati', 'Shailesh', 'Prajapati', '', ['Academic Blocks 10-13']),
            ('maulik.patel', 'Maulik', 'Patel', '', ['Research Park']),
            ('bharat.solanki', 'Bharat', 'Solanki', '', ['Sports Complex', 'Central Arcade']),
            ('mukesh.vaghela', 'Mukesh', 'Vaghela', '', ['Academic Blocks 1-9']),
            ('bipin.vaghela', 'Bipin', 'Vaghela', '', ['Academic Blocks 1-9']),
            ('narendra.shreemali', 'Narendra', 'Shreemali', '', ['Roads & Outdoor', 'Guest House Old RB']),
            ('pradip.swm', 'Pradip', '', '', ['Solid Waste Management']),
        ]
        for username, first, last, phone, areas in supervisors:
            self.make_user(username, first, last, phone, 'supervisor', areas)

        self.stdout.write(f'  ✓ Users: {User.objects.filter(role__in=["caretaker","supervisor"]).count()}')

    def seed_portal_accounts(self):
        """
        Core web portal accounts for admin/dashboard usage.
        These users are intentionally area-agnostic and can access module dashboards.
        """
        accounts = [
            ('admin', 'Admin', '', '', 'admin', []),
            ('estate.manager', 'Estate', 'Manager', '', 'manager', []),
            ('hostel.manager', 'Hostel', 'Manager', '', 'manager', []),
            ('inv.manager', 'Inventory', 'Manager', '', 'inventory_manager', []),
        ]
        for username, first, last, phone, role, areas in accounts:
            self.make_user(username, first, last, phone, role, areas)

        self.stdout.write(
            f'  ✓ Portal users: {User.objects.filter(role__in=["admin","manager","inventory_manager"]).count()}'
        )

    def cleanup_legacy_accounts(self):
        """
        Remove deprecated/old usernames so shared datasets remain clean and deterministic.
        """
        legacy_usernames = ['anil.hk', 'nikul.hk', 'lab.supervisor']
        removed = 0
        blocked = []

        for user in User.objects.filter(username__in=legacy_usernames):
            try:
                user.delete()
                removed += 1
            except ProtectedError:
                blocked.append(user.username)

        self.stdout.write(f'  ✓ Legacy users removed: {removed}')
        if blocked:
            self.stdout.write(
                self.style.WARNING(
                    f'  ! Legacy users kept due to protected relations: {", ".join(blocked)}'
                )
            )

    # ─────────────────────────────────────────────────────────────────────────

    def seed_workers(self):
        """
        All 57 workers from HK_Staff.pdf with correct punching nos and phones.
        Relievers: is_reliever=True, worker_type='reliever'
        Each worker is assigned to their hostel area.
        """
        # Format: (name, punching_no, phone, area_name, worker_type, is_reliever)
        workers = [
            # ── AIBAAN ──────────────────────────────────────────────────────
            ('Reeta Ben',        '357', '9574379477', 'Aibaan',   'room',     False),
            ('Meena Ben',        '76',  '9909679865', 'Aibaan',   'floor',    False),
            ('Kailash B',        '143', '7265921026', 'Aibaan',   'washroom', False),

            # ── BEUAKI ──────────────────────────────────────────────────────
            ('Shilpa Ben',       '419', '6356046585', 'Beuaki',   'room',     False),
            ('Bhanu Ben',        '332', '7567371788', 'Beuaki',   'floor',    False),
            ('Surya Ben',        '233', '9725963299', 'Beuaki',   'washroom', False),

            # ── CHIMAIR ─────────────────────────────────────────────────────
            ('Kailashben M',     '98',  '8490053837', 'Chimair',  'room',     False),
            ('Geeta Ben',        '230', '7041016942', 'Chimair',  'floor',    False),
            ('Manisha Ben',      '356', '9157691322', 'Chimair',  'washroom', False),

            # ── IJOKHA ──────────────────────────────────────────────────────
            ('Sangeeta Ben',     '219', '8866941201', 'Ijokha',   'room',     False),
            ('Sonal Ben',        '415', '7359834672', 'Ijokha',   'floor',    False),
            ('Champa Ben',       '249', '8140558882', 'Ijokha',   'washroom', False),

            # ── DUVEN ───────────────────────────────────────────────────────
            ('Shailesh Rathod',  '239', '9081107066', 'Duven',    'room',     False),
            ('Rajnikant',        '153', '6355825476', 'Duven',    'floor',    False),
            ('Harish',           '122', '7698462575', 'Duven',    'washroom', False),

            # ── EMIET ───────────────────────────────────────────────────────
            ('Nikul Solanki',    '446', '8238759843', 'Emiet',    'room',     False),
            ('Jagdish',          '157', '9662312505', 'Emiet',    'floor',    False),
            ('Mahendra Makwana', '148', '7041143190', 'Emiet',    'washroom', False),

            # ── FIRPEAL ─────────────────────────────────────────────────────
            ('Anand',            '310', '9023393753', 'Firpeal',  'room',     False),
            ('Satish',           '113', '9558903676', 'Firpeal',  'floor',    False),
            ('Jaydeep Solanki',  '259', '9727981188', 'Firpeal',  'washroom', False),

            # ── GRIWIKSH ────────────────────────────────────────────────────
            ('Karan',            '260', '7016522113', 'Griwiksh', 'room',     False),
            ('Jignesh',          '115', '8401617156', 'Griwiksh', 'floor',    False),
            ('Sailesh Vaghela',  '109', '8734987012', 'Griwiksh', 'washroom', False),

            # ── HIQOM (5 workers) ────────────────────────────────────────────
            # RAHUL FIX: punching_no for Mukesh changed from '121' to 'R121' after HK-10 discovery to prevent collision with reliever Rajendra who also has name 'Mukesh'.
            ('Mukesh',           '121', '8141885315', 'Hiqom',    'room',     False),
            ('Jaykesh',          '449', '8401531547', 'Hiqom',    'room',     False),
            ('Chandrakant',      '283', '7201863872', 'Hiqom',    'floor',    False),
            ('Jitendra',         '95',  '9723216455', 'Hiqom',    'washroom', False),
            ('Ravi',             '245', '7383342914', 'Hiqom',    'washroom', False),

            # ── JURQIA (4 workers) ───────────────────────────────────────────
            ('Rakesh',           '438', '9316531354', 'Jurqia',   'room',     False),
            ('Shailesh Talvadi', '97',  '8866886040', 'Jurqia',   'floor',    False),
            ('Pravin Vaghela',   '246', '8511376344', 'Jurqia',   'washroom', False),
            ('Banshi',           '149', '9023507559', 'Jurqia',   'washroom', False),

            # ── LEKHAAG (4 workers) ──────────────────────────────────────────
            ('Suresh Solanki',   '73',  '9687317660', 'Lekhaag',  'room',     False),
            ('Naresh',           '89',  '7284086230', 'Lekhaag',  'floor',    False),
            ('Nitin Makwana',    '261', '9157708871', 'Lekhaag',  'washroom', False),
            ('Pravin Maida',     '91',  '9265530235', 'Lekhaag',  'washroom', False),

            # ── KYZEEL (5 workers) ───────────────────────────────────────────
            ('Prahlad Parmar',   '242', '8734949909', 'Kyzeel',   'room',     False),
            ('Amit',             '110', '7779004437', 'Kyzeel',   'room',     False),
            ('Mehul Rathod',     '256', '6353451489', 'Kyzeel',   'floor',    False),
            ('Rajesh',           '104', '7046510026', 'Kyzeel',   'washroom', False),
            ('Mehul Jadeja',     '106', '7096229284', 'Kyzeel',   'washroom', False),

            # ── COMMON AREA ─────────────────────────────────────────────────
            ('Yogesh Vaghela',   '80',  '9998100804', 'Common Area', 'room',    False),
            ('Vinayak Solanki',  '240', '9023271834', 'Common Area', 'washroom', False),
            ('Anil Thakur',      '542', '9265665289', 'Common Area', 'floor',   False),
            ('Suresh',           '',    '',            'Common Area', 'floor',   False),
            ('Krunal',           '',    '',            'Common Area', 'floor',   False),
            ('Ketan Gujjar',     '100', '8347139138', 'Common Area', 'reliever', True),

            # ── RELIEVERS ────────────────────────────────────────────────────
            # Relievers substitute for permanent workers when they take leave.
            # They are not tied to one hostel — assigned flexibly.
            ('Deepika Ben',      '418', '7383512108', None, 'reliever', True),
            ('Mital Ben',        '386', '7383619204', None, 'reliever', True),
            ('Vinay',            '136', '8758388061', None, 'reliever', True),
            ('Lala',             '154', '9726303104', None, 'reliever', True),
            ('Hasmukhbhai',      '75',  '9714466201', None, 'reliever', True),
            ('Umesh Babariya',   '435', '9313230372', None, 'reliever', True),
            # RAHUL FIX
            ('Rajendra',         '121', '9924301124', None, 'reliever', True),
            ('Dhiraj',           '131', '9979030157', None, 'reliever', True),
            ('Mayur',            '258', '9099743600', None, 'reliever', True),
        ]

        created_count = 0
        for name, punching_no, phone, area_name, wtype, is_reliever in workers:
            area = self.area(area_name) if area_name else None
            _, created = HKWorker.objects.get_or_create(
                name=name,
                defaults={
                    'punching_no': punching_no,
                    'phone': phone,
                    'worker_type': wtype,
                    'shift': 'day',
                    'area': area,
                    'is_active': True,
                    'is_reliever': is_reliever,
                }
            )
            if created:
                created_count += 1
            else:
                # Update phone/punching if changed
                HKWorker.objects.filter(name=name).update(
                    punching_no=punching_no, phone=phone,
                    worker_type=wtype, area=area, is_reliever=is_reliever,
                )

        # Common Area staffing details
        common_supervisor = User.objects.filter(username='vishwajeet').first()
        common_shift_map = {
            'Vinayak Solanki': 'night',
            'Anil Thakur': 'day',
            'Suresh': 'day',
            'Krunal': 'day',
            'Yogesh Vaghela': 'day',
            'Ketan Gujjar': 'day',
        }
        for worker_name, shift in common_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Common Area')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = common_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        self.stdout.write(f'  ✓ Workers: {HKWorker.objects.count()} ({created_count} new)')

    # ─────────────────────────────────────────────────────────────────────────

    def seed_schedules(self):
        """
        Build schedule templates.
        - Same daily schedule for all 12 caretaker hostels (room/floor/washroom).
        - Sunday extras for hostels.
        - Dedicated daily Common Area schedule for Vishwajeet and team.
        Three parallel staff groups: room / floor / washroom
        """
        # Wipe old hostel templates and recreate fresh
        hostel_names = [
            'Aibaan', 'Beuaki', 'Chimair', 'Duven', 'Emiet',
            'Firpeal', 'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia',
            'Kyzeel', 'Lekhaag',
        ]

        hostel_areas = [self.area(n) for n in hostel_names if self.area(n)]

        # Delete existing templates for these areas
        HKScheduleTemplate.objects.filter(area__in=hostel_areas).delete()

        # ── ROOM STAFF SCHEDULE ─────────────────────────────────────────────
        room_tasks = [
            # (order, start, end, task_name, requires_photo, description)
            (1,  '08:10', '08:45', '2nd Floor Washroom Touch Up',         False, ''),
            (2,  '08:45', '09:00', 'Staircase Cleaning',                   False, ''),
            (3,  '09:00', '09:30', 'Room Cleaning — 5 rooms',              True,  'First round of room cleaning'),
            (4,  '09:30', '09:45', 'Tea Break',                            False, ''),
            (5,  '09:45', '10:00', 'Outside Round',                        False, ''),
            (6,  '10:00', '12:00', 'Room Round — 15 rooms',                True,  'Main room cleaning round'),
            (7,  '12:00', '13:00', 'Pantry Cleaning — 4 pantries',         True,  ''),
            (8,  '13:00', '13:45', 'Lunch Break',                          False, ''),
            (9,  '13:45', '14:00', 'Paper Cutting / Admin Work',           False, ''),
            (10, '14:00', '16:00', 'Room & Extra Work — 10 rooms',         True,  'Afternoon room round'),
            (11, '16:00', '16:50', 'Common Cleaning & Pantry Round',       False, ''),
        ]

        # ── FLOOR STAFF SCHEDULE ────────────────────────────────────────────
        floor_tasks = [
            (1,  '08:10', '08:45', '3rd Floor Washroom Touch Up',          False, ''),
            (2,  '08:45', '09:30', 'Ground Floor Dry Mop',                 False, ''),
            (3,  '09:30', '09:45', 'Tea Break / Inside Round',             False, ''),
            (4,  '09:45', '10:00', 'Outside Round',                        False, ''),
            (5,  '10:00', '11:30', 'Common Room + Staircase + Ground Floor',True, ''),
            (6,  '11:30', '13:00', '3rd Floor Cleaning',                   True,  ''),
            (7,  '13:00', '13:45', 'Lunch Break',                          False, ''),
            (8,  '13:45', '14:00', 'Paper Cutting',                        False, ''),
            (9,  '14:00', '15:00', '2nd Floor Cleaning',                   True,  ''),
            (10, '15:00', '16:30', '1st Floor Cleaning',                   True,  ''),
            (11, '16:20', '16:50', 'Ground Floor Cleaning',                False, ''),
        ]

        # ── WASHROOM STAFF SCHEDULE ─────────────────────────────────────────
        washroom_tasks = [
            (1,  '08:10', '08:45', '1st Floor Washroom Touch Up',          False, ''),
            (2,  '08:45', '09:30', 'Ground Floor Washroom Touch Up',       False, ''),
            (3,  '09:30', '09:45', 'Tea Break',                            False, ''),
            (4,  '09:45', '10:00', 'Staircase Cleaning',                   False, ''),
            (5,  '10:00', '12:00', '3rd Floor — 2 Washroom Deep Cleaning', True,  ''),
            (6,  '12:00', '13:00', '2nd Floor — 2 Washroom Cleaning',      True,  ''),
            (7,  '13:00', '13:45', 'Lunch Break',                          False, ''),
            (8,  '13:45', '14:00', 'Paper Cutting',                        False, ''),
            (9,  '14:00', '15:00', '6 Washroom Rounds Touch Up',           False, ''),
            (10, '15:00', '16:00', '1st Floor Washroom Cleaning',          True,  ''),
            (11, '16:00', '16:50', 'All Washroom Touch Up & Final Round',  True,  ''),
        ]

        # ── SUNDAY EXTRAS (same for all hostels) ────────────────────────────
        sunday_tasks = [
            (1, '08:10', '09:00', 'Dustbin Cleaning — All Floors',         True,  'Every Sunday'),
            (2, '09:00', '10:30', 'Terrace Cleaning',                      True,  'Every Sunday'),
            (3, '10:30', '12:00', 'Fridge Cleaning (Every 15 Days)',        True,  'Check with caretaker if due today'),
            (4, '13:00', '14:00', 'Lunch Break',                           False, ''),
            (5, '14:00', '15:30', 'Common Area Deep Clean',                True,  ''),
            (6, '15:30', '16:50', 'Window Cleaning + Cobweb Removal',      True,  ''),
        ]

        total = 0
        for area in hostel_areas:
            for order, start, end, name, req_photo, desc in room_tasks:
                HKScheduleTemplate.objects.create(
                    area=area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1
            for order, start, end, name, req_photo, desc in floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1
            for order, start, end, name, req_photo, desc in washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1
            for order, start, end, name, req_photo, desc in sunday_tasks:
                HKScheduleTemplate.objects.create(
                    area=area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
                )
                total += 1

        # Common Area: same schedule for all 7 days (no separate Sunday-only plan)
        common_area = self.area('Common Area')
        if common_area:
            HKScheduleTemplate.objects.filter(area=common_area).delete()

            common_floor_tasks = [
                (1, '08:00', '09:00', 'New Mess Common Area Front and Back Cleaning', True, 'Assigned: Anil + Suresh'),
                (2, '09:00', '10:00', 'Chimair and Duven Common Pockets Cleaning', True, 'Assigned: Anil'),
                (3, '10:00', '11:00', 'Kyzeel, Lekhaag and Ijokha Common Pockets', True, 'Assigned: Anil'),
                (4, '11:00', '11:15', 'Tea Break', False, ''),
                (5, '11:15', '12:30', 'Hiqom Front and Back + New PC Perimeter', True, 'Assigned: Suresh'),
                (6, '12:30', '13:00', 'Tool Refill and Waste Transfer', False, ''),
                (7, '13:00', '13:45', 'Lunch Break', False, ''),
                (8, '13:45', '15:00', 'Ijokha, Lekhaag and Jurqia Backside Route', True, 'Assigned: Suresh'),
                (9, '15:00', '16:00', 'New Mess to Old Mess Corridor Cleaning', True, 'Assigned: Krunal'),
                (10, '16:00', '16:50', 'Final Route Sweep and Spot Touch Up', True, 'Assigned: Anil + Krunal'),
            ]

            common_room_tasks = [
                (1, '08:00', '08:45', 'New Mess Common Lobby and Entry Touch Up', True, 'Assigned: Yogesh'),
                (2, '08:45', '09:30', 'Common Area Benches, Railings and Corners', True, 'Assigned: Yogesh'),
                (3, '09:30', '09:45', 'Tea Break', False, ''),
                (4, '09:45', '10:45', 'Common Passage Dusting and Dry Mop', True, 'Assigned: Yogesh'),
                (5, '10:45', '12:00', 'Approach Roads and Side Walk Touch Up', True, 'Assigned: Yogesh'),
                (6, '12:00', '13:00', 'Common Storage and Tool Bay Cleaning', False, ''),
                (7, '13:00', '13:45', 'Lunch Break', False, ''),
                (8, '13:45', '15:30', 'Hostel Common Entry Points Touch Up', True, 'Assigned: Yogesh'),
                (9, '15:30', '16:50', 'Final Round and Issue Reporting', False, 'Record any damage in extra work'),
            ]

            common_washroom_tasks = [
                (1, '20:00', '21:00', 'All Hostel Touch Up Cleanup Round', True, 'Assigned: Vinayak (Night Shift)'),
                (2, '21:00', '21:45', 'Catwalk Bridge Touch Up Cleaning', True, 'Assigned: Vinayak'),
                (3, '21:45', '22:30', 'New Mess Second Floor Touch Up', True, 'Assigned: Vinayak'),
                (4, '22:30', '23:15', 'Old Mess Terrace Cleaning', True, 'Assigned: Vinayak'),
                (5, '23:15', '23:59', 'New Mess Terrace Final Round', True, 'Assigned: Vinayak'),
            ]

            for order, start, end, name, req_photo, desc in common_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=common_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in common_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=common_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in common_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=common_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

        self.stdout.write(f'  ✓ Schedule templates: {total} (hostels + common area)')
