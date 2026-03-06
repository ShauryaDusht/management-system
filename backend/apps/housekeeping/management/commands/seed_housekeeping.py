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

        # Data migration-on-seed:
        # Rename legacy "Common Area" to "Hostel Common Area" so existing DBs
        # and fresh setups stay aligned with current nomenclature.
        legacy_common = HKArea.objects.filter(name='Common Area').first()
        if legacy_common and not HKArea.objects.filter(name='Hostel Common Area').exists():
            legacy_common.name = 'Hostel Common Area'
            legacy_common.area_type = 'hostel'
            legacy_common.is_active = True
            legacy_common.save(update_fields=['name', 'area_type', 'is_active'])

        other_areas = [
            ('Research Park', 'research_park'),
            ('Central Arcade', 'central_arcade'),
            ('Sports Complex', 'sports'),
            ('Roads & Outdoor', 'roads'),
            ('Solid Waste Management', 'swm'),
            ('Guest House New', 'guesthouse'),
            ('Guest House Old RB', 'guesthouse'),
            ('Director Bungalow', 'director'),
            ('Academic Block 1', 'academic'),
            ('Academic Block 2', 'academic'),
            ('Academic Block 3', 'academic'),
            ('Academic Block 4', 'academic'),
            ('Academic Block 5', 'academic'),
            ('Academic Block 6', 'academic'),
            ('Academic Block 7', 'academic'),
            ('Academic Block 8', 'academic'),
            ('Academic Block 9', 'academic'),
            ('Academic Block 10', 'academic'),
            ('Academic Block 11', 'academic'),
            ('Academic Block 12', 'academic'),
            ('Academic Block 13', 'academic'),
            ('Academic Common Area', 'academic'),
            ('New AB U-Shape', 'academic'),
            ('New Academy', 'academic'),
            ('Hostel Common Area', 'hostel'),
        ]
        for name, atype in other_areas:
            HKArea.objects.get_or_create(name=name, defaults={'area_type': atype})

        # Ensure Hostel Common Area is always treated as a hostel segment
        # even on existing databases where older seeds set it as "other".
        HKArea.objects.filter(name='Hostel Common Area').update(area_type='hostel', is_active=True)

        # Legacy consolidated academic records are kept inactive for history,
        # but excluded from active dashboards and assignments.
        HKArea.objects.filter(name__in=['Academic Blocks 1-9', 'Academic Blocks 10-13']).update(is_active=False)

        self.stdout.write(f'  ✓ Areas: {HKArea.objects.count()}')

    def area(self, name):
        return HKArea.objects.filter(name=name).first()

    def make_user(self, username, first_name, last_name, phone, role, area_names):
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
        # Phone sync policy:
        # - New users: apply seed phone (or blank).
        # - Existing users: fill only if DB phone is blank.
        # This keeps admin-edited phones stable across restarts.
        if created:
            user.phone = phone or ''
        elif phone and not user.phone:
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
            ('vishwajeet', 'Vishwajeet', '', '9898037530', ['Hostel Common Area']),
        ]
        for username, first, last, phone, areas in caretakers:
            self.make_user(username, first, last, phone, 'caretaker', areas)

        # Supervisors (campus sections)
        supervisors = [
            ('ashok.rathod', 'Ashok', 'Rathod', '7016722524', ['Guest House New', 'Director Bungalow']),
            ('kaushik.parmar', 'Kaushik', 'Parmar', '9825504802', ['Academic Block 12', 'Academic Block 13', 'New Academy']),
            ('shailesh.prajapati', 'Shailesh', 'Prajapati', '9898477320', ['Academic Block 10', 'Academic Block 11', 'New AB U-Shape']),
            ('maulik.patel', 'Maulik', 'Patel', '8758363879', ['Research Park']),
            ('bharat.solanki', 'Bharat', 'Solanki', '8511764551', ['Sports Complex', 'Central Arcade']),
            ('mukesh.vaghela', 'Mukesh', 'Vaghela', '9265591836', ['Academic Block 1', 'Academic Block 2', 'Academic Block 5', 'Academic Block 6', 'Academic Block 8']),
            ('bipin.vaghela', 'Bipin', 'Vaghela', '9979627312', ['Academic Block 3', 'Academic Block 4', 'Academic Block 7', 'Academic Block 9', 'Academic Common Area']),
            ('narendra.shreemali', 'Narendra', 'Shreemali', '9898661986', ['Roads & Outdoor', 'Guest House Old RB']),
            ('pradip.swm', 'Pradip', '', '8200560889', ['Solid Waste Management']),
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
            ('admin', 'Admin', '', '9727757096', 'admin', []),
            ('estate.manager', 'Estate', 'Manager', '', 'manager', []),
            ('hostel.manager', 'Hostel', 'Manager', '', 'manager', []),
            ('inv.manager', 'Inventory', 'Manager', '8758120645', 'inventory_manager', []),
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
            ('Yogesh Vaghela',   '80',  '9998100804', 'Hostel Common Area', 'room',    False),
            ('Vinayak Solanki',  '240', '9023271834', 'Hostel Common Area', 'washroom', False),
            ('Anil Thakur',      '542', '9265665289', 'Hostel Common Area', 'floor',   False),
            ('Suresh',           '',    '',            'Hostel Common Area', 'floor',   False),
            ('Krunal',           '',    '',            'Hostel Common Area', 'floor',   False),
            ('Ketan Gujjar',     '100', '8347139138', 'Hostel Common Area', 'reliever', True),

            # ── RESEARCH PARK ───────────────────────────────────────────────
            ('Mahesh Solanki',     '', '7046959603', 'Research Park', 'floor',    False),
            ('Ajay Thakor',        '', '8780940745', 'Research Park', 'floor',    False),
            ('Shailesh Vaghela',   '', '7284950619', 'Research Park', 'room',     False),
            ('Dharmishtaben',      '', '9328002335', 'Research Park', 'washroom', False),

            # ── CENTRAL ARCADE ──────────────────────────────────────────────
            ('Vijay Parmar',       '', '9824347940', 'Central Arcade', 'floor',    False),
            ('Bhavnaben',          '', '7041174657', 'Central Arcade', 'room',     False),
            ('Ramesh Parmar',      '', '7203906051', 'Central Arcade', 'washroom', False),
            ('Hasmukh Solanki',    '', '9727858924', 'Central Arcade', 'general',  False),

            # ── SPORTS COMPLEX ──────────────────────────────────────────────
            ('Anita Solanki',      '', '8401679845', 'Sports Complex', 'floor',    False),
            ('Retuben Solanki',    '', '6356838847', 'Sports Complex', 'room',     False),
            ('Uttam Vaghela',      '', '6353089004', 'Sports Complex', 'room',     False),
            ('Sohil Vaghela',      '', '9904962725', 'Sports Complex', 'washroom', False),
            ('Rahul Vaghela',      '', '8734964743', 'Sports Complex', 'washroom', False),
            ('Rajendra Chavda',    '', '9016476894', 'Sports Complex', 'floor',    False),
            ('Akshay Parmar',      '', '9265622322', 'Sports Complex', 'floor',    False),
            ('Jaydeep Vaghela',    '', '7487803489', 'Sports Complex', 'reliever', True),
            ('Chirag Vaghela',     '', '7698612980', 'Sports Complex', 'general',  False),
            ('Harsh',              '', '7486922273', 'Sports Complex', 'general',  False),
            ('Nikhil',             '', '7572829754', 'Sports Complex', 'general',  False),
            ('Ramesh Sports',      '', '9904319434', 'Sports Complex', 'general',  False),

            # Guest House New
            ('Pankaj Parmar',      '', '', 'Guest House New', 'floor',    False),
            ('Hitesh Vaghela',     '', '', 'Guest House New', 'washroom', False),
            ('Dhaval Jadeja',      '', '', 'Guest House New', 'room',     False),
            ('Ajay Purabiya',      '', '', 'Guest House New', 'room',     False),
            ('Sumit Solanki',      '', '', 'Guest House New', 'room',     False),
            ('Shailesh Ravel',     '', '', 'Guest House New', 'washroom', False),
            ('Sanjay Vaghela',     '', '', 'Guest House New', 'washroom', False),
            ('Anil Thakor',        '', '', 'Guest House New', 'general',  False),
            ('Gautam Parmar',      '', '', 'Guest House New', 'floor',    False),
            ('Raju Chamar',        '', '', 'Guest House New', 'reliever', True),
            ('Lalit Parmar',       '', '', 'Guest House New', 'reliever', True),

            # Director Bungalow
            ('Shailesh Vaghela',   '', '', 'Director Bungalow', 'general', False),
            ('Rakesh Parmar',      '', '', 'Director Bungalow', 'general', False),

            # SWM (Solid Waste Management) - Biogas workers intentionally excluded
            ('Salesh bhai Thakur',    '', '9723045094', 'Solid Waste Management', 'swm', False),
            ('Satish bhai Raval',     '', '9157865695', 'Solid Waste Management', 'swm', False),
            ('Jitendra bhai Thakur',  '', '8780211472', 'Solid Waste Management', 'swm', False),
            ('Naveenbhai Chauhan',    '', '9737949563', 'Solid Waste Management', 'swm', False),
            ('Rajnibhai Parmar',      '', '8758216753', 'Solid Waste Management', 'swm', False),
            ('Dineshbhai Purohit',    '', '6351446589', 'Solid Waste Management', 'swm', False),
            ('Baldevbhai Vaghela',    '', '9558464772', 'Solid Waste Management', 'swm', False),
            ('Saleshbhai Vaghela',    '', '6351150573', 'Solid Waste Management', 'swm', False),
            ('Kanti bhai Thakur',     '', '9924375528', 'Solid Waste Management', 'swm', False),

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
            worker, created = HKWorker.objects.get_or_create(
                name=name,
                area=area,
                defaults={
                    'punching_no': punching_no,
                    'phone': phone,
                    'worker_type': wtype,
                    'shift': 'day',
                    'is_active': True,
                    'is_reliever': is_reliever,
                }
            )
            if created:
                created_count += 1
            else:
                # Update phone/punching if changed
                worker.punching_no = punching_no
                worker.phone = phone
                worker.worker_type = wtype
                worker.is_reliever = is_reliever
                worker.shift = worker.shift or 'day'
                worker.is_active = True
                worker.save(update_fields=[
                    'punching_no', 'phone', 'worker_type',
                    'is_reliever', 'shift', 'is_active',
                ])

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
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Hostel Common Area')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = common_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # Research Park staffing details
        research_supervisor = User.objects.filter(username='maulik.patel').first()
        research_shift_map = {
            'Mahesh Solanki': 'day',
            'Ajay Thakor': 'day',
            'Shailesh Vaghela': 'day',
            'Dharmishtaben': 'day',
        }
        for worker_name, shift in research_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Research Park')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = research_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # Central Arcade staffing details
        bharat_supervisor = User.objects.filter(username='bharat.solanki').first()
        central_shift_map = {
            'Vijay Parmar': 'day',
            'Bhavnaben': 'day',
            'Ramesh Parmar': 'day',
            'Hasmukh Solanki': 'day',
        }
        for worker_name, shift in central_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Central Arcade')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = bharat_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # Sports Complex staffing details
        sports_shift_map = {
            'Anita Solanki': 'day',
            'Retuben Solanki': 'day',
            'Uttam Vaghela': 'day',
            'Sohil Vaghela': 'evening',
            'Rahul Vaghela': 'evening',
            'Rajendra Chavda': 'evening',
            'Akshay Parmar': 'evening',
            'Jaydeep Vaghela': 'day',
            'Chirag Vaghela': 'day',
            'Harsh': 'day',
            'Nikhil': 'day',
            'Ramesh Sports': 'day',
        }
        for worker_name, shift in sports_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Sports Complex')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = bharat_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # Guest House New + Director Bungalow staffing details
        ashok_supervisor = User.objects.filter(username='ashok.rathod').first()
        guest_house_shift_map = {
            'Pankaj Parmar': 'day',
            'Hitesh Vaghela': 'day',
            'Dhaval Jadeja': 'day',
            'Ajay Purabiya': 'day',
            'Sumit Solanki': 'day',
            'Shailesh Ravel': 'evening',
            'Sanjay Vaghela': 'evening',
            'Anil Thakor': 'night',
            'Gautam Parmar': 'day',
            'Raju Chamar': 'day',
            'Lalit Parmar': 'day',
        }
        for worker_name, shift in guest_house_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Guest House New')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = ashok_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        director_shift_map = {
            'Shailesh Vaghela': 'day',
            'Rakesh Parmar': 'day',
        }
        for worker_name, shift in director_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Director Bungalow')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = ashok_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # SWM staffing details
        swm_supervisor = User.objects.filter(username='pradip.swm').first()
        swm_shift_map = {
            'Salesh bhai Thakur': 'day',
            'Satish bhai Raval': 'day',
            'Jitendra bhai Thakur': 'day',
            'Naveenbhai Chauhan': 'day',
            'Rajnibhai Parmar': 'day',
            'Dineshbhai Purohit': 'day',
            'Baldevbhai Vaghela': 'day',
            'Saleshbhai Vaghela': 'day',
            'Kanti bhai Thakur': 'day',
        }
        for worker_name, shift in swm_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Solid Waste Management')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = swm_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        self.stdout.write(f'  ✓ Workers: {HKWorker.objects.count()} ({created_count} new)')

    # ─────────────────────────────────────────────────────────────────────────

    def seed_schedules(self):
        """
        Build schedule templates.
        - Same daily schedule for all 12 caretaker hostels (room/floor/washroom).
        - Sunday extras for hostels.
        - Dedicated daily Hostel Common Area schedule for Vishwajeet and team.
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

        # Hostel Common Area: same schedule for all 7 days (no separate Sunday-only plan)
        common_area = self.area('Hostel Common Area')
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

        # Research Park: worker-wise schedule (Mon-Sat) + Sunday deep cleaning
        research_park = self.area('Research Park')
        if research_park:
            HKScheduleTemplate.objects.filter(area=research_park).delete()

            rp_floor_tasks = [
                (1, '08:00', '08:30', 'Mahesh: GF + 3F Gents and Handicap Washroom Touch Up', True, ''),
                (2, '08:30', '09:00', 'Mahesh: Admin Office Cleaning', True, ''),
                (3, '09:00', '09:20', 'Mahesh: Board Room Cleaning', True, ''),
                (4, '09:20', '10:00', 'Mahesh: Fountain Common Area Cleaning', True, ''),
                (5, '10:00', '10:15', 'Mahesh: Tea Break', False, ''),
                (6, '10:15', '11:00', 'Mahesh: Classroom Cleaning', True, ''),
                (7, '11:00', '12:15', 'Mahesh: GF + 3F Gents and Handicap Washroom Cleaning', True, ''),
                (8, '12:15', '13:00', 'Mahesh: Conference Room Cleaning', True, ''),
                (9, '13:00', '14:00', 'Mahesh: Lunch Break', False, ''),
                (10, '14:00', '14:30', 'Mahesh: GF + 3F Washroom Touch Up', True, ''),
                (11, '14:30', '16:30', 'Mahesh: Building Inside 2 Staircase + Railing Dusting', True, ''),
                (12, '16:30', '17:00', 'Mahesh: GF + 3F Washroom Touch Up', True, ''),

                (13, '09:00', '09:45', 'Ajay: 2 Office Cleaning', True, 'Senior shift 9:00 AM to 6:00 PM'),
                (14, '09:45', '11:15', 'Ajay: Ground Floor Cleaning', True, ''),
                (15, '11:15', '11:30', 'Ajay: Tea Break', False, ''),
                (16, '11:30', '12:00', 'Ajay: 1 Office Cleaning', True, ''),
                (17, '12:00', '12:30', 'Ajay: Ground Floor All Dusting', True, ''),
                (18, '12:30', '13:00', 'Ajay: Lift and CCTV Room Cleaning', True, ''),
                (19, '13:00', '14:00', 'Ajay: Lunch Break', False, ''),
                (20, '14:00', '14:30', 'Ajay: Ground Floor Touch Up', True, ''),
                (21, '14:30', '15:15', 'Ajay: 2 Office Cleaning', True, ''),
                (22, '15:15', '16:00', 'Ajay: Building Inside Staircase + Railing Dusting', True, ''),
                (23, '16:00', '17:30', 'Ajay: Building Outside 2 Staircase + Railing Dusting', True, ''),
                (24, '17:30', '18:00', 'Ajay: All Floor Gents Washroom Touch Up', True, ''),
            ]

            rp_room_tasks = [
                (1, '08:00', '08:30', 'Shailesh: 2F Gents and Handicap Washroom Touch Up', True, ''),
                (2, '08:30', '10:00', 'Shailesh: Rooms 301 to 306 Office Cleaning', True, ''),
                (3, '10:00', '10:15', 'Shailesh: Tea Break', False, ''),
                (4, '10:15', '11:30', 'Shailesh: Rooms 309 to 314 Office Cleaning', True, ''),
                (5, '11:30', '12:15', 'Shailesh: 2F Gents and Handicap Washroom Cleaning', True, ''),
                (6, '12:15', '13:00', 'Shailesh: All Floor Dry Mop + Dusting', True, ''),
                (7, '13:00', '14:00', 'Shailesh: Lunch Break', False, ''),
                (8, '14:00', '14:20', 'Shailesh: 2F Gents and Handicap Washroom Touch Up', True, ''),
                (9, '14:20', '15:05', 'Shailesh: All Floor Mopping and Sweeping', True, ''),
                (10, '15:05', '16:00', 'Shailesh: Room 307/308 or Gym Room (Day-wise)', True, 'Mon/Wed/Fri: 307-308, Tue/Thu/Sat: Gym'),
                (11, '16:00', '16:45', 'Shailesh: Terrace and Office Duct Area', True, ''),
                (12, '16:45', '17:00', 'Shailesh: 2F Gents and Handicap Washroom Touch Up', True, ''),
            ]

            rp_washroom_tasks = [
                (1, '08:00', '08:45', 'Dharmishtaben: GF + 2F + 3F Ladies Washroom Touch Up', True, ''),
                (2, '08:45', '10:00', 'Dharmishtaben: Rooms 402, 403 and 404 Office Cleaning', True, ''),
                (3, '10:00', '10:15', 'Dharmishtaben: Tea Break', False, ''),
                (4, '10:15', '12:15', 'Dharmishtaben: GF + 2F + 3F Ladies Washroom Cleaning', True, ''),
                (5, '12:15', '13:00', 'Dharmishtaben: All Floor Cleaning', True, ''),
                (6, '13:00', '14:00', 'Dharmishtaben: Lunch Break', False, ''),
                (7, '14:00', '14:30', 'Dharmishtaben: GF + 2F + 3F Ladies Washroom Touch Up', True, ''),
                (8, '14:30', '14:45', 'Dharmishtaben: All Floor Dusting', True, ''),
                (9, '14:45', '15:20', 'Dharmishtaben: Room 405 and 406 Cleaning', True, ''),
                (10, '15:20', '15:55', 'Dharmishtaben: Room 407 and 408 Cleaning', True, ''),
                (11, '15:55', '16:30', 'Dharmishtaben: Room 401 Cleaning', True, ''),
                (12, '16:30', '16:40', 'Dharmishtaben: Terrace Area', True, ''),
                (13, '16:40', '17:00', 'Dharmishtaben: GF + 2F + 3F Ladies Washroom Touch Up', True, ''),
            ]

            rp_saturday_special = [
                (1, '15:00', '15:45', 'Saturday Special: Outside Area Cleaning', True, ''),
                (2, '15:45', '16:30', 'Saturday Special: Parking Area Sweeping', True, ''),
                (3, '16:30', '17:15', 'Saturday Special: Drain Checking', True, ''),
                (4, '17:15', '18:00', 'Saturday Special: Entry Gate Pressure Wash (If Required)', True, ''),
            ]

            rp_sunday_extra = [
                (1, '08:00', '10:00', 'Sunday Deep Clean: Floor Machine Cleaning (GF + 2F + 3F)', True, ''),
                (2, '10:00', '11:00', 'Sunday Deep Clean: Lift Deep Cleaning', True, ''),
                (3, '11:00', '12:00', 'Sunday Deep Clean: Glass Deep Cleaning', True, ''),
                (4, '12:00', '13:00', 'Sunday Deep Clean: Fountain Area Deep Cleaning', True, ''),
                (5, '14:00', '15:00', 'Sunday Deep Clean: Common Area Polishing', True, ''),
                (6, '15:00', '16:00', 'Monthly Work: Terrace + Water Tank Surrounding + Lift Shaft Dusting', True, 'Monthly cycle task'),
                (7, '16:00', '17:00', 'Monthly Work: Tile Scale Removal + Glass Full Building + Cooler Deep Clean', True, 'Monthly cycle task'),
            ]

            for order, start, end, name, req_photo, desc in rp_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=research_park, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in rp_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=research_park, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in rp_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=research_park, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in rp_saturday_special:
                HKScheduleTemplate.objects.create(
                    area=research_park, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='saturday_special', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in rp_sunday_extra:
                HKScheduleTemplate.objects.create(
                    area=research_park, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
                )
                total += 1

        # Central Arcade: handwritten worker-wise schedule + deep cleaning
        central_arcade = self.area('Central Arcade')
        if central_arcade:
            HKScheduleTemplate.objects.filter(area=central_arcade).delete()

            ca_floor_tasks = [
                (1, '08:00', '10:00', 'Vijay: Ground Floor Outside and Fire Entry Cleaning', True, ''),
                (2, '10:00', '11:00', 'Vijay: Fire and Entry Gate Round', True, ''),
                (3, '11:00', '13:00', 'Vijay: Ground Floor Washroom Round Cleaning', True, ''),
                (4, '13:00', '14:00', 'Vijay: Lunch Break', False, ''),
                (5, '14:00', '15:00', 'Vijay: Staircase Cleaning', True, ''),
                (6, '15:00', '16:00', 'Vijay: Basement/Equipment Area Cleaning', True, ''),
                (7, '16:00', '17:00', 'Vijay: Extra Work and Pending Points', True, ''),
            ]

            ca_room_tasks = [
                (1, '08:00', '10:00', 'Bhavnaben: 1st Floor Cleaning', True, ''),
                (2, '10:00', '11:00', 'Bhavnaben: Silver Room Cleaning', True, ''),
                (3, '11:00', '13:00', 'Bhavnaben: All 1st Floor Washroom Cleaning', True, ''),
                (4, '13:00', '14:00', 'Bhavnaben: Lunch Break', False, ''),
                (5, '14:00', '16:00', 'Bhavnaben: Hall Cleaning', True, ''),
                (6, '16:00', '17:00', 'Bhavnaben: Railing and Corner Dusting', True, ''),
            ]

            ca_washroom_tasks = [
                (1, '08:00', '10:30', 'Ramesh: 2nd Floor Floor and Lobby Cleaning', True, ''),
                (2, '10:30', '11:30', 'Ramesh: 2nd Floor Washroom Cleaning', True, ''),
                (3, '11:30', '13:00', 'Ramesh: Multi-purpose Room Cleaning', True, ''),
                (4, '13:00', '14:00', 'Ramesh: Lunch Break', False, ''),
                (5, '14:00', '15:00', 'Ramesh: Staircase Cleaning', True, ''),
                (6, '15:00', '17:00', 'Ramesh: Hall Cleaning', True, ''),
            ]

            ca_saturday_special = [
                (1, '15:00', '16:00', 'Saturday Special: Outside Area Cleaning', True, ''),
                (2, '16:00', '17:00', 'Saturday Special: Drain Check and Entry Gate Wash', True, ''),
            ]

            ca_sunday_extra = [
                (1, '08:00', '10:00', 'Deep Clean: Washroom (cobweb/lower tile/scale)', True, ''),
                (2, '10:00', '12:00', 'Deep Clean: Tanker/Service Zone and Floor Machine', True, ''),
                (3, '12:00', '13:00', 'Deep Clean: Hall and Corridor', True, ''),
                (4, '14:00', '16:00', 'Deep Clean: Ceiling, Vent and Glass', True, ''),
                (5, '16:00', '17:00', 'Deep Clean: Outside Railing and Final Polish', True, ''),
            ]

            for order, start, end, name, req_photo, desc in ca_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=central_arcade, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in ca_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=central_arcade, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in ca_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=central_arcade, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in ca_saturday_special:
                HKScheduleTemplate.objects.create(
                    area=central_arcade, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='saturday_special', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in ca_sunday_extra:
                HKScheduleTemplate.objects.create(
                    area=central_arcade, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
                )
                total += 1

        # Sports Complex: PDF schedule adapted as operational task plan
        sports_complex = self.area('Sports Complex')
        if sports_complex:
            HKScheduleTemplate.objects.filter(area=sports_complex).delete()

            sp_floor_tasks = [
                (1, '08:00', '09:30', 'Indoor Deep Clean: Ground Floor (Anita + Ramesh)', True, ''),
                (2, '09:30', '10:00', 'Main Entry and Corridor Cleaning', True, ''),
                (3, '10:00', '10:15', 'Tea Break', False, ''),
                (4, '10:15', '12:00', 'Open Gym and Gallery Floor Cleaning', True, ''),
                (5, '12:00', '13:00', 'Gents and Ladies Toilet Round 1', True, ''),
                (6, '13:00', '14:00', 'Lunch Break', False, ''),
                (7, '14:00', '15:30', 'Hall Floor and Railing Dusting', True, ''),
                (8, '15:30', '17:00', 'Badminton and Basketball Hall Dry Mop', True, ''),
                (9, '17:00', '18:00', 'Terrace and Corridor Detailing', True, ''),
                (10, '18:00', '19:00', 'Dinner Break (Sohil + Rahul)', False, ''),
                (11, '19:00', '21:00', 'Evening Shift: Swimming Pool and Volleyball Zone', True, ''),
                (12, '21:00', '23:00', 'Night Closing: Hall Windows, Lights and Main Door Lock', True, ''),
            ]

            sp_room_tasks = [
                (1, '08:00', '09:00', 'Yoga Hall and Office Cleaning', True, ''),
                (2, '09:00', '10:00', 'Table Tennis Hall Cleaning', True, ''),
                (3, '10:00', '10:15', 'Tea Break', False, ''),
                (4, '10:15', '11:30', 'Gym and Squash Court Cleaning', True, ''),
                (5, '11:30', '13:00', 'Ladies Toilet and Office 2 Cleaning', True, ''),
                (6, '13:00', '14:00', 'Lunch Break', False, ''),
                (7, '14:00', '15:30', 'Glass Cleaning: Gym/Yoga/Squash/TT', True, ''),
                (8, '15:30', '17:00', 'Trophy Showcase and Lower Glass Cleaning', True, ''),
                (9, '17:00', '19:00', 'Pavilion and Side Office Detailing', True, ''),
            ]

            sp_washroom_tasks = [
                (1, '08:00', '08:30', 'Deep Clean: Washroom, Fan and Lower Glass', True, ''),
                (2, '08:30', '10:00', 'Main Entry, Corridor and Open Gym Washroom', True, ''),
                (3, '10:00', '10:15', 'Tea Break', False, ''),
                (4, '10:15', '12:00', 'Mopping Gallery, Floor and Washroom Touch Up', True, ''),
                (5, '12:00', '13:00', 'Gents Toilet 2 Cleaning', True, ''),
                (6, '13:00', '14:00', 'Lunch Break', False, ''),
                (7, '14:00', '16:00', 'Specially Abled + Changing Washroom Deep Clean', True, ''),
                (8, '16:00', '17:00', 'Swimming Pool Washroom Cleaning (After Pool Bucket)', True, ''),
                (9, '22:00', '23:00', 'Final Washroom Sanitization', True, ''),
            ]

            sp_saturday_special = [
                (1, '10:00', '11:30', 'Outside: Gym Corridor to Neem Area and Parking', True, ''),
                (2, '11:30', '13:00', 'Outside: MS Jali to Pavilion Cleaning', True, ''),
                (3, '14:00', '15:30', 'Outside: Lawn Tennis 4 Courts', True, ''),
                (4, '15:30', '17:00', 'Outside: Hostel Basketball 2 Courts', True, ''),
                (5, '17:00', '17:30', 'Outside: Sports Complex Backside Parking', True, ''),
                (6, '17:30', '19:00', 'Outside: Pavilion and Surrounding Cleaning', True, ''),
            ]

            sp_sunday_extra = [
                (1, '08:00', '09:00', 'Deep Clean: Floor and Both Terrace', True, ''),
                (2, '09:00', '10:00', 'Badminton Hall 1 and 2 Floor Mopping', True, ''),
                (3, '10:30', '13:00', 'Basketball Hall Cleaning + Ladies/Gents Toilet', True, ''),
                (4, '14:00', '15:00', 'Swimming Pool and Gents Toilet Touch Up', True, ''),
                (5, '15:00', '16:30', 'Pavilion Railing and Outside Glass Cleaning', True, ''),
                (6, '16:30', '17:00', 'Dustbin Cleaning and Final Round', True, ''),
            ]

            for order, start, end, name, req_photo, desc in sp_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=sports_complex, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in sp_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=sports_complex, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in sp_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=sports_complex, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in sp_saturday_special:
                HKScheduleTemplate.objects.create(
                    area=sports_complex, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='saturday_special', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in sp_sunday_extra:
                HKScheduleTemplate.objects.create(
                    area=sports_complex, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
                )
                total += 1

        # Guest House New: worker-wise area and shift schedule
        guest_house = self.area('Guest House New')
        if guest_house:
            HKScheduleTemplate.objects.filter(area=guest_house).delete()

            gh_floor_tasks = [
                (1, '07:00', '09:00', 'Pankaj: Ground Floor Office, Reception and Front Corridor', True, 'Dusting, sweeping and mopping'),
                (2, '09:00', '11:00', 'Pankaj: Parking, Washroom and Lobby Touch Up', True, 'Ladies/Gents/Handicapped washroom, lobby and dining passage'),
                (3, '11:00', '13:00', 'Pankaj: Front Glass, Lift and Ground Floor Final Round', True, ''),
                (4, '13:00', '14:00', 'Pankaj: Lunch Break', False, ''),
                (5, '14:00', '14:15', 'Pankaj: Washroom Touch Up', True, ''),
                (6, '14:15', '14:45', 'Pankaj: Rooms Back Side Area Sweeping', True, ''),
                (7, '14:45', '15:30', 'Pankaj: Gym Area and Equipment Dusting', True, ''),
                (8, '15:30', '16:00', 'Pankaj: All Floor Coolers and Washroom Cleaning', True, ''),
                (9, '07:00', '09:00', 'Gautam: Dining Hall, Front Area, Washroom and Kitchen', True, 'Canteen and Gate duty'),
                (10, '09:00', '10:30', 'Gautam: Gate No. 01 Cleaning', True, ''),
                (11, '10:30', '11:30', 'Gautam: Gate No. 02 Cleaning', True, ''),
                (12, '11:30', '13:00', 'Gautam: Washroom and Kitchen Area Round 2', True, ''),
                (13, '13:00', '14:00', 'Gautam: Lunch Break', False, ''),
                (14, '14:00', '16:00', 'Gautam: Sewer Channel, Kitchen and Dustbin Washing', True, ''),
            ]

            gh_washroom_tasks = [
                (1, '08:00', '09:00', 'Hitesh: 1st to 4th Floor Common Washroom Cleaning', True, ''),
                (2, '09:00', '13:00', 'Hitesh: 1st to 4th Floor Lobby, Corridor and Railing', True, 'Dusting and sweeping'),
                (3, '13:00', '14:00', 'Hitesh: Lunch Break', False, ''),
                (4, '14:00', '16:00', 'Hitesh: 1st to 4th Floor Lobby and Corridor Sweeping', True, ''),
                (5, '16:00', '17:00', 'Hitesh: Extra Work (Railing, Louver, Fountain Area)', True, ''),
                (6, '13:00', '17:00', 'Shailesh + Sanjay: Staircase, Common Washroom, Dining and Open Hall', True, 'Evening washroom/staircase support'),
            ]

            gh_room_tasks = [
                (1, '08:00', '17:00', 'Dhaval + Ajay + Sumit: Checkout/Occupied/Vacant Rooms', True, 'Morning room operations'),
                (2, '17:00', '22:00', 'Shailesh + Sanjay: Evening Room Operations', True, 'Checkout/occupied/vacant room round'),
                (3, '22:00', '07:00', 'Anil: Night Shift All Work Coverage', True, 'Dining hall, common hall, meeting hall, conference hall, washrooms and rooms'),
            ]

            gh_special_tasks = [
                (1, '16:00', '16:20', 'Supervisor: Weekly Off and Reliever Roster Check', False,
                 'Mon Pankaj->Lalit, Tue Hitesh->Lalit, Wed Dhaval->Lalit, Thu Ajay->Raju, Fri Sanjay->Lalit, Sat Shailesh->Lalit + Anil->Raju, Sun Sumit/Gautam->Lalit'),
            ]

            for order, start, end, name, req_photo, desc in gh_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in gh_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in gh_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in gh_special_tasks:
                HKScheduleTemplate.objects.create(
                    area=guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

        director_bungalow = self.area('Director Bungalow')
        if director_bungalow:
            HKScheduleTemplate.objects.filter(area=director_bungalow).delete()

            db_floor_tasks = [
                (1, '08:00', '09:00', "Around Director's Bungalow Cleaning", True, 'Sweeping, mopping and dusting'),
                (2, '10:30', '11:30', 'Front/Backside + Garden + Natural Park Sweeping', True, ''),
                (3, '12:00', '13:00', 'Servant Quarter (Ground and First) Alternate Cleaning', True, ''),
                (4, '13:00', '14:00', 'Lunch Break', False, ''),
                (5, '16:00', '16:30', 'Kitchen Area Cleaning', True, ''),
            ]

            db_room_tasks = [
                (1, '09:00', '10:00', 'Inside Bungalow Cleaning', True, 'Sweeping, mopping and dusting'),
                (2, '14:00', '15:00', 'Floor Alternate Cleaning', True, 'Sweeping, mopping and dusting'),
                (3, '15:00', '16:00', 'Camp Office Alternate Cleaning', True, 'Sweeping, mopping and dusting'),
            ]

            db_washroom_tasks = [
                (1, '10:00', '10:15', 'Common Washroom Cleaning - Round 1', True, ''),
                (2, '12:30', '12:45', 'Common Washroom Cleaning - Round 2', True, ''),
                (3, '16:30', '16:45', 'Common Washroom Cleaning - Round 3', True, ''),
            ]

            db_special_tasks = [
                (1, '08:00', '08:15', 'Supervisor: Weekly Off Coverage Check', False, 'Shailesh weekly off Wednesday, Rakesh weekly off Monday'),
            ]

            db_saturday_special = [
                (1, '16:45', '17:00', 'Terrace Cleaning Weekly', True, 'Sweeping and mopping'),
            ]

            for order, start, end, name, req_photo, desc in db_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=director_bungalow, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in db_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=director_bungalow, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in db_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=director_bungalow, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in db_special_tasks:
                HKScheduleTemplate.objects.create(
                    area=director_bungalow, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in db_saturday_special:
                HKScheduleTemplate.objects.create(
                    area=director_bungalow, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='saturday_special', is_active=True,
                )
                total += 1

        # Solid Waste Management (SWM): worker-wise operations + Sunday deep cleaning
        swm_area = self.area('Solid Waste Management')
        if swm_area:
            HKScheduleTemplate.objects.filter(area=swm_area).delete()

            swm_collection_tasks = [
                (1, '07:45', '08:00', 'Attendance and Preparation (All SWM workers)', False, 'Attendance, tools, PPE and route confirmation'),
                (2, '08:00', '09:15', 'Housing Area Collection', True, 'Door-to-door wet and dry collection'),
                (3, '08:00', '09:15', 'Hostel Area Collection', True, 'Hostel waste collection and transfer'),
                (4, '09:15', '09:45', 'Break Time', False, 'Rest and equipment check'),
                (5, '10:15', '11:30', 'Secondary Collection and Bin Clearance', True, 'Campus bins and remaining points'),
                (6, '11:30', '13:00', 'Waste Transfer Support (All SWM workers)', True, 'Transfer remaining waste to AB-3'),
                (7, '13:00', '14:00', 'Lunch Break', False, ''),
                (8, '14:00', '15:30', 'Housing and Hostel Follow-up Collection', True, 'Second collection round'),
                (9, '15:30', '16:30', 'Final Waste Clearance (All routes)', True, 'Final bin check and area clearance'),
                (10, '16:30', '17:00', 'Closing Work and Report Handover', True, 'Tool cleanup and completion report'),
            ]

            swm_transport_tasks = [
                (1, '08:00', '09:15', 'Tempo Vehicle Collection', True, 'Mess, canteen, academic blocks, campus bins and guest house'),
                (2, '09:45', '10:15', 'Waste Unloading at AB-3 Segregation Area', True, 'Unload and stage for sorting'),
                (3, '10:15', '11:30', 'Vehicle Transport - Remaining Campus Bins', True, 'Carry remaining waste to segregation point'),
                (4, '11:30', '13:00', 'Recyclable Transfer Support', True, 'Dry recyclable transfer support'),
                (5, '13:00', '14:00', 'Lunch Break', False, ''),
                (6, '14:00', '15:30', 'Afternoon Vehicle Collection Run', True, 'Academic/event waste and follow-up collection'),
                (7, '15:30', '16:30', 'Final Waste Transport and Storage Cleanup', True, 'Final shift transport cycle'),
                (8, '16:30', '17:00', 'Tempo Parking and Day Close', True, 'Park vehicle and submit status'),
            ]

            swm_segregation_tasks = [
                (1, '09:45', '10:15', 'Segregation: Wet/Dry/Plastic/Paper/Cardboard', True, 'AB-3 segregation zone'),
                (2, '10:15', '11:30', 'Segregation Support and Sorting', True, 'Sort recyclable and mixed inflow'),
                (3, '11:30', '13:00', 'Waste Supply Support to Biogas Team', True, 'Only waste supply support, not plant operation'),
                (4, '13:00', '14:00', 'Lunch Break', False, ''),
                (5, '14:00', '15:30', 'Segregation Support for Second Collection', True, 'Handle second round inflow'),
                (6, '15:30', '16:30', 'Final Segregation and Storage Area Hygiene', True, 'Ensure no pending mixed waste'),
                (7, '16:30', '17:00', 'Supervisor Verification and Close', False, 'Checklist and final verification'),
            ]

            swm_sunday_extra = [
                (1, '08:00', '10:00', 'Sunday Deep Clean: Floor Machine Cleaning (campus priority points)', True, ''),
                (2, '10:00', '11:00', 'Sunday Deep Clean: Lift and Glass Deep Cleaning', True, ''),
                (3, '11:00', '12:00', 'Sunday Deep Clean: Fountain Area Deep Cleaning', True, ''),
                (4, '12:00', '13:00', 'Sunday Deep Clean: Common Area Polishing', True, ''),
                (5, '14:00', '15:00', 'Sunday Deep Clean: Segregation Bay Wash and Sanitization', True, ''),
                (6, '15:00', '16:00', 'Sunday Deep Clean: Final Disposal and Reporting', True, ''),
            ]

            for order, start, end, name, req_photo, desc in swm_collection_tasks:
                HKScheduleTemplate.objects.create(
                    area=swm_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in swm_transport_tasks:
                HKScheduleTemplate.objects.create(
                    area=swm_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in swm_segregation_tasks:
                HKScheduleTemplate.objects.create(
                    area=swm_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in swm_sunday_extra:
                HKScheduleTemplate.objects.create(
                    area=swm_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
                )
                total += 1

        self.stdout.write(
            f'  ✓ Schedule templates: {total} '
            '(hostels + common area + research park + central arcade + sports complex + guest house + director bungalow + swm)'
        )
