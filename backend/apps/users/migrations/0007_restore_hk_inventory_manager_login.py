from django.contrib.auth.hashers import make_password
from django.db import migrations


def restore_hk_inventory_manager_login(apps, schema_editor):
    User = apps.get_model('users', 'User')

    user, _ = User.objects.get_or_create(
        username='hk_inventory_manager',
        defaults={
            'first_name': 'Housekeeping Inventory',
            'last_name': 'Manager',
            'role': 'hk_inventory_manager',
        },
    )
    user.first_name = 'Housekeeping Inventory'
    user.last_name = 'Manager'
    user.email = 'manager.hk@iitgn.ac.in'
    user.phone = '8758120645'
    user.pay_code = '469'
    user.role = 'hk_inventory_manager'
    user.is_active = True
    user.is_staff = True
    user.is_superuser = False
    user.password = make_password('IITGN@2025')
    user.save()

    User.objects.filter(username__in=['housekeeping.manager', 'inventory.manager']).update(
        is_active=False,
        is_staff=False,
        is_superuser=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_restore_admin_user_and_hide_old_managers'),
    ]

    operations = [
        migrations.RunPython(restore_hk_inventory_manager_login, migrations.RunPython.noop),
    ]
