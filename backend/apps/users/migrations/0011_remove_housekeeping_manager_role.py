from django.db import migrations, models


REMOVED_USERNAMES = {'housekeeping.manager', 'hostel.manager'}


def remove_housekeeping_manager_users(apps, schema_editor):
    User = apps.get_model('users', 'User')
    candidates = User.objects.filter(role='housekeeping_manager') | User.objects.filter(username__in=REMOVED_USERNAMES)

    for user in candidates:
        user.username = f'removed.hk.manager.{user.pk}'
        user.role = 'hk_inventory_manager'
        user.is_active = False
        user.is_staff = False
        user.is_superuser = False
        user.save(update_fields=['username', 'role', 'is_active', 'is_staff', 'is_superuser'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_update_hk_manager_pay_code_483'),
    ]

    operations = [
        migrations.RunPython(remove_housekeeping_manager_users, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Admin'),
                    ('inventory_manager', 'Inventory Manager'),
                    ('hk_inventory_manager', 'Housekeeping / Inventory Manager'),
                    ('hostel_office', 'Hostel Office'),
                    ('horticulture_manager', 'Horticulture Manager'),
                    ('supervisor', 'Supervisor'),
                    ('caretaker', 'Caretaker'),
                ],
                default='supervisor',
                max_length=25,
            ),
        ),
    ]
