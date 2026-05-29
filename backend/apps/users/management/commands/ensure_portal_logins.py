from django.core.management.base import BaseCommand

from apps.users.models import User


DEFAULT_PASSWORD = 'IITGN@2025'


class Command(BaseCommand):
    help = 'Ensure required admin portal login accounts are active and usable.'

    def handle(self, *args, **options):
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

        disabled = User.objects.filter(
            username__in=['housekeeping.manager', 'inventory.manager']
        ).update(
            is_active=False,
            is_staff=False,
            is_superuser=False,
        )

        action = 'created' if created else 'repaired'
        self.stdout.write(self.style.SUCCESS(
            f'hk_inventory_manager login {action}; disabled old manager logins: {disabled}'
        ))
