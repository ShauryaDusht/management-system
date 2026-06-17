from django.db import migrations, models


FULL_ZONE_CHOICES = [
    ('housing_zone',      'Housing Zone'),
    ('hostels',           'Hostels'),
    ('academic_block',    'Academic Block'),
    ('ground_sports',     'Ground Area / Sports Complex'),
    ('research_park',     'Research Park'),
    ('rang_manch',        'Rang Manch'),
    ('central_arcade',    'Central Arcade'),
    ('road_area',         'Road Area'),
    ('gate_1',            'Gate 1'),
    ('water_treatment',   'Water Treatment Plant'),
    ('c2_road',           'C2 Road'),
    ('f1_road',           'F1 Road'),
    ('cycle_track_gate5', 'Cycle Track to Gate-5'),
    ('gate2_a1_road',     'Gate-2 to A1 Road'),
    ('c1_road',           'C1 Road'),
    ('k_road',            'K Road'),
    ('miya_baug',         'Miya Baug'),
    ('ab_block_old',      'AB Block - Old'),
    ('ab_block_new',      'AB Block - New'),
    ('solar_car_parking', 'Solar Car Parking'),
    ('g1_road_scenic',    'G1 Road - Scenic Drive'),
    ('director_residence',"Director's Residence & Guest House"),
    ('j2_road',           'J2 Road'),
    ('central_vista',     'Central Vista'),
    ('b1_road',           'B1 Road'),
    ('d1_road',           'D1 Road'),
    ('h1_road',           'H1 Road'),
    ('h2_road',           'H2 Road'),
    ('u_shape',           'U Shape'),
    ('bio_gas',           'Bio Gas'),
    ('a2_road',           'A2 Road'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0009_remove_plantrecord_location_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='plantrecord',
            name='tracking_id',
            field=models.CharField(
                editable=False,
                max_length=9,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name='plantrecord',
            name='zone',
            field=models.CharField(
                blank=True,
                choices=FULL_ZONE_CHOICES,
                help_text='Campus area / zone',
                max_length=50,
            ),
        ),
    ]
