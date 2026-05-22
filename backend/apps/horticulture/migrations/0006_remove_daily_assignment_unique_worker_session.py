from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0005_horticultureattendancerecord_is_submitted'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='horticulturedailyassignment',
            name='horticulture_daily_assignment_unique_worker_session',
        ),
    ]
