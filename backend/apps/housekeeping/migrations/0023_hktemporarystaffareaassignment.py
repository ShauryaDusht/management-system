from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0022_hkscheduletemplate_is_optional_weekend_task'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='HKTemporaryStaffAreaAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_date', models.DateField(default=django.utils.timezone.localdate)),
                ('end_date', models.DateField()),
                ('note', models.CharField(blank=True, max_length=300)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='temporary_staff_assignments', to='housekeeping.hkarea')),
                ('assigned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hk_temporary_area_assignments_created', to=settings.AUTH_USER_MODEL)),
                ('revoked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hk_temporary_area_assignments_revoked', to=settings.AUTH_USER_MODEL)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hk_temporary_area_assignments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-start_date', 'staff__first_name', 'area__name'],
            },
        ),
    ]
