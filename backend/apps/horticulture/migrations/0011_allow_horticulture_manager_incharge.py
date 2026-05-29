from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0010_horticulture_leave_incharge'),
    ]

    operations = [
        migrations.AlterField(
            model_name='horticultureinchargeassignment',
            name='assigned_staff',
            field=models.ForeignKey(limit_choices_to={'role__in': ['supervisor', 'horticulture_manager']}, on_delete=django.db.models.deletion.PROTECT, related_name='horticulture_incharge_assignments', to=settings.AUTH_USER_MODEL),
        ),
    ]
