from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('horticulture', '0009_horticulture_task_worker_assignment'),
    ]

    operations = [
        migrations.CreateModel(
            name='HorticultureLeaveRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('leave_date', models.DateField()),
                ('reason', models.CharField(blank=True, max_length=300)),
                ('status', models.CharField(choices=[('awaiting_incharge', 'Awaiting Incharge'), ('pending_acceptance', 'Pending Acceptance'), ('pending_admin_approval', 'Pending Admin Approval'), ('approved', 'Approved'), ('reassign_required', 'Reassign Required'), ('rejected', 'Rejected')], default='awaiting_incharge', max_length=30)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('staff', models.ForeignKey(limit_choices_to={'role': 'supervisor'}, on_delete=django.db.models.deletion.CASCADE, related_name='horticulture_leave_requests', to=settings.AUTH_USER_MODEL)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='leave_requests', to='horticulture.horticulturezone')),
            ],
            options={
                'ordering': ['-leave_date', '-created_at'],
                'constraints': [models.UniqueConstraint(fields=('staff', 'leave_date', 'zone'), name='horticulture_leave_unique_staff_date_zone')],
            },
        ),
        migrations.CreateModel(
            name='HorticultureInchargeAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('leave_staff_name', models.CharField(max_length=150)),
                ('leave_date', models.DateField()),
                ('assigned_staff_name', models.CharField(max_length=150)),
                ('status', models.CharField(choices=[('pending_acceptance', 'Pending Acceptance'), ('pending_admin_approval', 'Pending Admin Approval'), ('approved', 'Approved'), ('declined', 'Declined'), ('admin_rejected', 'Admin Rejected')], default='pending_acceptance', max_length=30)),
                ('staff_action_at', models.DateTimeField(blank=True, null=True)),
                ('staff_action_note', models.CharField(blank=True, max_length=300)),
                ('admin_action_at', models.DateTimeField(blank=True, null=True)),
                ('admin_action_note', models.CharField(blank=True, max_length=300)),
                ('arrival_notified', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('admin_action_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='horticulture_incharge_admin_actions', to=settings.AUTH_USER_MODEL)),
                ('assigned_staff', models.ForeignKey(limit_choices_to={'role': 'supervisor'}, on_delete=django.db.models.deletion.PROTECT, related_name='horticulture_incharge_assignments', to=settings.AUTH_USER_MODEL)),
                ('leave_request', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='incharge_assignment', to='horticulture.horticultureleaverequest')),
                ('leave_staff', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='horticulture_leave_incharge_requests', to=settings.AUTH_USER_MODEL)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='incharge_assignments', to='horticulture.horticulturezone')),
            ],
            options={
                'ordering': ['leave_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='HorticultureInchargeNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.CharField(max_length=400)),
                ('level', models.CharField(default='info', max_length=20)),
                ('is_seen', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='horticulture.horticultureinchargeassignment')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='horticulture_incharge_notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
