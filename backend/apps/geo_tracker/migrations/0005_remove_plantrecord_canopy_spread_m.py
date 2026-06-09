from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0004_seed_tree_plant_varieties_and_simplify_submitter'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='plantrecord',
            name='canopy_spread_m',
        ),
    ]
