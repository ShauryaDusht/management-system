from django.db import migrations, models


CREEPER_VARIETIES = [
    ('Bougainvillea', 'Bougainvillea spectabilis'),
    ('Money Plant', 'Epipremnum aureum'),
    ('Parda Bel (Curtain Creeper)', 'Tarlmounia elliptica (formerly Vernonia elliptica)'),
    ('Monstera', 'Monstera deliciosa'),
    ('Madhumalati (Rangoon Creeper)', 'Combretum indicum (formerly Quisqualis indica)'),
    ('Allamanda', 'Allamanda cathartica'),
    ('Jui (Juhi)', 'Jasminum auriculatum'),
]


def seed_creeper_varieties(apps, schema_editor):
    PlantVariety = apps.get_model('geo_tracker', 'PlantVariety')
    for name, scientific_name in CREEPER_VARIETIES:
        PlantVariety.objects.update_or_create(
            name=name,
            plant_type='creeper',
            defaults={'scientific_name': scientific_name},
        )


def convert_shrubs_to_plants(apps, schema_editor):
    PlantRecord = apps.get_model('geo_tracker', 'PlantRecord')
    PlantVariety = apps.get_model('geo_tracker', 'PlantVariety')
    PlantRecord.objects.filter(plant_type='shrub').update(plant_type='plant')
    PlantVariety.objects.filter(plant_type='shrub').update(plant_type='plant')


def remove_seeded_creeper_varieties(apps, schema_editor):
    PlantVariety = apps.get_model('geo_tracker', 'PlantVariety')
    PlantVariety.objects.filter(
        plant_type='creeper',
        name__in=[name for name, _ in CREEPER_VARIETIES],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(convert_shrubs_to_plants, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='plantrecord',
            name='plant_type',
            field=models.CharField(
                choices=[
                    ('tree', 'Tree'),
                    ('plant', 'Plant'),
                    ('creeper', 'Creeper / Climber'),
                ],
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='plantvariety',
            name='plant_type',
            field=models.CharField(
                choices=[
                    ('tree', 'Tree'),
                    ('plant', 'Plant'),
                    ('creeper', 'Creeper / Climber'),
                ],
                max_length=10,
            ),
        ),
        migrations.RunPython(seed_creeper_varieties, remove_seeded_creeper_varieties),
    ]
