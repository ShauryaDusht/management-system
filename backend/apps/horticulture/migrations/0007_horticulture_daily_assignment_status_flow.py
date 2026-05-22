from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('horticulture', '0006_remove_daily_assignment_unique_worker_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('in_progress', 'In Progress'),
                    ('done', 'Done'),
                ],
                default='done',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='completed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='horticulture_daily_assignments_completed',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
