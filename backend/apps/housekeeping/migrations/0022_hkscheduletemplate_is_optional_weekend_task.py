from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0021_hkextrawork_assigned_workers'),
    ]

    operations = [
        migrations.AddField(
            model_name='hkscheduletemplate',
            name='is_optional_weekend_task',
            field=models.BooleanField(
                default=False,
                help_text='Optional weekend task visible to staff but excluded from progress until selected.',
            ),
        ),
    ]
