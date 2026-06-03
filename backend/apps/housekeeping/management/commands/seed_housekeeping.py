"""
Complete housekeeping seed with all real IITGN staff data.
Hostel/Common roster follows the submitted all-hostel staff list.
Caretakers: Priyanka, Anita, Rushita, Pankaj, Anil, Nikul, Jaimin, Ram Singh, Vishwajeet, Manisha Thapa
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
  Users:     {User.objects.filter(role__in=["admin","inventory_manager","housekeeping_manager","hk_inventory_manager","hostel_office","horticulture_manager","caretaker","supervisor"]).count()}
  Workers:   {HKWorker.objects.count()}
  Templates: {HKScheduleTemplate.objects.count()}

Default password for newly created accounts: {DEFAULT_PASSWORD}
Existing account passwords are preserved.
        '''))

    # ─────────────────────────────────────────────────────────────────

    def seed_areas(self):
        hostel_names = [
            'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet',
            'Firpeal', 'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia',
            'Kyzeel', 'Lekhaag',
            'Block-A JRHA', 'Block-B JRHA',
            'Block-C JRHA', 'Block-D JRHA',
        ]
        for name in hostel_names:
            HKArea.objects.get_or_create(name=name, defaults={'area_type': 'hostel'})

        legacy_beuaki = HKArea.objects.filter(name='Beuaki').first()
        if legacy_beuaki and not HKArea.objects.filter(name='Beauki').exists():
            legacy_beuaki.name = 'Beauki'
            legacy_beuaki.area_type = 'hostel'
            legacy_beuaki.is_active = True
            legacy_beuaki.save(update_fields=['name', 'area_type', 'is_active'])
        HKArea.objects.filter(name='Beauki').update(area_type='hostel', is_active=True)
        beauki = HKArea.objects.filter(name='Beauki').first()
        legacy_beuaki = HKArea.objects.filter(name='Beuaki').first()
        if beauki and legacy_beuaki and legacy_beuaki.id != beauki.id:
            HKWorker.objects.filter(area=legacy_beuaki).update(area=beauki)
            HKScheduleTemplate.objects.filter(area=legacy_beuaki).update(area=beauki)
            for assignment in HKUserArea.objects.filter(area=legacy_beuaki):
                HKUserArea.objects.get_or_create(user=assignment.user, area=beauki)
            HKUserArea.objects.filter(area=legacy_beuaki).delete()
            legacy_beuaki.is_active = False
            legacy_beuaki.save(update_fields=['is_active'])

        jrha_renames = {
            'Jeet Hostel Block A': 'Block-A JRHA',
            'Jeet Hostel Block B': 'Block-B JRHA',
            'Jeet Hostel Block C': 'Block-C JRHA',
            'Jeet Hostel Block D': 'Block-D JRHA',
        }
        for old_name, new_name in jrha_renames.items():
            legacy_area = HKArea.objects.filter(name=old_name).first()
            if legacy_area and not HKArea.objects.filter(name=new_name).exists():
                legacy_area.name = new_name
                legacy_area.area_type = 'hostel'
                legacy_area.is_active = True
                legacy_area.save(update_fields=['name', 'area_type', 'is_active'])
            HKArea.objects.filter(name=new_name).update(area_type='hostel', is_active=True)

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
            ('Deep Cleaning', 'other'),
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

    def make_user(
        self,
        username,
        first_name,
        last_name,
        phone,
        role,
        area_names,
        email='',
        pay_code='',
        match_pay_code=True,
        legacy_usernames=(),
        preserve_username=False,
    ):
        is_superuser = role == 'admin'
        is_staff = role in {'admin', 'inventory_manager', 'housekeeping_manager', 'hk_inventory_manager', 'horticulture_manager', 'hostel_office'}
        base_username = build_username_from_names(first_name, last_name)
        username_candidates = [username, base_username, *legacy_usernames] if preserve_username else [base_username, username, *legacy_usernames]
        if pay_code and match_pay_code:
            username_candidates.append(
                User.objects.filter(role=role, pay_code=pay_code).values_list('username', flat=True).first()
            )
        user = None
        for candidate in [u for u in username_candidates if u]:
            user = User.objects.filter(username=candidate).first()
            if user:
                break
        canonical_username = username if preserve_username else unique_standard_username(
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
                if preserve_username and User.objects.filter(username=canonical_username).exclude(pk=user.pk).exists():
                    canonical_username = unique_standard_username(
                        first_name,
                        last_name,
                        model=User,
                        exclude_pk=user.pk,
                    )
                user.username = canonical_username
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
            ('anita.vaghela', 'Anita', 'Vaghela', '10', '9512389739', 'anitavaghela98@gmail.com', ['Beauki', 'Chimair'], ['anita']),
            ('rhushita.chavda', 'Rhushita Chetankumar', 'Chavda', '294', '7083740424', '', ['Ijokha']),
            ('pankaj.bihola', 'Pankajsinh Amarsinh', 'Bihola', '293', '9904883975', 'pankajsingh2753@gmail.com', ['Duven', 'Emiet']),
            ('anil.solanki', 'Anil', 'Solanki', '300', '8155037413', 'anil8155037413@gmail.com', ['Firpeal', 'Griwiksh']),
            ('nikul.bihola', 'Nikulsinh Ashoksinh', 'Bihola', '427', '9714730290', 'nikulsinghbhola862@gmail.com', ['Hiqom']),
            ('jaimin.parmar', 'Jaimin', 'Parmar', '318', '7600738945', 'hostel.caretaker@iitgn.ac.in', ['Jurqia', 'Lekhaag']),
            ('ram.singh', 'Ram', 'Singh', '11', '9687460280', 'ramairy1198@gmail.com', ['Kyzeel'], ['ramprakash.parmar', 'ramsingh']),
            ('vishwajeet.mishra', 'Vishwajeet', 'Mishra', '08', '9898037530', 'mishra.vishwajeet@iitgn.ac.in', ['Hostel Common Area'], ['vishvajeet.kumar', 'vishwajeet']),
            ('manisha.thapa', 'Manisha', 'Thapa', '424', '9942523410', '', ['Block-B JRHA', 'Block-D JRHA']),
            ('shailesh.vaghela', 'Shailesh', 'Vaghela', '422', '7990375262', '', ['Block-A JRHA', 'Block-C JRHA']),
            ('kailash.vaghela', 'Kailash', 'Vaghela (JRHA Night)', '', '', '', ['Block-A JRHA', 'Block-B JRHA', 'Block-C JRHA', 'Block-D JRHA']),
        ]
        for caretaker in caretakers:
            username, first, last, pc, phone, email, areas, *rest = caretaker
            legacy_usernames = rest[0] if rest else ()
            self.make_user(
                username,
                first,
                last,
                phone,
                'caretaker',
                areas,
                email=email,
                pay_code=pc,
                legacy_usernames=legacy_usernames,
                preserve_username=True,
            )

        # Supervisors (campus sections)
        supervisors = [
            # (username, first, last, pay_code, phone, email, areas)
            ('ashok.rathod', 'Ashokbhai Ishwarbhai', 'Rathod', '2', '7016722524', 'ashok2969798@gmail.com', ['Guest House New', 'Director Bungalow']),
            ('kaushik.parmar', 'Kaushikkumar Balvantbhai', 'Parmar', '396', '9825504802', 'kaushikparmar7673@gmail.com', ['Academic Block 12', 'Academic Block 13', 'New Academic Common Area', 'New Academic Reliever']),
            ('shailesh.prajapati', 'Shailesh Natvarbhai', 'Prajapati', '4', '9898477320', '', ['Academic Block 10', 'Academic Block 11', 'New AB U-Shape', 'New Academic Reliever']),
            ('maulik.patel', 'Maulikkumar Dilipbhai', 'Patel', '7', '8758363879', 'maulikpatel81290@gmail.com', ['Research Park']),
            ('bharat.solanki', 'Bharat Kumar M.', 'Solanki', '465', '8511764551', 'bharat2545007@gmail.com', ['Sports Complex', 'Central Arcade']),
            ('mukesh.vaghela', 'Mukeshkumar', 'Vaghela', '466', '9265591836', 'm.vaghela23@gmail.com', ['Academic Block 1', 'Academic Block 2', 'Academic Block 5', 'Academic Block 6', 'Academic Block 8', 'Old Academic Reliever']),
            ('bipin.vaghela', 'Bipinchandra Dineshkumar', 'Vaghela', '350', '9979627312', 'bipin.vaghela4u@gmail.com', ['Academic Block 3', 'Academic Block 4', 'Academic Block 7', 'Academic Block 9', 'Old Academic Common Area']),
            ('narendra.shreemali', 'Narendrakumar Natvarbhai', 'Shrimali', '328', '9898661986', 'narendrashrimali36262@gmail.com', ['Roads & Outdoor', 'Old Guest House']),
            ('pradip.chauhan', 'Pradip', 'Chauhan', '460', '8200560889', 'pradipchauhan783@gmail.com', ['Solid Waste Management']),
            ('ganesh.jayesh', 'Ganesh', 'Jayesh', '404', '9537558820', 'Ganeshjayesh820@gmail.com', ['Deep Cleaning']),
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
            ('super.admin', 'Super', 'Admin', '9727757096', 'admin', [], 'pragnesh@iitgn.ac.in', ''),
            ('mahesh.prajapati', 'Maheshbhai', 'Prajapati', '9723889424', 'horticulture_manager', [], 'managerhort.iwd@iitgn.ac.in', '474'),
            ('hk_inventory_manager', 'Housekeeping Inventory', 'Manager', '8758120645', 'hk_inventory_manager', [], 'manager.hk@iitgn.ac.in', '469'),
            ('hostel.office', 'Hostel', 'Office', '', 'hostel_office', [], 'hostel.office@iitgn.ac.in', ''),
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
                preserve_username=True,
            )

        for username in ['super.admin', 'hk_inventory_manager', 'hostel.office']:
            user = User.objects.filter(username=username).first()
            if user:
                user.set_password(DEFAULT_PASSWORD)
                user.is_active = True
                user.is_staff = True
                user.is_superuser = username == 'super.admin'
                if username == 'super.admin':
                    user.first_name = 'Super'
                    user.last_name = 'Admin'
                    user.email = 'pragnesh@iitgn.ac.in'
                    user.phone = '9727757096'
                    user.role = 'admin'
                if username == 'hk_inventory_manager':
                    user.first_name = 'Housekeeping Inventory'
                    user.last_name = 'Manager'
                    user.email = 'manager.hk@iitgn.ac.in'
                    user.phone = '8758120645'
                    user.pay_code = '469'
                    user.role = 'hk_inventory_manager'
                if username == 'hostel.office':
                    user.first_name = 'Hostel'
                    user.last_name = 'Office'
                    user.email = 'hostel.office@iitgn.ac.in'
                    user.phone = ''
                    user.pay_code = ''
                    user.role = 'hostel_office'
                user.save()

        disabled = User.objects.filter(username__in=['housekeeping.manager', 'inventory.manager']).update(
            is_active=False,
            is_staff=False,
            is_superuser=False,
        )

        self.stdout.write(
            f'  [OK] Portal users: {User.objects.filter(role__in=["admin","inventory_manager","housekeeping_manager","hk_inventory_manager","horticulture_manager","hostel_office"]).count()}'
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
            'admin.user', 'admin', 'estate.manager', 'hostel.manager', 'horticulture.manager', 'inv.manager',
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

        if pay_code:
            pay_code_matches = [
                worker for worker in all_workers
                if worker.id not in keep_ids
                and (worker.pay_code or '').strip() == pay_code
            ]
            for worker in pay_code_matches:
                if worker.area_id == area.id:
                    return worker
            for worker in pay_code_matches:
                if worker.area_id in managed_area_ids:
                    return worker

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

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id in managed_area_ids and worker_key(worker.name) in legacy_keys:
                return worker

        return None

    def _existing_worker_phone(self, name, pay_code, current_worker=None):
        qs = HKWorker.objects.exclude(phone='')
        if current_worker and getattr(current_worker, 'pk', None):
            qs = qs.exclude(pk=current_worker.pk)

        pay_code = (pay_code or '').strip()
        if pay_code:
            donor = qs.filter(pay_code=pay_code).order_by('-is_active', 'id').first()
            if donor:
                return donor.phone

        name = (name or '').strip()
        if name:
            donor = qs.filter(name__iexact=name).order_by('-is_active', 'id').first()
            if donor:
                return donor.phone

        return ''

    def _enforce_active_roster_by_pay_code(self, roster_specs, supervisor_username):
        supervisor = User.objects.filter(username=supervisor_username).first()
        areas = {
            spec['area']: self.area(spec['area'])
            for spec in roster_specs
        }
        keep_ids = set()
        synced_count = 0

        for spec in roster_specs:
            area = areas.get(spec['area'])
            if not area:
                continue

            pay_code = (spec.get('pay_code') or '').strip()
            managed_areas = [managed_area for managed_area in areas.values() if managed_area]
            candidates = HKWorker.objects.filter(area__in=managed_areas)
            if pay_code:
                candidates = candidates.filter(pay_code=pay_code)
            else:
                candidates = candidates.filter(area=area, name__iexact=spec['name'])

            worker = (
                candidates.filter(area=area).order_by('-is_active', 'id').first()
                or candidates.order_by('-is_active', 'id').first()
            )
            if worker is None:
                worker = HKWorker(area=area)

            phone = spec.get('phone') or self._existing_worker_phone(spec['name'], pay_code, worker)
            worker.name = spec['name']
            worker.pay_code = pay_code
            worker.phone = phone or ''
            worker.worker_type = spec.get('worker_type', 'general')
            worker.shift = spec.get('shift', 'day')
            worker.area = area
            worker.supervisor = supervisor
            worker.is_reliever = spec.get('is_reliever', False)
            worker.is_active = True
            worker.save()
            keep_ids.add(worker.id)
            synced_count += 1

            if pay_code:
                HKWorker.objects.filter(
                    area__in=managed_areas,
                    pay_code=pay_code,
                    is_active=True,
                ).exclude(pk=worker.pk).update(is_active=False)

        deactivated_count = HKWorker.objects.filter(
            area__in=[area for area in areas.values() if area],
            is_active=True,
        ).exclude(pk__in=keep_ids).update(is_active=False)
        return synced_count, deactivated_count

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
            pay_code = spec.get('pay_code', '')
            if (
                spec['name'] == 'Dhaval S Solanki'
                and HKWorker.objects.filter(pay_code='484').exclude(pk=getattr(worker, 'pk', None)).exists()
            ):
                pay_code = '484.2'
            worker.pay_code = pay_code
            phone = spec.get('phone') or self._existing_worker_phone(spec['name'], pay_code, worker)
            if phone:
                worker.phone = phone
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

    def _deactivate_extra_hostel_workers(self, keep_ids, area_names):
        return HKWorker.objects.filter(
            area__area_type='hostel',
            area__name__in=area_names,
            is_active=True,
        ).exclude(id__in=keep_ids).update(is_active=False)

    def _force_exact_hostel_roster(self, roster_specs, managed_area_names):
        supervisors = {
            username: User.objects.filter(username=username).first()
            for username in {spec.get('supervisor_username') for spec in roster_specs if spec.get('supervisor_username')}
        }
        areas = {
            name: self.area(name)
            for name in {spec['area'] for spec in roster_specs}
        }
        managed_area_names = sorted(set(managed_area_names))

        HKWorker.objects.filter(
            area__name__in=managed_area_names,
            is_active=True,
        ).update(is_active=False)

        touched_ids = set()
        synced_count = 0
        created_count = 0

        for spec in roster_specs:
            area = areas.get(spec['area'])
            if not area:
                continue

            pay_code = (spec.get('pay_code') or '').strip()
            legacy_keys = {worker_key(spec['name'])}
            legacy_keys.update(worker_key(name) for name in spec.get('legacy_names', []) if name)

            worker = None
            candidates = HKWorker.objects.select_related('area').filter(
                area__name__in=managed_area_names,
            ).exclude(id__in=touched_ids)
            if pay_code:
                worker = candidates.filter(pay_code=pay_code).order_by('-is_active', 'id').first()
            if worker is None:
                for candidate in candidates.filter(area=area).order_by('-is_active', 'id'):
                    if worker_key(candidate.name) in legacy_keys:
                        worker = candidate
                        break

            created = worker is None
            if worker is None:
                worker = HKWorker(area=area)

            phone = spec.get('phone') or self._existing_worker_phone(spec['name'], pay_code, worker)
            worker.name = spec['name']
            worker.pay_code = pay_code
            worker.phone = phone or ''
            worker.worker_type = spec.get('worker_type', 'general')
            worker.shift = spec.get('shift', 'day')
            worker.area = area
            worker.supervisor = supervisors.get(spec.get('supervisor_username'))
            worker.is_reliever = spec.get('is_reliever', False)
            worker.is_active = True
            worker.save()

            touched_ids.add(worker.id)
            synced_count += 1
            if created:
                created_count += 1

        extra_deactivated = HKWorker.objects.filter(
            area__name__in=managed_area_names,
            is_active=True,
        ).exclude(id__in=touched_ids).update(is_active=False)

        return synced_count, created_count, extra_deactivated

    def _sync_area_roster_by_supervisor(self, roster_specs):
        supervisors = {
            username: User.objects.filter(username=username).first()
            for username in {spec.get('supervisor_username') for spec in roster_specs if spec.get('supervisor_username')}
        }
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

            pay_code = spec.get('pay_code', '')
            phone = spec.get('phone') or self._existing_worker_phone(spec['name'], pay_code, worker)
            worker.name = spec['name']
            worker.pay_code = pay_code
            worker.worker_type = spec.get('worker_type', 'general')
            worker.shift = spec.get('shift', 'day')
            worker.area = area
            worker.supervisor = supervisors.get(spec.get('supervisor_username'))
            worker.is_reliever = spec.get('is_reliever', False)
            worker.is_active = True
            if phone or not worker.phone:
                worker.phone = phone
            worker.save()

            if created:
                all_workers.append(worker)
            keep_ids.add(worker.id)
            synced_count += 1

        deactivated_count = self._deactivate_extra_hostel_workers(
            keep_ids,
            sorted(managed_areas),
        )

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
        Current housekeeping staffing seed.
        Hostel/Common Area roster follows the final supervisor list; JRHA is
        maintained separately and is not included in that hostel/common roster.
        Relievers: is_reliever=True, worker_type='reliever'
        Each worker is assigned to their hostel area.
        """
        # Format: (name, punching_no, phone, area_name, worker_type, is_reliever)
        # Hostel, hostel common area, and hostel relievers are synced below
        # from hostel_roster only, so old hostel/JRHA rows are not recreated.
        workers = [
            # -- RESEARCH PARK -----------------------------------------------
            ('Mahesh Solanki',              '267', '7046959603', 'Research Park', 'floor',    False),
            ('Dhaval S Solanki',            '484', '',           'Research Park', 'floor',    False),
            ('Sailesh A Vaghela',           '266', '7284950619', 'Research Park', 'room',     False),
            ('Vaghela Dharmishtha Ben',     '264', '9328002335', 'Research Park', 'washroom', False),

            # -- CENTRAL ARCADE ----------------------------------------------
            ('Ramesh Parmar',      '429', '', 'Central Arcade', 'washroom', False),
            ('Rudhreshben S Solanki', '282', '', 'Central Arcade', 'room',  False),
            ('Chauhan Nilamben',   '410', '7041529877', 'Central Arcade', 'floor', False),

            # -- SPORTS COMPLEX ----------------------------------------------
            ('Shohil J Vaghela',      '257', '', 'Sports Complex', 'washroom', False),
            ('Ramesh N Parmar',       '411', '', 'Sports Complex', 'floor',    False),
            ('Jaydeep D Vaghela',     '447', '', 'Sports Complex', 'general',  False),
            ('Rahul J Vaghela',       '337', '', 'Sports Complex', 'washroom', False),
            ('Akshay R Parmar',       '414', '', 'Sports Complex', 'floor',    False),
            ('Bhavna Ben Chavda',     '218', '', 'Sports Complex', 'room',     False),
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
            ('Nishaben H. Parmar',                 '477', '7984047705', 'Academic Block 6', 'washroom', False),
            ('Ashokkumar Maheriya',                '114', '7383949367', 'Academic Block 6', 'floor',    False),
            ('Hitenkumar Parmar',                  '307', '8866745431', 'Academic Block 6', 'room',     False),
            ('Gurjar Chandrikaben',                '74',  '9737520471', 'Academic Block 7', 'washroom', False),
            ('Parmar Nikulkumar Punjabhai',        '309', '8155861394', 'Academic Block 7', 'floor',    False),
            ('Ajaykumar Solanki',                  '281', '8401109316', 'Old Academic Reliever', 'reliever', True),
            ('Solanki Akashkumar Hasmukhbhai',     '253', '8160847423', 'Old Academic Reliever', 'reliever', True),
            ('Pravinbhai Vaghela',                 '400', '9624126018', 'Old Academic Reliever', 'reliever', True),
            ('Jyotsanaben Vaghela',                '231', '9574720027', 'Old Academic Reliever', 'reliever', True),
            ('Jay Kumar Solanki',                  '105', '8511476360', 'Academic Block 9', 'room',     False),
            ('Padmaben',                           '347', '', 'Academic Block 10', 'floor',    False),
            ('Devendra',                           '437', '', 'Academic Block 10', 'room',     False),
            ('Jitendra',                           '377', '', 'Academic Block 10', 'floor',    False),
            ('Sangitaben',                         '412', '', 'Academic Block 11', 'washroom', False),
            ('Sunil',                              '348', '', 'Academic Block 11', 'floor',    False),
            ('Hitendra',                           '448', '', 'Academic Block 11', 'room',     False),
            ('Mahesh',                             '402', '', 'Academic Block 12', 'floor',    False),
            ('Akshay',                             '308', '', 'Academic Block 12', 'floor',    False),
            ('Kailashben',                         '102', '', 'Academic Block 12', 'washroom', False),
            ('Ajay',                               '93',  '', 'Academic Block 13', 'room',     False),
            ('Gautam',                             '333', '', 'Academic Block 13', 'floor',    False),
            ('Jignesh',                            '363', '', 'Academic Block 13', 'washroom', False),
            ('Kunal',                              '390', '', 'Academic Block 13', 'room',     False),
            ('Chandrika',                          '346', '', 'Academic Block 13', 'washroom', False),
            ('Bharat',                             '362', '', 'Academic Block 13', 'room',     False),
            ('Parth',                              '384', '', 'Academic Block 13', 'floor',    False),
            ('Vaghela Bhaveshbhai Narnabhai',      '315', '9974738575', 'Old Academic Common Area', 'floor', False),
            ('Vaniya Nikhilkumar Bhaveshbhai',     '314', '8849436518', 'Old Academic Common Area', 'floor', False),
            ('Hitesh',                             '434', '', 'New Academic Common Area', 'floor', False),
            ('Niruben',                            '111', '', 'New Academic Reliever', 'reliever', True),
            ('Ilesh',                              '361', '', 'New Academic Reliever', 'reliever', True),

        ]

        # Backward-compatibility: move reshuffled hostel workers instead of
        # leaving stale active rows in their old hostel/reliever locations.
        hostel_area_moves = [
            ('357', 'Reeta Ben', 'Aibaan'),
            ('219', 'Sangeeta Ben', 'Aibaan'),
            ('419', 'Shilpa Ben', 'Aibaan'),
            ('98', 'Meena ben', 'Beauki'),
            ('76', 'Kailash ben M', 'Beauki'),
            ('415', 'Sonal ben', 'Beauki'),
            ('332', 'Bhanu Ben', 'Chimair'),
            ('233', 'Surya Ben', 'Chimair'),
            ('418', 'Dipika Ben', 'Chimair'),
            ('249', 'Champa Ben', 'Chimair'),
            ('143', 'Kailash B Parmar', 'Ijokha'),
            ('386', 'Mittal Ben Vaghela', 'Ijokha'),
            ('230', 'Geeta Ben Parmar', 'Ijokha'),
            ('356', 'Manisha ben', 'Hostels Reliever'),
            ('115', 'Jignesh', 'Duven'),
            ('260', 'Karan', 'Duven'),
            ('109', 'Sailesh Vaghela', 'Duven'),
            ('435', 'Umesh Babariya', 'Hostels Reliever'),
            ('239', 'Shailesh Rathod', 'Emiet'),
            ('131', 'Dhiraj', 'Emiet'),
            ('259', 'Jaydeep Solanki', 'Emiet'),
            ('121', 'Rajendra', 'Hostels Reliever'),
            ('104', 'Rajesh Talvadi', 'Firpeal'),
            ('258', 'Mayur Solanki', 'Firpeal'),
            ('157', 'Jagdish Chavda', 'Firpeal'),
            ('446', 'Nikul Solanki', 'Griwiksh'),
            ('95', 'Jitendra Piwal', 'Griwiksh'),
            ('73', 'Suresh Solanki', 'Griwiksh'),
            ('261', 'Nitin Makwana', 'Hostels Reliever'),
            ('148', 'Mahendra Makwana', 'Hiqom'),
            ('110', 'Amit', 'Hiqom'),
            ('153', 'Rajnikant', 'Hiqom'),
            ('256', 'Mehul Rathod', 'Hiqom'),
            ('242', 'Prahlad Parmar', 'Hiqom'),
            ('75', 'Hasmukhbhai', 'Hostels Reliever'),
            ('449', 'Jaykesh', 'Jurqia'),
            ('89', 'Naresh', 'Jurqia'),
            ('106', 'Mehul Jadeja', 'Jurqia'),
            ('122', 'Harish', 'Jurqia'),
            ('136', 'Vinay', 'Hostels Reliever'),
            ('91', 'Pravinbhai Mahida', 'Kyzeel'),
            ('283', 'Solanki Chandrakant', 'Kyzeel'),
            ('113', 'Satishbhai', 'Kyzeel'),
            ('97', 'Shailesh Talvadi', 'Kyzeel'),
            ('310', 'Anandkumar Parmar', 'Kyzeel'),
            ('154', 'Lala', 'Hostels Reliever'),
            ('245', 'Ravi', 'Lekhaag'),
            ('149', 'Banshi', 'Lekhaag'),
            ('246', 'Pravin Vaghela', 'Lekhaag'),
            ('438', 'Rakesh', 'Lekhaag'),
            ('88', 'Mukesh', 'Hostels Reliever'),
            ('80', 'Yogesh Vaghela', 'Hostel Common Area'),
            ('240', 'Vinayak Solanki', 'Hostel Common Area'),
            ('100', 'Ketan Gujjar', 'Hostel Common Area'),
            ('472', 'Suresh Solanki', 'Hostel Common Area'),
            ('542', 'Anil Thakur', 'Hostel Common Area'),
            ('471', 'Krunal Parmar', 'Hostels Reliever'),
            ('416', 'Rajesh Parmar', 'Block-A JRHA'),
            ('417', 'Rahul Rathod', 'Block-A JRHA'),
            ('450', 'Darshan', 'Block-A JRHA'),
            ('129', 'Manisha Ben', 'Block-B JRHA'),
            ('134', 'Sugna Ben', 'Block-B JRHA'),
            ('150', 'Leela Ben', 'Block-B JRHA'),
            ('456', 'Himmat', 'Block-C JRHA'),
            ('77', 'Hasmukh', 'Block-C JRHA'),
            ('454', 'Suresh', 'Block-C JRHA'),
            ('457', 'Bhavika', 'Block-D JRHA'),
            ('458', 'Hetal', 'Block-D JRHA'),
            ('459', 'Urvashi', 'Block-D JRHA'),
        ]
        managed_hostel_area_names = [
            'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet', 'Firpeal',
            'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia', 'Kyzeel', 'Lekhaag',
            'Block-A JRHA', 'Block-B JRHA', 'Block-C JRHA', 'Block-D JRHA',
            'Jeet Hostel Block A', 'Jeet Hostel Block B',
            'Jeet Hostel Block C', 'Jeet Hostel Block D',
            'Hostel Common Area', 'Hostels Reliever', 'Beuaki',
        ]
        for pay_code, name, area_name in hostel_area_moves:
            target_area = self.area(area_name)
            if not target_area:
                continue
            HKWorker.objects.filter(
                pay_code=pay_code,
                area__area_type='hostel',
                area__name__in=managed_hostel_area_names,
            ).update(
                name=name,
                area=target_area,
                is_active=True,
                is_reliever=(area_name == 'Hostels Reliever'),
            )
            HKWorker.objects.filter(pay_code=pay_code, name=name).exclude(area=target_area).update(
                area=target_area,
                is_active=True,
                is_reliever=(area_name == 'Hostels Reliever'),
            )

        HKWorker.objects.filter(area=self.area('Hostels Reliever'), is_reliever=True).exclude(
            name__iexact='Anju Ben'
        ).update(is_active=False)

        created_count = 0
        for name, pay_code, phone, area_name, wtype, is_reliever in workers:
            area = self.area(area_name) if area_name else None
            worker = HKWorker.objects.filter(name=name, area=area).order_by('-is_active', '-id').first()
            created = worker is None
            effective_pay_code = pay_code
            if (
                name == 'Dhaval S Solanki'
                and HKWorker.objects.filter(pay_code='484').exclude(pk=getattr(worker, 'pk', None)).exists()
            ):
                effective_pay_code = '484.2'
            phone = phone or self._existing_worker_phone(name, effective_pay_code, worker)
            if created:
                worker = HKWorker(
                    name=name,
                    area=area,
                    pay_code=effective_pay_code,
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
                worker.pay_code = effective_pay_code
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

        for name, pay_code, phone, area_name, wtype, is_reliever in workers:
            if not pay_code or area_name not in managed_hostel_area_names:
                continue
            target = HKWorker.objects.filter(
                pay_code=pay_code,
                area__name=area_name,
                worker_type=wtype,
                is_reliever=is_reliever,
                is_active=True,
            ).order_by('id').first()
            if target:
                HKWorker.objects.filter(
                    pay_code=pay_code,
                    area__name__in=managed_hostel_area_names,
                    is_active=True,
                ).exclude(pk=target.pk).update(is_active=False)

        hostel_roster = [
            {'area': 'Aibaan', 'name': 'Reeta ben', 'pay_code': '357', 'phone': '9574379477', 'worker_type': 'room', 'supervisor_username': 'priyanka.parmar', 'legacy_names': ['Reeta Ben', 'Reeta ben']},
            {'area': 'Aibaan', 'name': 'Sangeeta ben', 'pay_code': '219', 'phone': '8866941201', 'worker_type': 'floor', 'supervisor_username': 'priyanka.parmar', 'legacy_names': ['Sangeeta Ben', 'Sangeeta ben', 'Sangeeta  ben']},
            {'area': 'Aibaan', 'name': 'Shilpa ben', 'pay_code': '419', 'phone': '6356046585', 'worker_type': 'washroom', 'supervisor_username': 'priyanka.parmar', 'legacy_names': ['Shilpa Ben', 'Shilpa ben']},
            {'area': 'Beauki', 'name': 'Meena ben', 'pay_code': '98', 'phone': '9909679865', 'worker_type': 'room', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Meena Ben', 'Meena ben']},
            {'area': 'Beauki', 'name': 'Kailash ben M', 'pay_code': '76', 'phone': '8490053837', 'worker_type': 'floor', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Kailashben M', 'Kailash ben M']},
            {'area': 'Beauki', 'name': 'Sonal ben', 'pay_code': '415', 'phone': '7359834672', 'worker_type': 'washroom', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Sonal Ben', 'Sonal ben']},
            {'area': 'Chimair', 'name': 'Bhanu ben', 'pay_code': '332', 'phone': '7567371788', 'worker_type': 'room', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Bhanu Ben', 'Bhanu ben']},
            {'area': 'Chimair', 'name': 'Surya ben', 'pay_code': '233', 'phone': '9725963299', 'worker_type': 'floor', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Surya Ben', 'Surya ben']},
            {'area': 'Chimair', 'name': 'Dipika ben', 'pay_code': '418', 'phone': '7383512108', 'worker_type': 'washroom', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Deepika Ben', 'Dipika Ben', 'Dipika ben']},
            {'area': 'Chimair', 'name': 'Champa ben', 'pay_code': '249', 'phone': '', 'worker_type': 'floor', 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Champa Ben', 'Champa ben', 'Champaben Vaghela']},
            {'area': 'Ijokha', 'name': 'Kailash ben B', 'pay_code': '143', 'phone': '7265921026', 'worker_type': 'room', 'supervisor_username': 'rhushita.chavda', 'legacy_names': ['Kailash B Parmar', 'Kailash B', 'Kailash ben B']},
            {'area': 'Ijokha', 'name': 'Mittal ben Vaghela', 'pay_code': '386', 'phone': '7383619204', 'worker_type': 'floor', 'supervisor_username': 'rhushita.chavda', 'legacy_names': ['Mital Ben', 'Mittal Ben Vaghela', 'Mittal ben Vaghela']},
            {'area': 'Ijokha', 'name': 'Geeta ben Parmar', 'pay_code': '230', 'phone': '7041016942', 'worker_type': 'washroom', 'supervisor_username': 'rhushita.chavda', 'legacy_names': ['Geeta Ben', 'Geeta Ben Parmar', 'Geeta ben Parmar']},
            {'area': 'Duven', 'name': 'Jignesh', 'pay_code': '115', 'phone': '8401617156', 'worker_type': 'room', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Jignesh']},
            {'area': 'Duven', 'name': 'Karan', 'pay_code': '260', 'phone': '7016522113', 'worker_type': 'floor', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Karan']},
            {'area': 'Duven', 'name': 'Sailesh Vaghela', 'pay_code': '109', 'phone': '8734987012', 'worker_type': 'washroom', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Sailesh Vaghela', 'Sailesh vaghala']},
            {'area': 'Emiet', 'name': 'Shailesh Rathod', 'pay_code': '239', 'phone': '9081107066', 'worker_type': 'room', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Shailesh Rathod']},
            {'area': 'Emiet', 'name': 'Dhiraj', 'pay_code': '131', 'phone': '', 'worker_type': 'floor', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Dhiraj']},
            {'area': 'Emiet', 'name': 'Jaydeep Solanki', 'pay_code': '259', 'phone': '9727981188', 'worker_type': 'washroom', 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Jaydeep Solanki', 'jaydeep Solanki']},
            {'area': 'Firpeal', 'name': 'Rajesh Talvadi', 'pay_code': '104', 'phone': '7046510026', 'worker_type': 'room', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Rajesh Talvadi']},
            {'area': 'Firpeal', 'name': 'Mayur Solanki', 'pay_code': '258', 'phone': '', 'worker_type': 'floor', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Mayur Solanki', 'Mayur  Solanki']},
            {'area': 'Firpeal', 'name': 'Jagdish Chavda', 'pay_code': '157', 'phone': '9662312505', 'worker_type': 'washroom', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Jagdish', 'Jagdish chavda']},
            {'area': 'Griwiksh', 'name': 'Nikul Solanki', 'pay_code': '446', 'phone': '8238759843', 'worker_type': 'room', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Nikul Solanki']},
            {'area': 'Griwiksh', 'name': 'Jitendra Piwal', 'pay_code': '95', 'phone': '9723216455', 'worker_type': 'floor', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Jitendra', 'jitendra piwal', 'Jitendra Piwal']},
            {'area': 'Griwiksh', 'name': 'Suresh Solanki', 'pay_code': '73', 'phone': '9687317660', 'worker_type': 'washroom', 'supervisor_username': 'anil.solanki', 'legacy_names': ['Suresh Solanki']},
            {'area': 'Hiqom', 'name': 'Mahendra Makwana', 'pay_code': '148', 'phone': '7041143190', 'worker_type': 'room', 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Mahendra Makwana']},
            {'area': 'Hiqom', 'name': 'Amit', 'pay_code': '110', 'phone': '7779004437', 'worker_type': 'room', 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Amit']},
            {'area': 'Hiqom', 'name': 'Rajnikant', 'pay_code': '153', 'phone': '6355825476', 'worker_type': 'floor', 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Rajnikant']},
            {'area': 'Hiqom', 'name': 'Mehul Rathod', 'pay_code': '256', 'phone': '6353451489', 'worker_type': 'washroom', 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Mehul Rathod']},
            {'area': 'Hiqom', 'name': 'Prahlad Parmar', 'pay_code': '242', 'phone': '8734949909', 'worker_type': 'washroom', 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Prahlad Parmar']},
            {'area': 'Jurqia', 'name': 'Jaykesh', 'pay_code': '449', 'phone': '8401531547', 'worker_type': 'room', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Jaykesh']},
            {'area': 'Jurqia', 'name': 'Naresh', 'pay_code': '89', 'phone': '7284086230', 'worker_type': 'floor', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Naresh']},
            {'area': 'Jurqia', 'name': 'Mehul Jadeja', 'pay_code': '106', 'phone': '7096229284', 'worker_type': 'washroom', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Mehul Jadeja']},
            {'area': 'Jurqia', 'name': 'Harish', 'pay_code': '122', 'phone': '7698462575', 'worker_type': 'washroom', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Harish']},
            {'area': 'Kyzeel', 'name': 'Pravinbhai Mahida', 'pay_code': '91', 'phone': '9265530235', 'worker_type': 'room', 'supervisor_username': 'ram.singh', 'legacy_names': ['Pravin Maida', 'pravinbhai mahida', 'Pravinbhai Mahida']},
            {'area': 'Kyzeel', 'name': 'Solanki Chandrakant', 'pay_code': '283', 'phone': '7201863872', 'worker_type': 'room', 'supervisor_username': 'ram.singh', 'legacy_names': ['Chandrakant', 'Solanki Chandrakant']},
            {'area': 'Kyzeel', 'name': 'Satishbhai', 'pay_code': '113', 'phone': '9558903676', 'worker_type': 'floor', 'supervisor_username': 'ram.singh', 'legacy_names': ['Satish', 'Satishbhi', 'Satishbhai']},
            {'area': 'Kyzeel', 'name': 'Shailesh Talvadi', 'pay_code': '97', 'phone': '8866886040', 'worker_type': 'washroom', 'supervisor_username': 'ram.singh', 'legacy_names': ['Shailesh Talvadi']},
            {'area': 'Kyzeel', 'name': 'Anandkumar Parmar', 'pay_code': '310', 'phone': '9023393753', 'worker_type': 'washroom', 'supervisor_username': 'ram.singh', 'legacy_names': ['Anand', 'Anandkumar parmar', 'Anandkumar Parmar']},
            {'area': 'Lekhaag', 'name': 'Ravi', 'pay_code': '245', 'phone': '7383342914', 'worker_type': 'room', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Ravi']},
            {'area': 'Lekhaag', 'name': 'Banshi', 'pay_code': '149', 'phone': '9023507559', 'worker_type': 'floor', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Banshi']},
            {'area': 'Lekhaag', 'name': 'Pravin Vaghela', 'pay_code': '246', 'phone': '8511376344', 'worker_type': 'washroom', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Pravin Vaghela', 'pravin Vaghela']},
            {'area': 'Lekhaag', 'name': 'Rakesh', 'pay_code': '438', 'phone': '9316531354', 'worker_type': 'washroom', 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Rakesh']},
            {'area': 'Hostel Common Area', 'name': 'Yogesh Vaghela', 'pay_code': '80', 'phone': '9998100804', 'worker_type': 'room', 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Yogesh Vaghela']},
            {'area': 'Hostel Common Area', 'name': 'Vinayak Solanki', 'pay_code': '240', 'phone': '9023271834', 'worker_type': 'washroom', 'shift': 'night', 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Vinayak Solanki']},
            {'area': 'Hostel Common Area', 'name': 'Ketan Gujjar', 'pay_code': '100', 'phone': '8347139138', 'worker_type': 'floor', 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Ketan Gujjar']},
            {'area': 'Hostel Common Area', 'name': 'Suresh Solanki', 'pay_code': '472', 'phone': '', 'worker_type': 'general', 'shift': 'evening', 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Suresh', 'Suresh Solanki']},
            {'area': 'Hostel Common Area', 'name': 'Anil Thakur', 'pay_code': '542', 'phone': '9265665289', 'worker_type': 'floor', 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Anil Thakur']},
            {'area': 'Hostels Reliever', 'name': 'Anju ben', 'pay_code': '', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'priyanka.parmar', 'legacy_names': ['Anju Ben', 'Anju ben']},
            {'area': 'Hostels Reliever', 'name': 'Manisha ben', 'pay_code': '356', 'phone': '9157691322', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'anita.vaghela', 'legacy_names': ['Manisha Ben', 'Manisha ben']},
            {'area': 'Hostels Reliever', 'name': 'Umesh Babariya', 'pay_code': '435', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Umesh Babariya']},
            {'area': 'Hostels Reliever', 'name': 'Rajendra', 'pay_code': '121', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'pankaj.bihola', 'legacy_names': ['Rajendra']},
            {'area': 'Hostels Reliever', 'name': 'Nitin Makwana', 'pay_code': '261', 'phone': '9157708871', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'anil.solanki', 'legacy_names': ['Nitin Makwana']},
            {'area': 'Hostels Reliever', 'name': 'Hasmukhbhai', 'pay_code': '75', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'nikul.bihola', 'legacy_names': ['Hasmukhbhai']},
            {'area': 'Hostels Reliever', 'name': 'Vinay', 'pay_code': '136', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Vinay']},
            {'area': 'Hostels Reliever', 'name': 'Lala', 'pay_code': '154', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'ram.singh', 'legacy_names': ['Lala']},
            {'area': 'Hostels Reliever', 'name': 'Mukesh', 'pay_code': '88', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'jaimin.parmar', 'legacy_names': ['Mukesh']},
            {'area': 'Hostels Reliever', 'name': 'Krunal Parmar', 'pay_code': '471', 'phone': '', 'worker_type': 'reliever', 'is_reliever': True, 'supervisor_username': 'vishwajeet.mishra', 'legacy_names': ['Krunal', 'Krunal Parmar']},
            {'area': 'Block-A JRHA', 'name': 'Rajesh Parmar', 'pay_code': '416', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Rajeshbhai Parmar', 'Rajesh Parmar']},
            {'area': 'Block-A JRHA', 'name': 'Rahul Rathod', 'pay_code': '417', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Rahul Rathod']},
            {'area': 'Block-A JRHA', 'name': 'Darshan', 'pay_code': '450', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Darshan Brahmaniya', 'Darshan']},
            {'area': 'Block-B JRHA', 'name': 'Manisha Ben', 'pay_code': '129', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Manisha Ben K Vaghela', 'Manisha Ben']},
            {'area': 'Block-B JRHA', 'name': 'Sugna Ben', 'pay_code': '134', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Sugna Ben J Vaghela', 'Sugna Ben']},
            {'area': 'Block-B JRHA', 'name': 'Leela Ben', 'pay_code': '150', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Leela Ben Parmar', 'Leela Ben']},
            {'area': 'Block-C JRHA', 'name': 'Himmat', 'pay_code': '456', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Himmat Bhai', 'Himmat']},
            {'area': 'Block-C JRHA', 'name': 'Hasmukh', 'pay_code': '77', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Hasmukh Bhai', 'Hasmukh']},
            {'area': 'Block-C JRHA', 'name': 'Suresh', 'pay_code': '454', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'shailesh.vaghela', 'legacy_names': ['Suresh Bhai', 'Suresh']},
            {'area': 'Block-D JRHA', 'name': 'Urvashi', 'pay_code': '459', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Urvashi Ben Vaghela', 'Urvashi']},
            {'area': 'Block-D JRHA', 'name': 'Hetal', 'pay_code': '458', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Hetal Ben Ashokbhai', 'Hetal']},
            {'area': 'Block-D JRHA', 'name': 'Bhavika', 'pay_code': '457', 'phone': '', 'worker_type': 'general', 'supervisor_username': 'manisha.thapa', 'legacy_names': ['Bhavika Ben Solanki', 'Bhavika']},
        ]
        hostel_synced, hostel_created, hostel_deactivated = self._force_exact_hostel_roster(
            hostel_roster,
            managed_hostel_area_names,
        )
        hostel_deleted, hostel_kept = self._cleanup_unused_inactive_workers(
            sorted({spec['area'] for spec in hostel_roster})
        )
        self.stdout.write(
            '  [OK] Hostel/Common roster synced from final list: '
            f'{hostel_synced} workers, {hostel_created} created, '
            f'{hostel_deactivated} extra deactivated, '
            f'{hostel_deleted} unused removed, '
            f'{hostel_kept} history rows kept inactive'
        )

        # Common Area staffing details
        common_supervisor = User.objects.filter(username='vishwajeet.mishra').first()
        common_shift_map = {
            'Vinayak Solanki': 'night',
            'Anil Thakur': 'day',
            'Suresh Solanki': 'evening',
            'Krunal Parmar': 'day',
            'Yogesh Vaghela': 'day',
            'Ketan Gujjar': 'day',
        }
        for worker_name, shift in common_shift_map.items():
            worker = HKWorker.objects.filter(name=worker_name, area=self.area('Hostel Common Area')).first()
            if worker:
                worker.shift = shift
                worker.supervisor = common_supervisor
                worker.save(update_fields=['shift', 'supervisor'])

        expected_hostel_counts = {
            spec['area']: 0
            for spec in hostel_roster
        }
        for spec in hostel_roster:
            expected_hostel_counts[spec['area']] += 1
        actual_hostel_counts = {
            area_name: HKWorker.objects.filter(area__name=area_name, is_active=True).count()
            for area_name in expected_hostel_counts
        }
        mismatches = [
            f'{area_name}: expected {expected}, active {actual_hostel_counts.get(area_name, 0)}'
            for area_name, expected in sorted(expected_hostel_counts.items())
            if actual_hostel_counts.get(area_name, 0) != expected
        ]
        if mismatches:
            self.stdout.write(
                self.style.WARNING(
                    '  ! Hostel roster count mismatch after sync: ' + '; '.join(mismatches)
                )
            )

        research_roster = [
            {'area': 'Research Park', 'name': 'Mahesh Solanki', 'pay_code': '267', 'phone': '7046959603', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Mahesh Solanki']},
            {'area': 'Research Park', 'name': 'Dhaval S Solanki', 'pay_code': '484', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Dhaval S Solanki']},
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
            {'area': 'Central Arcade', 'name': 'Ramesh Parmar', 'pay_code': '429', 'phone': '', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Ramesh Parmar']},
            {'area': 'Central Arcade', 'name': 'Rudhreshben S Solanki', 'pay_code': '282', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Retuben Solanki', 'Rudhreshben.S. solanki', 'Rudhreshben S Solanki']},
            {'area': 'Central Arcade', 'name': 'Chauhan Nilamben', 'pay_code': '410', 'phone': '7041529877', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Nilam ben chohan', 'Nilamben', 'Nilamben H Chouhan']},
            {'area': 'Sports Complex', 'name': 'Shohil J Vaghela', 'pay_code': '257', 'phone': '', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Sohil Vaghela', 'Shohil Vaghela', 'Shohil.J.vaghela']},
            {'area': 'Sports Complex', 'name': 'Ramesh N Parmar', 'pay_code': '411', 'phone': '', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Ramesh Sports', 'Ramesh.N.parmar']},
            {'area': 'Sports Complex', 'name': 'Jaydeep D Vaghela', 'pay_code': '447', 'phone': '', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Jaydeep Vaghela', 'Jaydeep.D.vaghela']},
            {'area': 'Sports Complex', 'name': 'Rahul J Vaghela', 'pay_code': '337', 'phone': '', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Rahul Vaghela', 'Rahul.J.vgahela', 'Rahul.J.vaghela']},
            {'area': 'Sports Complex', 'name': 'Akshay R Parmar', 'pay_code': '414', 'phone': '', 'worker_type': 'floor', 'shift': 'evening', 'is_reliever': False, 'legacy_names': ['Akshay Parmar', 'Akshay.R.parmar']},
            {'area': 'Sports Complex', 'name': 'Bhavna Ben Chavda', 'pay_code': '218', 'phone': '', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Bhavnaben', 'Bhavna ben chavda']},
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

        director_bungalow_exact_roster = [
            {'area': 'Director Bungalow', 'name': 'Shailesh Ugarabhai Vaghela', 'pay_code': '311', 'phone': '8128880335', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False},
            {'area': 'Director Bungalow', 'name': 'Rakesh Ishvarbhai Parmar', 'pay_code': '305', 'phone': '8238931261', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False},
        ]
        director_synced, director_deactivated = self._enforce_active_roster_by_pay_code(
            director_bungalow_exact_roster,
            'ashok.rathod',
        )
        self.stdout.write(
            '  [OK] Director Bungalow exact roster enforced: '
            f'{director_synced} workers, {director_deactivated} extra active rows deactivated'
        )

        guest_house_exact_roster = [
            {'area': 'Guest House New', 'name': 'Raju Manabhai Makwana', 'pay_code': '263', 'phone': '9601550905', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Hiteshkumar Gafulbhai Vaghela', 'pay_code': '291', 'phone': '9265621047', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Dhaval Kantibhai Jadeja', 'pay_code': '248', 'phone': '9099716206', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Ajay Harshadbhai Purabiya', 'pay_code': '284', 'phone': '9099483423', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Sumit Rameshbhai Solanki', 'pay_code': '451', 'phone': '8866060385', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Shailesh Ishvarbhai Raval', 'pay_code': '306', 'phone': '9157891835', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Sanjay Babubhai Vaghela', 'pay_code': '304', 'phone': '8490012338', 'worker_type': 'washroom', 'shift': 'evening', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Anil Bhupatsinh Thakor', 'pay_code': '269', 'phone': '7359449665', 'worker_type': 'general', 'shift': 'night', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Gautam Parmar', 'pay_code': '403', 'phone': '8511406220', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Pankaj Kantibhai Chamar', 'pay_code': '393', 'phone': '7990281462', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Lalit Babubhai Parmar', 'pay_code': '319', 'phone': '8866011232', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False},
            {'area': 'Guest House New', 'name': 'Vishal Vaghela Karshanbhai', 'pay_code': '320', 'phone': '8154945437', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
        ]
        guest_house_synced, guest_house_deactivated = self._enforce_active_roster_by_pay_code(
            guest_house_exact_roster,
            'ashok.rathod',
        )
        self.stdout.write(
            '  [OK] Guest House New exact roster enforced: '
            f'{guest_house_synced} workers, {guest_house_deactivated} extra active rows deactivated'
        )

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

        deep_cleaning_roster = [
            {'area': 'Deep Cleaning', 'name': 'Vaghela Chirag M', 'pay_code': '303', 'phone': '7698612890', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Vaghela Chirag M']},
            {'area': 'Deep Cleaning', 'name': 'Parmar Vijay Kumar Chhaganbhai', 'pay_code': '329', 'phone': '9824347940', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Parmar Vijay Kumar Chhaganbhai']},
            {'area': 'Deep Cleaning', 'name': 'Sunil R. Vaghela', 'pay_code': '455', 'phone': '9023986019', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Sunil R. Vaghela', 'Sunil R Vaghela']},
            {'area': 'Deep Cleaning', 'name': 'Bhangi Sikandar D.', 'pay_code': '389', 'phone': '9723116238', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Bhangi Sikandar D.', 'Bhangi Sikandar D']},
            {'area': 'Deep Cleaning', 'name': 'Makvana Nikhil Girishbhai', 'pay_code': '364', 'phone': '7572829754', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False, 'legacy_names': ['Makvana Nikhil Girishbhai']},
        ]
        deep_synced, deep_deactivated = self._sync_area_roster(deep_cleaning_roster, 'ganesh.jayesh')
        deep_deleted, deep_kept = self._cleanup_unused_inactive_workers(['Deep Cleaning'])
        self.stdout.write(
            '  [OK] Deep Cleaning roster synced: '
            f'{deep_synced} workers, {deep_deactivated} extra deactivated, '
            f'{deep_deleted} unused removed, {deep_kept} history rows kept inactive'
        )

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

        academic_june_2026_shailesh_roster = [
            {'area': 'Academic Block 10', 'name': 'Padmaben', 'pay_code': '347', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 10', 'name': 'Devendra', 'pay_code': '437', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 10', 'name': 'Jitendra', 'pay_code': '377', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 11', 'name': 'Sangitaben', 'pay_code': '412', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 11', 'name': 'Sunil', 'pay_code': '348', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 11', 'name': 'Hitendra', 'pay_code': '448', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'New AB U-Shape', 'name': 'Hitesh', 'pay_code': '434', 'worker_type': 'general', 'shift': 'day', 'is_reliever': False},
        ]
        academic_june_2026_kaushik_roster = [
            {'area': 'Academic Block 12', 'name': 'Mahesh', 'pay_code': '402', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 12', 'name': 'Akshay', 'pay_code': '308', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 12', 'name': 'Kailashben', 'pay_code': '102', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Ajay', 'pay_code': '93', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Gautam', 'pay_code': '333', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Jignesh', 'pay_code': '363', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Kunal', 'pay_code': '390', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Chandrika', 'pay_code': '346', 'worker_type': 'washroom', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Bharat', 'pay_code': '362', 'worker_type': 'room', 'shift': 'day', 'is_reliever': False},
            {'area': 'Academic Block 13', 'name': 'Parth', 'pay_code': '384', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'New Academic Common Area', 'name': 'Hitesh', 'pay_code': '434', 'worker_type': 'floor', 'shift': 'day', 'is_reliever': False},
            {'area': 'New Academic Reliever', 'name': 'Niruben', 'pay_code': '111', 'worker_type': 'reliever', 'shift': 'day', 'is_reliever': True},
            {'area': 'New Academic Reliever', 'name': 'Ilesh', 'pay_code': '361', 'worker_type': 'reliever', 'shift': 'day', 'is_reliever': True},
        ]
        shailesh_synced, shailesh_deactivated = self._enforce_active_roster_by_pay_code(
            academic_june_2026_shailesh_roster,
            'shailesh.prajapati',
        )
        kaushik_synced, kaushik_deactivated = self._enforce_active_roster_by_pay_code(
            academic_june_2026_kaushik_roster,
            'kaushik.parmar',
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'June 2026 New Academic roster enforced: '
                f'{shailesh_synced + kaushik_synced} active, '
                f'{shailesh_deactivated + kaushik_deactivated} deactivated'
            )
        )

        jeet_supervisor_by_area = {
            'Block-A JRHA': 'shailesh.vaghela',
            'Block-B JRHA': 'manisha.thapa',
            'Block-C JRHA': 'shailesh.vaghela',
            'Block-D JRHA': 'manisha.thapa',
        }
        for area_name, supervisor_username in jeet_supervisor_by_area.items():
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
        - Same compact 12-task daily schedule for all caretaker hostels.
        - Dedicated daily Hostel Common Area schedule for Vishwajeet and team.
        Three parallel staff groups: room/common, floor, washroom.
        """
        # Wipe old hostel templates and recreate fresh
        hostel_names = [
            'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet',
            'Firpeal', 'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia',
            'Kyzeel', 'Lekhaag',
        ]

        hostel_areas = [self.area(n) for n in hostel_names if self.area(n)]

        # Delete existing templates for these areas
        HKScheduleTemplate.objects.filter(area__in=hostel_areas).delete()

        # ─── ROOM STAFF SCHEDULE ─────────────────────────────────────────
        room_tasks = [
            # (order, start, end, task_name, requires_photo, description)
            (1, '08:10', '09:30', 'Rooms and Pantry Cleaning', True, 'Assigned rooms, pantry, room-side dustbins and visible dusting'),
            (2, '09:30', '10:45', 'Common Room and Room-Side Dusting', True, 'Common room, doors, windows, ledges and room-side common points'),
            (3, '13:45', '15:00', 'Afternoon Room Touch Up', True, 'Pending rooms, pantry touch up and complaint points'),
            (4, '15:00', '16:50', 'Room Area Final Round', True, 'Final room-side check, dustbins and caretaker-assigned work'),
        ]

        # ─── FLOOR STAFF SCHEDULE ────────────────────────────────────────
        floor_tasks = [
            (1, '08:10', '09:30', 'Floor Sweeping and Mopping', True, 'Assigned floor passages, lobby and ground-floor route'),
            (2, '09:30', '10:45', 'Staircase and Railing Cleaning', True, 'Staircase, railing, landing and balcony/common corridor dusting'),
            (3, '13:45', '15:00', 'Common Area and Dustbin Round', True, 'Common area cleaning, dustbin collection and replacement'),
            (4, '15:00', '16:50', 'Floor Final Round', True, 'Final mopping, dusting and pending floor work'),
        ]

        # ─── WASHROOM STAFF SCHEDULE ─────────────────────────────────────
        washroom_tasks = [
            (1, '08:10', '09:30', 'Washroom Cleaning - Morning Round', True, 'Assigned washrooms, basins, mirrors, fittings and floors'),
            (2, '09:30', '10:45', 'Washroom Deep Cleaning and Dusting', True, 'Commode, urinal, partitions, tiles, exhaust and dry dusting'),
            (3, '13:45', '15:00', 'Afternoon Washroom Touch Up', True, 'Second washroom round, odour check and refill check'),
            (4, '15:00', '16:50', 'Washroom Final Round', True, 'Final touch up, washroom dustbin and dry-floor check'),
        ]

        sunday_tasks = [
            (1, '10:45', '11:45', 'Sunday Weekly Cleaning', True, 'Terrace, balcony, cobweb/web cleaning, garden/basement or other weekly work as assigned'),
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

        jeet_areas = [
            self.area('Block-A JRHA'),
            self.area('Block-B JRHA'),
            self.area('Block-C JRHA'),
            self.area('Block-D JRHA'),
        ]
        jeet_areas = [area for area in jeet_areas if area]
        if jeet_areas:
            HKScheduleTemplate.objects.filter(area__in=jeet_areas).delete()

            jrha_daily_tasks = [
                (1, '08:00', '08:45', 'Office Cleaning', True, 'Days: daily | Office dusting, sweeping, mopping and touch points.'),
                (2, '08:45', '09:30', 'Lounge Cleaning', True, 'Days: daily | Lounge sweeping, mopping, dusting and seating area cleaning.'),
                (3, '09:30', '10:15', 'Staircase Cleaning', True, 'Days: daily | Staircase, railing and landing cleaning.'),
                (4, '10:15', '11:00', 'Common Area Cleaning', True, 'Days: daily | Common passages, common points and visible waste collection.'),
            ]
            jrha_low_floor_tasks = [
                (11, '11:00', '12:00', 'Floor 1 Cleaning', True, 'Days: monday, wednesday, friday | Block floors 1-3 rotation.'),
                (12, '12:00', '13:00', 'Floor 2 Cleaning', True, 'Days: monday, wednesday, friday | Block floors 1-3 rotation.'),
                (13, '14:00', '15:00', 'Floor 3 Cleaning', True, 'Days: monday, wednesday, friday | Block floors 1-3 rotation.'),
            ]
            jrha_high_floor_tasks = [
                (21, '11:00', '12:00', 'Floor 4 Cleaning', True, 'Days: tuesday, thursday, saturday | Block floors 4-7 rotation.'),
                (22, '12:00', '13:00', 'Floor 5 Cleaning', True, 'Days: tuesday, thursday, saturday | Block floors 4-7 rotation.'),
                (23, '14:00', '15:00', 'Floor 6 Cleaning', True, 'Days: tuesday, thursday, saturday | Block floors 4-7 rotation.'),
                (24, '15:00', '16:00', 'Floor 7 Cleaning', True, 'Days: tuesday, thursday, saturday | Block floors 4-7 rotation.'),
            ]
            jrha_sunday_weekly_tasks = [
                (31, '08:00', '09:00', 'Web Cleaning', True, 'Weekly Sunday web/cobweb cleaning.'),
                (32, '09:00', '10:00', 'Dustbin Cleaning', True, 'Weekly Sunday dustbin washing and sanitizing.'),
                (33, '10:00', '11:00', 'Garden Cleaning', True, 'Weekly Sunday garden and outside patch cleaning.'),
                (34, '11:00', '12:00', 'Deep Cleaning - Ground Floor', True, 'Sunday ground floor deep cleaning.'),
            ]
            jrha_sunday_monthly_tasks = [
                (41, '14:00', '15:00', 'Basement Cleaning', True, 'Sundays: first | Monthly basement cleaning.'),
                (42, '15:00', '16:00', 'Terrace Cleaning', True, 'Sundays: first | Monthly terrace cleaning.'),
                (43, '16:00', '17:00', 'Fridge Cleaning', True, 'Sundays: first, third | Fridge cleaning on 1st and 3rd Sunday of every month.'),
            ]

            for area in jeet_areas:
                is_block_b = area.name == 'Block-B JRHA'
                structure_note = (
                    'Block B: 3 flats per floor.'
                    if is_block_b
                    else 'Blocks A/C/D: 4 flats per floor; each flat has 3 rooms, 3 washrooms and 1 pantry.'
                )

                for order, start, end, name, req_photo, desc in jrha_daily_tasks:
                    HKScheduleTemplate.objects.create(
                        area=area, order=order, start_time=t(start), end_time=t(end),
                        task_name=name, task_description=f'{desc} {structure_note}', worker_tag='general',
                        requires_photo=req_photo, frequency='daily', is_active=True,
                    )
                    total += 1
                for order, start, end, name, req_photo, desc in jrha_low_floor_tasks:
                    HKScheduleTemplate.objects.create(
                        area=area, order=order, start_time=t(start), end_time=t(end),
                        task_name=name, task_description=f'{desc} {structure_note}', worker_tag='floor',
                        requires_photo=req_photo, frequency='daily', is_active=True,
                    )
                    total += 1
                for order, start, end, name, req_photo, desc in jrha_high_floor_tasks:
                    HKScheduleTemplate.objects.create(
                        area=area, order=order, start_time=t(start), end_time=t(end),
                        task_name=name, task_description=f'{desc} {structure_note}', worker_tag='floor',
                        requires_photo=req_photo, frequency='daily', is_active=True,
                    )
                    total += 1
                for order, start, end, name, req_photo, desc in jrha_sunday_weekly_tasks:
                    HKScheduleTemplate.objects.create(
                        area=area, order=order, start_time=t(start), end_time=t(end),
                        task_name=name, task_description=desc, worker_tag='all',
                        requires_photo=req_photo, frequency='sunday_extra', is_active=True,
                    )
                    total += 1
                for order, start, end, name, req_photo, desc in jrha_sunday_monthly_tasks:
                    HKScheduleTemplate.objects.create(
                        area=area, order=order, start_time=t(start), end_time=t(end),
                        task_name=name, task_description=desc, worker_tag='all',
                        requires_photo=req_photo, frequency='sunday_extra', is_active=True,
                    )
                    total += 1

            old_jrha_template_count = HKScheduleTemplate.objects.filter(area__in=jeet_areas).count()
            HKScheduleTemplate.objects.filter(area__in=jeet_areas).delete()
            total = max(0, total - old_jrha_template_count)

            jrha_common_daily_tasks = [
                ('Office Cleaning', 'Days: daily | Jeet Hostel office dusting, sweeping, mopping and touch points.'),
                ('Lounge Cleaning', 'Days: daily | Jeet Hostel lounge seating, table, floor and visible dusting.'),
                ('Stairs Cleaning', 'Days: daily | Block staircase, railing and landing cleaning.'),
            ]
            jrha_floor_rotation_tasks = [
                (
                    'Floors 1, 2, 3 Cleaning',
                    'Days: monday, wednesday, friday | Floor rotation for floors 1, 2 and 3.',
                ),
                (
                    'Floors 4, 5, 6, 7 Cleaning',
                    'Days: tuesday, thursday, saturday | Floor rotation for floors 4, 5, 6 and 7.',
                ),
            ]
            jrha_exact_sunday_tasks = [
                ('Web Cleaning', 'Weekly Sunday web/cobweb cleaning.'),
                ('Dustbin Cleaning', 'Weekly Sunday dustbin washing and sanitizing.'),
                ('Garden Cleaning', 'Weekly Sunday garden cleaning.'),
                ('Basement Cleaning', 'Weekly Sunday basement cleaning.'),
                ('Terrace Cleaning', 'Weekly Sunday terrace cleaning.'),
                ('Deep Cleaning - Ground Floor', 'Sunday ground floor deep cleaning.'),
                ('Fridge Cleaning - All JRHA Blocks', 'Sundays: first, third | Fridge cleaning 2 times in month for all Jeet/JRHA blocks.'),
            ]

            def jrha_task_window(order, start_hour=8, minutes=30):
                start_dt = datetime.datetime.combine(datetime.date.today(), t(f'{start_hour:02d}:00')) + datetime.timedelta(minutes=(order - 1) * minutes)
                end_dt = start_dt + datetime.timedelta(minutes=minutes)
                return start_dt.time(), end_dt.time()

            for area in jeet_areas:
                is_block_b = area.name == 'Block-B JRHA'
                structure_note = (
                    'Building: 7 floors, 3 flats per floor.'
                    if is_block_b
                    else 'Building: 7 floors, 4 flats per floor, 3 BHK flats with 3 rooms, 3 washrooms and 1 pantry per flat.'
                )
                for order, (name, desc) in enumerate(jrha_common_daily_tasks, start=1):
                    start_time, end_time = jrha_task_window(order, start_hour=8, minutes=45)
                    HKScheduleTemplate.objects.create(
                        area=area, order=order,
                        start_time=start_time, end_time=end_time,
                        task_name=name,
                        task_description=f'{desc} {structure_note}',
                        worker_tag='all', requires_photo=True,
                        frequency='daily', is_active=True,
                    )
                    total += 1
                for order, (name, desc) in enumerate(jrha_floor_rotation_tasks, start=11):
                    start_time, end_time = jrha_task_window(order - 10, start_hour=11, minutes=75)
                    HKScheduleTemplate.objects.create(
                        area=area, order=order,
                        start_time=start_time, end_time=end_time,
                        task_name=name,
                        task_description=f'{desc} {structure_note}',
                        worker_tag='all', requires_photo=True,
                        frequency='daily', is_active=True,
                    )
                    total += 1
                for order, (name, desc) in enumerate(jrha_exact_sunday_tasks, start=1):
                    start_time, end_time = jrha_task_window(order, start_hour=9, minutes=45)
                    HKScheduleTemplate.objects.create(
                        area=area, order=order,
                        start_time=start_time, end_time=end_time,
                        task_name=name,
                        task_description=desc,
                        worker_tag='all', requires_photo=True,
                        frequency='sunday_extra', is_active=True,
                    )
                    total += 1

        # Hostel Common Area: same schedule for all 7 days (no separate Sunday-only plan)
        common_area = self.area('Hostel Common Area')
        if common_area:
            HKScheduleTemplate.objects.filter(area=common_area).delete()

            common_floor_tasks = [
                (1, '08:00', '09:30', 'New Mess and Old Mess Common Route', True, 'New/old mess common area, corridor and front/back route cleaning'),
                (2, '09:30', '10:45', 'Hostel Backside and Frontside Route', True, 'Aibaan, Beauki, Chimair, Duven, Kyzeel, Jurqia, Lekhaag and Ijokha common route'),
                (3, '13:45', '15:00', 'Common Area Dustbin and Tool Round', True, 'Dustbins, tool refill, waste transfer and route touch up'),
                (4, '15:00', '16:50', 'Common Area Final Round', True, 'Final sweep, spot cleaning and pending common route work'),
            ]

            common_room_tasks = [
                (1, '08:00', '09:30', 'Hostel Office and Lounge Cleaning', True, 'Hostel office, student lounge, mini library and common room cleaning'),
                (2, '09:30', '10:45', 'Common Passage Dusting', True, 'Benches, railing, corners, passage dusting and dry mop'),
                (3, '13:45', '15:00', 'Conference and Hall Cleaning', True, 'New PC student conference hall, second floor hall or assigned room area'),
                (4, '15:00', '16:50', 'Common Room Final Round', True, 'Final common room touch up and issue reporting'),
            ]

            common_washroom_tasks = [
                (1, '18:00', '19:00', 'Boys Hostel Washroom Touch Up', True, 'Evening touch up round for boys hostel washrooms'),
                (2, '19:00', '20:00', 'Common Washroom Cleaning', True, 'Hostel office/common washrooms, old mess and new mess washrooms'),
                (3, '20:00', '21:00', 'Bridge and Second Floor Touch Up', True, 'Mess-to-hostel bridge, new mess second floor and assigned washroom points'),
                (4, '21:00', '22:00', 'Terrace and Night Final Round', True, 'New/old mess terrace weekly work and final night round'),
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

        exact_hostel_schedules = {
            'Aibaan': {
                'daily': ['4 Floor Cleaning', 'Common Room Cleaning', '1 Staircase Cleaning', 'Dusting', '8 Washroom Cleaning', '8 Washroom Dusting', '30 Room Cleaning', 'Common Dusting', 'Pantry Small Dustbin Regular Cleaning', 'Staircase Cleaning'],
                'sunday': [],
            },
            'Beauki': {
                'daily': ['18 Room Cleaning', 'Staircase Cleaning', 'Common Room Cleaning', 'Common Area Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting', 'Pantry Cleaning', '4 Floor Cleaning', 'Dusting'],
                'sunday': [],
            },
            'Chimair': {
                'daily': ['18 Room Cleaning', 'Staircase Cleaning', 'Common Room Cleaning', 'Common Area Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting', 'Pantry Cleaning', '4 Floor Cleaning', 'Dusting'],
                'sunday': [],
            },
            'Ijokha': {
                'daily': ['18 Room Cleaning', 'Staircase Cleaning', 'Common Room Cleaning', 'Common Area Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting', 'Pantry Cleaning', '4 Floor Cleaning', 'Dusting', 'Balcony Cleaning'],
                'sunday': ['Common Terrace Cleaning'],
            },
            'Duven': {
                'daily': ['12 Washroom Cleaning', '12 Washroom Dusting', '1 Staircase Cleaning', 'Common Cleaning', '4 Pantry Cleaning', '30 Room Cleaning', 'Dustbin Cleaning', '4 Floor Cleaning', 'Common Room Cleaning', 'Dusting'],
                'sunday': ['Terrace Cleaning'],
            },
            'Emiet': {
                'daily': ['4 Pantry Cleaning', '30 Room Cleaning', '1 Staircase Cleaning', 'Dustbin Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting', 'Common Cleaning', '4 Floor Cleaning', 'Common Room Cleaning', 'Dusting'],
                'sunday': ['Terrace Cleaning'],
            },
            'Firpeal': {
                'daily': ['4 Floor Cleaning', '1 Staircase Cleaning', 'Dusting', 'Common Cleaning', '4 Pantry Cleaning', '30 Room Cleaning', 'Dustbin Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting'],
                'sunday': ['Terrace Cleaning'],
            },
            'Griwiksh': {
                'daily': ['4 Floor Cleaning', '1 Staircase Cleaning', 'Dusting', 'Bridge Cleaning', '12 Washroom Cleaning', '12 Washroom Dusting', '4 Pantry Cleaning', 'Room Cleaning', 'Dustbin Cleaning', 'Common Cleaning'],
                'sunday': ['Terrace Cleaning'],
            },
            'Hiqom': {
                'daily': ['2 Floor Cleaning', '8 Balcony Cleaning', 'All Dusting', '1 Staircase Cleaning', 'Hostel Common Area Room Cleaning', '8 Washroom Cleaning', '8 Washroom Dusting', '4 Pantry Cleaning', '24 Room Cleaning', 'Dustbin Cleaning'],
                'sunday': ['Terrace Cleaning'],
            },
            'Jurqia': {
                'daily': ['4 Floor Cleaning', 'Common Room Cleaning', 'Common Terrace Cleaning', 'Common Area Cleaning', 'Dusting', '8 Washroom Cleaning', '8 Washroom Dusting', '1 Staircase Cleaning', '4 Balcony Cleaning', '18 Room Cleaning', '4 Pantry Cleaning', 'All Dustbin Cleaning'],
                'sunday': ['Terrace Cleaning'],
            },
            'Kyzeel': {
                'daily': ['10 Washroom Cleaning', '10 Washroom Dusting', '2 Floor Cleaning', '8 Balcony Cleaning', '3 Staircase Cleaning', 'Hostel Common Area Room Cleaning', 'Common Room Cleaning', '30 Room Cleaning', '4 Pantry Cleaning', 'All Dustbin Cleaning'],
                'sunday': ['Terrace Cleaning'],
            },
            'Lekhaag': {
                'daily': ['4 Floor Cleaning', 'Common Room Cleaning', 'Common Terrace Cleaning', 'Common Area Cleaning', 'Dusting', '6 Washroom Cleaning', '6 Washroom Dusting', '1 Staircase Cleaning', '4 Balcony Cleaning', '16 Room Cleaning', '4 Pantry Cleaning'],
                'sunday': ['All Dustbin Cleaning', 'Terrace Cleaning'],
            },
            'Hostel Common Area': {
                'daily': ['Hostel Office', 'All Common Washroom', 'Mini Library', 'Student Lounge', 'Old Mess Second Floor Area', 'Washroom', 'New Mess Common Area Front and Back Cleaning', 'Hiqom Front and Back Cleaning', 'New PC Perimeter', 'Ijokha Backside Route Cleaning', 'Lekhaag Backside Route Cleaning', 'Firpeal Backside Route Cleaning', 'Emiet Backside Route Cleaning', 'Aibaan Back Side Cleaning', 'Beauki Back Side Cleaning', 'Chimair Back Side Cleaning', 'Old Mess Back Side Cleaning', 'Duven Back Side Cleaning', 'Kyzeel Back Side Cleaning', 'Jurqia Back Side Cleaning', 'Lekhaag Common Front Side Cleaning', 'Kyzeel Common Front Side Cleaning', 'Jurqia Common Front Side Cleaning', 'Ijokha Common Front Side Cleaning', 'New Mess Second Floor Hall', 'Mess to Hostel Connecting Bridge', 'New PC Student Conference Hall', 'All Boys Hostel Washroom Touch Up', 'New Mess to Old Mess Corridor Cleaning', 'All Old Hostel Common Area Cleaning', 'Other Work'],
                'sunday': ['New Mess Terrace', 'Old Mess Terrace'],
            },
        }

        high_capacity_hostels = {'Hiqom', 'Jurqia'}
        for hostel_name in hostel_names:
            daily_tasks = exact_hostel_schedules[hostel_name]['daily']
            staircase_task = (
                '5 Staircase Cleaning'
                if hostel_name in high_capacity_hostels
                else '3 Staircase Cleaning'
            )
            balcony_task = (
                '8 Balcony Cleaning'
                if hostel_name in high_capacity_hostels
                else '4 Balcony Cleaning'
            )
            staircase_indexes = [
                index for index, task_name in enumerate(daily_tasks)
                if task_name.endswith('Staircase Cleaning')
            ]
            if staircase_indexes:
                staircase_index = staircase_indexes[0]
                daily_tasks[staircase_index] = staircase_task
                for index in reversed(staircase_indexes[1:]):
                    daily_tasks.pop(index)
            else:
                staircase_index = len(daily_tasks)
                daily_tasks.append(staircase_task)
            balcony_indexes = [
                index for index, task_name in enumerate(daily_tasks)
                if task_name.endswith('Balcony Cleaning')
            ]
            if balcony_indexes:
                daily_tasks[balcony_indexes[0]] = balcony_task
                for index in reversed(balcony_indexes[1:]):
                    daily_tasks.pop(index)
            else:
                daily_tasks.insert(staircase_index + 1, balcony_task)

        exact_hostel_areas = [area for area in [*hostel_areas, common_area] if area]
        old_hostel_template_count = HKScheduleTemplate.objects.filter(area__in=exact_hostel_areas).count()
        HKScheduleTemplate.objects.filter(area__in=exact_hostel_areas).delete()
        total = max(0, total - old_hostel_template_count)

        def exact_task_window(order, start_hour=8, minutes=15):
            start_dt = datetime.datetime.combine(datetime.date.today(), t(f'{start_hour:02d}:00')) + datetime.timedelta(minutes=(order - 1) * minutes)
            end_dt = start_dt + datetime.timedelta(minutes=minutes)
            return start_dt.time(), end_dt.time()

        for area in exact_hostel_areas:
            schedule = exact_hostel_schedules.get(area.name)
            if not schedule:
                continue
            for order, name in enumerate(schedule['daily'], start=1):
                start_time, end_time = exact_task_window(order)
                HKScheduleTemplate.objects.create(
                    area=area, order=order, start_time=start_time, end_time=end_time,
                    task_name=name, task_description='Days: Daily',
                    worker_tag='all', requires_photo=True, frequency='daily', is_active=True,
                )
                total += 1
            for order, name in enumerate(schedule['sunday'], start=1):
                start_time, end_time = exact_task_window(order, start_hour=9, minutes=30)
                HKScheduleTemplate.objects.create(
                    area=area, order=order, start_time=start_time, end_time=end_time,
                    task_name=name, task_description='Sunday / Weekly',
                    worker_tag='all', requires_photo=True, frequency='sunday_extra', is_active=True,
                )
                total += 1

        # Research Park: worker-wise schedule (Mon-Sat) + Sunday deep cleaning
        research_park = self.area('Research Park')
        if research_park:
            HKScheduleTemplate.objects.filter(area=research_park).delete()

            rp_floor_tasks = [
                (1, '08:00', '08:30', 'Dhaval: GF + 3F Gents and Handicap Washroom Touch Up', True, ''),
                (2, '08:30', '09:00', 'Dhaval: Admin Office Cleaning', True, ''),
                (3, '09:00', '09:20', 'Dhaval: Board Room Cleaning', True, ''),
                (4, '09:20', '10:00', 'Dhaval: Fountain Common Area Cleaning', True, ''),
                (5, '10:00', '10:15', 'Dhaval: Tea Break', False, ''),
                (6, '10:15', '11:00', 'Dhaval: Classroom Cleaning', True, ''),
                (7, '11:00', '12:15', 'Dhaval: GF + 3F Gents and Handicap Washroom Cleaning', True, ''),
                (8, '12:15', '13:00', 'Dhaval: Conference Room Cleaning', True, ''),
                (9, '13:00', '14:00', 'Dhaval: Lunch Break', False, ''),
                (10, '14:00', '14:30', 'Dhaval: GF + 3F Washroom Touch Up', True, ''),
                (11, '14:30', '16:30', 'Dhaval: Building Inside 2 Staircase + Railing Dusting', True, ''),
                (12, '16:30', '17:00', 'Dhaval: GF + 3F Washroom Touch Up', True, ''),

                (13, '09:00', '09:45', 'Mahesh: 2 Office Cleaning', True, 'Senior shift 9:00 AM to 6:00 PM'),
                (14, '09:45', '11:15', 'Mahesh: Ground Floor Cleaning', True, ''),
                (15, '11:15', '11:30', 'Mahesh: Tea Break', False, ''),
                (16, '11:30', '12:00', 'Mahesh: 1 Office Cleaning', True, ''),
                (17, '12:00', '12:30', 'Mahesh: Ground Floor All Dusting', True, ''),
                (18, '12:30', '13:00', 'Mahesh: Lift and CCTV Room Cleaning', True, ''),
                (19, '13:00', '14:00', 'Mahesh: Lunch Break', False, ''),
                (20, '14:00', '14:30', 'Mahesh: Ground Floor Touch Up', True, ''),
                (21, '14:30', '15:15', 'Mahesh: 2 Office Cleaning', True, ''),
                (22, '15:15', '16:00', 'Mahesh: Building Inside Staircase + Railing Dusting', True, ''),
                (23, '16:00', '17:30', 'Mahesh: Building Outside 2 Staircase + Railing Dusting', True, ''),
                (24, '17:30', '18:00', 'Mahesh: All Floor Gents Washroom Touch Up', True, ''),
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
                (9, '14:45', '15:45', 'Dharmishtaben: Room 405 and 406 Cleaning', True, 'Days: Tuesday, Friday | Tue/Fri: Room 405 and 406'),
                (10, '14:45', '15:45', 'Dharmishtaben: Room 407 and 408 Cleaning', True, 'Days: Wednesday, Saturday | Wed/Sat: Room 407 and 408'),
                (11, '14:45', '15:45', 'Dharmishtaben: Room 401 Cleaning', True, 'Days: Monday, Thursday | Mon/Thu: Room 401'),
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
                (1, '11:00', '13:00', 'Vijay: Ground Floor Washroom Round Cleaning', True, ''),
                (2, '13:00', '14:00', 'Vijay: Lunch Break', False, ''),
                (3, '14:00', '15:00', 'Vijay: Staircase Cleaning', True, ''),
                (4, '15:00', '16:00', 'Vijay: Basement/Equipment Area Cleaning', True, ''),
                (5, '16:00', '17:00', 'Vijay: Extra Work and Pending Points', True, ''),
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
                (1, '07:00', '13:00', 'Pankaj: Ground Floor Complete Cleaning', True, 'Office, reception, front corridor, parking, ladies/gents/handicapped washrooms, room-side lobby, dining hall, corridor, front glass, lift, washroom touch up, dusting, sweeping and mopping'),
                (2, '13:00', '14:00', 'Pankaj: Lunch Break', False, ''),
                (3, '14:00', '14:15', 'Pankaj: Washroom Touch Up', True, ''),
                (4, '14:15', '14:45', 'Pankaj: Rooms Back Side Area Sweeping', True, ''),
                (5, '14:45', '15:30', 'Pankaj: Gym Area Cleaning', True, 'Equipment dusting, dusting, sweeping and mopping'),
                (6, '15:30', '16:00', 'Pankaj: All Floor Cooler and Washroom Cleaning', True, ''),
            ]

            gh_washroom_tasks = [
                (1, '08:00', '09:00', 'Hitesh: 1st to 4th Floor Common Washroom Cleaning', True, 'Ladies, gents and handicapped common washrooms'),
                (2, '09:00', '13:00', 'Hitesh: 1st to 4th Floor Lobby, Corridor and Railing', True, 'Lobby cleaning, corridor cleaning, railing dusting, dusting and sweeping'),
                (3, '13:00', '14:00', 'Hitesh: Lunch Break', False, ''),
                (4, '14:00', '16:00', 'Hitesh: 1st to 4th Floor Lobby and Corridor Sweeping', True, ''),
                (5, '16:00', '17:00', 'Hitesh: Extra Work (Railing, Louver, Fountain Area)', True, ''),
                (6, '13:00', '17:00', 'Shailesh + Sanjay: Staircase, Common Washroom, Dining and Open Hall', True, '6 staircase cleaning, 1st to 4th floor ladies/gents/handicapped washrooms, dining hall and open hall'),
            ]

            gh_room_tasks = [
                (1, '08:00', '17:00', 'Dhaval + Ajay + Sumit: Checkout/Occupied/Vacant Rooms', True, 'Check-out room cleaning, occupied room cleaning, vacant room cleaning, dusting, sweeping, mopping and bed making'),
            ]

            gh_previous_day_tasks = [
                (1, '17:00', '22:00', 'Shailesh + Sanjay: Evening Room Operations', True, 'Previous day task | Check-out room cleaning, occupied room cleaning, vacant room cleaning, dusting, sweeping, mopping and bed making'),
                (2, '22:00', '07:00', 'Anil: Night Shift All Work Coverage', True, 'Previous day task | Dining hall, fourth floor common hall, meeting hall, conference hall, 1st to 4th floor ladies/gents/handicapped washrooms, check-out/occupied/vacant room cleaning, dusting, sweeping, mopping and bed making'),
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

            for order, start, end, name, req_photo, desc in gh_previous_day_tasks:
                HKScheduleTemplate.objects.create(
                    area=guest_house, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='previous_day', requires_photo=req_photo,
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

        # Deep Cleaning: Ganesh Jayesh team, all tasks support multi-worker assignment.
        deep_cleaning = self.area('Deep Cleaning')
        if deep_cleaning:
            HKScheduleTemplate.objects.filter(area=deep_cleaning).delete()

            deep_daily_tasks = [
                (1, '08:00', '09:30', 'Solar Panel Cleaning', True, 'Days: Monday to Friday | Daily solar panel cleaning with assigned team'),
                (2, '09:30', '11:00', 'Fire Area Deep Cleaning', True, 'Days: Monday to Friday | Fire area deep cleaning route'),
                (3, '11:00', '12:30', 'G1 and G2 Deep Cleaning', True, 'Days: Monday to Friday | G1 and G2 deep cleaning work only'),
                (4, '14:00', '15:30', 'G3 Deep Cleaning and Permanent Work', True, 'Days: Monday to Friday | G3 deep cleaning plus all permanent work'),
                (5, '15:30', '16:50', 'Housing Demand Cleaning Work', True, 'Days: Monday to Friday | Room cleaning and related work as requested'),
            ]
            deep_saturday_tasks = [
                (1, '08:00', '10:00', 'U Shape Weekly Deep Cleaning', True, 'Weekly U Shape deep cleaning'),
                (2, '10:00', '12:00', 'Rang Manch Weekly Deep Cleaning', True, 'Weekly Rang Manch deep cleaning'),
            ]
            deep_fortnightly_tasks = [
                (1, '14:00', '16:00', 'Greenhouse Cleaning - 15 Day Cycle', True, 'Days: Monday | Cycle: Fortnightly | Once every 15 days'),
            ]

            for order, start, end, name, req_photo, desc in deep_daily_tasks:
                HKScheduleTemplate.objects.create(
                    area=deep_cleaning, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in deep_saturday_tasks:
                HKScheduleTemplate.objects.create(
                    area=deep_cleaning, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='saturday_special', is_active=True,
                )
                total += 1

            for order, start, end, name, req_photo, desc in deep_fortnightly_tasks:
                HKScheduleTemplate.objects.create(
                    area=deep_cleaning, order=order,
                    start_time=t(start), end_time=t(end),
                    task_name=name, task_description=desc,
                    worker_tag='all', requires_photo=req_photo,
                    frequency='daily', is_active=True,
                )
                total += 1

        # Solid Waste Management (SWM): collection, CNG, segregation and Bio-Gas routes.
        swm_area = self.area('Solid Waste Management')
        if swm_area:
            HKScheduleTemplate.objects.filter(area=swm_area).delete()

            swm_team_tasks = {
                't1': [
                    (1, '08:00', '08:45', 'HB Collection', True, 'Days: Daily | Team 1 - HB + AB Team'),
                    (2, '08:45', '09:30', 'Old AB Collection', True, 'Days: Daily | Team 1 - HB + AB Team'),
                    (3, '09:30', '10:15', 'New AB Collection', True, 'Days: Daily | Team 1 - HB + AB Team'),
                    (4, '10:15', '11:00', 'AB Shops Collection', True, 'Days: Daily | Team 1 - HB + AB Team'),
                    (5, '16:00', '16:30', 'Cart Parking & Bins Setup for Next Day', True, 'Days: Daily | Team 1 - HB + AB Team'),
                ],
                't2': [
                    (1, '08:00', '08:45', 'All Mess Dinner + Breakfast Waste Collection', True, 'Days: Daily | Team 2 - CNG Vehicle Team'),
                    (2, '08:45', '09:45', 'Campus Inside Route Waste Collection', True, 'Days: Daily | CA Shops, G11 Canteen, HB-1, WCP-17'),
                    (3, '09:45', '10:30', 'Dry Waste Shifting to Scrapyard', True, 'Days: Daily | Team 2 - CNG Vehicle Team'),
                    (4, '10:30', '11:15', 'Research Park Waste Collection', True, 'Days: Tuesday, Thursday, Saturday | Team 2 - CNG Vehicle Team'),
                    (5, '11:15', '12:00', 'G5 Palaj Hotel Waste Collection', True, 'Days: Monday, Wednesday, Friday, Sunday | Team 2 - CNG Vehicle Team'),
                    (6, '12:00', '13:00', 'All Mess Lunch Waste Collection', True, 'Days: Daily | Team 2 - CNG Vehicle Team'),
                    (7, '16:00', '16:30', 'CNG Vehicle Parking & Key Handover', True, 'Days: Daily | Team 2 - CNG Vehicle Team'),
                ],
                't3': [
                    (1, '08:00', '08:45', 'Old Hotel Waste Collection', True, 'Days: Daily | Team 3 - Hotel Team'),
                    (2, '08:45', '09:30', 'Old Hotel Shops Waste Collection', True, 'Days: Daily | Team 3 - Hotel Team'),
                    (3, '09:30', '10:15', 'Hotel Shops Waste Collection', True, 'Days: Daily | Team 3 - Hotel Team'),
                    (4, '10:15', '11:00', 'Dry Waste Shifting to Scrapyard', True, 'Days: Daily | Team 3 - Hotel Team'),
                    (5, '16:00', '16:30', 'Cart Parking & Bins Setup for Next Day', True, 'Days: Daily | Team 3 - Hotel Team'),
                ],
                't4': [
                    (1, '08:00', '08:45', 'GCS Waste Collection', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                    (2, '08:45', '09:30', 'New Hotel Waste Collection', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                    (3, '09:30', '10:15', 'New Hotel Shops Waste Collection', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                    (4, '10:15', '12:00', 'Scrapyard Sorting / Segregation Work', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                    (5, '15:00', '16:00', 'Scrapyard Outside Area Cleaning', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                    (6, '16:00', '16:30', 'Cart Parking & Bins Setup for Next Day', True, 'Days: Daily | Team 4 - Hotel + GCS Team'),
                ],
                't5': [
                    (1, '08:00', '08:45', 'All Rooms & Common Area Cleaning', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                    (2, '08:45', '09:30', 'Watering Plants', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                    (3, '09:30', '10:30', 'Feeding Wet Waste to Machine', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                    (4, '10:30', '12:00', 'Other Regular Work', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                    (5, '15:00', '16:00', 'Manure Shifting Work', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                    (6, '16:00', '16:30', 'Lock All Rooms & Gate Closing', True, 'Days: Daily | Team 5 - Bio-Gas Team'),
                ],
            }

            for tag, tasks in swm_team_tasks.items():
                for order, start, end, name, req_photo, desc in tasks:
                    HKScheduleTemplate.objects.create(
                        area=swm_area, order=order,
                        start_time=t(start), end_time=t(end),
                        task_name=name, task_description=desc,
                        worker_tag=tag, requires_photo=req_photo,
                        frequency='daily', is_active=True,
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
                    (1, '08:00', '08:30', 'AB-6: All Floors Washroom Touch Up', 'washroom', True, 'Nishaben + Ashok + Hiten'),
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
                    (1, '08:00', '09:30', 'AB-10: Male and Female Washroom Cleaning', 'washroom', True, 'Padmaben + Devendra + Jitendra'),
                    (2, '09:30', '12:00', 'AB-10: Floor, Classroom and Staircase Cleaning', 'floor', True, ''),
                    (3, '12:00', '13:00', 'AB-10: Lab Area and Lift Cleaning', 'room', True, ''),
                    (4, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (5, '14:00', '15:00', 'AB-10: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '15:00', '16:00', 'AB-10: Floor Touch Up and Extra Work', 'floor', True, ''),
                    (7, '16:00', '17:00', 'AB-10: Washroom, Staircase and Pantry Cleaning', 'washroom', True, ''),
                ],
                'Academic Block 11': [
                    (1, '08:00', '09:30', 'AB-11: First-Third Floor Washroom Cleaning', 'washroom', True, 'Sangitaben + Sunil + Hitendra'),
                    (2, '09:30', '10:30', 'AB-11: Floor Cleaning', 'floor', True, ''),
                    (3, '10:30', '13:00', 'AB-11: Classroom, Labs and Office Cleaning', 'room', True, ''),
                    (4, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (5, '14:00', '15:00', 'AB-11: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '15:00', '16:00', 'AB-11: Second Floor Lab Area', 'room', True, ''),
                    (7, '16:00', '17:00', 'AB-11: Washroom Touch Up, Dustbin, Corridor and Pantry', 'washroom', True, ''),
                ],
                'Academic Block 12': [
                    (1, '08:00', '09:00', 'AB-12: Washroom and Staircase Cleaning', 'washroom', True, 'Mahesh + Akshay + Kailashben'),
                    (2, '09:00', '10:00', 'AB-12: Office Area Cleaning (All Floors)', 'room', True, ''),
                    (3, '10:00', '12:00', 'AB-12: Floor, Pantry and Lift Cleaning', 'floor', True, ''),
                    (4, '12:00', '13:00', 'AB-12: Extra Work', 'floor', True, 'Closed lab and office cleaning support'),
                    (5, '13:00', '14:00', 'AB-12: Washroom and Floor Touch Up', 'washroom', True, ''),
                    (6, '14:00', '16:00', 'AB-12: Big Lab and Ground Floor Lab Cleaning', 'room', True, ''),
                    (7, '16:00', '17:00', 'AB-12: Extra Work and Final Round', 'floor', True, ''),
                ],
                'Academic Block 13': [
                    (1, '08:00', '09:00', 'AB-13 GF: Washroom Floor Cleaning', 'washroom', True, 'Ajay + Gautam + Jignesh + Kunal + Chandrika + Bharat + Parth'),
                    (2, '09:00', '10:00', 'AB-13 GF: Classroom Staircase Cleaning', 'floor', True, ''),
                    (3, '10:00', '11:00', 'AB-13 GF: Washroom Touch Up + Lift + Room 112', 'washroom', True, 'Meeting room coverage'),
                    (4, '11:00', '12:00', 'AB-13 GF: Labs and Extra Work', 'room', True, ''),
                    (5, '12:00', '13:00', 'AB-13 GF: Final Ground Floor Touch Up', 'floor', True, ''),
                    (6, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (7, '14:00', '15:00', 'AB-13 2F/3F: Washroom Cleaning', 'washroom', True, 'Kunal + Chandrika'),
                    (8, '15:00', '16:00', 'AB-13 2F/3F: Floor and Office Cleaning', 'floor', True, ''),
                    (9, '16:00', '17:00', 'AB-13 2F/3F: Lab Area and Touch Up', 'room', True, ''),
                    (10, '08:00', '11:00', 'AB-13 Library: Washroom and Office Floor Cleaning', 'room', True, 'Ajay + Bharat'),
                    (11, '11:00', '13:00', 'AB-13 Library: First Floor Lab Floor Cleaning', 'room', True, ''),
                    (12, '15:00', '16:00', 'AB-13: All Female Washroom Cleaning', 'washroom', True, 'All female washrooms'),
                ],
                'Old Academic Common Area': [
                    (1, '07:00', '13:00', 'Old Academic Common Area: All Blocks Common Area + Marble Cleaning', 'floor', True, 'Bhavesh + Nikhil'),
                    (2, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (3, '15:00', '16:00', 'Old Academic Common Area: Block-07 Terrace Side Railing Dusting', 'floor', True, ''),
                ],
                'New AB U-Shape': [
                    (1, '08:00', '10:00', 'New AB U-Shape: Sweeping and Mopping', 'floor', True, ''),
                    (2, '10:00', '13:00', 'New AB U-Shape: Blocks 10-13 Common Area Cleaning - Round 1', 'floor', True, ''),
                    (3, '13:00', '14:00', 'Lunch Break', 'floor', False, ''),
                    (4, '14:00', '17:00', 'New AB U-Shape: Blocks 10-13 Common Area Cleaning - Round 2', 'floor', True, ''),
                ],
                'New Academic Common Area': [
                    (1, '08:00', '10:00', 'New Academic Common Area: Sweeping and Mopping', 'floor', True, 'Hitesh'),
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
            academic_saturday_special = {}
            academic_block_names = [f'Academic Block {idx}' for idx in range(1, 14)]
            academic_optional_weekend_tasks = [
                (201, '10:00', '11:00', 'Terrace Cleaning', 'all', True, 'Optional weekend task'),
                (202, '11:00', '12:00', 'Dustbin Cleaning', 'all', True, 'Optional weekend task'),
                (203, '12:00', '13:00', 'Dug Area Cleaning', 'all', True, 'Optional weekend task'),
                (204, '14:00', '15:00', 'Shaft Area Cleaning', 'all', True, 'Optional weekend task'),
                (205, '15:00', '16:00', 'Sofa & Chair Cleaning', 'all', True, 'Optional weekend task'),
                (206, '16:00', '17:00', 'Fan & Light Cleaning', 'all', True, 'Optional weekend task'),
                (207, '17:00', '18:00', 'Window Glass Cleaning', 'all', True, 'Optional weekend task'),
            ]
            for area_name in academic_block_names:
                academic_saturday_special[area_name] = [
                    (101, '09:00', '10:00', 'Cobweb Cleaning', 'all', True, 'Every Saturday', False),
                    *[(*task, True) for task in academic_optional_weekend_tasks],
                ]
                academic_sunday_extra[area_name] = [
                    (101, '09:00', '10:00', 'Washroom Deep Cleaning', 'all', True, 'Every Sunday', False),
                    *[(*task, True) for task in academic_optional_weekend_tasks],
                ]

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

            for area_name, tasks in academic_saturday_special.items():
                area_obj = self.area(area_name)
                if not area_obj:
                    continue
                for order, start, end, name, tag, req_photo, desc, is_optional_weekend_task in tasks:
                    HKScheduleTemplate.objects.create(
                        area=area_obj,
                        order=order,
                        start_time=t(start),
                        end_time=t(end),
                        task_name=name,
                        task_description=desc,
                        worker_tag=tag,
                        requires_photo=req_photo,
                        frequency='saturday_special',
                        is_optional_weekend_task=is_optional_weekend_task,
                        is_active=True,
                    )
                    total += 1

            for area_name, tasks in academic_sunday_extra.items():
                area_obj = self.area(area_name)
                if not area_obj:
                    continue
                for order, start, end, name, tag, req_photo, desc, is_optional_weekend_task in tasks:
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
                        is_optional_weekend_task=is_optional_weekend_task,
                        is_active=True,
                    )
                    total += 1

        break_total_delta = self.normalize_supervisor_break_templates()
        total += break_total_delta

        self.stdout.write(
            f'  [OK] Schedule templates: {total} '
            '(hostels + common area + research park + central arcade + sports complex + guest house + director bungalow + roads + swm + academic blocks)'
        )

    def normalize_supervisor_break_templates(self):
        """
        Keep non-hostel, non-SWM supervisor areas consistent:
        tea break is 15 minutes and lunch break is 1 hour. Missing break rows are
        added as simple mark-done tasks, while hostel and SWM schedules stay exact.
        """
        excluded_area_types = {'hostel', 'swm'}
        areas = HKArea.objects.filter(is_active=True).exclude(area_type__in=excluded_area_types)
        added = 0

        for area in areas:
            if 'reliever' in area.name.lower():
                continue

            templates = HKScheduleTemplate.objects.filter(area=area, frequency='daily', is_active=True)

            tea_templates = templates.filter(task_name__icontains='Tea Break')
            for template in tea_templates:
                template.end_time = self._time_after_minutes(template.start_time, 15)
                template.requires_photo = False
                template.save(update_fields=['end_time', 'requires_photo'])

            lunch_templates = templates.filter(task_name__icontains='Lunch Break')
            for template in lunch_templates:
                template.end_time = self._time_after_minutes(template.start_time, 60)
                template.requires_photo = False
                template.save(update_fields=['end_time', 'requires_photo'])

            if not tea_templates.exists():
                HKScheduleTemplate.objects.create(
                    area=area,
                    order=98,
                    start_time=t('10:00'),
                    end_time=t('10:15'),
                    task_name='Tea Break',
                    task_description='All assigned workers',
                    worker_tag='floor',
                    requires_photo=False,
                    frequency='daily',
                    is_active=True,
                )
                added += 1

            if not lunch_templates.exists():
                HKScheduleTemplate.objects.create(
                    area=area,
                    order=99,
                    start_time=t('13:00'),
                    end_time=t('14:00'),
                    task_name='Lunch Break',
                    task_description='All assigned workers',
                    worker_tag='floor',
                    requires_photo=False,
                    frequency='daily',
                    is_active=True,
                )
                added += 1

        return added

    def _time_after_minutes(self, start_time, minutes):
        start_dt = datetime.datetime.combine(datetime.date.today(), start_time)
        return (start_dt + datetime.timedelta(minutes=minutes)).time()

