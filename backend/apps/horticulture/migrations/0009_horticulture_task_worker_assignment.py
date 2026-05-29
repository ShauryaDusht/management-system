from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('horticulture', '0008_daily_assignment_before_after_photos'),
    ]

    operations = [
        migrations.CreateModel(
            name='HorticultureTaskWorkerAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('assigned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='horticulture_multi_worker_assignments', to=settings.AUTH_USER_MODEL)),
                ('daily_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='worker_assignments', to='horticulture.horticulturedailyassignment')),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='task_assignments', to='horticulture.horticultureworker')),
            ],
            options={
                'ordering': ['assigned_at', 'worker__name'],
                'constraints': [models.UniqueConstraint(fields=('daily_assignment', 'worker'), name='horticulture_task_worker_unique_assignment')],
            },
        ),
    ]
