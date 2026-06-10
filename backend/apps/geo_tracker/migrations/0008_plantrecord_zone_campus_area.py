from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0007_plantrecord_canopy_area_m'),
    ]

    operations = [
        migrations.AlterField(
            model_name='plantrecord',
            name='zone',
            field=models.CharField(
                blank=True,
                choices=[
                    ('housing_zone',   'Housing Zone'),
                    ('hostels',        'Hostels'),
                    ('academic_block', 'Academic Block'),
                    ('ground_sports',  'Ground Area / Sports Complex'),
                    ('research_park',  'Research Park'),
                    ('rang_manch',     'Rang Manch'),
                    ('central_arcade', 'Central Arcade'),
                    ('road_area',      'Road Area'),
                    ('gate_1',         'Gate 1'),
                    ('water_treatment','Water Treatment Plant'),
                ],
                help_text='Campus area / zone',
                max_length=50,
            ),
        ),
    ]