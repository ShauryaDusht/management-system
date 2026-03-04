from django.db import migrations
import django.db.models.fields
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0001_monthly_report'),
    ]

    operations = [
        migrations.AlterField(
            model_name='monthlyreport',
            name='generated_at',
            field=django.db.models.fields.DateTimeField(
                default=django.utils.timezone.now,
                verbose_name='generated at',
            ),
        ),
    ]
