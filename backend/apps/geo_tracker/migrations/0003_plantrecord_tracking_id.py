from django.db import migrations, models


PREFIXES = {
    'tree': 'T',
    'plant': 'P',
    'creeper': 'C',
}


def backfill_tracking_ids(apps, schema_editor):
    PlantRecord = apps.get_model('geo_tracker', 'PlantRecord')
    counters = {plant_type: 0 for plant_type in PREFIXES}

    for record in PlantRecord.objects.order_by('submitted_at', 'id'):
        plant_type = 'plant' if record.plant_type == 'shrub' else record.plant_type
        prefix = PREFIXES.get(plant_type)
        if not prefix:
            continue

        counters[plant_type] += 1
        PlantRecord.objects.filter(pk=record.pk).update(
            plant_type=plant_type,
            tracking_id=f'{prefix}-{counters[plant_type]:05d}',
        )


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0002_add_creeper_type_and_seed_varieties'),
    ]

    operations = [
        migrations.AddField(
            model_name='plantrecord',
            name='tracking_id',
            field=models.CharField(blank=True, editable=False, max_length=7, null=True, unique=True),
        ),
        migrations.RunPython(backfill_tracking_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='plantrecord',
            name='tracking_id',
            field=models.CharField(editable=False, max_length=7, unique=True),
        ),
    ]
