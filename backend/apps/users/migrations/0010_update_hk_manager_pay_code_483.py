from django.db import migrations


def update_hk_manager_pay_code(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(
        username='hk_inventory_manager',
        pay_code__in=['', '469'],
    ).update(
        phone='9724361542',
        pay_code='483',
    )
    User.objects.filter(
        username__in=['housekeeping.manager', 'inventory.manager'],
        pay_code__in=['', '469'],
    ).update(
        phone='9724361542',
        pay_code='483',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_add_hostel_office_role'),
    ]

    operations = [
        migrations.RunPython(update_hk_manager_pay_code, migrations.RunPython.noop),
    ]
