from django.db import migrations, models


SHRUB_VARIETIES = [
    ('Hibiscus (Gudhal / Jaswand)', 'Hibiscus rosa-sinensis'),
    ('Nerium (Kaner)', 'Nerium oleander'),
    ('Ixora (Rukmini)', 'Ixora coccinea'),
    ('Tecoma (Yellow Bells)', 'Tecoma stans'),
    ('Chandni (Crape Jasmine)', 'Tabernaemontana divaricata'),
    ('Bougainvillea (Bush/Shrub)', 'Bougainvillea glabra'),
    ('Croton', 'Codiaeum variegatum'),
    ('Duranta (Golden Dewdrops)', 'Duranta erecta'),
    ('Night Blooming Jasmine (Raat Ki Rani)', 'Cestrum nocturnum'),
    ('Hamelia (Firebush)', 'Hamelia patens'),
    ('Plumbago (Chitrak)', 'Plumbago auriculata'),
    ('Lantana (Ghaneri)', 'Lantana camara'),
]


def seed_shrub_varieties(apps, schema_editor):
    PlantVariety = apps.get_model('geo_tracker', 'PlantVariety')
    for name, scientific_name in SHRUB_VARIETIES:
        PlantVariety.objects.update_or_create(
            name=name,
            plant_type='shrub',
            defaults={'scientific_name': scientific_name},
        )


def remove_seeded_shrub_varieties(apps, schema_editor):
    PlantVariety = apps.get_model('geo_tracker', 'PlantVariety')
    PlantVariety.objects.filter(
        plant_type='shrub',
        name__in=[name for name, _ in SHRUB_VARIETIES],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0011_campusareaconfig'),
    ]

    operations = [
        migrations.AlterField(
            model_name='plantrecord',
            name='plant_type',
            field=models.CharField(
                choices=[
                    ('tree', 'Tree'),
                    ('plant', 'Plant'),
                    ('creeper', 'Creeper / Climber'),
                    ('shrub', 'Shrub'),
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
                    ('shrub', 'Shrub'),
                ],
                max_length=10,
            ),
        ),
        migrations.RunPython(seed_shrub_varieties, remove_seeded_shrub_varieties),
    ]
