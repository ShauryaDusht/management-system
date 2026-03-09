from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0007_alter_itemrequest_approved_by'),
    ]

    operations = [
        # Add manager_approved_by FK
        migrations.AddField(
            model_name='itemrequest',
            name='manager_approved_by',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'role__in': ['inventory_manager', 'admin']},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='requests_manager_approved',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # Add manager_approved_at timestamp
        migrations.AddField(
            model_name='itemrequest',
            name='manager_approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Extend status choices to include manager_approved
        migrations.AlterField(
            model_name='itemrequest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('manager_approved', 'Manager Approved'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                    ('issued', 'Issued'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
    ]
