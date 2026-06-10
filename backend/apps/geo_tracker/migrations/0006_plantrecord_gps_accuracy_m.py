from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0005_remove_plantrecord_canopy_spread_m'),
    ]

    operations = [
        migrations.AddField(
            model_name='plantrecord',
            name='gps_accuracy_m',
            field=models.DecimalField(
                max_digits=6,
                decimal_places=2,
                null=True,
                blank=True,
                help_text='GPS accuracy radius in metres at time of capture (lower = better)',
            ),
        ),
    ]
