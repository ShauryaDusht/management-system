from django.core.management.base import BaseCommand
from django.apps import apps

from apps.users.models import User


DEFAULT_PASSWORD = 'IITGN@2025'


class Command(BaseCommand):
    help = 'Ensure required admin portal login accounts are active and usable.'

    def _replace_legacy_admin_references(self, super_admin):
        legacy_admins = list(
            User.objects
            .filter(username__in=['admin.user', 'admin'])
            .exclude(pk=super_admin.pk)
        )
        if not legacy_admins:
            return 0

        legacy_ids = [user.pk for user in legacy_admins]
        for model in apps.get_models():
            for field in model._meta.get_fields():
                if not getattr(field, 'many_to_one', False) and not getattr(field, 'one_to_one', False):
                    continue
                if getattr(field, 'remote_field', None) and field.remote_field.model is User:
                    model.objects.filter(**{f'{field.name}_id__in': legacy_ids}).update(
                        **{f'{field.name}_id': super_admin.pk}
                    )
        return User.objects.filter(pk__in=legacy_ids).delete()[0]

    def handle(self, *args, **options):
        admin_user, admin_created = User.objects.get_or_create(username='super.admin')

        if admin_created:
            admin_user.first_name = 'Super'
            admin_user.last_name = 'Admin'
            admin_user.email = 'pragnesh@iitgn.ac.in'
            admin_user.phone = '9727757096'
            admin_user.set_password(DEFAULT_PASSWORD)
        admin_user.username = 'super.admin'
        admin_user.role = User.Role.ADMIN
        admin_user.is_active = True
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()

        user, created = User.objects.get_or_create(
            username='hk_inventory_manager',
            defaults={
                'first_name': 'Housekeeping Inventory',
                'last_name': 'Manager',
                'email': 'manager.hk@iitgn.ac.in',
                'phone': '9724361542',
                'pay_code': '483',
                'role': User.Role.HK_INVENTORY_MANAGER,
            },
        )

        if created:
            user.first_name = 'Housekeeping Inventory'
            user.last_name = 'Manager'
            user.email = 'manager.hk@iitgn.ac.in'
            user.phone = '9724361542'
            user.pay_code = '483'
            user.set_password(DEFAULT_PASSWORD)
        elif user.phone in {'', '8758120645'} and user.pay_code in {'', '469'}:
            user.phone = '9724361542'
            user.pay_code = '483'
        user.role = User.Role.HK_INVENTORY_MANAGER
        user.is_active = True
        user.is_staff = True
        user.is_superuser = False
        user.save()

        hostel_office, hostel_created = User.objects.get_or_create(
            username='hostel.office',
            defaults={
                'first_name': 'Hostel',
                'last_name': 'Office',
                'email': 'hostel.office@iitgn.ac.in',
                'phone': '',
                'pay_code': '',
                'role': User.Role.HOSTEL_OFFICE,
            },
        )

        if hostel_created:
            hostel_office.first_name = 'Hostel'
            hostel_office.last_name = 'Office'
            hostel_office.email = 'hostel.office@iitgn.ac.in'
            hostel_office.phone = '07923951140'
            hostel_office.pay_code = ''
            hostel_office.set_password(DEFAULT_PASSWORD)
        hostel_office.role = User.Role.HOSTEL_OFFICE
        hostel_office.is_active = True
        hostel_office.is_staff = True
        hostel_office.is_superuser = False
        hostel_office.save()

        civil_email = 'je1.civil@iitgn.ac.in'
        civil_team, civil_created = User.objects.get_or_create(
            username='civil.team',
            defaults={
                'first_name': 'Civil',
                'last_name': 'Engineering Team',
                'email': civil_email,
                'phone': '07923951160',
                'role': User.Role.CIVIL_TEAM,
            },
        )
        civil_team.email = civil_email
        if civil_created:
            civil_team.set_password(DEFAULT_PASSWORD)
        civil_team.role = User.Role.CIVIL_TEAM
        civil_team.is_active = True
        civil_team.is_staff = True
        civil_team.save()

        elec_email = 'je1.electrical@iitgn.ac.in'
        electrical_team, elec_created = User.objects.get_or_create(
            username='electrical.team',
            defaults={
                'first_name': 'Electrical',
                'last_name': 'Engineering Team',
                'email': elec_email,
                'phone': '07923951170',
                'role': User.Role.ELECTRICAL_TEAM,
            },
        )
        electrical_team.email = elec_email
        if elec_created:
            electrical_team.set_password(DEFAULT_PASSWORD)
        electrical_team.role = User.Role.ELECTRICAL_TEAM
        electrical_team.is_active = True
        electrical_team.is_staff = True
        electrical_team.save()

        estate_office, estate_created = User.objects.get_or_create(
            username='estate.office',
            defaults={
                'first_name': 'Estate',
                'last_name': 'Office',
                'email': 'estateoffice@iitgn.ac.in',
                'phone': '07923951150',
                'role': User.Role.ESTATE_OFFICE,
            },
        )
        estate_office.email = 'estateoffice@iitgn.ac.in'
        if estate_created:
            estate_office.set_password(DEFAULT_PASSWORD)
        estate_office.role = User.Role.ESTATE_OFFICE
        estate_office.is_active = True
        estate_office.is_staff = True
        estate_office.save()

        deleted_legacy_admins = self._replace_legacy_admin_references(admin_user)

        disabled = User.objects.filter(
            username__in=['housekeeping.manager', 'hostel.manager', 'inventory.manager']
        ).update(
            is_active=False,
            is_staff=False,
            is_superuser=False,
        )

        action = 'created' if created else 'repaired'
        hostel_action = 'created' if hostel_created else 'repaired'
        self.stdout.write(self.style.SUCCESS(
            f'super.admin login {"created" if admin_created else "repaired"}; '
            f'hk_inventory_manager login {action}; '
            f'hostel.office login {hostel_action}; '
            f'civil.team login {"created" if civil_created else "repaired"}; '
            f'electrical.team login {"created" if elec_created else "repaired"}; '
            f'estate.office login {"created" if estate_created else "repaired"}; '
            f'deleted old admin logins: {deleted_legacy_admins}; '
            f'disabled old manager logins: {disabled}'
        ))
