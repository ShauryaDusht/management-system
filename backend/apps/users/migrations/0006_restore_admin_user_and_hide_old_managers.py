from django.contrib.auth.hashers import make_password
from django.db import migrations


def restore_admin_user_and_hide_old_managers(apps, schema_editor):
    User = apps.get_model('users', 'User')

    admin, _ = User.objects.get_or_create(
        username='admin.user',
        defaults={
            'first_name': 'Admin',
            'last_name': 'User',
            'email': 'pragnesh@iitgn.ac.in',
            'phone': '9727757096',
            'role': 'admin',
        },
    )
    admin.first_name = 'Admin'
    admin.last_name = 'User'
    admin.email = 'pragnesh@iitgn.ac.in'
    admin.phone = '9727757096'
    admin.role = 'admin'
    admin.is_active = True
    admin.is_staff = True
    admin.is_superuser = True
    admin.password = make_password('IITGN@2025')
    admin.save()

    User.objects.filter(username__in=['housekeeping.manager', 'inventory.manager']).update(
        is_active=False,
        is_staff=False,
        is_superuser=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_update_hk_inventory_manager_contact'),
    ]

    operations = [
        migrations.RunPython(restore_admin_user_and_hide_old_managers, migrations.RunPython.noop),
    ]
