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

        admin_user.username = 'super.admin'
        admin_user.first_name = 'Super'
        admin_user.last_name = 'Admin'
        admin_user.email = 'pragnesh@iitgn.ac.in'
        admin_user.phone = '9727757096'
        admin_user.role = User.Role.ADMIN
        admin_user.is_active = True
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.set_password(DEFAULT_PASSWORD)
        admin_user.save()

        user, created = User.objects.get_or_create(
            username='hk_inventory_manager',
            defaults={
                'first_name': 'Housekeeping Inventory',
                'last_name': 'Manager',
                'email': 'manager.hk@iitgn.ac.in',
                'phone': '8758120645',
                'pay_code': '469',
                'role': User.Role.HK_INVENTORY_MANAGER,
            },
        )

        user.first_name = 'Housekeeping Inventory'
        user.last_name = 'Manager'
        user.email = 'manager.hk@iitgn.ac.in'
        user.phone = '8758120645'
        user.pay_code = '469'
        user.role = User.Role.HK_INVENTORY_MANAGER
        user.is_active = True
        user.is_staff = True
        user.is_superuser = False
        user.set_password(DEFAULT_PASSWORD)
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

        hostel_office.first_name = 'Hostel'
        hostel_office.last_name = 'Office'
        hostel_office.email = 'hostel.office@iitgn.ac.in'
        hostel_office.phone = ''
        hostel_office.pay_code = ''
        hostel_office.role = User.Role.HOSTEL_OFFICE
        hostel_office.is_active = True
        hostel_office.is_staff = True
        hostel_office.is_superuser = False
        hostel_office.set_password(DEFAULT_PASSWORD)
        hostel_office.save()

        deleted_legacy_admins = self._replace_legacy_admin_references(admin_user)

        disabled = User.objects.filter(
            username__in=['housekeeping.manager', 'inventory.manager']
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
            f'deleted old admin logins: {deleted_legacy_admins}; '
            f'disabled old manager logins: {disabled}'
        ))
