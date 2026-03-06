from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_inventorytask'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='inventorytask',
            name='assigned_to',
            field=models.ForeignKey(
                limit_choices_to={'role__in': ['inventory_manager', 'supervisor']},
                on_delete=django.db.models.deletion.PROTECT,
                related_name='inventory_tasks_assigned',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
