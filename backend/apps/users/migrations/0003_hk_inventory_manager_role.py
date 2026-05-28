from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def create_hk_inventory_manager(apps, schema_editor):
    User = apps.get_model('users', 'User')
    user, _created = User.objects.get_or_create(
        username='hk_inventory_manager',
        defaults={
            'first_name': 'Housekeeping Inventory',
            'last_name': 'Manager',
            'email': '',
            'role': 'hk_inventory_manager',
            'is_active': True,
        },
    )
    user.role = 'hk_inventory_manager'
    user.is_active = True
    user.password = make_password('IITGN@2025')
    user.save(update_fields=['role', 'is_active', 'password'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_standardize_usernames'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Admin'),
                    ('inventory_manager', 'Inventory Manager'),
                    ('housekeeping_manager', 'Housekeeping Manager'),
                    ('hk_inventory_manager', 'Housekeeping / Inventory Manager'),
                    ('horticulture_manager', 'Horticulture Manager'),
                    ('supervisor', 'Supervisor'),
                    ('caretaker', 'Caretaker'),
                ],
                default='supervisor',
                max_length=25,
            ),
        ),
        migrations.RunPython(create_hk_inventory_manager, migrations.RunPython.noop),
    ]
