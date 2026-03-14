from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0014_hkstaffattendancerecord'),
    ]

    operations = [
        migrations.RenameField(
            model_name='hkworker',
            old_name='punching_no',
            new_name='pay_code',
        ),
    ]
