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
from apps.users.models import build_username_from_names, unique_standard_username

User = get_user_model()
DEFAULT_PASSWORD = 'IITGN@2025'


def t(s):
    """Parse 'HH:MM' to time object."""
    return datetime.datetime.strptime(s, '%H:%M').time()


def worker_key(value):
    """Normalize worker labels so legacy spellings can be matched safely."""
    return ''.join(ch.lower() for ch in (value or '') if ch.isalnum())


class Command(BaseCommand):
    help = 'Seed complete IITGN housekeeping master data (all real data)'

    def handle(self, *args, **options):
        if options.get('verbosity', 1) == 0:
            self.stdout.write = lambda *args, **kwargs: None

        self.stdout.write(self.style.SUCCESS('Starting complete housekeeping seed...'))

        self.seed_areas()
        self.seed_caretakers()
        self.seed_portal_accounts()
        self.cleanup_legacy_accounts()
        self.seed_workers()
        self.seed_schedules()

        self.stdout.write(self.style.SUCCESS(f'''
[OK] SEED COMPLETE
  Areas:     {HKArea.objects.count()}
  Users:     {User.objects.filter(role__in=["admin","inventory_manager","housekeeping_manager","horticulture_manager","caretaker","supervisor"]).count()}
  Workers:   {HKWorker.objects.count()}
  Templates: {HKScheduleTemplate.objects.count()}

Default password for newly created accounts: {DEFAULT_PASSWORD}
Existing account passwords are preserved.
        '''))

    # ─────────────────────────────────────────────────────────────────

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

        # Rename legacy guest house naming.
        legacy_old_guest = HKArea.objects.filter(name='Guest House Old RB').first()
        if legacy_old_guest and not HKArea.objects.filter(name='Old Guest House').exists():
            legacy_old_guest.name = 'Old Guest House'
            legacy_old_guest.area_type = 'guesthouse'
            legacy_old_guest.is_active = True
            legacy_old_guest.save(update_fields=['name', 'area_type', 'is_active'])

        legacy_old_academic_common = HKArea.objects.filter(name='Academic Common Area').first()
        if legacy_old_academic_common and not HKArea.objects.filter(name='Old Academic Common Area').exists():
            legacy_old_academic_common.name = 'Old Academic Common Area'
            legacy_old_academic_common.area_type = 'academic'
            legacy_old_academic_common.is_active = True
            legacy_old_academic_common.save(update_fields=['name', 'area_type', 'is_active'])

        legacy_new_academic_common = HKArea.objects.filter(name='New Academy').first()
        if legacy_new_academic_common and not HKArea.objects.filter(name='New Academic Common Area').exists():
            legacy_new_academic_common.name = 'New Academic Common Area'
            legacy_new_academic_common.area_type = 'academic'
            legacy_new_academic_common.is_active = True
            legacy_new_academic_common.save(update_fields=['name', 'area_type', 'is_active'])

        legacy_old_academic_reliever = HKArea.objects.filter(name='Academic Block 8').first()
        if legacy_old_academic_reliever and not HKArea.objects.filter(name='Old Academic Reliever').exists():
            legacy_old_academic_reliever.name = 'Old Academic Reliever'
            legacy_old_academic_reliever.area_type = 'academic'
            legacy_old_academic_reliever.is_active = True
            legacy_old_academic_reliever.save(update_fields=['name', 'area_type', 'is_active'])

        other_areas = [
            ('Research Park', 'research_park'),
            ('Central Arcade', 'central_arcade'),
            ('Sports Complex', 'sports'),
            ('Roads & Outdoor', 'roads'),
            ('Solid Waste Management', 'swm'),
            ('Guest House New', 'guesthouse'),
            ('Old Guest House', 'guesthouse'),
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
            ('Old Academic Common Area', 'academic'),
            ('New AB U-Shape', 'academic'),
            ('New Academic Common Area', 'academic'),
            ('Old Academic Reliever', 'academic'),
            ('New Academic Reliever', 'academic'),
            ('Hostel Common Area', 'hostel'),
            ('Hostels Reliever', 'hostel'),
        ]
        for name, atype in other_areas:
            HKArea.objects.get_or_create(name=name, defaults={'area_type': atype})

        # Ensure Hostel Common Area is always treated as a hostel segment
        # even on existing databases where older seeds set it as "other".
        HKArea.objects.filter(name='Hostel Common Area').update(area_type='hostel', is_active=True)
        HKArea.objects.filter(name='Hostels Reliever').update(area_type='hostel', is_active=True)

        # Legacy consolidated academic records are kept inactive for history,
        # but excluded from active dashboards and assignments.
        HKArea.objects.filter(name__in=['Academic Blocks 1-9', 'Academic Blocks 10-13']).update(is_active=False)

        self.stdout.write(f'  [OK] Areas: {HKArea.objects.count()}')

    def area(self, name):
        return HKArea.objects.filter(name=name).first()

    def make_user(self, username, first_name, last_name, phone, role, area_names, email='', pay_code='', match_pay_code=True):
        is_superuser = role == 'admin'
        is_staff = role in {'admin', 'inventory_manager', 'housekeeping_manager', 'hk_inventory_manager', 'horticulture_manager'}
        base_username = build_username_from_names(first_name, last_name)
        username_candidates = [base_username, username]
        if pay_code and match_pay_code:
            username_candidates.append(
                User.objects.filter(role=role, pay_code=pay_code).values_list('username', flat=True).first()
            )
        user = User.objects.filter(username__in=[u for u in username_candidates if u]).first()
        canonical_username = unique_standard_username(
            first_name,
            last_name,
            model=User,
            exclude_pk=getattr(user, 'pk', None),
        )

        if user is None:
            user = User(
                username=canonical_username,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                role=role,
                is_active=True,
                is_staff=is_staff,
                is_superuser=is_superuser,
                email=email,
                pay_code=pay_code,
            )
            created = True
        else:
            created = False
            if user.username != canonical_username:
                user.username = unique_standard_username(
                    first_name,
                    last_name,
                    model=User,
                    exclude_pk=user.pk,
                )
        user.first_name = first_name
        user.last_name = last_name
        if email:
            user.email = email
        if pay_code:
            user.pay_code = pay_code
            
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

    # ─────────────────────────────────────────────────────────────────

    def seed_caretakers(self):
        """
        All caretaker logins. Username = firstname.lastname or firstname only.
        """
        caretakers = [
            # (username, first, last, pay_code, phone, email, areas)
            ('priyanka.parmar', 'Priyanka Vijaykumar', 'Parmar', '237', '6353228604', 'priyankavijayparmar27@gmail.com', ['Aibaan']),
            ('manisha.thapa', 'Manisha', 'Thapa', '424', '9512389739', 'anitavaghela98@gmail.com', ['Beuaki', 'Chimair']),
            ('rhushita.chavda', 'Rhushita Chetankumar', 'Chavda', '294', '7083740424', '', ['Ijokha']),
            ('pankaj.bihola', 'Pankajsinh Amarsinh', 'Bihola', '293', '9904883975', 'pankajsingh2753@gmail.com', ['Duven', 'Emiet']),
            ('anil.solanki', 'Anil', 'Solanki', '300', '8155037413', 'anil8155037413@gmail.com', ['Firpeal', 'Griwiksh']),
            ('nikul.bihola', 'Nikulsinh Ashoksinh', 'Bihola', '427', '9714730290', 'nikulsinghbhola862@gmail.com', ['Hiqom']),
            ('jaimin.parmar', 'Jaimin', 'Parmar', '318', '7600738945', 'hostel.caretaker@iitgn.ac.in', ['Jurqia', 'Lekhaag']),
            ('ramprakash.parmar', 'Ramprakash Lembabhai', 'Parmar', '317', '9687460280', 'ramairy1198@gmail.com', ['Kyzeel']),
            ('vishvajeet.kumar', 'Vishvajeet', 'Kumar', '316', '9898037530', 'mishra.vishwajeet@iitgn.ac.in', ['Hostel Common Area']),
        ]
        for username, first, last, pc, phone, email, areas in caretakers:
            self.make_user(username, first, last, phone, 'caretaker', areas, email=email, pay_code=pc)

        # Supervisors (campus sections)
        supervisors = [
            # (username, first, last, pay_code, phone, email, areas)
            ('ashok.rathod', 'Ashokbhai Ishwarbhai', 'Rathod', '2', '7016722524', 'ashok2969798@gmail.com', ['Guest House New', 'Director Bungalow']),
            ('kaushik.parmar', 'Kaushikkumar Balvantbhai', 'Parmar', '396', '9825504802', 'kaushikparmar7673@gmail.com', ['Academic Block 12', 'Academic Block 13', 'New Academic Common Area', 'New Academic Reliever']),
            ('shailesh.prajapati', 'Shailesh Natvarbhai', 'Prajapati', '4', '9898477320', '', ['Academic Block 10', 'Academic Block 11', 'New AB U-Shape', 'New Academic Reliever']),
            ('maulik.patel', 'Maulikkumar Dilipbhai', 'Patel', '7', '8758363879', 'moulikpatel81290@gmail.com', ['Research Park']),
            ('bharat.solanki', 'Bharat Kumar M.', 'Solanki', '465', '8511764551', 'bharat2545007@gmail.com', ['Sports Complex', 'Central Arcade']),
            ('mukesh.vaghela', 'Mukeshkumar', 'Vaghela', '466', '9265591836', 'm.vaghela23@gmail.com', ['Academic Block 1', 'Academic Block 2', 'Academic Block 5', 'Academic Block 6', 'Academic Block 8', 'Old Academic Reliever']),
            ('bipin.vaghela', 'Bipinchandra Dineshkumar', 'Vaghela', '350', '9979627312', 'bipin.vaghela4u@gmail.com', ['Academic Block 3', 'Academic Block 4', 'Academic Block 7', 'Academic Block 9', 'Old Academic Common Area']),
            ('narendra.shreemali', 'Narendrakumar Natvarbhai', 'Shrimali', '328', '9898661986', 'narendrashrimali36262@gmail.com', ['Roads & Outdoor', 'Old Guest House']),
            ('pradip.chauhan', 'Pradip', 'Chauhan', '3', '8200560889', 'pradipchauhan783@gmail.com', ['Solid Waste Management']),
        ]
        for username, first, last, pc, phone, email, areas in supervisors:
            self.make_user(
                username,
                first,
                last,
                phone,
                'supervisor',
                areas,
                email=email,
                pay_code=pc,
                match_pay_code=username != 'pradip.chauhan',
            )

        self.make_user(
            'dinesh.chauhan',
            'Dinesh',
            'Chauhan',
            '9925192578',
            'supervisor',
            [],
            email='dineshchauhan0257@gmail.com',
            pay_code='3',
            match_pay_code=False,
        )

        self.stdout.write(f'  [OK] Users: {User.objects.filter(role__in=["caretaker","supervisor"]).count()}')

    def seed_portal_accounts(self):
        """
        Core web portal accounts for admin/dashboard usage.
        These users are intentionally area-agnostic and can access module dashboards.
        """
        # Migrate old manager usernames to new portal nomenclature.
        # This preserves existing user relations while updating login identity.
        rename_map = [
            ('estate.manager', 'mahesh.prajapati', 'Maheshbhai', 'Prajapati', 'managerhort.iwd@iitgn.ac.in', 'horticulture_manager'),
            ('horticulture.manager', 'mahesh.prajapati', 'Maheshbhai', 'Prajapati', 'managerhort.iwd@iitgn.ac.in', 'horticulture_manager'),
            ('hostel.manager', 'housekeeping.manager', 'Housekeeping', 'Manager', 'manager.hk@iitgn.ac.in', 'housekeeping_manager'),
        ]
        for old_un, new_un, first, last, email, target_role in rename_map:
            old_user = User.objects.filter(username=old_un).first()
            if old_user and not User.objects.filter(username=new_un).exists():
                old_user.username = new_un
                old_user.first_name = first
                old_user.last_name = last
                old_user.email = email
                old_user.role = target_role
                old_user.is_active = True
                old_user.is_staff = True
                old_user.is_superuser = False
                old_user.save(update_fields=[
                    'username', 'first_name', 'last_name', 'email',
                    'role', 'is_active', 'is_staff', 'is_superuser',
                ])

        accounts = [
            ('admin.user', 'Admin', 'User', '9727757096', 'admin', [], 'pragnesh@iitgn.ac.in', ''),
            ('mahesh.prajapati', 'Maheshbhai', 'Prajapati', '9723889424', 'horticulture_manager', [], 'managerhort.iwd@iitgn.ac.in', '474'),
            ('hk_inventory_manager', 'Housekeeping Inventory', 'Manager', '8758120645', 'hk_inventory_manager', [], 'manager.hk@iitgn.ac.in', '469'),
        ]
        for username, first, last, phone, role, areas, email, pay_code in accounts:
            self.make_user(
                username,
                first,
                last,
                phone,
                role,
                areas,
                email=email,
                pay_code=pay_code,
                match_pay_code=False,
            )

        disabled = User.objects.filter(username__in=['housekeeping.manager', 'inventory.manager']).update(
            is_active=False,
            is_staff=False,
            is_superuser=False,
        )

        self.stdout.write(
            f'  [OK] Portal users: {User.objects.filter(role__in=["admin","inventory_manager","housekeeping_manager","hk_inventory_manager","horticulture_manager"]).count()}'
        )
        if disabled:
            self.stdout.write(f'  [OK] Disabled old HK/inventory manager portal logins: {disabled}')

    def cleanup_legacy_accounts(self):
        """
        Remove deprecated/old usernames so shared datasets remain clean and deterministic.
        """
        legacy_usernames = [
            'admin', 'priyanka', 'anita', 'rushita', 'pankaj', 'ramsingh', 'jaimin',
            'anil.hk', 'nikul.hk', 'anil.caretaker', 'nikul.caretaker', 'lab.supervisor',
            'estate.manager', 'hostel.manager', 'horticulture.manager', 'inv.manager',
        ]
        removed = 0
        blocked = []

        for user in User.objects.filter(username__in=legacy_usernames):
            try:
                user.delete()
                removed += 1
            except ProtectedError:
                blocked.append(user.username)

        self.stdout.write(f'  [OK] Legacy users removed: {removed}')
        if blocked:
            self.stdout.write(
                self.style.WARNING(
                    f'  ! Legacy users kept due to protected relations: {", ".join(blocked)}'
                )
            )

    # ─────────────────────────────────────────────────────────────────

    def _find_roster_worker(self, spec, area, managed_area_ids, all_workers, keep_ids):
        exact_key = worker_key(spec['name'])
        legacy_keys = {exact_key}
        legacy_keys.update(worker_key(name) for name in spec.get('legacy_names', []) if name)
        pay_code = (spec.get('pay_code') or '').strip()

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and worker_key(worker.name) == exact_key:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and worker_key(worker.name) in legacy_keys:
                return worker

        if pay_code:
            for worker in all_workers:
                if worker.id in keep_ids:
                    continue
                if worker.area_id in managed_area_ids and (worker.pay_code or '').strip() == pay_code:
                    return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id in managed_area_ids and worker_key(worker.name) in legacy_keys:
                return worker

        return None

    def _sync_area_roster(self, roster_specs, supervisor_username):
        supervisor = User.objects.filter(username=supervisor_username).first()
        managed_areas = {}
        managed_area_ids = set()
        for spec in roster_specs:
            area = self.area(spec['area'])
            if area:
                managed_areas[spec['area']] = area
                managed_area_ids.add(area.id)

        all_workers = list(HKWorker.objects.select_related('area').all())
        keep_ids = set()
        synced_count = 0

        for spec in roster_specs:
            area = managed_areas.get(spec['area'])
            if area is None:
                continue

            worker = self._find_roster_worker(spec, area, managed_area_ids, all_workers, keep_ids)
            created = False
            if worker is None:
                worker = HKWorker(area=area)
                created = True

            worker.name = spec['name']
            worker.pay_code = spec.get('pay_code', '')
            if spec.get('phone'):
                worker.phone = spec['phone']
            elif created and not worker.phone:
                worker.phone = ''
            worker.worker_type = spec.get('worker_type', 'general')
            worker.shift = spec.get('shift', 'day')
            worker.area = area
            worker.supervisor = supervisor
            worker.is_reliever = spec.get('is_reliever', False)
            worker.is_active = True
            worker.save()

            if created:
                all_workers.append(worker)
            keep_ids.add(worker.id)
            synced_count += 1

        deactivated_count = HKWorker.objects.filter(
            area__name__in=sorted(managed_areas),
            is_active=True,
        ).exclude(id__in=keep_ids).update(is_active=False)

        return synced_count, deactivated_count

    def _cleanup_unused_inactive_workers(self, area_names):
        deleted_ids = []
        kept_with_history = 0
        for worker in HKWorker.objects.filter(area__name__in=area_names, is_active=False):
            has_history = (
                worker.attendance_records.exists()
                or worker.task_assignments.exists()
                or worker.sunday_incharges.exists()
                or worker.substituted_by.exists()
                or worker.substitution_slots.exists()
                or worker.selection_requests.exists()
                or worker.assigned_daily_records.exists()
                or worker.monthly_reports.exists()
            )
            if has_history:
                kept_with_history += 1
                continue
            deleted_ids.append(worker.id)

        if deleted_ids:
            HKWorker.objects.filter(id__in=deleted_ids).delete()

        return len(deleted_ids), kept_with_history

    def seed_workers(self):
        """
        All 57 workers from HK_Staff.pdf with correct punching nos and phones.
        Relievers: is_reliever=True, worker_type='reliever'
        Each worker is assigned to their hostel area.
        """
        # Format: (name, punching_no, phone, area_name, worker_type, is_reliever)
        workers = [
            # -- AIBAAN ------------------------------------------------------
            ('Reeta Ben',        '357', '9574379477', 'Aibaan',   'room',     False),
            ('Meena Ben',        '76',  '9909679865', 'Aibaan',   'floor',    False),
            ('Kailash B',        '143', '7265921026', 'Aibaan',   'washroom', False),

            # -- BEUAKI ------------------------------------------------------
            ('Shilpa Ben',       '419', '6356046585', 'Beuaki',   'room',     False),
            ('Bhanu Ben',        '332', '7567371788', 'Beuaki',   'floor',    False),
            ('Surya Ben',        '233', '9725963299', 'Beuaki',   'washroom', False),

            # -- CHIMAIR -----------------------------------------------------
            ('Kailashben M',     '98',  '8490053837', 'Chimair',  'room',     False),
            ('Geeta Ben',        '230', '7041016942', 'Chimair',  'floor',    False),
            ('Manisha Ben',      '356', '9157691322', 'Chimair',  'washroom', False),

            # -- IJOKHA ------------------------------------------------------
            ('Sangeeta Ben',     '219', '8866941201', 'Ijokha',   'room',     False),
            ('Sonal Ben',        '415', '7359834672', 'Ijokha',   'floor',    False),
            ('Champa Ben',       '249', '8140558882', 'Ijokha',   'washroom', False),

            # -- DUVEN -------------------------------------------------------
            ('Shailesh Rathod',  '239', '9081107066', 'Duven',    'room',     False),
            ('Rajnikant',        '153', '6355825476', 'Duven',    'floor',    False),
            ('Harish',           '122', '7698462575', 'Duven',    'washroom', False),

            # -- EMIET -------------------------------------------------------
            ('Nikul Solanki',    '446', '8238759843', 'Emiet',    'room',     False),
            ('Jagdish',          '157', '9662312505', 'Emiet',    'floor',    False),
            ('Mahendra Makwana', '148', '7041143190', 'Emiet',    'washroom', False),

            # -- FIRPEAL -----------------------------------------------------
            ('Anand',            '310', '9023393753', 'Firpeal',  'room',     False),
            ('Satish',           '113', '9558903676', 'Firpeal',  'floor',    False),
            ('Jaydeep Solanki',  '259', '9727981188', 'Firpeal',  'washroom', False),

            # -- GRIWIKSH ----------------------------------------------------
            ('Karan',            '260', '7016522113', 'Griwiksh', 'room',     False),
            ('Jignesh',          '115', '8401617156', 'Griwiksh', 'floor',    False),
            ('Sailesh Vaghela',  '109', '8734987012', 'Griwiksh', 'washroom', False),

            # -- HIQOM (5 workers) --------------------------------------------
            # RAHUL FIX: punching_no for Mukesh changed from '121' to 'R121' after HK-10 discovery to prevent collision with reliever Rajendra who also has name 'Mukesh'.
            ('Mukesh',           '121', '8141885315', 'Hiqom',    'room',     False),
            ('Jaykesh',          '449', '8401531547', 'Hiqom',    'room',     False),
            ('Chandrakant',      '283', '7201863872', 'Hiqom',    'floor',    False),
            ('Jitendra',         '95',  '9723216455', 'Hiqom',    'washroom', False),
            ('Ravi',             '245', '7383342914', 'Hiqom',    'washroom', False),

            # -- JURQIA (4 workers) -------------------------------------------
            ('Rakesh',           '438', '9316531354', 'Jurqia',   'room',     False),
            ('Shailesh Talvadi', '97',  '8866886040', 'Jurqia',   'floor',    False),
            ('Pravin Vaghela',   '246', '8511376344', 'Jurqia',   'washroom', False),
            ('Banshi',           '149', '9023507559', 'Jurqia',   'washroom', False),

            # -- LEKHAAG (4 workers) ------------------------------------------
            ('Suresh Solanki',   '73',  '9687317660', 'Lekhaag',  'room',     False),
            ('Naresh',           '89',  '7284086230', 'Lekhaag',  'floor',    False),
            ('Nitin Makwana',    '261', '9157708871', 'Lekhaag',  'washroom', False),
            ('Pravin Maida',     '91',  '9265530235', 'Lekhaag',  'washroom', False),

            # -- KYZEEL (5 workers) -------------------------------------------
            ('Prahlad Parmar',   '242', '8734949909', 'Kyzeel',   'room',     False),
            ('Amit',             '110', '7779004437', 'Kyzeel',   'room',     False),
            ('Mehul Rathod',     '256', '6353451489', 'Kyzeel',   'floor',    False),
            ('Rajesh',           '104', '7046510026', 'Kyzeel',   'washroom', False),
            ('Mehul Jadeja',     '106', '7096229284', 'Kyzeel',   'washroom', False),

            # -- COMMON AREA -------------------------------------------------
            ('Yogesh Vaghela',   '80',  '9998100804', 'Hostel Common Area', 'room',    False),
            ('Vinayak Solanki',  '240', '9023271834', 'Hostel Common Area', 'washroom', False),
            ('Anil Thakur',      '542', '9265665289', 'Hostel Common Area', 'floor',   False),
            ('Suresh',           '',    '',            'Hostel Common Area', 'floor',   False),
            ('Krunal',           '',    '',            'Hostel Common Area', 'floor',   False),
            ('Ketan Gujjar',     '100', '8347139138', 'Hostel Common Area', 'floor',    False),

            # -- RESEARCH PARK -----------------------------------------------
            ('Mahesh Solanki',              '267', '7046959603', 'Research Park', 'floor',    False),
            ('Thakor Ajaykumar Prahladji',  '349', '8780940745', 'Research Park', 'floor',    False),
            ('Sailesh A Vaghela',           '266', '7284950619', 'Research Park', 'room',     False),
            ('Vaghela Dharmishtha Ben',     '264', '9328002335', 'Research Park', 'washroom', False),

            # -- CENTRAL ARCADE ----------------------------------------------
            ('Chirag Vaghela',     '303', '', 'Central Arcade', 'floor',    False),
            ('Sunil Vaghela',      '455', '', 'Central Arcade', 'floor',    False),
            ('Vijay Parmar',       '329', '', 'Central Arcade', 'floor',    False),
            ('Ramesh Parmar',      '429', '', 'Central Arcade', 'washroom', False),
            ('Nikhil Makvana',     '364', '', 'Central Arcade', 'room',     False),
            ('Bhavna Ben Chavda',  '218', '', 'Central Arcade', 'room',     False),
            ('Sikandar Bhangi',    '389', '', 'Central Arcade', 'general',  False),

            # -- SPORTS COMPLEX ----------------------------------------------
            ('Shohil J Vaghela',      '257', '', 'Sports Complex', 'washroom', False),
            ('Ramesh N Parmar',       '411', '', 'Sports Complex', 'floor',    False),
            ('Jaydeep D Vaghela',     '447', '', 'Sports Complex', 'general',  False),
            ('Rahul J Vaghela',       '337', '', 'Sports Complex', 'washroom', False),
            ('Akshay R Parmar',       '414', '', 'Sports Complex', 'floor',    False),
            ('Rudhreshben S Solanki', '282', '', 'Sports Complex', 'room',     False),
            ('Anitaben',              '385', '', 'Sports Complex', 'floor',    False),
            ('Uttam Vaghela',         '428', '', 'Sports Complex', 'room',     False),
            ('Rajendra Bhai Chavda',  '354', '', 'Sports Complex', 'floor',    False),

            # Guest House New
            ('Raju Manabhai Makwana',        '263', '9601550905', 'Guest House New', 'floor',    False),
            ('Hiteshkumar Gafulbhai Vaghela','291', '9265621047', 'Guest House New', 'washroom', False),
            ('Dhaval Kantibhai Jadeja',      '248', '9099716206', 'Guest House New', 'room',     False),
            ('Ajay Harshadbhai Purabiya',    '284', '9099483423', 'Guest House New', 'room',     False),
            ('Sumit Rameshbhai Solanki',     '451', '8866060385', 'Guest House New', 'room',     False),
            ('Shailesh Ishvarbhai Raval',    '306', '9157891835', 'Guest House New', 'washroom', False),
            ('Sanjay Babubhai Vaghela',      '304', '8490012338', 'Guest House New', 'washroom', False),
            ('Anil Bhupatsinh Thakor',       '269', '7359449665', 'Guest House New', 'general',  False),
            ('Gautam Parmar',                '403', '8511406220', 'Guest House New', 'floor',    False),
            ('Pankaj Kantibhai Chamar',      '393', '7990281462', 'Guest House New', 'general',  False),
            ('Lalit Babubhai Parmar',        '319', '8866011232', 'Guest House New', 'general',  False),
            ('Vishal Vaghela Karshanbhai',   '320', '8154945437', 'Guest House New', 'room',     False),

            # Old Guest House
            ('Mukesh Shakrabhai Parmar',   '392', '7096432339', 'Old Guest House', 'floor', False),
            ('Rajesh Ranchhodji Chauhan',  '338', '9674629886', 'Old Guest House', 'room',  False),

            # Director Bungalow
            ('Shailesh Ugarabhai Vaghela', '311', '8128880335', 'Director Bungalow', 'general', False),
            ('Rakesh Ishvarbhai Parmar',   '305', '8238931261', 'Director Bungalow', 'general', False),

            # Roads & Outdoor
            ('Prakash Shakaraji Thakor',   '534', '6355540093', 'Roads & Outdoor', 'road', False),
            ('Kamaji Chandaji Thakor',     '70',  '8347418371', 'Roads & Outdoor', 'road', False),
            ('Ashokji Manyaji Thakor',     '67',  '9054841766', 'Roads & Outdoor', 'road', False),
            ('Rohitji Rumalji Thakor',     '68',  '8320831295', 'Roads & Outdoor', 'road', False),
            ('Mahesh Ranjitbhai Raval',    '64',  '7698588092', 'Roads & Outdoor', 'road', False),
            ('Chirag Gampatji Thakor',     '464', '7041456600', 'Roads & Outdoor', 'road', False),
            ('Satish Vikrambhai Vayhela',  '463', '8160402819', 'Roads & Outdoor', 'road', False),

            # SWM (Solid Waste Management) - real active roster
            ('Jitendrakumar Kantiji Thakor',      '238', '', 'Solid Waste Management', 'swm', False),
            ('Kantiji Varvaji Thakor',            '140', '', 'Solid Waste Management', 'swm', False),
            ('Baldevbhai Mohanbhai Vaghela',      '124', '', 'Solid Waste Management', 'swm', False),
            ('Kishankumar Yogeshji Thakor',       '479', '', 'Solid Waste Management', 'swm', False),
            ('Shaileshbhai Mahendrabhai Vaghela', '453', '', 'Solid Waste Management', 'swm', False),
            ('Shaileshbhai Kaluji Thakor',        '66',  '', 'Solid Waste Management', 'swm', False),
            ('Shaileshkumar Ramanbhai Solanki',   '443', '', 'Solid Waste Management', 'swm', False),
            ('Rajnikant Narsinhbhai Parmar',      '444', '', 'Solid Waste Management', 'swm', False),
            ('Sedhaji Amratbhai Raval',           '409', '', 'Solid Waste Management', 'swm', False),
            ('Haribhai Amratbhai Parmar',         '480', '', 'Solid Waste Management', 'swm', False),
            ('Naginbhai Babubhai Chauhan',        '063', '', 'Solid Waste Management', 'swm', False),
            ('Dineshbhai Babubhai Chauhan',       '146', '', 'Solid Waste Management', 'swm', False),
            ('Sunilbhai Prabhatji Thakor',        '407', '', 'Solid Waste Management', 'swm', False),

            # Academic Blocks 01-09 + Old Academic Common Area
            ('Minaben Vaghela',                    '142', '9081897577', 'Academic Block 1', 'floor',    False),
            ('Rajanikant Babubhai Vaghela',        '103', '8490949636', 'Academic Block 2', 'floor',    False),
            ('Solanki Krunal Amrutbhai',           '235', '9327124093', 'Academic Block 3', 'floor',    False),
            ('Vaghela Rakeshbhai Ambalal',         '108', '9313622323', 'Academic Block 3', 'room',     False),
            ('Vasantiben Jitendrabhai Vora',       '101', '9824018730', 'Academic Block 3', 'washroom', False),
            ('Rathod Varshaben',                   '156', '8490949636', 'Academic Block 4', 'washroom', False),
            ('Rathod Hiteshkumar',                 '138', '9723883180', 'Academic Block 4', 'floor',    False),
            ('Solanki Harshadbhai Dineshbhai',     '280', '9998362377', 'Academic Block 4', 'room',     False),
            ('Solanki Dineshkumar Vinubhai',       '83',  '9714159412', 'Academic Block 5', 'floor',    False),
            ('Parmar Anjanaben Kalpeshkumar',      '130', '6351220899', 'Academic Block 5', 'washroom', False),
            ('Vaghela Shaileshbhai',               '82',  '8155861394', 'Academic Block 5', 'room',     False),
            ('Chauhan Nilamben',                   '410', '7041529877', 'Academic Block 6', 'washroom', False),
            ('Ashokkumar Maheriya',                '114', '7383949367', 'Academic Block 6', 'floor',    False),
            ('Hitenkumar Parmar',                  '307', '8866745431', 'Academic Block 6', 'room',     False),
            ('Gurjar Chandrikaben',                '74',  '9737520471', 'Academic Block 7', 'washroom', False),
            ('Parmar Nikulkumar Punjabhai',        '309', '8155861394', 'Academic Block 7', 'floor',    False),
            ('Ajaykumar Solanki',                  '281', '8401109316', 'Old Academic Reliever', 'reliever', True),
            ('Solanki Akashkumar Hasmukhbhai',     '253', '8160847423', 'Old Academic Reliever', 'reliever', True),
            ('Pravinbhai Vaghela',                 '400', '9624126018', 'Old Academic Reliever', 'reliever', True),
            ('Jyotsanaben Vaghela',                '231', '9574720027', 'Old Academic Reliever', 'reliever', True),
            ('Jay Kumar Solanki',                  '105', '8511476360', 'Academic Block 9', 'room',     False),
            ('Patel Sangitaben Maheshbhai',        '412', '', 'Academic Block 10', 'washroom', False),
            ('Hiteshbhai Solanki',                 '434', '', 'Academic Block 10', 'room',     False),
            ('Solanki Parthkumar Jagdishbhai',     '384', '', 'Academic Block 10', 'floor',    False),
            ('Makwana Sunilbhai Amrutbhai',        '348', '', 'Academic Block 11', 'floor',    False),
            ('Bhangi Ileshbhai Ishvarbhai',        '361', '', 'Academic Block 11', 'room',     False),
            ('Kailashben Parmar',                  '102', '', 'Academic Block 11', 'washroom', False),
            ('Sonala Manishaben',                  '356', '', 'Academic Block 12', 'washroom', False),
            ('Gautambhai Vaghela',                 '333', '', 'Academic Block 12', 'floor',    False),
            ('Parmar Devendra Dalpatbhai',         '437', '', 'Academic Block 12', 'room',     False),
            ('Vaghela Maheshbhai Dineshbhai',      '402', '', 'Academic Block 13', 'floor',    False),
            ('Rathod Ajaykumar',                   '93',  '', 'Academic Block 13', 'room',     False),
            ('Jigneshkumar Babubhai Solanki',      '363', '', 'Academic Block 13', 'washroom', False),
            ('Parmar Krunalbhai',                  '390', '', 'Academic Block 13', 'room',     False),
            ('Vaghela Padma',                      '347', '', 'Academic Block 13', 'floor',    False),
            ('Vaghela Bhaveshbhai Narnabhai',      '315', '9974738575', 'Old Academic Common Area', 'floor', False),
            ('Vaniya Nikhilkumar Bhaveshbhai',     '314', '8849436518', 'Old Academic Common Area', 'floor', False),
            ('Akshybhai Vaghela',                  '308', '', 'New AB U-Shape', 'floor', False),
            ('Vasudev Jitendrakumar Baldevbhai',   '377', '', 'New Academic Common Area', 'floor', False),
            ('Gurjar Niruben',                     '111', '', 'New Academic Reliever', 'reliever', True),
            ('Sonara Hitendrakumar Punjabhai',     '448', '', 'New Academic Reliever', 'reliever', True),

            # Relievers substitute for permanent workers when they take leave.
            # They are managed in a dedicated hostel reliever pool area.
            ('Deepika Ben',      '418', '7383512108', 'Hostels Reliever', 'reliever', True),
            ('Mital Ben',        '386', '7383619204', 'Hostels Reliever', 'reliever', True),
            ('Vinay',            '136', '8758388061', 'Hostels Reliever', 'reliever', True),
            ('Lala',             '154', '9726303104', 'Hostels Reliever', 'reliever', True),
            ('Hasmukhbhai',      '75',  '9714466201', 'Hostels Reliever', 'reliever', True),
            ('Umesh Babariya',   '435', '9313230372', 'Hostels Reliever', 'reliever', True),
            # RAHUL FIX
            ('Rajendra',         '121', '9924301124', 'Hostels Reliever', 'reliever', True),
            ('Dhiraj',           '131', '9979030157', 'Hostels Reliever', 'reliever', True),
            ('Mayur',            '258', '9099743600', 'Hostels Reliever', 'reliever', True),
        ]

        # Backward-compatibility: move relievers to dedicated hostel reliever area.
        reliever_names = [
            'Deepika Ben', 'Mital Ben', 'Vinay', 'Lala', 'Hasmukhbhai',
            'Umesh Babariya', 'Rajendra', 'Dhiraj', 'Mayur',
        ]
        HKWorker.objects.filter(
            name__in=reliever_names,
            is_reliever=True,
        ).update(area=self.area('Hostels Reliever'))

        created_count = 0
        for name, pay_code, phone, area_name, wtype, is_reliever in workers:
            area = self.area(area_name) if area_name else None
            worker = HKWorker.objects.filter(name=name, area=area).order_by('-is_active', '-id').first()
            created = worker is None
            if created:
                worker = HKWorker(
                    name=name,
                    area=area,
                    pay_code=pay_code,
                    phone=phone,
                    worker_type=wtype,
                    shift='day',
                    is_active=True,
                    is_reliever=is_reliever,
                )
                worker.save()
            if created:
                created_count += 1
            else:
                # Update phone/punching if changed
                worker.pay_code = pay_code
                update_fields = [
                    'pay_code', 'worker_type',
                    'is_reliever', 'shift', 'is_active',
                ]
                if phone or not worker.phone:
                    worker.phone = phone
                    update_fields.append('phone')
                worker.worker_type = wtype
                worker.is_reliever = is_reliever
                worker.shift = worker.shift or 'day'
                worker.is_active = True
                worker.save(update_fields=update_fields)

        # Common Area staffing details
        common_supervisor = User.objects.filter(username='vishvajeet.kumar').first()
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

        research_roster = [
            {'area': 'Research Park', 'name': 'Mahesh Solanki', 'pay_code': '267', 'phone': '7046959603', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Mahesh Solanki']},
            {'area': 'Research Park', 'name': 'Thakor Ajaykumar Prahladji', 'pay_code': '349', 'phone': '8780940745', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Ajay Thakor', 'Thakor Ajaykumar Prahladji']},
            {'area': 'Research Park', 'name': 'Sailesh A Vaghela', 'pay_code': '266', 'phone': '7284950619', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Shailesh Vaghela', 'Sailesh Vaghela', 'Vaghela Shaileshbhai', 'Vaghela Shaileshkumar']},
            {'area': 'Research Park', 'name': 'Vaghela Dharmishtha Ben', 'pay_code': '264', 'phone': '9328002335', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Dharmishtaben', 'Vaghela Dharmishtha Ben']},
        ]
        research_synced, research_deactivated = self._sync_area_roster(research_roster, 'maulik.patel')
        research_deleted, research_kept = self._cleanup_unused_inactive_workers(['Research Park'])
        self.stdout.write(
            '  [OK] Research Park roster synced: '
            f'{research_synced} workers, {research_deactivated} extra deactivated, '
            f'{research_deleted} unused removed, {research_kept} history rows kept inactive'
        )

        bharat_roster = [
            {'area': 'Central Arcade', 'name': 'Chirag Vaghela', 'pay_code': '303', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Chirag Vaghela']},
            {'area': 'Central Arcade', 'name': 'Sunil Vaghela', 'pay_code': '455', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Sunil Vaghela']},
            {'area': 'Central Arcade', 'name': 'Vijay Parmar', 'pay_code': '329', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Vijay Parmar']},
            {'area': 'Central Arcade', 'name': 'Ramesh Parmar', 'pay_code': '429', 'phone': '', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Ramesh Parmar']},
            {'area': 'Central Arcade', 'name': 'Nikhil Makvana', 'pay_code': '364', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Nikhil', 'Nikhil Makvana', 'Nikhil makvana']},
            {'area': 'Central Arcade', 'name': 'Bhavna Ben Chavda', 'pay_code': '218', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Bhavnaben', 'Bhavna ben chavda']},
            {'area': 'Central Arcade', 'name': 'Sikandar Bhangi', 'pay_code': '389', 'phone': '', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Sikandar bhangi']},
            {'area': 'Sports Complex', 'name': 'Shohil J Vaghela', 'pay_code': '257', 'phone': '', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Sohil Vaghela', 'Shohil Vaghela', 'Shohil.J.vaghela']},
            {'area': 'Sports Complex', 'name': 'Ramesh N Parmar', 'pay_code': '411', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Ramesh Sports', 'Ramesh.N.parmar']},
            {'area': 'Sports Complex', 'name': 'Jaydeep D Vaghela', 'pay_code': '447', 'phone': '', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Jaydeep Vaghela', 'Jaydeep.D.vaghela']},
            {'area': 'Sports Complex', 'name': 'Rahul J Vaghela', 'pay_code': '337', 'phone': '', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Rahul Vaghela', 'Rahul.J.vgahela', 'Rahul.J.vaghela']},
            {'area': 'Sports Complex', 'name': 'Akshay R Parmar', 'pay_code': '414', 'phone': '', 'worker_type': 'floor', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Akshay Parmar', 'Akshay.R.parmar']},
            {'area': 'Sports Complex', 'name': 'Rudhreshben S Solanki', 'pay_code': '282', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Retuben Solanki', 'Rudhreshben.S. solanki', 'Rudhreshben S Solanki']},
            {'area': 'Sports Complex', 'name': 'Anitaben', 'pay_code': '385', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Anita Solanki', 'Anitaben']},
            {'area': 'Sports Complex', 'name': 'Uttam Vaghela', 'pay_code': '428', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Uttam Vaghela']},
            {'area': 'Sports Complex', 'name': 'Rajendra Bhai Chavda', 'pay_code': '354', 'phone': '', 'worker_type': 'floor', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Rajendra Chavda', 'Rajendra Bhai chavda']},
        ]
        bharat_synced, bharat_deactivated = self._sync_area_roster(bharat_roster, 'bharat.solanki')
        bharat_deleted, bharat_kept = self._cleanup_unused_inactive_workers(['Central Arcade', 'Sports Complex'])
        self.stdout.write(
            '  [OK] Central Arcade + Sports Complex roster synced: '
            f'{bharat_synced} workers, {bharat_deactivated} extra deactivated, '
            f'{bharat_deleted} unused removed, {bharat_kept} history rows kept inactive'
        )

        # Guest House New + Old Guest House + Director Bungalow staffing details
        ashok_supervisor = User.objects.filter(username='ashok.rathod').first()
        narendra_supervisor = User.objects.filter(username='narendra.shreemali').first()
        guest_house_shift_map = {
            'Raju Manabhai Makwana': 'day',
            'Hiteshkumar Gafulbhai Vaghela': 'day',
            'Dhaval Kantibhai Jadeja': 'day',
            'Ajay Harshadbhai Purabiya': 'day',
            'Sumit Rameshbhai Solanki': 'day',
            'Shailesh Ishvarbhai Raval': 'evening',
            'Sanjay Babubhai Vaghela': 'evening',
            'Anil Bhupatsinh Thakor': 'night',
            'Gautam Parmar': 'day',
            'Pankaj Kantibhai Chamar': 'day',
            'Lalit Babubhai Parmar': 'day',
            'Vishal Vaghela Karshanbhai': 'day',
        }
        for worker_name, shift in guest_house_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Guest House New')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = ashok_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        old_guest_shift_map = {
            'Mukesh Shakrabhai Parmar': 'day',
            'Rajesh Ranchhodji Chauhan': 'day',
        }
        for worker_name, shift in old_guest_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Old Guest House')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = narendra_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        director_shift_map = {
            'Shailesh Ugarabhai Vaghela': 'day',
            'Rakesh Ishvarbhai Parmar': 'day',
        }
        for worker_name, shift in director_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Director Bungalow')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = ashok_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        # Roads & Outdoor staffing details
        roads_supervisor = User.objects.filter(username='narendra.shreemali').first()
        roads_shift_map = {
            'Prakash Shakaraji Thakor': 'day',
            'Kamaji Chandaji Thakor': 'day',
            'Ashokji Manyaji Thakor': 'day',
            'Rohitji Rumalji Thakor': 'day',
            'Mahesh Ranjitbhai Raval': 'day',
            'Chirag Gampatji Thakor': 'day',
            'Satish Vikrambhai Vayhela': 'day',
        }
        for worker_name, shift in roads_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Roads & Outdoor')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = roads_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        swm_roster = [
            {'area': 'Solid Waste Management', 'name': 'Jitendrakumar Kantiji Thakor', 'pay_code': '238', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Jitendra bhai Thakur']},
            {'area': 'Solid Waste Management', 'name': 'Kantiji Varvaji Thakor', 'pay_code': '140', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Kanti bhai Thakur', 'Kanti bhai Thakor']},
            {'area': 'Solid Waste Management', 'name': 'Baldevbhai Mohanbhai Vaghela', 'pay_code': '124', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Baldevbhai Vaghela']},
            {'area': 'Solid Waste Management', 'name': 'Kishankumar Yogeshji Thakor', 'pay_code': '479', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': []},
            {'area': 'Solid Waste Management', 'name': 'Shaileshbhai Mahendrabhai Vaghela', 'pay_code': '453', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Saleshbhai Vaghela', 'Shaileshbhai Vaghela']},
            {'area': 'Solid Waste Management', 'name': 'Shaileshbhai Kaluji Thakor', 'pay_code': '66', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Salesh bhai Thakur', 'Shailesh bhai Thakur']},
            {'area': 'Solid Waste Management', 'name': 'Shaileshkumar Ramanbhai Solanki', 'pay_code': '443', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': []},
            {'area': 'Solid Waste Management', 'name': 'Rajnikant Narsinhbhai Parmar', 'pay_code': '444', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Rajnibhai Parmar', 'Rajnikant Parmar']},
            {'area': 'Solid Waste Management', 'name': 'Sedhaji Amratbhai Raval', 'pay_code': '409', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Satish bhai Raval']},
            {'area': 'Solid Waste Management', 'name': 'Haribhai Amratbhai Parmar', 'pay_code': '480', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': []},
            {'area': 'Solid Waste Management', 'name': 'Naginbhai Babubhai Chauhan', 'pay_code': '063', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Naveenbhai Chauhan']},
            {'area': 'Solid Waste Management', 'name': 'Dineshbhai Babubhai Chauhan', 'pay_code': '146', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': []},
            {'area': 'Solid Waste Management', 'name': 'Sunilbhai Prabhatji Thakor', 'pay_code': '407', 'phone': '', 'worker_type': 'swm', 'shift': 'day', 'is_reliever': False, 'legacy_names': []},
        ]
        swm_synced, swm_deactivated = self._sync_area_roster(swm_roster, 'pradip.chauhan')
        swm_deleted, swm_kept = self._cleanup_unused_inactive_workers(['Solid Waste Management'])
        self.stdout.write(
            '  [OK] Solid Waste Management roster synced: '
            f'{swm_synced} workers, {swm_deactivated} extra deactivated, '
            f'{swm_deleted} unused removed, {swm_kept} history rows kept inactive'
        )

        # Academic blocks staffing details
        academic_supervisor_by_area = {
            'Academic Block 1': 'mukesh.vaghela',
            'Academic Block 2': 'mukesh.vaghela',
            'Academic Block 3': 'bipin.vaghela',
            'Academic Block 4': 'bipin.vaghela',
            'Academic Block 5': 'mukesh.vaghela',
            'Academic Block 6': 'mukesh.vaghela',
            'Academic Block 7': 'bipin.vaghela',
            'Academic Block 8': 'mukesh.vaghela',
            'Academic Block 9': 'bipin.vaghela',
            'Academic Block 10': 'shailesh.prajapati',
            'Academic Block 11': 'shailesh.prajapati',
            'Academic Block 12': 'kaushik.parmar',
            'Academic Block 13': 'kaushik.parmar',
            'Old Academic Common Area': 'bipin.vaghela',
            'New AB U-Shape': 'shailesh.prajapati',
            'New Academic Common Area': 'kaushik.parmar',
            'Old Academic Reliever': 'mukesh.vaghela',
            'New Academic Reliever': 'kaushik.parmar',
        }
        for area_name, supervisor_username in academic_supervisor_by_area.items():
            supervisor = User.objects.filter(username=supervisor_username).first()
            area_obj = self.area(area_name)
            if supervisor and area_obj:
                HKWorker.objects.filter(area=area_obj, is_active=True).update(
                    shift='day',
                    supervisor=supervisor,
                )

        self.stdout.write(f'  [OK] Workers: {HKWorker.objects.count()} ({created_count} new)')

    # ─────────────────────────────────────────────────────────────────

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

        # ─── ROOM STAFF SCHEDULE ─────────────────────────────────────────
        room_tasks = [
            # (order, start, end, task_name, requires_photo, description)
            (1,  '08:10', '08:45', '2nd Floor Washroom Touch Up',         False, ''),
            (2,  '08:45', '09:00', 'Staircase Cleaning',                   False, ''),
            (3,  '09:00', '09:30', 'Room Cleaning - 5 rooms',              True,  'First round of room cleaning'),
            (4,  '09:30', '09:45', 'Tea Break',                            False, ''),
            (5,  '09:45', '10:00', 'Outside Round',                        False, ''),
            (6,  '10:00', '12:00', 'Room Round - 15 rooms',                True,  'Main room cleaning round'),
            (7,  '12:00', '13:00', 'Pantry Cleaning - 4 pantries',         True,  ''),
            (8,  '13:00', '13:45', 'Lunch Break',                          False, ''),
            (9,  '13:45', '14:00', 'Paper Cutting / Admin Work',           False, ''),
            (10, '14:00', '16:00', 'Room & Extra Work - 10 rooms',         True,  'Afternoon room round'),
            (11, '16:00', '16:50', 'Common Cleaning & Pantry Round',       False, ''),
        ]

        # ─── FLOOR STAFF SCHEDULE ────────────────────────────────────────
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

        # ─── WASHROOM STAFF SCHEDULE ─────────────────────────────────────
        washroom_tasks = [
            (1,  '08:10', '08:45', '1st Floor Washroom Touch Up',          False, ''),
            (2,  '08:45', '09:30', 'Ground Floor Washroom Touch Up',       False, ''),
            (3,  '09:30', '09:45', 'Tea Break',                            False, ''),
            (4,  '09:45', '10:00', 'Staircase Cleaning',                   False, ''),
            (5,  '10:00', '12:00', '3rd Floor - 2 Washroom Deep Cleaning', True,  ''),
            (6,  '12:00', '13:00', '2nd Floor - 2 Washroom Cleaning',      True,  ''),
            (7,  '13:00', '13:45', 'Lunch Break',                          False, ''),
            (8,  '13:45', '14:00', 'Paper Cutting',                        False, ''),
            (9,  '14:00', '15:00', '6 Washroom Rounds Touch Up',           False, ''),
            (10, '15:00', '16:00', '1st Floor Washroom Cleaning',          True,  ''),
            (11, '16:00', '16:50', 'All Washroom Touch Up & Final Round',  True,  ''),
        ]

        # ─── SUNDAY EXTRAS (same for all hostels) ────────────────────────
        sunday_tasks = [
            (1, '08:10', '09:00', 'Dustbin Cleaning - All Floors',         True,  'Every Sunday'),
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
                (1, '07:00', '09:00', 'Raju: Ground Floor Office, Reception and Front Corridor', True, 'Dusting, sweeping and mopping'),
                (2, '09:00', '11:00', 'Raju: Parking, Washroom and Lobby Touch Up', True, 'Ladies/Gents/Handicapped washroom, lobby and dining passage'),
                (3, '11:00', '13:00', 'Raju: Front Glass, Lift and Ground Floor Final Round', True, ''),
                (4, '13:00', '14:00', 'Raju: Lunch Break', False, ''),
                (5, '14:00', '14:15', 'Raju: Washroom Touch Up', True, ''),
                (6, '14:15', '14:45', 'Raju: Rooms Back Side Area Sweeping', True, ''),
                (7, '14:45', '15:30', 'Raju: Gym Area and Equipment Dusting', True, ''),
                (8, '15:30', '16:00', 'Raju: All Floor Coolers and Washroom Cleaning', True, ''),
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
                (1, '08:00', '17:00', 'Dhaval + Ajay + Sumit + Vishal: Checkout/Occupied/Vacant Rooms', True, 'Morning room operations'),
                (2, '17:00', '22:00', 'Shailesh + Sanjay: Evening Room Operations', True, 'Checkout/occupied/vacant room round'),
                (3, '22:00', '07:00', 'Anil: Night Shift All Work Coverage', True, 'Dining hall, common hall, meeting hall, conference hall, washrooms and rooms'),
            ]

            gh_special_tasks = []  # Weekly-off handling now lives in the profile/leave flow.

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

        # Old Guest House: daily supervisor-linked room/block schedule
        old_guest_house = self.area('Old Guest House')
        if old_guest_house:
            HKScheduleTemplate.objects.filter(area=old_guest_house).delete()

            old_guest_tasks = [
                # order, start, end, task_name, requires_photo, description, worker_tag
                (1,  '08:00', '08:20', 'Block-1 Office Cleaning',            True,  'Assigned: Mukesh Shakrabhai Parmar', 'floor'),
                (2,  '08:25', '09:00', 'Block-1 and Block-2 Staircase',      True,  'Assigned: Mukesh Shakrabhai Parmar', 'floor'),
                (3,  '09:15', '10:00', 'Room 16/203 Cleaning',                True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
                (4,  '10:15', '11:00', 'Room 1/102 Cleaning',                 True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
                (5,  '11:15', '12:00', 'Room 2/101 Cleaning',                 True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
                (6,  '12:15', '13:00', 'Room 2/202 Cleaning',                 True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
                (7,  '13:00', '14:00', 'Lunch Break',                         False, 'All workers', 'floor'),
                (8,  '14:00', '14:45', 'Room 16/302 Cleaning',                True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
                (9,  '15:00', '15:45', 'Gate-3 Cleaning',                     True,  'Assigned: Mukesh Shakrabhai Parmar', 'floor'),
                (10, '16:00', '16:45', 'Room 16/301 Cleaning',                True,  'Assigned: Rajesh Ranchhodji Chauhan', 'room'),
            ]

            for order, start, end, name, req_photo, desc, tag in old_guest_tasks:
                HKScheduleTemplate.objects.create(
                    area=old_guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag=tag, requires_photo=req_photo,
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

            db_special_tasks = []  # Weekly-off handling now lives in the profile/leave flow.

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

        # Roads & Outdoor: route-wise road cleaning plan (period based)
        roads_area = self.area('Roads & Outdoor')
        if roads_area:
            HKScheduleTemplate.objects.filter(area=roads_area).delete()

            roads_floor_tasks = [
                (1, '08:00', '09:30', 'Route C: Two Degrees Parking Sweep', True, 'Primary road and parking cleaning zone'),
                (2, '09:30', '11:30', 'Route C2: U-Yog Circle to Block-9 Academic Back Side', True, 'Road and footpath route'),
                (3, '11:30', '13:00', 'Route C1: U-Yog Circle to Fire Building Side', True, 'Back side road cleaning'),
                (4, '13:00', '14:00', 'Lunch Break', False, 'All assigned workers'),
                (5, '14:00', '15:30', 'Route C2/G1: Sanitize Area to Gate-1 (10D Compost) - Round 1', True, 'Back side road route'),
                (6, '15:30', '17:00', 'Route C2/G1: Sanitize Area to Gate-1 (10D Compost) - Round 2', True, 'Final route touch-up'),
                (7, '08:00', '10:30', 'Route E-1/K: Gate-1 to Research Park Roads and Footpath', True, 'Road, parking and footpath cleaning'),
                (8, '10:30', '13:00', 'Route E-1/K: Gate-1 to Research Park Parking Detailing', True, 'Detailed parking and side cleaning'),
                (10, '14:00', '15:40', 'Route F-19/F-1: Gate-1 Circle to Laundry Gate', True, 'Back side connector road'),
                (11, '15:40', '17:00', 'Route H-1: Laundry Gate to Gate-2', True, 'End-of-day route close'),
            ]

            roads_room_tasks = [
                (1, '08:00', '10:30', 'Route F-2/1: Gate-3 to Parking (Road and Footpath)', True, 'Primary route cleaning'),
                (2, '10:30', '13:00', 'Route F-2/1: Gate-3 to Parking Detail Sweep', True, 'Detailed side and edge cleaning'),
                (4, '14:00', '15:30', 'Route E-2/H-2/14: RB Parking to Block-14 - Round 1', True, 'Back side road route'),
                (5, '15:30', '17:00', 'Route E-2/H-2/14: RB Parking to Block-14 - Round 2', True, 'Final route touch-up'),
                (6, '08:00', '10:30', 'Route A-1/J-1/13: Director Residence to Sports/Central/Hostel Roads', True, 'Multi-segment road route'),
                (7, '10:30', '12:00', 'Route B-1: Block-8 Academic to Cricket Ground', True, 'Road and footpath'),
                (9, '14:00', '15:00', 'Route F-1: Cricket Ground to Director Residence', True, 'Connector road cleaning'),
                (10, '15:00', '17:00', 'RB Parking to Block-14 Back Side Route', True, 'Shared support route'),
            ]

            roads_washroom_tasks = [
                (1, '08:00', '10:30', 'Route B-1: Academic Block-2 to Hostel (Sanyojak Marg)', True, 'Road and footpath'),
                (2, '10:30', '13:00', 'Route A-1: Hostel to Gate-2 Footpath', True, 'Footpath route cleaning'),
                (4, '14:00', '15:30', 'Centre Area to Central Arcade Footpath Route', True, 'Route includes centre and arcade links'),
                (5, '15:30', '17:00', 'Jal Mandir -> Long Tennis -> RB -> Block-31 Footpath Route', True, 'Extended route closure'),
                (6, '08:00', '10:30', 'Route C-2: Gate-5 to Hostel Cycle Track', True, 'Cycle track cleaning'),
                (7, '10:30', '13:00', 'Route C-2: Gate-5 to AC Plant Cycle Track', True, 'Cycle track continuation'),
                (9, '14:00', '15:30', 'Route C-2: Gate-5 to Block-9 Back Side - Round 1', True, 'Back side road'),
                (10, '15:30', '17:00', 'Route C-2: Gate-5 to Block-9 Back Side - Round 2', True, 'Final route touch-up'),
            ]

            roads_special_tasks = [
                (1, '07:45', '08:00', 'Supervisor: Route Allocation and Attendance Check', False, 'Assign routes and verify manpower'),
                (2, '17:00', '17:15', 'Supervisor: Final Inspection and Closure Report', False, 'Confirm completion and pending points'),
            ]

            roads_sunday_extra = [
                (1, '08:00', '10:00', 'Sunday Deep Clean: Major Footpath and Parking Sweep', True, ''),
                (2, '10:00', '12:00', 'Sunday Deep Clean: Drain Edge and Roadside Detailing', True, ''),
                (3, '14:00', '16:00', 'Sunday Deep Clean: Compost Route and Gate Buffer Sanitization', True, ''),
            ]

            for order, start, end, name, req_photo, desc in roads_floor_tasks:
                HKScheduleTemplate.objects.create(
                    area=roads_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='floor', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in roads_room_tasks:
                HKScheduleTemplate.objects.create(
                    area=roads_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='room', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in roads_washroom_tasks:
                HKScheduleTemplate.objects.create(
                    area=roads_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='washroom', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in roads_special_tasks:
                HKScheduleTemplate.objects.create(
                    area=roads_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in roads_sunday_extra:
                HKScheduleTemplate.objects.create(
                    area=roads_area, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='sunday_extra', is_active=True,
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

        # Academic Blocks 01-13 + renamed academic common areas + reliever pools
        academic_area_names = [
            'Academic Block 1', 'Academic Block 2', 'Academic Block 3', 'Academic Block 4',
            'Academic Block 5', 'Academic Block 6', 'Academic Block 7', 'Academic Block 8',
            'Old Academic Reliever',
            'Academic Block 9', 'Academic Block 10', 'Academic Block 11', 'Academic Block 12',
            'Academic Block 13', 'Old Academic Common Area', 'New AB U-Shape', 'New Academic Common Area',
        ]
        academic_areas = [self.area(name) for name in academic_area_names if self.area(name)]
        if academic_areas:
            HKScheduleTemplate.objects.filter(area__in=academic_areas).delete()

            academic_daily_tasks = {
                'Academic Block 1': [
                    (1, '08:00', '09:00', 'AB-1: 300 Auditorium Hall Corridor Cleaning', 'room', True, 'Minaben'),
                    (2, '09:00', '10:00', 'AB-1: 150 Seating Classroom-1 Cleaning', 'room', True, 'First floor'),
                    (3, '10:00', '11:00', 'AB-1: 150 Seating Classroom-2 Cleaning', 'room', True, 'Ground floor'),
                    (4, '11:00', '12:00', 'AB-1: GF + 1F Passage Black Marble Cleaning', 'floor', True, ''),
                    (5, '12:00', '13:00', 'AB-1: Male/Female/Handicap Washroom Cleaning', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, 'All assigned workers'),
                    (7, '14:00', '15:00', 'AB-1: Outside Area Sweeping', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-1: Auditorium and Classroom Touch Up', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-1: Final Washroom and Passage Touch Up', 'washroom', True, ''),
                ],
                'Academic Block 2': [
                    (1, '08:00', '09:00', 'AB-2: Main Fountain Area Cleaning', 'floor', True, 'Rajanikant'),
                    (2, '09:00', '10:00', 'AB-2: 600 Auditorium Hall Cleaning', 'room', True, ''),
                    (3, '10:00', '11:00', 'AB-2: First Floor Offices Cleaning', 'room', True, '2 big offices'),
                    (4, '11:00', '12:00', 'AB-2: First Floor Common Area and Washroom', 'washroom', True, ''),
                    (5, '12:00', '13:00', 'AB-2: Ground Floor Washroom and Common Area', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, 'All assigned workers'),
                    (7, '14:00', '15:00', 'AB-2: Outside Area and Black Marble Cleaning', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-2: Auditorium/Office Touch Up Round', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-2: Final Washroom Touch Up', 'washroom', True, ''),
                ],
                'Academic Block 3': [
                    (1, '08:00', '08:30', 'AB-3: All Floors Washroom Touch Up', 'washroom', True, 'Krunal + Rakesh + Vasantiben'),
                    (2, '08:30', '09:30', 'AB-3: Floor Cleaning', 'floor', True, ''),
                    (3, '10:00', '10:15', 'Tea Break', 'floor', False, ''),
                    (4, '10:20', '12:00', 'AB-3: Office and Meeting Room Cleaning', 'room', True, ''),
                    (5, '12:00', '13:00', 'AB-3: Washroom Touch Up', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-3: Floor Touch Up and Washroom Round', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-3: Lab Area and Office Cleaning', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-3: Staircase, Dusting and Water Cooler Area', 'floor', True, ''),
                ],
                'Academic Block 4': [
                    (1, '08:00', '08:30', 'AB-4: Washroom Touch Up', 'washroom', True, 'Varshaben + Hitesh + Harshad'),
                    (2, '08:30', '09:30', 'AB-4: Passage Area Cleaning', 'floor', True, ''),
                    (3, '09:30', '11:00', 'AB-4: Office Cleaning', 'room', True, ''),
                    (4, '11:00', '13:00', 'AB-4: Lab and Hall Area Cleaning', 'room', True, ''),
                    (5, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (6, '14:00', '15:00', 'AB-4: Floor and Washroom Touch Up', 'washroom', True, ''),
                    (7, '15:00', '16:00', 'AB-4: Staircase, Dusting and Any Pending Work', 'floor', True, ''),
                    (8, '16:00', '17:00', 'AB-4: Water Cooler Area Cleaning', 'washroom', True, ''),
                ],
                'Academic Block 5': [
                    (1, '08:00', '08:30', 'AB-5: All Floors Washroom Touch Up', 'washroom', True, 'Dinesh + Anjanaben + Shaileshbhai'),
                    (2, '08:30', '09:30', 'AB-5: Floor Cleaning', 'floor', True, ''),
                    (3, '10:00', '10:15', 'Tea Break', 'floor', False, ''),
                    (4, '10:30', '12:30', 'AB-5: Office and Lab Area Cleaning', 'room', True, ''),
                    (5, '12:30', '13:00', 'AB-5: Washroom Touch Up', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-5: Floor and Washroom Touch Up', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-5: Meeting and Lab Area Cleaning', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-5: Staircase and Water Cooler Dusting', 'floor', True, ''),
                ],
                'Academic Block 6': [
                    (1, '08:00', '08:30', 'AB-6: All Floors Washroom Touch Up', 'washroom', True, 'Nilamben + Ashok + Hiten'),
                    (2, '08:30', '09:30', 'AB-6: Floor Cleaning', 'floor', True, ''),
                    (3, '10:00', '10:15', 'Tea Break', 'floor', False, ''),
                    (4, '10:30', '12:30', 'AB-6: Office, Lab and Classroom Cleaning', 'room', True, ''),
                    (5, '12:30', '13:00', 'AB-6: Washroom Touch Up', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-6: Floor and Washroom Touch Up', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-6: Classroom/Lab Pending Work', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-6: Staircase and Water Cooler Cleaning', 'floor', True, ''),
                ],
                'Academic Block 7': [
                    (1, '08:00', '08:15', 'AB-7: Washroom Touch Up', 'washroom', True, 'Chandrikaben + Nikul'),
                    (2, '08:30', '09:30', 'AB-7: Closed Classroom Cleaning', 'room', True, ''),
                    (3, '09:30', '11:30', 'AB-7: Passage Area Cleaning', 'floor', True, ''),
                    (4, '11:30', '12:00', 'AB-7: Block Marble Cleaning', 'floor', True, ''),
                    (5, '12:00', '13:00', 'AB-7: Washroom Cleaning', 'washroom', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-7: Floor Touch Up and Washroom Round', 'floor', True, ''),
                    (8, '15:00', '16:00', 'AB-7: Pending Classroom Cleaning', 'room', True, ''),
                    (9, '16:00', '17:00', 'AB-7: Staircase and Railing Dusting', 'floor', True, ''),
                ],
                'Academic Block 8': [
                    (1, '08:00', '12:00', 'AB-8: Lal Minar Tower Cleaning Support', 'floor', True, 'Ajay + Akash + Pravin + Jyotsanaben'),
                    (2, '12:00', '13:00', 'AB-8: First Floor Passage and Ramp Cleaning', 'floor', True, ''),
                    (3, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (4, '14:00', '16:00', 'AB-8: Indoor Sweeping and Mopping', 'floor', True, 'Every 15 days'),
                    (5, '16:00', '17:00', 'AB-8: Month-end Additional Cleaning Check', 'floor', True, 'Month ending 2 times'),
                ],
                'Academic Block 9': [
                    (1, '08:00', '09:00', 'AB-9: All Office Cleaning', 'room', True, 'Jay'),
                    (2, '09:00', '09:30', 'AB-9: Balcony Area Cleaning', 'floor', True, ''),
                    (3, '09:30', '10:00', 'AB-9: First Floor Passage and Balcony Floor', 'floor', True, ''),
                    (4, '10:00', '10:15', 'Tea Break', 'floor', False, ''),
                    (5, '10:20', '11:30', 'AB-9: Ground Floor Passage and Lift Ramp Area', 'floor', True, ''),
                    (6, '11:30', '12:30', 'AB-9: All Floors Washroom Cleaning', 'washroom', True, ''),
                    (7, '12:30', '13:00', 'AB-9: First Floor Office Cleaning', 'room', True, ''),
                    (8, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (9, '14:00', '15:00', 'AB-9: All Floors Touch Up and Washroom', 'washroom', True, ''),
                    (10, '15:00', '17:00', 'AB-9: DHD Hall, Balcony, Staircase and Railing', 'floor', True, 'Second floor'),
                ],
                'Academic Block 10': [
                    (1, '08:00', '09:30', 'AB-10: Male and Female Washroom Cleaning', 'washroom', True, 'Padmaben + Hitesh + Parth'),
                    (2, '09:30', '12:00', 'AB-10: Floor, Classroom and Staircase Cleaning', 'floor', True, ''),
                    (3, '12:00', '13:00', 'AB-10: Lab Area and Lift Cleaning', 'room', True, ''),
                    (4, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (5, '14:00', '15:00', 'AB-10: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '15:00', '16:00', 'AB-10: Floor Touch Up and Extra Work', 'floor', True, ''),
                    (7, '16:00', '17:00', 'AB-10: Washroom, Staircase and Pantry Cleaning', 'washroom', True, ''),
                ],
                'Academic Block 11': [
                    (1, '08:00', '09:30', 'AB-11: First-Third Floor Washroom Cleaning', 'washroom', True, 'Sunil + Elesh + Sangeetaben + Bharat'),
                    (2, '09:30', '10:30', 'AB-11: Floor Cleaning', 'floor', True, ''),
                    (3, '10:30', '13:00', 'AB-11: Classroom, Labs and Office Cleaning', 'room', True, ''),
                    (4, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (5, '14:00', '15:00', 'AB-11: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '15:00', '16:00', 'AB-11: Second Floor Lab Area', 'room', True, ''),
                    (7, '16:00', '17:00', 'AB-11: Washroom Touch Up, Dustbin, Corridor and Pantry', 'washroom', True, ''),
                ],
                'Academic Block 12': [
                    (1, '08:00', '09:00', 'AB-12: Washroom and Staircase Cleaning', 'washroom', True, 'Kailashbhai + Gautam + Devendra'),
                    (2, '09:00', '10:00', 'AB-12: Office Area Cleaning (All Floors)', 'room', True, ''),
                    (3, '10:00', '12:00', 'AB-12: Floor, Pantry and Lift Cleaning', 'floor', True, ''),
                    (4, '12:00', '13:00', 'AB-12: Extra Work', 'floor', True, 'Closed lab and office cleaning support'),
                    (5, '13:00', '14:00', 'AB-12: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '14:00', '16:00', 'AB-12: Big Lab and Ground Floor Lab Cleaning', 'room', True, ''),
                    (7, '16:00', '17:00', 'AB-12: Extra Work and Final Round', 'floor', True, ''),
                ],
                'Academic Block 13': [
                    (1, '08:00', '09:00', 'AB-13 GF: Washroom Floor Cleaning', 'washroom', True, 'Jignesh Solanki'),
                    (2, '09:00', '10:00', 'AB-13 GF: Classroom Staircase Cleaning', 'floor', True, ''),
                    (3, '10:00', '11:00', 'AB-13 GF: Washroom Touch Up + Lift + Room 112', 'washroom', True, 'Meeting room coverage'),
                    (4, '11:00', '12:00', 'AB-13 GF: Labs and Extra Work', 'room', True, ''),
                    (5, '12:00', '13:00', 'AB-13 GF: Final Ground Floor Touch Up', 'floor', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-13 2F/3F: Washroom Cleaning', 'washroom', True, 'Kunal + Mahesh'),
                    (8, '15:00', '16:00', 'AB-13 2F/3F: Floor and Office Cleaning', 'floor', True, ''),
                    (9, '16:00', '17:00', 'AB-13 2F/3F: Lab Area and Touch Up', 'room', True, ''),
                    (10, '08:00', '11:00', 'AB-13 Library: Washroom and Office Floor Cleaning', 'room', True, 'Ajay Rathod + Bharat Solanki'),
                    (11, '11:00', '13:00', 'AB-13 Library: First Floor Lab Floor Cleaning', 'room', True, ''),
                ],
                'Old Academic Common Area': [
                    (1, '07:00', '13:00', 'Old Academic Common Area: All Blocks Common Area + Marble Cleaning', 'floor', True, 'Bhavesh + Nikhil'),
                    (2, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (3, '15:00', '16:00', 'Old Academic Common Area: Block-07 Terrace Side Railing Dusting', 'floor', True, ''),
                ],
                'New AB U-Shape': [
                    (1, '08:00', '10:00', 'New AB U-Shape: Sweeping and Mopping', 'floor', True, 'Akshay Vaghela'),
                    (2, '10:00', '13:00', 'New AB U-Shape: Blocks 10-13 Common Area Cleaning - Round 1', 'floor', True, ''),
                    (3, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (4, '14:00', '17:00', 'New AB U-Shape: Blocks 10-13 Common Area Cleaning - Round 2', 'floor', True, ''),
                ],
                'New Academic Common Area': [
                    (1, '08:00', '10:00', 'New Academic Common Area: Sweeping and Mopping', 'floor', True, 'Jitendra Vasudev'),
                    (2, '10:00', '13:00', 'New Academic Common Area: Blocks 10-13 Common Area Cleaning - Round 1', 'floor', True, ''),
                    (3, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (4, '14:00', '17:00', 'New Academic Common Area: Blocks 10-13 Common Area Cleaning - Round 2', 'floor', True, ''),
                ],
            }

            academic_sunday_extra = {
                'Old Academic Common Area': [
                    (1, '08:00', '11:00', 'Sunday Deep Clean: Old Academic Common Area Samved Area Scrubbing and Washing', 'all', True, 'Weekly Sunday task'),
                ],
            }

            for area_name, tasks in academic_daily_tasks.items():
                area_obj = self.area(area_name)
                if not area_obj:
                    continue
                for order, start, end, name, tag, req_photo, desc in tasks:
                    HKScheduleTemplate.objects.create(
                        area=area_obj,
                        order=order,
                        start_time=t(start),
                        end_time=t(end),
                        task_name=name,
                        task_description=desc,
                        worker_tag=tag,
                        requires_photo=req_photo,
                        frequency='daily',
                        is_active=True,
                    )
                    total += 1

            for area_name, tasks in academic_sunday_extra.items():
                area_obj = self.area(area_name)
                if not area_obj:
                    continue
                for order, start, end, name, tag, req_photo, desc in tasks:
                    HKScheduleTemplate.objects.create(
                        area=area_obj,
                        order=order,
                        start_time=t(start),
                        end_time=t(end),
                        task_name=name,
                        task_description=desc,
                        worker_tag=tag,
                        requires_photo=req_photo,
                        frequency='sunday_extra',
                        is_active=True,
                    )
                    total += 1

        self.stdout.write(
            f'  [OK] Schedule templates: {total} '
            '(hostels + common area + research park + central arcade + sports complex + guest house + director bungalow + roads + swm + academic blocks)'
        )

